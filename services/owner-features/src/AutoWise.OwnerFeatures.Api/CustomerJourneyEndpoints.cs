using System.Security.Claims;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Api;

public static class CustomerJourneyEndpoints
{
    static Guid User(HttpContext ctx) => Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    static string Key(HttpContext ctx) => ctx.Request.Headers["Idempotency-Key"].ToString();
    public static void MapJourney(this RouteGroupBuilder api)
    {
        var mine = api.MapGroup("/my").RequireAuthorization(p => p.RequireRole("Customer"));
        var admin = api.MapGroup("/admin").RequireAuthorization(p => p.RequireRole("Admin"));
        mine.MapGet("/profile", (HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.Profile(User(c), ct));
        mine.MapPatch("/profile", (ProfileUpdate i, HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.Update(User(c), i, ct));
        mine.MapPost("/password", async (PasswordUpdate i, HttpContext c, OrdersDb db, CancellationToken ct) =>
        {
            if (string.IsNullOrEmpty(i.CurrentPassword) || i.CurrentPassword.Length > 256 || string.IsNullOrEmpty(i.NewPassword) || i.NewPassword.Length < 12 || i.NewPassword.Length > 128 || i.NewPassword != i.ConfirmPassword || i.NewPassword == i.CurrentPassword)
                throw new BusinessRuleException("Mật khẩu không hợp lệ: mới cần 12–128 ký tự, khớp xác nhận và khác mật khẩu cũ.");
            var u = await db.Users.SingleAsync(x => x.Id == User(c), ct);
            var hasher = new PasswordHasher<UserRecord>();
            if (hasher.VerifyHashedPassword(u, u.PasswordHash, i.CurrentPassword) == PasswordVerificationResult.Failed)
                throw new BusinessRuleException("Không thể xác nhận mật khẩu hiện tại.");
            u.PasswordHash = hasher.HashPassword(u, i.NewPassword);
            u.SecurityVersion++;
            await db.SaveChangesAsync(ct);
            await c.SignOutAsync();
            return Results.NoContent();
        }).RequireRateLimiting("password");
        mine.MapGet("/notifications", (int? page, int? pageSize, HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.Notifications(User(c), page ?? 1, pageSize ?? 20, ct));
        mine.MapGet("/notification-preferences", (HttpContext c, NotificationDelivery s, CancellationToken ct) => s.Preferences(User(c), ct));
        mine.MapPut("/notification-preferences", (NotificationPreferences i, HttpContext c, NotificationDelivery s, CancellationToken ct) => s.SetPreferences(User(c), i.DeliveryRemindersEnabled, ct));
        admin.MapGet("/notification-outbox/failures", async (OrdersDb db, CancellationToken ct) => await db.NotificationEvents.AsNoTracking().Where(x=>x.Status=="failed").OrderBy(x=>x.CreatedAt).Take(100).Select(x=>new{x.Id,x.Type,x.Attempts,x.ErrorCode,x.CreatedAt}).ToListAsync(ct));
        admin.MapPost("/notification-outbox/{id:guid}/retry", async (Guid id, NotificationDelivery s, CancellationToken ct) => { await s.Retry(id,ct);return Results.NoContent(); });
        mine.MapGet("/notifications/unread-count", async (HttpContext c, OrdersDb db, CancellationToken ct) => new { count = await db.Notifications.CountAsync(x => x.UserId == User(c) && x.ReadAt == null, ct) });
        mine.MapPost("/notifications/{id:guid}/read", (Guid id, HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.MarkRead(User(c), id, ct));
        mine.MapGet("/purchase-requests", (int? page, int? pageSize, string? status, string? query, HttpContext c, PurchaseStore s, CancellationToken ct) => s.List(User(c), status, query, page ?? 1, pageSize ?? 20, ct));
        mine.MapGet("/purchase-requests/{id:guid}", (Guid id, HttpContext c, PurchaseStore s, CancellationToken ct) => s.Get(id, User(c), ct));
        mine.MapPost("/purchase-requests", (PurchaseInput i, HttpContext c, PurchaseStore s, CancellationToken ct) => s.Create(User(c), i, Key(c), ct));
        mine.MapPatch("/purchase-requests/{id:guid}", (Guid id, PurchaseInput i, HttpContext c, PurchaseStore s, CancellationToken ct) => s.Edit(id, User(c), i, Key(c), ct));
        mine.MapPost("/purchase-requests/{id:guid}/withdraw", (Guid id, JourneyAction i, HttpContext c, PurchaseStore s, CancellationToken ct) => s.Act(id, User(c), false, "withdraw", i, Key(c), ct));
        admin.MapGet("/purchase-requests", (int? page, int? pageSize, string? status, string? query, PurchaseStore s, CancellationToken ct) => s.List(null, status, query, page ?? 1, pageSize ?? 20, ct));
        admin.MapGet("/purchase-requests/{id:guid}", (Guid id, PurchaseStore s, CancellationToken ct) => s.Get(id, null, ct));
        foreach (var route in new[] { "accept", "responses", "reject", "convert" })
        {
            var action = route == "responses" ? "response" : route;
            admin.MapPost("/purchase-requests/{id:guid}/" + route, (Guid id, JourneyAction i, HttpContext c, PurchaseStore s, CancellationToken ct) => s.Act(id, User(c), true, action, i, Key(c), ct));
        }
        mine.MapGet("/change-requests", (int? page, int? pageSize, Guid? requestId, HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.Changes(User(c), page ?? 1, pageSize ?? 20, ct, requestId));
        mine.MapPost("/change-requests", (ChangeInput i, HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.Change(User(c), i, Key(c), ct));
        admin.MapGet("/change-requests", (int? page, int? pageSize, CustomerAccountStore s, CancellationToken ct) => s.Changes(null, page ?? 1, pageSize ?? 20, ct));
        admin.MapPost("/change-requests/{id:guid}/decision", (Guid id, DecisionInput i, HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.Decide(id, User(c), i, Key(c), ct));
        mine.MapGet("/favorites", (HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.Favorites(User(c), ct));
        mine.MapPost("/favorites", (FavoriteInput i, HttpContext c, CustomerAccountStore s, CancellationToken ct) => s.AddFavorite(User(c), i.CarId, Key(c), ct));
        mine.MapDelete("/favorites/{carId}", async (string carId, HttpContext c, CustomerAccountStore s, CancellationToken ct) => { await s.RemoveFavorite(User(c), carId, ct); return Results.NoContent(); });
        mine.MapGet("/appointment-slots", (long? dealerId, AppointmentStore s, CancellationToken ct) => s.Slots(dealerId, false, ct));
        admin.MapGet("/appointment-slots", (long? dealerId, AppointmentStore s, CancellationToken ct) => s.Slots(dealerId, true, ct));
        admin.MapPost("/appointment-slots", (SlotInput i, HttpContext c, AppointmentStore s, CancellationToken ct) => s.CreateSlot(User(c), i, Key(c), ct));
        mine.MapGet("/appointments", (int? page, int? pageSize, HttpContext c, AppointmentStore s, CancellationToken ct) => s.List(User(c), page ?? 1, pageSize ?? 20, ct));
        admin.MapGet("/appointments", (int? page, int? pageSize, AppointmentStore s, CancellationToken ct) => s.List(null, page ?? 1, pageSize ?? 20, ct));
        mine.MapPost("/appointments", (AppointmentInput i, HttpContext c, AppointmentStore s, CancellationToken ct) => s.Create(User(c), i, Key(c), ct));
        mine.MapPost("/appointments/{id:guid}/actions", (Guid id, AppointmentAction i, HttpContext c, AppointmentStore s, CancellationToken ct) => s.Act(id, User(c), false, i, Key(c), ct));
        admin.MapPost("/appointments/{id:guid}/actions", (Guid id, AppointmentAction i, HttpContext c, AppointmentStore s, CancellationToken ct) => s.Act(id, User(c), true, i, Key(c), ct));
    }
}
public sealed record NotificationPreferences(bool DeliveryRemindersEnabled);
