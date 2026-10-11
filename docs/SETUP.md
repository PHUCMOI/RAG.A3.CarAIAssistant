# Setup AutoWise với Amazon Bedrock

Yêu cầu Docker Desktop (Linux containers), Python 3.12+, Node.js và quyền gọi model Bedrock.
Mọi bước LLM dùng Bedrock. Embeddings E5 và index ảnh vẫn dùng model retrieval hiện có.

## Cấu hình

Copy `.env.example` sang `.env`, điền AWS credentials và model/region. File `.env` được ignore.
Tạo thêm `AI_INTERNAL_TOKEN` bằng `python -c "import secrets; print(secrets.token_urlsafe(48))"`
và đặt kết quả trong `.env`. Docker truyền cùng token cho Python, image service và C#.
Không đưa token vào frontend hoặc Git. Composer/understanding/title là API nội bộ.
Hoặc dùng AWS profile override theo [hướng dẫn Bedrock](BEDROCK.md).

## B: Toàn bộ ứng dụng bằng Docker

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:5080/api/health
Get-Content -Raw database/007_text_rag.sql | docker compose exec -T postgres psql -U car_rag -d car_rag -v ON_ERROR_STOP=1
docker compose exec api python scripts/build_text_index.py
docker compose exec api python scripts/validate_rag_index.py
```

Stack gồm PostgreSQL, Python API, C# account/order API, image service và web tại http://localhost:5173.
Nhận diện ảnh cần index tương thích trong `image_service/indexes` và model retrieval.

## A: Development trên Windows

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-rag.txt
docker compose up -d postgres
.\.venv\Scripts\python.exe backend/run.py
```

Trong terminal khác chạy `npm --prefix frontend ci` và `npm --prefix frontend run dev`.
Khởi động thêm account/order API và image service cho các tính năng tương ứng; xem README từng dịch vụ.

## Kiểm tra

```powershell
python -m pytest backend/tests -q
npm --prefix frontend test
python scripts/smoke_text_rag.py
```

Trong Docker, API nghe cổng 8080 bên trong container:

```powershell
docker compose exec api python scripts/smoke_text_rag.py --api-url http://localhost:8080
```

Nếu dùng AWS profile, thêm `-f docker-compose.yml -f docker-compose.bedrock.yml`
vào các lệnh Compose dựng/chạy; xem BEDROCK.md. Cổng 5080 dùng từ host.

Unit tests dùng fixtures. Live smoke gọi AWS thật, yêu cầu database, text index và AWS access.
Health của database không chứng minh model hoạt động; kiểm tra log Bedrock và response grounding.
Dừng bằng `docker compose down`; không thêm `-v` nếu cần giữ dữ liệu database.

## Xác thực nội bộ và ảnh lịch sử

Native development: Python đọc `AI_INTERNAL_TOKEN` trong `.env`; image service cần
`IMAGE_SERVICE_INTERNAL_TOKEN` và C# cần `AiInternalToken` bằng đúng giá trị này.
Chỉ cấu hình `TrustedProxy` cho địa chỉ proxy thực sự kiểm soát. Compose dùng riêng
web tại `172.30.83.10` trên subnet `172.30.83.0/24`; nếu subnet xung đột, đổi cả subnet,
IP web và `TrustedProxy`. Nginx ghi đè X-Forwarded-For; header client không được tin.
Python/image ports chỉ bind loopback trên host. Public guest AI/ảnh có quota 20 lượt/phút/IP,
burst 5, HTTP 429; các dịch vụ gọi nội bộ không đi qua quota này.

Migration `20261009151449_ChatAttachments` tạo bảng bytea riêng có FK cascade về session,
chuyển ảnh inline hợp lệ cũ sang URL cần đăng nhập và kiểm quyền sở hữu. Giới hạn ảnh mới:
10 MB/ảnh, tổng 30 MB/hội thoại; lịch sử JSON tối đa 2 MB và 100 lượt. Hội thoại cũ có hơn
30 MB ảnh được giữ ảnh, nhưng cần tạo hội thoại mới để gửi thêm. Ảnh cũ không hợp lệ được
bỏ tham chiếu và ghi thông báo gửi lại trong tin nhắn. `Down` khôi phục ảnh hợp lệ vào JSON
trước khi bỏ bảng. Môi trường production phải chạy migration trước khi triển khai API.

Ảnh guest chờ đăng nhập được lưu Blob bằng IndexedDB theo tab, hiệu lực 30 phút; khôi phục
cả ảnh và câu hỏi sau đăng nhập/reload. Xóa tham chiếu khi gửi thành công, tạo hội thoại mới
hoặc đăng xuất; bản ghi hết hạn được dọn khi đọc/lưu tiếp. Khi browser không cho lưu ảnh,
UI giữ yêu cầu lỗi để gửi lại, không âm thầm chuyển thành câu hỏi chỉ có text.
