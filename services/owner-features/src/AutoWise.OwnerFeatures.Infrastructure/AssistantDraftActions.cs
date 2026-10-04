using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class AssistantDraftActions(OrdersDb db, JourneyTransactions tx, CustomerAccountStore account)
{
    public Task<ChatSession> Act(Guid sessionId, Guid user, DraftAction input, CancellationToken ct)
    {
        if (input.RequestId == Guid.Empty) throw new BusinessRuleException("Cần requestId hợp lệ.");
        return tx.Run(user, input.RequestId.ToString(), "assistant:draft:" + sessionId, input, async () =>
        {
            await tx.Lock(sessionId.ToString(), ct);
            var row = await db.ChatSessions.SingleOrDefaultAsync(x => x.Id == sessionId && x.UserId == user, ct) ?? throw new KeyNotFoundException();
            var context = JourneyTransactions.Unpack<ConversationContext>(row.Context);
            var draft = context.Drafts.SingleOrDefault(x => x.Id == input.DraftId) ?? throw new KeyNotFoundException();
            if (draft.Status == "submitted" && input.Action == "confirm" && draft.SubmittedFromVersion == input.DraftVersion)
                return OrderAssistant.View(row);
            CustomerRules.Version(row.Version, input.Version);
            CustomerRules.Version(draft.Version, input.DraftVersion);
            if (draft.Status != "draft" || draft.ExpiresAt <= DateTimeOffset.UtcNow)
                throw new BusinessRuleException("Bản nháp đã hết hạn hoặc kết thúc. Hãy tạo bản nháp mới.");
            var support=new SupportStore(db,tx);
            var orderRow=draft.Type=="support"?null:await db.Orders.AsNoTracking().SingleOrDefaultAsync(x => x.Id == draft.OrderId && x.CustomerId == user, ct) ?? throw new KeyNotFoundException();
            if(draft.Type=="support" && input.Action=="edit") {
                await support.ValidateLinks(user,input.LinkedOrderId,input.PaymentId,input.ChangeRequestId,ct);
                var linked=input.LinkedOrderId==null?null:await db.Orders.AsNoTracking().SingleAsync(x=>x.Id==input.LinkedOrderId&&x.CustomerId==user,ct);
                draft=draft with {Subject=CustomerRules.Text(SupportRules.Clean(input.Subject??""),150),Reason=CustomerRules.Text(SupportRules.Clean(input.Reason??""),800),
                    OrderId=input.LinkedOrderId??Guid.Empty,OrderCode=linked?.Code??"",PaymentId=input.PaymentId,ChangeRequestId=input.ChangeRequestId,ExpiresAt=DateTimeOffset.UtcNow.AddMinutes(30)};
            }
            else if(draft.Type=="support" && input.Action=="confirm") {
                if(!draft.Ready) throw new BusinessRuleException("Cần chủ đề và tóm tắt vấn đề trước khi xác nhận.");
                var ticket=await support.Create(user,row.Id,draft,ct);
                draft=draft with {Status="submitted",RequestId=ticket.Id,RequestCode=ticket.Code,SubmittedFromVersion=draft.Version};
                var turns=JourneyTransactions.Unpack<List<ChatTurn>>(row.Payload);
                turns.Add(new(input.RequestId,"draft-action",[new("assistant",$"Đã tiếp nhận phiếu {ticket.Code}. Bạn có thể xem trạng thái và phản hồi trong tài khoản. Chưa có thời gian xử lý cam kết.",DateTimeOffset.UtcNow,"SubmitSupportTicket",null,draft.DetailUrl)]));
                row.Payload=JourneyTransactions.Pack(turns);
            }
            else if (input.Action == "edit")
            {
                CustomerRules.ActiveOrder(OrderStore.Read(orderRow!));
                var reason = CustomerRules.Text(input.Reason, 800);
                var time = string.IsNullOrWhiteSpace(input.Time) ? null : input.Time;
                if (time != null && !Regex.IsMatch(time, @"^(?:[01]\d|2[0-3]):[0-5]\d$")) throw new BusinessRuleException("Giờ cần theo dạng HH:mm.");
                if (draft.Type == "reschedule" && (input.Date == null || input.Date < DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime)))
                    throw new BusinessRuleException("Cần ngày mong muốn từ hôm nay trở đi.");
                var order=OrderStore.Read(orderRow!);
                draft = draft with { Reason = reason, Date = input.Date, Time = time, OrderVersion = orderRow!.Version, OrderStatus=order.Status, CurrentDate=order.PlannedDate, ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30) };
            }
            else if (input.Action == "discard") draft = draft with { Status = "discarded" };
            else if (input.Action == "confirm")
            {
                if (!draft.Ready) throw new BusinessRuleException("Cần điền đủ lý do và ngày đổi lịch trước khi xác nhận.");
                if (draft.Type == "reschedule" && draft.Date < DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime))
                    throw new BusinessRuleException("Ngày mong muốn đã qua. Hãy sửa bản nháp.");
                var reason = draft.Type == "cancel" ? draft.Reason : $"Đề nghị đổi lịch: {draft.Date:dd/MM/yyyy}" + (draft.Time == null ? "" : $" lúc {draft.Time} (giờ Việt Nam)") + $". Lý do: {draft.Reason}";
                var change = await account.CreateChangeInTransaction(user, new(draft.OrderId, draft.Type == "cancel" ? "cancel" : "change", reason), ct, draft.OrderVersion);
                draft = draft with { Status = "submitted", RequestId = change.Id, RequestCode = change.Code, SubmittedFromVersion = draft.Version };
                var turns = JourneyTransactions.Unpack<List<ChatTurn>>(row.Payload);
                turns.Add(new(input.RequestId, "draft-action", [new("assistant", $"Đã gửi {change.Code}, đang chờ xử lý. Lịch và trạng thái đơn chưa thay đổi.", DateTimeOffset.UtcNow, "SubmitChangeRequest", draft.OrderCode, draft.DetailUrl)]));
                row.Payload = JourneyTransactions.Pack(turns);
            }
            else throw new BusinessRuleException("Thao tác bản nháp không hợp lệ.");
            draft = draft with { Version = draft.Version + 1, Audit = [..draft.Audit, new(input.Action, DateTimeOffset.UtcNow, input.RequestId, draft.Version)] };
            row.Context = JourneyTransactions.Pack(context with { Drafts = context.Drafts.Select(x => x.Id == draft.Id ? draft : x).ToList() });
            row.Version++;
            row.UpdatedAt = DateTimeOffset.UtcNow;
            return OrderAssistant.View(row);
        }, ct);
    }
}
