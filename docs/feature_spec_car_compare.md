# Đặc tả màn hình so sánh xe — F-04

Ngày cập nhật: 2026-10-02. Backend Python/FastAPI; frontend React/TypeScript.

## Mục tiêu và phạm vi

Giúp người dùng đặt 2–3 mẫu xe cạnh nhau để đối chiếu dữ liệu có nguồn.
Route `/compare?ids=id1,id2,id3` lưu lựa chọn và thứ tự; URL có thể chia sẻ.
Màn hình hiện tại chỉ có bảng đơn giản, chưa có chọn/thay/xóa xe hoặc API riêng.
Đợt này hoàn thiện luồng so sánh; phần RAG do hai dev khác phụ trách.

## Luồng sử dụng

1. Từ kho xe, chọn tối đa 3 mẫu và bấm So sánh; từ chi tiết xe, mở so sánh
   với xe hiện tại; hoặc mở trực tiếp `/compare` để chọn xe.
2. Trên màn hình so sánh, tìm theo tên/hãng/alias rồi thêm xe vào chỗ trống.
3. Thay xe bằng bộ chọn tại cột tương ứng hoặc xóa xe bằng nút có tên xe.
4. Mỗi thay đổi cập nhật URL ngay, giữ thứ tự các cột và đồng bộ lựa chọn lưu local.
5. Bấm Sao chép liên kết để chia sẻ; nếu clipboard không khả dụng, hiển thị URL
   để người dùng sao chép thủ công. Browser Back/Forward phục hồi URL trước đó.

URL là nguồn chính trên màn hình so sánh. Không tự khôi phục local storage khi URL
không có IDs: trang trống luôn cho phép bắt đầu lựa chọn mới. Local storage chỉ giúp
kho xe giữ lựa chọn; lỗi storage không chặn thao tác.

## Bố cục và hành vi

- Breadcrumb, tiêu đề, số lượng xe và nhắc giới hạn 2–3 mẫu.
- Bộ chọn xe có tìm kiếm, nhãn rõ ràng, nút thêm/thay và hủy.
  Không cho chọn xe đã có trong các cột khác; có trạng thái tải/lỗi/thử lại.
- Thẻ xe ở đầu bảng: hãng, tên dẫn đến chi tiết, giá tham khảo, thay/xóa.
  Dùng ký hiệu hãng cho MVP; chưa có API ảnh để hiển thị ảnh xe thật.
- Bảng HTML có caption và header, nhóm thông tin bên dưới. Trên mobile bảng
  cuộn ngang trong container riêng, không kéo rộng toàn trang; giữ cột tiêu chí.
- Có tùy chọn chỉ xem thông tin khác nhau. Giá trị null bằng nhau là giống nhau;
  null khác 0. Metadata nguồn/ngày giữ nguyên cạnh thông tin giá.
- Không tạo lời khuyên thắng/thua hoặc tổng điểm từ các thông số.

## Các nhóm thông tin

| Nhóm | Trường | Đơn vị/cách hiển thị |
|---|---|---|
| Giá và thị trường | Giá từ, ngày giá, nguồn giá, trạng thái Việt Nam | VND; ngày vi-VN; link nguồn |
| Kiểu xe và vận hành | Kiểu thân xe, nhiên liệu, hộp số, động cơ, công suất | Text; công suất hp |
| Không gian | Số ghế, dài/rộng/cao, chiều dài cơ sở | chỗ; mm |
| Bảo hành | Thời hạn, giới hạn quãng đường | tháng; km |
| Nguồn | Nguồn hiện diện xe | link chi tiết nguồn |

Không có dữ liệu ghi `Chưa có dữ liệu`, không biến null thành 0 hoặc đoán thông số.
Giá thiếu nguồn không được làm căn cứ xếp hạng. Trạng thái lịch sử/nhập tư nhân phải
hiển thị rõ; không coi giá cũ là báo giá xe mới hoặc xe đang phân phối chính hãng.
Thông tin ở cấp model, chưa đại diện cho mọi phiên bản/đời xe; bảo hành cần xác nhận
VIN/ngày bán. Các chỉ số là đối chiếu tham khảo, không phải báo giá thời gian thực.

## API contract

`GET /api/cars/compare?ids=id1,id2,id3`

- HTTP 200: `{ "items": [CarDto, ...], "missingIds": ["unknown_id"] }`.
- Thứ tự `items` theo thứ tự IDs đầu vào, không theo giá hoặc thứ tự database.
- `CarDto` giữ JSON camelCase và kiểu số/null. Thêm `enginePowerHp`, `lengthMm`,
  `widthMm`, `heightMm`, `wheelbaseMm` vào DTO xe; đây là dữ liệu có sẵn trong schema.
- HTTP 422 nếu không có 2–3 ID khác nhau, ID rỗng hoặc lựa chọn trùng.
- ID không tồn tại bị bỏ khỏi `items`, trả trong `missingIds`. UI cảnh báo và cho
  xóa/thay lựa chọn đó; không âm thầm đổi URL hoặc chuyển xe khác vào chỗ của nó.
- Nếu xe hợp lệ còn ít hơn 2, UI giữ lựa chọn hợp lệ và hướng dẫn thêm xe.
- Query database có tham số; route `/compare` phải khai báo trước `/{car_id}`.
- Use case kiểm tra giới hạn/thứ tự nằm trong application, không import HTTP/SQL driver.
- API catalogue `/api/cars?limit=100` chỉ cấp dữ liệu cho bộ chọn trong dataset MVP
  hiện có 50 xe. Khi corpus vượt 100 xe cần chuyển bộ chọn sang search/pagination server.

Không sửa schema database hoặc triển khai embedding, LLM, chatbot recommendation.
Không thêm dealer summary vì chưa có API so sánh đại lý; người dùng xem ở màn hình
Đại lý hiện có. Không thêm giá theo trim hoặc tổng chi phí sở hữu.

## Trạng thái và trường hợp biên

| Trạng thái | Kết quả |
|---|---|
| Không chọn xe | Hướng dẫn và bộ chọn để bắt đầu |
| Một xe | Hiển thị lựa chọn, yêu cầu thêm xe thứ hai |
| URL trùng IDs | Chuẩn hóa bỏ trùng ở UI, thông báo cho người dùng |
| URL hơn 3 IDs | Giữ 3 ID đầu, thông báo giới hạn; canonical URL phản ánh lựa chọn |
| URL có ID không tồn tại | Cảnh báo, cho xóa/thay; các xe hợp lệ vẫn giữ thứ tự |
| API lỗi | Giữ lựa chọn, báo lỗi và nút Thử lại; không coi lỗi là không có xe |
| Chuyển URL khi đang tải | Hủy request cũ, không ghi kết quả cũ vào lựa chọn mới |
| Chỉ xem khác nhau nhưng tất cả giống nhau | Thông báo không có thông số khác nhau |

## Tiêu chí nghiệm thu và kiểm chứng

- Có thể bắt đầu ở `/compare`, thêm xe, thay/xóa và sao chép URL mà không quay về kho.
- UI/API giới hạn 3 xe và chặn duplicate; giữ thứ tự theo URL và Back/Forward.
- Đối chiếu đủ nhóm với nguồn/ngày giá, số và đơn vị đúng; 0 không bị coi là thiếu.
- Không đưa ra đánh giá chủ quan từ công suất/kích thước hoặc giá không cùng bối cảnh.
- Kiểm tra link từ chi tiết xe và kho xe; storage bị hỏng không crash màn hình.
- Tests backend xác minh route precedence, thứ tự, missing IDs, invalid count/duplicates.
- Frontend build pass; browser kiểm tra empty/one/two/three cars, replace/remove,
  differences, share và mobile overflow bằng fixture được ghi rõ.
- PostgreSQL thực cần kiểm tra riêng; mock tests không chứng minh SQL integration.

## Kết quả triển khai

Document được cập nhật trước khi sửa code. Đã triển khai use case Python,
route API riêng, DTO dimensions/power, màn hình chọn/thay/xóa và bảng HTML.
Không thay đổi schema hoặc code RAG. Truy xuất tối đa 3 car detail có tham số,
giữ thứ tự input; validation xảy ra trước truy vấn repository.

- 31 backend tests pass, gồm 10 tests mới cho comparison.
- Frontend TypeScript/Vite build pass.
- Checks độc lập cho chuẩn hóa lựa chọn và storage hỏng/bị chặn pass.
- Browser fixture: empty/one/two/three cars, duplicate exclusion, replacement,
  removal, Back/Forward, share success, differences, canonical URL, missing ID,
  outage giữ URL/nút retry; mobile không overflow ngang toàn trang.
- `car-compare-preview.png` là screenshot với dữ liệu kiểm thử, không phải báo giá.
- Chưa kiểm chứng PostgreSQL thực/container ở đợt này. Các trường numeric là cột
  hiện có của schema; mock tests không xác minh dữ liệu seed thực.
