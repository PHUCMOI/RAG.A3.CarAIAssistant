# Review chuyển backend sang Python — 2026-10-02

## Phạm vi và kết luận

Review hai commit trên `origin/dev`: `6c1bc2a` và `0c60c6f`, so với
`main` tại `88c7080`. Tích hợp bằng fast-forward để giữ lịch sử tác giả.

Python/FastAPI phù hợp với hướng modular monolith của MVP và hệ sinh thái AI.
Bản dev có router, contracts Pydantic, repository asyncpg và lifecycle pool.
SQL sử dụng bind parameters; API `/api` và JSON camelCase tương thích frontend.
Tuy nhiên bản dev chưa đạt đầy đủ kiến trúc mục tiêu: business orchestration nằm
trong router, domain/application boundaries chưa rõ, tài liệu chưa đồng bộ với implementation Python.

## Các điểm đã sửa khi tích hợp

- Tách chat use case vào `app/application/chat.py`; dùng `ChatCatalogue` Protocol
  và adapter PostgreSQL. Application không phụ thuộc FastAPI hoặc asyncpg.
- Khóa việc reconnect pool để các request đồng thời không tạo nhiều pool.
- Trả HTTP 503 khi chưa kết nối được database; đóng pool trong `finally` của lifespan.
- Chuẩn hóa `FRONTEND_ORIGIN` và PostgreSQL URL qua `DATABASE_URL`/`POSTGRES_*`.
- URL-encode username/password khi tạo DSN từ các biến PostgreSQL.
- Giới hạn độ dài câu hỏi; context rỗng trả `grounded=false`.
- Sửa thông báo ảnh: tên file không chứng minh đã upload hoặc nhận diện ảnh.
- Chuyển image service sang Compose profile `image`, tránh kéo dependency inference
  vào luồng chạy catalogue mặc định.
- Khi model khai báo trong image index không tải được, chặn fallback sang embedding
  NumPy không tương thích; trả 503 tại dependency khởi tạo retriever.
- Tests API dùng mock startup/shutdown để không chạm database local.
- Cập nhật README, spec, kiến trúc, hợp đồng embedding Python và sơ đồ SVG.

## Ranh giới hiện tại

Catalogue reads đơn giản còn gọi repository trực tiếp. Các use case nhiều bước
phải đi qua application layer; thêm domain rules khi có nghiệp vụ thực tế.
Các lớp RAG trong tài liệu là thiết kế mục tiêu, chưa phải implementation.

Image service là prototype độc lập với FAISS/snapshot JSON, chưa nối frontend,
API chính hoặc pgvector. Snapshot có thể lệch PostgreSQL và không được làm nguồn
giá/bảo hành chính. Index hiện khai báo CLIP nhưng requirements mặc định chưa
cài torch/transformers hoặc cung cấp weights: cần chuẩn bị đúng model trước khi
sử dụng retrieval; không thể coi prototype này đã sẵn sàng production.

Authentication/admin CRUD, LLM, text vector retrieval, citation validation,
persisted chat và migration runner vẫn là backlog.

## Kiểm chứng

- `python -m pytest backend/tests -q`: 18 tests pass, gồm reconnect đồng thời,
  DSN, CORS environment, outage 503 và request rỗng.
- `npm --prefix frontend run build`: pass TypeScript và Vite build.
- `python -m compileall -q backend/app image_service/app`: pass.
- `docker compose config --quiet`: pass cấu hình Compose.
- Docker daemon chưa chạy: chưa build/run container hoặc kiểm tra SQL với
  PostgreSQL thực. Tests backend dùng mock, không thay thế integration tests.
- `python -m pytest image_service/tests -q`: 5 pass, 4 fail, 5 error.
  Lỗi liên quan retriever yêu cầu CLIP nhưng máy thiếu `torch`; API trả 503 theo
  cơ chế chặn model không tương thích. Multipart đã được cài để chạy suite.
  Prototype chưa được xác minh inference và không được bật mặc định.

## Dọn toàn bộ backend cũ

Bỏ parser connection string legacy và chuẩn hóa biến môi trường Python.
Thư mục artifact build cũ local chưa xóa được vì automatic approval review
chặn thao tác xóa; thư mục này bị loại khỏi Git và Docker build. Backend chỉ có Python source, dependencies,
tests và Dockerfile Python; frontend vẫn dùng React/TypeScript.
