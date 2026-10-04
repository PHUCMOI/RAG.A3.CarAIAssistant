using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;

namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class NotificationEventRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string EventKey { get; set; } = "";
    public string Type { get; set; } = "business";
    public string Title { get; set; } = "";
    public string DetailUrl { get; set; } = "";
    public Guid? OrderId { get; set; }
    public long? ScheduleVersion { get; set; }
    public DateOnly? PlannedDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset DueAt { get; set; } = DateTimeOffset.UtcNow;
    public string Status { get; set; } = "pending";
    public int Attempts { get; set; }
    public string? ErrorCode { get; set; }
}

public static class NotificationEvents
{
    public static void Configure(ModelBuilder b)
    {
        var e = b.Entity<NotificationEventRecord>();
        e.ToTable("notification_outbox");
        e.HasIndex(x => new { x.UserId, x.EventKey, x.Type }).IsUnique();
        e.HasIndex(x => new { x.Status, x.DueAt });
        e.HasIndex(x => x.OrderId);
        e.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<NotificationRecord>().HasIndex(x => new { x.UserId, x.EventKey, x.Type }).IsUnique();
        b.Entity<NotificationRecord>().Property(x=>x.Type).HasDefaultValue("business");
    }

    public static void Add(OrdersDb db, Guid user, string key, string title, string url,
        string type = "business", Guid? orderId = null)
        => db.NotificationEvents.Add(new() { UserId = user, EventKey = key, Title = title, DetailUrl = url, Type = type, OrderId = orderId });

    // Orders store a date only. Use 08:00 Vietnam time as the documented delivery-day anchor.
    public static DateTimeOffset ReminderAt(DateOnly date)
        => new DateTimeOffset(date.ToDateTime(new TimeOnly(8, 0)), TimeSpan.FromHours(7)).ToUniversalTime().AddDays(-1);

    public static async Task Schedule(OrdersDb db, Order o, DateTimeOffset now, CancellationToken ct)
    {
        await db.NotificationEvents.Where(x => x.OrderId == o.Id && x.Type == "delivery_reminder" && x.Status == "pending")
            .ExecuteUpdateAsync(x => x.SetProperty(e => e.Status, "cancelled"), ct);
        if (!o.DeliveryScheduleConfirmed || o.PlannedDate == null || o.ActualHandoverAt != null || o.Status is "completed" or "cancelled") return;
        var due = ReminderAt(o.PlannedDate.Value);
        if (due <= now) return;
        db.NotificationEvents.Add(new() { UserId = o.CustomerId, EventKey = "schedule:" + o.Id + ":" + o.DeliveryScheduleVersion,
            Type = "delivery_reminder", OrderId = o.Id, ScheduleVersion = o.DeliveryScheduleVersion, PlannedDate = o.PlannedDate,
            Title = $"{o.Code}: nhắc lịch giao ngày {o.PlannedDate:dd/MM/yyyy}", DetailUrl = "/account/orders/" + o.Id,
            CreatedAt = now, DueAt = due });
    }
}

public sealed class NotificationDelivery(OrdersDb db, TimeProvider clock)
{
    public const int MaxAttempts = 5;
    public async Task<int> RunBatch(CancellationToken ct, int size = 50, Guid? recipient = null)
    {
        var count = 0;
        for (var i = 0; i < Math.Clamp(size, 1, 100); i++)
        {
            db.ChangeTracker.Clear();
            var now = clock.GetUtcNow();
            Guid? selected = null;
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                var candidate = await db.NotificationEvents.AsNoTracking().Where(x => x.Status == "pending" && x.DueAt <= now && (recipient == null || x.UserId == recipient)).OrderBy(x => x.DueAt).ThenBy(x => x.Id).FirstOrDefaultAsync(ct);
                if (candidate == null) break;
                // Same lock order as schedule mutations: order first, then outbox.
                OrderRecord? orderRow = null;
                if (candidate.Type == "delivery_reminder")
                    orderRow = await db.Orders.FromSqlInterpolated($"SELECT * FROM orders_service.orders WHERE \"Id\"={candidate.OrderId} FOR UPDATE").SingleOrDefaultAsync(ct);
                var row = await db.NotificationEvents.FromSqlInterpolated($"SELECT * FROM orders_service.notification_outbox WHERE \"Id\"={candidate.Id} AND \"Status\"='pending' AND \"DueAt\" <= {now} FOR UPDATE SKIP LOCKED").SingleOrDefaultAsync(ct);
                if (row == null) continue;
                selected = row.Id;
                var valid = true;
                if (row.Type == "delivery_reminder")
                {
                    var user = await db.Users.FromSqlInterpolated($"SELECT * FROM orders_service.users WHERE \"Id\"={row.UserId} FOR UPDATE").SingleOrDefaultAsync(ct);
                    var order = orderRow == null ? null : OrderStore.Read(orderRow);
                    valid = order != null && order.CustomerId == row.UserId && user?.DeliveryRemindersEnabled == true &&
                        order.DeliveryScheduleConfirmed && order.ActualHandoverAt == null && order.Status is not ("completed" or "cancelled") &&
                        order.DeliveryScheduleVersion == row.ScheduleVersion && order.PlannedDate == row.PlannedDate &&
                        row.PlannedDate != null && now >= NotificationEvents.ReminderAt(row.PlannedDate.Value) && now < NotificationEvents.ReminderAt(row.PlannedDate.Value).AddMinutes(5);
                }
                if (valid)
                {
                    if (!await db.Notifications.AnyAsync(x => x.UserId == row.UserId && x.EventKey == row.EventKey && x.Type == row.Type, ct))
                        db.Notifications.Add(new() { UserId = row.UserId, EventKey = row.EventKey, Type = row.Type, Title = row.Title,
                            DetailUrl = row.DetailUrl, ChatUrl = row.OrderId == null ? null : "/account/assistant?orderId=" + row.OrderId,
                            CreatedAt = now });
                    row.Status = "delivered";
                }
                else row.Status = "cancelled";
                row.ErrorCode = null;
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
                count++;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                db.ChangeTracker.Clear();
                if (selected == null) throw;
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                var row = await db.NotificationEvents.FromSqlInterpolated($"SELECT * FROM orders_service.notification_outbox WHERE \"Id\"={selected} FOR UPDATE").SingleAsync(ct);
                // Another worker may have successfully delivered after the failed transaction rolled back.
                if (row.Status == "pending")
                {
                    row.Attempts++;
                    row.ErrorCode = ex is DbUpdateException ? "storage_conflict" : "delivery_failed";
                    if (row.Attempts >= MaxAttempts) row.Status = "failed";
                    else row.DueAt = now.AddSeconds(Math.Pow(2, row.Attempts) * 5);
                    await db.SaveChangesAsync(ct);
                }
                await transaction.CommitAsync(ct);
                count++;
            }
        }
        return count;
    }

    public async Task<object> Preferences(Guid user, CancellationToken ct)
        => new { deliveryRemindersEnabled = await db.Users.Where(x => x.Id == user).Select(x => x.DeliveryRemindersEnabled).SingleAsync(ct) };

    public async Task<object> SetPreferences(Guid user, bool enabled, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.Users.FromSqlInterpolated($"SELECT * FROM orders_service.users WHERE \"Id\"={user} FOR UPDATE").SingleAsync(ct);
        row.DeliveryRemindersEnabled = enabled;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new { deliveryRemindersEnabled = enabled };
    }

    public async Task Retry(Guid id, CancellationToken ct)
    {
        var changed = await db.NotificationEvents.Where(x => x.Id == id && x.Status == "failed")
            .ExecuteUpdateAsync(x => x.SetProperty(e => e.Status, "pending").SetProperty(e => e.Attempts, 0)
                .SetProperty(e => e.ErrorCode, (string?)null).SetProperty(e => e.DueAt, clock.GetUtcNow()), ct);
        if (changed == 0) throw new KeyNotFoundException();
    }
}
