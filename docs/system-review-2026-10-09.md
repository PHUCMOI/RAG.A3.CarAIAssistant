# Review hệ thống AutoWise — 09/10/2026

## Phạm vi và kết luận

Review working tree hiện tại, gồm các thay đổi Bedrock chưa commit: Python API/catalogue/RAG,
image service, C# auth và nghiệp vụ, React, PostgreSQL/index, Docker/Nginx và các test liên quan.
Các luồng demo chính hoạt động, nhưng còn lỗi ở ranh giới tin cậy và xử lý đồng thời. Các smoke
Bedrock trước đó đạt không thay thế kiểm thử tải, API không đi qua frontend và luồng chuyển guest
sang đăng nhập. Review này không sửa implementation.

## Phát hiện theo ưu tiên

### R1 — P1: Composer công khai coi dữ liệu người gọi là dữ liệu đã xác thực

- Vị trí: `backend/app/routers/chat.py:38–42`, `backend/app/infrastructure/ai/answer_grounding.py:33–80`;
  Nginx chuyển mọi `/api/` tới Python và Python không có xác thực dịch vụ nội bộ.
- Request không có cookie tới `/api/chat/compose` có thể tự cung cấp `verifiedData`, `Sections`,
  trạng thái và đường dẫn `/account/orders/...`. Model chỉ kiểm nội dung dựa trên dữ liệu đó;
  backend tạo citations và trả nhãn grounded cho dữ liệu chưa hề đọc từ tài khoản/database.
- Tái hiện Bedrock thật: gửi đơn không tồn tại `AW-REVIEW-NOT-REAL`, tự khai trạng thái Hoàn thành
  và đã bàn giao. HTTP 200 trả đúng lời bịa đó, `grounded=true`, `status=ok`, citation tới UUID
  rỗng do request tự đặt. Không truy cập hoặc thay đổi đơn của người khác trong phép thử này.
- Endpoint `/api/chat` cũ cũng nhận `imageMatch` từ client thay vì bắt buộc evidence ảnh được
  tạo phía server; đây là cùng ranh giới tin cậy cần kiểm lại khi đóng các endpoint nội bộ.
- Xử lý: bảo vệ composer bằng service authentication hoặc tách khỏi public ingress; schema
  public chỉ nhận input thô. Evidence/URL/trạng thái xác thực phải do công cụ/backend dựng.
  Thêm quota cho các endpoint public gọi AWS, vì hiện chúng không giới hạn lượt/tokens theo khách.

### R2 — P1: Guest chat ảnh có vòng chờ connection database

- Vị trí: `backend/app/routers/guest_chat.py:35,64–65`,
  `backend/app/application/rag/dependencies.py:25–28`, `backend/app/core/database.py:87–95`.
- `Depends(get_rag_service)` acquire một connection và giữ đến khi turn kết thúc. Nhánh ảnh
  gọi image service; image service gọi lại `/api/chat`, endpoint này cần connection thứ hai
  từ cùng pool. Pool mặc định có 10 connections.
- Khi số lượt ảnh đồng thời chiếm hết pool, lượt ngoài giữ connections chờ lượt trong;
  lượt trong và các request catalogue chờ connections mà lượt ngoài chưa thể trả.
- Tái hiện cô lập với PostgreSQL thật và pool 2: hai HTTP guest turns có understanding/network
  fixtures để không gọi AWS; callback image gọi endpoint catalogue có cùng dependency acquire.
  Kết quả `poolSize=2`, `idle=0`, cả hai lượt và một GET catalogue đều chưa hoàn thành. Các task
  được cancel và pool thử nghiệm đóng; không gây nghẽn service đang chạy.
- Xử lý: chỉ acquire database trong nhánh cần retrieval và trả connection trước các lời gọi mạng;
  dependency của raw-turn không giữ connection xuyên suốt điều phối ảnh. Cần test concurrency
  với pool nhỏ và timeout acquire hữu hạn.

### R3 — P1: API ảnh đọc đường dẫn file tùy ý trên server trước khi kiểm kích thước

- Vị trí: `image_service/app/routers/chat.py:47–50`; API này được expose qua Nginx và cổng 8000.
- JSON `image_url` được hiểu thành `Path` trên server rồi `read_bytes()` toàn bộ, không giới hạn
  thư mục hoặc lượng bytes đọc. Kiểm kích thước trong retriever xảy ra sau đó.
- Tái hiện bằng file fixture `/tmp/review-outside-dataset.bin`: TestClient của router thật,
  retriever/LLM fixtures, HTTP 200 và đúng bytes ngoài dataset đã tới retriever. File thử được xóa.
- Nguy cơ: đọc file ảnh nội bộ ngoài vùng công khai; file rất lớn hoặc special file đọc không
  kết thúc có thể chiếm hết RAM/chặn worker. Không thực hiện phép thử gây cạn RAM hoặc đọc secret.
  Phép thử này không chứng minh endpoint trả raw contents của mọi file văn bản cho client.
- Xử lý: bỏ đường dẫn filesystem khỏi contract public, nhận upload có giới hạn bytes;
  nếu cần ảnh mẫu, dùng ID allowlist và kiểm resolved path trong thư mục cho phép.

### R4 — P2: Ảnh bị mất khi guest đăng nhập để hỏi đơn

- Vị trí: `frontend/src/pages/ChatPage/index.tsx:68–75`,
  `frontend/src/features/orders/OrderAssistantPage.tsx:67–71`.
- Khi `requiresLogin=true`, guest chỉ lưu chuỗi `pending-question`, rồi xóa attachment.
  Customer khôi phục chuỗi câu hỏi, nhưng `photo` khởi tạo null; guest history cache còn chủ động
  bỏ data URL dài. Vì vậy “xe trong ảnh có phải xe của đơn AW-…?” mất ảnh sau đăng nhập.
- Bằng chứng: contract/state source; browser regression hiện có chỉ kiểm giữ câu hỏi text sau login,
  chưa kiểm chuyển ảnh qua login. Không đánh đồng test text thành test ảnh.
- Xử lý: giữ một pending turn gồm text + attachment an toàn qua chuyển phiên, có TTL và xóa
  sau xử lý; thêm browser test guest → login → turn nghiệp vụ vẫn có ảnh.

### R5 — P2: Hai mẫu xe gần hòa điểm vẫn không đánh dấu uncertain

- Vị trí: `image_service/app/core/image_retriever.py:184–195`,
  `services/owner-features/src/AutoWise.OwnerFeatures.Infrastructure/UnifiedAssistant.cs:62`.
- Margin chỉ quyết định nhãn high. Nhánh medium đặt `uncertain` chỉ dựa trên top score < 0.55,
  nên hai mẫu xe khác nhau gần hòa điểm cao vẫn được coi là không uncertain. C# chỉ đọc cờ này.
- Tái hiện retriever thật với index/extractor fixtures: scores 0.900 và 0.899 trả
  `confidence=medium`, `margin=0.001`, nhưng `uncertain=false`.
- Điều này làm thiếu cảnh báo khi lựa chọn giữa hai mẫu không rõ, nhất là đối chiếu mẫu với đơn.
- Xử lý: uncertainty cần xét margin/calibration; khi kết quả gần hòa phải cảnh báo hoặc hỏi thêm
  ảnh, và truyền confidence/margin qua các adapter. Cần đánh giá với tập ảnh kiểm thử riêng.

### R6 — P2: Lịch sử chat lưu toàn bộ ảnh base64 vào một JSONB và trả toàn bộ mỗi lượt

- Vị trí: `services/owner-features/src/AutoWise.OwnerFeatures.Infrastructure/CatalogueAssistant.cs:22,52,96–97`,
  `UnifiedAssistant.cs:71`, `OrderAssistant.cs:13–16,199–209`.
- Một ảnh được phép 10 MB; ảnh được lưu data URL trong message. Giới hạn chỉ là 100 turns,
  không có tổng bytes hoặc pagination messages. Mỗi lần gửi lại deserialize/serialize và trả
  toàn bộ lịch sử, frontend cũng giữ toàn bộ response.
- Theo giới hạn hiện tại, 100 ảnh gần 10 MB có thể tạo hơn 1.3 GB base64 cho một session, chưa
  tính evidence/text. Đây là phân tích giới hạn source, không phải đã tạo session 1.3 GB.
- Xử lý: lưu ảnh ở blob/object storage có quota, chỉ giữ ID/URL trong history; giới hạn tổng
  bytes và phân trang messages. Không dùng JSONB chat làm kho ảnh.

### R7 — P2: Rate limit đăng nhập dùng IP của Nginx cho mọi khách

- Vị trí: `services/owner-features/src/AutoWise.OwnerFeatures.Api/Program.cs:65`, `frontend/nginx.conf`.
- Partition login dùng `Connection.RemoteIpAddress` với 10 lượt/phút. API nằm sau Nginx;
  không có cấu hình trusted forwarded headers và middleware `UseForwardedHeaders`.
- Qua website, các khách cùng xuất hiện với địa chỉ của proxy, nên họ dùng chung một bucket;
  một khách thử nhiều lần có thể chặn đăng nhập của khách khác. Đây là phân tích cấu hình,
  không chạy burst gây khóa bucket trong lúc các smoke khác dùng hệ thống.
- Xử lý: cấu hình trusted proxy và forwarded IP đúng, kết hợp giới hạn tài khoản/IP với ngưỡng
  phù hợp; không tin `X-Forwarded-For` tùy ý từ internet.

## Kiểm tra và giới hạn

- Python backend: 158 passed, 1 skipped.
- Image service: 18 passed.
- C# với PostgreSQL thật: 121 passed, 3 skipped trước khi opt-in AWS/HTTP.
- Frontend unit: 67 passed, 17 test files.
- Live Bedrock context + summary: passed. Live HTTP đa chủ đề gặp 503 khi chạy đồng thời;
  log Python xác nhận `ThrottlingException` sau retry, không phải thiếu credentials.
- Live HTTP context/session isolation: passed. Chạy lại riêng HTTP đa chủ đề: passed (1 phút 6 giây).
  Như vậy cả ba test AWS/HTTP opt-in đã có lượt pass, nhưng đợt chạy đồng thời có một failure;
  hệ thống vẫn cần giới hạn throughput/concurrency theo quota AWS nếu có nhiều người dùng.
- Browser 375/1280 px: lượt đầy đủ có 62 passed, 20 skipped, 2 timeout. Hai case mobile timeout
  là catalogue/filter/compare/detail và account outage; chạy lại riêng với cùng timeout 30 giây
  đều passed (8.5 giây và 3.9 giây), không sửa code/test. Đây là 64 case có lượt pass qua hai đợt,
  không phải một lượt full suite xanh. Các skip chủ yếu là desktop/admin cases theo viewport.
- Profile concurrency đã thử trên user fixture riêng: 8 requests cùng version, chỉ 1 HTTP 200,
  7 HTTP 409, final version 2. Model có ProfileVersion/SecurityVersion concurrency tokens;
  không có phát hiện mất cập nhật ở phép thử này. User fixture đã xóa.

Smoke vẫn có giá trị với quyền sở hữu đơn/session, CSRF, idempotency/replay và metadata persistence.
Phát hiện R1 không chứng minh IDOR vào đơn thật; R3 không chứng minh trả raw secret. Không thay đổi
AWS credentials, không đưa secret vào báo cáo, không tạo thông báo email/SMS bên ngoài.

## Cấu hình triển khai và tài liệu

Compose hiện dành cho demo/development: `Development`, `SeedDemo=true`, tài khoản demo cố định,
database mật khẩu mặc định và ports catalogue/image/database publish ra host. Không dùng nguyên
cấu hình này cho môi trường có dữ liệu thật; cần profile triển khai riêng, HTTPS, credentials/roles
riêng, hạn chế ports, durable auth keys, quota AWS và quy trình migration/backup.

README còn mô tả image integration chưa triển khai và template fallback, khác pipeline Bedrock
đang chạy. Cần cập nhật phần trạng thái để tránh người mới hiểu sai khả năng và cách vận hành.

## Cập nhật xử lý — 10/10/2026

Bảy phát hiện đã có bản sửa và kiểm chứng; xem [báo cáo sửa lỗi](system-review-fixes-2026-10-10.md). Nội dung review phía trên phản ánh trạng thái trước khi sửa.
