using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
namespace AutoWise.OwnerFeatures.Application;
public record CreateChatSessionRequest(Guid Id);
public record ChatInput(Guid RequestId, long Version, string Content, Guid? OrderId);
public record ChatSection(string Topic, string Content, string ResultStatus, DateTimeOffset RetrievedAt, string? DetailUrl=null, OrderProgressSnapshot? Progress=null, PaymentDetails? Payment=null, DocumentDetails? Documents=null);
public record ChatMessage(string Role, string Content, DateTimeOffset At, string? Tool=null, string? OrderCode=null, string? DetailUrl=null, DateTimeOffset? RetrievedAt=null, List<ChatSection>? Sections=null);
public record ChatTurn(Guid RequestId, string Hash, List<ChatMessage> Messages);
public record ChatSession(Guid Id, long Version, Guid? SelectedOrderId, List<ChatMessage> Messages, AssistantDraft? Draft=null, bool SupportSuggested=false);
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
    public static List<string> OrderCodes(string text) => Regex.Matches(text.ToUpperInvariant(), @"\bAW-[A-Z0-9]+(?:-[A-Z0-9]+)*\b")
        .Select(m => m.Value).Distinct().ToList();

    // Explicit topics only: an order code is a reference, not an extra status request.
    public static List<string> BusinessTopics(string text)
    {
        var normalized = Normalize(text);
        var patterns = new (string Topic, string Pattern)[] {
            ("status", @"trang thai|tien do|den dau|buoc tiep theo|can lam gi|dang cho gi|ly do cho|chuan bi xe|cho xac nhan|cho ban giao"),
            ("payment", @"con phai|con no|bao nhieu|thanh toan|(?:khoan |tien )coc|da tra|da thu|giao dich|chung tu|khoan thu|khoan hoan|hoan tien"),
            ("documents", @"giay to|ho so(?: don| con| can| mua)?|checklist"),
            ("delivery", @"nhan xe|ban giao|khi nao|lich giao|giao xe"),
            ("car", @"thong tin xe|thong so|xe gi"),
            ("warranty", @"bao hanh|warranty")
        };
        var matches = patterns.Select(p => (p.Topic, Match: Regex.Match(normalized, p.Pattern)))
            .Where(p => p.Match.Success).OrderBy(p => p.Match.Index).Select(p => p.Topic).ToList();
        if (matches.Count == 0 && normalized.Contains("xe trong don")) matches.Add("car");
        return matches;
    }
    public static string Resolve(string text) {
        var t=Normalize(text);
        if(new[]{"huy don","doi lich","tao don","chuyen trang thai","ghi nhan","doi gia"}.Any(t.Contains) ||
            t.Contains("hoan tien") && !Regex.IsMatch(t,@"da hoan|hoan tien.*(?:bao nhieu|chua|trang thai)|khoan hoan|lich su hoan") ||
            Regex.IsMatch(t,@"^(?:hay |vui long |toi muon )?xac nhan\b") && !Regex.IsMatch(t,@"\b(chua|khong)\b")) return "readonly";
        if(new[]{"doi mat khau","bao mat"}.Any(t.Contains)) return "security";
        if(new[]{"thong tin ca nhan","ho so ca nhan"}.Any(t.Contains)) return "profile";
        if(t.Contains("yeu cau mua")) return "requests";
        if(new[]{"lich hen","lich tu van","lich lai thu"}.Any(t.Contains)) return "appointments";
        if(t.Contains("yeu thich")) return "favorites";
        if(t.Contains("thong bao")) return "notifications";
        if(t.Contains("phieu ho tro")) return "support";
        if(new[]{"giay to","ho so","checklist"}.Any(t.Contains)) return "documents";
        if(new[]{"giao dich","chung tu","khoan coc","khoan thu","khoan hoan","hoan tien"}.Any(t.Contains)) return "payment";
        if(new[]{"bao hanh","warranty"}.Any(t.Contains)) return "warranty";
        if(new[]{"con phai","con no","bao nhieu","thanh toan","tien coc","da tra","da thu"}.Any(t.Contains)) return "payment";
        if(new[]{"nhan xe","ban giao","khi nao","lich giao","giao xe"}.Any(t.Contains)) return "delivery";
        if(new[]{"thong tin xe","thong so","xe gi","xe trong don"}.Any(t.Contains)) return "car";
        if(new[]{"nhung don","danh sach","cac don","don nao"}.Any(t.Contains)) return "list";
        if(new[]{"trang thai","tien do","den dau","don do","don nay","buoc tiep theo","can lam gi","dang cho gi","ly do cho","chuan bi xe","cho xac nhan","cho ban giao"}.Any(t.Contains) || OrderCode(text)!=null) return "status";
        return "help";
    }
}

public record WarrantySnapshot(int? DurationMonths, long? DistanceLimitKm, string? Conditions, string? SourceId);
