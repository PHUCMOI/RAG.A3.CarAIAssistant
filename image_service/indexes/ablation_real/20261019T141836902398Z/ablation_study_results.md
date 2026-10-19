# Ablation A/B/C/D — Image Retrieval

- Thời gian UTC: 2026-10-19T14:18:36.902398+00:00
- Cùng 171 ảnh index và 44 ảnh test cho cả bốn cấu hình.
- Repeats: 3; candidate pool: 30; top-k: 5.
- Search backend: faiss; kiểm tra SHA256: không trùng nội dung index/test.
- Mỗi extractor warm-up một query trước khi đo; không tính model loading/index build.
- Latency gồm đọc ảnh, EXIF/RGB, embedding, search và gom nhóm/xếp hạng; không phải latency chat HTTP.

| Config | Extractor thực tế | Gom theo xe | R@1 (%) | R@3 (%) | R@5 (%) | MRR@5 | Mean ms | P95 ms |
|---|---|---|---:|---:|---:|---:|---:|---:|
| A | standalone-numpy-pil-512d | False | 2.27 | 13.64 | 18.18 | 0.0871 | 7.99 | 13.08 |
| B | standalone-numpy-pil-512d | True | 2.27 | 13.64 | 22.73 | 0.0962 | 8.21 | 16.05 |
| C | openai/clip-vit-base-patch32 | False | 70.45 | 84.09 | 84.09 | 0.7652 | 52.51 | 62.68 |
| D | openai/clip-vit-base-patch32 | True | 70.45 | 84.09 | 86.36 | 0.7735 | 58.42 | 68.96 |

## Chênh lệch đo được

- Gom nhóm trên Standalone (A → B): ΔR@5 = +4.55 điểm phần trăm; ΔMRR@5 = +0.0091.
- Gom nhóm trên CLIP (C → D): ΔR@5 = +2.27 điểm phần trăm; ΔMRR@5 = +0.0083.
- Thay extractor, không gom nhóm (A → C): ΔR@5 = +65.91 điểm phần trăm; ΔMRR@5 = +0.6781.
- Thay extractor, có gom nhóm (B → D): ΔR@5 = +63.63 điểm phần trăm; ΔMRR@5 = +0.6773.
- Tổng thể (A → D): ΔR@5 = +68.18 điểm phần trăm; ΔMRR@5 = +0.6864.

## Phạm vi bằng chứng

Các số liệu được tính từ per_query_results.csv; không dùng hằng số baseline.
Repeats đo lại cùng ảnh, không làm tăng số mẫu độc lập. Chênh lệch có thể bằng 0 hoặc âm.
Đây là đánh giá retrieval trên split đã chọn; chưa chứng minh ý nghĩa thống kê,
khả năng tổng quát hóa, chất lượng câu trả lời RAG hoặc thời gian phản hồi toàn hệ thống.
Kiểm tra hash chỉ loại trùng nội dung byte, không loại ảnh gần giống hoặc cùng chiếc xe.
