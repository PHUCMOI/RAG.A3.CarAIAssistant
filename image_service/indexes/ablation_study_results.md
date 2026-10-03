# Báo cáo Thí nghiệm Ablation Study — Phân hệ Image Retrieval

* **Ngày thực hiện**: 02/10/2026
* **Thành viên thực hiện**: Thành viên 3 (Image Retrieval & Backend API)
* **Quy mô tập kiểm thử**: 44 ảnh test độc lập (Holdout Test Split - không nằm trong index)

---

## 1. Thiết kế Thí nghiệm Ablation (2x2 Factorial Design)

Để chứng minh **"Cải tiến có kiểm chứng"** theo yêu cầu môn học, ta phân tích tác động của 2 thành phần cốt lõi:
1. **Đặc trưng thị giác (Feature Extractor)**:
   * *Baseline*: Đặc trưng thủ công kết hợp Color Histogram (RGB/HSV) + Sobel Edges + Lưới không gian 4x4.
   * *Cải tiến*: Mô hình thị giác - ngôn ngữ tiền huấn luyện **OpenAI CLIP ViT-B/32** (400M pre-trained pairs).
2. **Chiến lược xếp hạng và gom nhóm (Ranking Strategy)**:
   * *Naive Image-level*: Lấy trực tiếp Top-5 ảnh gần nhất trong FAISS. Do một xe có nhiều ảnh chụp, Top-5 ảnh có thể bị chiếm giữ bởi chỉ 1-2 mẫu xe, làm giảm độ bao phủ của tập ứng viên.
   * *Car-level Aggregation (Đề xuất)*: Gom nhóm theo `car_id`, lấy điểm tương đồng cao nhất cho từng xe độc nhất để sinh ra đúng Top-5 mẫu xe khác biệt.

---

## 2. Bảng kết quả Thí nghiệm Ablation

| Cấu hình | Mô hình Feature Extractor | Chiến lược Gom nhóm xe | Recall@1 | Recall@3 | Recall@5 | MRR | Độ trễ (Latency) |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **Config A** | Standalone (Color/Sobel) | Không gộp (Image Top-5) | 2.27% | 9.09% | 15.91% | 0.0781 | **15.1 ms** |
| **Config B** | Standalone (Color/Sobel) | **Car-level Aggregation** | 2.27% | 13.64% | 22.73% | 0.0962 | **15.65 ms** |
| **Config C** | **OpenAI CLIP ViT-B/32** | Không gộp (Image Top-5) | 70.45% | 84.09% | 84.09% | 0.7652 | **57.15 ms** |
| **Config D (Đề xuất)** | **OpenAI CLIP ViT-B/32** | **Car-level Aggregation** | **70.45%** | **84.09%** | **86.36%** | **0.7735** | **63.46 ms** |

---

## 3. Kết luận và Chứng minh Cải tiến

1. **Hiệu quả của OpenAI CLIP so với Baseline**:
   * Recall@5 tăng từ **22.73%** lên **86.36%** (tăng vọt **+63.63%**).
   * Recall@1 tăng từ **2.27%** lên **70.45%** (tăng **+68.18%**).
   * Chứng minh rằng mô hình Transformer đa phương thức nắm bắt được cấu trúc hình học phức tạp của ô tô (đèn pha, lưới tản nhiệt, logo) vượt trội hơn hẳn biểu đồ màu sắc truyền thống.

2. **Hiệu quả của cơ chế Car-level Aggregation**:
   * Khi bật Car-level Aggregation trên mô hình CLIP, Recall@5 tăng từ **84.09%** lên **86.36%**.
   * Cơ chế gom nhóm loại bỏ hiện tượng "độc quyền" Top-5 bởi các góc ảnh khác nhau của cùng một mẫu xe, đảm bảo 5 ứng viên xe gửi sang module RAG của TV2 luôn là 5 mẫu xe riêng biệt.

3. **Tính khả thi về mặt hiệu năng**:
   * Độ trễ trung bình của cấu hình hoàn chỉnh là **63.46 ms**, hoàn toàn đáp ứng yêu cầu phản hồi thời gian thực (< 2.000 ms) của hệ sinh thái tư vấn ô tô.
