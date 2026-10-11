# AutoWise — Báo cáo kỹ thuật và đánh giá

Bản làm việc tự động từ evidence, cần nhóm đọc, review ground truth và hoàn thiện tên thành viên trước khi nộp.

## Bài toán và phạm vi

Trợ lý tư vấn ô tô kết hợp dữ liệu có cấu trúc, text RAG và tìm mẫu xe bằng ảnh. Catalogue gồm 50 model, 215 ảnh seed, 22 đại lý, 9 chính sách bảo hành và 61 nguồn. Thông số UK không được coi là phiên bản Việt Nam; giá là dữ liệu tham khảo tại ngày ghi nhận.

## Kiến trúc

React/TypeScript gọi Nginx. Python FastAPI điều phối guest, SQL filtering và lexical/pgvector/E5 retrieval; image service dùng CLIP ViT-B/32 và FAISS gom ứng viên theo car_id. C# quản lý cookie auth, roles, đơn hàng, tài khoản, lịch sử hội thoại và attachment thuộc user. Bedrock hiểu câu hỏi, chọn draft, viết lời trả lời và audit câu cuối. Model không được tự tạo nguồn hoặc lấy dữ liệu đơn từ client.

## Phương pháp đánh giá

200 nhãn nháp Q001–Q200: 150 text và 50 ảnh/ảnh + text/fixture lỗi. 44 ảnh holdout được kiểm hash không nằm trong training index; ảnh lặp lại không đi qua hai split. Context precision/recall dùng ranked retrievedContextIds, tách khỏi evidence đã lọc của answer. Image Recall@1/@5 và MRR đo từ image search top-k. Lỗi HTTP được giữ trong mẫu tổng; latency của response thành công có denominator riêng. Nhãn chưa review nên số liệu dưới đây là diagnostics, không phải kết quả nghiệm thu độc lập.

Thời điểm runner ghi UTC: `2026-10-11T06:26:25.516910+00:00`. Ground truth SHA256: `041ba37410ffaa7556474d6104e48e5e240b44d5b30fa9a359c9b99def7d81fc`.

Đã chạy 200/200 mẫu. Human review: **pending**.

## Kết quả HTTP live — baseline

| Split | Mẫu | Lỗi HTTP/runtime | Intent trên success | Status trên success | Context P@5 | Context R@5 | Image R@1 | Image R@5 | Image MRR@5 | Mean latency success |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| development | 45 | 1 | 1.0000 | 1.0000 | 0.6676 | 0.8971 | 0.6667 | 0.8000 | 0.7333 | 22.4266 |
| evaluation | 155 | 1 | 1.0000 | 1.0000 | 0.6387 | 0.9212 | 0.7059 | 0.8824 | 0.7804 | 20.0317 |

### Kiểm tra sau sửa SQL evidence

Lượt riêng 31/31 mẫu; xem `postfix-evaluation.*` và `postfix-runtime-identity.json`. Lượt baseline phía trên gắn với `baseline-runtime-identity.json`, giữ nguyên cả Q089 bị 503. Không thay mẫu lỗi bằng kết quả chạy lại.

| Split | Mẫu | Lỗi HTTP/runtime | Intent trên success | Status trên success |
|---|---:|---:|---:|---:|
| development | 12 | 0 | 1.0000 | 1.0000 |
| evaluation | 19 | 2 | 1.0000 | 1.0000 |

Denominator theo metric nằm trong summary JSON. Faithfulness và answer completeness chưa chấm, không suy ra từ grounded=true. Discovery sử dụng cả SQL catalogue và ranked text contexts: P/R@5 ở đây chỉ đo text contexts, không đo toàn bộ facts từ SQL. Ví dụ Q005/Q020 có nhiều price contexts relevant nhưng top-5 gồm cả overview/specifications; câu trả lời vẫn có giá từ SQL. Phải chấm claims riêng trước khi kết luận chất lượng answer.

## Các lỗi quan sát được

Lượt cuối kiểm tra Q085/Q089/Q152: 3/3 mẫu, 0 lỗi. Đây là regression live có phạm vi ba case, không phải chạy lại toàn bộ 200 mẫu trên runtime mới. Evidence: `referencefix-evaluation.*`.

### Evaluation trên runtime cuối

Đã ghi 200/200 mẫu. Lượt đã hoàn tất.
Evidence: `release-evaluation.*`; runtime: `release-runtime-identity.json`. Giữ baseline và các lượt sửa riêng.

| Split | Mẫu | Lỗi | Intent trên success | Status trên success | P@5 | R@5 | Image R@1 | Image R@5 | MRR@5 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| development | 45 | 0 | 1.0000 | 1.0000 | 0.6771 | 0.9000 | 0.6667 | 0.8000 | 0.7333 |
| evaluation | 155 | 3 | 1.0000 | 1.0000 | 0.6434 | 0.9245 | 0.7059 | 0.8824 | 0.7804 |
Lỗi HTTP/runtime release: Q014, Q087, Q099.
Sai intent/status theo nhãn nháp: chưa ghi nhận.

### Kiểm tra sau sửa audit và xác nhận phiên bản

Đã ghi 13/13 case regression trên `auditfix-runtime-identity.json`; evidence `auditfix-evaluation.*`. Lượt này không thay thế kết quả 200 mẫu release hoặc chứng minh toàn bộ runtime mới.
Lỗi: Q087.

### Kiểm tra sau repair references

Đã ghi 11/11 case; lượt hoàn tất.
Evidence: `reference-repair-evaluation.*`; runtime: `reference-repair-runtime-identity.json`. Đây là regression có phạm vi, không phải chạy lại toàn bộ 200 mẫu trên bản cuối.
Lỗi: chưa ghi nhận.

### Các case baseline cần xem lại

- Q089: error=HTTPStatusError, HTTP=503, status_correct=None, image_recall_at_1=None. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q101: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q102: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q106: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q113: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q114: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q118: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q120: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q124: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q125: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q126: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.
- Q129: error=none, HTTP=200, status_correct=1, image_recall_at_1=0. Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.

## Cải tiến có kiểm chứng

Báo cáo image ablation hiện có ở `image_service/indexes/ablation_study_results.md`: 44 ảnh, cấu hình CLIP + car aggregation ghi Recall@5 86.36%, MRR 0.7735. Đây là kết quả image retrieval riêng, không đồng nhất với latency hoặc chất lượng chat end-to-end.

Bản sửa cuối: gắn qualifiers phía server và audit câu hoàn chỉnh; tách ranked retrieval telemetry; ưu tiên model match chính xác trước fuzzy để Mazda không khớp nhầm; sửa selector browser; bỏ placeholders và synthetic reviewer labels khỏi bộ nộp.

Kiểm tra tái lập: `fresh-source-database.json` ghi 194 tests backend từ source giải nén đã kiểm manifest trên PostgreSQL mới. `clean-release-source.json` ghi npm ci/build và C# tests từ snapshot trước. Đây không phải full new-machine deployment; Python/dependencies host được dùng lại.

## Giới hạn và công việc nhóm còn lại

Review chéo toàn bộ nhãn và chấm claims/required facts. Kiểm tra giá/phiên bản với nguồn chính thức nếu trình bày là dữ liệu Việt Nam hiện hành. Slide nháp đã có; cần nhóm hoàn thiện thông tin, rubric chính thức và recording có thuyết trình. Demo hiện là screenshots với responses HTTP thật; FFmpeg chưa tải được nên chưa có video. Không coi kiểm thử fixture là AWS live; không coi seed/index healthy là model healthy. Chưa kiểm thử tải lớn hoặc triển khai production. Hướng dẫn demo/review ở README của gói nộp.
