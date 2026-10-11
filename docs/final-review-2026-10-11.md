# Review trước khi nộp — 11/10/2026

## Kết luận

Các phát hiện bên dưới là trạng thái trước sửa. Tiến độ sửa và evidence mới nằm ở
[báo cáo khắc phục](submission/fixes-2026-10-11.md); gói chuẩn bị nộp nằm ở [submission](submission/README.md).

Chức năng đủ rộng cho MVP đồ án, nhưng chưa nên chốt bản nộp theo tiêu chí trong đề xuất hiện tại. Cần xử lý lỗi live RAG, hoàn thiện đánh giá và đóng gói bằng chứng. Review không thay đổi implementation.

## Việc cần làm theo ưu tiên

1. **P1 — Smoke Bedrock thật thất bại lặp lại.** Chạy trong container API: `python scripts/smoke_text_rag.py --api-url http://localhost:8080`. Hai lượt đều HTTP 503 ở câu đầu “Tìm SUV 5 chỗ dưới 800 triệu”. AWS vẫn trả response; logs `natural_answers` ghi numeric validation từ chối số `800`, sau repair semantic review từ chối cảnh báo nguồn bị thiếu và Ford EcoSport bị mô tả đang bán dù là `official_historical`. Index valid/ready, không phải lỗi thiếu index. Cần sửa generation/repair để giữ budget, source qualifiers và market status đúng; giữ kiểm chứng, không bỏ validation để đạt smoke. Chạy lại đủ năm intent trước khi demo. Hai lượt này không kiểm được bốn intent còn lại vì runner dừng ở lỗi đầu.

2. **P1 — Chưa đủ bộ đánh giá theo đề xuất.** Đề xuất quy định 200 mẫu, 50/người và review chéo. Repository có 50 mẫu Q051–Q100 tại `eval/ground_truth_text.jsonl` và 50 mẫu Q101–Q150 tại `image_service/eval/ground_truth_member3.jsonl`: tổng 100 mẫu, chưa thấy Q001–Q050/Q151–Q200. Toàn bộ text có `review_status=pending`, `reviewed_by=null`. Bộ ảnh ghi reviewer, nhưng generator tự điền tên reviewer nên field này chưa chứng minh review thực tế. Hai bộ còn khác tên trường; cần chuẩn hóa hoặc adapter để đánh giá thống nhất. Nếu tiêu chí chính thức khác đề xuất, đối chiếu với rubric giảng viên.

3. **P2 — Metric retrieval đang dùng evidence sau generation.** `eval/run_text_evaluation.py:36` lấy `data["evidence"]` làm retrieved contexts. `answer_grounding.py:82` chỉ trả evidence mà reviewer chọn để hỗ trợ câu trả lời cuối. Vì vậy precision/recall hiện mô tả evidence của answer, không đo đầy đủ ranked retrieval top-k. Cần export ranked retrieval riêng và tính metric trên danh sách đó, giữ answer evidence cho grounding. Faithfulness/completeness vẫn để trống chờ chấm; chưa có bảng live text evaluation hoàn chỉnh trong repository. Image ablation trên 44 ảnh đã có báo cáo nhưng không thay thế đánh giá text/multimodal end-to-end.

4. **P2 — Browser regression về image retry có selector không còn duy nhất.** `frontend/tests/browser/image-merge.spec.ts:24` chọn `a[href="/cars/1"]`, nay khớp hai links: card xe và “Xem thông tin Toyota Vios” trong NextSteps. Các bước retry, giữ ảnh, render response và xóa attachment trước assertion này đều đạt. Dùng role/name cụ thể hoặc scope vùng card; không coi đây là bằng chứng chức năng retry ảnh hỏng.

5. **P2 — Tài liệu trạng thái không nhất quán.** README cuối file vẫn nói frontend chưa gọi image service, order assistant không phụ thuộc LLM, admin assistant chưa triển khai. `docs/RAG_STATUS.md` còn mô tả generation statement selection/template fallback và image prototype. Code/runtime hiện dùng unified input, Bedrock natural answer và final review, admin assistant có implementation/tests. Cập nhật cả phần cũ, phạm vi còn placeholder và sơ đồ để báo cáo mô tả đúng hệ thống.

6. **P2 — Chưa đóng gói bản nộp có thể tái lập.** Working tree có hơn 100 paths thay đổi/untracked, gồm implementation, migration và regression mới. Cần commit toàn bộ file cần thiết, kiểm tra từ checkout sạch với database mới và `npm ci`, lưu bảng metric/bằng chứng runtime vào gói nộp (runtime reports hiện bị ignore). Chưa thấy báo cáo tổng kết, slides hoặc video trong workspace; có thể nằm ngoài repository. Theo đề xuất cần bảng kết quả và ít nhất ba trường hợp lỗi tiêu biểu. Xác nhận những artifact đó trước khi chốt.

## Kiểm chứng trong lần review này

- Backend: 179 passed, 1 skipped trong lượt mặc định. Test PostgreSQL/pgvector opt-in chạy riêng: 1 passed, schema fixture được dọn.
- Image service: 24 passed trong container Python 3.12/CLIP. Python 3.13 trên host thiếu torch, lượt gộp có 4 failed/5 errors do image runtime thiếu dependency; không coi lượt đó là lỗi container.
- C#: 142 passed, 5 skipped khi bật CONTEXT_TEST_DATABASE; AWS/HTTP opt-in chưa chạy trong lượt này. Lượt mặc định: 122 passed, 25 skipped.
- Frontend: 96 passed/19 files; TypeScript/Vite build đạt. Có cảnh báo JS bundle hơn 500 kB, ưu tiên thấp cho đồ án.
- Index thật: valid=true, ready=true, 50 xe, 231 documents, E5 768 chiều đúng resolved revision.
- Docker: đủ năm services chạy; Python/image/PostgreSQL healthy. Health chỉ chứng minh DB/runtime cơ bản, không chứng minh live LLM thành công.
- Live Bedrock smoke: 2 lượt thất bại như mục 1. Một invocation ban đầu dùng sai port mặc định 5080 trong container bị ConnectError, đã sửa sang 8080; không tính invocation đó là lỗi sản phẩm.
- Browser 375/1280: 76 passed, 20 skipped theo điều kiện viewport, 2 failed trong một lượt 5.7 phút. Hai failure cùng test image-merge ở hai viewport, cùng lỗi selector mục 4; không có timeout trong lượt này. Các browser cases dùng API fixtures, không thay thế live end-to-end.
- `git diff --check`: không có lỗi whitespace; chỉ cảnh báo LF/CRLF.

## Phạm vi và giới hạn

Đây là review code/tài liệu, kiểm thử regression, integration DB/index và live smoke trên stack hiện tại; chưa chạy triển khai mới từ checkout sạch, full load test hay kiểm chứng lại dữ liệu giá/phiên bản ngoài nguồn. Thông số UK/Vietnam và giá tham khảo cần được nêu rõ trong báo cáo/demo. Chưa có rubric chính thức trong workspace, nên kết luận về yêu cầu nộp dựa trên đề xuất của project. Không cần mở rộng tính năng trước khi xử lý các mục trên.
