using AutoWise.OwnerFeatures.Application;
using AutoWise.OwnerFeatures.Domain;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace AutoWise.OwnerFeatures.Infrastructure;

public sealed record FinancePeriod(DateOnly From, DateOnly To);
public sealed class FinanceTotals
{
    public decimal RevenueVnd { get; set; }
    public int CompletedOrders { get; set; }
    public decimal ReceiptsVnd { get; set; }
    public decimal RefundsVnd { get; set; }
    public int MissingHandoverDates { get; set; }
    public int MissingConfirmationDates { get; set; }
    public decimal NetCashVnd => ReceiptsVnd - RefundsVnd;
}

public static class AdminFinance
{
    public const string Definition = "Doanh thu vận hành là tổng giá chốt các đơn hiện đang hoàn thành, theo ngày bàn giao thực tế trong kỳ UTC+7; không phải báo cáo doanh thu kế toán, không tách thuế/chi phí/lợi nhuận. Tiền thu và hoàn chỉ tính giao dịch đã xác nhận theo ngày xác nhận trong kỳ; thu ròng = thu trừ hoàn, có thể khác doanh thu. Không dùng ngày tạo đơn hoặc ngày giao dự kiến. Bản ghi thiếu ngày được loại và báo riêng trên toàn hệ thống.";
    public static FinancePeriod Period(AdminChatInput input, DateTimeOffset now)
    {
        if (input.DateFrom.HasValue != input.DateTo.HasValue) throw new BusinessRuleException("Cần chọn cả ngày bắt đầu và kết thúc.");
        var today = DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(7)).Date);
        var from = new DateOnly(today.Year, today.Month, 1);
        var to = today;
        var q = input.DateFrom.HasValue ? "" : AssistantIntent.Normalize(input.Question);
        if (Regex.IsMatch(q, @"\b(?:quy|tuan|quarter|week)\b|toan bo thoi gian|all time|\d{1,4}[-/]\d{1,2}[-/]\d{1,4}"))
            throw new BusinessRuleException("Hãy chọn Từ ngày và Đến ngày cho khoảng thời gian này.");
        if (q.Contains("hom nay") || q.Contains("today")) from = today;
        else if (q.Contains("hom qua") || q.Contains("yesterday")) from = to = today.AddDays(-1);
        else if (q.Contains("thang truoc") || q.Contains("last month")) { from = from.AddMonths(-1); to = from.AddMonths(1).AddDays(-1); }
        else if (q.Contains("nam nay") || q.Contains("this year")) from = new(today.Year, 1, 1);
        else if (Regex.Match(q, @"\bthang\s+(\d{1,2})(?:\s*(?:/|nam\s*)\s*(\d{4}))?\b") is { Success: true } month)
        {
            var year = month.Groups[2].Success ? int.Parse(month.Groups[2].Value) : today.Year;
            var number = int.Parse(month.Groups[1].Value);
            if (number is < 1 or > 12 || year is < 2000 or > 9998) throw new BusinessRuleException("Tháng/năm không hợp lệ.");
            from = new(year, number, 1); to = from.AddMonths(1).AddDays(-1);
        }
        else if (Regex.Match(q, @"\bnam\s+(\d{4})\b") is { Success: true } yearMatch)
        {
            var year = int.Parse(yearMatch.Groups[1].Value);
            if (year is < 2000 or > 9998) throw new BusinessRuleException("Năm không hợp lệ.");
            from = new(year, 1, 1); to = new(year, 12, 31);
        }
        if (input.DateFrom is {} start && input.DateTo is {} end) { from = start; to = end; }
        if (from.Year < 2000 || to.Year > 9998 || from > to || to.DayNumber - from.DayNumber > 3660) throw new BusinessRuleException("Khoảng ngày không hợp lệ hoặc vượt 10 năm.");
        return new(from, to);
    }

    // Parameterized aggregates over ALL rows, independent of the 20-record chat list.
    public static async Task<FinanceTotals> Read(OrdersDb db, FinancePeriod period, CancellationToken ct)
    {
        var start = new DateTimeOffset(period.From.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)).ToUniversalTime();
        var end = new DateTimeOffset(period.To.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)).ToUniversalTime();
        return await db.Database.SqlQuery<FinanceTotals>($"""
            WITH sales AS (
              SELECT COALESCE(SUM(("Payload"->>'totalVnd')::numeric),0) AS amount, COUNT(*)::int AS count
              FROM orders_service.orders WHERE "Status"='completed'
              AND ("Payload"->>'actualHandoverAt')::timestamptz >= {start}
              AND ("Payload"->>'actualHandoverAt')::timestamptz < {end}
            ), payments AS (
              SELECT p FROM orders_service.orders o CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o."Payload"->'payments','[]'::jsonb)) p
              WHERE p->>'status'='confirmed'
            ), cash AS (
              SELECT COALESCE(SUM((p->>'amountVnd')::numeric) FILTER (WHERE p->>'type'='receipt'),0) AS receipts,
              COALESCE(SUM((p->>'amountVnd')::numeric) FILTER (WHERE p->>'type'='refund'),0) AS refunds
              FROM payments WHERE (p->>'confirmedAt')::timestamptz >= {start} AND (p->>'confirmedAt')::timestamptz < {end}
            )
            SELECT sales.amount AS "RevenueVnd", sales.count AS "CompletedOrders", cash.receipts AS "ReceiptsVnd", cash.refunds AS "RefundsVnd",
              (SELECT COUNT(*)::int FROM orders_service.orders WHERE "Status"='completed' AND "Payload"->>'actualHandoverAt' IS NULL) AS "MissingHandoverDates",
              (SELECT COUNT(*)::int FROM payments WHERE p->>'confirmedAt' IS NULL) AS "MissingConfirmationDates"
            FROM sales CROSS JOIN cash
            """).SingleAsync(ct);
    }
}
