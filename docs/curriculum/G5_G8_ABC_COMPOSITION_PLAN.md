# Biên soạn tiếp G5–G8: 2.800 bài ABC

Yêu cầu ngày 22/10/2026: hoàn thành tới G8 sau bốn bộ G1–G4, mỗi grade 700 bài. Giữ bảy nhóm n4/n6/n10/n20/n30/n50/n100, 100 bài/nhóm, lần lượt 3–5/6–8/9–14/15–24/25–39/40–69/70–120 lần đánh cả hai tay. Hợp âm tính từng phím; tie chỉ tính đầu đánh, không tính nghỉ. Đây là ngân hàng ABC biên soạn theo yêu cầu người dùng, không phải chạy lại quy trình tuyển MXL từ corpus hay cập nhật thư viện web.

Theo [đặc tả hai khuông](GRAND_STAFF_BANK_PLAN.md), chọn các profile cụ thể sau. Tất cả bài đủ hai khuông, có nốt thật cả hai tay, giọng C. Grade là hệ nội bộ, không quy đổi cấp thi.

| Grade | Profile và phân bổ trong mỗi nhóm | Điều còn lại giữ quen |
|---|---|---|
| G5 | 50 offset, 50 dyad; mỗi nhánh 25 phải/25 trái | 4/4, nhịp cơ bản; phạm vi năm bậc, di chuyển tối đa P5; hợp âm chỉ ở nhánh dyad |
| G6 | m6/M6/m7/M7/P8 × lên/xuống: 10 mỗi họ/hướng, 5 phải/5 trái | Không hợp âm/tiết tấu mới. Quãng lớn đúng họ/hướng có nốt trước và sau; các chuyển động khác tối đa P5 |
| G7 | 25 dotted, 25 tie, 25 sync, 25 compound | Phạm vi năm bậc, tối đa P5, hai tay đơn âm; tay phụ vào đầu ô. Không trộn các họ nhịp khó |
| G8 | 25 ledger-high, 25 ledger-low, 25 dyad-dotted, 25 dyad-tie | Vùng xa chỉ với nhịp cơ bản; tổ hợp ở vùng quen, chỉ kết hợp hai kỹ năng được nêu |

G6 giới hạn phải C4–E5 / trái C3–E4 khi dẫn. Khi trái dẫn, tay phải ở G4–C5 để tránh trùng vùng. G8 vùng xa là C6–G6 ở tay phải hoặc C1–G1 ở tay trái; không tuyên bố phủ 88 phím. Luôn kiểm toàn vùng trái thấp hơn phải. Profile G6 được kiểm cả khoảng diatonic, bán cung, hướng và bốn nốt ngữ cảnh, kể cả chỗ nối đoạn. Không suy ra số ngón hoặc tốc độ phù hợp từ độ rộng quãng.

G7 dotted yêu cầu 3/2 + 1/2 đơn vị đen đúng pha; tie bắt đầu ở nửa phách, nối cùng cao độ qua mốc phách; sync có 1/2 + 1 + 1/2 với nốt đen bắt đầu lệch nửa phách. Compound là M:6/8, chia nhóm 3 móc đơn, Q:3/8=60. L:1/4 được giữ trong file, vì thế trường độ được kiểm bằng phân số đen rồi đổi sang phách lớn khi tính thời lượng. G8 tổ hợp phải có bằng chứng cả dyad lẫn nhịp đã nêu.

Trợ lý viết trực tiếp các đoạn ABC trong `buildscripts/pianist/compositions/g5` đến `g8`. Mỗi grade có:

- `cells.txt`: cao độ, độ dài, nghỉ, hợp âm và tie viết cố định cho cả hai tay.
- `studies.txt`: 100 dòng, mỗi dòng chọn rõ đoạn mở đầu s, câu đáp a, câu kết c và năm đoạn phát triển p/q/r/t/u.
- `forms.txt`: bảy trình tự cố định: s; s c; s a c; s p; s p q; s p q r; s p q r t u.

Đây là 100 dòng chủ đề với bảy phiên bản độ dài, có biến thể chuyển tay và đoạn dùng chung. Không gọi 700 bài là 700 ý nhạc độc lập. Chọn biến thể theo nhu cầu độ dài; để đánh giá đọc lần đầu, không luyện liên tiếp các phiên bản cùng số. Tập 100 tune được xếp xen profile/tay và giãn mẫu tương đồng.

`package-advanced-abc.py` chỉ thay các tên đoạn bằng nội dung đã viết, thêm header, kiểm và đóng gói; không chọn cao độ, chuyển vị, sửa nhạc hay tạo nhạc ngẫu nhiên. X tiếp nối: G5 2801–3500, G6 3501–4200, G7 4201–4900, G8 4901–5600. Mỗi bài không quá hai phút ở tempo tham chiếu 60 phách/phút; tempo chỉ là mốc tính, không phải chứng nhận sẵn sàng biểu diễn.

Đối chiếu 100% ABC riêng và từng tune trong tập qua bộ chuyển ABC→MusicXML của repo. So độc lập từng sự kiện viết (onset, duration, MIDI, staff, chord, tie hai đầu), sau đó gộp tie và kiểm số lần đánh. Kiểm đúng nhịp, beat unit 6/8, phần piano hai khuông, không trùng nội dung đầy đủ trong/cross-grade, ID, chỉ mục, ZIP, liên kết tài liệu. Thêm ca lỗi cố ý cho các quy tắc mới. Không sửa importer của app hoặc thay kho MXL đang phục vụ trong yêu cầu này.

Kết quả sẽ ghi ở [G5_G8_ABC_RESULTS.md](G5_G8_ABC_RESULTS.md). Các giới hạn sư phạm: số grade/số bài/khoảng độ dài là quyết định thiết kế, không phải liều tập được khoa học xác nhận. Kiểm máy xác nhận cấu trúc và giới hạn đã viết, chưa thay cho giáo viên duyệt hoặc nghiên cứu hiệu quả học.
