# Gói chuẩn bị nộp AutoWise

Thư mục này lưu bằng chứng kiểm thử/evaluation và tài liệu để nhóm hoàn thiện bài nộp.
Chưa được coi là nghiệm thu cuối khi ground truth và chất lượng câu trả lời còn chờ review chéo.

## Thành phần

- `evidence/live-evaluation.csv`: kết quả từng mẫu, gồm lỗi và latency.
- `evidence/live-evaluation.summary.json`: summary có số mẫu đóng góp từng metric, ground truth hash và split.
- `evidence/live-evaluation.responses.json`: lời trả lời và context IDs để chấm độc lập.
- Ground truth thống nhất: `../../eval/ground_truth_submission.jsonl`.
- Audit dữ liệu: `../../eval/submission_ground_truth_audit.json`.
- Review gốc và hướng khắc phục: `../final-review-2026-10-11.md`.
- `technical-report.md`: báo cáo kỹ thuật sinh từ evidence.
- `slides/`: slide PowerPoint có số mẫu và thời điểm xuất trong tên; bản checkpoint
  chưa hoàn tất evaluation được ghi rõ ngay trong slide kết quả.
- `human-review-template.csv`: phiếu review nháp, không phải xác nhận đã chấm.
- `evidence/release-runtime-identity.json`: image IDs và hash source của lượt release.
- `evidence/release-evaluation.*`: hoàn tất 200 mẫu, 197 success và 3 HTTP errors
  Q014/Q087/Q099. Không thay kết quả bằng lượt chạy lại. `live-evaluation.*` là baseline.
- `human-review-release.csv`: phiếu 200 mẫu với response archive hash, contexts và citations.
- `evidence/auditfix-evaluation.*`: regression 13 case, 12 success, Q087 vẫn lỗi;
  runtime riêng `auditfix-runtime-identity.json`. Bản repair references tiếp theo được
  lưu riêng trong `reference-repair-evaluation.*` và runtime identity tương ứng.
- `demo/`: ảnh catalogue/so sánh/chat thật; `evidence/demo-live.json` lưu responses.
  Chưa có video: tải FFmpeg Playwright thất bại do timeout. Có thể chạy
  `node scripts/record_submission_demo.cjs` sau khi cài FFmpeg; option
  `--screenshots-only` không tạo video và không được trình bày như recording.
- `failure-analysis.md`: phân tích ba case cụ thể có evidence.

## Review chéo phải làm trước khi chốt

Assigned member là phân công của bản nháp do công cụ tạo, không phải xác nhận ai đã viết.
Thành viên 2 review Q001–Q050, thành viên 3 review Q051–Q100, thành viên 4 review Q101–Q150,
thành viên 1 review Q151–Q200. Người review cần đối chiếu câu hỏi, facts, nguồn, context IDs
với snapshot thực tế; sửa nhãn sai rồi ghi reviewed_by, review_status và ngày review trong bản
review riêng. Không chạy authoring ghi đè bản đã review.

Với mỗi response, tách các phát biểu có thể kiểm chứng. Faithfulness là số claims được nguồn
đúng chủ thể hỗ trợ chia tổng claims thực tế; completeness là số ý bắt buộc trả lời đúng chia
tổng ý bắt buộc. Câu làm rõ/no-data không có claim thực tế thì ghi N/A, không tự chấm 1.
Ảnh gần giống không chứng minh chiếc xe/VIN; similarity không phải xác suất nhận diện.
`grounded=true` từ LLM reviewer không thay thế chấm của người review.

`human-review-template.csv` là phiếu 200 mẫu, các cột chấm/nhận xét/người review
để trống. Sao chép sang file riêng trước khi chấm. `response_recorded=false`
nghĩa là evaluation chưa ghi mẫu đó, không phải lời trả lời rỗng đã được kiểm chứng.
Chạy lại export sau khi evaluation hoàn tất để điền đủ responses; script từ chối
ghi đè template đã có xác nhận/nhận xét của người review.

Evaluation live tuần tự (không chạy thêm tác vụ gọi AWS đồng thời):

```powershell
python eval/run_text_evaluation.py --ground-truth eval/ground_truth_submission.jsonl --split all --output docs/submission/evidence/live-evaluation.csv --resume
```

Chỉ dùng `--resume` khi có checkpoint matching hash/case IDs; lượt đầu bỏ option này.
Resume giữ cả mẫu đã lỗi, không dùng để loại lỗi khỏi thống kê.

## Ba tình huống lỗi cần đưa vào báo cáo

1. Lời trả lời bỏ giới hạn nguồn hoặc khẳng định xe lịch sử đang bán: trước sửa bị 503;
   backend nay đính kèm qualifiers và audit toàn bộ lời trả lời. Phát biểu mâu thuẫn vẫn bị từ chối.
2. Nhầm ảnh holdout sang model khác: phân tích từ image_ranked_car_ids; báo cáo cả top 1,
   top 5 và uncertainty, không dùng ảnh training làm bằng chứng chất lượng nhận diện.
3. AWS throttling/đứt kết nối: 503 có thể xảy ra dù DB/index healthy. Giữ error count,
   retry có giới hạn, chạy demo tuần tự; không loại các case lỗi khỏi mẫu tổng để báo cáo success rate.

## Kịch bản demo khoảng 7 phút

1. Trang chủ → catalogue → lọc → chi tiết và nguồn → so sánh hai xe.
2. Chat “Tìm SUV 5 chỗ dưới 800 triệu”; chỉ rõ giá tham khảo, ngày và cảnh báo nguồn.
3. Hỏi giá/bảo hành/so sánh; mở nguồn của câu trả lời.
4. Gửi ảnh holdout: xem mẫu gần giống và uncertainty; không khẳng định chiếc xe/VIN.
5. Guest hỏi đơn → đăng nhập customer → hỏi đơn thuộc tài khoản → reload lịch sử.
6. Admin assistant: tra cứu có filter và thống kê; trình bày quyền customer/admin.
7. Hiện evaluation table, ba failure cases và giới hạn dữ liệu UK/Vietnam.

Trước buổi demo chạy index validation và live smoke. Chuẩn bị recording dự phòng từ đúng
bản code/evidence, ghi rõ đó là recording; không thay kết quả live lỗi bằng dữ liệu giả.

## Kiểm tra gói source

Lệnh tái lập và đóng gói:

```powershell
python scripts/verify_fresh_database.py
python scripts/render_submission_report.py
python scripts/export_submission_review.py
python scripts/export_submission_runtime.py
python scripts/package_submission.py
python scripts/verify_submission_archive.py --require-complete
```

`verify_fresh_database.py` tạo container PostgreSQL riêng không expose cổng, chạy
chuỗi SQL theo Compose và chỉ dọn container/anonymous volume của phép kiểm tra đó.
Thêm `--backend-source <thư mục source giải nén>` để chạy backend tests trên database
mới qua cổng ngẫu nhiên chỉ bind localhost; kiểm hash manifest source nếu có. Evidence
`fresh-source-database.json` ghi phạm vi dùng lại Python/dependencies trên host.
`package_submission.py` bao gồm source chưa commit, manifest SHA256 từng file,
bỏ .env và caches/build; ZIP local ở `.local/submission/AutoWise-source.zip`.
Tạo lại ZIP sau khi báo cáo/evidence cuối đã cập nhật.

Để chấm bản release sau khi đủ 200 mẫu, export phiếu mới, giữ nguyên phiếu baseline:

```powershell
python scripts/export_submission_review.py --responses docs/submission/evidence/release-evaluation.responses.json --output docs/submission/human-review-release.csv
```

Cột `response_source` ghi rõ response archive nào được chấm. Không trộn câu trả lời
của nhiều runtime vào cùng một điểm faithfulness/completeness mà không ghi nguồn.
Cột `response_archive_sha256` khóa phiếu với đúng response archive; ranked context IDs,
answer context IDs và citations được xuất riêng để người chấm kiểm nguồn. Các case có
Elantra được gắn `data_review_hint` để kiểm đời xe/phiên bản trước khi duyệt nhãn.

Giữ `.env`/AWS credentials ngoài gói nộp. Bao gồm file mới, migration, dataset/index và
lockfile cần chạy; dùng `npm ci`. Dựng với database mới ở môi trường riêng, không xóa volume
đang dùng. Ghi commit SHA và version runtime khi chốt. Bằng chứng trong evidence được commit
riêng với nguồn dữ liệu/hash; các report thử tại eval/preflight* chỉ là diagnostics local.
