# Ba trường hợp lỗi có evidence

Các case dưới đây thuộc lượt baseline trong `evidence/live-evaluation.*` và dùng
nhãn nháp từ seed. Nhóm vẫn cần kiểm chứng nhãn, không coi phân tích này là review độc lập.

## Q089 — SQL có giá nhưng audit thiếu price contexts

Câu hỏi: “Tìm xe Ford có giá không quá 1,5 tỷ đồng.” API trả HTTP 503.
Log ở `evidence/q089-baseline-validation.txt` ghi reviewer thiếu price evidence
cho EcoSport, Focus và Ranger; chỉ Fiesta có price context trong top-5. Reviewer còn
gọi ngày 2026-10-01 là tương lai dù server đang ở 2026-10-11.

SQL đã chọn các xe và giá có nguồn, nhưng facts từ SQL chưa được gắn thành supporting
contexts đầy đủ cho composer/audit. Đây là lỗi đóng gói evidence, không phải lý do bỏ audit.
Source sửa bằng cách thêm evidence SQL với ID document gốc cho facts discovery còn thiếu, giữ nguyên
ranked retrieval IDs. Composer cấp ngày UTC của server cho audit. Regression đã kiểm
price sources và việc không đổi ranked retrieval; kết quả live sau sửa nằm riêng ở
`evidence/postfix-evaluation.*` khi lượt đó hoàn tất.

## Q101 — Model đúng không có trong top-5

Nhãn ảnh: Toyota Yaris. Xếp hạng thực tế: Kia Rio, Toyota Prius, Ford Focus,
Kia Carnival (Sedona), Hyundai Grand i10. Recall@1=0, Recall@5=0, MRR@5=0.
Chat nêu Kia Rio gần giống nhất với similarity 92,9%, đồng thời cảnh báo chưa chắc chắn.

Ảnh holdout đã kiểm không trùng bytes với ảnh index. Quan sát ảnh cho thấy góc chính
diện, vì vậy không có bằng chứng để quy lỗi cho góc chụp khó. Giả thuyết cần kiểm tra:
embedding CLIP và cách gom theo model chưa phân biệt đủ các mẫu xe. Một case không
chứng minh nguyên nhân; cần thử encoder/aggregation trên development set rồi khóa
cấu hình trước evaluation. Không thêm ảnh holdout vào index để làm tăng điểm.

## Q102 — Có model đúng trong top-5 nhưng top-1 sai

Nhãn ảnh: Toyota Prius. Xếp hạng thực tế: Kia Carnival (Sedona), Toyota Prius,
Kia Sportage, Honda Jazz, Toyota Alphard. Recall@1=0, Recall@5=1, MRR@5=0,5.
Chat chọn Kia Carnival (Sedona) với similarity 91,8% và cảnh báo chưa chắc chắn.

Top-5 có giá trị cho việc đưa ứng viên để người dùng xác nhận, nhưng không chứng minh
top-1 đúng. Similarity không phải xác suất nhận diện. Cần giữ uncertainty, tránh khẳng
định ảnh là chiếc xe/VIN cụ thể và cân nhắc bước xác nhận model khi ứng viên gần nhau.
Đây là hướng cải tiến chất lượng nhận diện, không phải một fix đã được kiểm chứng.

Ảnh và raw answers/context IDs của Q101/Q102 nằm trong ground truth và responses JSON.
Kết quả image retrieval được báo riêng với chat HTTP/status và với chấm claims của con người.

## Q014 — Failure mới trong lượt release

Q014 hỏi xe Hyundai kiểu Hatchback, 5 chỗ, giá tối đa 600.000.000 VND. Baseline
thành công, nhưng lượt release bị HTTP 503. Log `evidence/q014-release-validation.txt`
cho thấy reviewer viện dẫn kiểu Elantra theo kiến thức thị trường để bác nhãn Hatchback
của catalogue, rồi nêu lý do ngân sách mâu thuẫn (579.000.000 VND vẫn dưới trần).
Phản hồi bị từ chối, không trả một câu chưa được audit chấp nhận.

Đây là bằng chứng semantic audit còn có false rejection; một smoke 5/5 không chứng minh
mọi câu đều ổn định. Không sửa nhãn theo output hoặc bỏ audit để đạt điểm. Nhóm cần kiểm
tra mapping model/kiểu xe UK so với dữ liệu Việt Nam; trước khi kết luận cuối, phân tích
đủ lượt release và giữ riêng kết quả kiểm tra lại nếu có. Case này vẫn là rủi ro đang theo dõi.

Đối chiếu seed cho thấy `car_36_4` có ảnh đường dẫn `Hyundai/2003/Hyundai$$Elantra$$2003...`,
thông số Hatchback/Diesel/Manual và giá tham khảo có ngày 2026-10-01. Những trường này
không chứng minh ảnh, cấu hình UK và giá Việt Nam cùng một đời/phiên bản xe.
Khi review Q014, Q044 và các câu so sánh có Elantra, cần kiểm tra tính nhất quán đời xe
với nguồn gốc từng trường; không tự đổi body type hoặc coi giá là giá của chiếc xe trong ảnh.
Reviewer source đã nhấn mạnh rằng image count/missing-image flags không chứng minh kiểu
thân xe, và source qualifiers phải được đánh giá trên toàn answer kể cả footer.
Đây là sửa lỗi audit suy luận ngoài evidence; không xác minh mapping catalogue bằng
kiến thức của model. Bản sửa đã qua backend regression, chưa xác nhận live.

## Q087 — Reviewer tạo context ID ngoài nguồn

Q087 hỏi xe Mazda có giá tối đa 1,5 tỷ đồng. Lượt release trả HTTP 503 dù reviewer
đánh giá các claims là supported: cả hai lần audit đều tạo thêm
`car:car_57_10:overview:v1` ngoài tập context IDs đã cung cấp. Server từ chối ID này,
không gán nguồn giả cho câu trả lời. Log: `evidence/q087-release-validation.txt`.
Đây là lỗi đầu ra của reviewer, khác với đổi nhãn xe. Source đã bổ sung enum trong JSON
schema theo đúng tập evidence của mỗi request, đồng thời giữ kiểm tra ID phía server
và kiểm chứng unsupported claims. 15 tests grounding đạt; chưa xác nhận live của bản sửa.
Bedrock nhận schema trong system prompt của Converse, không phải constrained decoding;
enum là hướng dẫn lựa chọn, chưa bảo đảm model luôn tuân thủ. Kiểm tra ID phía server
vẫn là điều kiện bắt buộc trước khi trả grounded success.
Lượt đang chạy được giữ nguyên container, gắn với `release-runtime-identity.json`;
kiểm tra sửa phải ghi thành lượt riêng sau khi hoàn tất release.

## Q099 — Chưa trả lời trực tiếp yêu cầu xác nhận phiên bản

Q099 hỏi thông số Honda CR-V phiên bản 2025 có đúng với bản Việt Nam không. Reviewer
từ chối lượt đầu vì answer chỉ nêu thông số tham khảo UK và không trả lời trực tiếp
yêu cầu xác nhận năm/phiên bản. Lượt repair nhắc số năm không có trong evidence và bị
numeric validation từ chối. Log: `evidence/q099-release-validation.txt`.
Source đã bổ sung hướng dẫn presentation cho intent specification: trả lời trực tiếp
chưa đủ xác nhận năm/phiên bản theo yêu cầu, tránh lặp số năm chưa có nguồn, rồi chỉ
nêu thông số tham khảo nếu hữu ích. Numeric/semantic validation giữ nguyên. Bản sửa
chưa được triển khai vào container đang chạy; cần kiểm chứng live ở lượt riêng.

## Kết quả kiểm chứng sau sửa

Lượt `auditfix-evaluation.*` hoàn tất 13 case: Q014/Q099 đạt, Q087 vẫn bị từ chối ID
ngoài evidence dù có enum hướng dẫn. Bản tiếp theo thêm một lần repair verdict trên
cùng final answer; verdict mới vẫn phải kiểm chứng toàn bộ claims và mọi context ID.
Không tự xóa ID lạ rồi gán grounded=true hoặc viết lại nguồn phía server.

`reference-repair-evaluation.*` hoàn tất 11/11 case, gồm Q014/Q087/Q099 và các case
text/image/dealer/comparison/no-data. `reference-repair-smoke.json` đạt 5/5 intent
trên cùng runtime identity. Backend đạt 194 tests, gồm từ chối claims unsupported
sau repair và unknown IDs lặp lại. Kết quả này là regression có phạm vi, không phải
200 mẫu đều đạt trên bản mới. Lượt release 197 success/3 errors vẫn được giữ nguyên;
review nhãn và tính nhất quán đời xe vẫn là công việc của nhóm.
