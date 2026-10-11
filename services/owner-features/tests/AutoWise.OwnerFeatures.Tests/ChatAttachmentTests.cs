using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;

public class ChatAttachmentTests
{
    [ContextDatabaseFact]
    public async Task SessionQuotaIsAtomicAndRollbackDoesNotLeaveAttachment()
    {
        var options = new DbContextOptionsBuilder<OrdersDb>().UseNpgsql(Environment.GetEnvironmentVariable("CONTEXT_TEST_DATABASE")).Options;
        await using var db = new OrdersDb(options);
        var owner = new UserRecord { Email = $"attachment-{Guid.NewGuid():N}@test.invalid", DisplayName = "Attachment test" };
        var session = new ChatSessionRecord { UserId = owner.Id };
        db.Users.Add(owner); db.ChatSessions.Add(session); await db.SaveChangesAsync();
        try {
            // Existing attachments exactly fill the session allowance.
            for (var i = 0; i < 3; i++) db.ChatAttachments.Add(new() { Id = Guid.NewGuid(), SessionId = session.Id, Data = new byte[ChatAttachments.MaxImageBytes], MimeType = "image/png" });
            await db.SaveChangesAsync();
            await Assert.ThrowsAsync<BusinessRuleException>(() => ChatAttachments.CheckBudget(db, session.Id, 1, default));
            await db.ChatAttachments.Where(a => a.SessionId == session.Id).ExecuteDeleteAsync(); db.ChangeTracker.Clear();
            await using (var tx = await db.Database.BeginTransactionAsync()) {
                var url = await ChatAttachments.Store(db, session.Id, Guid.NewGuid(), "data:image/png;base64,AQID", default);
                Assert.StartsWith($"/api/orders-service/assistant/sessions/{session.Id}/attachments/", url);
                await db.SaveChangesAsync();
                await tx.RollbackAsync();
            }
            Assert.False(await db.ChatAttachments.AnyAsync(a => a.SessionId == session.Id));
        } finally {
            db.ChangeTracker.Clear();
            await db.ChatSessions.Where(s => s.Id == session.Id).ExecuteDeleteAsync();
            await db.Users.Where(u => u.Id == owner.Id).ExecuteDeleteAsync();
        }
    }

    [Fact]
    public void HistoryBudgetCountsUtf8Bytes()
    {
        ChatAttachments.CheckHistory("[]");
        Assert.Throws<BusinessRuleException>(() => ChatAttachments.CheckHistory(new string('ấ', 700_000)));
    }
}
