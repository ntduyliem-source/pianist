# 700 bài piano G6 — ABC văn bản

100 bài ở mỗi nhóm n4, n6, n10, n20, n30, n50, n100. G6 là mốc nội bộ của Pianist, không tương đương chứng chỉ ABRSM.

| Họ quãng | Mã | Bán cung | Mỗi nhóm |
|---|---|---:|---:|
| Sáu thứ | m6-up / m6-down | 8 | 10 lên + 10 xuống |
| Sáu trưởng | M6-up / M6-down | 9 | 10 lên + 10 xuống |
| Bảy thứ | m7-up / m7-down | 10 | 10 lên + 10 xuống |
| Bảy trưởng | M7-up / M7-down | 11 | 10 lên + 10 xuống |
| Tám đúng | P8-up / P8-down | 12 | 10 lên + 10 xuống |

Mỗi họ/hướng có 5 bài phải và 5 bài trái làm trọng tâm trong mỗi nhóm. Mỗi cú nhảy lớn có nốt dẫn vào và nốt đi ra liền mạch, không chỉ hai nốt rời. Các chuyển động khác tối đa quãng năm; kiểm cả qua nghỉ và chỗ nối đoạn. Tay phụ đơn âm quen. Không thêm hợp âm, chấm dôi, tie hoặc đảo phách.

Vùng tay trọng tâm: phải C4–E5, trái C3–E4. Khi phải dẫn, tay trái ở C3–G3; khi trái dẫn, tay phải ở G4–C5. Giữ toàn vùng trái thấp hơn phải. Tất cả giọng C, 4/4. Khoảng cách nốt không chứng minh tốc độ hay số ngón an toàn.

| Thư mục | Số lần đánh của hai tay |
|---|---:|
| n4 | 3–5 |
| n6 | 6–8 |
| n10 | 9–14 |
| n20 | 15–24 |
| n30 | 25–39 |
| n50 | 40–69 |
| n100 | 70–120 |

Nghỉ không tính; giữ dài tính một lần. Mỗi bài luôn có hai khuông và nốt thật ở cả hai tay.

Mở file riêng trong thư mục độ dài hoặc dùng bảy tập `books/`, mỗi tập 100 tune. Dùng trình đọc ABC hỗ trợ hai voice và `%%score`; nếu chỉ hiện một bài thì chọn tune tiếp theo. `index.tsv` có thứ tự trong tập và số nốt; `validation.json` có tuyến nốt làm chứng cho quãng/hướng và các phép kiểm.

ABC: `C` là C4, `c` là C5, `C,` là C3. `C4` nghĩa là C4 ngân bốn phách đen, không phải một cú pháp đặt octave. `[V:RH]` / `[V:LH]` là hai khuông. Mốc Q:1/4=60 có thể giảm tùy khả năng; mọi bài không quá hai phút ở mốc tham chiếu.

Khi đọc trước, xác định nốt trước và sau cú nhảy, nhìn vị trí đến rồi chơi ở tốc độ giữ được phách. Chọn bài chưa đọc cho lượt đánh giá sight reading. Bộ có 100 dòng chủ đề với bảy phiên bản độ dài, dùng chung các đoạn viết sẵn và biến thể chuyển tay; không phải 700 ý nhạc độc lập. Không nên đọc liên tiếp bảy phiên bản cùng số để tự đánh giá khả năng đọc lần đầu.

Trợ lý biên soạn cao độ, trường độ và chọn trình tự đoạn cố định. Công cụ chỉ ghép, kiểm và đóng gói, không lựa nốt/ngẫu nhiên/chuyển vị. Từng ABC riêng và tune trong tập đã được đối chiếu với MusicXML về nốt, nghỉ, thời gian và hai khuông. Chưa có giáo viên duyệt, kiểm số ngón hay thử nghiệm hiệu quả học; đây là giới hạn của kiểm cấu trúc.
