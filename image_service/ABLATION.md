# Thí nghiệm ablation A/B/C/D

Chạy từ thư mục gốc repository. Không cần PostgreSQL, API, Docker hoặc Bedrock.
Runner đo image retrieval; không gọi LLM.

| Cấu hình | Extractor | Gom theo car_id |
|---|---|---|
| A | Standalone: histogram/màu/cạnh/lưới | Tắt |
| B | Standalone: histogram/màu/cạnh/lưới | Bật |
| C | CLIP ViT-B/32 | Tắt |
| D | CLIP ViT-B/32 | Bật |

## Chuẩn bị và chạy

Sử dụng Python 3.12. Nếu chưa có môi trường image service:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r image_service/requirements.txt
.\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install transformers
```

CLIP cần weights `openai/clip-vit-base-patch32` trong Hugging Face cache hoặc
kết nối mạng để tải lần đầu. Khởi tạo CLIP thất bại sẽ dừng lượt chạy, không đổi
sang Standalone. FAISS được dùng nếu có; nếu thiếu, backend NumPy được ghi rõ
trong metadata và báo cáo. Cả hai extractor dùng cùng backend trong một process.

Để lưu và dùng lại weights trong project (thư mục `.local` đã được Git ignore),
đặt biến này trước lệnh chạy trong cùng cửa sổ PowerShell:

```powershell
$env:HF_HOME = Join-Path (Get-Location) '.local/huggingface'
```

```powershell
.\.venv\Scripts\python.exe -m image_service.scripts.run_ablation_study --repeats 3
```

Hoặc chỉ định một thư mục kết quả **chưa tồn tại**:

```powershell
.\.venv\Scripts\python.exe -m image_service.scripts.run_ablation_study --repeats 3 --batch-size 16 --candidate-pool 30 --output-dir image_service/indexes/ablation_real/my-run
```

Nếu thiếu bộ nhớ khi build CLIP, giảm `--batch-size` xuống 4 hoặc 1.
`--repeats` mặc định 1; 3 lần giúp quan sát độ trễ trên cùng máy, không tạo thêm
ảnh test độc lập. `--candidate-pool` tối thiểu 5 và mặc định 30; top-k luôn là 5.

## Dữ liệu và kiểm soát thí nghiệm

- Danh sách ảnh index mặc định lấy từ `image_service/indexes/image_meta.json`.
  Runner chỉ đọc danh sách này, rebuild toàn bộ vector bằng từng extractor.
- Tập test mặc định lấy từ `image_service/indexes/test_images_manifest.csv`.
  Không chia lại dữ liệu cho từng model. Snapshot hiện có là 171 ảnh index/44 ảnh test.
- Có thể dùng `--index-meta PATH` và `--test-manifest PATH` cho split khác.
  Schema index là JSON array với `car_id`, `image_path`, tùy chọn `image_id`;
  schema test là CSV với `car_id`, `raw_path` (hoặc `image_path`), tùy chọn `image_id`.
  Đường dẫn ảnh được resolve theo repository/dataset như build_index.py.
- Runner dừng nếu ảnh thiếu/hỏng, test trùng hash, có hash trùng index/test,
  hoặc xe test không có ảnh trong index. Không bỏ mẫu để làm đẹp metric.
- A/C lấy car_id của 5 ảnh đầu, có thể trùng. B/D lấy max similarity theo car_id
  từ cùng candidate pool rồi chọn tối đa 5 xe khác nhau.
- Mỗi extractor build một index riêng và warm-up một query trước khi đo.
  Latency gồm đọc ảnh, xử lý EXIF/RGB, embedding, search và gom nhóm/xếp hạng.
  Không gồm model loading, index build, HTTP, RAG hoặc frontend.

## Kết quả và kiểm tra lại

Mặc định, mỗi lượt tạo `image_service/indexes/ablation_real/<timestamp-UTC>/`:

- `ablation_study_results.md`: bảng A/B/C/D, các chênh lệch và phạm vi kết luận.
- `ablation_study_results.json`: metric của từng cấu hình.
- `per_query_results.csv`: cấu hình, ảnh, hash, repeat, ground truth, top-k,
  rank, hit@1/@3/@5, reciprocal rank và latency của từng query.
- `split.json`: danh sách ảnh index/test đã đóng băng kèm SHA256.
- `run_metadata.json`: số mẫu, hash input/runner, Git commit, versions,
  backend, tham số và thời gian chạy. `runner_sha256` nhận diện cả source chưa commit.
- `standalone/`, `clip/`: index, vectors, metadata ảnh và model thực tế/device/revision.
  Các file nhị phân `image.index`, `image_embeddings.npy` được Git ignore; metadata
  vẫn được giữ. Có thể đóng gói vector riêng nếu cần tái sử dụng.

Summary chỉ được xuất sau khi cả bốn cấu hình và các file chi tiết hoàn tất.
Nếu chạy lỗi, thư mục có thể chứa index/split dở dang; không xem đó là lượt thành công.
Chạy lại bằng thư mục mới. Index phục vụ API và các báo cáo lịch sử không bị ghi đè.

Với mỗi cấu hình, tính lại từ các dòng CSV của cấu hình đó:

```text
Recall@k (%) = 100 * tổng hit_at_k / số dòng
MRR@5        = tổng reciprocal_rank / số dòng
Mean latency = trung bình latency_ms
```

So sánh A→B và C→D để tách tác động gom nhóm; A→C và B→D để tách tác động
extractor; A→D để xem hiệu quả tổng thể. Chênh lệch Recall là **điểm phần trăm**.
Đừng mặc định cấu hình D tốt hơn: báo cáo giữ cả chênh lệch bằng 0 hoặc âm.

44 ảnh là tập test nhỏ. Hash chỉ kiểm tra trùng byte, không phát hiện near-duplicate
hoặc cùng chiếc xe xuất hiện ở hai split. Thí nghiệm này không tự chứng minh
ý nghĩa thống kê, khả năng tổng quát hóa hay cải thiện chất lượng trả lời end-to-end.

Các file `indexes/ablation_study_results.*` cũ chứa A/B lấy từ hằng số trong runner
lịch sử. Giữ chúng để đối chiếu, không dùng làm bằng chứng thay thế cho lượt mới.

## Lượt đã chạy ngày 19/10/2026

[Báo cáo đầy đủ](indexes/ablation_real/20261019T141836902398Z/ablation_study_results.md)
và [dự đoán từng query](indexes/ablation_real/20261019T141836902398Z/per_query_results.csv)
được đo bằng CLIP thật, FAISS, 171 ảnh index, 44 ảnh test, 3 repeats, batch size 1.
Đã tính lại metric từ 528 dòng CSV để đối chiếu với summary.

| Config | Recall@5 (%) | MRR@5 |
|---|---:|---:|
| A | 18.18 | 0.0871 |
| B | 22.73 | 0.0962 |
| C | 84.09 | 0.7652 |
| D | 86.36 | 0.7735 |

A khác số 15.91% trong báo cáo lịch sử. Dùng số liệu đo mới khi trình bày.
C→D tăng 2.27 điểm phần trăm (thêm một ảnh đúng trên 44 ảnh), B→D tăng 63.63
điểm phần trăm. Đây là kết quả trên split hiện có, với các giới hạn đã nêu ở trên.

## Kiểm thử runner

```powershell
.\.venv\Scripts\python.exe -m pytest image_service/tests/test_ablation_study.py -q
```

Test sử dụng ảnh nhỏ, vector index thật và extractor màu thay CLIP để kiểm tra
luồng, không tải model. Chỉ lượt chạy toàn bộ bằng CLIP thật mới cung cấp số liệu
thí nghiệm để báo cáo.
