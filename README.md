# AutoWise — Vietnam Car RAG MVP

AutoWise là website khám phá và tư vấn ô tô tại Việt Nam, sử dụng React, FastAPI (Python 3.12), PostgreSQL và pgvector. Phiên bản hiện tại đã có website đa trang, dữ liệu 50 mẫu xe, giá VND, bảo hành, đại lý và nguồn tham khảo.

![AutoWise website preview](docs/website-preview.png)

## Setup cho người mới

Đọc **[hướng dẫn setup từng bước](docs/SETUP.md)** để clone đúng branch, cấu hình
database/Ollama CPU hoặc GPU, tạo index và chạy backend/frontend. Có hai lựa chọn:
development trên Windows/PowerShell hoặc toàn bộ ứng dụng bằng Docker, kèm bước
kiểm tra thành công và xử lý lỗi. Không cần corpus raw để chạy dữ liệu hiện tại.

Lưu ý: `package.json` nằm trong **frontend**. Từ root dùng
`npm.cmd --prefix frontend run dev`; backend dùng Python **3.12** trong `.venv`.

## Trạng thái hiện tại

### Đã hoạt động

- Trang chủ và tìm kiếm nhanh.
- Kho dữ liệu 50 mẫu xe.
- Lọc theo từ khóa, hãng, kiểu xe, số ghế và giá tối đa.
- Trang chi tiết xe.
- So sánh 2–3 xe, chọn/thay/xóa trên màn hình, xem khác biệt và chia sẻ URL.
- Danh sách 22 đại lý, lọc theo hãng và thành phố.
- Chatbot text RAG: intent/entities, SQL filters, lexical/pgvector retrieval và Ollama; structured/template fallback khi model/index chưa sẵn sàng.
- Responsive cho desktop, tablet và mobile.
- Swagger/OpenAPI cho backend.
- API danh sách/chi tiết nguồn và danh sách bảo hành.
- Màn hình chi tiết nguồn, phạm vi hỗ trợ và bản ghi tham chiếu.
- Docker Compose cho toàn bộ hệ thống.
- C# cookie auth/roles, quản lý đơn/thanh toán/bàn giao và trợ lý tra cứu đơn có lịch sử.
- Customer account: profile, bảo mật, yêu cầu mua xe, lịch hẹn, notification, favorites và đề nghị thay đổi/hủy đơn.

### Chưa triển khai

- Image embeddings/vector search trong API chính (text đã có pipeline riêng).
- Lưu lịch sử hội thoại RAG common (trợ lý đơn hàng C# đã có lịch sử).
- Authentication cho phần RAG/common ngoài module C# (C# đã có auth và phân quyền).
- CRUD catalogue/RAG trong giao diện quản trị common (module nghiệp vụ C# đã có màn hình xử lý).
- Tích hợp nhận diện ảnh vào frontend/API chính. Prototype độc lập nằm tại `image_service/`, cần model runtime tương thích index.
- Image vector search trong API chính; prototype ảnh có FAISS index 512 chiều riêng.

Các route Admin và RAG Settings hiện mới là placeholder giao diện.

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Frontend | React, TypeScript, Vite, React Router |
| Backend | FastAPI, Python 3.12, asyncpg, Uvicorn |
| Database | PostgreSQL 17, pgvector 0.8.6 |
| Data pipeline | Python 3, standard library |
| Web server | Nginx |
| Local deployment | Docker Compose |

## Dữ liệu hiện tại

| Bảng | Số bản ghi | Nội dung |
|---|---:|---|
| `cars` | 50 | Xe, mô tả, giá VND và thông số |
| `car_images` | 215 | Ảnh xe đã xác minh trên ổ đĩa |
| `dealers` | 22 | Đại lý của 9 hãng |
| `warranties` | 9 | Chính sách bảo hành theo hãng |
| `sources` | 61 | Nguồn và phạm vi thông tin |
| `documents` | 0 khi seed | Text RAG CLI tạo chunks/embeddings sau seed verification |

Dữ liệu nghiệp vụ trong PostgreSQL được lưu bằng tiếng Anh. Giao diện và phản hồi cho người dùng sử dụng tiếng Việt.

## Chạy toàn bộ bằng Docker

Yêu cầu: Docker Desktop. SQL seed và curated images đã ở repository. Cấu hình
Ollama và index text RAG theo **[cách B trong hướng dẫn setup](docs/SETUP.md#b-toàn-bộ-ứng-dụng-bằng-docker)**.
Compose khởi động PostgreSQL, Python API, C# API và website; Ollama được chuẩn bị riêng.

```powershell
docker compose up --build -d
```

Sau khi container khởi động:

- Website: [http://localhost:5173](http://localhost:5173)
- Swagger: [http://localhost:5080/swagger](http://localhost:5080/swagger)
- API health: [http://localhost:5080/api/health](http://localhost:5080/api/health)
- PostgreSQL: `localhost:5432`

Kiểm tra trạng thái:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:5080/api/health
Invoke-RestMethod 'http://localhost:5080/api/cars?brand=Honda&limit=10'
Invoke-RestMethod 'http://localhost:5080/api/dealers?brand=Toyota&city=Hanoi'
```

Dừng hệ thống:

```powershell
docker compose down
```

Không dùng `docker compose down -v` nếu muốn giữ dữ liệu PostgreSQL. Tùy chọn `-v` sẽ xóa volume database local.

## Chạy ở chế độ development

Chuẩn bị Python 3.12, Node 24, `.env`, dependencies, PostgreSQL, Ollama và index
theo **[hướng dẫn setup](docs/SETUP.md)**. Sau lần setup đầu, chạy từ root:

```powershell
docker compose up -d postgres
# Nếu dùng container Ollama được tạo theo hướng dẫn:
docker start autowise-ollama-rag
```

Chạy backend:

```powershell
.\.venv\Scripts\python.exe backend/run.py
```

Chạy frontend trong terminal khác:

```powershell
npm.cmd --prefix frontend run dev
```

Vite proxy `/api` đến `http://localhost:5080`. Đăng nhập/customer account/đơn hàng
cần service C# cổng 5090; xem mục A4 trong setup. Catalogue và chat text dùng Python.

## Các route giao diện

| Route | Màn hình | Trạng thái |
|---|---|---|
| `/` | Trang chủ | Hoạt động |
| `/cars` | Danh sách và bộ lọc xe | Hoạt động |
| `/cars/:carId` | Chi tiết xe | Hoạt động |
| `/compare?ids=...` | So sánh xe | Hoạt động |
| `/dealers` | Danh sách đại lý | Hoạt động |
| `/chat` | Chatbot | Text RAG / template fallback |
| `/sources/:sourceId` | Chi tiết nguồn | Hoạt động |
| `/admin/data` | Quản trị dữ liệu | Placeholder |
| `/admin/rag` | Cấu hình RAG | Placeholder |

Ví dụ:

```text
http://localhost:5173/cars?brand=Toyota
http://localhost:5173/dealers?brand=Mitsubishi
http://localhost:5173/compare?ids=car_34_3,car_57_7
```

## API hiện có

```http
GET  /api/health
GET  /api/cars?query=&brand=&bodyType=&seats=&maxPrice=&limit=
GET  /api/cars/compare?ids=id1,id2,id3
GET  /api/cars/{carId}
GET  /api/dealers?brand=&city=
GET  /api/sources
GET  /api/sources/{sourceId}
GET  /api/warranties?brand=&car_id=
POST /api/search/text
POST /api/chat
```

`limit` của API xe được giới hạn từ 1 đến 100.

Ví dụ tìm kiếm:

```http
POST /api/search/text
Content-Type: application/json

{
  "query": "SUV gia đình",
  "brand": "Honda",
  "bodyType": "SUV",
  "seats": 5,
  "maxPrice": 1200000000,
  "topK": 5
}
```

Ví dụ chat:

```http
POST /api/chat
Content-Type: application/json

{
  "question": "So sánh Honda CR-V và Mazda CX-5"
}
```

Endpoint chat phân tích intent/entities, áp dụng SQL filters và hybrid retrieval rồi gọi Ollama khi có facts. Response giữ `answer`, `contexts`, `grounded`, bổ sung `intent`, `filters`, `evidence`, `citations`, `status`, `generationMode`. Cần chạy text indexing và cấu hình Ollama; lỗi provider dùng template có căn cứ.

## Text RAG

Xem [hướng dẫn module](backend/app/application/rag/README.md) để chuẩn bị Python 3.12,
Ollama `qwen2.5:3b`, migration database đang tồn tại, chạy indexing và evaluation.

```powershell
.\.venv\Scripts\python.exe -m pip install --no-cache-dir -r backend/requirements-rag.txt
.\.venv\Scripts\python.exe scripts/build_text_index.py
.\.venv\Scripts\python.exe scripts/validate_rag_index.py
```

Document dùng tiếng Việt, embedding `intfloat/multilingual-e5-base` 768 chiều.
Database seed ban đầu vẫn có 0 documents; job indexing mới sinh dữ liệu.
Bộ 50 câu hỏi đánh giá nằm trong `eval/ground_truth_text.jsonl`; facts và đáp án cần được review trước khi dùng làm release gate.
Offline seed/template diagnostics không thay thế kết quả PostgreSQL/vector/Ollama thật.

## Kết nối PostgreSQL bằng pgAdmin 4

| Field | Value |
|---|---|
| Host | `127.0.0.1` |
| Port | `5432` |
| Maintenance database | `car_rag` |
| Username | `car_rag` |
| Password | `car_rag_dev` |

Không sử dụng user `postgres` với password cài đặt PostgreSQL trên máy, vì Docker Compose tạo database bằng user `car_rag`.

```sql
SELECT * FROM cars ORDER BY brand_name, display_name;
SELECT * FROM dealers ORDER BY city, name;
SELECT * FROM warranties ORDER BY brand_name;
SELECT * FROM sources ORDER BY source_type, source_id;
```

## Cấu trúc project

```text
RAG-A3/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   └── schemas.py
│   │   ├── repositories/
│   │   │   ├── car_repository.py
│   │   │   ├── dealer_repository.py
│   │   │   ├── source_repository.py
│   │   │   └── warranty_repository.py
│   │   ├── application/
│   │   ├── routers/
│   │   │   ├── cars.py
│   │   │   ├── chat.py
│   │   │   ├── dealers.py
│   │   │   ├── health.py
│   │   │   ├── search.py
│   │   │   ├── sources.py
│   │   │   └── warranties.py
│   │   └── main.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_cars.py
│   │   ├── test_chat.py
│   │   ├── test_dealers.py
│   │   ├── test_health.py
│   │   └── test_search.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── run.py
├── database/
├── data/
│   ├── processed/
│   ├── tables_V2.0/
│   └── Confirmed_fronts/
├── docs/
├── frontend/
│   └── src/
│       ├── app/
│       ├── entities/
│       ├── features/
│       ├── pages/
│       └── shared/
├── scripts/
├── docker-compose.yml
└── README.md
```

## Data pipeline

Hai thư mục corpus đầu vào `data/Confirmed_fronts/` và `data/tables_V2.0/` không được commit lên Git vì có tổng dung lượng khoảng 936 MB. Để tạo lại dataset từ đầu, đặt hai thư mục raw này đúng vị trí trên máy local trước khi chạy pipeline. Repository vẫn lưu các output đã xử lý và database seed cần thiết để dựng phiên bản hiện tại.

```powershell
python scripts/build_dataset.py
python scripts/validate_dataset.py
```

Các output chính:

- `data/processed/candidate_models.csv`
- `data/processed/cars.json`
- `data/processed/images_manifest.csv`
- `data/processed/sources.jsonl`
- `data/processed/quality_report.json`
- `database/seed.sql`
- `database/002_add_descriptions.sql`
- `database/003_enrich_missing_data.sql`
- `database/004_seed_dealers.sql`

Các script PostgreSQL trong `/docker-entrypoint-initdb.d` chỉ tự chạy khi volume database được tạo lần đầu. Với volume đã tồn tại, cần chạy migration tương ứng theo cách thủ công hoặc dùng migration runner trong tương lai.

First-run database được kiểm tra tự động với expected counts: 50 xe, 215 ảnh, 22 đại lý, 9 bảo hành, 61 nguồn và 0 RAG documents. Bảng `documents` cố ý để trống cho indexing pipeline ở giai đoạn tiếp theo. Xem [`database/README.md`](database/README.md) để biết thứ tự SQL, cách kiểm tra và cách áp dụng migration cho volume đã tồn tại.

## Build và kiểm tra

```powershell
# Chạy bộ test backend (Python / pytest)
.\.venv\Scripts\python.exe -m pytest backend/tests -q

# Build frontend
npm.cmd --prefix frontend run build

docker compose up -d --build api web
```

## Tài liệu thiết kế

- [`docs/csharp_owner_features.md`](docs/csharp_owner_features.md): module C# do bạn owner — đơn hàng, thanh toán, bàn giao, chatbot và customer account đã triển khai; phân tích còn ở đặc tả.

- [`docs/spec.md`](docs/spec.md): phạm vi sản phẩm và release plan.
- [`docs/database_strucutre.md`](docs/database_strucutre.md): database, ERD và index.
- [`docs/artechture.md`](docs/artechture.md): kiến trúc và RAG flow.
- [`docs/RAG.md`](docs/RAG.md): business logic, orchestration, API và lộ trình RAG tổng thể.
- [`docs/RAG_text.md`](docs/RAG_text.md): ingestion, text embedding, hybrid retrieval và grounded answer.
- [`docs/RAG_image.md`](docs/RAG_image.md): image embedding, visual retrieval và multimodal fusion.
- [`docs/feature_spec_home.md`](docs/feature_spec_home.md)
- [`docs/feature_spec_car_catalog.md`](docs/feature_spec_car_catalog.md)
- [`docs/feature_spec_car_detail.md`](docs/feature_spec_car_detail.md)
- [`docs/feature_spec_car_compare.md`](docs/feature_spec_car_compare.md)
- [`docs/feature_spec_dealers.md`](docs/feature_spec_dealers.md)
- [`docs/feature_spec_chatbot.md`](docs/feature_spec_chatbot.md)
- [`docs/feature_spec_source_detail.md`](docs/feature_spec_source_detail.md)
- [`docs/feature_spec_data_admin.md`](docs/feature_spec_data_admin.md)
- [`docs/feature_spec_rag_settings.md`](docs/feature_spec_rag_settings.md)

## Quy tắc dữ liệu quan trọng

- DVM-CAR là dữ liệu thị trường Anh và chỉ được dùng làm nguồn khởi tạo.
- Không dùng giá GBP trong DVM-CAR để trả lời giá tại Việt Nam.
- Giá hiển thị tại Việt Nam phải đến từ `price_vnd_from` và có `price_source_id`.
- Xe lịch sử và xe nhập tư nhân không được mô tả như xe đang phân phối chính hãng.
- Alias không đồng nghĩa với cùng phiên bản kỹ thuật.
- Khi thiếu dữ liệu, giao diện phải hiển thị `Chưa có dữ liệu`, không tự suy đoán.
- Giá và thông số là dữ liệu tham khảo, không phải báo giá đại lý theo thời gian thực.

## Hướng phát triển tiếp theo

1. Đánh giá live text RAG và hoàn thành kiểm tra chéo ground truth.
2. Mở rộng bộ chọn xe sang server search/pagination khi dataset tăng.
3. Lưu chat sessions và messages cho RAG common.
4. Thêm authentication và trang admin CRUD cho catalogue/RAG common.
5. Tạo image embeddings `vector(512)` và nối module ảnh với text RAG.


## Python migration và image prototype

Backend chính dùng Python 3.12+, FastAPI, Pydantic và asyncpg. Router xử lý HTTP,
repository giữ SQL có tham số, application layer giữ orchestration chat qua Protocol.
API giữ `/api` và JSON camelCase cho frontend; `/swagger` chuyển đến `/docs`.
`DATABASE_URL` nhận PostgreSQL URL; nếu không đặt, API dùng các biến `POSTGRES_HOST`,
`POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.
Dùng `FRONTEND_ORIGIN` cho CORS. File `.env` được đọc theo working directory.

Chạy kiểm tra từ root:

```powershell
python -m pip install -r backend/requirements.txt
python -m pytest backend/tests -q
```

Tests mặc định dùng database giả, không xác minh SQL với PostgreSQL thực.
Xem `docs/python_migration_review.md` để biết kết quả review và giới hạn kiểm chứng.

Image service trên nhánh dev được giữ như prototype tùy chọn:

```powershell
docker compose --profile image up --build -d
```

Dịch vụ này dùng cổng 8000 và snapshot/index riêng. Frontend chưa gọi dịch vụ;
`imageName` trên `/api/chat` chỉ là tên file, không phải upload hoặc nhận diện ảnh.
Đổi embedding model cần tạo lại index bằng cùng model và preprocessing.

## Module đơn hàng C#

Đã triển khai đăng nhập/phân quyền, admin đơn/khách hàng, khách theo dõi đơn,
ghi nhận thu/hoàn tiền và quản lý bàn giao. C# cùng Python dùng DB `car_rag`;
các bảng C# nằm trong schema `orders_service`. Chạy `docker compose up --build -d`
để chạy migration và seed demo trong Development, mở http://localhost:5173/login.
Xem [đặc tả và hướng dẫn](docs/csharp_owner_features.md) để lấy tài khoản demo.
Customer có chatbot tra cứu đơn tại `/account/assistant`: status, số tiền, lịch bàn giao,
thông tin xe/bảo hành qua API Python và lịch sử hội thoại. Bản MVP dùng intent/template C#,
không phụ thuộc RAG/LLM. Dashboard và chatbot phân tích admin chưa triển khai.

Customer account: mở `/account` sau đăng nhập customer. Profile, bảo mật, yêu cầu mua xe,
đề nghị thay đổi/hủy, thông báo, lịch tư vấn/lái thử và xe yêu thích đã có UI/API C#;
admin xử lý tại `/admin/purchase-requests`, `/admin/change-requests`, `/admin/appointments`.
Xem [spec và hướng dẫn kiểm tra](docs/feature_spec_customer_account.md).
