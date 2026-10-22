# Biên soạn 700 bài G4 bằng ABC

Ngày 22/10/2026. Tiếp G1–G3: 100 bài trong mỗi nhóm n4 (3–5 lần đánh), n6 (6–8), n10 (9–14), n20 (15–24), n30 (25–39), n50 (40–69), n100 (70–120). Đếm nốt có cao độ của cả hai tay; nghỉ không tính, giữ dài tính một lần. Theo [đặc tả hai khuông](GRAND_STAFF_BANK_PLAN.md), G4 giới thiệu vị trí ký âm mới hoặc span mở rộng đến quãng tám, vẫn chuyển động tối đa quãng năm.

Đã hoàn thành: [kết quả và các phép kiểm](G4_ABC_RESULTS.md), [hướng dẫn mở bộ ABC](../../scores/composed/g4-abc/README.md).

Mỗi nhóm có 50 bài `upper`, 30 bài `lower`, 20 bài `span`:

| Nhánh | Vùng tay phải khi là trọng tâm | Vùng tay trái khi là trọng tâm | Bằng chứng |
|---|---|---|---|
| upper | G4–D5: `G A B c d` | G3–D4: `G, A, B, C D` | Có nốt cao hơn vùng C4–G4/C3–G3 cũ, ít nhất hai cao độ khác nhau |
| lower | A3–E4: `A, B, C D E` | A2–E3: `A,, B,, C, D, E,` | Có nốt thấp hơn vùng cũ, ít nhất hai cao độ khác nhau |
| span | C4–C5 | C3–C4 | Một chuỗi không xen nghỉ thực sự phủ quãng tám, mỗi bước không quá quãng năm |

Tay phụ giữ vùng G1, chỉ lặp/bước liền. Chọn âm nền theo từng vùng: G3/G4 cho nhánh upper; C3/C4 cho lower; C3 khi phải mở span và E4 khi trái mở span. Luôn kiểm toàn vùng tay trái thấp hơn tay phải để không trùng phím hoặc chéo vùng. Việc ghi vùng nốt không chứng nhận số ngón hay thế tay tối ưu.

Mỗi nhóm giữ 30 phải dẫn, 30 trái dẫn, 25 đối đáp, 15 cùng nhịp. Phân bổ nhánh theo R/L/A/S: upper 15/15/10/10, lower 9/9/7/5, span 6/6/8/0. Span cần ít nhất ba nốt tay trọng tâm để phủ quãng tám mà không nhảy tám; không ép thành bài cùng nhịp dưới sáu lần đánh.

Giữ hóa biểu C, không đổi khóa/giọng. Nhịp cơ bản 2/4, 3/4, 4/4, đen/trắng, nốt dài vừa ô và nghỉ cơ bản; chưa thêm móc đơn hoặc phối hợp độc lập. Mỗi tay đơn âm, cả hai tay có nốt thật. Không hợp âm đồng thời, tie, đảo phách, repeat hoặc pedal. Ngoài giới hạn quãng năm, tránh cú nhảy tritone trong bộ nhập môn này. Quãng được kiểm kể cả qua nghỉ và ranh giới đoạn.

Trợ lý viết trực tiếp cao độ/trường độ của các đoạn rồi chỉ định trình tự từng bài. Công cụ chỉ thêm header, ghép trình tự đã viết, kiểm và đóng gói; không chuyển vị hoặc lựa nốt bằng thuật toán. Ghi rõ các biến thể dùng chung đoạn/chuyển vai, không gọi 700 bài là 700 ý nhạc độc lập.

Đầu ra: 700 ABC riêng, bảy tập, mục lục, JSON, báo cáo và ZIP. X từ 2101–2800 nối tiếp ba bộ trước. Kiểm từng nốt/nghỉ sau chuyển đổi, vùng âm theo đúng octave ABC, quãng, phối hợp, bằng chứng vị trí/span, số nốt và trùng. Q:1/4=60 là mốc điều chỉnh được; bài không vượt hai phút ở mốc đó. Kiểm cấu trúc không thay cho giáo viên duyệt hay thử nghiệm hiệu quả học.
