# AutoWise Text RAG

Module xử lý câu hỏi ô tô tiếng Việt theo luồng intent/entities → SQL filters →
PostgreSQL lexical/vector retrieval → câu trả lời có evidence và citations.
PostgreSQL là nguồn dữ liệu runtime; JSON export phục vụ kiểm tra và evaluation.

Xem [setup toàn project](../../../../docs/SETUP.md) để chuẩn bị development hoặc
Docker và [phạm vi triển khai](../../../../docs/RAG_STATUS.md) để biết các giới hạn.
Các lệnh dưới đây chạy từ root repository.

## Chuẩn bị và indexing

Runtime gồm Python 3.12, PostgreSQL 17/pgvector, multilingual E5 768 chiều và
Claude Haiku 4.5 qua Bedrock hoặc Ollama `qwen2.5:3b`, chọn bằng `LLM_PROVIDER`.
Xem [cấu hình Bedrock](../../../../docs/BEDROCK.md). Cài dependencies bằng `backend/requirements-rag.txt`.
Với database volume đã tồn tại, áp dụng migration trước khi tạo index:

```powershell
Get-Content -Raw database/007_text_rag.sql |
  docker compose exec -T postgres psql -U car_rag -d car_rag -v ON_ERROR_STOP=1
.\.venv\Scripts\python.exe scripts/build_text_index.py
.\.venv\Scripts\python.exe scripts/validate_rag_index.py
```

Database mới chạy migration sau seed verification, khi documents còn rỗng.
Không chạy lại `006_verify_seed.sql` sau indexing vì nó yêu cầu 0 documents.

Các entrypoint độc lập là `ingest_documents.py` và `generate_text_embeddings.py`.
`--without-embeddings` chỉ chuẩn bị documents; `--force` yêu cầu embed lại.
CLI lỗi trả exit code 1. Kiểm tra `data/text_index_report.json`: `valid` xác nhận
ingestion, còn `ready` yêu cầu đủ embeddings đúng model/revision.

Document IDs và content hashes ổn định theo nội dung, metadata và nguồn.
Row không đổi giữ vector; nội dung đổi làm mất hiệu lực vector cũ. Advisory lock
ngăn hai CLI writers chạy đồng thời; khi ghi vector, CLI kiểm tra lại hash.
Inference diễn ra ngoài database transaction. Query và document dùng cùng model,
resolved SHA, E5 prefix và L2 normalization. Đổi revision cần rebuild embeddings.
Validation kiểm tra hash, sources, parent coverage và đủ child chunks.

`data/documents.jsonl`, index report và model/cache là output local, không commit.

## API và tích hợp

`POST /api/search/text` nhận query, explicit filters và `topK`:

```json
{"query":"SUV 5 chỗ dưới 800 triệu","fuelType":"Petrol","topK":5}
```

Response giữ `results` là CarDto, bổ sung `intent`, `filters`, `evidence` và
`retrieval`. Explicit filters ưu tiên hơn điều kiện phân tích từ câu hỏi.

`POST /api/chat` nhận question, filters, `carIds`, `topK` và `imageName`:

```json
{"question":"So sánh Honda CR-V và Mazda CX-5 về giá và số chỗ","topK":5}
```

Response giữ `answer`, `contexts`, `grounded`, bổ sung `intent`, `filters`,
`evidence`, `citations`, `status`, `generationMode` và `retrieval`.
`contexts` có một card mỗi xe; evidence có thể gồm nhiều chunks mỗi xe.

Module ảnh có thể truyền candidate IDs vào `carIds`; IDs phải tồn tại và thỏa
SQL filters. Tên file trong `imageName` không phải bằng chứng nhận diện ảnh.
Citation URL và `/sources/{id}` lấy từ database. Field chưa có nguồn riêng dẫn
tới context ID của bản ghi, không được gắn nhãn nguồn official.

## Grounded generation và fallback

Model chọn `statementIds` từ statements đã xác minh. Backend dựng Draft gồm
answer/factIds/contextIds và kiểm tra exact statements, subject, field, units
và references. Với so sánh, Draft phải có dữ kiện cho mỗi xe và các thuộc tính
được hỏi có dữ liệu. Model bỏ sót sẽ được repair một lần rồi fallback template.
Nếu evidence budget thiếu thuộc tính có trong catalogue, status là `partial`.

Backend thêm cảnh báo về giá tham khảo, DVM-CAR/thị trường Anh, năm/phiên bản,
thị trường phân phối và điều kiện bảo hành. Đây là generation extractive; chưa
chấp nhận paraphrase tự do có claim chưa kiểm chứng. Faithfulness/completeness
vẫn cần review theo claim, không suy ra từ việc có citations.

Generation có tối đa một repair trong timeout chung: `BEDROCK_TIMEOUT` mặc định
30 giây hoặc `OLLAMA_TIMEOUT` mặc định 90 giây.
`generationMode=template` là fallback; `llm` là output được model chọn và validate.
`RAG_ENABLED=false` tắt model providers và giữ structured/template hoạt động.
Các retrieval modes phản ánh nhánh thực tế: structured, lexical, vector, hybrid.

Xem [vận hành Ollama](../../../../docs/OLLAMA.md) khi timeout hoặc chạy CPU.
Thay generation provider không yêu cầu rebuild text embeddings.

## Kiểm thử và evaluation

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
docker compose -f docker-compose.rag-test.yml up -d --wait
$env:TEST_DATABASE_URL='postgresql://car_rag_test:car_rag_test@localhost:55432/car_rag_test'
.\.venv\Scripts\python.exe -m pytest backend/tests/test_rag_postgres.py -q
.\.venv\Scripts\python.exe scripts/smoke_text_rag.py
```

Integration tạo schema UUID trong database test riêng và dọn đúng schema đó.
Không đặt TEST_DATABASE_URL vào database nghiệp vụ. Không có URL thì test skip.
Sau kiểm thử, `docker compose -f docker-compose.rag-test.yml down` dừng DB test.

Smoke yêu cầu API, E5 và provider đang chọn hoạt động thật: vector/hybrid và generationMode=llm cho
năm intent. Fallback khiến lệnh trả exit code 1; report ghi SHA/digest và latency.

Quy trình ground truth, seed diagnostics và HTTP evaluation nằm trong
[hướng dẫn evaluation](../../../../eval/README.md). Báo cáo chất lượng dữ liệu ở
[RAG_DATA_AUDIT.md](../../../../docs/RAG_DATA_AUDIT.md).

## Giới hạn và tình huống cần kiểm tra

1. “So sánh CR-V” → `needs_clarification`, cần ít nhất hai mẫu xe.
2. “SUV trên 2 tỷ dưới 1 tỷ” → `needs_clarification`, không bỏ điều kiện giá.
3. “Xe này là gì?” với imageName → chưa đủ evidence ảnh để nhận diện.
4. Bảo hành xe nhập khẩu/lịch sử → policy hãng tham khảo, cần VIN/ngày bán.

Module hiện xử lý single-turn. History, upload/recognition ảnh, admin CRUD và
reranker là các phần mở rộng; nghiệp vụ tài khoản/đơn hàng nằm ở service C#.
