> Backend runtime đã chuyển sang Python/FastAPI (2026-10-02). Các cấu trúc RAG bên dưới là mục tiêu; hiện API chính chỉ structured retrieval. Image service là prototype tùy chọn, chưa tích hợp frontend hoặc pgvector.

# AutoWise Text RAG — Business logic và implementation specification

## 1. Mục tiêu và phạm vi

Text RAG chuyển dữ liệu xe, giá, bảo hành, đại lý và nguồn thành evidence có thể tìm kiếm; sau đó kết hợp SQL, full-text search và vector search để tạo câu trả lời tiếng Việt có căn cứ.

Tài liệu này bao gồm:

- Document model và content generation.
- Ingestion, hashing, embedding và versioning.
- Lexical, vector và hybrid retrieval.
- Context building, answer generation và citation validation.
- Cấu trúc code, API, test, evaluation và runbook.

Không bao gồm image embedding; xem [`RAG_image.md`](./RAG_image.md).

## 2. Nguyên tắc thiết kế

1. **Structured first:** exact facts lấy từ bảng nghiệp vụ.
2. **Deterministic documents:** cùng input + cùng template version phải tạo cùng content.
3. **English storage, Vietnamese presentation:** document/index bằng tiếng Anh; query có thể tiếng Việt.
4. **Evidence before generation:** không gọi LLM khi chưa tạo context package.
5. **Citation by ID:** model chỉ được cite source/document đã cấp.
6. **Incremental and idempotent:** record không đổi không được embed lại.
7. **Provider-independent:** application không phụ thuộc SDK/model cụ thể.

## 3. Dữ liệu nguồn và precedence

| Domain | Source of truth | Retrieval rule |
|---|---|---|
| Identity/name/status/spec | `cars` | SQL fact; document để semantic discovery |
| Vietnam price | `cars.price_vnd_from` | Chỉ dùng khi có `price_source_id` |
| Warranty | `warranties` | Car-specific trước brand fallback |
| Dealer | `dealers` | Filter trực tiếp bằng brand/city |
| Provenance | `sources` | Citation metadata |
| Semantic chunks | `documents` | Evidence phụ trợ, không ghi đè source tables |

Nếu document cũ mâu thuẫn với current structured row, structured row thắng và document phải được re-index.

## 4. Current schema và migration mục tiêu

`documents` hiện có:

```text
document_id text primary key
car_id text nullable
section text not null
content text not null
source_id text nullable
text_embedding vector(768) nullable
metadata jsonb not null
updated_at timestamptz not null
```

Migration đề xuất:

```sql
ALTER TABLE documents
  ADD COLUMN content_hash text,
  ADD COLUMN template_version text,
  ADD COLUMN embedding_model text,
  ADD COLUMN embedding_version text,
  ADD COLUMN embedded_at timestamptz,
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX ix_documents_search_vector
  ON documents USING gin (search_vector);

CREATE INDEX ix_documents_section
  ON documents (section);

CREATE INDEX ix_documents_metadata
  ON documents USING gin (metadata);
```

Sau khi backfill thành công, đặt `content_hash` và `template_version` thành `NOT NULL`.

`simple` configuration phù hợp cho content tiếng Anh có model name/ký hiệu và không stem quá mức. Nếu đổi ngôn ngữ/content strategy phải benchmark trước.

Vector index chỉ thêm sau khi đã đo query plan:

```sql
CREATE INDEX ix_documents_embedding_hnsw
ON documents USING hnsw (text_embedding vector_cosine_ops)
WHERE text_embedding IS NOT NULL;
```

Với vài trăm hoặc vài nghìn chunks, exact scan có thể đơn giản và đủ nhanh hơn approximate index.

## 5. Document taxonomy

### 5.1 Section chuẩn

| Section | Scope | Typical source |
|---|---|---|
| `overview` | Tên, aliases, body type, market status, description | Presence/spec source |
| `specifications` | Seats, fuel, transmission, engine, dimensions, power | Specification source |
| `price` | Giá VND từ, ngày giá, caveat | Price source |
| `warranty` | Duration, distance, coverage, notes | Warranty source |
| `dealer` | Name, brand, city, address, contact | Dealer source |
| `market_presence` | Current/historical/import interpretation | Presence source |

Không gộp toàn bộ một xe thành một chunk lớn. Section-level chunks giúp citation chính xác, update ít và giảm context noise.

### 5.2 Stable document ID

Format đề xuất:

```text
car:{car_id}:{section}:v1
warranty:car:{car_id}:v1
warranty:brand:{normalized_brand}:v1
dealer:{dealer_id}:profile:v1
```

Rules:

- ID không phụ thuộc row order hay thời gian chạy.
- Không đưa content hash vào primary key; hash là field để detect change.
- Tăng suffix/template version khi semantic contract thay đổi lớn.
- Khi source record bị xóa hợp lệ, ingestion phải soft-delete hoặc xóa document orphan trong cùng job có audit.

## 6. Content generation

### 6.1 Canonical English templates

Ví dụ `overview`:

```text
Vehicle: Honda CR-V.
Brand: Honda.
Known aliases: CRV.
Body type: SUV.
Vietnam market status: official_current.
Description: [verified English description].
```

Ví dụ `price`:

```text
Vehicle: Honda CR-V.
Vietnam reference price starts from VND 1,109,000,000.
Price as of: 2026-09-30.
This is a reference starting price and not a real-time dealer quotation.
```

Ví dụ `warranty`:

```text
Brand: Honda.
Warranty duration: 36 months.
Warranty distance limit: 100,000 km.
Coverage and exclusions: [verified policy notes or “Not available”].
```

### 6.2 Generation rules

- Field order cố định.
- Number/date format cố định, locale-independent.
- Không đưa field null thành claim. Có thể ghi `Not available` chỉ khi hữu ích cho retrieval.
- Không thêm adjective như “best”, “affordable”, “powerful” nếu source không support.
- Status code cần giữ nguyên và có câu giải nghĩa deterministic trong context builder.
- Mỗi document phải chứa subject identity để chunk có thể hiểu độc lập.
- Source title/URL không cần lặp trong content; lưu bằng relationship/metadata.

### 6.3 Chunking strategy

Dataset này chủ yếu là records ngắn, có cấu trúc. Ưu tiên semantic section chunks, không cắt cửa sổ token tùy ý.

Nếu một source note dài:

- Mục tiêu 150–350 tokens/chunk.
- Hard cap theo tokenizer của embedding model.
- Split tại heading/paragraph/sentence.
- Overlap tối đa 10–15% chỉ khi cần giữ ngữ cảnh.
- Mỗi child chunk có ID `...:part:{n}` và cùng parent metadata.
- Không duplicate cùng claim ở nhiều chunks nếu tránh được.

## 7. Metadata contract

Metadata tối thiểu:

```json
{
  "schemaVersion": 1,
  "entityType": "car",
  "entityId": "car_...",
  "section": "overview",
  "brand": "Honda",
  "displayName": "Honda CR-V",
  "marketStatusVn": "official_current",
  "bodyType": "SUV",
  "seats": 7,
  "priceVndFrom": 1109000000,
  "sourceIds": ["src_..."],
  "templateVersion": "car-overview-v1"
}
```

Rules:

- JSON keys dùng English camelCase.
- Giá/số ghế giữ kiểu number, không lưu formatted string.
- Không copy dữ liệu nhạy cảm hoặc toàn bộ source page.
- Fields dùng để filter phải có format nhất quán.
- `sourceIds` là danh sách dù hiện schema chỉ có một `source_id`; điều này hỗ trợ migration nhiều nguồn.

## 8. Content hash và idempotency

Canonical payload để hash gồm:

```text
document_id + template_version + normalized_content + sorted_source_ids
```

Hash đề xuất: SHA-256 dưới dạng lowercase hex.

Algorithm:

1. Load source rows trong một consistent read.
2. Generate canonical content/metadata.
3. Tính hash.
4. So với `documents.content_hash`.
5. Nếu bằng nhau và embedding version đúng: `unchanged`, bỏ qua.
6. Nếu content đổi: upsert content, đặt embedding null/pending.
7. Embed batch pending documents.
8. Update vector + model/version + `embedded_at` trong transaction ngắn.

Không giữ transaction mở trong lúc gọi external embedding API.

## 9. Embedding contract

Python Protocol đề xuất (chưa triển khai):

```python
from typing import Protocol, Sequence

class TextEmbeddingProvider(Protocol):
    model: str
    version: str
    dimension: int

    async def embed(self, inputs: Sequence[str]) -> list[list[float]]: ...
```

Rules:

- `Dimension` bắt buộc bằng 768 với schema hiện tại.
- Model/version phải pin, không dùng alias tự đổi version mà không re-index.
- Query và documents phải dùng cùng model + preprocessing contract.
- Validate finite numbers, vector length và response count.
- Batch size theo provider limit; retry lỗi transient với jitter.
- Không retry input invalid, quota hard limit hoặc dimension mismatch.
- Nếu model yêu cầu prefix riêng cho query/document, lưu trong `embedding_version` và test tương thích.

Không trộn embeddings khác version trong cùng truy vấn. Model rollout nên dùng cột/bảng index mới hoặc re-index có controlled downtime/feature flag.

## 10. Ingestion pipeline

### 10.1 Full re-index

1. Tạo `rag_index_jobs` với mode `full`.
2. Đọc cars, warranties, dealers, sources.
3. Validate business invariants và source references.
4. Generate document candidates.
5. Upsert changed content, mark removed/orphan documents.
6. Embed pending documents theo batches.
7. Validate count, null embeddings, dimensions và source links.
8. Activate index version/feature flag.
9. Complete job với counts và duration.

### 10.2 Incremental re-index

Trigger có thể là admin action, outbox event hoặc scheduled scan. Payload chỉ chứa entity type + ID; worker reload current data từ DB, không tin payload chứa business facts.

Một thay đổi có thể invalidate:

| Thay đổi | Documents cần tạo lại |
|---|---|
| Car name/description/status | `overview`, `market_presence` |
| Car specification | `specifications` |
| Price/source/date | `price` |
| Warranty | car/brand warranty documents và affected cars |
| Dealer | dealer profile |
| Source metadata | citation cache; document hash nếu source IDs/title được đưa vào content |

### 10.3 Job states

`queued → generating → embedding → validating → completed`

Failure states: `failed`, `cancelled`, `completed_with_errors`. Job progress phải dựa trên counts thực tế, không ước lượng không rõ nguồn.

## 11. Query normalization và entity extraction

Input có thể tiếng Việt nhưng data tiếng Anh. Normalizer phải:

- Trim/collapse whitespace, giới hạn length.
- Preserve model names, hyphens, numbers và units.
- Normalize `1,5 tỷ`, `1.5b`, `1500 triệu` về `1500000000 VND`.
- Map body type/fuel/transmission Vietnamese synonyms sang canonical English filters.
- Resolve brand/model aliases bằng database, không bằng hard-coded prompt duy nhất.
- Không translate tên model.

Extraction output:

```json
{
  "intent": "car_discovery",
  "freeText": "family vehicle with good warranty",
  "filters": {
    "bodyType": "SUV",
    "seatsMin": 7,
    "maxPriceVnd": 1500000000,
    "marketStatuses": ["official_current"]
  },
  "mentionedCarIds": [],
  "ambiguities": []
}
```

Deterministic parsing xử lý số/known filters trước; LLM classifier nếu dùng chỉ là fallback và output phải validate.

## 12. Retrieval pipeline

### 12.1 Structured retrieval

Chạy trước để lấy candidate cars và facts. Filter tại SQL:

- Brand, body type, seats, fuel, transmission.
- Min/max price.
- Allowed market statuses.
- Explicit car IDs.

Nếu user yêu cầu điều kiện bắt buộc, semantic search không được đưa xe vi phạm điều kiện trở lại.

### 12.2 Lexical retrieval

Ví dụ query:

```sql
SELECT document_id, car_id, section, content, source_id,
       ts_rank_cd(search_vector, websearch_to_tsquery('simple', @query)) AS score
FROM documents
WHERE search_vector @@ websearch_to_tsquery('simple', @query)
  AND (@car_ids IS NULL OR car_id = ANY(@car_ids))
ORDER BY score DESC
LIMIT @candidate_count;
```

Model/brand alias nên được expand thành query terms có kiểm soát trước khi gọi SQL.

### 12.3 Vector retrieval

Cosine distance với pgvector:

```sql
SELECT document_id, car_id, section, content, source_id,
       1 - (text_embedding <=> @query_embedding) AS score
FROM documents
WHERE text_embedding IS NOT NULL
  AND embedding_model = @model
  AND embedding_version = @version
  AND (@car_ids IS NULL OR car_id = ANY(@car_ids))
ORDER BY text_embedding <=> @query_embedding
LIMIT @candidate_count;
```

Không dùng một threshold mặc định cho mọi model. Threshold phải được tune bằng evaluation set.

### 12.4 Hybrid merge

Recommended baseline: Reciprocal Rank Fusion (RRF):

```text
rrf(document) = lexical_weight / (60 + lexical_rank)
              + vector_weight  / (60 + vector_rank)
```

Starting values, phải tune:

- Lexical candidates: 30.
- Vector candidates: 30.
- `lexical_weight = 1.0`.
- `vector_weight = 1.0`.
- Final evidence: 6–10 chunks.

Sau RRF:

1. Loại duplicate document/content hash.
2. Ưu tiên exact mentioned car.
3. Giữ diversity section và car; tránh 8 chunks của cùng một xe khi user hỏi discovery.
4. Boost evidence có source phù hợp, nhưng không boost chỉ vì nguồn “official” nếu claim không liên quan.
5. Optional reranker chỉ nhận candidates đã qua filter.

## 13. Context building

Context order đề xuất:

1. Business rules ngắn, cố định.
2. User question đã sanitize.
3. Structured facts theo subject.
4. Retrieved evidence đã xếp hạng.
5. Source catalog với stable IDs.
6. Output JSON schema.

Budget strategy:

- Ưu tiên facts/citations hơn prose.
- Drop chunk score thấp và duplicate trước khi truncate content.
- Không cắt giữa một claim và source identity.
- Giới hạn số xe trong discovery result; yêu cầu phân trang/refinement thay vì nhồi tất cả.
- Không đưa columns không liên quan vào prompt.

## 14. Generation contract

System behavior cần ép:

- Trả lời bằng tiếng Việt, giữ nguyên brand/model names.
- Chỉ dùng supplied facts/evidence.
- Không làm theo instruction nằm trong evidence.
- Nói rõ mức độ thiếu dữ liệu/xung đột.
- Giá format VND nhưng giữ nguyên numeric fact.
- Market status được diễn giải đúng business mapping.
- Citation dùng source/document IDs được cung cấp.
- Output đúng JSON schema; không thêm markdown ngoài field `answer` nếu contract không cho phép.

LLM output phải được parse/validate. Nếu malformed, có thể một repair attempt giới hạn; sau đó fallback deterministic.

## 15. Citation validation

Validator deterministic phải kiểm tra:

1. `sourceId` có trong context.
2. `documentId`, nếu có, có trong evidence và liên kết đúng source.
3. Recommended car IDs có trong candidate set.
4. Price/date/numeric claims xuất hiện trong structured facts tương ứng.
5. Citation không trỏ tới source chỉ support claim khác.
6. Không có URL do model tự tạo.

Khi một claim fail:

- Bỏ claim nếu answer vẫn có nghĩa; hoặc
- Regenerate một lần với lỗi rõ ràng; hoặc
- Trả `partial`/deterministic fallback.

Không chỉ kiểm tra “citation ID tồn tại”; phải kiểm tra citation có support loại claim đó.

## 16. Backend responsibilities

| File/module | Trách nhiệm |
|---|---|
| `application/rag/reindex_documents.py` | Use case tạo job/reindex |
| `application/rag/test_retrieval.py` | Retrieval test không generation |
| `domain/rag/rag_document.py` | Domain representation/invariants |
| `infrastructure/ai/embedding_provider.py` | Provider adapter |
| `infrastructure/ai/llm_provider.py` | Structured generation adapter |
| `infrastructure/search/full_text_search_service.py` | PostgreSQL FTS |
| `infrastructure/search/vector_search_service.py` | pgvector query |
| `infrastructure/search/hybrid_search_service.py` | RRF/dedupe/diversity |
| `infrastructure/jobs/rag_indexing_worker.py` | Background ingestion |
| `routers/rag_endpoints.py` | Admin/test HTTP mapping |
| `core/rag_options.py` | Validated retrieval config |

Interface boundaries nên dùng domain/contracts, không trả trực tiếp `asyncpg.Record` hoặc provider SDK types.

## 17. Pseudocode query orchestration

```text
Ask(question, explicitFilters):
  validate request
  parsed = classifyAndExtract(question)
  filters = merge(explicitFilters, parsed.filters)
  candidates = structuredSearch(parsed.entities, filters)

  if intent is exact lookup and facts are sufficient:
    return deterministicAnswer(candidates)

  lexical = fullTextSearch(parsed.freeText, candidates.ids)
  vector = []
  if vectorIndexIsCompatible:
    queryVector = embedQuery(parsed.freeText)
    vector = vectorSearch(queryVector, candidates.ids)

  evidence = hybridMerge(lexical, vector)
  context = buildContext(candidates.facts, evidence, sources)

  if context has no supported answer:
    return noDataAnswer()

  draft = llm.generate(context)
  validated = citationValidator.validate(draft, context)
  return validated or deterministicFallback(context)
```

## 18. API cho development và operations

### Retrieval test

```http
POST /api/v1/admin/rag/test-retrieval
```

```json
{
  "query": "family SUV with seven seats",
  "filters": { "maxPriceVnd": 1500000000 },
  "modes": ["lexical", "vector", "hybrid"],
  "topK": 10,
  "includeContent": true
}
```

Response admin có thể gồm ranks/scores/model version nhưng không lộ secrets. Endpoint này không gọi LLM.

### Reindex

```json
{
  "mode": "incremental",
  "entityTypes": ["car", "warranty", "dealer"],
  "entityIds": [],
  "forceEmbedding": false
}
```

API trả `202 Accepted` + job ID; không giữ HTTP connection cho toàn bộ job.

## 19. Testing strategy

### 19.1 Unit tests

- Stable document ID và canonical hash.
- Null field không sinh unsupported sentence.
- Warranty precedence.
- Vietnamese money/unit normalization.
- RRF, dedupe và diversity.
- Context budget.
- Citation support validation.
- Provider output malformed/dimension mismatch.

### 19.2 Integration tests

- Migration và generated `tsvector`.
- Exact pgvector cosine ordering với fixture vectors.
- Filters không bị semantic results vượt qua.
- Re-index hai lần không đổi row/vector.
- Changed price chỉ invalidate price document.
- Provider timeout/fallback.

### 19.3 Golden questions

Bộ evaluation tối thiểu nên có:

- Exact model/name/alias queries.
- Vietnamese discovery queries có price/seats/body type.
- Comparisons.
- Warranty/dealer/source queries.
- Current vs historical/import status traps.
- Missing-data/no-answer questions.
- Prompt injection trong user question và retrieved text.
- Conflicting-source cases.

Mỗi item lưu expected car IDs, required/forbidden facts, acceptable source IDs và answer status.

## 20. Metrics

Retrieval:

- Recall@K, Precision@K, MRR, nDCG.
- Filter correctness.
- Empty retrieval rate.
- Lexical/vector overlap.

Generation:

- Citation precision/coverage.
- Groundedness theo human review hoặc evaluator có calibration.
- Required fact accuracy.
- Unsupported claim count.
- No-answer correctness.

Operations:

- Index freshness lag.
- Changed/skipped/failed documents.
- Query embedding/provider error rate.
- P50/P95 retrieval/generation latency.

## 21. Runbook

### Sau khi business data thay đổi

1. Chạy data validation.
2. Tạo incremental index job.
3. Kiểm tra job counts và failures.
4. Chạy `validate_rag_index.py`.
5. Chạy golden retrieval suite.
6. Chỉ bật version mới khi gates đạt.

### Khi đổi embedding model

1. Xác nhận output dimension 768 hoặc chuẩn bị schema migration.
2. Tạo version/index song song nếu có thể.
3. Re-embed toàn bộ document và queries dùng cùng model.
4. Chạy evaluation so sánh version cũ/mới.
5. Switch feature flag.
6. Giữ rollback window; sau đó mới dọn version cũ.

### Khi quality giảm

Kiểm tra theo thứ tự: input normalization → structured filters → document content → source mapping → lexical/vector candidates → fusion → context truncation → generation → citation validation. Không chỉnh prompt trước khi biết retrieval có đúng hay không.

## 22. Definition of Done cho Text RAG

- `documents` được sinh đầy đủ, có source và không duplicate.
- 100% populated embeddings đúng 768 chiều và cùng active version.
- Full và incremental re-index idempotent.
- Lexical/vector/hybrid retrieval có integration tests.
- Exact filters và structured facts luôn được tôn trọng.
- LLM output được schema + citation validation.
- Có deterministic/no-data fallback.
- Golden evaluation đạt release gates đã chốt.
- Metrics, job status và runbook đã dùng được.

