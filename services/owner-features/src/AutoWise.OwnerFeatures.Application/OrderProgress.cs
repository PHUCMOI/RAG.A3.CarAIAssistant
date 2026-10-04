using System.Text.RegularExpressions;
using AutoWise.OwnerFeatures.Domain;

namespace AutoWise.OwnerFeatures.Application;

public record ProgressMilestone(string Kind, string Title, DateTimeOffset At, string Source, string? Status=null,
    DateOnly? PlannedDate=null, bool? DeliveryScheduleConfirmed=null, DateTimeOffset? ActualHandoverAt=null);
public record ProgressAction(string Actor, string Content, string DetailUrl);
public record ProgressSchedule(string State, DateOnly? PlannedDate, DateTimeOffset? ConfirmedAt, DateTimeOffset? ActualHandoverAt, string? Location);
public record OrderProgressSnapshot(string Status, string StatusLabel, string Description, List<ProgressMilestone> Timeline,
    List<ProgressAction> NextActions, string? WaitingReason, ProgressSchedule Schedule, string HistoryNotice);

public static class OrderProgress
{
    static readonly Dictionary<string,(string Label,string Description)> States = new() {
        ["pending_confirmation"]=("Chờ xác nhận","Đại lý đang chờ kiểm tra và xác nhận thông tin đặt mua xe."),
        ["confirmed"]=("Đã xác nhận","Đơn đã được xác nhận; đại lý sẽ tổ chức chuẩn bị xe theo thông tin đã chốt."),
        ["preparing_vehicle"]=("Đang chuẩn bị xe","Đại lý đang chuẩn bị xe. Trạng thái này chưa xác nhận xe đã sẵn sàng bàn giao."),
        ["ready_for_handover"]=("Chờ bàn giao","Xe đã ở bước chờ bàn giao; việc nhận xe còn phụ thuộc thanh toán và lịch được xác nhận."),
        ["completed"]=("Hoàn thành","Đơn đã hoàn thành. Bạn có thể xem lại thông tin bàn giao và các giao dịch đã ghi nhận."),
        ["cancelled"]=("Đã hủy","Đơn đã hủy; lịch nhận xe trước đây không còn là lịch bàn giao đang áp dụng.")
    };
    public static string Label(string status) => States.TryGetValue(status,out var state) ? state.Label : "Chưa rõ trạng thái";

    public static OrderProgressSnapshot Build(Order order)
    {
        var timeline = new List<ProgressMilestone>();
        foreach (var entry in order.History.OrderBy(e=>e.At))
        {
            if(entry.Action=="created") timeline.Add(new("created","Đơn được tạo",entry.At,"order_history"));
            else if(entry.Action=="status")
            {
                var target=entry.ToStatus;
                if(target==null)
                {
                    // Legacy values are either a bare enum or a known transition prefix.
                    // Never return the free-text reason or actor.
                    if(States.ContainsKey(entry.Detail.Trim())) target=entry.Detail.Trim();
                    else {
                        var match=Regex.Match(entry.Detail,@"^([a-z_]+) → ([a-z_]+):");
                        if(match.Success && States.ContainsKey(match.Groups[1].Value)) target=match.Groups[2].Value;
                    }
                }
                if(target!=null && States.ContainsKey(target)) timeline.Add(new("status",Label(target),entry.At,"order_history",target));
            }
            else if(entry.Action is "delivery" or "delivery_actual")
                timeline.Add(new(entry.Action,entry.Action=="delivery_actual" ? "Ghi nhận bàn giao thực tế" : "Cập nhật lịch bàn giao",
                    entry.At,"order_history",PlannedDate:entry.PlannedDate,DeliveryScheduleConfirmed:entry.DeliveryScheduleConfirmed,ActualHandoverAt:entry.ActualHandoverAt));
        }
        var detail="/account/orders/"+order.Id;
        var confirmed=order.DeliveryScheduleConfirmed && order.DeliveryConfirmedAt!=null && order.PlannedDate!=null;
        var actions=new List<ProgressAction>();
        void Add(string actor,string content) => actions.Add(new(actor,content,detail));
        switch(order.Status)
        {
            case "pending_confirmation":
                Add("dealer","Kiểm tra thông tin và xác nhận đơn.");
                Add("customer","Kiểm tra xe, phiên bản và thông tin đặt mua; liên hệ đại lý nếu cần chỉnh sửa."); break;
            case "confirmed":
                Add("dealer","Chuẩn bị xe và cập nhật tiến độ cho khách.");
                Add("customer","Kiểm tra các khoản thanh toán đã ghi nhận và trao đổi với đại lý về việc cần chuẩn bị."); break;
            case "preparing_vehicle":
                Add("dealer","Hoàn tất chuẩn bị xe và cập nhật khi xe sẵn sàng bàn giao.");
                Add("customer","Theo dõi lịch bàn giao; trao đổi với đại lý về giấy tờ cần chuẩn bị."); break;
            case "ready_for_handover":
                if(order.ActualHandoverAt != null) {
                    Add("dealer","Kiểm tra kết quả bàn giao và cập nhật hoàn thành đơn.");
                    Add("customer","Kiểm tra thông tin bàn giao đã ghi nhận.");
                } else {
                    Add("dealer",confirmed ? "Tổ chức bàn giao theo lịch đã xác nhận và ghi nhận kết quả thực tế." : "Xác nhận lịch và địa điểm bàn giao với khách.");
                    Add("customer",order.RemainingVnd>0 ? "Kiểm tra số tiền còn phải trả và hoàn tất thanh toán theo hướng dẫn của đại lý trước khi nhận xe." : "Kiểm tra lịch và giấy tờ cần mang theo với đại lý trước khi nhận xe.");
                } break;
            case "completed": Add("customer","Xem lại thông tin bàn giao và giao dịch; liên hệ đại lý nếu cần hỗ trợ sau mua."); break;
            case "cancelled": Add("customer","Xem kết quả hủy và tình trạng thu/hoàn tiền đã ghi nhận; liên hệ đại lý nếu cần giải đáp."); break;
        }
        var scheduleState=order.Status=="cancelled" ? "cancelled" : order.ActualHandoverAt!=null ? "handed_over"
            : order.PlannedDate==null ? "none" : confirmed ? "confirmed" : "planned";
        return new(order.Status,Label(order.Status),States.TryGetValue(order.Status,out var state) ? state.Description : "Chưa có hướng dẫn cho trạng thái này.",
            timeline,actions,order.Status is "completed" or "cancelled" ? null : order.CustomerWaitingReason,
            new(scheduleState,order.PlannedDate,order.DeliveryConfirmedAt,order.ActualHandoverAt,order.DeliveryLocation),
            timeline.Count==0 ? "Chưa có lịch sử tiến độ được ghi nhận; chỉ có trạng thái hiện tại." : "Chỉ hiển thị các mốc đã được ghi nhận; lịch sử có thể chưa đầy đủ.");
    }
    public static string Describe(OrderProgressSnapshot progress)
    {
        string Timestamp(DateTimeOffset at) => at.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm");
        var lines=new List<string>{progress.StatusLabel+". "+progress.Description};
        if(progress.Status is not ("completed" or "cancelled")) lines.Add("Thông tin chờ: "+(progress.WaitingReason ?? "Chưa có lý do chờ được đại lý xác nhận cho khách."));
        lines.Add(ScheduleDescription(progress.Schedule));
        lines.Add(progress.HistoryNotice);
        lines.AddRange(progress.Timeline.Select(m=>$"{Timestamp(m.At)} · {m.Title} (nguồn: lịch sử đơn)."));
        lines.AddRange(progress.NextActions.Select(a=>$"Bước tiếp theo · {(a.Actor=="dealer" ? "Đại lý" : "Bạn")}: {a.Content}"));
        return string.Join("\n",lines);
    }
    public static string ScheduleDescription(ProgressSchedule schedule) => schedule.State switch {
        "cancelled" => "Đơn đã hủy; lịch bàn giao cũ không còn áp dụng.",
        "handed_over" => "Đã ghi nhận bàn giao thực tế: "+schedule.ActualHandoverAt?.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm")+".",
        "none" => "Chưa có ngày bàn giao được xác nhận; chưa có lịch dự kiến.",
        "confirmed" => "Lịch bàn giao đã được đại lý xác nhận: "+schedule.PlannedDate?.ToString("dd/MM/yyyy")+"; địa điểm: "+(schedule.Location ?? "chưa cập nhật")+".",
        _ => "Lịch dự kiến: "+schedule.PlannedDate?.ToString("dd/MM/yyyy")+"; địa điểm: "+(schedule.Location ?? "chưa cập nhật")+". Chưa được đại lý xác nhận."
    };
}
