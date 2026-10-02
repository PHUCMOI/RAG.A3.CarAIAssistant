using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public record PurchaseView(Guid Id, string Code, Guid CustomerId, string Status, long Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, Guid? AssignedAdminId, Guid? OrderId, PurchaseRequest Details);
public sealed class PurchaseStore(OrdersDb db, ICommonCatalogue common, JourneyTransactions tx)
{
    public static PurchaseView View(PurchaseRecord r) => new(r.Id, r.Code, r.CustomerId, r.Status, r.Version, r.CreatedAt, r.UpdatedAt, r.AssignedAdminId, r.OrderId, JourneyTransactions.Unpack<PurchaseRequest>(r.Payload));
    public async Task<Page<PurchaseView>> List(Guid? user, string? status, string? query, int page, int size, CancellationToken ct)
    {
        JourneyQueries.Paging(page, size);
        var q = db.Purchases.AsNoTracking().AsQueryable();
        if (user != null)
            q = q.Where(x => x.CustomerId == user);
        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(query))
            q = q.Where(x => x.Code.Contains(query));
        var count = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(rows.Select(View).ToList(), page, size, count);
    }
    public async Task<PurchaseView> Get(Guid id, Guid? user, CancellationToken ct) => View(await db.Purchases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (user == null || x.CustomerId == user), ct) ?? throw new KeyNotFoundException());
    async Task<PurchaseRequest> Snapshot(Guid user, PurchaseInput input, CancellationToken ct)
    {
        var phone = CustomerRules.Phone(input.Phone, true)!;
        if (input.ContactMethod is not ("phone" or "email") || input.Variant?.Length > 150 || input.Notes?.Length > 1000)
            throw new BusinessRuleException("Liên hệ/phiên bản/ghi chú không hợp lệ.");
        var customer = await db.Users.AsNoTracking().SingleAsync(x => x.Id == user, ct);
        var car = await common.GetCar(input.CarId, ct);
        var dealer = await common.GetDealer(input.DealerId, ct);
        if (!dealer.SupportedBrands.Contains(car.Brand, StringComparer.OrdinalIgnoreCase))
            throw new BusinessRuleException("Đại lý không hỗ trợ hãng xe.");
        return new()
        {
            CarId = car.CarId,
            CarName = car.DisplayName,
            Brand = car.Brand,
            SourceId = car.PriceSourceId,
            DealerId = dealer.DealerId,
            DealerName = dealer.Name,
            Variant = input.Variant?.Trim(),
            Phone = phone,
            CustomerName = customer.DisplayName,
            Email = customer.Email,
            ContactMethod = input.ContactMethod,
            Notes = input.Notes?.Trim() ?? ""
        };
    }
    public async Task<PurchaseView> Create(Guid user, PurchaseInput input, string key, CancellationToken ct)
    {
        return await tx.Run(user, key, "purchase:create", input, async () => { var data = await Snapshot(user, input, ct); var row = new PurchaseRecord { CustomerId = user }; row.Code = "PR-" + row.Id.ToString("N")[..12].ToUpperInvariant(); data.Event("submitted", "Khách gửi yêu cầu mua xe", user.ToString()); row.Payload = JourneyTransactions.Pack(data); db.Purchases.Add(row); return View(row); }, ct);
    }
    public async Task<PurchaseView> Edit(Guid id, Guid user, PurchaseInput input, string key, CancellationToken ct)
    {
        await Get(id, user, ct);
        return await tx.Run(user, key, "purchase:edit:" + id, input, async () => { var data = await Snapshot(user, input, ct); var row = await Locked(id, user, ct); CustomerRules.Version(row.Version, input.Version); if (row.Status != "submitted") throw new BusinessRuleException("Chỉ sửa yêu cầu chưa được tiếp nhận."); var old = JourneyTransactions.Unpack<PurchaseRequest>(row.Payload); data.History = old.History; data.Event("edited", "Khách cập nhật yêu cầu", user.ToString()); Save(row, data); return View(row); }, ct);
    }
    async Task<PurchaseRecord> Locked(Guid id, Guid? user, CancellationToken ct) => await db.Purchases.FromSqlInterpolated($"SELECT * FROM orders_service.purchase_requests WHERE \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync(x => user == null || x.CustomerId == user, ct) ?? throw new KeyNotFoundException();
    static void Save(PurchaseRecord row, PurchaseRequest data)
    {
        row.Version++;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        row.Payload = JourneyTransactions.Pack(data);
    }
    public Task<PurchaseView> Act(Guid id, Guid actor, bool admin, string action, JourneyAction input, string key, CancellationToken ct) => tx.Run(actor, key, "purchase:" + action + ":" + id, input, async () =>
    {
        var row = await Locked(id, admin ? null : actor, ct);
        CustomerRules.Version(row.Version, input.Version);
        PurchaseRequest.Transition(row.Status, action);
        if (!admin && action != "withdraw")
            throw new BusinessRuleException("Hành động không được phép.");
        var data = JourneyTransactions.Unpack<PurchaseRequest>(row.Payload);
        var reason = action == "accept" ? "Admin tiếp nhận tư vấn" : CustomerRules.Text(input.Reason);
        if (action == "convert")
        {
            Order.ValidateAmounts(input.TotalVnd, input.DepositRequiredVnd);
            if (input.Variant?.Length > 150)
                throw new BusinessRuleException("Phiên bản tối đa 150 ký tự.");
            var order = new Order { CustomerId = row.CustomerId, CustomerName = data.CustomerName, CarId = data.CarId, CarName = data.CarName, Brand = data.Brand, SourceId = data.SourceId, DealerId = data.DealerId, DealerName = data.DealerName, Variant = input.Variant?.Trim(), TotalVnd = input.TotalVnd, DepositRequiredVnd = input.DepositRequiredVnd };
            order.Code = "AW-" + order.Id.ToString("N")[..12].ToUpperInvariant();
            order.Record("created", "Tạo từ " + row.Code + ": " + reason, actor.ToString());
            db.Orders.Add(OrderStore.Row(order));
            row.OrderId = order.Id;
            row.Status = "converted";
        }
        else if (action == "accept")
        {
            row.Status = "in_consultation";
            row.AssignedAdminId = actor;
        }
        else if (action == "reject")
            row.Status = "rejected";
        else if (action == "withdraw")
            row.Status = "withdrawn";
        data.Event(action, reason, actor.ToString());
        Save(row, data);
        if (admin)
            tx.Notify(row.CustomerId, "purchase:" + id + ":" + row.Version, row.Code + ": " + reason, "/account/purchase-requests/" + id);
        return View(row);
    }, ct);
}
public static class JourneyQueries
{
    public static void Paging(int page, int size)
    {
        if (page < 1 || page > 100000 || size < 1 || size > 100)
            throw new BusinessRuleException("Pagination không hợp lệ.");
    }
}
