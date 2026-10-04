# US-02 — Tiến độ và bước tiếp theo

Trạng thái: đã triển khai và nghiệm thu local ngày 2026-10-04. Thứ tự: 2. Phụ thuộc: US-01.

Tài liệu thực hiện: [plan.md](us-02/plan.md), [verification.md](us-02/verification.md).

Hợp đồng triển khai giữ intent/topic `status` để tương thích US-01; section bổ sung `progress` chứa timeline, nextActions và schedule. Tool tra cứu mới: `GetMyOrderProgress`.

## User story

Là khách hàng, tôi muốn biết đơn đã hoàn thành bước nào, đang chờ gì và tôi cần làm gì tiếp theo để chủ động chuẩn bị nhận xe.

Ví dụ: “Đang chuẩn bị xe nghĩa là sao? Tôi cần làm gì tiếp?”

## Phạm vi và dữ liệu

- Timeline lấy từ sự kiện nghiệp vụ đã ghi nhận, có thời gian và nguồn sự kiện.
- Đối chiếu lịch sử trạng thái hiện có; chỉ bổ sung sự kiện nếu nguồn hiện tại chưa đủ. Không tạo lịch sử giả cho đơn cũ.
- Hướng dẫn theo sáu trạng thái hiện tại: pending_confirmation, confirmed, preparing_vehicle, ready_for_handover, completed, cancelled.
- Bước tiếp theo có bên thực hiện customer/dealer và liên kết tới màn hình phù hợp.
- Lý do chờ lấy từ ghi nhận backend dành cho khách; không đưa ghi chú nội bộ ra chat.

## Luồng và thiết kế

1. Tool `GetMyOrderProgress` kiểm tra quyền và đọc trạng thái, sự kiện, lịch và dữ liệu còn thiếu.
2. Backend áp dụng bảng hướng dẫn theo trạng thái, tách việc đã ghi nhận và bước dự kiến.
3. Trả section progress với timeline và nextActions tùy chọn; giữ content fallback.
4. Nếu chưa có nguyên nhân hoặc ngày giao, hiển thị chưa có dữ liệu xác nhận.

Không suy ra chắc chắn “đã trả đủ” từ trạng thái đơn. Không hứa ngày giao từ thời gian trung bình. Chưa gửi nhắc việc tự động trong US này.

## Acceptance criteria

- AC1: Mọi trạng thái có tên tiếng Việt và mô tả phù hợp.
- AC2: Mốc hoàn tất chỉ hiển thị khi có sự kiện, đúng thời điểm; đơn cũ thiếu lịch sử vẫn xem được trạng thái hiện tại.
- AC3: Bước tiếp theo ghi rõ khách hay đại lý cần thực hiện, không coi bước dự kiến là đã hoàn tất.
- AC4: Phân biệt lịch dự kiến và lịch xác nhận theo dữ liệu nghiệp vụ; chưa có lịch thì nói rõ.
- AC5: Chỉ giải thích nguyên nhân chờ khi có thông tin được phép hiển thị.
- AC6: Đơn completed/cancelled không nhận hướng dẫn tiếp tục mua xe không phù hợp.
- AC7: Câu hỏi kết hợp tiến độ và số tiền dùng dữ liệu cùng đơn; mỗi section có thời điểm tra cứu.

## Các bước và nghiệm thu

1. Kiểm tra nguồn lịch sử và định nghĩa dữ liệu lịch dự kiến/xác nhận hiện có.
2. Bổ sung read model/tool; migration nếu cần và ghi sự kiện trong các luồng cập nhật hiện có.
3. Render timeline, bước tiếp theo và trạng thái thiếu dữ liệu.
4. Kiểm thử AC1–AC7 trên đủ sáu trạng thái, lịch đổi và đơn cũ; kiểm tra quyền và regression US-01.

Bàn giao: bảng hướng dẫn trạng thái, timeline có căn cứ, dữ liệu cần thiết cho US-03.
