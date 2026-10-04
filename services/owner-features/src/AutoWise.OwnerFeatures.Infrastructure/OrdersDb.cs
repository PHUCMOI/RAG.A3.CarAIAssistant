using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class OrdersDb(DbContextOptions<OrdersDb> options) : DbContext(options)
{
    public DbSet<UserRecord> Users => Set<UserRecord>();
    public DbSet<OrderRecord> Orders => Set<OrderRecord>();
    public DbSet<RequestRecord> Requests => Set<RequestRecord>();
    public DbSet<PaymentReference> PaymentReferences => Set<PaymentReference>();
    public DbSet<ChatSessionRecord> ChatSessions => Set<ChatSessionRecord>();
    public DbSet<PurchaseRecord> Purchases => Set<PurchaseRecord>();
    public DbSet<NotificationRecord> Notifications => Set<NotificationRecord>();
    public DbSet<NotificationEventRecord> NotificationEvents => Set<NotificationEventRecord>();
    public DbSet<ChangeRecord> Changes => Set<ChangeRecord>();
    public DbSet<SlotRecord> Slots => Set<SlotRecord>();
    public DbSet<AppointmentRecord> Appointments => Set<AppointmentRecord>();
    public DbSet<FavoriteRecord> Favorites => Set<FavoriteRecord>();
    public DbSet<DocumentRecord> Documents => Set<DocumentRecord>();
    public DbSet<SupportTicketRecord> SupportTickets => Set<SupportTicketRecord>();
    public DbSet<SupportReplyRecord> SupportReplies => Set<SupportReplyRecord>();
    public DbSet<SupportAuditRecord> SupportAudits => Set<SupportAuditRecord>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema("orders_service");
        JourneyModel.Configure(b);
        AutoWise.OwnerFeatures.Infrastructure.NotificationEvents.Configure(b);
        b.Entity<UserRecord>().Property(x=>x.DeliveryRemindersEnabled).HasDefaultValue(true);
        var ticket=b.Entity<SupportTicketRecord>();ticket.ToTable("support_tickets",t=>t.HasCheckConstraint("CK_support_status","\"Status\" IN ('new','in_progress','resolved','closed')"));
        ticket.HasIndex(x=>x.Code).IsUnique();ticket.HasIndex(x=>new{x.CustomerId,x.UpdatedAt});ticket.Property(x=>x.Version).IsConcurrencyToken();ticket.Property(x=>x.Snapshot).HasColumnType("jsonb");
        ticket.Property(x=>x.Subject).HasMaxLength(150);ticket.Property(x=>x.Summary).HasMaxLength(800);
        ticket.HasOne<UserRecord>().WithMany().HasForeignKey(x=>x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        ticket.HasOne<UserRecord>().WithMany().HasForeignKey(x=>x.AssignedTo).OnDelete(DeleteBehavior.Restrict);
        ticket.HasOne<ChatSessionRecord>().WithMany().HasForeignKey(x=>x.SessionId).OnDelete(DeleteBehavior.Restrict);
        ticket.HasOne<OrderRecord>().WithMany().HasForeignKey(x=>x.OrderId).OnDelete(DeleteBehavior.Restrict);
        ticket.HasOne<ChangeRecord>().WithMany().HasForeignKey(x=>x.ChangeRequestId).OnDelete(DeleteBehavior.Restrict);
        var reply=b.Entity<SupportReplyRecord>();reply.ToTable("support_replies");reply.HasIndex(x=>new{x.TicketId,x.At});reply.Property(x=>x.Content).HasMaxLength(1000);
        reply.HasOne<SupportTicketRecord>().WithMany().HasForeignKey(x=>x.TicketId).OnDelete(DeleteBehavior.Restrict);reply.HasOne<UserRecord>().WithMany().HasForeignKey(x=>x.AuthorId).OnDelete(DeleteBehavior.Restrict);
        var audit=b.Entity<SupportAuditRecord>();audit.ToTable("support_audits");audit.HasIndex(x=>new{x.TicketId,x.Version});audit.HasOne<SupportTicketRecord>().WithMany().HasForeignKey(x=>x.TicketId).OnDelete(DeleteBehavior.Restrict);audit.HasOne<UserRecord>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);
        var d=b.Entity<DocumentRecord>();
        d.ToTable("order_document_checklist",t=>t.HasCheckConstraint("CK_document_status","\"Status\" IN ('missing','pending','valid','needs_changes')"));
        d.HasIndex(x=>new{x.OrderId,x.Name});
        d.Property(x=>x.Version).IsConcurrencyToken();
        d.Property(x=>x.Name).HasMaxLength(150);d.Property(x=>x.CustomerNote).HasMaxLength(500);
        d.HasOne<OrderRecord>().WithMany().HasForeignKey(x=>x.OrderId).OnDelete(DeleteBehavior.Restrict);
        d.HasOne<UserRecord>().WithMany().HasForeignKey(x=>x.UpdatedBy).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ChatSessionRecord>().ToTable("chat_sessions");
        b.Entity<ChatSessionRecord>().Property(x=>x.Payload).HasColumnType("jsonb");
        b.Entity<ChatSessionRecord>().Property(x=>x.Context).HasColumnType("jsonb");
        b.Entity<ChatSessionRecord>().Property(x=>x.Version).IsConcurrencyToken();
        b.Entity<ChatSessionRecord>().HasIndex(x=>new{x.UserId,x.UpdatedAt});
        b.Entity<ChatSessionRecord>().HasOne<UserRecord>().WithMany().HasForeignKey(x=>x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<UserRecord>().ToTable("users", t => t.HasCheckConstraint("CK_users_Role", "\"Role\" IN ('Admin','Customer')"));
        b.Entity<UserRecord>().HasIndex(x => x.Email).IsUnique();
        b.Entity<OrderRecord>().ToTable("orders", t => t.HasCheckConstraint("CK_orders_Version", "\"Version\" > 0"));
        b.Entity<OrderRecord>().HasIndex(x => x.Code).IsUnique();
        b.Entity<OrderRecord>().HasIndex(x => new { x.CustomerId, x.CreatedAt });
        b.Entity<OrderRecord>().Property(x => x.Payload).HasColumnType("jsonb");
        b.Entity<OrderRecord>().Property(x => x.Version).IsConcurrencyToken();
        b.Entity<OrderRecord>().HasOne<UserRecord>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RequestRecord>().ToTable("idempotency_requests");
        b.Entity<RequestRecord>().HasKey(x => x.Key);
        b.Entity<RequestRecord>().Property(x => x.Response).HasColumnType("jsonb");
        b.Entity<PaymentReference>().ToTable("payment_references");
        b.Entity<PaymentReference>().HasKey(x => x.Reference);
        b.Entity<PaymentReference>().HasOne<OrderRecord>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class UserRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Customer";
    public string? Phone {get;set;}
    public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
    public bool CreatedAtEstimated {get;set;}
    public long ProfileVersion {get;set;}=1;
    public long SecurityVersion {get;set;}=1;
    public bool DeliveryRemindersEnabled {get;set;}=true;
}
public sealed class OrderRecord
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public Guid CustomerId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string Status { get; set; } = "pending_confirmation";
    public long Version { get; set; }
    public string Payload { get; set; } = "{}";
}
public sealed class RequestRecord
{
    public string Key { get; set; } = "";
    public string Hash { get; set; } = "";
    public string Response { get; set; } = "{}";
    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PaymentReference
{
    public string Reference { get; set; } = "";
    public Guid OrderId { get; set; }
}

public sealed class ChatSessionRecord {
    public Guid Id {get;set;}=Guid.NewGuid();
    public Guid UserId {get;set;}
    public Guid? SelectedOrderId {get;set;}
    public long Version {get;set;}=1;
    public string Payload {get;set;}="[]";
    public string Context {get;set;}="{}";
    public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt {get;set;}=DateTimeOffset.UtcNow;
}
