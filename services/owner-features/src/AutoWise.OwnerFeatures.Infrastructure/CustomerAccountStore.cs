using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class CustomerAccountStore(OrdersDb db, ICommonCatalogue common, JourneyTransactions tx)
{
    public async Task<object> Profile(Guid user, CancellationToken ct)
    {
        var u = await db.Users.AsNoTracking().SingleAsync(x => x.Id == user, ct);
        return new
        {
            u.Id,
            u.DisplayName,
            u.Email,
            u.Phone,
            u.CreatedAt,
            u.CreatedAtEstimated,
            version = u.ProfileVersion
        };
    }
    public async Task<object> Update(Guid user, ProfileUpdate input, CancellationToken ct)
    {
        var name = CustomerRules.Name(input.DisplayName);
        var phone = CustomerRules.Phone(input.Phone);
        var u = await db.Users.SingleAsync(x => x.Id == user, ct);
        CustomerRules.Version(u.ProfileVersion, input.Version);
        u.DisplayName = name;
        u.Phone = phone;
        u.ProfileVersion++;
        await db.SaveChangesAsync(ct);
        return await Profile(user, ct);
    }
    public async Task<Page<NotificationRecord>> Notifications(Guid user, int page, int size, CancellationToken ct)
    {
        JourneyQueries.Paging(page, size);
        var q = db.Notifications.AsNoTracking().Where(x => x.UserId == user);
        return new(await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct), page, size, await q.CountAsync(ct));
    }
    public async Task<object> MarkRead(Guid user, Guid id, CancellationToken ct)
    {
        await db.Notifications.Where(x => x.Id == id && x.UserId == user).ExecuteUpdateAsync(x => x.SetProperty(n => n.ReadAt, n => n.ReadAt ?? DateTimeOffset.UtcNow), ct);
        var row = await db.Notifications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.UserId == user, ct) ?? throw new KeyNotFoundException();
        return row;
    }
    public async Task<Page<ChangeRecord>> Changes(Guid? user, int page, int size, CancellationToken ct)
    {
        JourneyQueries.Paging(page, size);
        var q = db.Changes.AsNoTracking().AsQueryable();
        if (user != null)
            q = q.Where(x => x.CustomerId == user);
        return new(await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct), page, size, await q.CountAsync(ct));
    }
    public Task<ChangeRecord> Change(Guid user, ChangeInput input, string key, CancellationToken ct) => tx.Run(user, key, "change:create", input, async () =>
    {
        var row = await db.Orders.FromSqlInterpolated($"SELECT * FROM orders_service.orders WHERE \"Id\"={input.OrderId} FOR UPDATE").SingleOrDefaultAsync(x => x.CustomerId == user, ct) ?? throw new KeyNotFoundException();
        CustomerRules.ActiveOrder(OrderStore.Read(row));
        if (input.Type is not ("change" or "cancel"))
            throw new BusinessRuleException("Loại đề nghị không hợp lệ.");
        if (await db.Changes.AnyAsync(x => x.OrderId == input.OrderId && x.Status == "pending", ct))
            throw new BusinessRuleException("Đơn đã có đề nghị đang chờ xử lý.");
        var item = new ChangeRecord { CustomerId = user, OrderId = input.OrderId, Type = input.Type, Reason = CustomerRules.Text(input.Reason) };
        db.Changes.Add(item);
        return item;
    }, ct);
    public Task<ChangeRecord> Decide(Guid id, Guid actor, DecisionInput input, string key, CancellationToken ct) => tx.Run(actor, key, "change:decide:" + id, input, async () => { var row = await db.Changes.FromSqlInterpolated($"SELECT * FROM orders_service.order_change_requests WHERE \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw new KeyNotFoundException(); CustomerRules.Version(row.Version, input.Version); if (row.Status != "pending" || input.Decision is not ("approved" or "rejected")) throw new BusinessRuleException("Quyết định không hợp lệ."); row.Response = CustomerRules.Text(input.Reason); row.Status = input.Decision; row.ReviewedBy = actor; row.ReviewedAt = DateTimeOffset.UtcNow; row.Version++; tx.Notify(row.CustomerId, "change:" + id + ":" + row.Version, "Đề nghị đã được phản hồi: " + row.Response, "/account/change-requests"); return row; }, ct);
    public async Task<object> Favorites(Guid user, CancellationToken ct)
    {
        var rows = await db.Favorites.AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct);
        var result = new List<object>();
        foreach (var row in rows)
        {
            try
            {
                var car = await common.GetCar(row.CarId, ct);
                result.Add(new
                {
                    row.CarId,
                    car.DisplayName,
                    car.Brand,
                    available = true,
                    unavailableReason = (string?)null
                });
            }
            catch (BusinessRuleException) { result.Add(new { row.CarId, displayName = row.CarId, brand = "", available = false, unavailableReason = "Không còn dữ liệu catalogue" }); }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { result.Add(new { row.CarId, displayName = row.CarId, brand = "", available = false, unavailableReason = "Catalogue chưa sẵn sàng" }); }
        }
        return result;
    }
    public async Task<object> AddFavorite(Guid user, string carId, string key, CancellationToken ct)
    {
        return await tx.Run(user, key, "favorite:add", new
        {
            carId
        }, async () => { await common.GetCar(carId, ct); await tx.Lock("favorites:" + user, ct); if (!await db.Favorites.AnyAsync(x => x.UserId == user && x.CarId == carId, ct)) { if (await db.Favorites.CountAsync(x => x.UserId == user, ct) >= 100) throw new BusinessRuleException("Tối đa 100 xe yêu thích."); db.Favorites.Add(new() { UserId = user, CarId = carId }); } return new { carId }; }, ct);
    }
    public async Task RemoveFavorite(Guid user, string carId, CancellationToken ct) => await db.Favorites.Where(x => x.UserId == user && x.CarId == carId).ExecuteDeleteAsync(ct);
}
