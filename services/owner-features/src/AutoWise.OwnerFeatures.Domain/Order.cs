namespace AutoWise.OwnerFeatures.Domain;

public sealed class BusinessRuleException(string message) : Exception(message);
public sealed class VersionConflictException() : Exception("Dữ liệu đã thay đổi. Vui lòng tải lại.");
public sealed class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public string CarId { get; set; } = "";
    public string CarName { get; set; } = "";
    public string Brand { get; set; } = "";
    public string? Variant { get; set; }
    public long DealerId { get; set; }
    public string DealerName { get; set; } = "";
    public string? SourceId { get; set; }
    public long TotalVnd { get; set; }
    public long DepositRequiredVnd { get; set; }
    public string Status { get; set; } = "pending_confirmation";
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Payment> Payments { get; set; } = [];
    public List<OrderEvent> History { get; set; } = [];
    public DateOnly? PlannedDate { get; set; }
    public DateTimeOffset? ActualHandoverAt { get; set; }
    public string? DeliveryLocation { get; set; }
    public long NetReceived => Payments.Where(p => p.Status == "confirmed").Sum(p => p.Type == "receipt" ? p.AmountVnd : -p.AmountVnd);
    public long RemainingVnd => Status == "cancelled" ? 0 : Math.Max(TotalVnd - NetReceived, 0);
    public void CheckVersion(long version) { if (Version != version) throw new VersionConflictException(); }
    public void Record(string action, string detail, string actor)
    { History.Add(new() { Action = action, Detail = detail, Actor = actor }); Version++; }
    public void Transition(string target, string reason, string actor)
    {
        var next = Status switch { "pending_confirmation" => "confirmed", "confirmed" => "preparing_vehicle", "preparing_vehicle" => "ready_for_handover", "ready_for_handover" => "completed", _ => "" };
        if (Status is "completed" or "cancelled" || (target != next && target != "cancelled")) throw new BusinessRuleException("Chuyển trạng thái không hợp lệ.");
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 500) throw new BusinessRuleException("Cần lý do cập nhật.");
        if (target == "completed" && (RemainingVnd != 0 || ActualHandoverAt == null)) throw new BusinessRuleException("Chỉ hoàn thành khi đã thanh toán đủ và ghi nhận bàn giao.");
        if (target == "cancelled" && NetReceived > 0) throw new BusinessRuleException("Hoàn lại tiền đã thu trước khi hủy đơn trong MVP.");
        var previous = Status; Status = target; Record("status", previous + " → " + target + ": " + reason, actor);
    }
    public void AddPayment(string type, long amount, string reference, Guid? receiptId, string actor)
    {
        if (Status is "cancelled" or "completed") throw new BusinessRuleException("Không thể ghi giao dịch cho trạng thái này.");
        if (type is not ("receipt" or "refund") || amount <= 0 || amount > 100_000_000_000L || string.IsNullOrWhiteSpace(reference) || reference.Length > 100) throw new BusinessRuleException("Loại, số tiền hoặc mã giao dịch không hợp lệ.");
        if (Payments.Any(p => p.Reference == reference.Trim())) throw new BusinessRuleException("Mã giao dịch đã tồn tại trên đơn.");
        if (type == "refund" && !Payments.Any(p => p.Id == receiptId && p.Type == "receipt" && p.Status == "confirmed")) throw new BusinessRuleException("Hoàn tiền cần receipt gốc đã xác nhận.");
        Payments.Add(new() { Type = type, AmountVnd = amount, Reference = reference.Trim(), OriginalReceiptId = receiptId });
        Record("payment_created", type + " / " + amount + " VND / " + reference.Trim(), actor);
    }
    public void ConfirmPayment(Guid paymentId, string actor)
    {
        var payment = Payments.SingleOrDefault(p => p.Id == paymentId) ?? throw new BusinessRuleException("Không tìm thấy giao dịch.");
        if (payment.Status != "pending") throw new BusinessRuleException("Chỉ xác nhận giao dịch pending.");
        if (Status is "cancelled" or "completed") throw new BusinessRuleException("Đơn đã hủy.");
        if (payment.Type == "receipt" && payment.AmountVnd > TotalVnd - NetReceived) throw new BusinessRuleException("Số tiền vượt số dư đơn.");
        if (payment.Type == "refund")
        {
            var original = Payments.Single(p => p.Id == payment.OriginalReceiptId);
            var refunded = Payments.Where(p => p.Type == "refund" && p.Status == "confirmed" && p.OriginalReceiptId == original.Id).Sum(p => p.AmountVnd);
            if (payment.AmountVnd > original.AmountVnd - refunded) throw new BusinessRuleException("Hoàn tiền vượt receipt gốc.");
        }
        payment.Status = "confirmed"; payment.ConfirmedAt = DateTimeOffset.UtcNow;
        Record("payment_confirmed", payment.Reference, actor);
    }
    public void FailPayment(Guid paymentId, string reason, string actor)
    {
        var payment = Payments.SingleOrDefault(p => p.Id == paymentId) ?? throw new BusinessRuleException("Không tìm thấy giao dịch.");
        if (payment.Status != "pending" || string.IsNullOrWhiteSpace(reason) || reason.Length > 500) throw new BusinessRuleException("Cần giao dịch pending và lý do.");
        payment.Status = "failed"; Record("payment_failed", payment.Reference + ": " + reason, actor);
    }
    public void Schedule(DateOnly? planned, DateTimeOffset? actual, string location, string reason, string actor)
    {
        if (Status is "cancelled" or "completed") throw new BusinessRuleException("Không sửa lịch đơn đã kết thúc.");
        if (planned == null || string.IsNullOrWhiteSpace(location) || location.Length > 200 || string.IsNullOrWhiteSpace(reason) || reason.Length > 500) throw new BusinessRuleException("Cần ngày, địa điểm và lý do.");
        if (actual != null && (Status != "ready_for_handover" || actual > DateTimeOffset.UtcNow || RemainingVnd > 0)) throw new BusinessRuleException("Bàn giao thực tế cần đơn sẵn sàng, thanh toán đủ, thời điểm không ở tương lai.");
        Record("delivery", $"{PlannedDate} → {planned}; địa điểm {location}; thực tế {actual}; {reason}", actor);
        PlannedDate = planned; ActualHandoverAt = actual?.ToUniversalTime(); DeliveryLocation = location;
    }
    public void EditDraft(long total, long deposit, string? variant, string reason, string actor)
    {
        if (Status != "pending_confirmation" || Payments.Any(p => p.Status == "confirmed")) throw new BusinessRuleException("Chỉ sửa draft chưa có thanh toán confirmed.");
        ValidateAmounts(total, deposit);
        if (variant?.Length > 150) throw new BusinessRuleException("Phiên bản tối đa 150 ký tự.");
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 500) throw new BusinessRuleException("Cần lý do sửa đơn.");
        TotalVnd = total; DepositRequiredVnd = deposit; Variant = variant;
        Record("draft_updated", $"Giá chốt {total}, cọc yêu cầu {deposit}; {reason}", actor);
    }
    public static void ValidateAmounts(long total, long deposit)
    { if (total <= 0 || total > 100_000_000_000L || deposit < 0 || deposit > total) throw new BusinessRuleException("Giá chốt/cọc không hợp lệ (tối đa 100 tỷ VND)."); }
}
public sealed class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Type { get; set; } = "receipt";
    public string Status { get; set; } = "pending";
    public long AmountVnd { get; set; }
    public string Reference { get; set; } = "";
    public Guid? OriginalReceiptId { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
}
public sealed class OrderEvent
{
    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
    public string Action { get; set; } = "";
    public string Detail { get; set; } = "";
    public string Actor { get; set; } = "";
}
