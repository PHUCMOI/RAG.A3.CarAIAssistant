using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;
public sealed class OrderAssistant(OrdersDb db,ICommonCatalogue common, BedrockAssistant? bedrock = null, BedrockOptions? options = null, NaturalAnswers? naturalAnswers = null) : IOrderAssistant
{
    static List<ChatTurn> Turns(ChatSessionRecord row)=>JsonSerializer.Deserialize<List<ChatTurn>>(row.Payload,OrderStore.Json)!;
    internal static ChatSession View(ChatSessionRecord row) {
        var draft=JsonSerializer.Deserialize<ConversationContext>(row.Context,OrderStore.Json)?.Drafts.LastOrDefault();
        if(draft is {Status:"draft"} && draft.ExpiresAt<=DateTimeOffset.UtcNow) draft=draft with {Status="expired"};
        return new(row.Id,row.Version,row.SelectedOrderId,Turns(row).SelectMany(t=>t.Messages).ToList(),draft,JsonSerializer.Deserialize<ConversationContext>(row.Context,OrderStore.Json)?.LookupFailures>=2,JsonSerializer.Deserialize<ConversationContext>(row.Context,OrderStore.Json)?.Title);
    }
    public async Task<object> List(Guid userId,CancellationToken ct) {
        var rows=await db.ChatSessions.AsNoTracking().Where(s=>s.UserId==userId).OrderByDescending(s=>s.UpdatedAt).Take(50).Select(s=>new{s.Id,s.UpdatedAt,s.Context}).ToListAsync(ct);
        return rows.Select(s=>new{s.Id,s.UpdatedAt,Title=JsonSerializer.Deserialize<ConversationContext>(s.Context,OrderStore.Json)?.Title}).ToList();
    }
    public async Task<ChatSession> Create(Guid userId,Guid sessionId,CancellationToken ct) {
        if(sessionId==Guid.Empty)throw new BusinessRuleException("Cần id hội thoại hợp lệ.");
        var existing=await db.ChatSessions.AsNoTracking().SingleOrDefaultAsync(s=>s.Id==sessionId,ct);
        if(existing!=null){if(existing.UserId!=userId)throw new KeyNotFoundException();return View(existing);}
        var row=new ChatSessionRecord{Id=sessionId,UserId=userId};db.ChatSessions.Add(row);await db.SaveChangesAsync(ct);return View(row);
    }
    async Task<ChatSessionRecord> Owned(Guid id,Guid userId,CancellationToken ct)=>await db.ChatSessions.AsNoTracking().SingleOrDefaultAsync(s=>s.Id==id&&s.UserId==userId,ct)??throw new KeyNotFoundException();
    public async Task<ChatSession> Get(Guid sessionId,Guid userId,CancellationToken ct)=>View(await Owned(sessionId,userId,ct));
    public async Task<ChatSession> Send(Guid sessionId,Guid userId,ChatInput input,CancellationToken ct) {
        if(input.RequestId==Guid.Empty||string.IsNullOrWhiteSpace(input.Content)||input.Content.Length>1000) throw new BusinessRuleException("Tin nhắn cần 1–1000 ký tự và requestId hợp lệ.");
        var row=await Owned(sessionId,userId,ct);
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(input,OrderStore.Json))));
        var turns=Turns(row);
        if(turns.FirstOrDefault(t=>t.RequestId==input.RequestId) is {} existing) {if(existing.Hash!=hash)throw new VersionConflictException();return View(row);}
        if(row.Version!=input.Version)throw new VersionConflictException();
        if(turns.Count>=100)throw new BusinessRuleException("Hội thoại đạt 100 lượt; hãy tạo hội thoại mới.");
        var contextEnabled = true; // Local order references are always conversational.
        var context = row.Context == "{}" ? ConversationContext.Recover(row.SelectedOrderId, turns)
            : JsonSerializer.Deserialize<ConversationContext>(row.Context, OrderStore.Json) ?? new();
        // Validate stored references before any provider sees context.
        {
            var ownedIds = await db.Orders.AsNoTracking().Where(o => o.CustomerId == userId &&
                (o.Id == context.CurrentOrderId || o.Id == context.PreviousOrderId)).Select(o => o.Id).ToListAsync(ct);
            context = context with { CurrentOrderId = ownedIds.Contains(context.CurrentOrderId ?? Guid.Empty) ? context.CurrentOrderId : null,
                PreviousOrderId = ownedIds.Contains(context.PreviousOrderId ?? Guid.Empty) ? context.PreviousOrderId : null };
        }
        var intent=AssistantIntent.Resolve(input.Content);
        var supportRequested=SupportRules.Requested(input.Content);
        if(supportRequested) intent="readonly";
        var draftAcknowledgement=context.Drafts.LastOrDefault() is {Status:"draft"} &&
            System.Text.RegularExpressions.Regex.IsMatch(AssistantIntent.Normalize(input.Content).Trim(),@"^(dong y|ok|xac nhan|gui di|yes)[.!]?$ ".TrimEnd());
        if(draftAcknowledgement) intent="readonly";
        if(options?.ContextEnabled == true && bedrock != null) context=await bedrock.Summarize(context,turns,row.Version,ct);
        // Modification requests remain read-only even if the model misclassifies them.
        var decision = ConversationReferences.Fallback(input.Content, context);
        if(bedrock != null && intent != "readonly" && BedrockAssistant.Route(intent) == null) decision=await bedrock.ResolveContext(input.Content,
            contextEnabled ? context : context with { PreviousOrderId=null, Summary="" },contextEnabled ? turns : [],ct,row.Version);
        var localReference=ConversationReferences.Fallback(input.Content,context);
        var explicitTopics=AssistantIntent.BusinessTopics(input.Content);
        // Explicit supported topics override inferred history topics.
        if(intent == "readonly" || BedrockAssistant.Route(intent) != null) decision=localReference;
        else if(explicitTopics.Count > 0)
        {
            decision=decision with {Intent=explicitTopics[0],Intents=explicitTopics,OrderReference=localReference.OrderReference,
                NeedsClarification=localReference.NeedsClarification,ClarificationKind=localReference.ClarificationKind};
        }
        else if(localReference.Topics.All(ConversationContext.IsBusinessIntent) &&
            (context.PendingIntent != null || AssistantIntent.Normalize(input.Content) is var normalized &&
                (normalized.Contains("thi sao") || normalized.Contains("con don") || normalized.Contains("don truoc"))))
        {
            // The latest successful turn, not the entire history, defines inherited topics.
            decision=decision with {Intent=localReference.Intent,Intents=localReference.Topics};
        }
        if(contextEnabled && (localReference.OrderReference is "explicit" or "previous"))
            decision=decision with {OrderReference=localReference.OrderReference};
        else if(contextEnabled && ConversationContext.IsBusinessIntent(decision.Intent) &&
            decision.OrderReference is "none" or "explicit")
            decision=decision with {OrderReference="current"};
        // Model suggestions cannot override unresolved ownership/order ambiguity.
        if(contextEnabled && ConversationReferences.Fallback(input.Content,context).NeedsClarification)
            decision=decision with {NeedsClarification=true,ClarificationKind="order"};
        if(context.PendingIntent != null &&
            string.Equals(input.Content.Trim(),AssistantIntent.OrderCode(input.Content),StringComparison.OrdinalIgnoreCase))
            decision=decision with {Intent=context.PendingIntents?.FirstOrDefault() ?? context.PendingIntent,
                Intents=context.PendingIntents ?? [context.PendingIntent],OrderReference="explicit",NeedsClarification=false,ClarificationKind=null};
        if(intent != "readonly") intent=decision.Intent;
        var navigation=BedrockAssistant.Route(intent);
        var code=AssistantIntent.OrderCode(input.Content);
        Guid? selected=row.SelectedOrderId;Order? order=null;string answer;string? tool=null;var retrieved=DateTimeOffset.UtcNow;
        List<ChatSection>? sections=null;
        if(contextEnabled) selected=decision.OrderReference switch {"previous"=>context.PreviousOrderId,"current"=>context.CurrentOrderId,_=>null};
        // Every order lookup is scoped to the authenticated user; no SQL/URL from chat.
        if(code!=null) {
            var match=await db.Orders.AsNoTracking().SingleOrDefaultAsync(o=>o.CustomerId==userId&&o.Code==code,ct);
            selected=match?.Id;order=match==null?null:OrderStore.Read(match);
        } else if(input.OrderId is {} explicitId && !(contextEnabled && decision.OrderReference=="previous" && explicitId==row.SelectedOrderId)) {
            var match=await db.Orders.AsNoTracking().SingleOrDefaultAsync(o=>o.Id==explicitId&&o.CustomerId==userId,ct);
            selected=match?.Id;order=match==null?null:OrderStore.Read(match);
        } else if(selected is {} id) {
            var match=await db.Orders.AsNoTracking().SingleOrDefaultAsync(o=>o.Id==id&&o.CustomerId==userId,ct);
            order=match==null?null:OrderStore.Read(match);if(order==null)selected=null;
        }
        string? orderPrompt=null;
        // Ask for an order when the conversation has no resolved reference.
        if(order==null && code==null && input.OrderId==null &&
            localReference.OrderReference!="previous" && context.PendingClarification==null &&
            (ConversationContext.IsBusinessIntent(intent) || DraftParser.Kind(input.Content)!=null))
        {
            var candidates=await db.Orders.AsNoTracking().Where(o=>o.CustomerId==userId)
                .OrderByDescending(o=>o.CreatedAt).Take(21).ToListAsync(ct);
            orderPrompt=candidates.Count==0 ? "Bạn chưa có đơn mua xe trong tài khoản."
                : "Bạn muốn hỏi đơn nào? Hãy trả lời bằng mã đơn trong hội thoại:\n"+
                  string.Join("\n",candidates.Take(20).Select(o=>{var item=OrderStore.Read(o);return item.Code+" · "+item.CarName+" · "+Status(item.Status);}))+
                  (candidates.Count>20?"\nĐang hiển thị 20 đơn gần nhất.":"");
        }
        if(supportRequested && AssistantIntent.OrderCodes(input.Content).Count<=1 &&
            (code==null&&input.OrderId==null || order!=null&&(input.OrderId==null||order.Id==input.OrderId))) {
            if(context.Drafts.Count>=20) throw new BusinessRuleException("Tối đa 20 bản nháp mỗi hội thoại; hãy mở hội thoại mới.");
            var snapshot=turns.TakeLast(3).SelectMany(t=>t.Messages.Where(m=>m.Role=="assistant"&&m.Sections!=null))
                .Select(m=>new SupportExchange(m.At,m.Sections!.Where(s=>ConversationContext.IsBusinessIntent(s.Topic)).Select(s=>s.Topic).ToList(),
                    m.Sections!.Where(s=>ConversationContext.IsBusinessIntent(s.Topic)).Select(s=>s.ResultStatus is "success" or "missing" or "error"?s.ResultStatus:"unknown").ToList())).Where(x=>x.Topics.Count>0).ToList();
            var issue=System.Text.RegularExpressions.Regex.IsMatch(AssistantIntent.Normalize(input.Content),@"chuyen tien|chua cap nhat|khong|loi|van de|cham|thieu")?SupportRules.Clean(input.Content.Trim()):"";
            if(issue.Length>800) issue=issue[..800];
            var draft=new AssistantDraft {Type="support",OrderId=order?.Id??Guid.Empty,OrderCode=order?.Code??"",Subject="Hỗ trợ khách hàng",Reason=issue,Snapshot=snapshot,ExpiresAt=DateTimeOffset.UtcNow.AddMinutes(30),Audit=[new("prepare",DateTimeOffset.UtcNow,input.RequestId,1)]};
            context=context with {Drafts=[..context.Drafts.Select(x=>x.Status=="draft"?x with {Status="discarded"}:x),draft],PendingClarification=null,PendingIntent=null,PendingIntents=null};
            answer="Đã chuẩn bị bản nháp phiếu hỗ trợ. Hãy mô tả vấn đề, kiểm tra liên kết và tóm tắt rồi lưu/xác nhận. Chưa gửi phiếu; chưa có thời gian xử lý cam kết.";tool="PrepareSupportDraft";
        }
        else if(AssistantIntent.OrderCodes(input.Content).Count>1)
        {answer="Bạn nêu nhiều mã đơn. Hãy chọn một đơn hoặc hỏi từng mã để tránh nhầm thông tin.";selected=row.SelectedOrderId;order=null;context=context with {PendingClarification="order"};}
        else if(orderPrompt!=null)
        {answer=orderPrompt;context=context with {PendingClarification="order"};}
        else if(decision.NeedsClarification && code == null &&
            (input.OrderId == null || decision.OrderReference == "previous" && input.OrderId == row.SelectedOrderId))
        {answer=decision.ClarificationKind=="topic"?"Bạn muốn hỏi trạng thái, thanh toán hay lịch bàn giao?":"Bạn muốn hỏi đơn nào và nội dung gì? Hãy nêu mã đơn và điều bạn cần tra cứu.";order=null;context=context with {PendingClarification=decision.ClarificationKind};}
        else if(code != null && input.OrderId != null && order?.Id != input.OrderId)
        { answer="Mã đơn và đơn đang chọn không khớp. Bạn muốn hỏi đơn nào?";order=null;selected=context.CurrentOrderId;context=context with {PendingClarification="order"}; }
        else if(code!=null&&order==null || input.OrderId!=null&&code==null&&order==null) answer="Không tìm thấy đơn trong tài khoản của bạn. Hãy kiểm tra mã đơn hoặc chọn đơn của mình.";
        else if(navigation!=null) {answer="Bạn có thể mở trang tài khoản qua liên kết bên dưới.";tool="NavigateAccount";order=null;}
        else if(draftAcknowledgement) answer="Hãy kiểm tra bản nháp bên dưới, bổ sung thông tin còn thiếu và bấm Xác nhận gửi yêu cầu. Tin nhắn này chưa gửi đề nghị.";
        else if(DraftParser.Kind(input.Content) is {} kind) {
            if(order==null) answer="Hãy chọn một đơn của bạn trước khi tạo bản nháp yêu cầu.";
            else {
                CustomerRules.ActiveOrder(order);
                if(await db.Changes.AnyAsync(x=>x.OrderId==order.Id&&x.Status=="pending",ct)) throw new BusinessRuleException("Đơn đã có đề nghị đang chờ xử lý.");
                if(context.Drafts.Count>=20) throw new BusinessRuleException("Tối đa 20 bản nháp mỗi hội thoại; hãy mở hội thoại mới.");
                var draft=new AssistantDraft {OrderId=order.Id,OrderCode=order.Code,Type=kind,OrderVersion=order.Version,OrderStatus=order.Status,CurrentDate=order.PlannedDate,
                    Reason=DraftParser.Reason(input.Content),Date=DraftParser.Date(input.Content),Time=DraftParser.Time(input.Content),ExpiresAt=DateTimeOffset.UtcNow.AddMinutes(30),
                    Audit=[new("prepare",DateTimeOffset.UtcNow,input.RequestId,1)]};
                if(draft.Reason.Length>800) throw new BusinessRuleException("Lý do tối đa 800 ký tự.");
                context=context.Remember(order.Id,"status",DateTimeOffset.UtcNow) with {Drafts=[..context.Drafts.Select(x=>x.Status=="draft"?x with {Status="discarded"}:x),draft]};
                answer="Đã chuẩn bị bản nháp " +(kind=="cancel"?"hủy đơn":"đổi lịch")+". Điền lý do"+(kind=="reschedule"?" và ngày cụ thể (dd/MM/yyyy hoặc yyyy-MM-dd)":"")+" rồi lưu, kiểm tra và bấm Xác nhận gửi yêu cầu. Tin nhắn đồng ý không gửi yêu cầu; đại lý sẽ xử lý sau.";
                tool="PrepareChangeDraft";
            }
        }
        else if(intent=="readonly") answer="Bạn cần liên hệ đại lý để thay đổi thanh toán, giá hoặc trạng thái đơn. Tôi có thể chuẩn bị yêu cầu đổi lịch hoặc hủy đơn để bạn xác nhận.";
        else if(intent=="help") answer="Bạn có thể hỏi: những đơn nào của tôi, trạng thái đơn, còn phải trả bao nhiêu, khi nào nhận xe, thông tin xe hoặc bảo hành. Nếu có nhiều đơn, hãy nêu mã đơn trong tin nhắn.";
        else if(intent=="list") {
            var list=await db.Orders.AsNoTracking().Where(o=>o.CustomerId==userId).OrderByDescending(o=>o.CreatedAt).Take(20).ToListAsync(ct);
            tool="ListMyOrders";answer=list.Count==0?"Bạn chưa có đơn mua xe.":"Tối đa 20 đơn gần nhất của bạn:\n"+string.Join("\n",list.Select(o=>{var item=OrderStore.Read(o);return item.Code+" · "+item.CarName+" · "+Status(item.Status);}))+"\nChọn đơn hoặc nhập mã đơn để xem chi tiết.";
        } else if(order==null) answer="Bạn muốn tra cứu đơn nào? Hãy chọn đơn hoặc nhập mã AW-...; tôi chưa chọn thay bạn.";
        else {
            sections=[];
            foreach(var topic in decision.Topics.Where(ConversationContext.IsBusinessIntent).Distinct())
                sections.Add(await RetrieveSection(order,topic,ct,input.Content));
            tool=sections.Count == 1 ? sections[0].ResultStatus == "error" ? "CommonUnavailable" : Tool(sections[0].Topic) : "GetMyOrderTopics";
            answer=string.Join("\n\n",sections.Select(s => sections.Count == 1 ? s.Content : $"{TopicName(s.Topic)}:\n{s.Content}"));
        }
        {
            if(sections is {Count:>0}) context=context with {LookupFailures=sections.Any(s=>s.ResultStatus is "error" or "missing")?context.LookupFailures+1:0};
            var successful=sections?.Where(s=>s.ResultStatus=="success").Select(s=>s.Topic).ToList();
            if(order != null && successful is {Count:>0})
                context=context.Remember(order.Id,successful,DateTimeOffset.UtcNow);
            else if(order == null && ConversationContext.IsBusinessIntent(intent) && context.PendingClarification == null)
                context=context with {PendingClarification="order",UpdatedAt=DateTimeOffset.UtcNow};
            if(contextEnabled) selected=context.CurrentOrderId;
            if(context.PendingClarification != null && ConversationContext.IsBusinessIntent(intent))
                context=context with {PendingIntent=decision.Topics[0],PendingIntents=decision.Topics.Where(ConversationContext.IsBusinessIntent).Distinct().ToList()};
        }
        if(naturalAnswers != null)
            answer=await naturalAnswers.Compose(input.Content,new { RetrievedAnswer=answer, Sections=sections,
                OrderCode=order?.Code, OrderStatusLabel=order == null ? null : Status(order.Status), PendingClarification=context.PendingClarification,
                Tool=tool, DraftPrepared=tool is "PrepareChangeDraft" or "PrepareSupportDraft",
                ActionExecuted=false },ct);
        var messages=new List<ChatMessage>{new("user",(input.OriginalContent ?? input.Content).Trim(),DateTimeOffset.UtcNow),new("assistant",answer,DateTimeOffset.UtcNow,tool,order?.Code,tool=="NavigateAccount"?navigation:order==null?null:"/account/orders/"+order.Id,retrieved,sections,GenerationMode:naturalAnswers != null ? "bedrock-natural" : null)};
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({sessionId.ToString()},0))",ct);
        var current=await db.ChatSessions.SingleOrDefaultAsync(s=>s.Id==sessionId&&s.UserId==userId,ct)??throw new KeyNotFoundException();
        var currentTurns=Turns(current);
        if(currentTurns.FirstOrDefault(t=>t.RequestId==input.RequestId) is {} replay) {if(replay.Hash!=hash)throw new VersionConflictException();return View(current);}
        if(current.Version!=input.Version)throw new VersionConflictException();
        currentTurns.Add(new(input.RequestId,hash,messages));current.Payload=JsonSerializer.Serialize(currentTurns,OrderStore.Json);current.SelectedOrderId=selected;current.Version++;current.UpdatedAt=DateTimeOffset.UtcNow;
        current.Context=JsonSerializer.Serialize(context,OrderStore.Json);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return View(current);
    }
    async Task<ChatSection> RetrieveSection(Order order,string topic,CancellationToken ct,string question)
    {
        if(topic=="payment") {
            var filter=OrderEvidence.Filter(question);
            var payment=OrderEvidence.Payments(order,reference:filter.Reference,date:filter.Date);
            return new(topic,order.Code+": "+OrderEvidence.Describe(payment),"success",payment.RetrievedAt,"/account/orders/"+order.Id,Payment:payment);
        }
        if(topic=="documents") {
            var documents=await new OrderEvidenceStore(db,new JourneyTransactions(db)).Documents(order.Id,order.CustomerId,1,10,ct);
            return new(topic,order.Code+": "+OrderEvidenceStore.Describe(documents),"success",documents.RetrievedAt,"/account/orders/"+order.Id,Documents:documents);
        }
        if(topic=="status")
        {
            var progress=OrderProgress.Build(order);
            return new(topic,$"{order.Code}: "+OrderProgress.Describe(progress),"success",DateTimeOffset.UtcNow,"/account/orders/"+order.Id,progress);
        }
        var result="success";
        string answer;
        try
        {
            answer=topic switch {
                "payment"=>$"{order.Code}: giá chốt {Money(order.TotalVnd)}, cọc yêu cầu {Money(order.DepositRequiredVnd)} (nằm trong giá chốt), đã thu ròng {Money(order.NetReceived)}. "+(order.Status=="cancelled"?"Đơn đã hủy; số tiền còn giữ "+Money(order.NetReceived)+".":"Còn phải trả "+Money(order.RemainingVnd)+". Chỉ giao dịch đã xác nhận được tính."),
                "delivery"=>$"{order.Code}: "+OrderProgress.ScheduleDescription(OrderProgress.Build(order).Schedule),
                _=>$"{order.Code}: {Status(order.Status)}. Xe đặt: {order.CarName}; đại lý: {order.DealerName}."
            };
            if(topic=="car")
            {
                var car=await common.GetCar(order.CarId,ct);
                answer=$"Catalogue hiện tại: {car.DisplayName}, hãng {car.Brand}. Snapshot trên đơn: {order.CarName}. Giá giao dịch đã chốt {Money(order.TotalVnd)}; nguồn giá catalogue: {car.PriceSourceId??"chưa có"}.";
            }
            else if(topic=="warranty")
            {
                var w=await common.GetWarranty(order.CarId,order.Brand,ct);
                if(w==null) {result="missing";answer="Catalogue hiện chưa có dữ liệu bảo hành cho xe này.";}
                else answer=$"Bảo hành theo catalogue hiện tại: {w.DurationMonths?.ToString()??"chưa có dữ liệu"} tháng; giới hạn {w.DistanceLimitKm?.ToString("N0",CultureInfo.GetCultureInfo("vi-VN"))??"chưa có dữ liệu"} km. Điều kiện: {w.Conditions??"chưa có dữ liệu"}. Nguồn: {w.SourceId??"chưa có"}. Xác nhận lại với đại lý.";
            }
        }
        catch(OperationCanceledException) when(ct.IsCancellationRequested) {throw;}
        catch(Exception ex) when(ex is HttpRequestException or OperationCanceledException or BusinessRuleException or JsonException)
        {result="error";answer="Chưa tra được dữ liệu catalogue Python. Hãy thử lại sau; thông tin này chưa được xác minh.";}
        return new(topic,answer,result,DateTimeOffset.UtcNow,"/account/orders/"+order.Id);
    }
    static string Tool(string topic)=>topic switch {"payment"=>"GetMyOrderPaymentSummary","documents"=>"GetMyOrderDocuments","delivery"=>"GetMyDeliverySchedule","car"=>"GetCarDetail","warranty"=>"GetWarranty",_=>"GetMyOrderProgress"};
    static string TopicName(string topic)=>topic switch {"payment"=>"Thanh toán","documents"=>"Hồ sơ","delivery"=>"Bàn giao","car"=>"Thông tin xe","warranty"=>"Bảo hành",_=>"Trạng thái"};
    static string Money(long value)=>value.ToString("N0",CultureInfo.GetCultureInfo("vi-VN"))+" VND";
    static string Status(string value)=>value switch{"pending_confirmation"=>"Chờ xác nhận","confirmed"=>"Đã xác nhận","preparing_vehicle"=>"Đang chuẩn bị xe","ready_for_handover"=>"Chờ bàn giao","completed"=>"Hoàn thành","cancelled"=>"Đã hủy",_=>"Chưa rõ"};
}
