import { Link } from "react-router-dom";

export type OrderProgress = {
  status: string;
  statusLabel: string;
  description: string;
  waitingReason: string | null;
  historyNotice: string;
  timeline: {
    kind: string; title: string; at: string; source: string;
    plannedDate?: string | null; deliveryScheduleConfirmed?: boolean | null; actualHandoverAt?: string | null;
  }[];
  nextActions: { actor: string; content: string; detailUrl: string }[];
  schedule: { state: string; plannedDate: string | null; confirmedAt: string | null; actualHandoverAt: string | null; location: string | null };
};
const timestamp = (at: string) => new Date(at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const date = (value: string) => value.split("-").reverse().join("/");

export function OrderProgressCard({ progress }: { progress: OrderProgress }) {
  const schedule = progress.schedule;
  const ended = ["completed", "cancelled"].includes(progress.status);
  return (
    <div className="order-progress">
      <p><strong>{progress.statusLabel}</strong> · {progress.description}</p>
      {!ended && <p><strong>Thông tin chờ:</strong> {progress.waitingReason || "Chưa có lý do chờ được đại lý xác nhận cho khách."}</p>}
      <div className="order-progress-schedule">
        <h4>Lịch bàn giao</h4>
        {schedule.state === "cancelled" ? <p>Đơn đã hủy; lịch bàn giao cũ không còn áp dụng.</p>
          : schedule.state === "handed_over" && schedule.actualHandoverAt ? <p>Đã ghi nhận bàn giao thực tế: {timestamp(schedule.actualHandoverAt)}</p>
          : schedule.state === "none" ? <p>Chưa có ngày bàn giao được xác nhận; chưa có lịch dự kiến.</p>
          : <>
            <p>{schedule.state === "confirmed" ? "Lịch đã được đại lý xác nhận" : "Lịch dự kiến, chưa được đại lý xác nhận"}: {schedule.plannedDate ? date(schedule.plannedDate) : "Chưa có dữ liệu"}</p>
            {schedule.state === "confirmed" && schedule.confirmedAt && <small>Xác nhận lúc: {timestamp(schedule.confirmedAt)}</small>}
          </>}
        {schedule.state !== "cancelled" && <p>Địa điểm: {schedule.location || "Chưa cập nhật"}</p>}
      </div>
      <h4>Các mốc đã ghi nhận</h4>
      <p className="orders-help">{progress.historyNotice}</p>
      <ol className="order-progress-timeline">
        {progress.timeline.map((milestone, index) => (
          <li key={`${milestone.kind}-${milestone.at}-${index}`}>
            <strong>{milestone.title}</strong>
            <small>{timestamp(milestone.at)} · Nguồn: lịch sử đơn</small>
            {milestone.plannedDate && <p>Lịch tại thời điểm cập nhật: {date(milestone.plannedDate)} · {milestone.deliveryScheduleConfirmed ? "Đã xác nhận" : "Dự kiến"}</p>}
            {milestone.actualHandoverAt && <p>Bàn giao thực tế: {timestamp(milestone.actualHandoverAt)}</p>}
          </li>
        ))}
      </ol>
      <h4>{ended ? "Hướng dẫn sau khi đơn kết thúc" : "Bước tiếp theo (chưa phải mốc đã hoàn tất)"}</h4>
      {progress.nextActions.map((action, index) => (
        <div className="order-progress-action" key={index}>
          <strong>{action.actor === "dealer" ? "Đại lý" : "Bạn"}</strong>
          <p>{action.content}</p>
          <Link to={action.detailUrl}>Mở chi tiết đơn →</Link>
        </div>
      ))}
    </div>
  );
}
