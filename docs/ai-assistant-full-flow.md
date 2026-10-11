# Toàn bộ luồng AI assistant AutoWise

Đối chiếu mã nguồn ngày 11/10/2026. Tài liệu mô tả implementation trong repository, không khẳng định trạng thái dịch vụ đang chạy hay kết quả kiểm thử live trong phiên này.

## 1. Bức tranh tổng thể

AutoWise có chat thống nhất cho guest/customer tại `/chat` và trợ lý admin tại `/admin/assistant`. Route `/account/assistant` chuyển về `/chat`, giữ query string. React chọn giao diện theo session đăng nhập; backend chọn nghiệp vụ từ input thô. Catalogue dùng Python RAG, nghiệp vụ và lịch sử customer do C# quản lý, ảnh được tìm bằng image service riêng. Cả ba nhóm sử dụng bước viết và kiểm chứng cuối ở Python/Bedrock.

![Luồng tổng thể](diagrams/ai-assistant/flow-01.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart TD
    U["Người dùng: text hoặc ảnh"] --> UI["React: /chat"]
    UI --> AUTH{"Đã đăng nhập customer?"}
    AUTH -->|Chưa| G["Python: POST /api/chat/turns"]
    AUTH -->|Rồi| C["C#: POST /assistant/sessions/id/turns"]
    C --> CHECK["Owner session + requestId + hash + version"]
    G --> POLICY["Chặn câu hỏi quản trị ngoài quyền"]
    CHECK --> POLICY
    POLICY --> UNDER["Bedrock hiểu câu hỏi và context"]
    UNDER --> ROUTE{"Backend phân nhánh"}
    ROUTE -->|Catalogue, text| RAG["Python Text RAG"]
    ROUTE -->|Catalogue, ảnh| IMG["Image service: tìm mẫu gần giống"]
    IMG --> RAG
    ROUTE -->|Đơn, guest| LOGIN["Yêu cầu đăng nhập"]
    ROUTE -->|Đơn, customer| ORDER["C# OrderAssistant: công cụ theo owner"]
    ORDER -->|Ảnh kèm đơn| MATCH["Top 1 ảnh đối chiếu carId trên đơn"]
    MATCH --> E["Evidence đã truy xuất"]
    ORDER --> E
    RAG --> E
    LOGIN --> E
    E --> FINAL["Python compose_grounded: viết + kiểm chứng"]
    FINAL --> OK{"Đạt kiểm tra?"}
    OK -->|Có| STORE["Customer: lưu DB; guest: cache trình duyệt"]
    STORE --> VIEW["Câu trả lời + nguồn + thẻ nghiệp vụ + gợi ý"]
    OK -->|Không, sau một lần sửa| ERR["503: giữ input để thử lại"]
    A["Admin: /admin/assistant"] --> AC["C#: role Admin + CSRF + rate limit"]
    AC --> AT["Công cụ overview / orders / customers / support / revenue"]
    AT --> FINAL
```

</details>

Sơ đồ gộp điểm viết/kiểm chứng dùng chung; khi trả lời catalogue, điểm này nằm bên trong `/api/chat`. Customer nhận kết quả rồi lưu vào C#; admin trả kết quả trực tiếp và chỉ giữ hội thoại trong bộ nhớ trang. Từ chối quyền quản trị được trả bằng authorization policy trước model, không đi qua Bedrock. Hỏi chưa rõ có thể trả lời làm rõ trước khi truy xuất.

## 2. Cổng vào, quyền và lịch sử

| Nhóm | API chính | Nguồn context | Lưu lịch sử |
|---|---|---|---|
| Guest | `POST /api/chat/turns` | Tối đa 3 câu hỏi gần nhất, câu trả lời gần nhất, ID/tên xe từ browser | `sessionStorage`, chưa có session RAG guest trong DB |
| Customer | `POST /api/orders-service/assistant/sessions/{id}/turns` | History server, xe vừa trao đổi, đơn hiện tại/trước đó, chủ đề, câu hỏi đang chờ làm rõ | PostgreSQL `orders_service`, payload/context/version; ảnh qua ChatAttachments |
| Admin | `POST /api/orders-service/admin/assistant/messages` | Câu hỏi và scope/bộ lọc của lượt hiện tại | Bộ nhớ trang, tối đa 30 lượt; không gửi lịch sử cho model |

`/api/orders-service` là prefix public của module C#. Guest chỉ cung cấp context hội thoại, không được cung cấp facts đáng tin về xe/đơn. Python truy xuất lại dữ liệu thực. Với customer, session và mọi đơn phải thuộc tài khoản hiện tại. Các endpoint nội bộ `/api/chat/understand`, `/compose`, `/title` yêu cầu internal token; public `/api/chat` không nhận evidence ảnh/clarification nội bộ nếu thiếu token.

Customer gửi `requestId` và `version`. Server so hash để replay cùng request mà không gọi model lại; cùng requestId nhưng payload khác hoặc version cũ gây conflict. Khi ghi, server khóa theo session và kiểm tra lại để tránh ghi trùng. Lỗi AI không tạo lượt thành công hoặc tăng version. Tên hội thoại là luồng phụ qua Bedrock, không phải công cụ truy xuất.

## 3. Text RAG: từ câu hỏi đến facts

![Text RAG](diagrams/ai-assistant/flow-02.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart TD
    Q["Câu hỏi đã diễn giải + carIds nếu có"] --> I["Phân tích intent / entities / filters"]
    I --> AM{"Mơ hồ hoặc thiếu xe?"}
    AM -->|Có| CL["Yêu cầu làm rõ"]
    AM -->|Không| SQL["SQL chọn xe theo hãng, chỗ, giá, kiểu xe, IDs"]
    SQL --> SNAP["Snapshot xe / bảo hành / đại lý / sources"]
    SNAP --> DOC["Documents tiếng Việt theo section và facts"]
    DOC --> L["PostgreSQL lexical search"]
    DOC --> V["E5 query embedding 768 chiều + pgvector"]
    L --> F["RRF hợp nhất thứ hạng"]
    V --> F
    F --> FRESH["Loại chunks cũ theo content hash"]
    FRESH --> TOP["Chọn topK; dành evidence cho từng xe"]
    DOC -->|Bổ sung facts SQL khi retrieval thiếu| TOP
    TOP --> PK["Context package: factId / contextId / sources / qualifiers"]
    PK --> D["Draft chọn statements được phép bằng Bedrock"]
    D --> VD["Kiểm tra exact statements và references; sửa tối đa một lần"]
    VD --> PRE["Draft hợp lệ hoặc template facts nội bộ"]
    PRE --> N["compose_grounded: câu trả lời tự nhiên cuối"]
    CL --> N
```

</details>

Intent chính: tìm xe, hỏi giá, thông số, bảo hành, tìm đại lý, so sánh. Backend hợp nhất filters và giới hạn carIds; không cho kết quả ảnh mở rộng sang mẫu khác. `topK` được giới hạn 1–20. Với so sánh phải đủ evidence cho các xe được yêu cầu.

Lexical/vector chỉ dùng documents còn khớp content hash với snapshot hiện tại. Vector yêu cầu index tương thích model/revision. RRF dùng `1 / (60 + rank)`. Nếu index thiếu/lỗi, hệ thống có thể dùng lexical hoặc facts có cấu trúc từ SQL. Đây là giảm cấp retrieval, không bỏ bước kiểm chứng câu trả lời cuối.

Có hai lớp sinh nội dung: draft RAG chọn dữ kiện được phép và câu trả lời tự nhiên cuối. Draft nội bộ có thể fallback template; response thành công trên pipeline chat hiện tại vẫn phải vượt qua `compose_grounded`. Không được diễn giải fallback draft là câu trả lời cuối không cần Bedrock.

Giới hạn nguồn được mang theo: giá VND có nguồn và là giá tham khảo; thông số DVM-CAR có phạm vi thị trường Anh; bảo hành phải giữ điều kiện; xe lịch sử không được nói như xe đang phân phối. Không tự suy đoán dữ liệu thiếu.

## 4. Ảnh: hai nhánh sử dụng

![Nhận diện ảnh](diagrams/ai-assistant/flow-03.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart TD
    P["Upload JPEG / PNG / WebP, tối đa 10 MB"] --> DE["Decode và kiểm tra ảnh"]
    DE --> EMB["Extractor ảnh tương thích index: CLIP hoặc cấu hình khác"]
    EMB --> FA["FAISS search, gom kết quả theo carId"]
    FA --> CONF["Similarity top 1 + khoảng cách top 2"]
    CONF --> T["Chỉ dùng mẫu top 1 + uncertain"]
    T --> R{"Câu hỏi catalogue hay đơn?"}
    R -->|Catalogue| RA["Adapter gọi Python /api/chat với carIds và imageMatch"]
    RA --> TEXT["Text RAG lấy facts đúng mẫu xe"]
    TEXT --> FIN["Viết và kiểm chứng cuối"]
    R -->|Đơn customer| O["Tra đơn thuộc tài khoản"]
    O --> CMP["So carId ảnh với carId trên đơn"]
    CMP --> SEC["Section ảnh: khớp / không khớp / chưa chắc chắn"]
    SEC --> FIN
    R -->|Đơn guest| LI["Yêu cầu đăng nhập trước khi tra đơn"]
```

</details>

Catalogue ảnh đi qua image service `/chat`; service gọi `/search` nội bộ qua retriever rồi quay về common RAG. Đơn + ảnh đi qua C# UnifiedAssistant: gọi `/search/image`, sau đó đưa ImageOrderEvidence cho OrderAssistant. Confidence được tính từ tập ứng viên trước khi chỉ tiêu thụ top 1.

Similarity không phải xác suất nhận diện. Chỉ xác định mẫu gần giống trong catalogue; không xác minh chiếc xe thực tế, năm/phiên bản hay VIN. Nếu không có mẫu hoặc lỗi nhận diện, nhánh catalogue tạo câu trả lời làm rõ. Lỗi adapter/AI trả 503. Index ảnh riêng với PostgreSQL text index; đổi extractor/preprocessing phải dùng index tương thích.

## 5. Customer: context, multi-intent và công cụ

![Trợ lý khách hàng](diagrams/ai-assistant/flow-04.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart TD
    Q["Câu hỏi route orders"] --> CT["Đọc context: current / previous order, topics, pending, drafts"]
    CT --> OWN["Kiểm tra lại owner của references"]
    OWN --> RES["Luật cục bộ + Bedrock resolve context; summary nếu bật"]
    RES --> O{"Chọn được đúng một đơn?"}
    O -->|Chưa| ASK["Hỏi mã đơn; nhớ pending topics"]
    O -->|Rồi| TYPE{"Loại yêu cầu"}
    TYPE -->|Tra cứu| MULTI["Tách nhiều chủ đề trong một lượt"]
    MULTI --> P["Tiến trình + bước tiếp theo"]
    MULTI --> PAY["Thanh toán / thu hoàn đã xác nhận"]
    MULTI --> DEL["Lịch bàn giao"]
    MULTI --> DOC["Checklist hồ sơ"]
    MULTI --> CAR["Thông tin xe / bảo hành qua Python"]
    P --> S["Sections: success / missing / error + retrievedAt + link"]
    PAY --> S
    DEL --> S
    DOC --> S
    CAR --> S
    TYPE -->|Đổi lịch / hủy / hỗ trợ| DRAFT["Chuẩn bị bản nháp, chưa gửi"]
    TYPE -->|Tài khoản| NAV["Liên kết trang nghiệp vụ"]
    ASK --> FIN["Python compose_grounded"]
    S --> FIN
    DRAFT --> FIN
    NAV --> FIN
    FIN --> SAVE["Lưu messages + sources + context + attachments + tăng version"]
```

</details>

Topics rõ ràng trong câu hỏi ưu tiên hơn chủ đề suy ra từ lịch sử. Sau câu hỏi làm rõ, chỉ gửi mã đơn có thể tiếp tục các topics đang chờ. Nhiều mã đơn hoặc mã đơn không khớp đơn đang chọn phải làm rõ. Không có reference thì yêu cầu chọn đơn thay vì tự chọn. Các references do model đề xuất luôn chịu kiểm tra owner và ambiguity của backend.

Các công cụ chính: `ListMyOrders`, `GetMyOrderProgress`, `GetMyOrderPaymentSummary`, `GetMyDeliverySchedule`, `GetMyOrderDocuments`, `GetCarDetail`, `GetWarranty`, `GetMyOrderTopics`, `NavigateAccount`, `PrepareChangeDraft`, `PrepareSupportDraft`.

Thanh toán chỉ tính giao dịch đã xác nhận; tiền chốt trên đơn khác với giá tham khảo catalogue. Thông tin xe/bảo hành gọi API Python và ghi nhận thiếu/lỗi theo section. Một topic lỗi không được biến thành dữ liệu đã xác minh; kết quả nhiều section có thể `partial`. NextSteps là logic giao diện theo vai trò/kết quả, không phải vòng agent tự hành động.

## 6. Gửi yêu cầu thay đổi và chuyển hỗ trợ

![Xác nhận yêu cầu](diagrams/ai-assistant/flow-05.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
sequenceDiagram
    actor KH as Khách hàng
    participant Chat as Chat + OrderAssistant
    participant UI as Draft card
    participant API as AssistantDraftActions
    participant DB as PostgreSQL
    participant Admin as Đại lý / Admin
    KH->>Chat: Muốn đổi lịch / hủy / chuyển hỗ trợ
    Chat-->>UI: Bản nháp + thông tin còn thiếu + thời hạn
    KH->>UI: Sửa lý do, ngày giờ hoặc tóm tắt vấn đề
    UI->>API: draft-actions: edit
    API->>DB: Kiểm owner, version, điều kiện, lưu draft
    KH->>UI: Bấm Xác nhận gửi
    UI->>API: draft-actions: confirm + requestId + versions
    API->>DB: Transaction, khóa, revalidate, chống trùng
    API->>DB: Tạo ChangeRequest hoặc SupportTicket
    API-->>UI: Đã gửi / chờ xử lý + mã yêu cầu
    Admin->>DB: Xử lý qua module nghiệp vụ
```

</details>

Draft hết hạn sau 30 phút và có thể edit/discard/confirm. Gõ “đồng ý”, “ok” hoặc “gửi đi” trong chat không gửi yêu cầu. Confirm đổi lịch/hủy tạo đề nghị cho admin xử lý; không lập tức đổi lịch hoặc trạng thái đơn. Phiếu support chứa liên kết đã kiểm tra và snapshot chủ đề/kết quả gần đây. Những thao tác này là API nghiệp vụ xác định, không phải model trực tiếp ghi DB.

## 7. Trợ lý Admin

![Trợ lý quản trị](diagrams/ai-assistant/flow-06.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart TD
    A["Câu hỏi + scope + filters từ /admin/assistant"] --> P["Cookie auth + role Admin + CSRF + 10 lượt/phút"]
    P --> V["Validate scope, status, query, dates"]
    V --> R["Luật chọn tool: mã AW, doanh thu, kỳ thống kê"]
    R --> T{"Tool cố định"}
    T --> O["Overview: aggregate toàn hệ thống"]
    T --> L["Orders / customers / support: tối đa 20 + totalCount"]
    T --> F["Revenue: kỳ UTC+7, aggregate toàn bộ"]
    O --> D["Projection an toàn + qualifiers + links backend"]
    L --> D
    F --> D
    D --> N["NaturalAnswers gọi Python /api/chat/compose"]
    N --> G["Bedrock viết + kiểm chứng cuối"]
    G --> UI["Trả answer + data + links; private, no-store"]
```

</details>

Admin assistant chỉ đọc dữ liệu. SQL/EF queries cố định và có tham số; model không tạo SQL, URLs hoặc thực hiện thay đổi. Bộ lọc và tool do UI/luật backend quyết định, khác routing ngôn ngữ của unified customer chat.

Revenue vận hành là tổng giá chốt các đơn hoàn thành theo ngày bàn giao thực tế; dòng tiền là thu/hoàn đã xác nhận theo ngày xác nhận, tính thu ròng. Chưa là doanh thu kế toán, không có chi phí/lợi nhuận. Kỳ theo UTC+7; ngày chọn rõ ràng ưu tiên hơn câu hỏi. Danh sách bị cắt 20 không ảnh hưởng aggregate toàn bộ dữ liệu. Không gửi mật khẩu/security stamp/audit cho AI, không đọc phản hồi và ghi chú nội bộ support.

Guest/customer hỏi thống kê quản trị bị từ chối trước model, `status=forbidden`, `generationMode=authorization-policy`, không evidence/citations. Quyền thật vẫn được bảo vệ bằng endpoint Admin riêng và owner trong mọi truy vấn customer.

## 8. Bước trả lời cuối dùng chung

![Kiểm chứng câu trả lời](diagrams/ai-assistant/flow-07.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart TD
    D["VerifiedData: facts / sections / sources / qualifiers"] --> W["Bedrock viết câu trả lời tiếng Việt"]
    W --> C["Backend kiểm số, đơn vị, URL/HTML, giá đúng xe, giới hạn ảnh"]
    C --> R["Bedrock review: từng claim, chủ thể, trạng thái, phủ định, điều kiện"]
    R --> VALID{"References và nội dung hợp lệ?"}
    VALID -->|Có| META["Lọc sources theo contextIds thực sự hỗ trợ câu trả lời"]
    META --> OUT["answer / grounded / status / evidence / citations"]
    VALID -->|Không, lượt đầu| FIX["Feedback rồi viết lại một lần"]
    C -->|Sai, lượt đầu| FIX
    FIX --> W
    VALID -->|Vẫn sai| ERR["503"]
```

</details>

Registry nguồn đến từ retrieval/công cụ; model không được tạo sourceId/URL mới. Metadata cuối được tính từ câu trả lời đã review, không sao chép nhãn grounded của draft. Các status thường gặp: `ok`, `partial`, `no_data`, `needs_clarification`; `forbidden` là policy riêng. Grounding bằng LLM là lớp kiểm tra bổ sung, không đảm bảo tuyệt đối mọi cách diễn đạt. Chi phí/latency gồm hiểu câu hỏi, các bước RAG/context tùy nhánh, viết và review, có thể thêm repair/title/summary.

## 9. Chuẩn bị dữ liệu và thông báo nền

![Chuẩn bị dữ liệu](diagrams/ai-assistant/flow-08.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart LR
    RAW["Corpus / curated data"] --> BUILD["build_dataset + validation"]
    BUILD --> SQL["Seed / migration PostgreSQL"]
    SQL --> DOC["build_text_index: documents tiếng Việt + facts + sourceIds"]
    DOC --> CH["Chunk giữ nguyên claim + content hash"]
    CH --> E5["E5 passage embeddings 768 chiều"]
    E5 --> PG["documents + pgvector + model revision"]
    PG --> CHECK["validate_rag_index"]
    PH["Ảnh catalogue"] --> IE["Extractor + preprocessing tương thích"]
    IE --> FA["FAISS index + metadata carId"]
```

</details>

Index text chỉ cập nhật documents thay đổi và embeddings thiếu/khác revision; xóa orphan, tránh ghi embedding nếu document đổi trong lúc inference. Query E5 và passage E5 dùng prefix riêng. Dữ liệu ảnh/index riêng phải đồng bộ carId với catalogue.

![Thông báo nền](diagrams/ai-assistant/flow-09.svg)

<details>
<summary>Xem mã Mermaid</summary>

```mermaid
flowchart LR
    B["Nghiệp vụ hoặc lịch giao thay đổi"] --> OB["notification_outbox"]
    OB --> WORK["NotificationWorker / Delivery"]
    WORK --> RULE["Kiểm owner, schedule version, trạng thái và preference"]
    RULE --> N["Notifications chống trùng"]
    N --> ACC["Thông báo trong tài khoản"]
    ACC --> CHAT["Mở chat với orderId để tiếp tục"]
```

</details>

Thông báo là worker nghiệp vụ, không cần LLM. Nhắc giao dùng mốc 08:00 giờ Việt Nam của ngày giao, lùi một ngày; lịch cũ/hủy/đã bàn giao không được phát nhắc cũ. Outbox xử lý retry và chống trùng.

## 10. Mã nguồn đối chiếu

| Phần | File chính |
|---|---|
| Giao diện và guest | `frontend/src/pages/ChatPage/index.tsx`, `frontend/src/features/chat/storage.ts` |
| Customer, draft cards | `frontend/src/features/orders/OrderAssistantPage.tsx`, `AssistantDraftCard.tsx`, `SupportDraftCard.tsx` |
| Routing và API C# | `services/owner-features/src/AutoWise.OwnerFeatures.Api/Program.cs`, `Infrastructure/UnifiedAssistant.cs` |
| Guest routing | `backend/app/routers/guest_chat.py`, `infrastructure/ai/question_understanding.py` |
| RAG | `backend/app/application/rag/{rag,text_retriever,intent,context_builder,documents,indexing}.py`, `repositories/rag_repository.py` |
| Final answer | `backend/app/routers/chat.py`, `infrastructure/ai/{natural_answers,answer_grounding,bedrock}.py` |
| Ảnh | `image_service/app/routers/chat.py`, `core/{image_retriever,feature_extractor,vector_index,rag_adapter}.py` |
| Đơn/context | `services/owner-features/src/AutoWise.OwnerFeatures.Infrastructure/{OrderAssistant,BedrockAssistant}.cs`, `Application/ConversationContext*.cs` |
| Draft và support | `Infrastructure/{AssistantDraftActions,SupportStore}.cs` dưới module owner-features |
| Admin | `Infrastructure/{AdminAssistant,AdminFinance,NaturalAnswers}.cs` dưới module owner-features |
| Thông báo | `Infrastructure/NotificationDelivery.cs`, `Api/NotificationWorker.cs` dưới module owner-features |

README và tài liệu trạng thái đã được đối chiếu lại ngày 11/10/2026: unified chat/image/admin dùng các luồng trên. Sơ đồ không đưa voice, web search, model tự chạy SQL hay agent loop vào vì chưa thấy các luồng đó trong implementation được đối chiếu.
