# US-04 — Thanh toán chi tiết và hồ sơ

Trạng thái: hoàn tất local ngày 2026-10-04. Thứ tự: 4. Phụ thuộc: US-01 đến US-03.
Kế hoạch: [plan](us-04/plan.md). Bằng chứng và giới hạn dữ liệu: [nghiệm thu](us-04/verification.md).

## User story

Là khách hàng, tôi muốn xem các khoản thu/hoàn và giấy tờ còn thiếu để biết chính xác mình cần hoàn tất gì.

Ví dụ: “Khoản cọc hôm qua đã xác nhận chưa? Tôi thiếu giấy tờ nào?”

## Phạm vi và dữ liệu

- Mở rộng payment tool bằng danh sách giao dịch có phân trang, loại, số tiền, thời điểm, trạng thái xác nhận.
- Tái sử dụng nguồn và cách tính NetReceived/Remaining hiện có; model không tính tiền.
- Checklist hồ sơ theo đơn: loại giấy tờ, bắt buộc, trạng thái, ghi chú dành cho khách, updatedAt.
- Trạng thái hồ sơ: chưa nộp, chờ kiểm tra, hợp lệ, cần bổ sung.
- Nếu chưa có checklist store/UI, thêm bảng trong orders_service và màn hình admin cập nhật. Không mặc định mọi đơn có cùng hồ sơ bắt buộc.
- Chỉ đọc chứng từ đã tồn tại và được cấp quyền. Upload/OCR giấy tờ nằm ngoài US này.

## Luồng và thiết kế

1. Xác định đơn và nội dung hỏi; nếu có nhiều giao dịch cùng khớp, hỏi chọn giao dịch.
2. Truy vấn summary, giao dịch và checklist bằng principal hiện tại.
3. Trả payment/documents sections, số tổng từ backend và thời điểm tra cứu.
4. Link chứng từ dùng endpoint kiểm tra quyền khi mở, không chỉ kiểm tra ở lúc tạo link.

Nếu hệ thống chưa lưu trạng thái chờ/từ chối thì bổ sung mô hình và cách admin cập nhật trước khi cung cấp câu trả lời về các trạng thái đó. Không suy ra giao dịch tồn tại từ lời khách nói.

## Acceptance criteria

- AC1: Thu, hoàn, chờ xác nhận và từ chối được phân biệt đúng theo dữ liệu lưu.
- AC2: Chỉ giao dịch được xác nhận ảnh hưởng số tổng theo quy tắc nghiệp vụ hiện có.
- AC3: Đơn hủy hiển thị khoản còn giữ/đã hoàn thực tế, không hướng dẫn trả tiếp tự động.
- AC4: Checklist chỉ ra giấy tờ còn thiếu hoặc cần bổ sung và lý do đã ghi nhận.
- AC5: Chưa có checklist/chứng từ thì nói chưa có dữ liệu; không tạo liên kết giả.
- AC6: Truy cập trực tiếp chứng từ của người khác bị từ chối.
- AC7: Danh sách có giới hạn/phân trang; summary vẫn tính toàn bộ giao dịch hợp lệ.
- AC8: Admin cập nhật hồ sơ/giao dịch xong, lượt hỏi mới phản ánh dữ liệu mới.

## Các bước và nghiệm thu

1. Kiểm tra payment model, trạng thái giao dịch và nơi lưu chứng từ hiện có.
2. Bổ sung read model, checklist và luồng admin tối thiểu; migration khi cần.
3. Render bảng giao dịch/checklist và mở chứng từ có kiểm tra quyền.
4. Kiểm thử AC1–AC8, tổng tiền sau hoàn, nguồn thiếu, phân trang và regression US-01–03.

Bàn giao: tra cứu chi tiết và khả năng admin duy trì dữ liệu; làm nguồn ngữ cảnh cho US-05.
