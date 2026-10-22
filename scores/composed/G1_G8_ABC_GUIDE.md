# Piano sight reading G1–G8 — 5.600 bài ABC

Hoàn thành ngày 22/10/2026. Tám grade, mỗi grade 700 bài: 100 bài cho từng khoảng n4, n6, n10, n20, n30, n50, n100. Mỗi bài có hai khuông và nốt thật ở cả hai tay. Đây là grade nội bộ Pianist, không quy đổi cấp thi ABRSM.

| Bộ và hướng dẫn riêng | Bài | Trọng tâm |
|---|---:|---|
| [G1](g1-abc/README.md) | 700 | Nốt lặp, bước liền, nhịp và phối hợp cơ bản |
| [G2](g2-abc/README.md) | 700 | Quãng ba hoặc cặp móc đơn đúng phách, hai nhánh riêng |
| [G3](g3-abc/README.md) | 700 | Quãng bốn, năm và mẫu rải đơn âm |
| [G4](g4-abc/README.md) | 700 | Vùng nốt mới hoặc span quãng tám với bước nhảy tối đa quãng năm |
| [G5](g5-abc/README.md) | 700 | Hai tay độc lập hoặc hợp âm hai nốt |
| [G6](g6-abc/README.md) | 700 | Quãng sáu, bảy, tám theo họ/hướng, có nốt dẫn vào và đi ra |
| [G7](g7-abc/README.md) | 700 | Chấm dôi, nối qua phách, đảo phách, 6/8 — bốn nhánh riêng |
| [G8](g8-abc/README.md) | 700 | Dòng phụ xa hoặc hợp âm hai nốt kết hợp chấm dôi/nối qua phách |

| Nhóm | Số lần đánh của cả hai tay |
|---|---:|
| n4 | 3–5 |
| n6 | 6–8 |
| n10 | 9–14 |
| n20 | 15–24 |
| n30 | 25–39 |
| n50 | 40–69 |
| n100 | 70–120 |

Mỗi phím trong hợp âm là một lần đánh, phần tiếp diễn tie không thêm lần đánh; nghỉ không tính. Tên nhóm không phải số ô nhịp hay số nốt phải chính xác bằng nhãn.

Giải nén rồi mở file .abc bằng trình đọc ABC hỗ trợ nhiều voice, `%%score`, hợp âm, tie và độ dài phân số. Ví dụ `g7-abc/n20/g7-n20-026.abc`. File chỉ cần văn bản UTF-8, không cần chương trình sinh nhạc. Mỗi thư mục grade có bảy tập trong `books/`, mỗi tập 100 tune. Khi phần mềm chỉ hiện một bài, chọn tune tiếp theo hoặc dùng file riêng. Toàn bộ có 5.600 ABC riêng và 56 tập.

`index.tsv` của mỗi grade cho biết thứ tự trong tập, nhánh kỹ năng, số lần đánh từng tay và thời lượng. `validation.json` chứa kết quả máy kiểm, nhóm mẫu tương đồng và thông tin từng bài. X:1–5600 liên tục giữa tám bộ; các tune trong tập giữ ID của file riêng.

ABC dùng `C` = C4 (Đô giữa), `c` = C5, `C,` = C3; `c'` = C6, `C,,,` = C1. Số sau nốt là độ dài: với L:1/4, `C2` là hai phách đen. `[CE]` đánh Đô và Mi cùng lúc. `E/2-E2` đánh Mi móc đơn rồi giữ qua dấu nối, không đánh lại Mi trắng. `[V:RH]` và `[V:LH]` là hai khuông của cùng phần piano.

Mốc tempo phần lớn là 60 nốt đen/phút. Riêng G7 nhánh 6/8 dùng Q:3/8=60, tức 60 phách đen chấm dôi/phút; một ô có hai phách lớn. Có thể giảm tempo tùy khả năng. Nốt và ngữ cảnh quan trọng hơn việc cố đạt mốc này.

Chọn grade theo kỹ năng đang học, rồi chọn độ dài phù hợp. Đọc trước khóa, nhịp và vùng nốt; chơi liên tục ở tốc độ giữ được phách. Dùng bài chưa đọc khi đánh giá sight reading. Tập riêng từng tay vẫn là luyện cùng bài có nhãn độ dài tính cả hai tay.

Nhạc được trợ lý AI biên soạn bằng các đoạn cố định và trình tự được ghi trong nguồn; không dùng chọn nốt ngẫu nhiên. Các bộ có dùng chung motif, đoạn phát triển và biến thể chuyển tay. Riêng G5–G8, mỗi bộ có 100 dòng chủ đề với bảy phiên bản độ dài; tránh đọc cả bảy phiên bản cùng số nối tiếp khi muốn kiểm đọc lần đầu. 5.600 bản nhạc khác nội dung đầy đủ không có nghĩa là 5.600 giai điệu độc lập.

Mỗi bộ đã kiểm 700 ABC riêng và 700 tune trong tập qua ABC→MusicXML. Bốn bộ mới kiểm thêm hợp âm, tie, lưới phách và đơn vị tempo 6/8. Đây là xác nhận cấu trúc theo thiết kế, chưa phải giáo viên duyệt độ khó hoặc nghiên cứu hiệu quả học. Số lượng/grade/khoảng độ dài là lựa chọn thiết kế. Toàn bộ giữ giọng C; G8 vùng xa chỉ C6–G6/C1–G1, không phủ toàn bộ 88 phím. Không có số ngón/pedal hay kiểm hiển thị trên mọi trình đọc ABC.
