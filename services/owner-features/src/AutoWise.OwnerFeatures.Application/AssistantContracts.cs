using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
namespace AutoWise.OwnerFeatures.Application;
public record CreateChatSessionRequest(Guid Id);
public record ChatInput(Guid RequestId, long Version, string Content, Guid? OrderId);
public record ChatMessage(string Role, string Content, DateTimeOffset At, string? Tool=null, string? OrderCode=null, string? DetailUrl=null, DateTimeOffset? RetrievedAt=null);
public record ChatTurn(Guid RequestId, string Hash, List<ChatMessage> Messages);
public record ChatSession(Guid Id, long Version, Guid? SelectedOrderId, List<ChatMessage> Messages);
public interface IOrderAssistant
{
    Task<object> List(Guid userId, CancellationToken ct);
    Task<ChatSession> Create(Guid userId, Guid sessionId, CancellationToken ct);
    Task<ChatSession> Get(Guid sessionId, Guid userId, CancellationToken ct);
    Task<ChatSession> Send(Guid sessionId, Guid userId, ChatInput input, CancellationToken ct);
}
public static class AssistantIntent
{
    public static string Normalize(string text) => new string(text.ToLowerInvariant().Normalize(NormalizationForm.FormD).Where(c=>CharUnicodeInfo.GetUnicodeCategory(c)!=UnicodeCategory.NonSpacingMark).ToArray()).Replace('đ','d');
    public static string? OrderCode(string text) => Regex.Match(text.ToUpperInvariant(), @"\bAW-[A-Z0-9]+(?:-[A-Z0-9]+)*\b").Value is {Length:>0} code ? code : null;
    public static string Resolve(string text) {
        var t=Normalize(text);
        if(new[]{"huy don","doi lich","xac nhan","tao don","chuyen trang thai","ghi nhan","hoan tien","doi gia"}.Any(t.Contains)) return "readonly";
        if(new[]{"bao hanh","warranty"}.Any(t.Contains)) return "warranty";
        if(new[]{"con phai","con no","bao nhieu","thanh toan","tien coc","da tra","da thu"}.Any(t.Contains)) return "payment";
        if(new[]{"nhan xe","ban giao","khi nao","lich giao","giao xe"}.Any(t.Contains)) return "delivery";
        if(new[]{"thong tin xe","thong so","xe gi","xe trong don"}.Any(t.Contains)) return "car";
        if(new[]{"nhung don","danh sach","cac don","don nao"}.Any(t.Contains)) return "list";
        if(new[]{"trang thai","tien do","den dau","don do","don nay"}.Any(t.Contains) || OrderCode(text)!=null) return "status";
        return "help";
    }
}

public record WarrantySnapshot(int? DurationMonths, long? DistanceLimitKm, string? Conditions, string? SourceId);
