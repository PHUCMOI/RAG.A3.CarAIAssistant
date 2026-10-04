# AutoWise PostgreSQL initialization

Thư mục này chứa toàn bộ schema và seed cần thiết để một developer dựng database AutoWise lần đầu mà không cần corpus CSV/ảnh raw.

## First run bằng Docker

Từ project root:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:5080/api/health
```

PostgreSQL official entrypoint tự chạy các file được mount vào `/docker-entrypoint-initdb.d` theo thứ tự tên file khi named volume còn trống.

## Thứ tự khởi tạo

| Thứ tự | File repository | Vai trò |
|---:|---|---|
| 1 | `000_extensions.sql` | Cài extension `vector` |
| 2 | `001_schema.sql` | Tạo bảng, foreign key và index |
| 3 | `seed.sql` | Seed xe, ảnh, nguồn, bảo hành và đại lý |
| 4 | `002_add_descriptions.sql` | Backfill/kiểm tra English descriptions |
| 5 | `003_enrich_missing_data.sql` | Hoàn thiện giá VND, thông số, nguồn và bảo hành |
| 6 | `004_seed_dealers.sql` | Hoàn thiện 22 đại lý và nguồn tương ứng |
| 7 | `005_use_curated_image_paths.sql` | Chuyển 215 image paths sang `dataset/images` |
| 8 | `006_verify_seed.sql` | Chuẩn hóa sequences và fail-fast nếu seed thiếu |
| 9 | `007_text_rag.sql` | Thêm hash/version, search_vector và indexes cho text RAG |

Tên mount thực tế trong `docker-compose.yml` có prefix tuần tự để PostgreSQL chạy đúng thứ tự này.

## Dữ liệu kỳ vọng sau first run

| Table | Rows | Ghi chú |
|---|---:|---|
| `cars` | 50 | English descriptions, VND prices và source references |
| `car_images` | 215 | Curated image paths trong `dataset/images` |
| `dealers` | 22 | Address, city, phone, brand và source |
| `warranties` | 9 | Một brand-level policy cho mỗi hãng |
| `sources` | 61 | Provenance cho dữ liệu nghiệp vụ |
| `documents` | 0 | Cố ý để trống; RAG indexing job sẽ sinh documents/embeddings |

`006_verify_seed.sql` dừng quá trình init nếu các count hoặc business invariants trên không đúng. Script cũng đặt lại sequence của `dealers` và `warranties` về ID lớn nhất hiện có.

## Kiểm tra thủ công

```powershell
docker compose exec -T postgres psql -U car_rag -d car_rag -c "SELECT 'cars' AS table_name, count(*) FROM cars UNION ALL SELECT 'car_images', count(*) FROM car_images UNION ALL SELECT 'dealers', count(*) FROM dealers UNION ALL SELECT 'warranties', count(*) FROM warranties UNION ALL SELECT 'sources', count(*) FROM sources UNION ALL SELECT 'documents', count(*) FROM documents ORDER BY table_name;"
```

Kiểm tra đường dẫn ảnh:

```powershell
docker compose exec -T postgres psql -U car_rag -d car_rag -c "SELECT count(*) AS total, count(*) FILTER (WHERE image_path LIKE 'dataset/images/%') AS curated FROM car_images;"
```

Kết quả phải là `total = 215` và `curated = 215`.

## Database volume đã tồn tại

Docker chỉ tự chạy `/docker-entrypoint-initdb.d` khi tạo volume trống. Nếu volume đã tồn tại, không dùng `docker compose down -v` trừ khi bạn chấp nhận xóa database local.

Để áp dụng các migration liên quan mà không xóa dữ liệu:

Lệnh kiểm tra `006_verify_seed.sql` dưới đây chỉ dành cho seed **chưa indexing**
(0 documents). Với database đã có documents, bỏ qua lệnh 006 và áp dụng riêng
migration text RAG ở đoạn tiếp theo.

```powershell
Get-Content -Raw database/005_use_curated_image_paths.sql |
  docker compose exec -T postgres psql -U car_rag -d car_rag -v ON_ERROR_STOP=1

Get-Content -Raw database/006_verify_seed.sql |
  docker compose exec -T postgres psql -U car_rag -d car_rag -v ON_ERROR_STOP=1
```

`006_verify_seed.sql` dành cho kiểm tra seed ban đầu và yêu cầu 0 documents;
không chạy lại sau text indexing. Đối với database đã seed và có documents,
áp dụng riêng migration text RAG:

```powershell
Get-Content -Raw database/007_text_rag.sql |
  docker compose exec -T postgres psql -U car_rag -d car_rag -v ON_ERROR_STOP=1
```

Lệnh này idempotent và không tạo embeddings. Xem [setup toàn project](../docs/SETUP.md)
để chạy indexing sau migration và kiểm tra `validation.ready`.

## Rebuild seed từ corpus raw

`scripts/build_dataset.py` chỉ cần khi muốn tái tạo dataset/SQL từ nguồn raw. Hai thư mục sau không nằm trong Git:

```text
data/Confirmed_fronts/
data/tables_V2.0/
```

First-run thông thường không cần hai thư mục này vì processed data, SQL seed và curated images đã được commit.
