# Audit theo sáu phát hiện review

Đây là bằng chứng kỹ thuật trong phạm vi đã thực hiện; không thay thế rubric hoặc
xác nhận của người review. Phần kỹ thuật được chốt bằng Git snapshot, ZIP manifest
và evidence bên dưới; không tuyên bố đã đủ điều kiện nộp chính thức.

| Phát hiện | Bằng chứng | Trạng thái |
|---|---|---|
| 1. Smoke Bedrock, source limits, không bỏ validation | `evidence/reference-repair-smoke.json`: 5/5; `reference-repair-evaluation.*`: 11/11; 194 backend tests về unsupported claims, subject swaps, IDs ngoài nguồn và qualifiers | Đã sửa và kiểm regression live; chưa chạy lại toàn bộ 200 mẫu trên bản repair |
| 2. 200 mẫu thống nhất, ảnh thật, review chéo | `eval/ground_truth_submission.jsonl`, audit valid 200 mẫu, 50/member, 44 holdout không overlap; `human-review-template.csv` | Authoring/audit đạt; review của thành viên **pending** |
| 3. Metrics dùng ranked retrieval, giữ answer evidence | API `retrievedContextIds`, tests independent telemetry; release 200/200, 197 success và 3 errors được giữ; review-release.csv gắn hash responses | Đã sửa; faithfulness/completeness chờ chấm độc lập |
| 4. Selector browser image retry | `frontend/tests/browser/image-merge.spec.ts`; 78 passed, 20 viewport skips, 0 failed | Đã sửa và kiểm chứng; API fixtures |
| 5. Docs đúng runtime | README, RAG_STATUS, chat-pipeline-bedrock, SETUP; report giới hạn SQL/image/UK/giá, tách baseline/release/regression | Đã sửa và cập nhật kết quả |
| 6. Source và artifact nộp | ZIP manifest/hash verifier; `evidence/fresh-source-database.json`: source giải nén đúng manifest, 194 backend tests trên DB mới; `evidence/clean-release-source.json`: npm ci/build, 122 C# tests; báo cáo/slide/failure cases | Snapshot Git ở nhánh codex/submission-readiness, ZIP kiểm bằng --require-complete; chưa full new-machine deployment |

## Phạm vi đã chốt

- Release đã đủ 200; ba lỗi được sửa và kiểm 11/11 regression + 5/5 smoke.
- Slide/report có baseline, release và regression riêng; không gộp lỗi cũ với runtime mới.
- Kiểm 17 slide render và package/layout; source giải nén và DB mới có scope riêng.

## Phần nhóm cần làm

- Review chéo ground truth và chấm claims/required facts; không tự điền người review.
- Điền tên thành viên và đối chiếu rubric giảng viên khi có.
- Quay demo có thuyết trình, customer/admin. Agent đã lưu demo screenshots/HTTP thật;
  video chưa tạo do FFmpeg download timeout. Ảnh không được trình bày như video.
- Review snapshot Git và quyết định push/release theo quy trình nhóm. Agent chốt local
  trên nhánh `codex/submission-readiness`; chưa push lên remote.

Không tuyên bố đủ nộp chính thức khi các mục nhóm chưa được thực hiện. Tải production,
giá thị trường hiện hành và full deployment trên máy mới chưa nằm trong evidence đã có.
