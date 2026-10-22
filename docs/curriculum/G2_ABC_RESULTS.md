# Kết quả bộ 700 bài G2 bằng ABC

Hoàn thành ngày 22/10/2026 theo [kế hoạch G2](G2_ABC_COMPOSITION_PLAN.md) và [đặc tả hai khuông](GRAND_STAFF_BANK_PLAN.md). Đầu ra: [hướng dẫn và bảy tập ABC](../../scores/composed/g2-abc/README.md), [gói 700 bài](../../scores/composed/g2-abc-700.zip).

| Nhóm | Số bài | Nhánh third / eighth | Số nốt thực | Dài nhất ở 60 BPM |
|---|---:|---:|---:|---:|
| n4 | 100 | 50 / 50 | 3–5 | 8 giây |
| n6 | 100 | 50 / 50 | 6–8 | 8 giây |
| n10 | 100 | 50 / 50 | 9–14 | 12 giây |
| n20 | 100 | 50 / 50 | 15–24 | 18 giây |
| n30 | 100 | 50 / 50 | 25–39 | 36 giây |
| n50 | 100 | 50 / 50 | 40–69 | 54 giây |
| n100 | 100 | 50 / 50 | 70–120 | 90 giây |

Tổng 350 bài quãng ba và 350 bài cặp móc đơn; 21.529 lần đánh phím. Các bài quãng ba có cả quãng ba và bước liền trong tay trọng tâm, tay phụ chỉ lặp/bước liền và không có móc đơn. Các bài móc đơn có cặp hai nốt đúng pha nguyên phách, cao độ G1 ở cả hai tay, tay phụ không học móc đơn cùng lúc. Kiểm giới hạn quãng trên toàn chuỗi phát âm, gồm qua nghỉ, vạch nhịp và chỗ ghép đoạn.

Tổng vai tay: 215 phải dẫn, 215 trái dẫn, 180 đối đáp, 90 cùng nhịp. Nhóm n4 dùng 35/35/30/0; sáu nhóm còn lại dùng 30/30/25/15. Ngoại lệ n4 có lý do âm nhạc: cùng onset ba nốt ở mỗi tay đã cần sáu lần đánh, vượt khoảng 3–5.

Nguồn gồm 300 bài ngắn ghi nguyên văn và 400 bài có trình tự cố định từ 179 đoạn ABC được sử dụng. Từng cao độ, trường độ, nghỉ và thứ tự đoạn đều hiện trong nguồn `buildscripts/pianist/compositions/g2/`. Script [đóng gói](../../buildscripts/pianist/package-g2-abc.py) không quyết định nốt, không chuyển vị, không lựa ngẫu nhiên, không tự sửa nhạc. Bài dài có hai, ba hoặc năm đoạn; có các lần trở lại và biến thể dùng chung đoạn. Đây không phải 700 ý giai điệu không liên quan.

Bộ kiểm xác nhận 700 nội dung riêng biệt và không trùng hoàn toàn với G1. Có 458 dấu vết chuẩn hóa theo cao độ bắt đầu từng tay và chuyển vai. Dấu vết chỉ mô tả các mẫu liên quan; không chứng nhận số ý nhạc độc lập. Thứ tự bảy tập không có hai bài cùng dấu vết chuẩn hóa liền nhau. Không bài dài nào chỉ lặp nguyên xi vòng một hoặc hai ô.

1.400 lượt chuyển đổi đạt, gồm 700 file riêng và 700 vị trí trong bảy tập. Dùng abc2xml đã ghim của repository; bộ đọc MusicXML độc lập từ công cụ G1 đối chiếu từng nốt, nghỉ, onset, trường độ và staff. Mọi bài có đúng một part piano và hai staves. Khi converter không ghi staff im lặng trọn một ô nội bộ, bộ kiểm chỉ bổ sung khoảng nghỉ ngầm định của đúng staff/ô đó để so với nghỉ được viết; không dùng để che mất nốt hoặc thiếu nghỉ một phần ô.

[Kiểm hồi quy](../../buildscripts/pianist/check-g2-abc.py) đạt năm test, trong đó có 22 trường hợp cố ý sai: thiếu trọng tâm, quãng bốn/nhảy qua nghỉ, quãng ba hoặc nhịp mới ở tay phụ, trộn hai kỹ năng mới, cặp móc đơn thiếu/sai pha, lặng móc đơn, nốt trắng sai phách, thiếu/thừa phách, sai octave, tay im lặng, hợp âm, dấu hóa, tie, đối đáp chồng tiếng hoặc cùng nhịp nhưng lệch thời gian. Kiểm lại đầy đủ file riêng/tập gộp, ID X 701–1400 và không trùng G1.

[Mục lục](../../scores/composed/g2-abc/index.tsv) có nhánh, vai tay, tay trọng tâm, số nốt, nhịp và vị trí trong tập. [Báo cáo JSON](../../scores/composed/g2-abc/validation.json) có bằng chứng trọng tâm và nguồn đoạn theo từng bài. ZIP có 700 file riêng, bảy tập, README, TSV và JSON; bảy tập không tính thêm bài.

Phạm vi bàn giao là ABC văn bản và kiểm cấu trúc/chuyển đổi. Chưa có giáo viên duyệt, thử nghiệm hiệu quả học hoặc render từng bài trong native MuseScore. Đây là G2 nội bộ Pianist. Kho đang phục vụ trên web và bộ chấm không nằm trong lần bàn giao này.
