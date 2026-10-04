using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Domain;
namespace AutoWise.OwnerFeatures.Application;
public record SupportExchange(DateTimeOffset At, List<string> Topics, List<string> Results);
public record TicketReplyInput(long Version,string Content,bool Internal=false);
public record TicketActionInput(long Version,string Action);
public record TicketReplyView(Guid Id,string AuthorRole,string Content,DateTimeOffset At,bool Internal);
public record TicketView(Guid Id,string Code,string Subject,string Summary,string Status,long Version,Guid? OrderId,
    Guid? PaymentId,Guid? ChangeRequestId,Guid? AssignedTo,DateTimeOffset CreatedAt,DateTimeOffset UpdatedAt,List<SupportExchange> Snapshot,Page<TicketReplyView> Replies);
public static class SupportRules
{
    public static bool Requested(string text) => Regex.IsMatch(AssistantIntent.Normalize(text),@"nhan vien|nguoi that|chuyen ho tro|tao phieu ho tro|gap tu van vien");
    public static string Clean(string text) => Regex.Replace(text,@"(?im)(?:mat khau|mật khẩu|password|otp|api[_ -]?key|secret|access[_ -]?token|bearer)\s*[:=]?\s*\S+|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bsk-[A-Za-z0-9_-]+\b","[đã loại thông tin bí mật]",RegexOptions.IgnoreCase);
    public static string Transition(string status,string action,bool admin) => (status,action,admin) switch {
        ("new","accept",true)=>"in_progress",("in_progress","resolve",true)=>"resolved",("resolved","close",true)=>"closed",
        ("resolved","reply",false)=>"in_progress",(_,"reply",_) when status!="closed"=>status,
        _=>throw new BusinessRuleException("Thao tác không phù hợp trạng thái phiếu.")
    };
}
