using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed class OrderStore(OrdersDb db, ICommonCatalogue common)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static Order Read(OrderRecord row) => JsonSerializer.Deserialize<Order>(row.Payload, Json)!;
    public static OrderRecord Row(Order order) => new() { Id = order.Id, Code = order.Code, CustomerId = order.CustomerId, CreatedAt = order.CreatedAt, Status = order.Status, Version = order.Version, Payload = JsonSerializer.Serialize(order, Json) };
    public async Task<Page<Order>> List(Guid? customer, string? status, string? query, int page, int pageSize, bool delayed, CancellationToken ct)
    {
        if (page < 1 || page > 100000 || pageSize < 1 || pageSize > 100) throw new BusinessRuleException("Pagination không hợp lệ.");
        var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).Date);
        var rows = delayed
            ? db.Orders.FromSqlInterpolated($"SELECT * FROM orders_service.orders WHERE \"Status\" NOT IN ('completed','cancelled') AND (\"Payload\"->>'plannedDate')::date < {today}").AsNoTracking()
            : db.Orders.AsNoTracking().AsQueryable();
        if (customer != null) rows = rows.Where(x => x.CustomerId == customer);
        if (!string.IsNullOrWhiteSpace(status)) rows = rows.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(query)) rows = rows.Where(x => x.Code.Contains(query));
        var count = await rows.CountAsync(ct);
        var data = await rows.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new(data.Select(Read).ToList(), page, pageSize, count);
    }
    public async Task<Order?> Get(Guid id, Guid? customer, CancellationToken ct)
    {
        var row = await db.Orders.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (customer == null || x.CustomerId == customer), ct);
        return row == null ? null : Read(row);
    }
    public async Task<Order> Create(CreateOrderRequest request, string actor, string key, CancellationToken ct)
    {
        Order.ValidateAmounts(request.TotalVnd, request.DepositRequiredVnd);
        if (string.IsNullOrWhiteSpace(request.CarId) || request.CarId.Length > 100 || request.Variant?.Length > 150) throw new BusinessRuleException("Xe hoặc phiên bản không hợp lệ.");
        var customer = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.CustomerId && x.Role == "Customer", ct) ?? throw new BusinessRuleException("Khách hàng không tồn tại.");
        var car = await common.GetCar(request.CarId, ct);
        var dealer = await common.GetDealer(request.DealerId, ct);
        if (!dealer.SupportedBrands.Contains(car.Brand, StringComparer.OrdinalIgnoreCase)) throw new BusinessRuleException("Đại lý không hỗ trợ hãng xe đã chọn.");
        return await Idempotent(actor, key, request, "create", () =>
        {
            var order = new Order { CustomerId = customer.Id, CustomerName = customer.DisplayName, CarId = car.CarId, CarName = car.DisplayName, Brand = car.Brand, SourceId = car.PriceSourceId, DealerId = dealer.DealerId, DealerName = dealer.Name, TotalVnd = request.TotalVnd, DepositRequiredVnd = request.DepositRequiredVnd, Variant = request.Variant };
            order.Code = "AW-" + order.Id.ToString("N")[..12].ToUpperInvariant();
            order.Record("created", "Đơn mới; giá chốt " + order.TotalVnd, actor);
            db.Orders.Add(Row(order)); Notify(order,"Đơn mua xe mới được tạo"); return Task.FromResult(order);
        }, ct);
    }
    public Task<Order> Mutate<T>(Guid id, long version, T request, string actor, string key, string action, Action<Order> mutation, CancellationToken ct) =>
        Idempotent(actor, key, request, action + ":" + id, async () =>
        {
            var row = await db.Orders.FromSqlInterpolated($"SELECT * FROM orders_service.orders WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw new KeyNotFoundException();
            var order = Read(row); order.CheckVersion(version); mutation(order);
            row.Payload = JsonSerializer.Serialize(order, Json); row.Status = order.Status; row.Version = order.Version;
            Notify(order,"Đơn đã cập nhật: "+order.History.Last().Detail);
            foreach (var payment in order.Payments)
                if (!await db.PaymentReferences.AnyAsync(p => p.Reference == payment.Reference, ct)) db.PaymentReferences.Add(new() { Reference = payment.Reference, OrderId = id });
                else if (await db.PaymentReferences.AnyAsync(p => p.Reference == payment.Reference && p.OrderId != id, ct)) throw new BusinessRuleException("Mã giao dịch đã dùng trên đơn khác.");
            return order;
        }, ct);
    void Notify(Order o,string title)=>db.Notifications.Add(new(){UserId=o.CustomerId,EventKey="order:"+o.Id+":"+o.Version,Title=title,DetailUrl="/account/orders/"+o.Id});
    private async Task<Order> Idempotent<T>(string actor, string key, T request, string action, Func<Task<Order>> work, CancellationToken ct)
    {
        if (key.Length < 8 || key.Length > 100) throw new BusinessRuleException("Cần Idempotency-Key dài 8–100 ký tự.");
        var composite = actor + ":" + key;
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(action + JsonSerializer.Serialize(request, Json))));
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({composite}, 0))", ct);
        var existing = await db.Requests.AsNoTracking().SingleOrDefaultAsync(x => x.Key == composite, ct);
        if (existing != null)
        {
            if (existing.Hash != hash) throw new VersionConflictException();
            return JsonSerializer.Deserialize<Order>(existing.Response, Json)!;
        }
        var order = await work();
        db.Requests.Add(new() { Key = composite, Hash = hash, Response = JsonSerializer.Serialize(order, Json) });
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return order;
    }
}
