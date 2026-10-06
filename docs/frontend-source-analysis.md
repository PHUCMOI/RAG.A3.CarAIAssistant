# Phân tích source để phát triển frontend

Ngày kiểm tra: 02/10/2026. Mốc source: `6574f14`. Nhánh làm việc: `feat/frontend`.

Phạm vi lần này: tạo nhánh, đọc các module và đối chiếu tài liệu, kiểm tra build frontend. Chưa thay đổi chức năng. Tài liệu đề xuất trong Downloads là nguồn tham khảo về mục tiêu A3; các công việc phân công trong đó không tự động trở thành yêu cầu triển khai của lần này.

## 1. Kiến trúc thực tế

```text
Browser → React + TypeScript + Vite / Nginx
  ├─ /api/* → FastAPI Python :5080 → PostgreSQL :5432
  └─ /api/orders-service/* → ASP.NET Core :5090
                                ├─ PostgreSQL, schema orders_service
                                └─ gọi FastAPI để kiểm tra xe/đại lý

Image service :8000 (Docker profile image, chưa nối vào frontend)
  └─ FastAPI → CLIP / bộ trích xuất NumPy-PIL → FAISS + snapshot JSON
```

- `frontend/`: React SPA, React Router, CSS thuần, gọi API qua `fetch`.
- `backend/`: FastAPI, Pydantic, asyncpg; tách router, application, repository và database pool.
- `services/owner-features/`: ASP.NET Core .NET 10; các lớp Domain/Application/Infrastructure/API, EF Core và cookie authentication.
- `database/`: schema, seed, cập nhật dữ liệu và kiểm tra số lượng seed khi dựng database mới.
- `dataset/`: ảnh curated, manifest, thống kê dữ liệu.
- `image_service/`: prototype nhận diện ảnh, build FAISS index, đánh giá retrieval.
- `scripts/`: xử lý dữ liệu nguồn; một số file pipeline RAG vẫn rỗng.
- `docs/`: đặc tả sản phẩm, từng màn hình và kiến trúc đích. Cần phân biệt đặc tả với phần đã có code.

Frontend A3 là React, khác với file Streamlit `RagA1Search/frontend/app.py` đang mở trong IDE. Thư mục cần phát triển là `RAG.A3.CarAIAssistant/frontend`.

## 2. Frontend hiện có

Điểm vào: `src/main.tsx` → `src/App.tsx` → `src/app/router.tsx`. CSS được import thực tế là `src/shared/styles/globals.css`; `src/styles.css` không được import từ entry này.

| Route | Code hiện tại | Giới hạn |
|---|---|---|
| `/` | Trang chủ, tìm nhanh, tải 6 xe | Số liệu giới thiệu hard-code; lỗi API bị chuyển thành danh sách rỗng |
| `/cars` | Lọc hãng, tên, kiểu xe, ghế, giá; chọn tối đa 3 xe | Tải tối đa 100 xe rồi lọc client; chưa phân trang/sắp xếp; chưa có ảnh thật |
| `/cars/:carId` | Giá, mô tả, thông số cơ bản, bảo hành, link nguồn | Gallery chưa có; API chưa trả URL ảnh; CTA chat truyền carId vào câu hỏi dạng text |
| `/compare` | Chọn/thay/xóa 2–3 xe, URL chia sẻ, chỉ xem khác biệt | Phần này tương đối đầy đủ; bộ chọn vẫn tải toàn bộ catalogue |
| `/dealers` | Tải danh sách, lọc hãng/thành phố | Thiếu thông báo riêng khi không có kết quả và nút retry |
| `/chat` | Tin nhắn text, trạng thái gửi, context card | Chưa upload ảnh, render Markdown, retry, reset/lưu hội thoại; chỉ gửi câu hiện tại |
| `/sources/:sourceId` | Metadata nguồn, link ngoài, các bản ghi tham chiếu | Có phân biệt 404/lỗi mạng và hủy request khi unmount |
| `/login`, `/account/orders/*` | Đăng nhập và xem đơn của khách | Phụ thuộc dịch vụ C# và cookie cùng origin |
| `/admin/login`, `/admin/orders/*`, `/admin/customers` | Quản trị đơn, khách, thu/hoàn tiền, bàn giao | Có guard Admin và kiểm tra quyền ở API |
| `/admin/data`, `/admin/rag` | Placeholder trong layout admin | Chưa có CRUD dữ liệu hay API vận hành RAG tương ứng |

Cấu trúc `app / pages / features / entities / shared` đã được dựng nhưng nhiều file mới là khung rỗng. Logic catalogue, chat, detail và dealers chủ yếu nằm trực tiếp trong `pages/*/index.tsx`. Các file `features/chat/*`, `features/car-search/*`, `CarGallery.tsx`, `tokens.css`, `problemDetails.ts` và các file test trang hiện rỗng. Không nên suy ra mức độ hoàn thiện từ tên thư mục.

State hiện tại: `useState`, `useEffect`; URL lưu bộ lọc và xe so sánh; localStorage lưu lựa chọn so sánh; React Context lưu phiên đơn hàng. Không có thư viện server-state cache hay UI component library.

## 3. Backend và dữ liệu

API chính dùng JSON camelCase, ví dụ `carId`, `displayName`, `priceVndFrom`, `presenceSourceId`.

| API chính | Request/response đáng chú ý |
|---|---|
| `GET /api/cars` | query, brand, bodyType, seats, maxPrice, limit; trả `{ count, items }`; count là số bản ghi trả về, chưa phải tổng phân trang |
| `GET /api/cars/{carId}` | Trả `CarDto`; có imageCount nhưng không có danh sách URL ảnh |
| `GET /api/cars/compare?ids=...` | 2–3 ID khác nhau; trả `{ items, missingIds }` |
| `GET /api/dealers` | Lọc brand/city; trả `{ count, items }` |
| `GET /api/sources/{sourceId}` | Nguồn kèm references theo xe/giá/bảo hành/đại lý/document |
| `GET /api/warranties` | Lọc brand và car_id |
| `POST /api/search/text` | query và bộ lọc, topK; truy vấn SQL, chưa semantic search |
| `POST /api/chat` | `{ question, imageName? }` → `{ answer, contexts, grounded }` |

Chat chính tìm tên/alias xe trong câu hỏi rồi fallback sang `ILIKE` tên xe. Câu trả lời là template, chưa gọi LLM, chưa trích xuất ngân sách/số ghế từ ngôn ngữ tự nhiên. Prompt như “SUV 5 chỗ dưới 1 tỷ” không được xử lý như một tập bộ lọc. `imageName` chỉ là tên file; không phải upload ảnh.

Schema có `cars`, `car_images`, `dealers`, `warranties`, `sources`, `documents`; vector ảnh 512 chiều và vector text 768 chiều. Seed verifier kỳ vọng 50 xe, 215 ảnh, 22 đại lý, 9 bảo hành, 61 nguồn và 0 documents. Đây là số liệu trong repository, chưa xác minh trên database chạy thực tế ở máy này.

`dataset/dataset_info.json` ghi 48/50 xe có ảnh, tổng 215 ảnh. So với mục tiêu 250–500 ảnh trong đề xuất, dữ liệu ảnh vẫn thiếu. Các file `scripts/ingest_documents.py`, `generate_text_embeddings.py`, `generate_image_embeddings.py`, `validate_rag_index.py` hiện rỗng. `build_dataset.py` cần raw corpus trong `data/`, không có sẵn trong clone này; seed và curated dataset có sẵn cho first run.

## 4. Image service và điểm tích hợp

- `POST /search/image`: multipart `file`, `top_k`; trả results với `car_id`, `display_name`, `similarity`, `best_image`, cùng `confidence`, `uncertain`, `margin`, `latency_ms`.
- `POST /chat`: multipart `message` + `file`, hoặc JSON `message` + `image_base64`; trả answer, intent, identified_cars, contexts, uncertain, latency_ms.
- `POST /search/text`, `GET /cars/{car_id}`: snapshot riêng, field snake_case; khác contract API chính.
- Chưa có tuyến proxy từ frontend tới image service. Đường dẫn `best_image` là đường dẫn dữ liệu, chưa phải URL ảnh được web server phục vụ.
- Index metadata ghi CLIP `openai/clip-vit-base-patch32`, 512 chiều, 171 vector. Test manifest có 44 ảnh, tương ứng tập 215 ảnh được chia index/test.
- Dockerfile chỉ cài requirements cơ bản; requirements chưa bật torch/transformers. Extractor cố tải CLIP theo metadata và báo lỗi nếu không khởi tạo được. Vì vậy cần hoàn thiện runtime model trước khi tích hợp upload và kiểm tra API thật; health/index-loaded không chứng minh encoder đã sẵn sàng.
- `rag_adapter.py` thử import `src.rag` rồi fallback sang template. Không thấy module `src.rag` tương ứng trong repo này. Fallback có score cố định và có thể chọn xe đầu tiên khi không khớp; không được xem đó là chất lượng RAG đã hoàn thiện.
- File kết quả evaluation đã commit ghi Recall@5 = 0.8636 trên 44 ảnh; đây là kết quả có sẵn, chưa được chạy lại trong lần phân tích này.

Frontend nên dùng adapter có type để chuyển snake_case sang model UI thống nhất. Cần thống nhất với backend tuyến gọi ảnh, URL phục vụ ảnh và schema citation; tránh để component trực tiếp xử lý hai contract khác nhau. Similarity cần được hiển thị là độ tương đồng, không tự coi là xác suất nhận diện đúng.

## 5. Module đơn hàng C#

Module đã có code thực tế, dù một số phần README vẫn mô tả là chưa triển khai. API nằm dưới `/api/orders-service`: đăng nhập/đăng xuất/CSRF/me, đơn khách hàng, quản trị khách và đơn, cập nhật trạng thái, thanh toán và bàn giao.

Domain kiểm tra chuyển trạng thái, tiền thu/hoàn, điều kiện hoàn tất và version. Infrastructure dùng transaction, row lock, idempotency key và snapshot xe/đại lý; CommonCatalogue gọi API Python. Frontend gửi cookie, CSRF token và Idempotency-Key qua client riêng trong `features/orders/api.ts`. Thanh toán ở đây là ghi nhận/ xác nhận thu và hoàn tiền, chưa phải tích hợp cổng thanh toán.

`OrdersSession` bọc toàn bộ ứng dụng và gọi `/me` khi khởi động; layout public cũng chờ session loading. Admin được chuyển sang cổng quản trị. Khi phát triển frontend public cần chú ý ảnh hưởng của độ trễ dịch vụ đơn hàng tới lần mở trang đầu tiên.

## 6. Vấn đề ưu tiên trước khi phát triển frontend

1. **Cấu hình Vite bị trùng và lệch.** Kiểm tra trực tiếp bằng `resolveConfig` cho thấy Vite chọn `frontend/vite.config.js`. File JS chỉ proxy `/api` sang 5080, trong khi TS có thêm `/api/orders-service` sang 5090. Dev mặc định sẽ chuyển request đơn hàng sang Python. Cần thống nhất một config hoặc chỉ định config TS; Nginx hiện đã tách hai tuyến đúng.
2. **CTA “Hỏi về xe này” mất định danh có cấu trúc.** Detail truyền `carId` qua query `car`; chat ghép ID vào câu hỏi, còn backend tìm display_name/aliases. Cần truyền tên hiển thị hoặc thống nhất API nhận carIds.
3. **Ảnh và chatbot đa phương thức còn thiếu xuyên suốt.** UI upload, trả URL ảnh, proxy, model runtime và contract cần được nối cùng nhau.
4. **Mobile navigation chưa đủ.** CSS ẩn `.main-nav` dưới 900px nhưng AppHeader không có menu thay thế; admin cũng dùng class này.
5. **Trạng thái lỗi/dữ liệu cũ chưa nhất quán.** Detail chưa reset car/error hoặc hủy request khi carId đổi; Home nuốt lỗi; Dealers thiếu empty/retry; client chung chỉ báo HTTP status và POST chưa hỗ trợ signal/timeout.
6. **Ngôn ngữ và nguồn còn chưa đồng nhất.** Card/detail biến underscore thành khoảng trắng cho market status, còn comparison có nhãn Việt. Warranty ở detail trỏ presence source thay vì lấy warranty source riêng. Cần thống nhất formatter/label và provenance.
7. **Test frontend chưa tồn tại thực chất.** File test đang rỗng; package.json chỉ có dev/build/preview, chưa có runner test/lint. Build thành công không chứng minh hành vi UI/API đúng.

## 7. Thứ tự triển khai đề xuất cho phần frontend

1. Chuẩn hóa config dev và API client; xác minh public pages, session và API đơn hàng chạy đúng tuyến.
2. Tách chat thành composer/message/context/result components và hooks/api/types; bổ sung retry, reset, trạng thái rỗng/lỗi, truy cập bàn phím, hiển thị nguồn.
3. Chốt contract ảnh với backend: multipart upload, top-k, uncertain, image URL và lỗi 400/503; thêm preview, giới hạn file, kết quả ảnh và liên kết detail/compare.
4. Hoàn thiện gallery và card ảnh; sửa CTA detail → chat, mobile navigation, nhãn Việt, loading/error/empty thống nhất.
5. Kiểm thử các luồng text, ảnh, ảnh + text, không có kết quả, API lỗi, thiếu dữ liệu, compare và màn hình mobile. Ưu tiên test hành vi ở ranh giới API.

Với mục tiêu A3 trong tài liệu đính kèm, chatbot có ảnh/top-k/nguồn cần được ưu tiên. Admin CRUD, cấu hình RAG và mở rộng đơn hàng là các nhánh chức năng riêng. Tài liệu đính kèm gợi ý Streamlit/Gradio, còn repo đã có React: tiếp tục React tận dụng được source hiện tại. Evaluation/báo cáo trong phân công thành viên 4 là phạm vi cần thống nhất riêng, không mặc định giao cho người làm frontend.

## 8. Kiểm chứng trong lần phân tích

- Tạo nhánh `feat/frontend` từ `main` tại `6574f14`.
- Cài dependencies theo lockfile bằng `npm.cmd ci --ignore-scripts --no-audit --no-fund`.
- `npm.cmd run build`: thành công, TypeScript + Vite, 50 modules; bundle JS khoảng 319.64 kB trước gzip.
- Đọc cấu hình runtime của Vite để xác nhận file JS được chọn và proxy orders thiếu.
- Chưa chạy end-to-end, database seed, backend/image tests hay C# tests. Python/py trong PATH hiện không chạy được; máy có .NET SDK tối đa 8.0.403 trong danh sách kiểm tra, trong khi module yêu cầu net10.0.
- Dependencies frontend đã nằm trong `frontend/node_modules`; có thể dùng `npm.cmd` trong PowerShell do `npm.ps1` bị execution policy chặn. Không cần thay đổi execution policy để chạy lệnh này.

Các file bắt đầu nên đọc: `frontend/src/app/router.tsx`, `frontend/src/pages/ChatPage/index.tsx`, `frontend/src/shared/api/client.ts`, `frontend/src/entities/car/model.ts`, `backend/app/models/schemas.py`, `image_service/app/models/schemas.py` và `docs/feature_spec_chatbot.md`.
