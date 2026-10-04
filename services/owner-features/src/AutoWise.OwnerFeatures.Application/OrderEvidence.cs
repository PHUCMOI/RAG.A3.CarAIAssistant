using System.Globalization;
using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Domain;
namespace AutoWise.OwnerFeatures.Application;

public record PaymentRow(Guid Id, string Reference, string Type, long AmountVnd, string Status,
    DateTimeOffset? CreatedAt, DateTimeOffset? ConfirmedAt, string? FailureReason, Guid? OriginalReceiptId, string? DocumentUrl=null);
public record PaymentDetails(Guid OrderId, string OrderStatus, long TotalVnd, long DepositRequiredVnd, long ReceivedVnd,
    long RefundedVnd, long NetReceived, long RemainingVnd, Page<PaymentRow> Transactions, string MatchStatus,
    string? Reference, DateOnly? Date, DateTimeOffset RetrievedAt);
public record DocumentItem(Guid Id, string Name, bool Required, string Status, string? CustomerNote, DateTimeOffset UpdatedAt, long Version);
public record DocumentDetails(Guid OrderId, Page<DocumentItem> Checklist, int RequiredOutstanding, DateTimeOffset RetrievedAt);
public record DocumentInput(long Version, string Name, bool Required, string Status, string? CustomerNote);

public static class OrderEvidence
{
    public static void Paging(int page,int size) { if(page<1||page>100000||size<1||size>20) throw new BusinessRuleException("Trang không hợp lệ; tối đa 20 mục mỗi trang."); }
    public static (string? Reference, DateOnly? Date) Filter(string question)
    {
        var text=AssistantIntent.Normalize(question);
        var match=Regex.Match(text,@"\bma (?:giao dich|tham chieu)\s*[:：]?\s*([a-z0-9][a-z0-9_-]{0,99})\b");
        DateOnly? date=DraftParser.Date(question);
        if(text.Contains("hom qua")) date=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime).AddDays(-1);
        else if(text.Contains("hom nay")) date=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).DateTime);
        return (match.Success?match.Groups[1].Value:null,date);
    }
    public static PaymentDetails Payments(Order order,int page=1,int size=10,string? reference=null,DateOnly? date=null)
    {
        Paging(page,size);
        var confirmed=order.Payments.Where(x=>x.Status=="confirmed").ToList();
        var matches=order.Payments.Where(x=>(reference==null||x.Reference.Equals(reference,StringComparison.OrdinalIgnoreCase)) &&
            (date==null||x.CreatedAt!=null&&DateOnly.FromDateTime(x.CreatedAt.Value.ToOffset(TimeSpan.FromHours(7)).DateTime)==date)).ToList();
        var items=matches.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size)
            .Select(x=>new PaymentRow(x.Id,x.Reference,x.Type,x.AmountVnd,x.Status,x.CreatedAt,x.ConfirmedAt,x.FailureReason,x.OriginalReceiptId)).ToList();
        var status=reference==null&&date==null?"all":matches.Count==0?"not_found":matches.Count==1?"matched":"ambiguous";
        return new(order.Id,order.Status,order.TotalVnd,order.DepositRequiredVnd,confirmed.Where(x=>x.Type=="receipt").Sum(x=>x.AmountVnd),
            confirmed.Where(x=>x.Type=="refund").Sum(x=>x.AmountVnd),order.NetReceived,order.RemainingVnd,new(items,page,size,matches.Count),status,reference,date,DateTimeOffset.UtcNow);
    }
    public static string Describe(PaymentDetails p)
    {
        string Money(long value)=>value.ToString("N0",CultureInfo.GetCultureInfo("vi-VN"))+" VND";
        var text=$"Giá chốt {Money(p.TotalVnd)}, cọc yêu cầu {Money(p.DepositRequiredVnd)} (nằm trong giá chốt), đã thu {Money(p.ReceivedVnd)}, đã hoàn {Money(p.RefundedVnd)}, đã thu ròng {Money(p.NetReceived)}. "+
            (p.OrderStatus=="cancelled"?$"Đơn đã hủy; khoản còn giữ {Money(p.NetReceived)}.":$"Còn phải trả {Money(p.RemainingVnd)}. Chỉ giao dịch đã xác nhận được tính.");
        text+=p.MatchStatus switch {"not_found"=>" Chưa tìm thấy giao dịch khớp trong dữ liệu đã lưu.","ambiguous"=>" Có nhiều giao dịch khớp. Hãy chọn bằng mã giao dịch; tôi chưa xác nhận khoản nào thay bạn.",_=>""};
        if(p.Transactions.TotalCount==0) text+=" Chưa có giao dịch phù hợp.";
        foreach(var item in p.Transactions.Items) text+=$"\n{item.Reference}: {(item.Type=="receipt"?"Thu":"Hoàn")} {Money(item.AmountVnd)} · "+
            (item.Status=="confirmed"?"Đã xác nhận":item.Status=="pending"?"Chờ xác nhận":"Từ chối / thất bại")+(item.FailureReason==null?"":$" · {item.FailureReason}");
        return text+="\nChưa có chứng từ được lưu/cấp quyền trong hệ thống.";
    }
}
