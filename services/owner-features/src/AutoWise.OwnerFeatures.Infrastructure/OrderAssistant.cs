using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;
public sealed class OrderAssistant(OrdersDb db,ICommonCatalogue common) : IOrderAssistant
{
    static List<ChatTurn> Turns(ChatSessionRecord row)=>JsonSerializer.Deserialize<List<ChatTurn>>(row.Payload,OrderStore.Json)!;
    static ChatSession View(ChatSessionRecord row)=>new(row.Id,row.Version,row.SelectedOrderId,Turns(row).SelectMany(t=>t.Messages).ToList());
    public async Task<object> List(Guid userId,CancellationToken ct)=>await db.ChatSessions.AsNoTracking().Where(s=>s.UserId==userId).OrderByDescending(s=>s.UpdatedAt).Take(50).Select(s=>new{s.Id,s.UpdatedAt}).ToListAsync(ct);
    public async Task<ChatSession> Create(Guid userId,Guid sessionId,CancellationToken ct) {
        if(sessionId==Guid.Empty)throw new BusinessRuleException("Cần id hội thoại hợp lệ.");
        var existing=await db.ChatSessions.AsNoTracking().SingleOrDefaultAsync(s=>s.Id==sessionId,ct);
        if(existing!=null){if(existing.UserId!=userId)throw new KeyNotFoundException();return View(existing);}
        if(await db.ChatSessions.CountAsync(s=>s.UserId==userId,ct)>=50) throw new BusinessRuleException("Đã đạt giới hạn 50 hội thoại demo.");
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
        var intent=AssistantIntent.Resolve(input.Content);var code=AssistantIntent.OrderCode(input.Content);
        Guid? selected=row.SelectedOrderId;Order? order=null;string answer;string? tool=null;var retrieved=DateTimeOffset.UtcNow;
        // Every order lookup is scoped to the authenticated user; no SQL/URL from chat.
        if(code!=null) {
            var match=await db.Orders.AsNoTracking().SingleOrDefaultAsync(o=>o.CustomerId==userId&&o.Code==code,ct);
            selected=match?.Id;order=match==null?null:OrderStore.Read(match);
        } else if(input.OrderId is {} explicitId) {
            var match=await db.Orders.AsNoTracking().SingleOrDefaultAsync(o=>o.Id==explicitId&&o.CustomerId==userId,ct);
            selected=match?.Id;order=match==null?null:OrderStore.Read(match);
        } else if(selected is {} id) {
            var match=await db.Orders.AsNoTracking().SingleOrDefaultAsync(o=>o.Id==id&&o.CustomerId==userId,ct);
            order=match==null?null:OrderStore.Read(match);if(order==null)selected=null;
        }
        if(System.Text.RegularExpressions.Regex.Matches(input.Content.ToUpperInvariant(), @"\bAW-[A-Z0-9]+(?:-[A-Z0-9]+)*\b").Count>1) {answer="Bạn nêu nhiều mã đơn. Hãy chọn một đơn hoặc hỏi từng mã để tránh nhầm thông tin.";selected=row.SelectedOrderId;order=null;}
        else if(code!=null&&order==null || input.OrderId!=null&&code==null&&order==null) answer="Không tìm thấy đơn trong tài khoản của bạn. Hãy kiểm tra mã đơn hoặc chọn đơn của mình.";
        else if(intent=="readonly") answer="Trợ lý chỉ tra cứu. Bạn cần liên hệ đại lý để yêu cầu thay đổi đơn, thanh toán hoặc lịch bàn giao.";
        else if(intent=="help") answer="Bạn có thể hỏi: những đơn nào của tôi, trạng thái đơn, còn phải trả bao nhiêu, khi nào nhận xe, thông tin xe hoặc bảo hành. Chọn đơn trước để hỏi chi tiết.";
        else if(intent=="list") {
            var list=await db.Orders.AsNoTracking().Where(o=>o.CustomerId==userId).OrderByDescending(o=>o.CreatedAt).Take(20).ToListAsync(ct);
            tool="ListMyOrders";answer=list.Count==0?"Bạn chưa có đơn mua xe.":"Tối đa 20 đơn gần nhất của bạn:\n"+string.Join("\n",list.Select(o=>{var item=OrderStore.Read(o);return item.Code+" · "+item.CarName+" · "+Status(item.Status);}))+"\nChọn đơn hoặc nhập mã đơn để xem chi tiết.";
        } else if(order==null) answer="Bạn muốn tra cứu đơn nào? Hãy chọn đơn hoặc nhập mã AW-...; tôi chưa chọn thay bạn.";
        else {
            tool=intent switch{"payment"=>"GetMyOrderPaymentSummary","delivery"=>"GetMyDeliverySchedule","car"=>"GetCarDetail","warranty"=>"GetWarranty",_=>"GetMyOrderStatus"};
            answer=intent switch {
                "payment"=>$"{order.Code}: giá chốt {Money(order.TotalVnd)}, cọc yêu cầu {Money(order.DepositRequiredVnd)} (nằm trong giá chốt), đã thu ròng {Money(order.NetReceived)}. "+(order.Status=="cancelled"?"Đơn đã hủy; số tiền còn giữ "+Money(order.NetReceived)+".":"Còn phải trả "+Money(order.RemainingVnd)+". Chỉ giao dịch đã xác nhận được tính."),
                "delivery"=>$"{order.Code}: dự kiến "+(order.PlannedDate?.ToString("dd/MM/yyyy")??"chưa cập nhật")+"; địa điểm "+(order.DeliveryLocation??"chưa cập nhật")+"; thực tế "+(order.ActualHandoverAt?.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm")??"chưa bàn giao")+". Lịch dự kiến có thể thay đổi; liên hệ đại lý để xác nhận.",
                _=>$"{order.Code}: {Status(order.Status)}. Xe đặt: {order.CarName}; đại lý: {order.DealerName}."
            };
            if(intent is "car" or "warranty") {
                // Python calls happen before opening the database write transaction.
                try {
                    if(intent=="car") {var car=await common.GetCar(order.CarId,ct);answer=$"Catalogue hiện tại: {car.DisplayName}, hãng {car.Brand}. Snapshot trên đơn: {order.CarName}. Giá giao dịch đã chốt {Money(order.TotalVnd)}; nguồn giá catalogue: {car.PriceSourceId??"chưa có"}.";}
                    else {var w=await common.GetWarranty(order.CarId,order.Brand,ct);answer=w==null?"Catalogue hiện chưa có dữ liệu bảo hành cho xe này.":$"Bảo hành theo catalogue hiện tại: {w.DurationMonths?.ToString()??"chưa có dữ liệu"} tháng; giới hạn {w.DistanceLimitKm?.ToString("N0",CultureInfo.GetCultureInfo("vi-VN"))??"chưa có dữ liệu"} km. Điều kiện: {w.Conditions??"chưa có dữ liệu"}. Nguồn: {w.SourceId??"chưa có"}. Xác nhận lại với đại lý.";}
                } catch(Exception ex) when(ex is HttpRequestException or TaskCanceledException or BusinessRuleException) {answer="Chưa tra được dữ liệu catalogue Python. Hãy thử lại sau; thông tin này chưa được xác minh.";tool="CommonUnavailable";}
            }
        }
        var messages=new List<ChatMessage>{new("user",input.Content.Trim(),DateTimeOffset.UtcNow),new("assistant",answer,DateTimeOffset.UtcNow,tool,order?.Code,order==null?null:"/account/orders/"+order.Id,retrieved)};
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({sessionId.ToString()},0))",ct);
        var current=await db.ChatSessions.SingleOrDefaultAsync(s=>s.Id==sessionId&&s.UserId==userId,ct)??throw new KeyNotFoundException();
        var currentTurns=Turns(current);
        if(currentTurns.FirstOrDefault(t=>t.RequestId==input.RequestId) is {} replay) {if(replay.Hash!=hash)throw new VersionConflictException();return View(current);}
        if(current.Version!=input.Version)throw new VersionConflictException();
        currentTurns.Add(new(input.RequestId,hash,messages));current.Payload=JsonSerializer.Serialize(currentTurns,OrderStore.Json);current.SelectedOrderId=selected;current.Version++;current.UpdatedAt=DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return View(current);
    }
    static string Money(long value)=>value.ToString("N0",CultureInfo.GetCultureInfo("vi-VN"))+" VND";
    static string Status(string value)=>value switch{"pending_confirmation"=>"Chờ xác nhận","confirmed"=>"Đã xác nhận","preparing_vehicle"=>"Đang chuẩn bị xe","ready_for_handover"=>"Chờ bàn giao","completed"=>"Hoàn thành","cancelled"=>"Đã hủy",_=>"Chưa rõ"};
}
