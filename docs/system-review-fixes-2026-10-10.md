# Sửa các phát hiện review hệ thống — 10/10/2026

Phạm vi: bảy phát hiện R1–R7 trong `system-review-2026-10-09.md`.
Các thay đổi nằm trong working tree, chưa commit/push. Báo cáo review gốc giữ nguyên
kết quả tái hiện trước khi sửa.

| Phát hiện | Thay đổi | Kiểm chứng |
| --- | --- | --- |
| R1 — evidence/composer công khai | Composer, understanding và title yêu cầu token nội bộ; Nginx đóng public ingress. `/api/chat` từ chối `imageMatch`/`clarification` từ caller không xác thực. Token dùng chung chỉ nằm trong cấu hình backend; Nginx xóa header do browser gửi. Guest AI/ảnh có quota 20 lượt/phút/IP, burst 5. | HTTP công khai composer 404; gọi trực tiếp không token 403; regression không gọi model khi evidence giả bị từ chối. |
| R2 — vòng chờ DB ở guest ảnh | Raw turn dùng service lazy; chỉ acquire trong retrieval. Điều phối ảnh/đơn/hỏi lại không giữ connection; timeout acquire 5 giây. | PostgreSQL thật với pool 2: 10 lượt ảnh có callback catalogue + một GET catalogue đều 200, pool trả đủ 2 connections. Model và network ảnh trong ca concurrency được mock. |
| R3 — đọc đường dẫn server | Bỏ `image_url`; JSON có trường này nhận 422. Giới hạn streamed JSON, base64 trước decode và đọc upload có giới hạn; lỗi đầu vào không đi vào retrieval. | `/etc/passwd` và chuỗi `/dev/zero` bị từ chối; không đọc các file đó. Base64 lỗi 422, upload quá lớn 413; API thật từ chối đường dẫn bằng 422. |
| R4 — mất ảnh qua đăng nhập | IndexedDB lưu Blob theo tab cùng câu hỏi, hiệu lực 30 phút. Restore qua đăng nhập/reload; tham chiếu được xóa ngay khi chấp nhận, bỏ yêu cầu hoặc đăng xuất. | Playwright trên 375/1280 px: ảnh 6 MB qua guest → đăng nhập → reload → gửi; so sánh toàn bộ base64 với ảnh gốc; reload sau gửi không khôi phục ảnh đã tiêu thụ. |
| R5 — điểm gần nhau vẫn chắc chắn | `uncertain=true` khi margin thấp; lấy top-two từ toàn bộ candidates trước khi cắt `top_k`. Metadata uncertainty đi qua catalogue/orders/UI. | Điểm .900/.899 cho cả top_k=1 và 5 trả medium, margin=.001, uncertain=true. |
| R6 — base64 làm phình JSONB | Bảng bytea `chat_attachments` riêng, FK cascade; API ảnh kiểm owner session, không cache và nosniff. 10 MB/ảnh, 30 MB/session, 2 MB JSON lịch sử, giữ giới hạn 100 lượt. Quota kiểm trước AI và kiểm lại khi persist trong transaction/session lock. | DB regression xác nhận không còn base64 trong JSON; quota và rollback không để lại attachment. Bedrock HTTP thật: tải ảnh đúng byte, owner 200, người khác 404, guest 401; replay giữ version và URL. |
| R7 — login quota gộp IP Nginx | Forwarded headers chỉ được tin từ IP web cố định; Nginx ghi đè X-Forwarded-For/Proto. Chuẩn hóa IPv4/mapped IPv6 khi chọn key; middleware chạy trước rate limiter. | Từ trusted proxy: IP A có 10 request qua limiter rồi 429; IP B vẫn qua. Giả XFF qua Nginx hoặc từ container không trusted không đổi bucket. Các request kiểm limiter thiếu CSRF nhận 400 trước khi xử lý login. |

Migration `20261009151449_ChatAttachments` đã áp dụng trên DB local. Ảnh lịch sử hợp lệ
được chuyển sang URL có xác thực. Ảnh cũ không hợp lệ được bỏ tham chiếu và ghi thông báo
gửi lại; ảnh cũ vượt quota tổng vẫn được giữ, nhưng không nhận thêm ảnh. `Down` có bước
khôi phục ảnh hợp lệ trước khi bỏ bảng; chưa thử downgrade trên DB đang sử dụng.

## Kiểm thử đã chạy

- Python backend: 165 passed, 1 skipped.
- Image service: 24 passed.
- Frontend unit: 67 passed, 17 files; build TypeScript/Vite và Docker thành công.
- C# unit/database: 123 passed, 4 skipped; các ca opt-in HTTP/AWS không nằm trong lượt này.
- Bedrock HTTP ảnh + đơn + attachment ownership/replay: 1 passed, dùng customer/order fixtures đã dọn.
- Playwright mới: bốn ca trên hai viewport đều đạt qua các lượt chạy. Một lượt có timeout
  viewport 375 khi môi trường bị gián đoạn; chạy riêng ca đó sau sửa fixture đạt. Đây không
  phải tuyên bố toàn bộ browser suite đã xanh trong một lượt.
- `git diff --check` không có lỗi whitespace.

Docker Desktop/WSL từng bị ngắt nhiều lần trong kiểm thử. Log host ghi
`DockerDesktop/Wsl/ExecError`, tiến trình `vpnkit-bridge` thoát `0xc00000fd`, rồi engine restart;
không có bằng chứng đủ để kết luận đó là lỗi model hoặc thiếu RAM. Đã phục hồi Docker và
build lại stack. Kiểm tra guest Bedrock sau phục hồi được ghi ở phần cập nhật bên dưới.

Hướng dẫn token nội bộ, trusted proxy, migration và lưu ảnh: `SETUP.md`.

## Cập nhật kiểm tra sau phục hồi

- Guest text hỏi giá Honda CR-V: Bedrock thật HTTP 200, status=ok, grounded=true, 1 citation.
- Guest hỏi nhận diện ảnh: Bedrock thật HTTP 200, status=ok, grounded=true, 2 citations.
  Một lượt trước đó bị kiểm chứng từ chối vì thiếu giới hạn nguồn; đã thu hẹp hướng dẫn cho
  câu hỏi chỉ nhận diện để không tự thêm thông số/giá/bảo hành. Một lượt khác gặp lỗi kết nối
  endpoint Bedrock. Các lỗi này trả 503, không trả câu không được kiểm chứng.
- PostgreSQL xác nhận migration đã áp dụng, không còn data URL ảnh trong JSONB lịch sử;
  15 ảnh đã lưu trong bảng riêng tại thời điểm kiểm tra.
- Stack Docker hiện chạy đủ năm dịch vụ; Python, image và PostgreSQL health checks đạt.
- README đã cập nhật trạng thái image integration và bỏ mô tả template fallback thành công.

- Guest ảnh + đơn: Bedrock thật HTTP 200, needs_clarification, requiresLogin=true, grounded=false, không có citations đơn hàng trước đăng nhập.
