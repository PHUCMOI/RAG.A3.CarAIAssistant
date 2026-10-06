# Claude Haiku 4.5 trên Amazon Bedrock

Chatbot tư vấn xe Python hỗ trợ `LLM_PROVIDER=bedrock` và `LLM_PROVIDER=ollama`.
Trợ lý đơn hàng C# đã hỗ trợ Bedrock; Docker override bên dưới bật cả hai dịch vụ.
Embedding vẫn dùng multilingual E5 và index hiện có, không cần rebuild index khi
chỉ đổi model sinh câu trả lời.

## Cấu hình

Cài AWS SDK vào môi trường Python của dự án:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

Đặt các giá trị sau trong `.env` tại root repository. File này đã được Git ignore.
Chỉ dùng credentials mới, thu hồi các key từng được chia sẻ trong chat. Không đưa
key vào frontend, appsettings, `.env.example` hoặc Git.

```dotenv
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_TIMEOUT=30
AWS_ACCESS_KEY_ID=<access-key-moi>
AWS_SECRET_ACCESS_KEY=<secret-key-moi>
# Nếu dùng temporary credentials, thêm AWS_SESSION_TOKEN.
```

Python chạy native cũng hỗ trợ `AWS_PROFILE` và AWS SDK credential chain khi
không đặt access/secret key trong `.env`. Trên AWS dùng IAM role.

Model ID có prefix `us.` là US cross-region inference profile. IAM cần quyền
`bedrock:InvokeModel` trên inference profile và foundation model ở các region
đích; tài khoản phải có quyền truy cập model Anthropic.

Tham khảo [model card AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html)
và [AWS SDK credential chain](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html).

## Chạy ứng dụng

Python native: chạy từ root để `.env` được đọc, hoặc restart tiến trình đang chạy:

```powershell
.\.venv\Scripts\python.exe backend/run.py
```

Docker: Compose đọc AWS credentials từ `.env` hoặc biến môi trường PowerShell,
truyền vào backend Python và C#. Không cần mount file credentials của Windows:

```powershell
docker compose -f docker-compose.yml -f docker-compose.bedrock-env.yml up --build -d api orders-api
```

Cấu hình cũ dùng profile `rag-a3` và file `%USERPROFILE%/.aws/credentials`
vẫn được hỗ trợ bởi `docker-compose.bedrock.yml`. Chọn một override; không
gộp override profile và environment.

Sau khi đổi credentials hoặc model, chạy lại lệnh `up -d` để Compose cập nhật
environment. `restart` đơn thuần không nạp lại environment đã thay đổi.

Backend tư vấn xe dùng Converse để phân loại ý định và chọn `statementIds` từ
dữ kiện đã xác minh. Backend dựng câu trả lời và citations, kiểm tra dữ kiện rồi
repair tối đa một lần. AWS lỗi, timeout hoặc JSON không hợp lệ thì dùng template.
SDK không retry tự động; generation và repair dùng chung `BEDROCK_TIMEOUT`.

## Kiểm tra

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
docker compose -f docker-compose.yml -f docker-compose.bedrock-env.yml logs --tail 50 api orders-api
.\.venv\Scripts\python.exe scripts/smoke_text_rag.py
```

Log Python `Bedrock model=... request_id=...` chứng minh đã nhận phản hồi từ AWS;
log C# dùng `Bedrock inference completed` hoặc `Bedrock context inference completed`.
Không log prompt hoặc credentials. `generationMode=template` báo fallback;
HTTP 200 riêng lẻ không chứng minh model hoạt động. Smoke kiểm tra embedding thật
và năm ý định qua HTTP, yêu cầu `generationMode=llm` và vector/hybrid retrieval.

Chuyển về model local: đặt `LLM_PROVIDER=ollama`, chạy Ollama và khởi động lại
Python hoặc `docker compose up -d api` bằng file compose chính. Override Bedrock
luôn ép Python dùng Bedrock.

## Xác minh ngày 2026-10-06

- Backend regression: 119 test pass, 1 PostgreSQL integration test skip vì không
  đặt `TEST_DATABASE_URL` riêng; `git diff --check` pass.
- Cả hai cấu hình Compose (environment và profile) qua `config --quiet`.
- AWS thật: generation và classification thành công trên model/vùng nêu trên;
  JSON trả về có markdown fence và được parse/validate bằng provider mới.
- Gọi `/api/chat` bằng FastAPI TestClient với lifespan, PostgreSQL local, E5 và
  Bedrock thật: `intent=ask_price`, `generationMode=llm`, `grounded=true`,
  `status=ok`, `retrieval=postgresql-hybrid-search`, một citation.
- Request ID AWS của lượt `/api/chat`: `82232bce-ab35-4d95-8339-aeca657ab350`.

Chưa rebuild/chạy các backend trong Docker ở lượt xác minh này. Kiểm tra HTTP
đã thực hiện trong tiến trình test với ứng dụng thật; không để lại server nền.
