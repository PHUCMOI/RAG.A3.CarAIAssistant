using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class PurchaseRecord
{
    public Guid Id { get; set; } = Guid.NewGuid(); public string Code { get; set; } = ""; public Guid CustomerId
    {
        get; set;
    }
    public string Status { get; set; } = "submitted"; public long Version { get; set; } = 1; public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow; public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow; public Guid? AssignedAdminId
    {
        get; set;
    }
    public Guid? OrderId
    {
        get; set;
    }
    public string Payload { get; set; } = "{}";
}
public sealed class NotificationRecord
{
    public string Type { get; set; } = "business";
    public string? ChatUrl { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid(); public Guid UserId
    {
        get; set;
    }
    public string EventKey { get; set; } = ""; public string Title { get; set; } = ""; public string DetailUrl { get; set; } = ""; public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow; public DateTimeOffset? ReadAt
    {
        get; set;
    }
}
public sealed class ChangeRecord
{
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public string Code => "CR-" + Id.ToString("N")[..12].ToUpperInvariant();
    public Guid Id { get; set; } = Guid.NewGuid(); public Guid CustomerId
    {
        get; set;
    }
    public Guid OrderId
    {
        get; set;
    }
    public string Type { get; set; } = "change"; public string Reason { get; set; } = ""; public string Status { get; set; } = "pending"; public string? Response
    {
        get; set;
    }
    public Guid? ReviewedBy
    {
        get; set;
    }
    public DateTimeOffset? ReviewedAt
    {
        get; set;
    }
    public long Version { get; set; } = 1; public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class SlotRecord
{
    public Guid Id { get; set; } = Guid.NewGuid(); public long DealerId
    {
        get; set;
    }
    public string DealerName { get; set; } = ""; public string StaffName { get; set; } = ""; public DateTimeOffset StartsAt
    {
        get; set;
    }
    public DateTimeOffset EndsAt
    {
        get; set;
    }
}
public sealed class AppointmentRecord
{
    public Guid Id { get; set; } = Guid.NewGuid(); public Guid CustomerId
    {
        get; set;
    }
    public Guid SlotId
    {
        get; set;
    }
    public string Status { get; set; } = "requested"; public long Version { get; set; } = 1; public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow; public string Payload { get; set; } = "{}";
}
public sealed class FavoriteRecord
{
    public Guid UserId
    {
        get; set;
    }
    public string CarId { get; set; } = ""; public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public static class JourneyModel
{
    public static void Configure(ModelBuilder b)
    {
        b.Entity<UserRecord>().Property(x => x.ProfileVersion).IsConcurrencyToken();
        b.Entity<UserRecord>().Property(x => x.SecurityVersion).IsConcurrencyToken();
        var p = b.Entity<PurchaseRecord>();
        p.ToTable("purchase_requests");
        p.HasIndex(x => x.Code).IsUnique();
        p.HasIndex(x => new { x.CustomerId, x.CreatedAt });
        p.HasIndex(x => new { x.Status, x.CreatedAt });
        p.HasIndex(x => x.OrderId).IsUnique();
        p.Property(x => x.Payload).HasColumnType("jsonb");
        p.Property(x => x.Version).IsConcurrencyToken();
        p.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        p.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.AssignedAdminId).OnDelete(DeleteBehavior.Restrict);
        p.HasOne<OrderRecord>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
        var n = b.Entity<NotificationRecord>();
        n.ToTable("notifications");
        n.HasIndex(x => new { x.UserId, x.CreatedAt });
        n.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        var c = b.Entity<ChangeRecord>();
        c.ToTable("order_change_requests");
        c.HasIndex(x => new { x.CustomerId, x.CreatedAt });
        c.HasIndex(x => x.OrderId).IsUnique().HasFilter("\"Status\" = 'pending'");
        c.Property(x => x.Version).IsConcurrencyToken();
        c.HasOne<OrderRecord>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
        c.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        c.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.ReviewedBy).OnDelete(DeleteBehavior.Restrict);
        var s = b.Entity<SlotRecord>();
        s.ToTable("appointment_slots");
        s.HasIndex(x => new { x.DealerId, x.StartsAt });
        var a = b.Entity<AppointmentRecord>();
        a.ToTable("appointments");
        a.Property(x => x.Payload).HasColumnType("jsonb");
        a.Property(x => x.Version).IsConcurrencyToken();
        a.HasIndex(x => new { x.CustomerId, x.CreatedAt });
        a.HasIndex(x => x.SlotId).IsUnique().HasFilter("\"Status\" IN ('requested','proposed','confirmed')");
        a.HasOne<SlotRecord>().WithMany().HasForeignKey(x => x.SlotId).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        var f = b.Entity<FavoriteRecord>();
        f.ToTable("favorites");
        f.HasKey(x => new { x.UserId, x.CarId });
        f.HasOne<UserRecord>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
