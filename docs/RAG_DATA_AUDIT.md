# Kiểm tra dữ liệu Text RAG

Báo cáo tạo từ SQL seed và bộ câu hỏi text của project; phạm vi là 13 xe xuất hiện nhiều nhất, không phải toàn bộ catalogue.

Tạo lại từ root bằng `.venv/Scripts/python.exe eval/audit_rag_data.py`.

Kiểm tra nội bộ trên SQL seed đã commit. Chưa xác minh giá/phiên bản hiện tại từ website nguồn; giá và phiên bản cần được đối chiếu trực tiếp với nguồn trước khi nghiệm thu.

| Car ID | Xe | Số lần hỏi | Tình trạng | Giá tham khảo VND |
|---|---|---:|---|---:|
| car_34_3 | Honda CR-V | 6 | official_current | 1039000000 |
| car_57_7 | Mazda CX-5 | 6 | official_current | 699000000 |
| car_92_44 | Toyota Yaris | 6 | official_historical | 684000000 |
| car_34_2 | Honda Civic | 6 | official_current | 789000000 |
| car_92_34 | Toyota RAV4 | 5 | present_via_import | 2400000000 |
| car_57_11 | Mazda3 | 5 | official_current | 569000000 |
| car_36_24 | Hyundai Tucson | 5 | official_current | 769000000 |
| car_36_20 | Hyundai Santa Fe | 5 | official_current | 1069000000 |
| car_29_30 | Ford Ranger | 5 | official_current | 707000000 |
| car_29_9 | Ford Explorer | 4 | official_current | 2099000000 |
| car_43_13 | Kia Sportage | 3 | official_current | 769000000 |
| car_64_20 | Nissan Navara | 3 | official_current | 748000000 |
| car_87_10 | Suzuki Swift | 2 | official_current | 569000000 |

Chi tiết nguồn giá, policy và lỗi theo từng xe: [rag_data_audit.json](../eval/rag_data_audit.json).

Các điểm cần xử lý trước khi nghiệm thu: provenance thông số theo trường/phiên bản Việt Nam; trường kỹ thuật còn null; điều kiện áp dụng policy hãng và chênh lệch cars/policy nếu có.

RAG hiện giữ cảnh báo DVM-CAR, giá tham khảo, thị trường lịch sử/nhập khẩu và điều kiện VIN/ngày bán; không bổ sung giá trị cho trường null.
