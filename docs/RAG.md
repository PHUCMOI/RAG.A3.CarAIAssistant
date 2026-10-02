> Backend runtime đã chuyển sang Python/FastAPI (2026-10-02). Các cấu trúc RAG bên dưới là mục tiêu; hiện API chính chỉ structured retrieval. Image service là prototype tùy chọn, chưa tích hợp frontend hoặc pgvector.

# AutoWise RAG — Tài liệu tổng thể

## 1. Mục đích tài liệu

Tài liệu này là điểm bắt đầu cho mọi developer tham gia phần Retrieval-Augmented Generation (RAG) của AutoWise. Nội dung mô tả business logic, ranh giới dữ liệu, kiến trúc, contract giữa các module, API, bảo mật, kiểm thử và thứ tự triển khai.

Hai tài liệu chuyên sâu đi kèm:

- [`RAG_text.md`](./RAG_text.md): tạo tài liệu, embedding, lexical/vector/hybrid retrieval và grounded answer.
- [`RAG_image.md`](./RAG_image.md): xử lý ảnh, image embedding, tìm xe tương tự và kết hợp text-image.

## 2. Trạng thái hiện tại và mục tiêu

### 2.1 Đang có

- PostgreSQL và extension `pgvector`.
- 50 xe, 215 ảnh, 22 đại lý, 9 chính sách bảo hành và 61 nguồn.
- `documents.text_embedding vector(768)` và `car_images.image_embedding vector(512)` đã được khai báo.
- `POST /api/chat` tìm xe bằng PostgreSQL rồi tạo câu trả lời theo template.
- Dữ liệu nghiệp vụ trong database được lưu bằng tiếng Anh; giao diện và câu trả lời cho người dùng là tiếng Việt.

### 2.2 Chưa có

- Chưa có bản ghi trong `documents`.
- Chưa sinh text/image embedding.
- Chưa có hybrid retrieval, reranker hoặc LLM provider.
- Chưa lưu chat session/message.
- Chưa có citation validator và bộ đánh giá RAG.

Vì vậy, hệ thống hiện tại là **structured retrieval prototype**, chưa phải complete RAG.

### 2.3 Mục tiêu

RAG mục tiêu phải:

1. Trả lời tiếng Việt dựa trên dữ liệu tiếng Anh đã được kiểm chứng.
2. Dùng SQL cho dữ kiện chính xác và filter; dùng text RAG cho câu hỏi ngữ nghĩa/giải thích; dùng image RAG cho truy vấn ảnh.
3. Kèm citation có thể mở được cho các claim về giá, tình trạng thị trường, thông số, bảo hành và đại lý.
4. Từ chối hoặc nói rõ thiếu dữ liệu thay vì suy đoán.
5. Có thể re-index lặp lại, idempotent, quan sát được và không chặn public API.

## 3. Business capabilities

| Capability | Ví dụ câu hỏi | Nguồn xử lý chính |
|---|---|---|
| Tra cứu xe | “Thông tin Honda CR-V” | SQL + text RAG |
| Tìm theo điều kiện | “SUV 7 chỗ dưới 1,5 tỷ” | SQL filters |
| So sánh | “So sánh CX-5 và CR-V” | SQL facts + text RAG |
| Giá tại Việt Nam | “Giá từ bao nhiêu?” | `cars.price_vnd_from` + source |
| Bảo hành | “Toyota bảo hành thế nào?” | `warranties` + source |
| Đại lý | “Đại lý Mitsubishi ở Hà Nội” | `dealers` + SQL filters |
| Giải thích/tư vấn | “Xe nào hợp gia đình?” | SQL candidates + text RAG |
| Tìm bằng ảnh | “Ảnh này giống mẫu xe nào?” | image RAG + SQL facts |
| Kiểm tra nguồn | “Thông tin này lấy từ đâu?” | `sources` |

RAG hỗ trợ quyết định và khám phá sản phẩm; nó không thay thế báo giá đại lý, tư vấn kỹ thuật chính thức hay nhận dạng phương tiện mang tính pháp lý.

## 4. Quy tắc nghiệp vụ bắt buộc

### 4.1 Provenance và độ tin cậy

- Mọi claim quan trọng phải truy ngược được tới `source_id`.
- DVM-CAR là dữ liệu thị trường Anh, chỉ dùng làm nguồn khởi tạo tên/thông số/ảnh phù hợp; không dùng giá GBP để trả lời giá Việt Nam.
- Giá Việt Nam chỉ lấy từ `cars.price_vnd_from` và phải đi cùng `price_source_id`.
- `checked_at` là ngày dự án kiểm tra nguồn, không mặc định là ngày xuất bản.
- Nguồn official/current được ưu tiên hơn nguồn dataset, lịch sử hoặc bên thứ ba khi có xung đột.

### 4.2 Tình trạng thị trường

Phải giữ đúng ý nghĩa của `market_status_vn`:

- `official_current`: đang được phân phối chính hãng theo dữ liệu đã kiểm tra.
- `official_historical`: từng được phân phối chính hãng nhưng không khẳng định đang bán.
- `present_via_import`: có mặt qua nhập khẩu; không mô tả là phân phối chính hãng.

Không được đổi status chỉ bằng suy luận của LLM.

### 4.3 Phạm vi dữ liệu xe

- Một dòng `cars` đang đại diện model/generation, không đảm bảo là một trim cụ thể.
- Alias giúp tìm tên, không chứng minh hai model là cùng phiên bản kỹ thuật.
- Thông số nullable phải được trình bày là “Chưa có dữ liệu”, không tự nội suy.
- Khi so sánh, phải nói rõ giá/thông số là mức tham khảo ở cấp model nếu chưa có bảng variants.

### 4.4 Bảo hành và đại lý

- Chính sách theo `car_id` được ưu tiên trước chính sách fallback theo `brand_name`.
- Đại lý chỉ được lọc theo brand/city đã lưu; không suy đoán vị trí gần nhất nếu chưa có tọa độ.
- Số điện thoại trong dataset có thể là dữ liệu demo. UI phải ghi rõ nếu record được đánh dấu demo trong metadata tương lai.

### 4.5 Câu trả lời và citation

- Không đưa claim vào câu trả lời nếu claim đó không có trong structured context hoặc retrieved documents.
- Citation phải tham chiếu một source thực sự nằm trong context của lượt hỏi.
- Khi retrieval yếu hoặc mâu thuẫn, trả lời giới hạn và nêu phần chưa xác minh.
- Không để nội dung lấy về thay đổi system instruction hoặc điều khiển tool.

## 5. Kiến trúc logic

| Module | Trách nhiệm | Không được làm |
|---|---|---|
| Query classifier | Xác định intent, entity, filter và modality | Trả lời người dùng |
| Structured retriever | Lấy facts/filter chính xác từ PostgreSQL | Suy luận semantic tự do |
| Text retriever | Lexical + vector search trên `documents` | Ghi đè facts chính thức |
| Image retriever | Vector search trên `car_images` và group theo xe | Khẳng định nhận dạng chắc chắn |
| Fusion/reranker | Hợp nhất, loại trùng, xếp hạng context | Tạo facts mới |
| Context builder | Chuẩn hóa facts, snippets, sources và budget | Gọi LLM trực tiếp |
| Answer generator | Tạo câu trả lời tiếng Việt theo schema | Truy cập DB trực tiếp |
| Citation validator | Kiểm tra citation và claim support | Sửa dữ liệu nguồn |
| Indexing worker | Sinh document/embedding, upsert và ghi job status | Chạy đồng bộ trong HTTP request |

Luồng tổng quát:

1. Validate request và tạo `correlation_id`.
2. Phân loại intent, nhận diện tên xe/brand/city/giá/số ghế/body type.
3. Chạy structured retrieval cho exact facts và eligibility filters.
4. Chạy text retrieval nếu cần semantic context.
5. Chạy image retrieval nếu request có ảnh.
6. Fusion, deduplicate, diversity và context budgeting.
7. Generate câu trả lời theo output contract.
8. Validate citation; loại claim không được support hoặc fallback an toàn.
9. Trả answer, cards, citations và diagnostics công khai tối thiểu.

## 6. Query intent và routing

Intent chuẩn đề xuất:

| Intent | Dấu hiệu | Pipeline |
|---|---|---|
| `car_lookup` | Có tên một xe | SQL detail → text context |
| `car_discovery` | Điều kiện chỗ ngồi, giá, kiểu xe | SQL filters → optional rerank |
| `car_comparison` | Từ 2 đến 3 xe | SQL facts → text context |
| `price_lookup` | Giá, ngân sách | SQL price only → source |
| `warranty_lookup` | Bảo hành | Car policy → brand fallback |
| `dealer_lookup` | Đại lý + brand/city | SQL dealer filters |
| `source_lookup` | Hỏi nguồn | Source lookup |
| `image_similarity` | Có ảnh | Image retrieval → SQL facts |
| `mixed_multimodal` | Ảnh + mô tả/filter | Text + image + SQL fusion |
| `out_of_scope` | Không liên quan ô tô/dataset | Từ chối ngắn gọn |

### 6.1 Structured-first rule

Các dữ kiện sau luôn ưu tiên SQL thay vì đoạn text sinh tự động:

- Giá VND và ngày giá.
- Số ghế, nhiên liệu, hộp số, kích thước, công suất.
- Market status.
- Thời hạn/quãng đường bảo hành.
- Tên, thành phố, địa chỉ và website đại lý.

Text RAG có thể giải thích hoặc bổ sung ngữ cảnh nhưng không được ghi đè các facts này.

### 6.2 Trường hợp không cần LLM

Có thể trả response deterministic để giảm latency/cost khi:

- Chỉ hỏi giá một xe đã xác định.
- Chỉ yêu cầu danh sách đại lý theo city/brand.
- Chỉ yêu cầu một trường thông số.
- Retrieval rỗng hoặc provider đang lỗi.

## 7. Context contract nội bộ

Application layer chuẩn hóa dữ liệu về một context package độc lập provider:

```json
{
  "requestId": "01J...",
  "intent": "car_comparison",
  "locale": "vi-VN",
  "question": "So sánh Honda CR-V và Mazda CX-5",
  "entities": {
    "carIds": ["car_...", "car_..."],
    "brands": ["Honda", "Mazda"]
  },
  "structuredFacts": [
    {
      "factId": "fact:car_...:price",
      "subjectId": "car_...",
      "field": "price_vnd_from",
      "value": 1109000000,
      "unit": "VND",
      "sourceId": "src_..."
    }
  ],
  "textEvidence": [
    {
      "documentId": "car:car_...:overview:v1",
      "content": "...",
      "score": 0.82,
      "sourceIds": ["src_..."]
    }
  ],
  "imageEvidence": [],
  "sources": [
    {
      "sourceId": "src_...",
      "title": "...",
      "url": "...",
      "checkedAt": "2026-09-30"
    }
  ],
  "limits": {
    "maxAnswerChars": 4000,
    "maxCitations": 8
  }
}
```

Rules:

- ID ổn định, không dùng array index làm citation.
- Facts dùng typed value và unit; không format số trước business logic.
- Context chỉ chứa source đã được allow-list URL scheme.
- Không gửi toàn bộ database hoặc raw image vào prompt khi không cần.

## 8. Answer output contract

LLM provider phải trả structured result; application render thành API response:

```json
{
  "answer": "...",
  "answerStatus": "grounded",
  "citations": [
    {
      "citationId": "c1",
      "sourceId": "src_...",
      "documentId": "car:car_...:price:v1",
      "supports": ["claim-1"]
    }
  ],
  "recommendedCarIds": ["car_..."],
  "warnings": ["Prices are reference prices, not real-time dealer quotes."],
  "confidence": "medium"
}
```

`answerStatus` chỉ nhận:

- `grounded`: đủ evidence và citations hợp lệ.
- `partial`: trả lời được một phần, có warning rõ ràng.
- `no_data`: không có dữ liệu phù hợp.
- `provider_fallback`: dùng deterministic answer do AI provider lỗi.

Không hiển thị raw model confidence dạng phần trăm như một xác suất đúng.

## 9. Public API mục tiêu

### 9.1 Text chat

```http
POST /api/v1/chat/query
Content-Type: application/json
```

```json
{
  "question": "SUV 7 chỗ nào dưới 1,5 tỷ và bảo hành tốt?",
  "sessionId": null,
  "locale": "vi-VN",
  "filters": {
    "brand": null,
    "bodyType": "SUV",
    "seats": 7,
    "maxPriceVnd": 1500000000
  },
  "topK": 8
}
```

### 9.2 Multimodal chat

```http
POST /api/v1/chat/image-query
Content-Type: multipart/form-data
```

Parts: `image`, optional `question`, optional JSON `filters`, optional `sessionId`.

### 9.3 Response envelope

```json
{
  "requestId": "01J...",
  "answer": "...",
  "answerStatus": "grounded",
  "cars": [],
  "citations": [],
  "warnings": [],
  "retrieval": {
    "mode": "hybrid",
    "resultCount": 5
  }
}
```

Không trả vector, system prompt, provider secret, chain-of-thought hoặc full diagnostics cho public client.

## 10. Admin/indexing API mục tiêu

| Method | Route | Mục đích |
|---|---|---|
| `POST` | `/api/v1/admin/rag/reindex` | Tạo job full/incremental |
| `GET` | `/api/v1/admin/rag/jobs/{jobId}` | Xem trạng thái job |
| `POST` | `/api/v1/admin/rag/test-retrieval` | Test retrieval không gọi LLM |
| `GET` | `/api/v1/admin/rag/health` | Kiểm tra index/model version |
| `POST` | `/api/v1/admin/rag/reindex-images` | Tạo image embedding job |

Mọi endpoint admin phải authentication, role authorization, audit log và rate limit riêng.

## 11. Database evolution đề xuất

Schema hiện tại đủ cho prototype nhưng cần migration trước production.

### 11.1 Bổ sung cho `documents`

- `content_hash text NOT NULL`: phát hiện thay đổi và idempotency.
- `embedding_model text`: model đã dùng.
- `embedding_version text`: version/preprocessing contract.
- `embedded_at timestamptz`.
- `search_vector tsvector`: lexical search ổn định.
- `source_ids jsonb` nếu một document có nhiều nguồn; hoặc chuẩn hóa qua junction table.

### 11.2 Bảng vận hành

- `rag_index_jobs`: trạng thái, mode, model version, counts, timestamps, error summary.
- `rag_index_job_items`: lỗi/retry theo document hoặc image khi cần.
- `chat_sessions` và `chat_messages`: chỉ thêm khi đã chốt privacy/retention.

### 11.3 Versioning contract

- Text vector hiện cố định 768 chiều.
- Image vector hiện cố định 512 chiều.
- Chỉ chọn model tạo đúng số chiều tương ứng; nếu đổi chiều phải tạo migration rõ ràng.
- Không trộn embedding từ hai model/version trong cùng một không gian tìm kiếm.

Chi tiết migration xem hai tài liệu chuyên sâu. Các thay đổi này là **đề xuất**, chưa tồn tại trong schema hiện hành.

## 12. Cấu trúc code mục tiêu

```text
backend/app/
  application/
    chat/
      ask_assistant.py
      query_classifier.py
      context_builder.py
      citation_validator.py
    rag/
      reindex_documents.py
      test_retrieval.py
  core/
    rag_options.py
    ai_provider_options.py
  models/
    chat/
    rag/
  domain/
    rag/
      rag_document.py
      evidence.py
      retrieval_result.py
  infrastructure/
    ai/
      llm_provider.py
      embedding_provider.py
    search/
      structured_search_service.py
      full_text_search_service.py
      vector_search_service.py
      hybrid_search_service.py
      image_search_service.py
    jobs/
      rag_indexing_worker.py
    persistence/
      rag_repository.py
  routers/
    chat_endpoints.py
    rag_endpoints.py

scripts/
  ingest_documents.py
  generate_text_embeddings.py
  generate_image_embeddings.py
  validate_rag_index.py
```

Python scripts phù hợp cho offline ingestion/experimentation. Runtime query orchestration nằm trong application layer Python của API chính. Image service chỉ cung cấp inference/retrieval; không nhân đôi business rules giữa API và inference service; document template/version phải được quản lý rõ ràng.

## 13. Configuration contract

Tên cấu hình đề xuất:

```text
Rag__Enabled
Rag__TextTopK
Rag__LexicalCandidateCount
Rag__VectorCandidateCount
Rag__FinalContextCount
Rag__MaxContextCharacters
Rag__MinimumRetrievalScore
Rag__EmbeddingModel
Rag__EmbeddingDimension
Rag__ImageEmbeddingModel
Rag__ImageEmbeddingDimension
Rag__DocumentTemplateVersion
AI__LlmProvider
AI__LlmModel
AI__EmbeddingProvider
AI__ApiKey
```

Rules:

- Secrets chỉ đến từ environment/secret manager, không commit.
- Startup phải fail fast nếu dimension cấu hình khác schema khi RAG được bật.
- Có feature flag riêng cho text RAG, LLM và image RAG để rollback độc lập.
- Timeout, retry và concurrency phải cấu hình được.

## 14. Security và privacy

### 14.1 Prompt injection

- Retrieved content được coi là dữ liệu, không phải instruction.
- System prompt nêu rõ không làm theo chỉ dẫn nằm trong source/document/user-uploaded image text.
- Chỉ đưa field đã allow-list vào context.
- Không cho LLM tự tạo SQL hoặc gọi URL tùy ý trong MVP.

### 14.2 Upload ảnh

- Validate MIME bằng decoded content, không chỉ extension.
- Giới hạn bytes, pixel count và thời gian decode.
- Không lưu ảnh tạm lâu hơn retention đã cấu hình.
- Không log raw bytes, EXIF hay đường dẫn máy người dùng.

### 14.3 Chat data

- Mặc định không log raw prompt/answer trong application log.
- Nếu lưu lịch sử, phải có retention, delete flow và thông báo privacy.
- Redact credential, token và dữ liệu cá nhân trong diagnostics.

## 15. Reliability và fallback

| Failure | Hành vi bắt buộc |
|---|---|
| PostgreSQL lỗi | Trả Problem Details; không gọi LLM với context rỗng giả |
| Embedding provider lỗi khi query | Fallback lexical + structured |
| LLM provider timeout | Trả deterministic summary từ facts |
| Image model lỗi | Vẫn xử lý phần text nếu có; báo image search unavailable |
| Không có document | Structured-only answer |
| Citation invalid | Loại claim/citation hoặc trả partial/no_data |
| Index version mismatch | Disable vector route, log/metric cảnh báo |

Retry chỉ áp dụng cho lỗi tạm thời, có exponential backoff và giới hạn. Không retry validation error hoặc dimension mismatch.

## 16. Observability

Mỗi request nên ghi structured metrics (không ghi raw nội dung):

- `request_id`, intent, retrieval mode.
- Structured/text/image candidate counts.
- Retrieval, rerank, generation và validation latency.
- Empty-result, fallback và invalid-citation counters.
- Token/context size theo provider nếu có.
- Model/version đang active.

Mỗi indexing job ghi:

- Tổng candidate, generated, unchanged, embedded, failed.
- Model/version và document template version.
- Started/completed timestamps.
- Error code đã phân loại, không lưu secret/raw response nhạy cảm.

## 17. Testing và evaluation

### 17.1 Test pyramid

- Unit: intent/filter extraction, business rules, score fusion, citation validation.
- Integration: PostgreSQL + pgvector, migrations, repositories, idempotent indexing.
- Contract: AI provider fake, dimension, timeout, malformed output.
- End-to-end: câu hỏi → retrieval → answer → citation/source link.
- Offline evaluation: bộ câu hỏi cố định cho text, image và multimodal.

### 17.2 Release gates đề xuất

- 100% câu trả lời về giá dùng `price_vnd_from` và có source khi giá tồn tại.
- 0 claim unsupported trong golden test set.
- Filter correctness 100% cho seats/body type/max price/status.
- Citation precision ≥ 95% trên bộ đánh giá thủ công ban đầu.
- Text Recall@5 và image Recall@5 đạt ngưỡng do team chốt trước release.
- P95 latency được đo riêng cho structured, hybrid và multimodal.
- Provider outage test chứng minh fallback hoạt động.

Không dùng một metric duy nhất để kết luận chất lượng RAG.

## 18. Thứ tự triển khai

### Phase 0 — Quyết định kỹ thuật

- Chọn text embedding model 768 chiều.
- Chọn image embedding model 512 chiều.
- Chọn LLM/provider implementation đầu tiên.
- Chốt migration tool, job runner và policy lưu chat/upload.

### Phase 1 — Text index

- Thêm migration metadata/job fields.
- Sinh deterministic documents.
- Sinh embeddings, upsert idempotent và validate index.
- Implement lexical/vector/hybrid retrieval với test.

### Phase 2 — Grounded chat

- Query classifier, structured retriever và context builder.
- LLM abstraction + fake provider.
- Output parsing, citation validation và deterministic fallback.
- UI citations/warnings/loading/error states.

### Phase 3 — Image retrieval

- Chuẩn hóa ảnh và sinh 512-d embeddings.
- Image query endpoint, per-car aggregation và evaluation.
- Kết hợp ảnh với text filters và context.

### Phase 4 — Operations

- Admin auth, RAG job UI, monitoring và alert.
- Incremental re-index khi business data thay đổi.
- Backup/restore, model rollout và rollback runbook.

## 19. Definition of Done chung

Một RAG feature chỉ được coi là hoàn tất khi:

- Business rules có unit tests.
- Migration chạy được từ database trống và database hiện có.
- Ingestion chạy lại không tạo duplicate.
- Model/dimension/version được kiểm tra.
- API có validation, timeout, cancellation và Problem Details.
- Không lộ secret, prompt nội bộ, vector hay raw diagnostics.
- Answer có citation hợp lệ hoặc có no-data/fallback rõ ràng.
- Golden evaluation được lưu và chạy trong CI hoặc release pipeline.
- README/runbook được cập nhật.

## 20. Checklist cho developer mới

1. Đọc file này và hai tài liệu text/image.
2. Đọc [`database_strucutre.md`](./database_strucutre.md) và [`artechture.md`](./artechture.md).
3. Chạy database và xác nhận current record counts.
4. Không giả định `documents` hoặc embeddings đã có dữ liệu.
5. Implement theo interface và output contract trước khi nối provider thật.
6. Dùng fake providers trong unit/integration tests.
7. Chạy retrieval evaluation trước khi bật LLM.
8. Kiểm tra citations và fallback trước khi bật feature flag cho UI.

