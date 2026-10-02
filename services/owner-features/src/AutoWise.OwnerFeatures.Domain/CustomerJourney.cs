using System.Text.RegularExpressions;
namespace AutoWise.OwnerFeatures.Domain;

public static class CustomerRules
{
    public static string Name(string? value)
    {
        value = value?.Trim();
        if (string.IsNullOrEmpty(value) || value.Length > 100)
            throw new BusinessRuleException("Tên cần 1–100 ký tự.");
        return value;
    }
    public static string? Phone(string? value, bool required = false)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            if (required)
                throw new BusinessRuleException("Cần số điện thoại liên hệ.");
            return null;
        }
        value = Regex.Replace(value.Trim(), @"[\s().-]", "");
        if (Regex.IsMatch(value, @"^0[35789]\d{8}$"))
            value = "+84" + value[1..];
        if (!Regex.IsMatch(value, @"^\+[1-9]\d{7,14}$"))
            throw new BusinessRuleException("Điện thoại cần số Việt Nam hoặc dạng quốc tế +country.");
        return value;
    }
    public static string Text(string? value, int max = 1000)
    {
        value = value?.Trim();
        if (string.IsNullOrEmpty(value) || value.Length > max)
            throw new BusinessRuleException($"Nội dung cần 1–{max} ký tự.");
        return value;
    }
    public static void Version(long actual, long expected)
    {
        if (actual != expected)
            throw new VersionConflictException();
    }
    public static void ActiveOrder(Order order)
    {
        if (order.Status is "completed" or "cancelled")
            throw new BusinessRuleException("Chỉ nhận đề nghị cho đơn đang hoạt động.");
    }
}
public sealed class PurchaseRequest
{
    public string CarId { get; set; } = ""; public string CarName { get; set; } = ""; public string Brand { get; set; } = ""; public string? SourceId
    {
        get; set;
    }
    public long DealerId
    {
        get; set;
    }
    public string DealerName { get; set; } = ""; public string? Variant
    {
        get; set;
    }
    public string CustomerName { get; set; } = ""; public string Email { get; set; } = ""; public string Phone { get; set; } = ""; public string ContactMethod { get; set; } = "phone"; public string Notes { get; set; } = "";
    public List<OrderEvent> History { get; set; } = [];
    public void Event(string action, string detail, string actor) => History.Add(new() { Action = action, Detail = detail, Actor = actor });
    public static void Transition(string from, string action)
    {
        if (!((from == "submitted" && action is "accept" or "reject" or "withdraw") || (from == "in_consultation" && action is "reject" or "convert" or "response")))
            throw new BusinessRuleException("Hành động không hợp lệ ở trạng thái hiện tại.");
    }
}
public sealed class AppointmentData
{
    public string CarId { get; set; } = ""; public string CarName { get; set; } = ""; public long DealerId
    {
        get; set;
    }
    public string DealerName { get; set; } = ""; public string Kind { get; set; } = "consultation"; public string Phone { get; set; } = ""; public string Notes { get; set; } = ""; public List<OrderEvent> History { get; set; } = [];
}
