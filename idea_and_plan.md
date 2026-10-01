# Đề xuất đồ án A3: Trợ lý tư vấn ô tô đa phương thức sử dụng RAG

## 1. Tổng quan đề tài

### 1.1. Tên đề tài đề xuất

**Xây dựng trợ lý tư vấn ô tô đa phương thức sử dụng RAG và tìm kiếm ảnh – văn bản**

### 1.2. Bối cảnh

Bài A1 là một hệ thống tìm kiếm ảnh và văn bản trên nhiều chủ đề khác nhau. Trong đồ án A3, hệ thống được nâng cấp và giới hạn vào một miền dữ liệu cụ thể là **ô tô**, đồng thời bổ sung:

- LLM để hiểu câu hỏi và sinh câu trả lời.
- Quy trình ingestion và indexing dữ liệu.
- Tìm kiếm kết hợp ảnh, văn bản và dữ liệu có cấu trúc.
- Giao diện chatbot/assistant đơn giản.
- Bộ dữ liệu ground truth do nhóm tự xây dựng.
- Các metric để đánh giá retrieval và chất lượng câu trả lời.

### 1.3. Đối tượng phục vụ

Hệ thống phục vụ khách hàng có nhu cầu tìm hiểu hoặc mua ô tô, không giới hạn hãng xe.

Người dùng có thể:

- Đặt câu hỏi bằng văn bản.
- Gửi ảnh một chiếc xe để nhận diện hoặc tìm mẫu xe tương tự.
- Kết hợp ảnh với câu hỏi.
- Tìm xe theo giá, hãng, loại xe, số chỗ hoặc loại nhiên liệu.
- Hỏi về thông số kỹ thuật, giá bán và chính sách bảo hành.
- So sánh nhiều mẫu xe.
- Tìm đại lý theo hãng và khu vực.

Ví dụ câu hỏi:

- “Có những mẫu SUV 5 chỗ nào dưới 800 triệu đồng?”
- “So sánh Toyota Corolla Cross và Mazda CX-5.”
- “VinFast VF 8 được bảo hành bao lâu?”
- “Tìm đại lý Hyundai tại Thành phố Hồ Chí Minh.”
- Người dùng gửi ảnh và hỏi: “Xe trong ảnh là xe gì và có giá bao nhiêu?”

---

## 2. Mục tiêu của hệ thống

### 2.1. Mục tiêu chính

Xây dựng một chatbot có khả năng tiếp nhận câu hỏi hoặc hình ảnh về ô tô, tìm kiếm các thông tin liên quan trong cơ sở dữ liệu và sử dụng LLM để tạo câu trả lời dựa trên dữ liệu đã truy xuất.

### 2.2. Mục tiêu kỹ thuật

- Kế thừa chức năng tìm kiếm ảnh và văn bản từ A1.
- Xây dựng pipeline ingestion và indexing cho dữ liệu ô tô.
- Nhận diện ý định của câu hỏi bằng LLM hoặc mô hình phân loại.
- Trích xuất các điều kiện tìm kiếm từ câu hỏi.
- Kết hợp semantic search, image search và truy vấn có cấu trúc.
- Sinh câu trả lời có nguồn tham chiếu.
- Hạn chế hallucination bằng cách yêu cầu LLM chỉ sử dụng context được truy xuất.
- Đánh giá hệ thống bằng ground truth và các metric định lượng.

---

## 3. Phạm vi dữ liệu

Để phù hợp với thời gian môn học và có thể chạy trên máy cá nhân, phạm vi đề xuất là:

- Từ 5 đến 10 hãng xe.
- MVP gồm 50 mẫu hoặc phiên bản xe; mở rộng tối đa 100 mẫu nếu hoàn thành sớm.
- Khoảng 250–500 ảnh xe, tương ứng 5–10 ảnh cho mỗi mẫu.
- Thông tin đại lý tại một số tỉnh/thành phố tiêu biểu.
- Thông tin bảo hành, giá tham khảo và thông số kỹ thuật.

Giá xe cần đi kèm thời điểm cập nhật vì giá thực tế có thể thay đổi.

### 3.1. Các thực thể dữ liệu

#### Brand

```text
brand_id
brand_name
country
description
```

#### CarModel

```text
car_id
brand_id
model_name
version
year
price
body_type
engine
transmission
seats
fuel_type
fuel_consumption
dimensions
description
updated_at
```

#### Dealer

```text
dealer_id
name
address
city
supported_brands
phone
website
```

#### Warranty

```text
warranty_id
car_id hoặc brand_id
duration_years
distance_limit
conditions
```

#### CarImage

```text
image_id
car_id
image_path
view_type
image_embedding
```

---

## 4. Chức năng hệ thống

### 4.1. Tìm kiếm bằng văn bản

Hệ thống nhận câu hỏi tự nhiên và xác định:

- Ý định của người dùng.
- Hãng xe.
- Tên mẫu xe.
- Khoảng giá.
- Loại xe.
- Số chỗ.
- Năm sản xuất.
- Loại nhiên liệu.
- Khu vực hoặc tỉnh/thành phố.

Ví dụ đầu ra của bước phân tích câu hỏi:

```json
{
  "intent": "find_car",
  "filters": {
    "max_price": 800000000,
    "body_type": "SUV",
    "seats": 5
  }
}
```

### 4.2. Tìm kiếm bằng hình ảnh

Hệ thống sử dụng mô hình mã hóa ảnh như CLIP để tạo embedding cho ảnh người dùng, sau đó so sánh với embedding của thư viện ảnh xe.

Kết quả trả về gồm:

- Các mẫu xe gần giống nhất.
- Điểm similarity.
- Thông tin tương ứng của từng mẫu xe.

Hệ thống nên hiển thị mức độ chắc chắn, ví dụ:

> Kết quả gần nhất là Mazda CX-5 với similarity 0,87.

### 4.3. Kết hợp ảnh và câu hỏi

Người dùng có thể gửi ảnh cùng câu hỏi, ví dụ:

> “Xe trong ảnh có phiên bản 7 chỗ không?”

Luồng xử lý:

1. Tìm mẫu xe gần nhất từ hình ảnh.
2. Trích xuất ý định từ câu hỏi.
3. Tìm dữ liệu về số chỗ hoặc các phiên bản của mẫu xe.
4. Đưa kết quả truy xuất vào LLM.
5. Sinh câu trả lời kèm nguồn tham chiếu.

### 4.4. So sánh xe

Hệ thống có thể so sánh hai hoặc nhiều xe theo:

- Giá bán.
- Kích thước.
- Động cơ.
- Công suất.
- Mức tiêu hao nhiên liệu.
- Số chỗ.
- Chính sách bảo hành.

### 4.5. Tìm đại lý

Người dùng có thể tìm đại lý theo:

- Hãng xe.
- Tỉnh hoặc thành phố.
- Mẫu xe đang quan tâm.

---

## 5. Kiến trúc đề xuất

```text
                         ┌────────────────────┐
Ảnh người dùng ─────────►│ Image Encoder/CLIP │────┐
                         └────────────────────┘    │
                                                   ▼
                                             Vector Search
                                                   │
Câu hỏi văn bản ────────► Intent Detection ────────┼──► Context Builder
                          + Entity Extraction       │
                                   │               │
                                   ▼               │
                            SQL/Metadata Search ────┘
                                                   │
                                                   ▼
                                              LLM + RAG
                                                   │
                                                   ▼
                                  Câu trả lời + nguồn tham chiếu
```

### 5.1. Luồng xử lý câu hỏi văn bản

1. Nhận câu hỏi của người dùng.
2. Phát hiện ý định của câu hỏi.
3. Trích xuất thực thể và điều kiện tìm kiếm.
4. Truy vấn vector database và cơ sở dữ liệu có cấu trúc.
5. Xếp hạng các kết quả liên quan.
6. Xây dựng context cho LLM.
7. Sinh câu trả lời dựa trên context.
8. Trả về câu trả lời và các nguồn đã sử dụng.

### 5.2. Các nhóm intent đề xuất

```text
find_car
identify_car_from_image
ask_specification
ask_price
ask_warranty
find_dealer
compare_cars
other
```

Llama 2 có thể được sử dụng để phát hiện intent. Nếu chạy trên máy cá nhân, nhóm có thể sử dụng phiên bản lượng tử hóa qua Ollama hoặc llama.cpp. Ngoài ra, một instruct model nhỏ hoặc phương pháp prompting cũng đủ cho phạm vi đồ án.

---

## 6. Ingestion và indexing

Đây là phần nâng cấp quan trọng từ A1 lên A3.

### 6.1. Quy trình ingestion

1. Thu thập dữ liệu xe, đại lý và bảo hành.
2. Làm sạch dữ liệu.
3. Chuẩn hóa đơn vị tiền tệ, kích thước và mức tiêu thụ nhiên liệu.
4. Loại bỏ dữ liệu trùng lặp.
5. Chuyển mỗi mẫu xe thành tài liệu có cấu trúc.
6. Chia tài liệu thành các chunk theo ngữ nghĩa.
7. Sinh text embedding.
8. Sinh image embedding.
9. Lưu embedding cùng metadata.
10. Tạo index phục vụ tìm kiếm.
11. Cập nhật lại index khi dữ liệu thay đổi.

### 6.2. Chiến lược chunking

Không nên chia tài liệu tùy ý theo số ký tự. Với dữ liệu xe, nên chia theo nhóm thông tin:

```text
Chunk 1: Tổng quan và mô tả
Chunk 2: Động cơ và khả năng vận hành
Chunk 3: Kích thước và số chỗ
Chunk 4: Giá và phiên bản
Chunk 5: Chính sách bảo hành
Chunk 6: Trang bị an toàn và tiện nghi
```

Mỗi chunk cần lưu metadata, ví dụ:

```json
{
  "chunk_id": "car_012_warranty",
  "car_id": "car_012",
  "brand": "Toyota",
  "model": "Corolla Cross",
  "section": "warranty",
  "updated_at": "2026-09-30"
}
```

### 6.3. Hybrid search

Không nên đưa toàn bộ dữ liệu vào vector database.

- Giá, năm sản xuất, số chỗ và vị trí đại lý nên được xử lý bằng SQL hoặc metadata filter.
- Mô tả, chính sách bảo hành và nội dung dài phù hợp với semantic/vector search.
- Hình ảnh được tìm bằng image embedding.
- Kết quả từ nhiều nguồn được hợp nhất và xếp hạng trước khi chuyển cho LLM.

---

## 7. Xây dựng bộ ground truth

Nhóm có 4 người nên bộ đánh giá cần tối thiểu **200 mẫu**, tương ứng ít nhất 50 mẫu cho mỗi thành viên.

### 7.1. Cấu trúc mẫu văn bản

```json
{
  "id": "Q001",
  "input_type": "text",
  "question": "Xe SUV 5 chỗ nào có giá dưới 800 triệu?",
  "image": null,
  "intent": "find_car",
  "expected_car_ids": ["car_012", "car_025"],
  "relevant_context_ids": [
    "car_012_price",
    "car_025_price"
  ],
  "required_answer_facts": [
    "Tên mẫu xe",
    "Phiên bản",
    "Giá tham khảo"
  ],
  "reference_answer": "..."
}
```

### 7.2. Cấu trúc mẫu ảnh kết hợp văn bản

```json
{
  "id": "Q151",
  "input_type": "image_text",
  "question": "Xe trong ảnh là xe gì và được bảo hành bao lâu?",
  "image": "test_images/Q151.jpg",
  "intent": "identify_car_from_image",
  "expected_car_ids": ["car_041"],
  "relevant_context_ids": [
    "car_041_overview",
    "car_041_warranty"
  ],
  "required_answer_facts": [
    "Tên mẫu xe",
    "Thời hạn bảo hành",
    "Giới hạn quãng đường bảo hành"
  ],
  "reference_answer": "..."
}
```

### 7.3. Phân bổ 200 mẫu đề xuất

| Nhóm câu hỏi | Số mẫu |
|---|---:|
| Tìm xe theo điều kiện | 45 |
| Hỏi thông số xe | 30 |
| Giá và phiên bản | 25 |
| Bảo hành | 20 |
| Đại lý | 15 |
| So sánh xe | 25 |
| Nhận diện bằng ảnh | 25 |
| Ảnh kết hợp câu hỏi | 15 |
| **Tổng cộng** | **200** |

Nên tách dữ liệu dùng để kiểm thử khỏi dữ liệu dùng để điều chỉnh prompt hoặc cấu hình retrieval nhằm tránh làm kết quả đánh giá bị thiên lệch.

---

## 8. Phương pháp đánh giá

> **Lưu ý cần xác nhận:** Cụm từ “text fullness” có thể đang được dùng với nghĩa **faithfulness** hoặc **answer completeness**. Đây là hai metric khác nhau. Nhóm nên xác nhận lại với giảng viên và có thể báo cáo cả hai để bảo đảm đầy đủ.

### 8.1. Intent Accuracy

Đánh giá khả năng nhận diện đúng mục đích câu hỏi:

```text
Intent Accuracy = Số câu được phân loại đúng / Tổng số câu đánh giá
```

### 8.2. Context Precision@k

Đo tỷ lệ các context liên quan trong top-k kết quả retrieval:

```text
Context Precision@k
= Số context liên quan trong top-k / Tổng số context được lấy trong top-k
```

Ví dụ hệ thống lấy 5 chunk, trong đó có 4 chunk liên quan:

```text
Context Precision@5 = 4 / 5 = 0,8
```

Nếu cần xét cả thứ tự xếp hạng, nhóm có thể bổ sung Average Precision hoặc nDCG.

### 8.3. Context Recall@k

Đo khả năng tìm đủ các context cần thiết trong ground truth:

```text
Context Recall@k
= Số context ground truth xuất hiện trong top-k
  / Tổng số context ground truth
```

Context Precision và Context Recall nên được sử dụng cùng nhau. Precision cao nhưng recall thấp có nghĩa là kết quả tìm được tương đối chính xác nhưng còn thiếu thông tin quan trọng.

### 8.4. Faithfulness

Đo mức độ các phát biểu trong câu trả lời được hỗ trợ bởi context:

```text
Faithfulness
= Số phát biểu được context hỗ trợ
  / Tổng số phát biểu có thể kiểm chứng trong câu trả lời
```

Ví dụ câu trả lời có 5 phát biểu, trong đó 4 phát biểu được context hỗ trợ:

```text
Faithfulness = 4 / 5 = 0,8
```

Metric này giúp phát hiện hallucination của LLM.

### 8.5. Text Fullness/Answer Completeness

Nếu “text fullness” được hiểu là độ đầy đủ của câu trả lời, nhóm có thể định nghĩa:

```text
Answer Completeness
= Số ý bắt buộc đã được trả lời
  / Tổng số ý bắt buộc trong ground truth
```

Ví dụ câu hỏi yêu cầu tên xe, giá và thời gian bảo hành nhưng hệ thống chỉ cung cấp tên và giá:

```text
Answer Completeness = 2 / 3 ≈ 0,67
```

Danh sách `required_answer_facts` trong ground truth được dùng để tính metric này.

### 8.6. Retrieval metric bổ sung

- **Hit@k:** Có ít nhất một kết quả đúng trong top-k hay không.
- **Recall@k:** Tỷ lệ kết quả đúng được tìm thấy trong top-k.
- **MRR:** Đánh giá vị trí của kết quả đúng đầu tiên.
- **nDCG:** Đánh giá chất lượng thứ tự xếp hạng.
- **Image Recall@k:** Mẫu xe đúng có xuất hiện trong top-k kết quả ảnh hay không.

### 8.7. Generation metric bổ sung

- **Answer Relevancy:** Câu trả lời có trực tiếp giải quyết câu hỏi hay không.
- **Correctness:** Nội dung trả lời có khớp với reference answer hay không.
- **Citation Accuracy:** Nguồn được trích dẫn có thực sự hỗ trợ câu trả lời hay không.
- **Response Time:** Thời gian phản hồi trung bình của hệ thống.
- **Human Evaluation:** Người đánh giá chấm theo thang điểm 1–5.

### 8.8. Bộ metric tối thiểu đề xuất

```text
Intent Accuracy
Context Precision@5
Context Recall@5
Faithfulness
Answer Completeness
Answer Relevancy
Image Recall@5
Average Response Time
```

---

## 9. Công nghệ đề xuất

Một cấu hình có thể chạy trên máy cá nhân:

| Thành phần | Công nghệ đề xuất |
|---|---|
| Backend API | FastAPI |
| Giao diện | Streamlit hoặc Gradio |
| Dữ liệu có cấu trúc | SQLite hoặc PostgreSQL |
| Vector database | FAISS hoặc Chroma |
| Text embedding | Mô hình multilingual hỗ trợ tiếng Việt |
| Image embedding | CLIP |
| LLM cục bộ | Llama 2 quantized hoặc instruct model nhỏ |
| LLM runtime | Ollama hoặc llama.cpp |
| Framework RAG | Có thể dùng LangChain/LlamaIndex hoặc tự triển khai |
| Đánh giá | RAGAS kết hợp metric tự viết |

Việc sử dụng framework RAG là tùy chọn. Nhóm cần hiểu rõ và trình bày được từng bước retrieval, context building, generation và evaluation thay vì chỉ gọi framework như một hộp đen.

---

## 10. So sánh A1 và A3

| A1 | A3 |
|---|---|
| Search ảnh và văn bản trên nhiều chủ đề | Tập trung vào miền ô tô |
| Trả về danh sách kết quả | Trả lời theo hình thức hội thoại |
| Chưa có ingestion hoàn chỉnh | Có pipeline ingestion và indexing |
| Các loại search tương đối độc lập | Kết hợp image search, vector search và SQL |
| Chưa hiểu sâu ý định người dùng | Có intent detection và entity extraction |
| Chưa sử dụng context để sinh câu trả lời | Có RAG và context builder |
| Chưa có đánh giá RAG | Có ground truth và eval metrics |
| Chủ yếu là truy vấn một lượt | Hỗ trợ assistant/chatbot |

---

## 11. Kết quả đầu ra dự kiến

Sản phẩm cuối cùng gồm:

1. Một giao diện chatbot cho phép nhập văn bản và tải ảnh.
2. Cơ sở dữ liệu về xe, đại lý, bảo hành và ảnh xe.
3. Pipeline ingestion và indexing có thể chạy lại khi dữ liệu thay đổi.
4. Module intent detection và entity extraction.
5. Module hybrid retrieval.
6. Module RAG sinh câu trả lời kèm nguồn.
7. Bộ ground truth tối thiểu 50 mẫu/người.
8. Chương trình tự động chạy evaluation.
9. Báo cáo kết quả theo từng metric.

---

## 12. Tiêu chí chứng minh đồ án thành công

Đồ án không chỉ cần có giao diện chatbot. Nhóm cần chứng minh được:

- Hệ thống nhận diện đúng mục đích của phần lớn câu hỏi.
- Retrieval tìm được đúng tài liệu hoặc mẫu xe liên quan.
- Câu trả lời sử dụng đúng thông tin trong context.
- Câu trả lời có đủ các ý chính được yêu cầu.
- Hệ thống hạn chế tạo thông tin không tồn tại trong dữ liệu.
- Chức năng tìm kiếm ảnh xác định được mẫu xe đúng trong top-k.
- Toàn bộ hệ thống có thể phục vụ trên máy cá nhân với thời gian phản hồi chấp nhận được.

---

## 13. Các điểm cần xác nhận với giảng viên

1. “Text fullness” được định nghĩa là faithfulness hay answer completeness?
2. Context Precision cần tính theo công thức đơn giản hay theo cách đánh giá có xét thứ tự của RAGAS?
3. Ground truth 50 mẫu/người có bắt buộc bao gồm cả ảnh và văn bản không?
4. Có bắt buộc sử dụng Llama 2 hay được phép dùng mô hình instruct khác phù hợp hơn với máy cá nhân?
5. Giá xe có cần là dữ liệu thời gian thực hay chỉ cần ghi nhận thời điểm thu thập?
6. Có yêu cầu hội thoại nhiều lượt hay chỉ cần hỏi–đáp từng lượt?

---

## 14. Kết luận

Đề tài này là một hướng nâng cấp phù hợp từ A1 lên A3 vì vẫn kế thừa hệ thống tìm kiếm ảnh và văn bản, nhưng bổ sung miền dữ liệu chuyên biệt, LLM, ingestion/indexing, RAG, chatbot và quy trình đánh giá định lượng.

Trọng tâm của đồ án nên là chứng minh hai khả năng:

1. **Retrieval tìm đúng và đủ thông tin cần thiết.**
2. **LLM tạo câu trả lời đúng, đầy đủ và có căn cứ từ context.**

---

## 15. Kế hoạch thực hiện cho nhóm 4 người

### 15.1. Thời hạn và phạm vi bắt buộc

- Ngày bắt đầu kế hoạch: **Thứ Tư, 30/09/2026**.
- Thời hạn hoàn thành: **Thứ Ba, 06/10/2026**.
- Phạm vi MVP: **50 mẫu xe**, khoảng **250–500 ảnh** và **200 mẫu ground truth**.
- Phạm vi 100 mẫu xe chỉ thực hiện khi toàn bộ MVP đã tích hợp và chạy ổn định.

Các chức năng bắt buộc của MVP:

1. Tìm xe bằng câu hỏi văn bản.
2. Tìm hoặc nhận diện xe gần giống từ ảnh.
3. Trả lời câu hỏi bằng RAG dựa trên context đã truy xuất.
4. Hiển thị nguồn hoặc `car_id` của context được sử dụng.
5. Chạy được bộ evaluation tối thiểu.
6. Có giao diện demo chạy trên máy cá nhân.

Các chức năng có thể cắt nếu thiếu thời gian:

- Hội thoại nhiều lượt.
- Tìm đại lý theo khoảng cách thực tế.
- Cập nhật giá theo thời gian thực.
- Huấn luyện lại mô hình ảnh.
- Mở rộng từ 50 lên 100 mẫu xe.

### 15.2. Nguyên tắc chia việc

Mỗi thành viên có một module chính để tránh chồng chéo. Công việc dữ liệu và ground truth được chia đều:

- Mỗi người phụ trách làm sạch và kiểm tra khoảng 12–13 mẫu xe.
- Mỗi người tạo 50 mẫu ground truth.
- Mỗi module phải có README ngắn, lệnh chạy và dữ liệu đầu vào/đầu ra rõ ràng.
- Người phụ trách module tự viết unit test hoặc script kiểm tra cơ bản cho module đó.

### 15.3. Phân công theo thành viên

#### Thành viên 1 — Data lead và ingestion

Nhiệm vụ chính:

- Lọc 50 mẫu xe từ DVM-CAR bằng `Genmodel_ID`.
- Ưu tiên mẫu xe có mặt tại Việt Nam và có ít nhất 5 ảnh phù hợp.
- Chuẩn hóa hãng, model, năm, nhiên liệu, hộp số, số ghế và đơn vị đo.
- Map `Image_table.csv` với thư mục ảnh DVM-CAR.
- Thiết kế schema chung cho `cars`, `images`, `dealers`, `warranties` và `sources`.
- Viết pipeline tạo `cars.json` hoặc nạp dữ liệu vào SQLite/PostgreSQL.
- Điều phối việc gộp dữ liệu 12–13 xe do mỗi thành viên thu thập.

Đầu ra bắt buộc:

```text
data/candidate_models.csv
data/cars.json
data/images_manifest.csv
data/sources.jsonl
scripts/ingest_data.py
```

Tiêu chí hoàn thành:

- Có đúng 50 `car_id` duy nhất.
- Mỗi xe có tối thiểu 5 ảnh hoặc được đánh dấu thiếu ảnh.
- Không có đường dẫn ảnh hỏng trong manifest.
- Mỗi trường thông tin có nguồn hoặc trạng thái `missing`/`synthetic`.

#### Thành viên 2 — Text retrieval, intent và RAG

Nhiệm vụ chính:

- Xây dựng intent detection và entity extraction.
- Tạo document tiếng Việt từ dữ liệu có cấu trúc.
- Chunk dữ liệu theo tổng quan, giá, thông số, bảo hành và đại lý.
- Sinh text embedding và xây dựng FAISS/Chroma index.
- Cài đặt metadata filter cho hãng, giá, số chỗ, kiểu dáng và nhiên liệu.
- Xây dựng prompt RAG yêu cầu LLM chỉ trả lời từ context.
- Trả về câu trả lời cùng `context_id` hoặc URL nguồn.

Đầu ra bắt buộc:

```text
scripts/build_text_index.py
src/intent.py
src/text_retriever.py
src/rag.py
data/documents.jsonl
```

Tiêu chí hoàn thành:

- Chạy được các intent tối thiểu: `find_car`, `ask_specification`, `ask_price`, `ask_warranty`, `compare_cars`.
- Truy vấn trả về top-k context và metadata.
- Câu trả lời không tự tạo dữ kiện khi context thiếu thông tin.

#### Thành viên 3 — Image retrieval và backend API

Nhiệm vụ chính:

- Đọc `images_manifest.csv` và kiểm tra ảnh.
- Sinh CLIP embedding cho ảnh đã chọn.
- Xây dựng vector index cho ảnh.
- Viết hàm tìm top-k ảnh/model gần nhất.
- Thiết kế FastAPI endpoint chung cho text, ảnh và ảnh kèm câu hỏi.
- Kết hợp kết quả image retrieval với module RAG của thành viên 2.

Đầu ra bắt buộc:

```text
scripts/build_image_index.py
src/image_retriever.py
src/api.py
indexes/image.index
```

API tối thiểu:

```text
POST /search/text
POST /search/image
POST /chat
GET  /cars/{car_id}
```

Tiêu chí hoàn thành:

- Ảnh đầu vào trả về top-5 `car_id` cùng similarity score.
- API chạy được trên máy cá nhân.
- Có xử lý lỗi file ảnh không hợp lệ hoặc model không được nhận diện rõ.

#### Thành viên 4 — Giao diện, evaluation và tài liệu

Nhiệm vụ chính:

- Xây dựng giao diện Streamlit hoặc Gradio.
- Hỗ trợ nhập câu hỏi, tải ảnh và hiển thị câu trả lời.
- Hiển thị top-k kết quả, similarity score và nguồn context.
- Chuẩn hóa schema ground truth dùng chung.
- Viết chương trình chạy evaluation và tổng hợp kết quả.
- Phụ trách báo cáo, slide và kịch bản demo.

Đầu ra bắt buộc:

```text
app.py
eval/ground_truth.jsonl
eval/run_evaluation.py
eval/results.csv
docs/demo-script.md
```

Metric tối thiểu:

```text
Intent Accuracy
Context Precision@5
Context Recall@5
Faithfulness
Answer Completeness
Image Recall@5
Average Response Time
```

Tiêu chí hoàn thành:

- Giao diện gọi được API thật, không dùng kết quả hard-code.
- Evaluation chạy được tự động trên ground truth.
- Báo cáo có bảng kết quả và ít nhất ba trường hợp lỗi tiêu biểu.

### 15.4. Phân chia ground truth

Mỗi thành viên tạo 50 mẫu theo schema chung. Không tự chấm mẫu do chính mình tạo; các thành viên kiểm tra chéo theo vòng tròn.

| Người phụ trách | ID | Trọng tâm |
|---|---|---|
| Thành viên 1 | Q001–Q050 | Tìm xe theo điều kiện, thông số và dữ liệu thiếu |
| Thành viên 2 | Q051–Q100 | Giá, bảo hành, so sánh và câu hỏi text RAG |
| Thành viên 3 | Q101–Q150 | Nhận diện ảnh và ảnh kết hợp câu hỏi |
| Thành viên 4 | Q151–Q200 | Đại lý, so sánh, câu hỏi hỗn hợp và edge cases |

Quy trình kiểm tra chéo:

```text
Thành viên 1 kiểm tra mẫu của Thành viên 4
Thành viên 2 kiểm tra mẫu của Thành viên 1
Thành viên 3 kiểm tra mẫu của Thành viên 2
Thành viên 4 kiểm tra mẫu của Thành viên 3
```

Mỗi mẫu cần có:

- Câu hỏi hoặc ảnh đầu vào.
- Intent mong đợi.
- `expected_car_ids`.
- `relevant_context_ids`.
- Các ý bắt buộc trong câu trả lời.
- Reference answer.
- Người tạo và người kiểm tra.

### 15.5. Lịch thực hiện đến ngày 06/10/2026

| Ngày | Mục tiêu chung | Kết quả cuối ngày |
|---|---|---|
| **Thứ Tư 30/09** | Chốt phạm vi, schema, repository và API contract | Danh sách 50 xe; schema dữ liệu; cấu trúc thư mục; phân công được xác nhận |
| **Thứ Năm 01/10** | Làm prototype trên 10 xe | 10 xe có dữ liệu và ảnh; text search, image search và UI skeleton chạy độc lập |
| **Thứ Sáu 02/10** | Hoàn thành dữ liệu và các module chính | 50 xe; text index; image index; API và bộ ground truth bản nháp |
| **Thứ Bảy 03/10** | Tích hợp lần thứ nhất | UI gọi được API; ảnh và text đều trả về kết quả; RAG trả lời có nguồn |
| **Chủ Nhật 04/10** | Chạy evaluation và sửa lỗi retrieval | Có kết quả metric lần một; hoàn thành 200 ground truth đã kiểm tra chéo |
| **Thứ Hai 05/10** | Đóng băng tính năng, hoàn thiện báo cáo và demo | Bản release candidate; bảng metric; slide; video/kịch bản demo dự phòng |
| **Thứ Ba 06/10** | Kiểm thử cuối và bàn giao | Mã nguồn, dữ liệu mẫu, hướng dẫn chạy, báo cáo và demo hoàn chỉnh |

### 15.6. Các mốc kiểm tra bắt buộc

#### Mốc 1 — Tối 30/09

- Chốt 50 mẫu xe.
- Chốt schema JSON/database.
- Chốt tên endpoint và định dạng request/response.
- Mọi người chạy được project trên máy cá nhân.

#### Mốc 2 — Tối 02/10

- Dữ liệu 50 xe được merge.
- Có ít nhất 250 ảnh sử dụng được.
- Text retrieval và image retrieval chạy độc lập.
- Có ít nhất 100 mẫu ground truth.

#### Mốc 3 — Tối 03/10

- Hoàn thành tích hợp đầu-cuối.
- Người dùng nhập text hoặc ảnh và nhận được câu trả lời.
- Context và nguồn được hiển thị.

#### Mốc 4 — Tối 04/10

- Hoàn thành 200 ground truth.
- Chạy evaluation lần đầu.
- Lập danh sách lỗi ưu tiên theo mức ảnh hưởng.

#### Mốc 5 — Tối 05/10

- Không bổ sung chức năng mới.
- Chỉ sửa lỗi, hoàn thiện báo cáo và luyện demo.
- Chuẩn bị sẵn ảnh chụp hoặc video demo nếu môi trường chạy gặp sự cố.

### 15.7. Quy tắc phối hợp code

- Sử dụng một repository Git chung.
- Mỗi module phát triển trên branch riêng.
- Pull request cần ít nhất một người khác kiểm tra trước khi merge.
- Không commit dataset ảnh lớn vào Git; lưu hướng dẫn tải và đường dẫn tương đối.
- Commit file manifest, script ingestion và một tập ảnh mẫu nhỏ để kiểm thử.
- Cố định schema và API contract từ ngày 30/09; mọi thay đổi sau đó phải báo cho cả nhóm.
- Tạo file `.env.example`; không commit API key hoặc thông tin bí mật.

Cấu trúc repository đề xuất:

```text
project/
├── app.py
├── src/
│   ├── api.py
│   ├── intent.py
│   ├── rag.py
│   ├── text_retriever.py
│   └── image_retriever.py
├── scripts/
│   ├── ingest_data.py
│   ├── build_text_index.py
│   └── build_image_index.py
├── data/
│   ├── candidate_models.csv
│   ├── cars.json
│   ├── documents.jsonl
│   ├── images_manifest.csv
│   └── sources.jsonl
├── eval/
│   ├── ground_truth.jsonl
│   ├── run_evaluation.py
│   └── results.csv
├── docs/
│   └── demo-script.md
├── tests/
├── .env.example
├── requirements.txt
└── README.md
```

### 15.8. Tiêu chí hoàn thành ngày 06/10/2026

Đồ án được xem là hoàn thành khi:

- Một thành viên khác có thể cài đặt và chạy theo README.
- Database có tối thiểu 50 mẫu xe.
- Có ít nhất 250 ảnh đã map đúng `car_id`.
- Text search và image search hoạt động.
- Chatbot trả lời dựa trên context và hiển thị nguồn.
- Có đủ 200 ground truth.
- Script evaluation chạy xong và xuất bảng metric.
- Báo cáo nêu rõ dữ liệu thật, dữ liệu suy ra và dữ liệu synthetic.
- Nhóm có kịch bản demo ổn định từ 3–5 phút.

