> Review 2026-10-02: service này là prototype tùy chọn (`docker compose --profile image up --build -d`), chưa nối frontend/API chính. Index hiện khai báo CLIP; requirements mặc định chưa cài torch/transformers hoặc weights. Cần chuẩn bị đúng model hoặc rebuild toàn bộ index bằng extractor đã chọn. Runtime sẽ từ chối query nếu không tải được model của index, tránh trả kết quả từ hai không gian embedding không tương thích. Xem [migration review](../docs/python_migration_review.md).

# AutoWise — Image Retrieval & Multimodal Microservice (Thành viên 3)

Toàn bộ nghiệp vụ và tài nguyên của **Thành viên 3 (Image Retrieval và Backend API)** đã được cô lập hoàn toàn vào thư mục `image_service/` và đóng gói thành **1 Docker Container độc lập** (không phụ thuộc PostgreSQL, chạy được tức thì).

---

## 1. Cấu trúc đóng gói hoàn chỉnh của Container (`image_service/`)

```text
image_service/
├── Dockerfile                      # Multi-stage Dockerfile tối ưu (Python 3.12-slim)
├── docker-compose.yml              # Triển khai độc lập microservice (port 8000)
├── requirements.txt                # Dependencies tinh gọn cho container
├── README.md                       # Hướng dẫn chi tiết, cURL & API Spec
├── app/
│   ├── main.py                     # FastAPI Application & Lifespan Index Loader
│   ├── config.py                   # Quản lý cấu hình, biến môi trường & paths
│   ├── models/
│   │   └── schemas.py              # Pydantic schemas (Request/Response)
│   ├── core/
│   │   ├── feature_extractor.py    # CLIP & Standalone 512-dim Feature Extractor
│   │   ├── vector_index.py         # FAISS IndexFlatIP (512 chiều)
│   │   ├── image_retriever.py      # Gom nhóm xe (Car Aggregation), Margin & Confidence
│   │   └── rag_adapter.py          # Tích hợp RAG của TV2 & Mock fallback
│   └── routers/
│       ├── health.py               # GET /health
│       ├── image_search.py         # POST /search/image
│       ├── text_search.py          # POST /search/text
│       ├── chat.py                 # POST /chat (Đa phương thức)
│       └── cars.py                 # GET /cars/{car_id}
├── data/
│   ├── cars.json                   # Danh mục 50 xe (tự hành, không cần Postgres)
│   └── images_manifest.csv         # Metadata danh sách ảnh
├── indexes/
│   ├── image.index                 # Vector index nhị phân FAISS (171 ảnh)
│   ├── image_embeddings.npy        # Ma trận embedding 171 x 512
│   ├── image_meta.json             # Mapping vector index -> image_id, car_id, path
│   ├── test_images_manifest.csv    # 44 ảnh test độc lập (Công việc H)
│   ├── image_errors.csv            # Log kiểm tra tính hợp lệ của ảnh
│   └── image_evaluation_results.csv# Kết quả đo đạc Recall@1, @3, @5
├── eval/
│   ├── ground_truth_member3.jsonl  # 50 mẫu kiểm thử Q101–Q150 (Công việc I)
│   └── ground_truth_member3.csv    # Bản CSV tương ứng
├── scripts/
│   ├── validate_images.py          # Công việc A: Kiểm tra tính hợp lệ ảnh
│   ├── build_index.py              # Công việc B, C: Sinh vector index FAISS
│   ├── evaluate_retrieval.py       # Công việc H: Đánh giá Recall@1, 3, 5, Latency
│   ├── export_cars_json.py         # Trích xuất cars.json từ seed.sql
│   └── generate_ground_truth.py    # Công việc I: Sinh bộ benchmark Q101-Q150
└── tests/
    ├── test_car.jpg                # Ảnh mẫu phục vụ test
    └── test_image_service.py       # Test suite tự động (14/14 tests PASSED)
```

---

## 2. Hướng dẫn chạy từ đầu (Step-by-Step From Scratch)

Quy trình chuẩn dành cho người mới nhận mã nguồn hoặc muốn tái hiện (reproduce) toàn bộ kết quả của Thành viên 3 từ con số 0:

### Bước 0: Yêu cầu môi trường
* **Hệ điều hành**: Windows, Linux hoặc macOS.
* **Python**: 3.10 trở lên (khuyến nghị Python 3.12).
* **Dữ liệu**: Đảm bảo thư mục `dataset/images/` và file `dataset/images_manifest.csv` đã có trong dự án.

---

### Bước 1: Khởi tạo môi trường ảo & Cài đặt thư viện
Từ thư mục gốc của repository (`RAG.A3.CarAIAssistant`):

```bash
# 1. Tạo môi trường ảo
# Trên Windows:
py -m venv venv
.\venv\Scripts\activate

# Trên Linux / macOS:
python3 -m venv venv
source venv/bin/activate

# 2. Cài đặt các phụ thuộc cần thiết cho Image Service
pip install -r image_service/requirements.txt
```

---

### Bước 2: Chuẩn bị dữ liệu danh mục xe (`cars.json`)
Dữ liệu 50 xe đã được trích xuất sẵn tại `image_service/data/cars.json`. Nếu bạn muốn trích xuất lại từ file SQL (`database/seed.sql`):
```bash
py image_service/scripts/export_cars_json.py
# (hoặc python image_service/scripts/export_cars_json.py)
```
> Kết quả: Xuất 50 mẫu xe sang `image_service/data/cars.json`. Service hoạt động hoàn toàn độc lập mà **không cần chạy PostgreSQL**.

---

### Bước 3: Kiểm tra và xác thực dữ liệu ảnh (Công việc A)
Quét toàn bộ tập ảnh trong manifest, kiểm tra tính toàn vẹn (không hỏng, mở được bằng PIL, kích thước hợp lệ):
```bash
py image_service/scripts/validate_images.py
```
* **Đầu ra**: 
  * In ra thống kê số lượng ảnh của từng mẫu xe (cảnh báo xe < 5 ảnh).
  * Ghi nhật ký các ảnh lỗi (nếu có) ra `image_service/indexes/image_errors.csv`.

---

### Bước 4: Xây dựng Vector Index FAISS từ đầu (Công việc B & C)
Tự động tách tập dữ liệu thành **Tập Index (171 ảnh)** và **Tập Test độc lập (44 ảnh)**, trích xuất vector đặc trưng 512 chiều (L2-normalized) và xây dựng chỉ mục `faiss.IndexFlatIP`:

```bash
# Lựa chọn 1: Build bằng Standalone Feature Extractor (siêu nhanh ~2-3 giây, không cần GPU / tải weights nặng)
py image_service/scripts/build_index.py --force-rebuild

# Lựa chọn 2: Build bằng mô hình OpenAI CLIP (cần kết nối mạng để tải weights clip-vit-base-patch32)
py image_service/scripts/build_index.py --force-rebuild --use-clip
```

* **Đầu ra được lưu tự động vào `image_service/indexes/`**:
  * `image.index`: Chỉ mục vector nhị phân FAISS.
  * `image_embeddings.npy`: Ma trận vector (171 $\times$ 512).
  * `image_meta.json`: Bảng ánh xạ vị trí vector $\leftrightarrow$ `car_id`, `image_id`, `image_path`.
  * `test_images_manifest.csv`: 44 ảnh được giữ riêng (holdout test set).

---

### Bước 5: Sinh bộ Ground Truth đánh giá (Công việc I)
Tạo tập dữ liệu 50 mẫu chuẩn (Q101–Q150) theo phân công thiết kế đề bài:
* **25 mẫu nhận diện ảnh thuần túy** (Q101–Q125)
* **15 mẫu đa phương thức ảnh + câu hỏi** (Q126–Q140)
* **10 mẫu edge-case / ngoại lệ** (Q141–Q150)

```bash
py image_service/scripts/generate_ground_truth.py
```
* **Đầu ra**: 
  * `image_service/eval/ground_truth_member3.jsonl`
  * `image_service/eval/ground_truth_member3.csv` (chuyển giao cho TV4 và TV2 đối soát)

---

### Bước 6: Đánh giá chất lượng Image Retrieval (Công việc H)
Đo đạc độ chính xác trên tập ảnh test độc lập (`test_images_manifest.csv`):

```bash
# Đánh giá với Standalone Feature Extractor:
py image_service/scripts/evaluate_retrieval.py

# Đánh giá với mô hình OpenAI CLIP ViT-B/32 (Khuyên dùng cho báo cáo):
py image_service/scripts/evaluate_retrieval.py --use-clip
```

#### Bảng so sánh kết quả thực nghiệm (Ablation Study):

| Phương pháp | Recall@1 | Recall@3 | Recall@5 | MRR | Độ trễ (Latency) |
|---|---|---|---|---|---|
| **Standalone Extractor** *(Màu sắc/Sobel thuần CPU)* | 2.27% (1/44) | 13.64% (6/44) | 22.73% (10/44) | 0.0962 | **15.65 ms** |
| **OpenAI CLIP ViT-B/32** *(Deep Multimodal Pretrained)* | **70.45%** (31/44) | **84.09%** (37/44) | **86.36%** (38/44) | **0.7735** | **72.90 ms** |

* File lưu chi tiết: `image_service/indexes/image_evaluation_results.csv` và `image_confusion_analysis.json`.

---

### Bước 7: Chạy toàn bộ Unit Tests tự động (Công việc J)
Chạy bộ kiểm thử tự động gồm 14 test cases bao quát: trích xuất vector, gom nhóm xe theo `car_id`, xử lý ảnh lỗi, tính margin/confidence, và các endpoints của API:
```bash
py -m pytest image_service/tests/test_image_service.py -v
```
> Kết quả: **14 passed in ~1.3s**.

---

### Bước 8: Khởi chạy API Service
Chọn một trong hai phương thức triển khai:

#### Cách 8.1: Chạy trực tiếp bằng Python / Uvicorn (Phù hợp Debug & Development)
```bash
py -m uvicorn image_service.app.main:app --host 0.0.0.0 --port 8000 --reload
```
* Swagger UI tài liệu tương tác: **[http://localhost:8000/docs](http://localhost:8000/docs)**
* Redoc: **[http://localhost:8000/redoc](http://localhost:8000/redoc)**

#### Cách 8.2: Đóng gói và chạy qua Docker Container (Độc lập hoặc Production)
```bash
# Khởi chạy container ngầm trên cổng 8000:
docker compose -f image_service/docker-compose.yml up -d --build

# Xem log hoạt động:
docker logs -f autowise-image-service

# Dừng container:
docker compose -f image_service/docker-compose.yml down
```

---

## 3. Các lệnh cURL kiểm thử nhanh (API Verification)

Mở terminal mới để kiểm tra các API đang chạy:

### 1. Kiểm tra trạng thái dịch vụ (Health Check)
```bash
curl -X GET http://localhost:8000/health
```
**Phản hồi mẫu:**
```json
{
  "status": "healthy",
  "service": "AutoWise Image Retrieval & Assistant Service",
  "version": "1.0.0",
  "index_loaded": true,
  "indexed_images": 171,
  "registered_cars": 50
}
```

### 2. Tìm kiếm xe bằng hình ảnh (POST /search/image)
```bash
curl -X POST "http://localhost:8000/search/image?top_k=5" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@image_service/tests/test_car.jpg;type=image/jpeg"
```
**Phản hồi mẫu:**
```json
{
  "results": [
    {
      "car_id": "car_57_7",
      "brand": "Mazda",
      "model": "CX-5",
      "similarity": 0.9999,
      "best_image": "images/car_57_7/Mazda$$CX-5$$2012$$Black$$57_7$$100$$image_0.jpg"
    }
  ],
  "confidence": "high",
  "uncertain": false,
  "margin": 0.2841,
  "latency_ms": 15.2
}
```

### 3. Tìm kiếm bằng văn bản (POST /search/text)
```bash
curl -X POST http://localhost:8000/search/text \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"SUV 7 chỗ gia đình tiết kiệm nhiên liệu\", \"top_k\": 5}"
```

### 4. Chat đa phương thức (POST /chat)
```bash
# Chat thuần văn bản:
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: multipart/form-data" \
  -F "message=Xe Mazda CX-5 bảo hành mấy năm?"

# Chat kết hợp Ảnh + Văn bản (Multimodal):
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: multipart/form-data" \
  -F "message=Xe trong ảnh giá bao nhiêu và có mấy chỗ ngồi?" \
  -F "image=@image_service/tests/test_car.jpg;type=image/jpeg"
```

### 5. Tra cứu chi tiết xe theo mã (GET /cars/{car_id})
```bash
curl -X GET http://localhost:8000/cars/car_57_7
```

---

## 4. Các biến môi trường tùy chỉnh (Environment Variables)

Service hỗ trợ tinh chỉnh hành vi thông qua biến môi trường hoặc file `.env`:

| Biến môi trường | Mặc định | Mô tả |
|---|---|---|
| `PORT` | `8000` | Cổng HTTP mà dịch vụ lắng nghe |
| `INDEXES_DIR` | `image_service/indexes` | Đường dẫn thư mục chứa FAISS index và ma trận embedding |
| `DATA_DIR` | `image_service/data` | Đường dẫn thư mục chứa `cars.json` |
| `DATASET_DIR` | `dataset` | Đường dẫn chứa tập ảnh gốc và `images_manifest.csv` |
| `IMAGE_SERVICE_USE_CLIP` | `0` | Đặt `=1` nếu muốn kích hoạt full mô hình CLIP PyTorch |
| `IMAGE_SERVICE_THRESHOLD_HIGH` | `0.70` | Ngưỡng tương đồng cosine để phân loại `confidence = "high"` |
| `IMAGE_SERVICE_THRESHOLD_MEDIUM` | `0.50` | Ngưỡng tương đồng cosine để phân loại `confidence = "medium"` |
| `IMAGE_SERVICE_MARGIN_THRESHOLD` | `0.03` | Khoảng cách margin tối thiểu giữa top 1 và top 2 |

---

## 5. Chạy chung với toàn bộ hệ thống AutoWise

Service đã được cấu hình sẵn trong file [`docker-compose.yml`](../docker-compose.yml) ở thư mục gốc của repository. Để khởi động toàn bộ ứng dụng gồm Database Postgres, Backend Python/FastAPI, Frontend React và Image Service Python:

```bash
docker compose --profile image up -d
```
Cổng dịch vụ:
* Frontend Web: `http://localhost:5173`
* Backend API Python/FastAPI: `http://localhost:5080`
* **Image Retrieval Service**: `http://localhost:8000`
* PostgreSQL / pgvector: `localhost:5432`
