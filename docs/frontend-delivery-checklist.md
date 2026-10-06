# Bàn giao frontend — Đợt 1–5

Ngày kiểm tra: 2026-10-05. Nhánh: `feat/frontend`. Mốc bắt đầu: `50c1626`.

Chỉ thay đổi frontend và tài liệu; không thay đổi backend, database hoặc nghiệp vụ đơn hàng. Giữ thiết kế hiện có.

## Checklist triển khai

| Đợt | Nội dung | Kết quả |
|---|---|---|
| 1 | Script Vite chỉ định cấu hình TS; proxy Python/C#; menu mobile; trạng thái tải/lỗi/rỗng/thử lại; phân biệt 404; hủy request chi tiết cũ | Hoàn tất, commit `08fb853` |
| 2 | Bộ lọc nhiều lựa chọn, giá/số ghế; tìm không dấu và debounce; URL; sắp xếp; grid/list; phân trang; drawer mobile | Hoàn tất, commit `f6079e3` |
| 3 | Thanh so sánh tối đa 3 xe; thông số; giá và nguồn; bảo hành/đại lý; chuyển tên xe sang chat | Hoàn tất, commit `70004be` |
| 4 | Phím gửi; retry đúng câu hỏi/requestId; nguồn chat; cache theo tài khoản; hội thoại mới; chuyển chủ đề hỗ trợ; theo dõi tin nhắn mới | Hoàn tất, commit `2adb08d` |
| 5 | Vitest/RTL, Edge/Playwright, kiểm tra responsive, sửa regression tìm thấy khi kiểm thử, tài liệu bàn giao | Hoàn tất trong commit bàn giao này |

Các sửa bổ sung từ kiểm thử: đăng nhập với `returnTo=/chat` quay lại đúng chat; tải lại danh sách đơn không ghi đè câu hỏi đang soạn; giữ requestId khi retry câu hỏi cũ sau khi đổi lựa chọn đơn; header admin có chiều cao theo nội dung; các nút trang chi tiết xuống dòng trên mobile.

## Cách chạy

Từ thư mục `frontend`:

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run build
npm.cmd test
npm.cmd run test:browser
```

- Dev mặc định: `http://localhost:5173`.
- `/api/orders-service` proxy tới `http://localhost:5090`; `/api` tới `http://localhost:5080`.
- Build và preview cũng chỉ định `vite.config.ts`, tránh vô tình dùng cấu hình JS cũ.
- Test trình duyệt tự chạy Vite ở cổng `5175`, dùng Microsoft Edge đã cài đặt, chạy headless ở 375/768/1440 px. Cổng này phải trống.
- Test trình duyệt dùng API giả lập; không cần tài khoản hoặc dữ liệu backend thật. Screenshot/trace tạo trong `frontend/test-results/`, đã gitignore.
- Nếu môi trường Windows giới hạn việc khởi chạy/dọn tiến trình con, chạy test trình duyệt trong terminal có quyền phù hợp. Không tắt các server khác để giải phóng cổng.

## Hành vi và giới hạn API

### Catalogue và chi tiết

- API catalogue giữ nguyên `GET /api/cars?limit=100`. Mọi lọc, sort và phân trang mới thực hiện trên tập xe đã tải. `count` của API hiện tại không phải tổng số xe trong database.
- Khi dataset lớn hơn 100 xe, cần BE bổ sung pagination/total/filter; FE không thể bảo đảm tìm hết toàn bộ xe ngoài tập đã tải.
- Query URL: `query`, `brand`, `bodyType`, `fuelType`, `transmission`, `marketStatus`, `seats`, `minPrice`, `maxPrice`, `sort`, `page`, `pageSize`. Các nhóm nhiều lựa chọn dùng query lặp. Mặc định 12 xe/trang, có 24/48.
- OR trong một nhóm, AND giữa các nhóm; null price chỉ bị loại khi có lọc giá, luôn đứng cuối khi sort giá. Giá không hợp lệ được thông báo và không áp dụng.
- Tìm tên/hãng/alias không phân biệt dấu, debounce 300 ms; Enter áp dụng ngay. URL khôi phục bộ lọc khi refresh/back/forward.
- Bảo hành dùng đúng tên tham số API hiện tại: `/api/warranties?car_id=...&brand=...`. Nguồn hiển thị lấy từ chính policy, không suy từ nguồn hiện diện xe.
- Đại lý lấy `/api/dealers`, lọc hãng phía FE và hiển thị tối đa 3 kết quả. Lỗi bảo hành/đại lý có retry riêng, không chặn thông tin xe.
- Link chat: `/chat?car=<id>&carName=<tên>`. URL cũ chỉ có `car` vẫn tra tên từ API chi tiết.

### Chat và tài khoản

- Giữ nguyên `/api/chat` và hợp đồng API C# hiện có; không sửa CSRF, version hay giao dịch xác nhận.
- Câu hỏi tư vấn chỉ được thêm vào lịch sử khi API trả thành công. Khi lỗi, giữ nội dung soạn và cung cấp nút gửi lại câu hỏi thất bại; không chèn tin nhắn trùng khi retry.
- Retry câu hỏi đơn hàng giữ requestId và payload cũ khi lỗi mạng/server. Conflict 409 tải lại trạng thái server để tiếp tục với version mới. Không tự động xác nhận draft nghiệp vụ.
- Lỗi cập nhật danh sách hội thoại sau khi gửi thành công được báo riêng, không biến câu hỏi đã gửi thành một thao tác cần gửi lại.
- Cache `sessionStorage` có namespace `autowise-chat:v1:<owner>:`. Chỉ giữ tạm nội dung tư vấn xe và nội dung soạn; tin nhắn nghiệp vụ luôn được tải lại từ server.
- Cache không đồng bộ giữa thiết bị/tab và có thể mất khi đóng tab. Khi storage bị tắt, chat vẫn gửi được.
- Logout/hết phiên/đổi tài khoản xóa cache của tài khoản cũ. Cache guest tách biệt; câu hỏi đơn hàng của guest được chuyển sang ô soạn sau đăng nhập, không tự gửi.
- “Hội thoại mới” bắt đầu phiên local sạch; chỉ tạo session C# khi gửi câu hỏi đơn hàng đầu tiên. Liên kết có `orderId` giữ lựa chọn đơn đó. Không tạo phiên server chỉ để tư vấn xe.
- Khi đọc tin nhắn phía trên, tin mới không kéo người dùng xuống; có nút tới tin mới.

## Kiểm chứng

- `npm.cmd run build`: đạt TypeScript + Vite.
- `npm.cmd test`: 24 test đạt, 7 file. Bao gồm URL/filter/null price/ranking/pagination, giới hạn 3 xe, request xe trả sai thứ tự, nguồn bảo hành, phân biệt 404/500, Enter/Shift+Enter/IME, retry không trùng, requestId ổn định, phục hồi cache, đổi tài khoản/hết phiên, lỗi storage, giữ vị trí đọc chat.
- Bộ test Edge: 18/18 trường hợp đã đạt (15 ca đạt trong lượt tổng, 3 ca catalogue đạt khi chạy lại sau khi sửa assertion để chờ checkbox đồng bộ URL). Bao gồm 6 luồng × 3 kích thước: catalogue/menu/drawer/so sánh/chi tiết, guest chat, customer chat/logout, public khi auth lỗi, admin, đăng nhập quay lại chat.
- Đã xem screenshot thực tế để sửa bố cục mobile; các kiểm tra này không tương đương một cuộc đánh giá accessibility đầy đủ.
- Chưa nghiệm thu tích hợp với BE thật: tại thời điểm kiểm tra không có dịch vụ lắng nghe ở `5080`/`5090`. Không tuyên bố giao dịch, CSRF, database, Bedrock hoặc nghiệp vụ mua xe đã đạt chỉ dựa trên mock.
- Smoke test cũ trong `services/owner-features/tests` chưa chạy và không sửa vì ngoài phạm vi FE. Một số script cũ chờ POST tạo session ngay khi bấm “Hội thoại mới”; hành vi mới tạo session khi gửi câu hỏi đơn hàng nên cần cập nhật bước chờ trước khi dùng lại.

## Phụ thuộc BE và phần ngoài đợt này

| Hạng mục | Cần thống nhất trước khi triển khai tiếp |
|---|---|
| Gallery ảnh xe | URL ảnh đại diện/danh sách ảnh, metadata và quy tắc ảnh lỗi |
| Tìm xe bằng ảnh | Endpoint, loại/kích thước file cho phép, cấu trúc kết quả và độ tương đồng |
| Catalogue toàn database | Filter/sort/pagination server và tổng kết quả độc lập page size |
| Lịch sử tư vấn bền vững | API lưu/đổi tên/xóa phiên, liên kết với lịch sử đơn hàng |
| Admin dữ liệu/RAG | CRUD/import, job status, retrieval test và quyền truy cập |

Không thêm gallery giả, nút upload không hoạt động hoặc màn hình CRUD giả vào sản phẩm. Các đề xuất ngoài kế hoạch này như xe tương tự vẫn thuộc backlog.

## Cập nhật admin — 2026-10-06

Đợt tối ưu admin từ `d8b2127` được bàn giao riêng tại [frontend-admin-delivery.md](frontend-admin-delivery.md). Tài liệu đó ghi checklist 5 đợt, test mock, smoke BE với bản ghi demo riêng và giới hạn nghiệm thu desktop. Playwright bổ sung project 1280px bên cạnh các độ rộng trước đây.
