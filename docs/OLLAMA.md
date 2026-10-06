# Vận hành và xử lý timeout Ollama

AutoWise gọi Ollama qua HTTP để chọn các statements đã có evidence. Backend
mặc định dùng `qwen2.5:3b`, timeout 90 giây và template fallback. Xem
[SETUP.md](SETUP.md) để cài model và chọn cách chạy development hoặc Docker.
Các lệnh dưới đây chạy từ root repository trên Windows/PowerShell.

## Kiểm tra endpoint và model

```powershell
Invoke-RestMethod http://localhost:11434/api/tags
docker exec autowise-ollama-rag ollama list
docker exec autowise-ollama-rag ollama ps
docker logs --tail 80 autowise-ollama-rag
```

Thay container name/cổng theo cấu hình thực tế. Sau một request, `ollama ps`
cho biết CPU/GPU được sử dụng; image/model đã tải không chứng minh GPU hoạt động.
Với NVIDIA trên Windows, Docker cần WSL2 backend và driver hỗ trợ GPU.
Nếu đang chạy CPU, ưu tiên kiểm tra GPU trước khi tăng timeout.

Provider gửi question, intent và verified statements một lần, yêu cầu
`statementIds` ngắn. Backend ánh xạ IDs thành text/facts/contexts, validate và
thêm qualifiers. Generation tối đa 256 output tokens, classification tối đa 32;
model được giữ 15 phút. Backend log elapsed time và input/output token counts.
`generationMode=template` cho biết API đã fallback, kể cả khi `grounded=true`.

## Dùng GPU với model đã có

Script GPU dành cho image `ollama/ollama:latest` và model directory đã có.
Mặc định nó dùng `.local/ollama` trong repository, gồm thư mục con `models`.
Thư mục tùy chọn phải là thư mục tương ứng `/root/.ollama`, không phải chỉ riêng
thư mục `models`. Script không tải image/model hay thay container hiện hữu.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start_ollama_gpu.ps1
# Hoặc truyền đường dẫn model đã có trên máy:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start_ollama_gpu.ps1 -ModelsPath 'D:\Models\ollama'
```

Script tạo `autowise-ollama-gpu`, sử dụng `--gpus all`, publish loopback cổng 11435.
Đặt cấu hình backend chạy trực tiếp trên Windows trong `.env` và restart API:

```dotenv
OLLAMA_URL=http://localhost:11435
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_TIMEOUT=90
```

```powershell
.\.venv\Scripts\python.exe backend/run.py
```

Gửi một câu hỏi, rồi kiểm tra `docker exec autowise-ollama-gpu ollama ps` và
`nvidia-smi`. Nếu GPU chưa được nhận, kiểm tra Docker WSL2/backend và NVIDIA
driver; đọc logs trước khi đổi cấu hình. Có thể điều chỉnh `-Port` và
`-ContainerName` nếu cổng hoặc tên mặc định đã được sử dụng.

## API chạy trong Docker

`localhost` trong API container không phải Windows host. Với Ollama container,
nối nó vào network Compose và cấu hình `OLLAMA_DOCKER_URL` bằng container name
và cổng nội bộ 11434, theo mục B trong [SETUP.md](SETUP.md).
Không dùng cổng host 11435 làm cổng nội bộ của Ollama container.

## Đo và xác nhận sau thay đổi

```powershell
.\.venv\Scripts\python.exe scripts/smoke_text_rag.py
```

Smoke ghi `eval/live_smoke_text.json` và fail nếu một intent dùng fallback hoặc
không có vector/hybrid retrieval. Đo request đầu và request đã warm riêng, giữ
cùng question, model, index và số request đồng thời khi so sánh hiệu năng.
Ollama timing chỉ đo provider; latency toàn API còn gồm SQL/retrieval/E5/HTTP.
Không cần rebuild text index khi chỉ đổi generation provider hoặc CPU/GPU.

Nguồn cấu hình: [Ollama Docker](https://docs.ollama.com/docker),
[Docker Desktop GPU](https://docs.docker.com/desktop/features/gpu/),
[Ollama chat API](https://docs.ollama.com/api/chat).
