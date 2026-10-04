const topics: Record<string, string> = { status: "Tiến độ", payment: "Thanh toán", delivery: "Bàn giao", car: "Thông tin xe", warranty: "Bảo hành", documents: "Hồ sơ" };
const results: Record<string, string> = { success: "Đã tra cứu", missing: "Chưa có dữ liệu", error: "Tra cứu gặp lỗi", unknown: "Chưa xác minh" };
export function SupportContext({ snapshot }: { snapshot: { at: string; topics: string[]; results: string[] }[] }) {
  return <><h3>Ngữ cảnh gửi kèm</h3>{snapshot.length ? <ul>{snapshot.map((s, i) => <li key={i}>{new Date(s.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {s.topics.map((t, j) => `${topics[t] || "Tra cứu đơn"}: ${results[s.results[j]] || "Chưa xác minh"}`).join("; ")}</li>)}</ul> : <p>Chưa có lượt tra cứu liên quan. Chỉ gửi vấn đề bạn nhập.</p>}</>;
}
