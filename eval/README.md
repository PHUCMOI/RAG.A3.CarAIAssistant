# Đánh giá Text RAG của AutoWise

Thư mục này chứa ground truth, data audit và công cụ đánh giá chung của project.
Chạy các lệnh từ root repository bằng Python 3.12 có dependencies backend.

## Bộ câu hỏi

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

Smoke yêu cầu E5/Ollama thật, model SHA/digest và generationMode=llm cùng
vector/hybrid retrieval cho năm intent. Template fallback làm smoke fail.

Reports CSV/summary, `live_smoke_text.json` và latency probes là outputs local,
không commit vào source. Ground truth và data audit seed là snapshot có thể
review trong Git; nếu cập nhật chúng, ghi rõ facts/index đã dùng trong review.
