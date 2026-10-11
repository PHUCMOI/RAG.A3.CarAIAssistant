# Đánh giá Text RAG của AutoWise

Thư mục này chứa ground truth, data audit và công cụ đánh giá chung của project.
Chạy các lệnh từ root repository bằng Python 3.12 có dependencies backend.

## Bộ câu hỏi

Bộ nộp thống nhất: `ground_truth_submission.jsonl`, 200 mẫu Q001–Q200, chia 50 mẫu
cho mỗi phần công việc. Nhãn được tạo từ seed và snapshot index, tất cả đang `pending`;
assigned_member chỉ là phân công, không khẳng định thành viên đã tự viết hoặc review.
150 mẫu text, 49 ảnh/ảnh + text trên 44 ảnh holdout và một fixture JPEG lỗi. Không có
ảnh holdout trùng nội dung với training index; các câu dùng cùng ảnh ở cùng split.
Các mẫu OOD chưa có ảnh thật đã được thay bằng input có thể chạy được.

```powershell
python scripts/export_eval_snapshot.py
python eval/build_submission_ground_truth.py --index-documents data/documents.jsonl
python eval/validate_submission_ground_truth.py
python eval/run_text_evaluation.py --ground-truth eval/ground_truth_submission.jsonl --split all --output docs/submission/evidence/live-evaluation.csv
```

Runner gọi API tuần tự, checkpoint sau từng mẫu; `--resume` giữ cả success/failure
của đúng ground truth hash, không loại lỗi để làm đẹp số liệu. `--ids Q051,Q193`
dùng diagnostics riêng. Image retrieval top-k được đo từ `/search/image`, khác top 1
được chat chọn. Context precision/recall dùng `retrievedContextIds` trước generation;
`answer_context_ids` lưu riêng evidence của câu trả lời cuối. API cũ thiếu telemetry
được ghi lỗi, không tự dùng evidence thay thế. HTTP error counts và số mẫu đóng góp
cho từng metric nằm trong summary. Faithfulness/completeness để trống cho reviewer.

Latency `response_seconds` đo toàn bộ workflow của case. Với ảnh nó gồm cả probe
image top-k riêng trước chat; không đồng nhất với latency embedding-only hay thời gian
frontend render. Mẫu HTTP/runtime lỗi được ghi thời gian nhưng không vào mean success latency.

`ground_truth_member1.jsonl`, bộ text Q051–Q100, bộ ảnh Q101–Q150 và
`ground_truth_member4.jsonl` dùng schema chung. Job authoring sẽ ghi lại các nhãn
pending; giữ bản review riêng và không chạy lại job lên nhãn đã review mà chưa backup.

`ground_truth_text.jsonl` có 50 câu hỏi: 12 giá, 10 bảo hành, 12 so sánh,
6 discovery, 5 thông số và 5 edge cases. IDs Q051–Q100 được giữ ổn định để đối
chiếu các lần chạy. Q051–Q060 là development; Q061–Q100 là evaluation.

Mỗi case có intent, car IDs, relevant context IDs, required facts, reference
answer và expected status. `review_status=pending` cho tới khi có review độc lập;
đáp án sinh từ facts chưa phải nhãn đã được con người xác minh.

Tạo lại từ SQL seed đã commit:

```powershell
.\.venv\Scripts\python.exe eval/build_text_ground_truth.py
```

Sau indexing trên PostgreSQL, dùng snapshot thực tế để khớp child chunk IDs:

```powershell
.\.venv\Scripts\python.exe eval/build_text_ground_truth.py --database --index-documents data/documents.jsonl
```

Builder từ chối snapshot stale hoặc thiếu context được yêu cầu. Mặc định nó
không ghi đè export index; `--export-seed-documents` dành riêng cho export seed
offline. Review lại facts/reference answers khi source dữ liệu hoặc index đổi.

## Kiểm tra dữ liệu

```powershell
.\.venv\Scripts\python.exe eval/audit_rag_data.py
```

Audit kiểm tra 13 xe xuất hiện nhiều nhất trong ground truth, gồm provenance,
trường kỹ thuật null, nguồn giá và policy bảo hành. Output là
`eval/rag_data_audit.json` và [báo cáo dữ liệu](../docs/RAG_DATA_AUDIT.md).
Audit nội bộ chưa xác minh giá/phiên bản hiện tại trên website nguồn.

## Seed diagnostics và HTTP evaluation

```powershell
.\.venv\Scripts\python.exe eval/run_seed_evaluation.py
.\.venv\Scripts\python.exe eval/run_text_evaluation.py --split evaluation
# Có thể truyền ground truth và đường dẫn report riêng:
.\.venv\Scripts\python.exe eval/run_text_evaluation.py --ground-truth eval/ground_truth_text.jsonl --output eval/results_text.csv --split all
```

Seed runner replay SQL data trong SQLite và dùng structured/template; kết quả
không đại diện cho PostgreSQL, vector/LLM hay latency phục vụ thật.
HTTP runner cần API đang chạy, đo intent/status và context precision/recall.
Summary giữ error count, không tính lỗi API như một response thành công.
`faithfulness` và `answer_completeness` để trống cho người review theo claim.
Citation presence không thay thế chấm faithfulness.

## Live smoke và outputs

```powershell
.\.venv\Scripts\python.exe scripts/smoke_text_rag.py
```

Smoke yêu cầu E5/Bedrock thật, model ID/region và generationMode=bedrock-natural cùng
vector/hybrid retrieval cho năm intent. Template fallback làm smoke fail.

Reports CSV/summary, `live_smoke_text.json` và latency probes là outputs local,
không commit vào source. Ground truth và data audit seed là snapshot có thể
review trong Git; nếu cập nhật chúng, ghi rõ facts/index đã dùng trong review.
