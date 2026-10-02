using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
namespace AutoWise.OwnerFeatures.Infrastructure;

public record AppointmentView(Guid Id, Guid CustomerId, string Status, long Version, DateTimeOffset CreatedAt, SlotRecord Slot, AppointmentData Details);
public sealed class AppointmentStore(OrdersDb db, ICommonCatalogue common, JourneyTransactions tx)
{
    async Task<AppointmentView> View(AppointmentRecord r, CancellationToken ct) => new(r.Id, r.CustomerId, r.Status, r.Version, r.CreatedAt, await db.Slots.AsNoTracking().SingleAsync(s => s.Id == r.SlotId, ct), JourneyTransactions.Unpack<AppointmentData>(r.Payload));
    public async Task<Page<AppointmentView>> List(Guid? user, int page, int size, CancellationToken ct)
    {
        JourneyQueries.Paging(page, size);
        var q = db.Appointments.AsNoTracking().AsQueryable();
        if (user != null)
            q = q.Where(x => x.CustomerId == user);
        var count = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToListAsync(ct);
        var result = new List<AppointmentView>();
        foreach (var r in rows)
            result.Add(await View(r, ct));
        return new(result, page, size, count);
    }
    public async Task<object> Slots(long? dealer, bool admin, CancellationToken ct)
    {
        var q = db.Slots.AsNoTracking().Where(x => x.StartsAt > DateTimeOffset.UtcNow);
        if (dealer != null)
            q = q.Where(x => x.DealerId == dealer);
        if (!admin)
            q = q.Where(s => !db.Appointments.Any(a => a.SlotId == s.Id && (a.Status == "requested" || a.Status == "proposed" || a.Status == "confirmed")));
        return await q.OrderBy(x => x.StartsAt).Take(100).ToListAsync(ct);
    }
    public async Task<SlotRecord> CreateSlot(Guid actor, SlotInput input, string key, CancellationToken ct)
    {
        var dealer = await common.GetDealer(input.DealerId, ct);
        var staff = CustomerRules.Name(input.StaffName);
        if (input.StartsAt <= DateTimeOffset.UtcNow || input.EndsAt <= input.StartsAt || input.EndsAt - input.StartsAt > TimeSpan.FromHours(4))
            throw new BusinessRuleException("Khung giờ phải ở tương lai, dài tối đa 4 giờ.");
        return await tx.Run(actor, key, "slot:create", input, async () => { await tx.Lock("slot:" + input.DealerId, ct); if (await db.Slots.AnyAsync(s => s.DealerId == input.DealerId && s.StaffName == staff && s.StartsAt < input.EndsAt && s.EndsAt > input.StartsAt, ct)) throw new BusinessRuleException("Nhân viên đã có khung giờ trùng."); var row = new SlotRecord { DealerId = dealer.DealerId, DealerName = dealer.Name, StaffName = staff, StartsAt = input.StartsAt.ToUniversalTime(), EndsAt = input.EndsAt.ToUniversalTime() }; db.Slots.Add(row); return row; }, ct);
    }
    async Task<SlotRecord> LockSlot(Guid id, CancellationToken ct) => await db.Slots.FromSqlInterpolated($"SELECT * FROM orders_service.appointment_slots WHERE \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw new KeyNotFoundException();
    async Task Available(SlotRecord slot, Guid user, Guid? exclude, CancellationToken ct)
    {
        if (slot.StartsAt <= DateTimeOffset.UtcNow)
            throw new BusinessRuleException("Khung giờ đã qua.");
        if (await db.Appointments.AnyAsync(a => a.SlotId == slot.Id && a.Id != exclude && (a.Status == "requested" || a.Status == "proposed" || a.Status == "confirmed"), ct))
            throw new BusinessRuleException("Khung giờ đã được đặt.");
        if (await db.Appointments.Join(db.Slots, a => a.SlotId, s => s.Id, (a, s) => new { a, s }).AnyAsync(x => x.a.CustomerId == user && x.a.Id != exclude && (x.a.Status == "requested" || x.a.Status == "proposed" || x.a.Status == "confirmed") && x.s.StartsAt < slot.EndsAt && x.s.EndsAt > slot.StartsAt, ct))
            throw new BusinessRuleException("Bạn đã có lịch hẹn trùng thời gian.");
    }
    public async Task<AppointmentView> Create(Guid user, AppointmentInput input, string key, CancellationToken ct)
    {
        var phone = CustomerRules.Phone(input.Phone, true)!;
        if (input.Kind is not ("consultation" or "test_drive") || input.Notes?.Length > 1000)
            throw new BusinessRuleException("Loại lịch/ghi chú không hợp lệ.");
        var car = await common.GetCar(input.CarId, ct);
        var slotSnapshot = await db.Slots.AsNoTracking().SingleOrDefaultAsync(x => x.Id == input.SlotId, ct) ?? throw new KeyNotFoundException();
        var dealer = await common.GetDealer(slotSnapshot.DealerId, ct);
        if (!dealer.SupportedBrands.Contains(car.Brand, StringComparer.OrdinalIgnoreCase))
            throw new BusinessRuleException("Đại lý không hỗ trợ hãng xe.");
        return await tx.Run(user, key, "appointment:create", input, async () => { await tx.Lock("appointments:user:" + user, ct); var slot = await LockSlot(input.SlotId, ct); await Available(slot, user, null, ct); var data = new AppointmentData { CarId = car.CarId, CarName = car.DisplayName, DealerId = dealer.DealerId, DealerName = dealer.Name, Phone = phone, Kind = input.Kind, Notes = input.Notes?.Trim() ?? "" }; data.History.Add(new() { Action = "requested", Detail = "Khách yêu cầu lịch; chờ đại lý xác nhận", Actor = user.ToString() }); var row = new AppointmentRecord { CustomerId = user, SlotId = slot.Id, Payload = JourneyTransactions.Pack(data) }; db.Appointments.Add(row); return await View(row, ct); }, ct);
    }
    public Task<AppointmentView> Act(Guid id, Guid actor, bool admin, AppointmentAction input, string key, CancellationToken ct) => tx.Run(actor, key, "appointment:" + input.Action + ":" + id, input, async () =>
    {
        var row = await db.Appointments.FromSqlInterpolated($"SELECT * FROM orders_service.appointments WHERE \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync(x => admin || x.CustomerId == actor, ct) ?? throw new KeyNotFoundException();
        CustomerRules.Version(row.Version, input.Version);
        if (row.Status is "cancelled" or "rejected")
            throw new BusinessRuleException("Lịch đã kết thúc.");
        await tx.Lock("appointments:user:" + row.CustomerId, ct);
        var reason = CustomerRules.Text(input.Reason);
        var data = JourneyTransactions.Unpack<AppointmentData>(row.Payload);
        if (admin && input.Action == "propose" && row.Status is "requested" or "proposed")
        {
            if (input.SlotId == null)
                throw new BusinessRuleException("Cần khung giờ thay thế.");
            var replacement = await LockSlot(input.SlotId.Value, ct);
            if (replacement.DealerId != data.DealerId)
                throw new BusinessRuleException("Lịch thay thế phải cùng đại lý.");
            await Available(replacement, row.CustomerId, id, ct);
            row.SlotId = replacement.Id;
            row.Status = "proposed";
        }
        else if (admin && input.Action == "confirm" && row.Status == "requested")
        {
            var slot = await LockSlot(row.SlotId, ct);
            await Available(slot, row.CustomerId, id, ct);
            row.Status = "confirmed";
        }
        else if (!admin && input.Action == "accept" && row.Status == "proposed")
        {
            var slot = await LockSlot(row.SlotId, ct);
            await Available(slot, row.CustomerId, id, ct);
            row.Status = "confirmed";
        }
        else if (admin && input.Action == "reject" && row.Status is "requested" or "proposed")
            row.Status = "rejected";
        else if (input.Action == "cancel")
        {
            var slot = await LockSlot(row.SlotId, ct);
            if (slot.StartsAt <= DateTimeOffset.UtcNow)
                throw new BusinessRuleException("Không hủy lịch đã bắt đầu.");
            row.Status = "cancelled";
        }
        else
            throw new BusinessRuleException("Hành động lịch hẹn không hợp lệ.");
        data.History.Add(new()
        {
            Action = input.Action,
            Detail = reason,
            Actor = actor.ToString()
        });
        row.Payload = JourneyTransactions.Pack(data);
        row.Version++;
        if (admin)
            tx.Notify(row.CustomerId, "appointment:" + id + ":" + row.Version, "Lịch hẹn: " + reason, "/account/appointments");
        return await View(row, ct);
    }, ct);
}
