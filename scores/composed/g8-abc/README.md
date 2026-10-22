# 700 bài piano G8 — ABC văn bản

100 bài ở mỗi nhóm n4, n6, n10, n20, n30, n50, n100. Đây là G8 nội bộ Pianist, không tương đương Grade 8 ABRSM.

| Nhánh | Mỗi nhóm | Giới hạn rõ ràng |
|---|---:|---|
| ledger-high | 25 | Tay phải đọc C6–G6 trên khuông treble, trái ở C3–G3 |
| ledger-low | 25 | Tay trái đọc C1–G1 dưới khuông bass, phải ở C4–G4 |
| dyad-dotted | 25 | Kết hợp hợp âm hai nốt G5 với đen chấm dôi + móc đơn G7 |
| dyad-tie | 25 | Kết hợp hợp âm hai nốt G5 với nối nốt từ nửa phách qua phách G7 |

Hai nhánh tổ hợp dùng vùng C4–G4 / C3–G3, tay phụ đơn âm chỉ vào đầu ô. Hai nhánh dòng phụ dùng nhịp cơ bản. Không gom toàn bộ kỹ năng khó vào một bài. Mỗi nhóm có 50 bài phải và 50 bài trái làm trọng tâm, luôn có nốt thật ở cả hai tay. Mỗi chuyển động không quá quãng năm; hợp âm có hai nốt, quãng ba đến năm, không tritone. Tất cả giọng C, 4/4.

Vùng xa là mục tiêu đọc ký âm cụ thể; bộ này **không phủ toàn bộ 88 phím**, không dùng ottava để giấu các dòng phụ, không thêm đổi khóa. Trong ABC, `c'` là C6, `g'` là G6; `C,,,` là C1, `G,,,` là G1. Số sau nốt là trường độ: `C,,,2` là C1 ngân hai phách. `[CE]` là hai nốt cùng đánh; `E/2-E2` có một lần đánh Mi rồi giữ qua dấu nối.

| Thư mục | Số lần đánh của cả hai tay |
|---|---:|
| n4 | 3–5 |
| n6 | 6–8 |
| n10 | 9–14 |
| n20 | 15–24 |
| n30 | 25–39 |
| n50 | 40–69 |
| n100 | 70–120 |

Mỗi phím trong hợp âm tính một lần, phần tiếp diễn tie không thêm lần đánh; nghỉ không tính. Q:1/4=60 là mốc tham chiếu có thể giảm khi tập, không phải yêu cầu tốc độ.

Mở file riêng hoặc bảy tập `books/` bằng trình đọc ABC hỗ trợ hai voice, `%%score`, hợp âm và tie. Mỗi tập có 100 tune; chọn tune tiếp theo nếu trình đọc chỉ hiện một bài. `index.tsv` liệt kê trọng tâm, thứ tự trong tập, nốt từng tay; `validation.json` có bằng chứng vùng nốt hoặc cả hai kỹ năng của tổ hợp.

Với nhánh dòng phụ, xem trước nốt mốc và khoảng di chuyển để giữ phách. Với tổ hợp, đọc rõ thời điểm nhả hợp âm và phần nối không đánh lại. Chọn bài chưa đọc khi đánh giá sight reading. Bộ có 100 dòng chủ đề với bảy phiên bản độ dài và các đoạn phát triển dùng chung, không phải 700 giai điệu độc lập. Tránh luyện bảy phiên bản cùng số nối tiếp để tự kiểm khả năng đọc lần đầu.

Trợ lý viết cao độ, trường độ, đoạn nhạc và chọn thứ tự cố định. Công cụ chỉ ghép, kiểm, đóng gói; không chọn nốt ngẫu nhiên hoặc chuyển vị. Đã đối chiếu ABC riêng và từng tune trong tập với MusicXML về nốt/nghỉ, octave, thời điểm, hợp âm, tie và hai khuông. Chưa có giáo viên duyệt độ khó, kiểm số ngón, nghiên cứu hiệu quả học hoặc duyệt hình trên mọi trình đọc ABC.
