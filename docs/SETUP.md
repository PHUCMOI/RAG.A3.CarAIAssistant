# Setup và chạy AutoWise từ đầu

Hướng dẫn dành cho **Windows 10/11 và PowerShell**. Chạy các lệnh từ thư mục
gốc repository, nơi có `README.md`, `.env.example` và `docker-compose.yml`.
Không dùng đường dẫn môi trường Python/Node của máy người khác.

| Cách chạy | Khi nào dùng | Cần cài |
|---|---|---|
| A. Development — khuyến nghị khi sửa code | PostgreSQL/Ollama trong Docker, Python/React trên Windows | Git, Docker Desktop, Python 3.12, Node 24 |
| B. Toàn bộ ứng dụng bằng Docker | Demo cả catalogue, chat và module tài khoản/đơn hàng | Git, Docker Desktop; không cần Python/Node/.NET trên host |

Hai cách dùng chung bước **1–3**, sau đó chọn **A hoặc B**. Không chạy đồng
thời hai cách trên cùng các cổng 5080/5173.

## 1. Chuẩn bị và lấy code

- Cài [Git](https://git-scm.com/downloads), [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).
  Mở Docker Desktop và chờ engine chạy. Dùng Linux containers/WSL2 backend.
- Với cách A, cài [Python 3.12](https://www.python.org/downloads/)
  và [Node.js 24](https://nodejs.org/en/download). Node 18 không phù hợp;
  xem [yêu cầu Node của Vite](https://vite.dev/guide/).
- Lần đầu cần Internet để tải dependencies, Docker images và hai model.
  Chọn ổ đĩa còn dung lượng cho repository/model; Docker images vẫn nằm ở vị
  trí Disk image của Docker Desktop. Đặt repo ở ổ F không tự chuyển Docker khỏi C.
- NVIDIA GPU là tùy chọn. GPU Docker trên Windows cần WSL2 và driver phù hợp,
  theo [hướng dẫn Docker](https://docs.docker.com/desktop/features/gpu/).

Clone repository:

```powershell
git clone https://github.com/PHUCMOI/RAG.A3.CarAIAssistant.git
Set-Location RAG.A3.CarAIAssistant
git branch --show-current
docker version
docker compose version
```

Hướng dẫn áp dụng cho phiên bản có module text RAG. Nếu đang thử một feature
branch, checkout branch tương ứng trước khi setup. Nếu đã có checkout, mở terminal
tại thư mục đó; không cần clone thêm.

Tạo cấu hình local nếu chưa có:

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

Các giá trị chính cho cách A:

```dotenv
DATABASE_URL=postgresql://car_rag:car_rag_dev@localhost:5432/car_rag
FRONTEND_ORIGIN=http://localhost:5173
PORT=5080
RAG_ENABLED=true
EMBEDDING_MODEL=intfloat/multilingual-e5-base
EMBEDDING_REVISION=d128750597153bb5987e10b1c3493a34e5a4502a
EMBEDDING_CACHE_DIR=.venv/models/text
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_TIMEOUT=90
```

Snapshot embedding trên đã được dùng cho index hiện tại. Query và document
phải dùng cùng revision; nếu đổi revision thì tạo lại embeddings tương ứng.
`.env` không commit. Sau khi sửa cấu hình, restart backend; cách B cần chạy lại
`docker compose up -d api` để Compose áp dụng environment mới.

## 2. Khởi động và kiểm tra PostgreSQL

```powershell
docker compose up -d --wait postgres
docker compose ps postgres
docker compose exec -T postgres psql -U car_rag -d car_rag -c "SELECT count(*) AS cars FROM cars;"
```

Kết quả cần có **50 xe**. Lần đầu Docker tự tạo schema, seed và migration text
RAG. Bảng `documents` ban đầu có **0** dòng; bước indexing sẽ tạo documents.
SQL seed và ảnh curated đã ở repository, không cần tải corpus raw.

Với volume cũ, áp dụng migration text RAG (có thể chạy lại):

```powershell
Get-Content -Raw database/007_text_rag.sql |
  docker compose exec -T postgres psql -U car_rag -d car_rag -v ON_ERROR_STOP=1
```

Nếu bảng `cars` thiếu hoặc không có đủ 50 xe, dừng ở bước này và kiểm tra
`docker compose logs --tail 100 postgres` cùng [hướng dẫn database](../database/README.md).
Không xóa volume để chữa lỗi setup; init scripts không tự chạy lại trên volume cũ.

## 3. Khởi động Ollama và tải model

Nếu dùng Claude Haiku 4.5 trên Amazon Bedrock, làm theo [cấu hình Bedrock](BEDROCK.md)
và bỏ qua bước Ollama này. `.env.example` chọn `LLM_PROVIDER=bedrock`; muốn chạy
model local thì đặt `LLM_PROVIDER=ollama` trước khi tiếp tục.

Nếu đã có Ollama chạy và có `qwen2.5:3b`, kiểm tra endpoint ở cuối bước này rồi
bỏ qua tạo container/pull. Backend cần truy cập được HTTP endpoint; việc Docker
hiển thị image/model đã tải không chứng minh cổng HTTP đang được publish.

Với máy mới, lưu model trong thư mục `.local/ollama` ngay trong repo:

```powershell
New-Item -ItemType Directory -Force .local/ollama | Out-Null
$taskModelsPath = (Resolve-Path -LiteralPath .local/ollama).Path
```

**Chọn một** lệnh tạo container:

Máy có NVIDIA GPU:

```powershell
docker run -d --name autowise-ollama-rag --gpus all `
  -p 127.0.0.1:11434:11434 `
  --mount "type=bind,source=$taskModelsPath,target=/root/.ollama" `
  -e OLLAMA_KEEP_ALIVE=15m -e OLLAMA_NUM_PARALLEL=1 ollama/ollama:latest
```

Máy chạy CPU:

```powershell
docker run -d --name autowise-ollama-rag `
  -p 127.0.0.1:11434:11434 `
  --mount "type=bind,source=$taskModelsPath,target=/root/.ollama" `
  -e OLLAMA_KEEP_ALIVE=15m -e OLLAMA_NUM_PARALLEL=1 ollama/ollama:latest
```

Đợi container chạy, rồi tải model và kiểm tra tiếng Việt:

```powershell
docker exec autowise-ollama-rag ollama pull qwen2.5:3b
docker exec autowise-ollama-rag ollama run qwen2.5:3b "Trả lời một câu bằng tiếng Việt: bạn giúp tư vấn ô tô như thế nào?"
Invoke-RestMethod http://localhost:11434/api/tags
docker exec autowise-ollama-rag ollama ps
```

`/api/tags` cần có model `qwen2.5:3b`; sau khi inference, `ollama ps` cho biết
CPU/GPU thực tế. Máy NVIDIA nên hiện `100% GPU`. CPU vẫn chạy được nhưng chậm hơn;
thời gian thực tế phụ thuộc máy và lần load đầu tiên.

Nếu dùng container khác, thay `autowise-ollama-rag` bằng tên của bạn. Nếu dùng
cổng **11435**, đổi URL kiểm tra và `OLLAMA_URL` thành `http://localhost:11435`.
Script [start_ollama_gpu.ps1](../scripts/start_ollama_gpu.ps1) chỉ dành cho việc
dùng lại **thư mục model và image đã có**; truyền `-ModelsPath` theo máy của bạn.
Không chạy script này thay cho bước tải model lần đầu.

Nguồn cấu hình GPU: [Ollama Docker](https://docs.ollama.com/docker).

## A. Development: Python và React trên Windows

### A1. Cài dependencies từ root

```powershell
py -3.12 --version
node --version
npm.cmd --version
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --no-cache-dir -r backend/requirements-rag.txt
.\.venv\Scripts\python.exe -m pip check
npm.cmd --prefix frontend ci
```

Nếu `.venv` đã tồn tại, kiểm tra `.\.venv\Scripts\python.exe --version` là 3.12
rồi bỏ qua lệnh tạo venv. Hướng dẫn gọi trực tiếp Python trong venv, nên không cần
activate và không bị lỗi PowerShell chặn `Activate.ps1`. `npm.cmd --prefix frontend`
chọn đúng `frontend/package.json`; root không có `package.json`.

### A2. Tạo và kiểm tra text index

```powershell
.\.venv\Scripts\python.exe scripts/build_text_index.py
.\.venv\Scripts\python.exe scripts/validate_rag_index.py
```

Lần đầu tải multilingual E5 vào `EMBEDDING_CACHE_DIR`, sinh Vietnamese documents,
embedding 768 chiều và ghi PostgreSQL. Kết quả cần có:

```json
{
  "validation": {"valid": true, "ready": true, "cars": 50, "errors": []},
  "generationProvider": {"model": "qwen2.5:3b", "status": "installed"}
}
```

Đây là trích các field cần kiểm tra, không phải toàn bộ output. Dataset hiện tại
tạo khoảng **231 documents**; số chunk có thể đổi khi dữ liệu/template thay đổi.
`digest` của generationProvider cần có giá trị. `ready=true` chỉ xác nhận text
index; `unavailable` ở generationProvider là vấn đề kết nối Ollama riêng.
Chạy build lại khi dữ liệu đổi; dữ liệu không đổi không embed lại. Không cần
index lại mỗi lần mở project. [Model embedding](https://huggingface.co/intfloat/multilingual-e5-base).

### A3. Mở hai terminal tại root

**Terminal 1 — backend**, giữ terminal chạy:

```powershell
.\.venv\Scripts\python.exe backend/run.py
```

**Terminal 2 — frontend**, giữ terminal chạy:

```powershell
npm.cmd --prefix frontend run dev
```

Frontend proxy `/api` tới Python cổng 5080, không cần tạo frontend `.env`.
Mở [website](http://localhost:5173), [chat](http://localhost:5173/chat),
[Swagger](http://localhost:5080/swagger). Kiểm tra theo mục **4**.

### A4. Tùy chọn: tài khoản và đơn hàng C#

Catalogue và text RAG dùng Python; đăng nhập, customer account và đơn hàng dùng
service C# cổng 5090. Để dùng những màn hình này với cách A, cài **.NET SDK 10**,
mở terminal thứ ba tại root và chạy:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:OrdersDatabase = 'Host=localhost;Database=car_rag;Username=car_rag;Password=car_rag_dev'
$env:PythonApiUrl = 'http://localhost:5080/'
$env:MigrateOnStartup = 'true'
$env:SeedDemo = 'true'
dotnet run --project services/owner-features/src/AutoWise.OwnerFeatures.Api --no-launch-profile --urls http://localhost:5090
```

Tài khoản demo và nghiệp vụ: [hướng dẫn module C#](csharp_owner_features.md).
Các biến trên chỉ áp dụng trong terminal này; `.env` Python không tự cấu hình C#.

## B. Toàn bộ ứng dụng bằng Docker

Thực hiện bước 1–3, bỏ qua phần A. Ollama vẫn là container đã chuẩn bị ở bước 3.
Trong `.env`, đặt endpoint nội bộ mà API Docker sẽ gọi:

```dotenv
OLLAMA_DOCKER_URL=http://autowise-ollama-rag:11434
```

Nếu tên container Ollama khác, thay tên tương ứng. Cổng **11434 ở đây là cổng
trong container**, kể cả khi cổng publish trên Windows là 11435.

```powershell
docker compose up --build -d --wait
docker compose ps
```

Nối Ollama vào network của Compose để API phân giải tên container:

```powershell
$taskApiId = docker compose ps -q api
$taskApiInfo = docker inspect $taskApiId | ConvertFrom-Json
$taskNetwork = $taskApiInfo[0].NetworkSettings.Networks.PSObject.Properties.Name | Select-Object -First 1
docker network connect $taskNetwork autowise-ollama-rag
```

Chỉ nối network một lần; thông báo endpoint đã tồn tại nghĩa là container đã nối.
Sau `docker compose down`/tạo lại network, cần nối lại. Cách này tránh nhầm
`localhost` trong API container với localhost của Windows.

Tạo index bằng image Python của API, dùng cùng database và volume cache:

```powershell
$taskRepoRoot = (Get-Location).Path
docker compose run --rm --no-deps --volume "${taskRepoRoot}:/workspace" --workdir /workspace api python scripts/build_text_index.py
docker compose run --rm --no-deps --volume "${taskRepoRoot}:/workspace" --workdir /workspace api python scripts/validate_rag_index.py
```

Các lệnh này mount source/scripts vào job, vì image API mặc định chỉ chứa backend.
`--rm` dọn container job sau khi chạy; database và volume cache vẫn được giữ.
Cache E5 nằm ở volume `text-model-cache`; model Ollama vẫn ở thư mục bind mount.
Đối chiếu kết quả index như mục A2, rồi kiểm tra mục **4**.

Website cổng 5173, Python cổng 5080, C# cổng 5090. Lần build đầu tải dependencies
lớn hơn; xem lỗi bằng `docker compose logs --tail 100 api orders-api web`.

## 4. Xác nhận setup thành công

Mở terminal tại root khi backend/frontend đang chạy:

```powershell
Invoke-RestMethod http://localhost:5080/api/health
$taskCars = Invoke-RestMethod 'http://localhost:5080/api/cars?limit=100'
$taskCars.Count
$taskBody = @{ question = 'Giá Honda CR-V'; topK = 5 } | ConvertTo-Json
$taskChat = Invoke-RestMethod -Method Post -Uri http://localhost:5080/api/chat `
  -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($taskBody)) -TimeoutSec 120
$taskChat | Select-Object intent, status, grounded, generationMode, retrieval
$taskChat.answer
$taskChat.citations
```

- Health: `status=ok`, `database=ready` — chỉ kiểm tra database, chưa kiểm tra model.
- Catalogue: 50 xe; frontend hiện thẻ xe/ảnh và trang chi tiết.
- Chat mẫu: `intent=ask_price`, `grounded=true`, `generationMode=llm`, có evidence/citations.
- `retrieval` là `postgresql-hybrid-search` hoặc `postgresql-vector-search` để
  xác nhận nhánh embedding hoạt động. Structured/lexical có thể hoạt động khi
  embedding lỗi, nhưng chưa chứng minh full text RAG.
- `generationMode=template` là fallback có dữ kiện; kiểm tra Ollama/log nếu mục
  tiêu là demo LLM. `grounded=true` tự nó không chứng minh model đã sinh đáp án.

Thử thêm: `Honda CR-V bảo hành bao lâu?`, `Thông số Honda CR-V`,
`So sánh Honda CR-V và Mazda CX-5 về giá và số chỗ`, `Tìm SUV 5 chỗ dưới 800 triệu`.
Thông số DVM-CAR là dữ liệu tham khảo; giữ cảnh báo nguồn/phiên bản trong đáp án.

## 5. Các lần chạy tiếp theo và kiểm thử

**Cách A:** `docker compose up -d postgres`, `docker start autowise-ollama-rag`,
sau đó chạy hai terminal A3. **Cách B:** `docker start autowise-ollama-rag`,
`docker compose up -d`, kiểm tra network nếu vừa tạo lại Compose network.
Không cài dependencies/pull/index lại nếu code, model và dữ liệu không đổi.

Kiểm thử cách A:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
npm.cmd --prefix frontend run build
.\.venv\Scripts\python.exe scripts/smoke_text_rag.py
```

Smoke yêu cầu backend đang chạy, E5 và Ollama thật; xuất
`eval/live_smoke_text.json` và thất bại nếu có fallback. Unit tests mặc định
không gọi model; PostgreSQL integration được skip nếu chưa cấu hình DB test.
Xem [README module](../backend/app/application/rag/README.md) để chạy integration
trên database riêng. Không đặt TEST_DATABASE_URL vào database nghiệp vụ.

Với cách B, chạy tests bằng job có đầy đủ source, database fixtures và eval scripts:

```powershell
$taskRepoRoot = (Get-Location).Path
docker compose run --rm --no-deps --volume "${taskRepoRoot}:/workspace" --workdir /workspace api python -m pytest backend/tests -q
```

Frontend đã build trong Dockerfile; không cần Node trên Windows.

Dừng development bằng Ctrl+C trong từng terminal. Dừng Docker ứng dụng bằng
`docker compose down`; dừng Ollama bằng `docker stop autowise-ollama-rag`.
Không thêm `-v` vào lệnh down để giữ database/cache.

## 6. Lỗi thường gặp

| Triệu chứng | Kiểm tra và xử lý |
|---|---|
| npm ENOENT, không thấy package.json | Chạy `npm.cmd --prefix frontend run dev` từ root. Không tạo package.json ở root để chữa lỗi. |
| npm.ps1 hoặc Activate.ps1 bị chặn | Dùng `npm.cmd` và `.venv/Scripts/python.exe` như hướng dẫn, không cần đổi execution policy toàn máy. |
| Vite lỗi Node/crypto | `node --version` phải dùng Node 24 như setup; mở lại terminal sau khi cài và kiểm tra `where.exe node`. |
| Health 503/PostgreSQL not ready | Kiểm tra Docker chạy, postgres healthy, cổng 5432 và DATABASE_URL; đọc log postgres. |
| relation/column không tồn tại | Với DB cũ, chạy migration 007 và đối chiếu thứ tự migration trong database/README.md. |
| Index ready nhưng generationProvider unavailable | Gọi `/api/tags` ở đúng OLLAMA_URL; kiểm tra publish port/container/model. Index và Ollama là hai kiểm tra riêng. |
| Ollama 404/model not found | `docker exec autowise-ollama-rag ollama list`; pull đúng `qwen2.5:3b`. |
| Chat timeout, ollama ps hiện CPU | Với NVIDIA, kiểm tra --gpus all, WSL2/driver; xem [hướng dẫn hiệu năng](OLLAMA.md). |
| Cổng hoặc tên container đã được dùng | Dùng instance đang chạy nếu kiểm tra hợp lệ; hoặc chọn tên/cổng khác và sửa URL tương ứng. Không xóa container hiện có. |
| UI đăng nhập/đơn hàng lỗi 502 | Khởi động C# ở cổng 5090 theo A4, hoặc chọn cách B. |
| Đầy ổ C khi cài/tải | Đặt clone/cache/model ở ổ còn dung lượng; xem vị trí Disk image trong Docker Desktop. Không tự xóa volume. |

Nếu pip đang dùng TEMP trên ổ C đầy, có thể đặt thư mục tạm trong repo **trước
khi cài dependencies**, chỉ cho terminal hiện tại:

```powershell
New-Item -ItemType Directory -Force .local/tmp | Out-Null
$env:TEMP = (Resolve-Path -LiteralPath .local/tmp).Path
$env:TMP = $env:TEMP
```

Không commit `.env`, `.venv`, `.local`, model/cache, node_modules hoặc index report
local. Commit source, migration, scripts, ground truth và tài liệu setup.
