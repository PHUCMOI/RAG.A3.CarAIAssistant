using System.Text.Json;
using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;

namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed record AdminChatInput(string Question, string Scope = "overview", string? Query = null, string? Status = null, bool Delayed = false, DateOnly? DateFrom = null, DateOnly? DateTo = null);
public sealed record AdminChatLink(string Title, string Path);
public sealed record AdminChatReply(string Answer, bool Grounded, string Status, DateTimeOffset RetrievedAt, object Data, List<AdminChatLink> Links);

// Queries are fixed authenticated tools. The language model receives results, never SQL or credentials.
public sealed class AdminAssistant(OrdersDb db, OrderStore orders, NaturalAnswers answers)
{
    public static readonly Dictionary<string, string> StatusLabels = new()
    {
        ["pending_confirmation"] = "Chờ xác nhận", ["confirmed"] = "Đã xác nhận",
        ["preparing_vehicle"] = "Đang chuẩn bị xe", ["ready_for_handover"] = "Chờ bàn giao",
        ["completed"] = "Hoàn thành", ["cancelled"] = "Đã hủy"
    };

    public static void Validate(AdminChatInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Question) || input.Question.Length > 2000 || input.Query?.Length > 100
            || input.Scope is not ("overview" or "orders" or "customers" or "support" or "revenue")
            || (input.Status is not null and not "" && !StatusLabels.ContainsKey(input.Status)))
            throw new BusinessRuleException("Câu hỏi hoặc bộ lọc không hợp lệ.");
    }

    public async Task<AdminChatReply> Send(Guid actor, AdminChatInput input, CancellationToken ct)
    {
        Validate(input);
        if (!await db.Users.AsNoTracking().AnyAsync(x => x.Id == actor && x.Role == "Admin", ct))
            throw new BusinessRuleException("Chỉ quản trị viên được dùng trợ lý quản trị.");
        var at = DateTimeOffset.UtcNow;
        var query = input.Query?.Trim() ?? "";
        var code = Regex.Match(input.Question, @"\bAW-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b", RegexOptions.IgnoreCase);
        var scope = code.Success && query == "" ? "orders" : input.Scope;
        var financial = System.Text.RegularExpressions.Regex.IsMatch(AutoWise.OwnerFeatures.Application.AssistantIntent.Normalize(input.Question), @"doanh thu|revenue|thu rong|thu thuan|tong.*(?:tien thu|hoan tien)");
        var normalizedQuestion = AutoWise.OwnerFeatures.Application.AssistantIntent.Normalize(input.Question);
        financial |= normalizedQuestion.Contains("thong ke") && (input.DateFrom.HasValue || System.Text.RegularExpressions.Regex.IsMatch(normalizedQuestion, @"hom nay|hom qua|thang|nam|quy|tuan"));
        if (input.Scope == "overview" && financial) scope = "revenue";
        if (code.Success && query == "") query = code.Value.ToUpperInvariant();
        if (query.Length > 100) throw new BusinessRuleException("Mã tra cứu quá dài.");
        object data;
        List<AdminChatLink> links = [];
        if (scope == "revenue")
        {
            var period = AdminFinance.Period(input, at);
            var start = new DateTimeOffset(period.From.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)).ToUniversalTime();
            var end = new DateTimeOffset(period.To.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)).ToUniversalTime();
            var createdOrders = db.Orders.Where(x => x.CreatedAt >= start && x.CreatedAt < end);
            data = new { scope, period.From, period.To, timezone = "UTC+7", totals = await AdminFinance.Read(db, period, ct),
                createdOrdersByCurrentStatus = await createdOrders.GroupBy(x => x.Status).Select(g => new { status = g.Key, count = g.Count() }).ToListAsync(ct),
                newCustomers = await db.Users.CountAsync(x => x.Role == "Customer" && x.CreatedAt >= start && x.CreatedAt < end && !x.CreatedAtEstimated, ct),
                statusLabels = StatusLabels,
                statisticsQualifier = "Trạng thái đơn là trạng thái hiện tại của các đơn tạo trong kỳ; không phải lịch sử chuyển trạng thái. Khách mới chỉ tính ngày tạo chính xác, loại ngày ước tính.",
                qualifier = AdminFinance.Definition, filterRule = "Chỉ lọc ngày, không lọc mã đơn/trạng thái/khách. Nếu chưa chọn ngày, hiểu hôm nay/hôm qua/tháng trước/năm nay, còn lại mặc định từ đầu tháng đến hôm nay. Chọn khoảng ngày cụ thể nếu câu hỏi đề cập kỳ khác." };
            links.Add(new("Kiểm tra đơn hàng", "/admin/orders"));
        }
        else if (scope == "orders")
        {
            var page = await orders.List(null, input.Status, query, 1, 20, input.Delayed, ct);
            data = new { scope, query, input.Status, input.Delayed, page.TotalCount, displayedCount = page.Items.Count,
                limit = 20, items = page.Items.Select(ProjectOrder).ToList(),
                qualifier = "Chỉ hiển thị tối đa 20 đơn mới nhất khớp bộ lọc. Tiền thu là thu đã xác nhận trừ hoàn đã xác nhận, không phải doanh thu kế toán." };
            links.Add(new("Danh sách đơn khớp bộ lọc", $"/admin/orders?query={Uri.EscapeDataString(query)}&status={Uri.EscapeDataString(input.Status ?? "")}&delayed={input.Delayed.ToString().ToLowerInvariant()}"));
            links.AddRange(page.Items.Select(o => new AdminChatLink(o.Code, $"/admin/orders/{o.Id}")));
        }
        else if (scope == "customers")
        {
            var rows = db.Users.AsNoTracking().Where(x => x.Role == "Customer");
            if (query != "") rows = rows.Where(x => x.DisplayName.Contains(query) || x.Email.Contains(query));
            data = new { scope, query, totalCount = await rows.CountAsync(ct), limit = 20,
                items = await rows.OrderBy(x => x.DisplayName).ThenBy(x => x.Id).Take(20)
                    .Select(x => new { x.DisplayName, x.Email, orderCount = db.Orders.Count(o => o.CustomerId == x.Id) }).ToListAsync(ct),
                qualifier = "Tìm tên hoặc email chứa chính xác chuỗi lọc; tối đa 20 khách. Không cung cấp mật khẩu hay thông tin bảo mật." };
            links.Add(new("Khách hàng", "/admin/customers"));
        }
        else if (scope == "support")
        {
            var rows = db.SupportTickets.AsNoTracking();
            if (query != "") rows = rows.Where(x => x.Code.Contains(query) || x.Subject.Contains(query));
            var items = await rows.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).Take(20)
                .Select(x => new { x.Id, x.Code, x.Subject, x.Status, x.UpdatedAt }).ToListAsync(ct);
            data = new { scope, query, totalCount = await rows.CountAsync(ct), limit = 20, items,
                qualifier = "Tối đa 20 phiếu cập nhật gần nhất; không đọc nội dung phản hồi và ghi chú nội bộ." };
            links.Add(new("Phiếu hỗ trợ", "/admin/support-tickets"));
            links.AddRange(items.Select(x => new AdminChatLink(x.Code, $"/admin/support-tickets/{x.Id}")));
        }
        else
        {
            data = new { scope, totalOrders = await db.Orders.CountAsync(ct),
                ordersByStatus = await db.Orders.GroupBy(x => x.Status).Select(g => new { status = g.Key, count = g.Count() }).ToListAsync(ct),
                statusLabels = StatusLabels, totalCustomers = await db.Users.CountAsync(x => x.Role == "Customer", ct),
                supportByStatus = await db.SupportTickets.GroupBy(x => x.Status).Select(g => new { status = g.Key, count = g.Count() }).ToListAsync(ct),
                qualifier = "Thống kê toàn bộ dữ liệu hiện tại, không lọc khoảng ngày. Không có số liệu doanh thu trong công cụ này." };
            links.Add(new("Đơn hàng", "/admin/orders"));
            links.Add(new("Khách hàng", "/admin/customers"));
            links.Add(new("Phiếu hỗ trợ", "/admin/support-tickets"));
        }
        var result = await answers.ComposeGrounded(input.Question, new {
            audience = "admin", actionExecuted = false, retrievedAt = at,
            requiredQualifiers = scope == "revenue" ? new[] { AdminFinance.Definition, "Nêu rõ khoảng ngày from/to và UTC+7 của công cụ, không tự thay kỳ theo câu hỏi." }
                : new[] { "Chỉ tra cứu; chưa thay đổi dữ liệu. Tôn trọng phạm vi và giới hạn của kết quả công cụ." },
            sections = new[] { new { topic = "admin_" + scope, resultStatus = "success", content = JsonSerializer.Serialize(data, OrderStore.Json), data } }
        }, ct);
        if (!result.Grounded || result.Status is not ("ok" or "partial"))
            throw new HttpRequestException("Câu trả lời quản trị chưa được kiểm chứng.");
        return new(result.Answer, result.Grounded, result.Status, at, data, links);
    }

    public static object ProjectOrder(Order o) => new {
        o.Code, o.CustomerName, o.CarName, o.DealerName, o.TotalVnd, o.NetReceived, o.RemainingVnd,
        orderStatusLabel = StatusLabels.GetValueOrDefault(o.Status, o.Status), o.PlannedDate,
        o.DeliveryScheduleConfirmed, o.ActualHandoverAt,
        amountUnit = "VND", qualifier = "Ngày dự kiến không đồng nghĩa đã bàn giao; lịch chỉ xác nhận khi deliveryScheduleConfirmed=true."
    };
}
