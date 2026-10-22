# Biên soạn 700 bài G2 bằng ABC

Tiếp bộ G1 theo yêu cầu người dùng: 100 bài cho mỗi nhóm n4 (3–5 lần đánh), n6 (6–8), n10 (9–14), n20 (15–24), n30 (25–39), n50 (40–69), n100 (70–120). Đếm các nốt có cao độ ở cả hai tay; nghỉ không tính, nốt giữ dài tính một lần. Grade là thang nội bộ Pianist.

Đã hoàn thành: [kết quả và các phép kiểm](G2_ABC_RESULTS.md), [hướng dẫn mở bộ ABC](../../scores/composed/g2-abc/README.md).

Theo [đặc tả hai khuông](GRAND_STAFF_BANK_PLAN.md), mỗi nhóm có hai nhánh riêng, mỗi nhánh 50 bài:

- `third`: tay trọng tâm có quãng ba và bước liền thật, tối đa quãng ba; trường độ G1. Tay còn lại chỉ lặp/bước liền.
- `eighth`: tay trọng tâm có cặp móc đơn trọn phách, cả hai tay chỉ lặp/bước liền. Tay còn lại giữ trường độ G1. Không trộn quãng ba vào nhánh này.

Cả hai tay có nốt thật. C major, RH C4–G4, LH C3–G3; nhịp 2/4, 3/4 hoặc 4/4. Giữ các vị trí nốt trắng, nốt dài và dấu nghỉ của G1. Không hợp âm trong một tay, tie, đảo phách, đổi giọng/khóa, repeat hoặc pedal. Cặp móc đơn được viết liền (`C/2D/2`) để nhóm thành một phách khi chuyển đổi. Q:1/4=60 là mốc có thể điều chỉnh.

Nhóm n6 trở lên giữ 30 bài phải dẫn, 30 trái dẫn, 25 đối đáp, 15 cùng nhịp. Trong đó nhánh third có 15/15/5/15 bài; nhánh eighth có 15/15/20/0 bài. Nhánh eighth không yêu cầu tay phụ học móc đơn đồng thời. Riêng n4 dùng 35 phải dẫn, 35 trái dẫn và 30 đối đáp: bài cùng nhịp có quãng ba và bước liền trong một tay cần ít nhất sáu lần đánh ở hai tay, vượt khoảng 3–5.

Nhạc được trợ lý viết thành các đoạn ABC có đầy đủ cao độ và trường độ, sau đó chỉ định cụ thể trình tự đoạn cho từng bài. Các đoạn dùng chung được ghi rõ trong nguồn biên soạn, không lựa ngẫu nhiên, không dùng thuật toán quyết định nốt. Bài dài phát triển và trở lại các ý đã viết; các biến thể đổi vai được công khai, không gọi 700 bài là 700 ý nhạc không liên quan.

Đầu ra: 700 file ABC riêng, bảy tập gộp, mục lục, báo cáo và ZIP trong `scores/composed/g2-abc`. ID X từ 701–1400 để có thể gộp với G1. Công cụ kiểm đủ phách, vùng âm, quãng qua nghỉ/ranh giới đoạn, bằng chứng trọng tâm, vai tay, số nốt, trùng nội dung và từng nốt sau chuyển ABC sang MusicXML. Kiểm cấu trúc không thay cho giáo viên duyệt hoặc thử nghiệm hiệu quả học.
