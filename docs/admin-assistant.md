# Chatbot AI quản trị — 10/10/2026

Trang `/admin/assistant`, liên kết **Trợ lý AI** trên thanh điều hướng admin.
API `POST /api/orders-service/admin/assistant/messages` chỉ nhận phiên có role Admin,
kiểm CSRF và giới hạn 10 lượt/phút/tài khoản. Response đặt `private, no-store`.
Không cần migration. Đã cập nhật và khởi động lại api/web/orders-api trong stack Docker local.

## Chức năng

- Tổng quan: đếm toàn bộ đơn theo trạng thái, khách hàng và phiếu hỗ trợ theo trạng thái.
- Doanh thu/dòng tiền theo kỳ UTC+7: giá chốt đơn hiện đã hoàn thành theo ngày bàn giao thực tế,
  tiền thu/hoàn đã xác nhận theo ngày xác nhận và thu ròng. Thống kê trạng thái hiện tại của đơn tạo
  trong kỳ và khách mới có ngày tạo chính xác. Aggregate toàn bộ dữ liệu, không cắt 20 bản ghi.
  Đây là doanh thu vận hành; chưa tách thuế/chi phí/lợi nhuận và chưa phải báo cáo kế toán.
  Bản ghi thiếu ngày bị loại khỏi kỳ và báo số lượng riêng trên toàn hệ thống.
- Đơn: mã đơn, trạng thái, khách, xe, đại lý, giá chốt, thu ròng đã xác nhận, số tiền còn phải thu,
  ngày dự kiến, xác nhận lịch và bàn giao thực tế. Lọc mã, trạng thái và trễ lịch UTC+7.
- Khách: lọc tên/email, trả tên, email và số đơn; không gửi mật khẩu, security stamp hoặc audit cho AI.
- Phiếu: lọc mã/tiêu đề, trả trạng thái và thời điểm cập nhật; không đọc phản hồi hoặc ghi chú nội bộ.
- Liên kết mở danh sách và bản ghi xuất phát từ công cụ backend, không do model tạo URL.
- Markdown dùng renderer an toàn hiện có; giữ câu hỏi khi lỗi, khóa gửi trùng, xóa hội thoại.
- Mỗi câu trả lời/lỗi có gợi ý bước tiếp theo theo vai trò và kết quả công cụ; xem [chat-next-steps.md](chat-next-steps.md).

Admin chọn nhóm dữ liệu/bộ lọc trong giao diện. Mã `AW-…` trong câu hỏi tự chuyển sang công cụ
đơn nếu chưa nhập bộ lọc mã. Đây không phải trình chạy SQL tự do: truy vấn cố định, tham số qua EF.
Bedrock chỉ viết câu trả lời từ kết quả công cụ qua `NaturalAnswers` và kiểm chứng cuối của Python;
câu chưa grounded hoặc dịch vụ lỗi trả 503, không giả lập câu trả lời thành công.

Hỏi doanh thu ở nhóm tổng quan tự chuyển công cụ tài chính. Hỏi thống kê kèm kỳ hoặc bộ lọc ngày
cũng dùng công cụ này. Chọn **Doanh thu và dòng tiền** để dùng trực tiếp. Ngày bắt đầu/kết thúc
bao gồm cả hai đầu theo UTC+7. Chọn ngày rõ ràng ưu tiên hơn câu hỏi; nếu để trống, hiểu hôm nay,
hôm qua, tháng trước, năm nay, tháng N năm YYYY và năm YYYY. Mặc định đầu tháng đến hôm nay.
Quý/tuần/ngày cụ thể chưa tự phân tích: trả thông báo yêu cầu chọn khoảng ngày, không âm thầm đổi kỳ.

Customer và guest hỏi doanh thu/lợi nhuận/thống kê toàn hệ thống nhận câu từ chối rõ ràng,
`status=forbidden`, `generationMode=authorization-policy`, không có evidence/citations. Chặn trước
model ở unified, order và catalogue chat; lưu refusal theo owner/version và replay như lượt thường.
Guest/public text chat cũng chặn trước model. Bộ nhận diện từ khóa là lớp diễn đạt từ chối;
ranh giới quyền thực vẫn là API Admin riêng và truy vấn customer luôn có owner.

## Giới hạn

Chỉ tra cứu, không cập nhật/hủy đơn hoặc gửi phản hồi. Mỗi lượt đọc mới từ DB; không gửi lịch sử
hội thoại cho model. Hội thoại tối đa 30 lượt trong bộ nhớ trang, mất khi reload/đổi trang/đăng xuất.
Danh sách tối đa 20 bản ghi; tổng số khớp được tính riêng, không coi danh sách cắt là toàn bộ.
Tổng quan mặc định là toàn thời gian; hỏi thống kê trong kỳ dùng công cụ tài chính. Chưa có doanh thu kế toán. Phạm vi không bao gồm lịch hẹn,
yêu cầu mua, catalogue/ảnh hoặc quản lý cấu hình RAG. Bộ lọc tên/email dùng chuỗi chứa có phân biệt hoa/thường.

## Kiểm chứng

- C# mới: 5/5, bao gồm PostgreSQL thật; phân quyền trước model, công cụ thực, projection loại audit,
  tiền thu/hoàn xác nhận và từ chối response không grounded. Model mock trong DB test.
- Toàn bộ C# mặc định: 122 passed, 25 skipped (các ca opt-in); bộ admin/finance với DB/HTTP opt-in: 20/20 đạt, không skip.
- Frontend unit: 70/70, 18 file; kiểm bộ lọc/nguồn, lỗi/khóa gửi trùng và khoảng ngày doanh thu.
- Edge Playwright: 6/6 ở 375 và 1280 px; hỏi, retry 503, mở link, xóa chat, khoảng ngày, không tràn ngang,
  customer bị điều hướng khỏi admin. API mock; ảnh trong `frontend/test-results/`.
- Build frontend và Docker web/orders-api thành công. Lần build Docker đầu timeout TLS khi tải
  metadata SDK; chạy lại thành công.
- Python backend: 173 passed, 1 skipped (chạy với PYTHONPATH trỏ root); gồm 8 ca refusal guest/public.
- C# admin/finance mới: PostgreSQL thật kiểm 25 đơn vượt giới hạn danh sách, mốc UTC+7,
  thu/hoàn xác nhận, loại pending/cancelled, refusal có owner và replay. HTTP local kiểm customer
  bị từ chối ở turns/messages/catalogue-messages, không có evidence, replay không thêm lượt.
- Smoke HTTP với Bedrock thật: cả overview/orders/customers/support/revenue đều 200, grounded=true;
  câu “Thống kê tháng trước: số đơn mới và khách hàng mới trong kỳ?” tự chọn công cụ theo kỳ, 200/grounded=true.
  guest 401, customer 403, thiếu CSRF 400, tool lạ 422. Script hoàn tất thành công ngày 10/10/2026.

Chạy smoke với tài khoản demo local và Bedrock thật:

```powershell
./scripts/smoke_admin_assistant.ps1
```

Script chỉ login/tra cứu, không tạo hay sửa dữ liệu. Kiểm guest 401, customer 403, thiếu CSRF 400,
tool lạ 422 và năm nhóm dữ liệu HTTP 200/grounded. Cần stack local đã build, database demo và AI hoạt động.

Một lượt kiểm thử đồng thời gặp thiếu bộ nhớ host (MSBuild/Node và worker browser); chạy lại tuần tự,
frontend unit dùng `--maxWorkers=1`, đã đạt. Lượt pytest ban đầu thiếu module eval vì cwd backend;
chạy lại với `PYTHONPATH=C:\RAG-A3` đạt. Không cần thay đổi nghiệp vụ để xử lý hai lỗi môi trường này.
