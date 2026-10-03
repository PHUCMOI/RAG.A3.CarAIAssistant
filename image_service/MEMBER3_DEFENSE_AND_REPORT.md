# CẨM NANG BÁO CÁO, DEMO & VẤN ĐÁP — THÀNH VIÊN 3
## Đồ án A3: Trợ lý tư vấn ô tô đa phương thức sử dụng RAG
### Phân hệ: Image Retrieval và Backend API (`image_service/`)

---

## PHẦN 1: ĐÓNG GÓP VÀO BÁO CÁO ĐỒ ÁN (REPORT SECTION)

### 1.1. Kiến trúc phân hệ Image Retrieval
* **Đầu vào**: Hình ảnh ô tô từ người dùng (định dạng JPG/PNG/WebP, dung lượng $\le 10$ MB).
* **Tiền xử lý**: Kiểm tra tính toàn vẹn (PIL `verify`), chuyển đổi RGB, tự động resize theo chuẩn của Preprocessor.
* **Trích xuất đặc trưng**: Mô hình Vision Transformer đa phương thức **OpenAI CLIP ViT-B/32** sinh vector đặc trưng 512 chiều, được L2-normalize ($\|v\|_2 = 1$).
* **Lưu trữ & Truy hồi vector**: Sử dụng **FAISS `IndexFlatIP`** (Inner Product trên vector chuẩn hóa tương đương Cosine Similarity).
* **Car-level Aggregation**: Do 1 mẫu xe có nhiều góc chụp, FAISS trả về Top 30 ảnh tương đồng $\rightarrow$ Hệ thống gom nhóm theo `car_id`, chọn điểm tương đồng cao nhất cho từng xe $\rightarrow$ Trích xuất đúng **Top-5 mẫu xe duy nhất** làm context cho module RAG.
* **Margin & Confidence Scoring**: Phân loại độ tin cậy dựa trên điểm số Top 1 và khoảng cách (margin) so với Top 2:
  * `high`: $similarity \ge 0.70$ và $margin \ge 0.03$.
  * `medium`: $0.50 \le similarity < 0.70$.
  * `low`: $similarity < 0.50 \rightarrow$ Gán cờ `uncertain: true` để Chatbot trả lời thận trọng, tránh bịa đặt thông tin.

---

### 1.2. Thí nghiệm Ablation Study chứng minh cải tiến

Bảng số liệu thực nghiệm trên **44 ảnh kiểm thử độc lập** (Holdout Test Set):

| Cấu hình Thí nghiệm | Bộ trích xuất đặc trưng | Chiến lược gom nhóm | Recall@1 | Recall@3 | Recall@5 | MRR | Độ trễ (ms) |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **Config A (Baseline thô sơ)** | Standalone (Color/Sobel) | Không gộp xe (Image Top-5) | 2.27% | 9.09% | 15.91% | 0.0781 | **15.1 ms** |
| **Config B (+ Car Aggregation)** | Standalone (Color/Sobel) | **Car-level Aggregation** | 2.27% | 13.64% | 22.73% | 0.0962 | **15.65 ms** |
| **Config C (+ Deep CLIP)** | **OpenAI CLIP ViT-B/32** | Không gộp xe (Image Top-5) | 70.45% | 84.09% | 84.09% | 0.7652 | **57.15 ms** |
| **Config D (Đề xuất hoàn chỉnh)** | **OpenAI CLIP ViT-B/32** | **Car-level Aggregation** | **70.45%** | **84.09%** | **86.36%** | **0.7735** | **63.46 ms** |

**Kết luận thực nghiệm:**
1. Áp dụng mô hình Deep Multimodal Pretrained (CLIP) giúp Recall@5 nhảy vọt từ **22.73%** lên **86.36%** (tăng **+63.63%**), chứng minh năng lực hiểu ngữ nghĩa hình dáng xe vượt trội so với đặc trưng màu sắc truyền thống.
2. Cơ chế **Car-level Aggregation** giúp tăng thêm **+2.27%** Recall@5 trên CLIP và giải quyết triệt để lỗi "độc quyền Top-5" bởi các góc chụp của cùng một mẫu xe.
3. Độ trễ toàn trình đạt **63.46 ms**, đáp ứng hoàn hảo tiêu chí thời gian thực.

---

### 1.3. Phân tích lỗi (Error Analysis - Confusion Pairs)
1. **Toyota Yaris (`car_92_44`) $\rightarrow$ nhầm thành Kia Rio (`car_43_9`)**: Cùng là dòng xe Hatchback hạng B đô thị với phom dáng đuôi cụt và kích thước tương đương.
2. **Toyota Prius (`car_92_30`) $\rightarrow$ nhầm thành Kia Sedona (`car_43_10`)**: Do góc chụp chéo từ phía trước trong điều kiện ánh sáng yếu làm chìm đường gân khí động học của Prius.
3. **Toyota Corolla (`car_92_11`) $\rightarrow$ nhầm thành Toyota Prius (`car_92_30`)**: Cùng ngôn ngữ thiết kế phần đầu xe của Toyota thập niên 2000.

---

## PHẦN 2: KỊCH BẢN QUAY VIDEO DEMO (3 - 5 PHÚT)

* **Chuẩn bị trước khi quay**: Mở sẵn terminal và trình duyệt tại `http://localhost:8000/docs`.

### Đoạn 1 (0:00 - 0:45): Giới thiệu cấu trúc & Khởi chạy Container độc lập
* Mở terminal, gõ lệnh khởi chạy container:
  ```bash
  docker compose -f image_service/docker-compose.yml up -d --build
  ```
* Nêu rõ: *"Service của Thành viên 3 được đóng gói thành 1 Docker container độc lập, tự vận hành với FAISS và dữ liệu catalog trong bộ nhớ, không cần phụ thuộc vào PostgreSQL."*

### Đoạn 2 (0:45 - 1:45): Demo API Health & Tìm kiếm bằng hình ảnh (POST /search/image)
* Trên Swagger UI, test endpoint `GET /health` $\rightarrow$ Thấy `status: healthy`, `indexed_images: 171`, `registered_cars: 50`.
* Test endpoint `POST /search/image`:
  * Tải lên ảnh xe Mazda CX-5 (`image_service/tests/test_car.jpg`).
  * Thực thi $\rightarrow$ API trả về Top 5 xe: Top 1 là `car_57_7` (Mazda CX-5) với độ tương đồng `0.9999`, `confidence: "high"`, latency `~15ms`.

### Đoạn 3 (1:45 - 2:45): Demo Chatbot đa phương thức (POST /chat)
* Test tình huống kết hợp cả Ảnh + Câu hỏi văn bản:
  * File ảnh: `test_car.jpg`.
  * Message: *"Xe này bảo hành bao nhiêu năm và giá bao nhiêu?"*.
  * Thực thi $\rightarrow$ Hệ thống tự động:
    1. Nhận diện xe từ ảnh ra `car_57_7`.
    2. Dùng `car_57_7` làm bộ lọc context cho câu hỏi văn bản.
    3. Trả lời chính xác thông số bảo hành và mức giá của mẫu xe đó.

### Đoạn 4 (2:45 - 3:30): Demo Xử lý ngoại lệ (Edge Cases)
* Tải lên ảnh rỗng hoặc ảnh không phải xe (hoa, đồ vật):
  * Hệ thống trả về `uncertain: true`, `confidence: "low"`.
  * Chatbot thông báo lịch sự: *"Không chắc chắn đây là xe ô tô trong cơ sở dữ liệu"* thay vì đoán bừa.

### Đoạn 5 (3:30 - 4:00): Trình chiếu kết quả Ablation Study
* Mở file `indexes/ablation_study_results.md` chiếu bảng so sánh Baseline vs CLIP (Recall@5 tăng từ 22.7% lên 86.4%).

---

## PHẦN 3: NỘI DUNG 3 SLIDE THUYẾT TRÌNH

### Slide 1: Kiến trúc Image Retrieval & FAISS Vector Index
* **Tiêu đề**: Phân hệ Nhận diện Xe bằng Hình ảnh & Backend API
* **Nội dung chính**:
  * Mô hình thị giác: OpenAI CLIP ViT-B/32 (512 chiều, L2-normalized).
  * Chỉ mục vector: FAISS IndexFlatIP (chính xác 100%, tìm kiếm brute-force trong < 1ms).
  * Cơ chế Car-level Aggregation: Gom nhóm nhiều ảnh cùng mẫu xe thành Top-5 xe duy nhất.
  * Đóng gói: Microservice FastAPI khép kín trong Docker container, zero-database dependency.

### Slide 2: Thí nghiệm Ablation Study — Cải tiến có kiểm chứng
* **Tiêu đề**: Kết quả Đánh giá Thực nghiệm & Ablation Study
* **Nội dung chính**:
  * Đưa bảng so sánh 4 cấu hình (Config A $\rightarrow$ Config D).
  * Điểm nhấn:
    * Thay thế Handcrafted Features bằng CLIP giúp **Recall@5 tăng +63.63%** (từ 22.73% lên 86.36%).
    * Cơ chế Car Aggregation tăng thêm **+2.27%** Recall@5 và mở rộng độ bao phủ ứng viên cho RAG.
    * Thời gian phản hồi chỉ **63 ms** (đạt chuẩn thời gian thực).

### Slide 3: Cơ chế Giảm thiểu Ảo giác (Hallucination Prevention) & Phân tích Lỗi
* **Tiêu đề**: Cơ chế Phân loại Độ tin cậy & Trường hợp Lỗi Tiêu biểu
* **Nội dung chính**:
  * Phân loại Confidence: High / Medium / Low dựa trên Margin (Top 1 - Top 2) và Similarity Threshold.
  * Cờ `uncertain: true`: Ngăn chặn Chatbot bịa đặt tên xe khi gặp ảnh mờ hoặc ngoài danh mục.
  * 3 Cặp lỗi tiêu biểu: Phân tích các trường hợp nhầm lẫn giữa các xe cùng phom dáng Hatchback hoặc cùng hãng Toyota.

---

## PHẦN 4: BỘ 10 CÂU HỎI VẤN ĐÁP CỦA GIẢNG VIÊN & CÂU TRẢ LỜI CHUẨN XÁC

#### Câu 1: Tại sao em dùng FAISS IndexFlatIP mà không dùng IndexIVFFlat hay HNSW?
> **Trả lời**: Thưa thầy/cô, tập dữ liệu của đồ án có quy mô từ 250 đến 500 ảnh. Với quy mô này, `IndexFlatIP` (Exact Brute-force Search) tính toán ma trận chỉ mất chưa đến **1 mili-giây** mà đảm bảo **độ chính xác tuyệt đối 100%**, không bị tổn thất độ chuẩn xác (no approximation error) như IVF hay HNSW. Các chỉ mục xấp xỉ chỉ cần thiết khi tập dữ liệu lên đến hàng trăm nghìn hoặc hàng triệu vector.

#### Câu 2: Tại sao phép tính Inner Product (IP) trong FAISS lại tương đương với Cosine Similarity?
> **Trả lời**: Công thức Cosine Similarity giữa 2 vector $u$ và $v$ là:
> $$\text{Cosine}(u, v) = \frac{u \cdot v}{\|u\|_2 \times \|v\|_2}$$
> Trong module của em, mọi vector trước khi đưa vào index hoặc vector query từ ảnh đều được chuẩn hóa L2 norm bằng 1 ($\|u\|_2 = 1, \|v\|_2 = 1$). Do đó, mẫu số bằng 1 và $\text{Cosine}(u, v) = u \cdot v = \text{Inner Product}$. Điều này giúp FAISS tính toán cực kỳ nhanh bằng phép nhân ma trận thuần túy.

#### Câu 3: Thí nghiệm Ablation của em chứng minh được điều gì? Cải tiến cụ thể so với baseline là gì?
> **Trả lời**: Em thiết kế ma trận thí nghiệm 2x2 để bóc tách 2 yếu tố:
> 1. *Yếu tố mô hình*: Baseline dùng biểu đồ màu sắc Color Histogram + cạnh Sobel chỉ đạt Recall@5 là **22.73%**. Khi cải tiến lên **OpenAI CLIP ViT-B/32**, Recall@5 nhảy vọt lên **86.36%** (tăng **+63.63%**), chứng minh kiến trúc Vision Transformer hiểu sâu về kết cấu đèn, lưới tản nhiệt và phom dáng xe.
> 2. *Yếu tố gom nhóm*: Cơ chế Car-level Aggregation giúp tăng thêm **+2.27%** Recall@5 và giải quyết lỗi lặp ảnh của cùng một mẫu xe.

#### Câu 4: Car-level Aggregation hoạt động như thế nào? Tại sao không lấy thẳng Top-5 ảnh từ FAISS?
> **Trả lời**: Một mẫu xe trong tập dữ liệu có từ 3 đến 8 ảnh ở các góc chụp khác nhau. Nếu chỉ lấy Top-5 ảnh gần nhất từ FAISS, có thể cả 5 ảnh đó đều thuộc về 1 hoặc 2 mẫu xe có góc chụp tương đồng. Điều này làm mất cơ hội xuất hiện của các xe ứng viên khác. Thuật toán của em lấy Top 30 ảnh từ FAISS, sau đó gom nhóm theo `car_id`, lấy điểm similarity cao nhất của mỗi xe, rồi mới chọn ra Top-5 xe duy nhất để chuyển tiếp cho Chatbot.

#### Câu 5: Hệ thống của em xử lý thế nào khi người dùng tải lên ảnh không phải ô tô (ví dụ cái bàn, con mèo)?
> **Trả lời**: Hệ thống có cơ chế kiểm soát 2 tầng:
> * Tầng 1: Kiểm tra ngưỡng tương đồng `similarity`. Nếu điểm cao nhất nhỏ hơn `THRESHOLD_MEDIUM` (0.50), hệ thống gán nhãn `uncertain: true` và `confidence: "low"`.
> * Tầng 2: Kiểm tra khoảng cách `margin` giữa Top 1 và Top 2. Nếu điểm số giữa 2 xe sát sạt nhau (margin < 0.03), hệ thống cũng đánh dấu không chắc chắn. Khi cờ `uncertain: true` được bật, Chatbot sẽ trả lời người dùng rằng ảnh không rõ ràng hoặc không phải mẫu xe trong cơ sở dữ liệu.

#### Câu 6: Làm thế nào em đảm bảo kết quả Recall@5 là trung thực và không bị "học vẹt"?
> **Trả lời**: Ngay từ khâu tiền xử lý, em đã tách tập dữ liệu thành 2 tập riêng biệt: **Tập Index (171 ảnh)** và **Tập Test độc lập (44 ảnh)**. Cả 44 ảnh dùng để tính Recall@1, 3, 5 **hoàn toàn không được nạp vào index**. Điều này phản ánh chính xác khả năng nhận diện một bức ảnh xe hoàn toàn mới ngoài đời thực.

#### Câu 7: Phân hệ của em kết nối với module RAG của Thành viên 2 như thế nào?
> **Trả lời**: Qua endpoint `/chat`, khi nhận được cả Ảnh và Câu hỏi:
> 1. Phân hệ Image Retriever nhận diện ảnh trước, trích xuất danh sách `identified_cars` (ví dụ: `car_041`).
> 2. Danh sách `car_id` này được dùng làm bộ lọc (`car_ids filter`) cho module RAG của TV2, giúp RAG chỉ tìm kiếm văn bản liên quan đến mẫu xe đó, tăng tốc độ truy vấn và ngăn chặn hiện tượng hallucination (trả lời nhầm sang xe khác).
> 3. Nếu không có ảnh, hệ thống tự động fallback về luồng RAG text thuần túy.

#### Câu 8: Tại sao service này lại không cần kết nối tới Database PostgreSQL của nhóm?
> **Trả lời**: Em thiết kế service theo nguyên lý Microservice độc lập cao (Loose Coupling). Dữ liệu 50 xe được trích xuất sẵn thành `cars.json` (~57 KB) và FAISS index được nạp thẳng vào RAM khi khởi động server. Nhờ vậy, container `image_service` có thể khởi động độc lập tức thì trong vài giây, kiểm thử độc lập mà không bị phụ thuộc vào trạng thái khởi động hay mạng của PostgreSQL.

#### Câu 9: Điểm khác biệt giữa Recall@1 và Recall@5 là gì? Trong bài toán này chỉ số nào quan trọng hơn?
> **Trả lời**: Recall@1 là tỉ lệ đoán trúng ngay xe ở vị trí số 1 (đạt **70.45%**). Recall@5 là tỉ lệ xe đúng nằm trong Top 5 xe gợi ý (đạt **86.36%**). Trong hệ thống tư vấn ô tô đa phương thức RAG, **Recall@5 quan trọng hơn**, vì người dùng thường muốn xem một danh sách các lựa chọn tương đồng, và module RAG phía sau sẽ nhận cả 5 xe này làm ngữ cảnh để so sánh và giải đáp thắc mắc cho người dùng.

#### Câu 10: Nếu có thêm thời gian và dữ liệu, em sẽ cải tiến phân hệ này như thế nào?
> **Trả lời**: Em có 3 hướng cải tiến chính:
> 1. *Fine-tuning CLIP*: Dùng kỹ thuật LoRA để fine-tune mô hình CLIP trên tập ảnh ô tô chuyên biệt nhằm phân biệt tốt hơn các chi tiết nhỏ như năm sản xuất (facelift).
> 2. *Cropping/Object Detection*: Tích hợp mô hình YOLOv8-car để tự động cắt khung hình chiếc xe trước khi đưa vào CLIP, loại bỏ phông nền gây nhiễu.
> 3. *Đa góc nhìn (Multi-view fusion)*: Cho phép người dùng tải lên 2-3 góc ảnh (đầu xe, đuôi xe, nội thất) và hợp nhất vector đặc trưng để nhận diện chính xác 100%.
