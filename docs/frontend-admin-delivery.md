# Bàn giao tối ưu admin — 5 đợt

Ngày nghiệm thu: 2026-10-06. Nhánh: `feat/frontend`. Mốc bắt đầu: `d8b2127` (`refactor frontend`).

Phạm vi: frontend và tài liệu; không sửa backend, schema, endpoint, payload hoặc nghiệp vụ. Các thao tác ghi khi smoke test chỉ thực hiện trên tài khoản và bản ghi demo mới, riêng cho đợt này. Bàn giao bằng một commit mới `refactor admin frontend`; không amend, push hoặc merge.

## Checklist triển khai

| Đợt | Chức năng đã hoàn tất | Kiểm tra |
|---|---|---|
| 1 | Thành phần tiêu đề, bảng có vùng cuộn, badge, phân trang, trạng thái rỗng và phản hồi dùng chung; CSS admin. Bảng đơn đủ thông tin, 12 mục/trang. URL `query/status/delayed/page`; debounce 300 ms, Enter, refresh/back/forward. Retry giữ bộ lọc, rỗng có xóa lọc. | Mock trình duyệt cả hai độ rộng; đọc API local và bảng đơn thật. |
| 2 | Tab `overview/payments/delivery/documents/history`, tab không hợp lệ về Tổng quan; hỗ trợ phím mũi tên/Home/End. Tóm tắt luôn hiển thị. Form theo tab, hồ sơ tách thanh toán, đối soát không lặp danh sách giao dịch. Checkbox và khoảng cách thống nhất. Tạo đơn chia nhóm, tìm trên dữ liệu đã tải, số nguyên VND có định dạng, bước xem lại trước khi POST. | Mock URL/tab/409/giữ bản nhập/đổi ID; live tạo đơn, ghi và xác nhận khoản thu, hồ sơ và lịch giao. |
| 3 | Bảng yêu cầu mua dùng bộ lọc API và phân trang theo URL. Chi tiết nhóm liên hệ, nhu cầu, lịch sử và xử lý. Form chuyển đơn thu gọn, giữ dữ liệu lỗi. Đề nghị có loại, trạng thái, lý do, phản hồi, liên kết đơn; thông báo duyệt chưa tự hủy/hoàn tiền. | Mock chuyển đơn lỗi và đề nghị 409; live tiếp nhận, phản hồi, chuyển đơn và duyệt đề nghị trên dữ liệu riêng. |
| 4 | Lịch hẹn có danh sách trước, tạo khung giờ và xử lý theo khung thu gọn. Khách hàng tìm trên danh sách đã tải, số lượng/rỗng, form mở riêng, lỗi tải/tạo độc lập. Bảng phiếu hỗ trợ, phản hồi dạng hội thoại, nội bộ màu/nhãn riêng. Đổi ID reset bản nhập/phân trang/trạng thái gửi; kết quả cũ bị bỏ qua. Khóa ghi trong lúc tải trang phản hồi. | Mock lỗi, retry, ID trả sai thứ tự, phân trang và bản nhập; live tạo/xác nhận lịch, tiếp nhận phiếu, phản hồi nội bộ và kiểm tra customer không thấy ghi chú. |
| 5 | Test hành vi, build, hồi quy public/customer, smoke BE local; bảng/dropdown/focus kiểm tra desktop 1280px và 1440px; tài liệu phạm vi và giới hạn. Artifact không đưa vào commit. | Kết quả cuối được ghi bên dưới. |

## Cấu trúc thay đổi

- `frontend/src/features/admin/ui.tsx`: tiêu đề, badge, phản hồi, bảng, phân trang, empty và đồng bộ URL.
- `frontend/src/features/admin/useAdminWrite.ts`: khóa gửi ngay bằng ref, lỗi/thành công, chặn ghi sau 409 và tải phiên bản mới theo thao tác của người dùng.
- `AdminOrdersList.tsx`, `AdminLists.tsx`, `AdminCreateOrder.tsx`, `AdminEvidence.tsx`: giao diện admin dùng API hiện có.
- `admin.css`: bố cục/bảng/form/tab admin; selector bố cục và điều khiển đặt trong `.website-shell.admin-shell`, các class tiện ích mang tiền tố `admin-`.
- Các trang dùng chung trong `features/orders` và `features/account` giữ nhánh hiển thị customer. Sửa lỗi cần thiết: remount chi tiết theo ID để không giữ dữ liệu/form từ bản ghi trước.

## Quy tắc ghi và lỗi

- Dùng `request()` hiện có: CSRF, phân quyền, `Idempotency-Key` và payload nghiệp vụ được giữ nguyên.
- Khóa gửi đồng bộ, không tự retry POST/PUT/PATCH. Retry phản hồi hỗ trợ cùng nội dung giữ body/version và khóa chống gửi trùng của lần thất bại.
- 409 giữ bản nhập, khóa gửi; người dùng phải tải phiên bản mới, đọc thông báo kiểm tra và chủ động gửi lại. Tải mới thất bại không mở khóa.
- Tải lại chi tiết admin không remount các form; key hồ sơ ổn định theo ID, payload lấy version mới.
- Nếu đã ghi thành công nhưng GET sau đó lỗi, hiển thị trạng thái đã lưu và lỗi tải dữ liệu riêng, chặn ghi tiếp vào dữ liệu cũ. Nút tải mới chỉ gọi GET.
- Đổi ID đơn/phiếu/yêu cầu mua tạo phạm vi trạng thái mới; request cũ không cập nhật trang mới. Không tự hủy một thao tác backend đã tiếp nhận khi rời trang.

## Chạy kiểm tra

Từ `frontend/`, Node/npm và Microsoft Edge đã cài:

```powershell
npm.cmd run build
npm.cmd run test
npm.cmd run test:browser -- tests/browser/admin.spec.ts --project width-1280 --project width-1440 --output test-results/admin-release
npm.cmd run test:browser -- tests/browser/frontend.spec.ts --project width-1440 --output test-results/customer-regression
```

Test trình duyệt khởi động Vite riêng ở `5175`, dùng API mock. Cổng này cần trống. Admin test bỏ qua các project dưới 1000px; đây không phải kết quả nghiệm thu mobile.

Smoke local cần FE `5173`, Python `5080`, orders API `5090` và database demo:

```powershell
node tests/smoke/admin-local.cjs --write-demo
```

Script chỉ nhận localhost/127.0.0.1 và yêu cầu cờ ghi demo rõ ràng. Mỗi lượt mới tạo dữ liệu riêng; không tự retry ghi. Có thể tiếp tục báo cáo đã có bằng `--resume-report`; các bước đã đạt được bỏ qua. Tài khoản admin demo mặc định dùng trong script; có thể thay bằng `AUTOWISE_ADMIN_EMAIL`, `AUTOWISE_ADMIN_PASSWORD`, `AUTOWISE_LOCAL_URL`. Không chạy với dữ liệu thật.

Báo cáo JSON/screenshot/trace tạo trong `frontend/test-results/`, không được commit. `dist/` và `tsconfig.tsbuildinfo` không thuộc thay đổi bàn giao.

## Kết quả cuối

- Build production: đạt.
- Vitest/RTL: 54/54 test, 15 file, đạt.
- Edge admin mock: 32/32 lượt cho 16 ca ở 1280px/1440px đạt: suite 30/30 và 2/2 lượt bổ sung khóa phân trang khi ghi. Sáu lượt hồi quy lịch/đề nghị sau thay đổi cuối cũng đạt.
- Edge hồi quy public/customer: 16/16 ở 1440px, đạt; trang chủ, catalogue, chi tiết, compare, dealers, login, chat, cache/logout và header.
- Smoke BE: 10 bước đạt; quét 10 route admin ở 1280px/1440px và đọc chi tiết đơn customer. Không có lỗi JavaScript trong các lượt live đã chạy. Dropdown có kiểm tra điểm click thực tế, Tab/Escape trả focus; tab đơn kiểm tra phím mũi tên.
- API version cũ trên đơn demo trả 409; xác nhận thanh toán, checklist, lịch giao, chuyển yêu cầu mua và phản hồi hỗ trợ hoạt động với CSRF thực.
- Customer API không trả ghi chú nội bộ; duyệt đề nghị hủy không thay trạng thái hoặc khoản thu/hoàn của đơn.

Dữ liệu demo riêng để đối chiếu:

| Loại | ID |
|---|---|
| Khách | `0f9d3938-2b28-48eb-a2da-c1c54b6682d5` |
| Đơn | `551f1c44-7f88-40e8-8e85-ecfe1f1ddfdc` |
| Yêu cầu mua | `29090089-36e3-4163-ae2a-9681e5514070` |
| Đề nghị | `4f72c7b6-15ff-455c-9a37-2bf94eacece2` |
| Khung giờ | `8098e760-ee01-4529-8e12-64897cd4c787` |
| Lịch hẹn | `a833c380-7087-434c-ba85-5a345a13ac07` |
| Phiếu hỗ trợ | `6fabd1ea-6104-4fae-997e-8c6505b799f3` |

## Giới hạn và phần chưa nghiệm thu

- `/admin/data`, `/admin/rag` và thống kê không có API vẫn ngoài phạm vi.
- Catalogue cho form lấy tối đa 100 xe; tìm nhanh chỉ trên dữ liệu đã tải. Khách hàng tìm FE trên endpoint danh sách tài khoản đã tải; hiển thị số lượng của tập này.
- Danh sách đơn/yêu cầu/phiếu/lịch/đề nghị dùng tổng và phân trang từ API. Không thêm tìm/lọc toàn hệ thống khi endpoint không hỗ trợ.
- API đề nghị admin chưa hỗ trợ lọc theo `requestId`; liên kết đến danh sách giữ hành vi hiện có, không tuyên bố đã lọc đúng một đề nghị.
- Live đã kiểm tra tiếp nhận/phản hồi/chuyển đơn, duyệt đề nghị, mở/xác nhận lịch và tiếp nhận/phản hồi nội bộ hỗ trợ. Các nhánh từ chối/rút yêu cầu, đề xuất/hủy lịch, hoàn tiền, hoàn tất/hủy đơn và resolve/close phiếu chưa chạy toàn bộ với BE trong đợt này. Form và endpoint cũ được giữ, không coi mock là nghiệm thu tích hợp cho các nhánh đó.
- Mất kết nối, trả sai thứ tự, chặn gửi trùng, giữ form sau lỗi và hết phiên được kiểm tra bằng mock; lỗi 409 có kiểm tra cả mock và API local. Chưa kiểm tra tải lớn, trình duyệt khác, môi trường triển khai hoặc mobile.
- Không có lỗi đã biết trong các luồng đã kiểm tra; kết luận này không thay thế kiểm thử các nhánh tích hợp liệt kê ở trên.
