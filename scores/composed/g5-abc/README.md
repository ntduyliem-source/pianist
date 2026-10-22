# 700 bài piano G5 — ABC văn bản

100 bài ở mỗi nhóm n4, n6, n10, n20, n30, n50, n100. Đây là G5 nội bộ của Pianist, không phải chứng nhận Grade 5 ABRSM.

| Nhánh | Mỗi nhóm | Trọng tâm |
|---|---:|---|
| offset | 50 | Hai tay đều có lần đánh riêng, có nốt ngân chồng lên lần đánh của tay kia |
| dyad | 50 | Một tay đọc hợp âm hai nốt rồi giai điệu quen; tay còn lại đơn âm |

Mỗi nhóm có 50 bài phải làm trọng tâm, 50 bài trái làm trọng tâm. Cả hai khuông đều có nốt thật. Vùng phải C4–G4, trái C3–G3; giọng C, nhịp 4/4, chuyển động tối đa quãng năm. Nhánh offset dùng đen, trắng và nghỉ đen đúng phách; không đưa đảo phách móc đơn vào G5. Hợp âm có hai nốt khác nhau, quãng ba đến năm, không tritone.

| Thư mục | Số lần đánh hai tay |
|---|---:|
| n4 | 3–5 |
| n6 | 6–8 |
| n10 | 9–14 |
| n20 | 15–24 |
| n30 | 25–39 |
| n50 | 40–69 |
| n100 | 70–120 |

Mỗi phím của hợp âm tính một lần; nghỉ không tính, nốt ngân tính một lần. Tên nhóm là khoảng số lần đánh, không phải số ô nhịp.

Mở một file trong các thư mục trên bằng trình đọc ABC hỗ trợ nhiều voice và `%%score`. Hoặc dùng bảy file trong `books/`: mỗi file có 100 bài, cách nhau bằng header `X:`; trình đọc chỉ hiện một bài thì chọn tune tiếp theo. `index.tsv` ghi thứ tự trong tập, trọng tâm, số nốt từng tay, nhịp và thời lượng. `validation.json` ghi bằng chứng kiểm từng bài.

Trong ABC, `C` là Đô giữa C4, `C,` là C3; số sau nốt là trường độ. `[CE]2` là Đô và Mi đánh cùng lúc, ngân hai phách đen. `[V:RH]` / `[V:LH]` chỉ khuông phải/trái. Mặc định Q:1/4=60 là 60 nốt đen/phút; điều chỉnh khi tập, không cần đạt tốc độ đó ngay.

Mỗi lần sight reading nên chọn bài chưa đọc, xem trước nhịp và vị trí rồi chơi liên tục ở tốc độ giữ được phách. Nếu học riêng một tay, vẫn giữ thông tin nhịp và thời điểm tay kia vào. Thứ tự tập đã xen các nhánh và giãn những mẫu gần nhau.

Trợ lý viết trực tiếp các đoạn ABC và chọn các đoạn cho từng bài. Bộ này có 100 dòng chủ đề, mỗi dòng có bảy phiên bản độ dài; nhiều đoạn phát triển và biến thể chuyển tay được dùng lại. Đây là 700 bản nhạc khác nội dung đầy đủ, không phải 700 giai điệu độc lập. Tránh luyện cả bảy phiên bản của cùng một số liên tiếp khi mục tiêu là đọc lần đầu.

Công cụ chỉ ghép các đoạn đã viết, thêm header, kiểm và đóng gói; không chọn nốt ngẫu nhiên hoặc tự chuyển vị. Đã đối chiếu ABC riêng và từng tune trong tập với MusicXML về cao độ, trường độ, nghỉ, hợp âm, hai khuông. Kiểm cấu trúc không thay thế giáo viên duyệt độ khó hoặc nghiên cứu hiệu quả học. Bộ này không quy định số ngón, pedal hay hóa biểu khác C.
