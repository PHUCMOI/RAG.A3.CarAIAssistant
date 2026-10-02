using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Api;

public static class SeedData
{
    public static async Task Run(OrdersDb db, ICommonCatalogue common, CancellationToken ct)
    {
        var hasher = new PasswordHasher<UserRecord>();
        // Deterministic IDs and one atomic, locked seed transaction. Never run in production.
        var admin = new UserRecord { Id = Guid.Parse("10000000-0000-0000-0000-000000000001"), Email = "admin@autowise.test", DisplayName = "Admin demo", Role = "Admin" };
        admin.PasswordHash = hasher.HashPassword(admin, "DemoAdmin!2026");
        var customers = Enumerable.Range(1, 6).Select(i => new UserRecord { Id = Guid.Parse($"20000000-0000-0000-0000-{i:D12}"), Email = $"customer{i}@autowise.test", DisplayName = $"Khách demo {i}" }).ToArray();
        foreach (var customer in customers) customer.PasswordHash = hasher.HashPassword(customer, "DemoCustomer!2026");
        var cars = new[] { await common.GetCar("car_34_3", ct), await common.GetCar("car_57_7", ct) };
        var dealers = new[] { await common.GetDealer(4, ct), await common.GetDealer(7, ct) };
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(82026002)", ct);
        foreach (var user in customers.Prepend(admin))
            if (!await db.Users.AnyAsync(x => x.Id == user.Id, ct)) db.Users.Add(user);
        for (var i = 1; i <= 120; i++)
        {
            var id = Guid.Parse($"30000000-0000-0000-0000-{i:D12}");
            var existing = await db.Orders.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (existing != null) {
                var old = OrderStore.Read(existing);
                // Correct only untouched demo snapshots from the first seed revision.
                if (old.DealerId is 1 or 2 && old.History.All(e => e.Actor == "seed")) {
                    var corrected = dealers[(i - 1) % 2];
                    if (old.DeliveryLocation == old.DealerName) old.DeliveryLocation = corrected.Name;
                    old.DealerId = corrected.DealerId; old.DealerName = corrected.Name;
                    old.Record("seed_catalogue_corrected", "Đại lý demo đúng hãng xe", "seed");
                    existing.Payload = System.Text.Json.JsonSerializer.Serialize(old, OrderStore.Json);
                    existing.Version = old.Version;
                }
                continue;
            }
            var car = cars[(i - 1) % 2]; var dealer = dealers[(i - 1) % 2]; var customer = customers[(i - 1) % 6];
            var created = new DateTimeOffset(2026, 5, 1, 0, 0, 0, TimeSpan.Zero).AddDays(i);
            var total = (i % 2 == 0 ? 699_000_000L : 1_039_000_000L);
            var order = new Order { Id = id, Code = $"AW-DEMO-{i:D4}", CustomerId = customer.Id, CustomerName = customer.DisplayName, CarId = car.CarId, CarName = car.DisplayName, Brand = car.Brand, SourceId = car.PriceSourceId, DealerId = dealer.DealerId, DealerName = dealer.Name, TotalVnd = total, DepositRequiredVnd = 50_000_000, CreatedAt = created };
            var kind = (i - 1) % 10;
            var status = kind switch { 0 => "pending_confirmation", 1 => "confirmed", 2 => "preparing_vehicle", 3 => "ready_for_handover", 4 => "completed", 5 => "cancelled", 6 => "cancelled", 7 => "preparing_vehicle", 8 => "confirmed", _ => "ready_for_handover" };
            order.History.Add(new() { At = created, Action = "created", Actor = "seed", Detail = "Dữ liệu giả để demo" });
            if (kind is 1 or 2 or 3 or 4 or 6 or 7 or 9)
            {
                var receipt = new Payment { Id = Guid.Parse($"40000000-0000-0000-0000-{i:D12}"), Type = "receipt", AmountVnd = kind is 3 or 4 or 9 ? total : 50_000_000, Status = "confirmed", Reference = $"DEMO-RECEIPT-{i:D4}", ConfirmedAt = created.AddDays(1) };
                order.Payments.Add(receipt);
                if (kind == 6) order.Payments.Add(new() { Type = "refund", AmountVnd = receipt.AmountVnd, Status = "confirmed", Reference = $"DEMO-REFUND-{i:D4}", OriginalReceiptId = receipt.Id, ConfirmedAt = created.AddDays(3) });
            }
            if (kind == 8) order.Payments.Add(new() { Type = "receipt", Status = "failed", AmountVnd = 50_000_000, Reference = $"DEMO-FAILED-{i:D4}" });
            var path = new[] { "confirmed", "preparing_vehicle", "ready_for_handover", "completed" };
            if (status != "pending_confirmation")
            {
                if (status == "cancelled") order.History.Add(new() { At = created.AddDays(4), Action = "status", Actor = "seed", Detail = "pending_confirmation → cancelled: khách hủy, tiền thu ròng = 0" });
                else foreach (var step in path)
                {
                    order.History.Add(new() { At = created.AddDays(order.History.Count), Action = "status", Actor = "seed", Detail = step });
                    if (step == status) break;
                }
            }
            order.Status = status;
            if (kind is 2 or 3 or 4 or 7 or 9)
            {
                order.PlannedDate = DateOnly.FromDateTime(created.AddDays(14).UtcDateTime);
                order.DeliveryLocation = dealer.Name;
                order.History.Add(new() { At = created.AddDays(2), Action = "delivery", Actor = "seed", Detail = "Lịch dự kiến " + order.PlannedDate });
            }
            if (kind == 4)
            {
                order.ActualHandoverAt = created.AddDays(14);
                order.History.Last(e => e.Action == "status").At = order.ActualHandoverAt.Value;
                order.History.Add(new() { At = order.ActualHandoverAt.Value, Action = "delivery_actual", Actor = "seed", Detail = "Đã bàn giao thực tế" });
            }
            foreach (var payment in order.Payments)
                order.History.Add(new() { At = payment.ConfirmedAt ?? created.AddDays(1), Action = "payment_" + payment.Status, Actor = "seed", Detail = payment.Reference + " / " + payment.AmountVnd + " VND" });
            order.History = order.History.OrderBy(e => e.At).ToList();
            order.Version = order.History.Count + 1;
            db.Orders.Add(OrderStore.Row(order));
            foreach (var payment in order.Payments) db.PaymentReferences.Add(new() { Reference = payment.Reference, OrderId = id });
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
