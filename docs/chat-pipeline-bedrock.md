# Pipeline chat dùng Amazon Bedrock

Mọi bước LLM dùng Bedrock: hiểu câu hỏi, phân loại/chọn dữ kiện RAG, giải quyết context đơn hàng,
đặt tên hội thoại, viết câu trả lời và kiểm chứng câu trả lời cuối. Embeddings E5/CLIP phục vụ
retrieval vẫn dùng model/index hiện có.

## Điều phối

- Guest gửi câu hỏi/ảnh thô vào `POST /api/chat/turns`. Python hiểu câu hỏi rồi gọi RAG hoặc
  image service; câu hỏi về tài khoản/đơn yêu cầu đăng nhập và không truy cập dữ liệu riêng tư.
- Customer gửi câu hỏi/ảnh thô vào `POST /api/orders-service/assistant/sessions/{id}/turns`.
  C# kiểm tra quyền sở hữu session, requestId/version, lấy history trên server và gọi bước hiểu
  câu hỏi Python. Backend chọn catalogue/ảnh hoặc công cụ đơn hàng.
- Ảnh kèm câu hỏi về đơn không bị ép vào catalogue. Backend tìm ảnh, chỉ dùng top 1 sau khi
  tính confidence với tập ứng viên, rồi đối chiếu carId với xe của đơn thuộc người đăng nhập.
  Kết quả chỉ xác nhận mẫu xe tương đồng/khớp catalogue, không xác nhận chiếc xe hoặc VIN thực tế.

Các endpoint cũ được giữ để tương thích; frontend chat dùng các endpoint turns mới.

## Câu trả lời cuối và nguồn

`compose_grounded` thực hiện hai bước Bedrock với prompt riêng:

1. Viết lời trả lời từ dữ liệu truy xuất/công cụ đã xác thực.
2. Kiểm chứng mọi phát biểu với đúng chủ thể, thuộc tính, trạng thái, phủ định, điều kiện nguồn,
   dữ liệu còn thiếu và độ không chắc chắn; trả các contextId hỗ trợ nội dung cuối.

Backend gắn `requiredQualifiers` từ evidence vào lời trả lời trước khi audit để model không
làm mất giới hạn nguồn. Phần cảnh báo này không bỏ qua audit hoặc hợp thức hóa phát biểu mâu thuẫn.
Backend còn kiểm tra số, đơn vị, URL/HTML, các trường hợp đảo giá giữa xe trong văn bản/bảng và
cảnh báo ảnh. contextId không tồn tại, trùng lặp hoặc câu trả lời thực tế không có nguồn sẽ bị từ chối.
Cho phép sửa tối đa một lần; nếu không xác minh được hoặc AWS lỗi, trả 503.
Không trả template dưới nhãn một câu trả lời Bedrock thành công.

`grounded`, `status`, `evidence`, `citations` lấy từ kết quả kiểm chứng cuối. Citations được lọc
từ registry nguồn của retrieval/công cụ, model không được tạo URL hoặc sourceId mới.
Adapter ảnh giữ các trường này; C# lưu chúng trong payload hội thoại mà không cần migration schema;
frontend hiển thị nguồn và tình trạng thiếu dữ liệu, giữ chúng sau khi tải lại.

`retrievedContextIds` giữ context IDs theo thứ tự retrieval, trước khi reviewer lọc evidence.
Runner dùng trường này cho precision/recall; evidence cuối chỉ dùng đánh giá grounding/citations.

Với discovery, các facts giá/số chỗ/kiểu xe lấy từ catalogue SQL được gắn evidence riêng
(ID document gốc, metadata `retrievalOrigin=sql-catalogue`) nếu ranked contexts chưa hỗ trợ đủ. Các evidence SQL này chỉ phục vụ
generation/audit và citations; không thêm vào `retrievedContextIds` để làm tăng metric.
Composer nhận ngày UTC từ server để audit ngày nguồn với đúng mốc thời gian.

Kiểm chứng ngữ nghĩa dùng LLM và có thể sai; nó là một lớp kiểm tra bổ sung, không phải bằng chứng
toán học cho mọi cách diễn đạt. Các kiểm tra trực tiếp và quyền sở hữu công cụ vẫn do backend thực hiện.
Mỗi turn có thêm một lần gọi kiểm chứng, có thể thêm một cặp gọi khi cần sửa; latency và chi phí AWS tăng.

## Vận hành

Compose mặc định khởi động PostgreSQL, Python API, C# API, image service và web.
Nginx cho phép request 15 MB (đủ ảnh 10 MB mã hóa base64); timeout proxy 300 giây,
HTTP giữa dịch vụ 240 giây. Image search cần weights/index tương thích. Backend Docker dùng PyTorch CPU.

Điền AWS credentials vào `.env` (được ignore), rồi cập nhật environment container:

```powershell
docker compose up -d api orders-api
python scripts/smoke_text_rag.py
```

Đối với smoke từ Windows, cần cài requirements-rag và dùng cùng E5 revision/index.
Có thể chạy `docker compose exec api python scripts/smoke_text_rag.py --api-url http://localhost:8080`.
Với database cũ, áp dụng `database/007_text_rag.sql`; nếu text index trống, chạy
`docker compose exec api python scripts/build_text_index.py` trước smoke. Script xác minh số xe,
nguồn và revision embedding, chỉ embed documents mới hoặc đã thay đổi.

Máy hiện tại dùng profile `rag-a3` trong `%USERPROFILE%/.aws/credentials`.
File `.env` chỉ đặt `AWS_PROFILE`, `COMPOSE_FILE` và `COMPOSE_PATH_SEPARATOR` để Compose tự
áp dụng `docker-compose.bedrock.yml`; credentials được mount chỉ đọc, không sao chép vào source.
Khi API được recreate, Nginx phân giải lại tên dịch vụ Docker thay vì giữ IP cũ.

## Kiểm tra ngày 09/10/2026

- Python backend/adapter ảnh: kiểm tra hồi quy, đảo giá, trạng thái không có nguồn, references không
  hợp lệ, final grounding không kế thừa draft, điều phối guest và sparse context cũ.
- C# với PostgreSQL thật: phiên của đúng chủ, replay không gọi model lại, persistence metadata,
  ảnh khớp/không khớp/chưa chắc chắn và từ chối dữ liệu đơn của người khác. AI/image provider trong
  các test này dùng fixtures.
- Frontend unit và browser desktop/mobile: endpoint thống nhất, retry, login từ guest,
  gửi ảnh + câu hỏi đơn thô, nguồn và trạng thái còn sau reload. Browser API dùng fixtures.
- Docker: cả năm dịch vụ đã khởi động. Health của Python, C# và image qua Nginx trả 200.
  Image search qua CLIP/index thật trả 200. Request guest với ảnh hơn 1 MB qua Nginx không bị 413.
- AWS profile thật gọi thành công Claude Haiku 4.5. Năm nhóm câu hỏi đã qua bước viết và kiểm chứng
  cuối, trả `bedrock-natural`, `grounded=true`, `status=ok`; lượt đầu dùng structured retrieval vì
  database chưa có index. Đã áp dụng migration `007_text_rag.sql` và tạo 231 documents có E5 embedding
  đúng revision cho 50 xe; validation index trả `ready=true`.
- Smoke sau khi tạo index: **5/5 đạt**, gồm tìm xe, thông số, giá, bảo hành và so sánh.
  Tất cả dùng vector/hybrid retrieval, `bedrock-natural`, final `grounded=true`; kết quả local
  nằm ở `eval/live_smoke_text.json` (được ignore). Backend regression cuối: 158 passed, 1 skipped.
- Guest gửi ảnh qua Nginx trả 200, có nguồn và final grounding. Guest gửi ảnh + mã đơn trả lời yêu cầu
  đăng nhập, không truy cập đơn riêng tư. Chat đơn hàng có đăng nhập trả 200 và lưu metadata cuối.
- Customer gửi ảnh + đơn thật qua Nginx: trả 200, route nghiệp vụ, `grounded=true`, hai citations
  tới đúng đơn; kết luận mẫu xe không khớp, giữ giới hạn không xác minh chiếc xe/VIN. Reload giữ
  citations; replay cùng requestId không tăng version.
- Sửa feedback khi viết lại: gửi draft bị từ chối, nêu số không được hỗ trợ và nhắc giới hạn catalogue.
  Throttling Bedrock được thử lại tối đa hai lần, vẫn chịu timeout tổng của mỗi request.
- Khi thiếu credentials/lỗi AI, trả 503 và không làm tăng version hoặc lưu tin nhắn lỗi vào session.

Health/retrieval thành công riêng lẻ không chứng minh Bedrock đã hoạt động. Smoke trên đã kiểm tra
phản hồi AWS thật cùng bước viết và kiểm chứng cuối, nhưng không bảo đảm đúng mọi cách diễn đạt.
