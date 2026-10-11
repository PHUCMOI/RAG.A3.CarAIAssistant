# Phạm vi triển khai Text RAG

Tài liệu mô tả khả năng hiện tại và điều kiện nghiệm thu của module Text RAG
trong AutoWise. Hướng dẫn chạy toàn hệ thống nằm ở [SETUP.md](SETUP.md), hợp đồng
API và indexing nằm ở [README module](../backend/app/application/rag/README.md).

## Luồng xử lý

1. Chuẩn hóa câu hỏi tiếng Việt, phân tích intent và entities; yêu cầu làm rõ
   khi model hoặc điều kiện không xác định được.
2. Áp dụng explicit filters và candidate IDs vào SQL trước retrieval.
3. Đọc facts trong snapshot PostgreSQL nhất quán, tạo documents canonical và
   loại evidence có parent content hash đã cũ.
4. Kết hợp lexical/pgvector ranking bằng reciprocal rank fusion; dùng structured
   evidence khi index hoặc provider chưa sẵn sàng.
5. Bedrock chọn verified statements để tạo draft có kiểm tham chiếu; bước presentation
   viết lời trả lời tự nhiên. Backend gắn required qualifiers, kiểm số/đơn vị và Bedrock
   audit ngữ nghĩa câu cuối. Nếu viết/repair không đạt, public chat trả 503.

## Thành phần đã triển khai

| Thành phần | Phạm vi |
|---|---|
| Intent/entities | Tìm xe, thông số, giá, bảo hành, so sánh, đại lý và ngoài miền |
| Documents | Templates tiếng Việt, IDs/hashes ổn định, chunking theo tokenizer |
| Indexing | Incremental ingest/embed, invalidation, advisory lock và validation |
| Retrieval | SQL filters, lexical, vector, RRF và freshness checks |
| Generation | Bedrock draft + natural answer + final audit; tối đa một repair presentation; không trả template như thành công AI |
| API | `/api/chat`, `/api/chat/turns`, `/api/search/text`, ranked `retrievedContextIds` riêng với evidence/citations cuối |
| Evaluation | Bộ 200 nhãn nháp thống nhất, HTTP runner text/ảnh, checkpoint, seed diagnostics và audit holdout |
| Data quality | Audit nội bộ các xe xuất hiện nhiều nhất trong bộ evaluation |

Runtime dùng Python 3.12, PostgreSQL 17/pgvector, multilingual E5 768 chiều và
Bedrock. Model/revision trong cấu hình phải khớp model/revision của embeddings.
Seed ban đầu không có documents; index được tạo bằng job sau seed verification.

## Điều kiện nghiệm thu runtime

| Kiểm tra | Bằng chứng cần có |
|---|---|
| Unit/regression tests | Backend suite không có failure |
| PostgreSQL integration | DB test riêng chạy migration, filtering và pgvector tests |
| Text index | Report `validation.ready=true`, đủ coverage, đúng resolved SHA |
| Provider generation | Bedrock model được cài và endpoint truy cập được từ API |
| Live smoke | Năm intent dùng vector/hybrid và generationMode=bedrock-natural |
| Ground truth | Facts/context IDs khớp snapshot; đáp án đã được review độc lập |
| Answer quality | Faithfulness/completeness được chấm theo claims |

Tests dùng provider fixtures không chứng minh E5/Bedrock thật hoạt động.
`grounded=true` không chứng minh vector retrieval hay generationMode=bedrock-natural.
Seed diagnostics không đại diện cho latency hoặc chất lượng live API.
Report runtime được tạo trên môi trường chạy ứng dụng; không suy ra từ trạng
thái model hoặc Docker của máy đã phát triển code.

## Giới hạn và hướng mở rộng

- Draft chọn exact statements; câu tự nhiên được kiểm số/đơn vị và LLM audit. Audit có thể sai và không thay thế chấm độc lập.
- Dữ liệu kỹ thuật chủ yếu từ DVM-CAR/UK; chưa xác nhận từng phiên bản Việt Nam.
- Giá là giá tham khảo tại ngày ghi nhận; bảo hành cần xác nhận VIN/ngày bán.
- Guest có history cache trên browser; customer lưu session text/ảnh/đơn trong C#.
  CLIP/FAISS đã tích hợp; text API cũ chỉ nhận candidate IDs, không nhận diện từ tên file.
- Reranker và màn hình quản trị catalogue/RAG chưa thuộc runtime hiện tại.
- Bộ evaluation cần review lại khi source facts hoặc index thay đổi.

Xem [kiểm tra dữ liệu](RAG_DATA_AUDIT.md), [evaluation](../eval/README.md) và
[vận hành Bedrock](BEDROCK.md) để thực hiện các bước nghiệm thu.
