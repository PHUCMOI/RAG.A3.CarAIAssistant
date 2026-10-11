# Bước tiếp theo cho chat — 11/10/2026

Customer, guest và admin đều có khối **Bước tiếp theo** sau câu trả lời trong giao diện.
Các phản hồi cũ cũng được dựng lại gợi ý khi mở lịch sử; không cần migration và không thay đổi API/model.
Khởi đầu hội thoại giữ các câu hỏi gợi ý hiện có. Trong lúc đang xử lý, nút câu hỏi gợi ý bị khóa.

## Cơ chế

`frontend/src/features/chat/NextSteps.tsx` dùng role, status, nguồn xe, sections/progress và dữ liệu
công cụ admin. Không suy ra thao tác từ văn bản tự do của model, không thêm số liệu vào câu trả lời.
Gợi ý được hiển thị riêng với dữ liệu/citations đã kiểm chứng. Tối đa bốn mục, lọc URL theo vai trò,
loại đường dẫn ngoài site/traversal và có fallback khi không đủ dữ liệu.

| Ngữ cảnh | Gợi ý |
| --- | --- |
| Customer tra đơn | Hành động actor=customer có sẵn từ progress, mở đơn, hỏi bước tiếp theo với mã đơn rõ ràng |
| Hồ sơ thiếu | Mở thông tin hồ sơ để kiểm tra và bổ sung theo dữ liệu requiredOutstanding |
| Tư vấn xe | Mở xe trong nguồn tra cứu; nếu không có nguồn thì làm rõ ngân sách/số chỗ/nhu cầu |
| Ảnh chưa chắc | Ảnh rõ hơn hoặc tên mẫu xe; không khẳng định VIN/chiếc xe thực tế |
| Guest cần đăng nhập | Đăng nhập trở lại /chat để tra dữ liệu thuộc tài khoản |
| Thiếu dữ liệu/hỏi lại/partial | Bổ sung tham chiếu/điều chỉnh bộ lọc, vẫn có một đường tiếp tục |
| Từ chối quyền | Chuyển sang nhu cầu trong quyền của vai trò, không gợi ý customer sang admin |
| Lỗi gửi/tải/đính kèm | Kiểm tra thông báo/đầu vào/kết nối, dùng nút retry hiện có hoặc mở màn hình tra cứu trực tiếp |
| Admin đơn còn phải thu | Soạn câu hỏi kiểm tra thanh toán từ code/remainingVnd công cụ, mở bản ghi để xem lại |
| Admin doanh thu | Đối chiếu với đơn/giao dịch, tra cứu tiến độ đơn |
| Admin phiếu/khách/tổng quan | Mở màn hình phù hợp hoặc soạn câu hỏi tra cứu tiếp |

Bấm câu hỏi chỉ điền composer và focus, không tự gửi. Bấm liên kết chỉ mở trang.
Không có gợi ý nào gọi API mutation. Yêu cầu đổi lịch/hủy/hỗ trợ vẫn dùng quy trình bản nháp
và xác nhận hiện có. Admin tự kiểm tra bản ghi và dùng form nghiệp vụ để thay đổi dữ liệu.
Gợi ý là lựa chọn để tiếp tục, không khẳng định hành động là bắt buộc hoặc đã được thực hiện.

## Kiểm chứng

- Build TypeScript/Vite đạt.
- Frontend unit: 95 passed, 19 file, chạy `npm.cmd run test -- --maxWorkers=1`.
- Bộ rules mới kiểm mọi tổ hợp role guest/customer/admin với ok/partial/no_data/needs_clarification/
  forbidden/error/không có status, phân quyền liên kết, dữ liệu progress, cached reference không hợp lệ,
  guest login và không tự kích hoạt callback hành động.
- Test trình duyệt mới kiểm câu trả lời và bấm gợi ý trên cả ba vai trò, không phát sinh lượt gửi mới,
  customer không có link admin và không tràn ngang: 6/6 đạt ở 375/1280 px.
- Hồi quy admin chat: 6/6 ở 375/1280 px đạt trong lượt kiểm tra trước đó.
- Lần browser đầu fixture bắt nhầm module /src/shared/api/client.ts và tên nút guest. Đã sửa phạm vi
  intercept /api/ và locator theo nhãn thực, chạy lại bộ mới 6/6 đạt.
- Docker Desktop đang dừng khi cập nhật. Đã khởi động lại, build/cập nhật web và đưa đủ năm dịch vụ
  lên; orders health qua Nginx trả 200. Không sửa cấu hình/phân quyền backend cho tính năng này.
