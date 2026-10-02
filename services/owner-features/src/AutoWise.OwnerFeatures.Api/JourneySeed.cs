using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using AutoWise.OwnerFeatures.Infrastructure;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Api;

public static class JourneySeed
{
    public static async Task Run(OrdersDb db, ICommonCatalogue common, CancellationToken ct)
    {
        var car = await common.GetCar("car_34_3", ct);
        var dealer = await common.GetDealer(4, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(82026003)", ct);
        var customer = Guid.Parse("20000000-0000-0000-0000-000000000001");
        var admin = Guid.Parse("10000000-0000-0000-0000-000000000001");
        for (var i = 1; i <= 5; i++)
        {
            var id = Guid.Parse($"50000000-0000-0000-0000-{i:D12}");
            if (await db.Purchases.AnyAsync(x => x.Id == id, ct))
                continue;
            var state = new[] { "submitted", "in_consultation", "converted", "rejected", "withdrawn" }[i - 1];
            var data = new PurchaseRequest { CarId = car.CarId, CarName = car.DisplayName, Brand = car.Brand, SourceId = car.PriceSourceId, DealerId = dealer.DealerId, DealerName = dealer.Name, CustomerName = "Khách demo 1", Email = "customer1@autowise.test", Phone = "+84901234567", ContactMethod = "phone", Notes = "Yêu cầu giả để kiểm thử" };
            data.Event("submitted", "Seed demo", "seed");
            var row = new PurchaseRecord { Id = id, Code = $"PR-DEMO-{i:D4}", CustomerId = customer, Status = state, AssignedAdminId = state is "in_consultation" or "converted" ? admin : null };
            if (state == "converted")
            {
                var oid = Guid.Parse("51000000-0000-0000-0000-000000000001");
                if (!await db.Orders.AnyAsync(x => x.Id == oid, ct))
                {
                    var o = new Order { Id = oid, Code = "AW-REQUEST-DEMO-0001", CustomerId = customer, CustomerName = data.CustomerName, CarId = car.CarId, CarName = car.DisplayName, Brand = car.Brand, DealerId = dealer.DealerId, DealerName = dealer.Name, TotalVnd = 1_039_000_000, DepositRequiredVnd = 50_000_000 };
                    o.Record("created", "Đơn giả từ yêu cầu demo", "seed");
                    db.Orders.Add(OrderStore.Row(o));
                }
                row.OrderId = oid;
            }
            if (state != "submitted")
                data.Event(state, "Trạng thái demo " + state, "seed");
            row.Payload = JourneyTransactions.Pack(data);
            db.Purchases.Add(row);
        }
        for (var i = 1; i <= 4; i++)
        {
            var id = Guid.Parse($"60000000-0000-0000-0000-{i:D12}");
            if (!await db.Slots.AnyAsync(x => x.Id == id, ct))
            {
                var start = DateTimeOffset.UtcNow.Date.AddDays(7 + i).AddHours(3);
                db.Slots.Add(new()
                {
                    Id = id,
                    DealerId = dealer.DealerId,
                    DealerName = dealer.Name,
                    StaffName = "Tư vấn viên demo",
                    StartsAt = new(start, TimeSpan.Zero),
                    EndsAt = new(start.AddHours(1), TimeSpan.Zero)
                });
            }
        }
        var notificationId = Guid.Parse("70000000-0000-0000-0000-000000000001");
        if (!await db.Notifications.AnyAsync(x => x.Id == notificationId, ct))
            db.Notifications.Add(new()
            {
                Id = notificationId,
                UserId = customer,
                EventKey = "journey:demo",
                Title = "Bạn có thể gửi yêu cầu mua xe từ tài khoản",
                DetailUrl = "/account/purchase-requests"
            });
        await db.SaveChangesAsync(ct);
        var appointmentId = Guid.Parse("61000000-0000-0000-0000-000000000001");
        var slotId = Guid.Parse("60000000-0000-0000-0000-000000000001");
        if (!await db.Appointments.AnyAsync(x => x.Id == appointmentId, ct) && !await db.Appointments.AnyAsync(x => x.SlotId == slotId && (x.Status == "requested" || x.Status == "proposed" || x.Status == "confirmed"), ct))
        {
            var payload = new AppointmentData { CarId = car.CarId, CarName = car.DisplayName, DealerId = dealer.DealerId, DealerName = dealer.Name, Phone = "+84901234567", Kind = "consultation", Notes = "Lịch tư vấn giả để kiểm thử" };
            payload.History.Add(new()
            {
                Action = "requested",
                Detail = "Lịch demo chờ đại lý xác nhận",
                Actor = "seed"
            });
            db.Appointments.Add(new()
            {
                Id = appointmentId,
                CustomerId = customer,
                SlotId = slotId,
                Payload = JourneyTransactions.Pack(payload)
            });
        }
        var changeId = Guid.Parse("62000000-0000-0000-0000-000000000001");
        var orderId = Guid.Parse("51000000-0000-0000-0000-000000000001");
        if (!await db.Changes.AnyAsync(x => x.Id == changeId, ct) && !await db.Changes.AnyAsync(x => x.OrderId == orderId && x.Status == "pending", ct))
            db.Changes.Add(new()
            {
                Id = changeId,
                CustomerId = customer,
                OrderId = orderId,
                Type = "change",
                Reason = "Muốn trao đổi lại phiên bản xe (demo)"
            });
        // Favorites are user-controlled; do not recreate a favorite removed by the customer on restart.
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }
}
