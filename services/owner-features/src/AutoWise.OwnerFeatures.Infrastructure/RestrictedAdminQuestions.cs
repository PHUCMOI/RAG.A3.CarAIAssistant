using System.Text.Json;
using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;

namespace AutoWise.OwnerFeatures.Infrastructure;

public static class RestrictedAdminQuestions
{
    public const string Answer = "Bạn không có quyền xem doanh thu, lợi nhuận hoặc thống kê nội bộ toàn hệ thống. Tôi có thể giúp bạn kiểm tra thanh toán, số tiền còn lại và tiến độ trên đơn hàng thuộc tài khoản của bạn.";
    public static bool Matches(string text) => Regex.IsMatch(AssistantIntent.Normalize(text),
        @"doanh thu|revenue|loi nhuan|\bprofits?\b|(?:thong ke|bao cao|tong (?:so|tien)|danh sach).*(?:toan (?:he thong|bo (?:khach hang|cua hang|cong ty))|cua hang|cong ty|dai ly|khach hang khac)|(?:store|company|system).*(?:statistics|sales|turnover)|(?:all|other) customers");

    public static async Task<ChatSession> Reject(OrdersDb db, Guid sessionId, Guid owner, Guid requestId, long version, string question, string hash, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({sessionId.ToString()},0))", ct);
        var row = await db.ChatSessions.SingleOrDefaultAsync(x => x.Id == sessionId && x.UserId == owner, ct) ?? throw new KeyNotFoundException();
        var turns = JsonSerializer.Deserialize<List<ChatTurn>>(row.Payload, OrderStore.Json)!;
        if (turns.FirstOrDefault(x => x.RequestId == requestId) is {} replay) {
            if (replay.Hash != hash) throw new VersionConflictException();
            return OrderAssistant.View(row);
        }
        if (row.Version != version) throw new VersionConflictException();
        if (turns.Count >= 100) throw new BusinessRuleException("Hội thoại đạt 100 lượt; hãy tạo hội thoại mới.");
        var at = DateTimeOffset.UtcNow;
        turns.Add(new(requestId, hash, [new("user", question, at), new("assistant", Answer, at,
            GenerationMode: "authorization-policy", Grounded: false, Status: "forbidden", Evidence: [], Citations: [])]));
        row.Payload = JsonSerializer.Serialize(turns, OrderStore.Json);
        ChatAttachments.CheckHistory(row.Payload);
        row.Version++; row.UpdatedAt = at;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return OrderAssistant.View(row);
    }
}
