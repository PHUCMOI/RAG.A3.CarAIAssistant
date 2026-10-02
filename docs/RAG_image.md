> Backend runtime đã chuyển sang Python/FastAPI (2026-10-02). Các cấu trúc RAG bên dưới là mục tiêu; hiện API chính chỉ structured retrieval. Image service là prototype tùy chọn, chưa tích hợp frontend hoặc pgvector.

# AutoWise Image RAG — Business logic và implementation specification

## 1. Mục tiêu và phạm vi

Image RAG cho phép người dùng tải ảnh xe để:

- Tìm các ảnh/model gần giống trong dataset.
- Kết hợp ảnh với câu hỏi hoặc filter như brand, kiểu xe, giá và số ghế.
- Dùng kết quả ảnh làm candidate, sau đó lấy facts/citations từ PostgreSQL và Text RAG.

Image RAG trong MVP là **similarity retrieval**, không phải hệ thống nhận dạng xe chắc chắn. Câu trả lời phải dùng ngôn ngữ như “có hình ảnh tương đồng với” hoặc “các kết quả gần nhất”, không khẳng định danh tính tuyệt đối chỉ từ ảnh.

## 2. Trạng thái hiện tại

- `car_images` có 215 records và đường dẫn ảnh đã xác minh.
- `car_images.image_embedding` là `vector(512)` nhưng chưa có embeddings.
- `scripts/generate_image_embeddings.py` mới là scaffold.
- Chưa có upload endpoint, image preprocessing contract, vector index hoặc evaluation set.

Không bật UI image search trước khi index version và evaluation đạt yêu cầu.

## 3. User stories

| Story | Input | Output |
|---|---|---|
| Tìm xe tương tự ảnh | Một ảnh | Danh sách model gần nhất + similarity disclaimer |
| Ảnh + brand | Ảnh và “chỉ Toyota” | Kết quả ảnh trong brand đã filter |
| Ảnh + nhu cầu | Ảnh và “mẫu tương tự dưới 1,2 tỷ” | Visual candidates → price filter → facts |
| Hỏi về kết quả | Ảnh và “xe này có 7 chỗ không?” | Visual candidates + structured facts; nêu uncertainty |
| Tìm góc nhìn tương tự | Ảnh front/side/rear | Image hits có view type phù hợp khi model hỗ trợ |

Không hỗ trợ trong MVP:

- Đọc biển số hoặc nhận diện chủ xe.
- Suy luận danh tính người trong ảnh.
- Đánh giá tai nạn, hư hỏng hoặc an toàn kỹ thuật.
- Khẳng định trim/model year chính xác khi dataset không đủ.
- Web-scale reverse image search.

## 4. Quy tắc nghiệp vụ

### 4.1 Candidate, không phải fact

- Similarity score chỉ dùng xếp hạng, không biểu diễn xác suất model đúng.
- Car identity từ ảnh là hypothesis. Facts về xe phải load từ `cars`, không trích từ visual appearance.
- Nếu top results gần điểm nhau, hiển thị nhiều khả năng thay vì chọn một model.
- Nếu score dưới threshold đã tune, trả `no_match` hoặc kết quả độ tin cậy thấp.

### 4.2 Structured filters vẫn bắt buộc

- `maxPriceVnd`, seats, brand, body type và market status được áp dụng bằng SQL.
- Xe vi phạm filter không được quay lại chỉ vì image similarity cao.
- Price, warranty và dealer citation tuân theo quy tắc trong [`RAG.md`](./RAG.md).

### 4.3 Data limitations

- Ảnh hiện tại có thể khác chất lượng, nền, góc chụp và thị trường.
- Cùng thiết kế thân xe có thể xuất hiện ở nhiều generation/alias.
- Không suy ra màu, trim, model year, động cơ hoặc tình trạng thị trường nếu chưa có metadata/source tương ứng.
- Kết quả phải nêu dataset chỉ chứa các mẫu AutoWise đang quản lý.

## 5. Luồng xử lý tổng thể

1. Nhận multipart request và validate metadata/size.
2. Decode ảnh trong môi trường giới hạn tài nguyên.
3. Correct orientation, convert RGB và áp preprocessing đã pin version.
4. Sinh query embedding 512 chiều.
5. Vector search trên ảnh có cùng model/version.
6. Group image hits theo `car_id`.
7. Áp structured filters và lấy facts/sources.
8. Nếu có text query, chạy Text RAG trong cùng candidate/filter boundary.
9. Fuse scores, chọn diverse results và build context.
10. Trả deterministic result hoặc grounded multimodal answer.
11. Xóa ảnh tạm theo retention policy.

## 6. Input validation và preprocessing

### 6.1 Request limits đề xuất

Các giá trị ban đầu, cần cấu hình và load-test:

| Rule | Default đề xuất |
|---|---:|
| File types | JPEG, PNG, WebP |
| Max encoded size | 10 MB |
| Min dimensions | 128 × 128 px |
| Max dimensions | 12,000 × 12,000 px |
| Max decoded pixels | 40 megapixels |
| Files/request | 1 trong MVP |
| Decode timeout | 5 seconds |

Validate bằng bytes đã decode/magic signature, không chỉ filename hoặc client MIME.

### 6.2 Deterministic preprocessing contract

Contract phải do selected model quy định và được version hóa, ví dụ:

1. Decode và reject malformed/animated input không hỗ trợ.
2. Apply EXIF orientation.
3. Convert sang sRGB/RGB; xử lý alpha trên background cố định.
4. Resize theo model input policy (letterbox hoặc center crop).
5. Normalize channel values đúng model.
6. Encode batch/query bằng cùng model weights.
7. L2-normalize output nếu model/retrieval contract yêu cầu.

Không tự chọn center crop cho ảnh xe nếu nó cắt mất thân xe. Quyết định crop/letterbox phải được đánh giá trên dataset và lưu bằng `preprocessing_version`.

### 6.3 Content hash

Tính SHA-256 trên canonical decoded content hoặc original bytes theo một policy thống nhất. Mục tiêu:

- Skip exact duplicates.
- Detect file thay đổi ở cùng path.
- Cache embedding an toàn theo model + preprocessing version.

Hash không được dùng như public URL.

## 7. Embedding contract

Interface đề xuất:

```python
from typing import Protocol, Sequence

class ImageEmbeddingProvider(Protocol):
    model: str
    version: str
    dimension: int
    preprocessing_version: str

    async def embed(self, inputs: Sequence[bytes]) -> list[list[float]]: ...
```

Rules:

- Schema hiện tại yêu cầu chính xác 512 dimensions.
- Offline corpus và query-time ảnh dùng cùng weights/preprocessing/version.
- Validate vector length, finite values và response count.
- Pin model artifact/checksum; không dùng provider alias tự thay đổi.
- Nếu model hỗ trợ joint text-image space, text prompt dùng cho image retrieval cũng phải có versioned template. Không trộn với text embedding 768 chiều.
- Batching, concurrency, timeout và retry phải cấu hình được.

## 8. Database evolution

### 8.1 Bổ sung cột đề xuất

```sql
ALTER TABLE car_images
  ADD COLUMN content_hash text,
  ADD COLUMN embedding_model text,
  ADD COLUMN embedding_version text,
  ADD COLUMN preprocessing_version text,
  ADD COLUMN width_px integer,
  ADD COLUMN height_px integer,
  ADD COLUMN embedded_at timestamptz,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Constraints đề xuất:

```sql
ALTER TABLE car_images
  ADD CONSTRAINT ck_car_images_width_positive
    CHECK (width_px IS NULL OR width_px > 0),
  ADD CONSTRAINT ck_car_images_height_positive
    CHECK (height_px IS NULL OR height_px > 0);
```

Nếu cần giữ nhiều model embedding song song, không thêm nhiều vector columns. Tạo bảng riêng:

```text
image_embeddings(
  image_id,
  model,
  version,
  preprocessing_version,
  dimension,
  embedding,
  embedded_at,
  primary key (image_id, model, version, preprocessing_version)
)
```

Vì pgvector column có dimension cố định, rollout nhiều dimension cần table/column riêng hoặc migration.

### 8.2 Vector index

Sau khi embeddings đã populated và benchmark:

```sql
CREATE INDEX ix_car_images_embedding_hnsw
ON car_images USING hnsw (image_embedding vector_cosine_ops)
WHERE image_embedding IS NOT NULL;
```

Với 215 ảnh, exact vector scan gần như chắc chắn đủ đơn giản; chưa cần HNSW nếu measurement không chứng minh lợi ích.

## 9. Offline image indexing

### 9.1 Manifest validation

Trước khi embed:

- `image_id` duy nhất.
- `car_id` tồn tại.
- File path nằm trong allowed media root và file tồn tại.
- Decode thành công.
- Không vượt pixel/size limit.
- `view_type` thuộc vocabulary đã chốt hoặc null.
- Hash duplicate được báo cáo.

Không follow symlink/path traversal ra ngoài media root trong production worker.

### 9.2 Job algorithm

1. Tạo image index job.
2. Scan manifest/database candidates.
3. Decode, canonicalize và hash.
4. Skip khi hash + model + preprocessing version không đổi.
5. Embed theo batch.
6. Validate vector.
7. Update embedding metadata trong transaction ngắn.
8. Chạy index validation và evaluation smoke set.
9. Mark job complete/partial/failed.

Mỗi item lỗi không nhất thiết làm fail toàn job; phải có threshold và danh sách lỗi rõ ràng. Không activate version nếu coverage dưới gate.

### 9.3 Coverage validation

Report tối thiểu:

- Tổng ảnh, decoded, duplicate, embedded, skipped, failed.
- Cars không có ảnh/embedding.
- Embeddings theo model/version.
- Invalid dimensions/non-finite vectors.
- Distribution theo `view_type` và số ảnh/xe.

## 10. Query-time vector search

Exact cosine query:

```sql
SELECT i.image_id,
       i.car_id,
       i.image_path,
       i.view_type,
       1 - (i.image_embedding <=> @query_embedding) AS similarity
FROM car_images i
JOIN cars c ON c.car_id = i.car_id
WHERE i.image_embedding IS NOT NULL
  AND i.embedding_model = @model
  AND i.embedding_version = @version
  AND i.preprocessing_version = @preprocessing_version
  AND (@brand IS NULL OR c.brand_name = @brand)
  AND (@body_type IS NULL OR c.body_type = @body_type)
  AND (@max_price IS NULL OR c.price_vnd_from <= @max_price)
  AND (@statuses IS NULL OR c.market_status_vn = ANY(@statuses))
ORDER BY i.image_embedding <=> @query_embedding
LIMIT @image_candidate_count;
```

Phải filter bằng business requirements trước/đồng thời với ranking. Với approximate index và filter selectivity cao, benchmark query plan/candidate expansion.

## 11. Grouping image hits thành car results

Một xe có nhiều ảnh nên không được chiếm toàn bộ top results.

Baseline aggregation:

```text
car_score = 0.75 * highest_image_similarity
          + 0.25 * mean(top_2_image_similarities)
```

Rules:

- Tối đa N evidence images/xe, default 3.
- Deduplicate cùng `content_hash`.
- Có thể thêm view diversity bonus nhỏ nếu nhiều góc đều match.
- Không cộng điểm theo số lượng ảnh thô; xe có nhiều ảnh không được lợi không công bằng.
- Trả representative image là hit cao nhất có path hợp lệ.

Các hệ số là starting point, không phải business truth; phải tune bằng evaluation.

## 12. Multimodal fusion

### 12.1 Ảnh không có text

Ranking dựa trên aggregated image score, sau đó load structured facts. Không cần LLM nếu user chỉ muốn danh sách tương tự.

### 12.2 Ảnh + exact filters

SQL filters là hard constraints; image score rank trong tập hợp hợp lệ.

### 12.3 Ảnh + semantic text

Chạy image retrieval và Text RAG độc lập trong cùng filter boundary. Normalize scores theo calibrated method rồi fuse.

Starting formula để thử nghiệm:

```text
final_score = 0.55 * calibrated_image_score
            + 0.30 * calibrated_text_score
            + 0.15 * evidence_quality_score
```

`evidence_quality_score` có thể xét source coverage/index completeness, không được ưu tiên model vì giá trị thương mại.

Rules:

- Nếu query chủ yếu là exact filter, tăng vai trò structured constraints, không thêm “structured score” giả.
- Nếu text nêu exact model, entity resolution có thể giới hạn candidate.
- Nếu text và ảnh xung đột, nêu ambiguity; không âm thầm bỏ một modality.
- Score từ hai model không cộng trực tiếp trước calibration.

## 13. Result contract

Image retrieval result nội bộ:

```json
{
  "queryId": "01J...",
  "indexVersion": "image-v1",
  "status": "matches_found",
  "results": [
    {
      "carId": "car_...",
      "score": 0.78,
      "evidenceImages": [
        {
          "imageId": "img_...",
          "viewType": "front",
          "similarity": 0.84
        }
      ],
      "structuredFactIds": ["fact:car_...:price"]
    }
  ],
  "warnings": [
    "Image similarity is not a definitive vehicle identification."
  ]
}
```

Public API không nên trả raw local `image_path`. Media phải qua safe public URL/asset route đã kiểm tra.

## 14. Public API mục tiêu

```http
POST /api/v1/search/image
Content-Type: multipart/form-data
```

Parts:

| Part | Required | Description |
|---|---:|---|
| `image` | Yes | JPEG/PNG/WebP |
| `question` | No | Câu hỏi tiếng Việt |
| `filters` | No | JSON filter object |
| `topK` | No | Default 5, max 20 |
| `sessionId` | No | Dùng cho chat flow nếu enabled |

Response:

```json
{
  "requestId": "01J...",
  "answerStatus": "grounded",
  "answer": "Các mẫu trong dữ liệu có hình ảnh gần nhất là...",
  "matches": [
    {
      "carId": "car_...",
      "displayName": "...",
      "representativeImageUrl": "/media/...",
      "matchLevel": "high",
      "priceVndFrom": 900000000,
      "marketStatusVn": "official_current"
    }
  ],
  "citations": [],
  "warnings": [
    "Kết quả dựa trên độ tương đồng hình ảnh trong phạm vi dữ liệu AutoWise, không phải nhận dạng chắc chắn."
  ]
}
```

`matchLevel` (`high`, `medium`, `low`) được map từ calibrated thresholds, không expose raw score nếu UI có thể diễn giải sai. Admin test endpoint có thể trả raw scores.

## 15. Temporary media lifecycle

Preferred flow:

- Stream vào bounded temporary storage, không load file tùy ý vào memory.
- Tên file server-generated, không dùng user filename.
- Chỉ worker/request hiện tại có quyền đọc.
- Xóa ngay sau embedding nếu không cần lưu lịch sử.
- Cleanup job xử lý file sót sau crash theo TTL.
- Nếu lưu chat attachment, dùng private object storage, encryption và explicit retention.

Không lưu upload vào repo, `wwwroot` công khai hoặc database bytea trong MVP.

## 16. Security

- Defend decompression bombs và oversized pixel dimensions.
- Disable/avoid unsafe image codecs không cần thiết.
- Patch image decoder/model runtime thường xuyên.
- Không execute EXIF, embedded scripts hoặc filenames.
- Strip/ignore EXIF GPS và metadata cá nhân.
- Rate limit upload endpoint theo IP/session/user.
- Separate upload size limit từ normal JSON request limit.
- Không fetch remote image URL trong MVP; nếu thêm sau này phải chống SSRF bằng allow-list/network isolation.
- Scan malware nếu tổ chức yêu cầu lưu file lâu dài.

## 17. Backend structure

```text
backend/app/
  application/
    rag/
      search_by_image.py
      fuse_multimodal_results.py
      reindex_images.py
  domain/
    rag/
      image_evidence.py
      image_match.py
      multimodal_result.py
  infrastructure/
    ai/
      image_embedding_provider.py
    media/
      image_decoder.py
      temporary_image_store.py
    search/
      image_search_service.py
      image_result_aggregator.py
    jobs/
      image_indexing_worker.py
  routers/
    image_search_endpoints.py
  core/
    image_rag_options.py

scripts/
  generate_image_embeddings.py
  validate_rag_index.py
```

Python phù hợp cho batch embedding ban đầu. Nếu runtime provider chạy Python-only, dùng một internal inference service có versioned API; không spawn Python process tùy ý cho từng HTTP request.

## 18. Pseudocode

### 18.1 Offline indexing

```text
for each car_image:
  validate path within media root
  decoded = decodeAndNormalize(image_path)
  hash = computeHash(decoded)

  if same hash/model/preprocessing already embedded:
    mark skipped
    continue

  vector = embeddingProvider.embed(decoded)
  validate dimension == 512 and values are finite
  update embedding + versions + dimensions + timestamp

validate coverage and activate index version
```

### 18.2 Query

```text
validate multipart request
temporaryFile = boundedStore.write(upload)
try:
  decoded = decodeAndNormalize(temporaryFile)
  queryVector = embed(decoded)
  imageHits = vectorSearch(queryVector, hardFilters)
  carMatches = groupAndAggregate(imageHits)

  if question has semantic text:
    textEvidence = textRag.retrieve(question, carMatches.ids, hardFilters)
    ranked = multimodalFusion(carMatches, textEvidence)
  else:
    ranked = carMatches

  facts = structuredRepository.load(ranked.ids)
  return buildSafeResponse(ranked, facts)
finally:
  temporaryStore.delete(temporaryFile)
```

## 19. Evaluation dataset

Tạo query images tách biệt khỏi corpus index nếu có thể. Nếu dùng cùng ảnh để test, kết quả sẽ quá lạc quan.

Các nhóm test:

- Same model, different image/background.
- Cross-view: front query → side/rear corpus.
- Closely related models/generations.
- Cropped, resized, compressed và low-light images.
- Multiple cars trong ảnh.
- Non-car/out-of-domain images.
- Cars không có trong corpus.
- Text filters phù hợp/xung đột với ảnh.
- Prompt injection text nằm trên ảnh; hệ thống không được coi OCR text là instruction.

Ground truth nên có exact car/model nếu chắc chắn, acceptable related models, và `no_match` cho out-of-domain.

## 20. Metrics và release gates

Retrieval metrics:

- Recall@1, Recall@5, MRR.
- Same-model và related-model retrieval riêng.
- Cross-view Recall@5.
- No-match true negative rate.
- Cars-per-result diversity và duplicate rate.

Operational metrics:

- Decode failure/rejection rate.
- Embedding and vector search latency.
- Upload bytes distribution.
- Index coverage theo car/view/model version.
- Temporary cleanup failures.

Release gates ban đầu nên bao gồm:

- 100% active vectors đúng 512 dimensions và cùng version.
- Không path traversal/raw local path exposure.
- Out-of-domain test không tạo câu khẳng định nhận dạng.
- Structured filter correctness 100%.
- Recall@5 threshold được team xác nhận trên held-out set.
- P95 end-to-end latency nằm trong SLO đã chốt.

## 21. Failure và fallback

| Failure | Response |
|---|---|
| File invalid/too large | `400`/`413` Problem Details |
| Decode timeout | `422` hoặc `400` với stable error code |
| Embedding unavailable | Nếu có text: text-only fallback; nếu không: `503` |
| Image index empty/version mismatch | Feature unavailable, không fake results |
| Không có match đủ ngưỡng | `no_match`, gợi ý text search/filter |
| Media URL unavailable | Trả car result không ảnh và warning |
| LLM lỗi | Trả deterministic ranked matches + facts |

Stable error codes đề xuất: `image_too_large`, `unsupported_image_type`, `image_decode_failed`, `image_embedding_unavailable`, `image_index_unavailable`, `no_visual_match`.

## 22. Thứ tự triển khai

1. Chọn/pin model 512 chiều và preprocessing contract.
2. Thêm metadata migration cho `car_images`.
3. Validate corpus/manifest và tạo held-out evaluation set.
4. Implement batch embedding + idempotency.
5. Implement exact vector query và per-car aggregation.
6. Tune thresholds/weights bằng evaluation, chưa nối LLM.
7. Implement safe upload endpoint và temporary lifecycle.
8. Nối structured facts + filters.
9. Nối Text RAG/multimodal fusion.
10. Thêm UI disclaimer, error/no-match states và citations.
11. Load/security test rồi mới bật feature flag.

## 23. Definition of Done cho Image RAG

- Corpus validation và embedding job idempotent.
- Active embeddings đúng 512 chiều, model và preprocessing version đồng nhất.
- Upload được validate theo decoded content và có cleanup an toàn.
- Exact filters không bị visual ranking vượt qua.
- Per-car grouping chống bias do số lượng ảnh.
- Kết quả không khẳng định nhận dạng chắc chắn.
- Facts/citations đến từ structured/Text RAG evidence.
- Held-out evaluation đạt gates đã chốt.
- Provider outage, invalid image, no-match và cleanup đều có test.
- Metrics/runbook/feature flag sẵn sàng vận hành.

