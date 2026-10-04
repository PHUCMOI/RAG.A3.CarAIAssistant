using System.Globalization;
using System.Text.RegularExpressions;
namespace AutoWise.OwnerFeatures.Application;

public record DraftAudit(string Action, DateTimeOffset At, Guid RequestId, long Version);
public sealed record AssistantDraft
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid OrderId { get; init; }
    public string Subject { get; init; } = "";
    public Guid? PaymentId { get; init; }
    public Guid? ChangeRequestId { get; init; }
    public List<SupportExchange> Snapshot { get; init; } = [];
    public string OrderCode { get; init; } = "";
    public string Type { get; init; } = "cancel";
    public string Reason { get; init; } = "";
    public DateOnly? Date { get; init; }
    public string? Time { get; init; }
    public long Version { get; init; } = 1;
    public long OrderVersion { get; init; }
    public string OrderStatus { get; init; } = "";
    public DateOnly? CurrentDate { get; init; }
    public DateTimeOffset ExpiresAt { get; init; }
    public string Status { get; init; } = "draft";
    public Guid? RequestId { get; init; }
    public string? RequestCode { get; init; }
    public long? SubmittedFromVersion { get; init; }
    public List<DraftAudit> Audit { get; init; } = [];
    public bool Ready => Reason.Length > 0 && (Type == "support" ? Subject.Length>0 : Type == "cancel" || Date != null);
    public string? DetailUrl => RequestId == null ? null : Type=="support"?"/account/support-tickets/"+RequestId:"/account/change-requests?requestId=" + RequestId;
}
public record DraftAction(Guid RequestId, long Version, Guid DraftId, long DraftVersion, string Action,
    string? Reason = null, DateOnly? Date = null, string? Time = null, string? Subject=null, Guid? LinkedOrderId=null, Guid? PaymentId=null, Guid? ChangeRequestId=null);
public static class DraftParser
{
    public static string? Kind(string text)
    {
        var t = AssistantIntent.Normalize(text);
        if (t.Contains("huy don")) return "cancel";
        if (t.Contains("doi lich")) return "reschedule";
        return null;
    }
    public static DateOnly? Date(string text)
    {
        var match = Regex.Match(text, @"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})\b");
        return DateOnly.TryParseExact(match.Value, ["yyyy-MM-dd", "d/M/yyyy", "dd/MM/yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;
    }
    public static string Reason(string text)
    {
        var match = Regex.Match(text, @"(?:^|\s)(?:lý do|ly do|vì|vi|bởi vì)(?:\s*[:：]\s*|\s+)(.+)$", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value.Trim() : "";
    }
    public static string? Time(string text) => Regex.Match(text, @"\b(?:[01]\d|2[0-3]):[0-5]\d\b").Value is { Length: > 0 } time ? time : null;
}
