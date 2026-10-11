using System.Text;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;

namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class ChatAttachmentRecord
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public byte[] Data { get; set; } = [];
    public string MimeType { get; set; } = "";
}

public static class ChatAttachments
{
    public const int MaxImageBytes = 10_000_000;
    public const int MaxSessionBytes = 30_000_000;
    public const int MaxHistoryBytes = 2_000_000;

    // Call under the session advisory lock and transaction, after replay/version checks.
    public static async Task<string?> Store(OrdersDb db, Guid sessionId, Guid requestId, string? dataUrl, CancellationToken ct)
    {
        if (dataUrl == null) return null;
        var comma = dataUrl.IndexOf(',');
        if (comma < 0 || comma > 50) throw new BusinessRuleException("Ảnh không hợp lệ.");
        var mime = dataUrl[..comma] switch {
            "data:image/jpeg;base64" => "image/jpeg",
            "data:image/png;base64" => "image/png",
            "data:image/webp;base64" => "image/webp",
            _ => throw new BusinessRuleException("Chọn ảnh JPEG, PNG hoặc WebP.")
        };
        if (dataUrl.Length - comma - 1 > 14_000_000) throw new BusinessRuleException("Ảnh quá lớn.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(dataUrl[(comma + 1)..]); }
        catch (FormatException) { throw new BusinessRuleException("Ảnh không hợp lệ."); }
        await CheckBudget(db, sessionId, bytes.Length, ct);
        db.ChatAttachments.Add(new() { Id = requestId, SessionId = sessionId, Data = bytes, MimeType = mime });
        return $"/api/orders-service/assistant/sessions/{sessionId}/attachments/{requestId}";
    }

    public static async Task CheckBudget(OrdersDb db, Guid sessionId, int size, CancellationToken ct)
    {
        if (size is < 1 or > MaxImageBytes) throw new BusinessRuleException("Ảnh phải nhỏ hơn 10 MB.");
        var used = await db.ChatAttachments.Where(a => a.SessionId == sessionId).SumAsync(a => (long)a.Data.Length, ct);
        if (used + size > MaxSessionBytes) throw new BusinessRuleException("Ảnh trong hội thoại đạt 30 MB; hãy tạo hội thoại mới.");
    }

    public static void CheckHistory(string payload)
    {
        if (Encoding.UTF8.GetByteCount(payload) > MaxHistoryBytes)
            throw new BusinessRuleException("Lịch sử hội thoại quá lớn; hãy tạo hội thoại mới.");
    }
}
