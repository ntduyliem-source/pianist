# Bộ 700 bài đọc nhạc G1 bằng ABC

Bộ bài do trợ lý AI biên soạn trực tiếp, gồm **700 bài hai khuông piano**, 100 bài mỗi khoảng nốt. Các đoạn cao độ, tiết tấu và hai tay được viết sẵn; công cụ đóng gói giữ nguyên các đoạn đó và kiểm cấu trúc.

Mở một tập dưới đây để chọn trong 100 bài, hoặc mở file riêng trong thư mục tương ứng. Tập gộp xen các kiểu phối hợp và giãn những bài cùng mẫu đọc. Số trong ID là định danh, không phải thứ tự khó tuyệt đối.

| Khoảng nốt | Khoảng được nhận | Số nốt thực trong bộ | Số bài | Tập ABC |
|---|---:|---:|---:|---|
| Khoảng 4 | 3–5 | 3–5 | 100 | [Mở tập khoảng 4](books/g1-n4.abc) |
| Khoảng 6 | 6–8 | 6–8 | 100 | [Mở tập khoảng 6](books/g1-n6.abc) |
| Khoảng 10 | 9–14 | 9–14 | 100 | [Mở tập khoảng 10](books/g1-n10.abc) |
| Khoảng 20 | 15–24 | 15–24 | 100 | [Mở tập khoảng 20](books/g1-n20.abc) |
| Khoảng 30 | 25–39 | 25–39 | 100 | [Mở tập khoảng 30](books/g1-n30.abc) |
| Khoảng 50 | 40–69 | 41–69 | 100 | [Mở tập khoảng 50](books/g1-n50.abc) |
| Khoảng 100 | 70–120 | 70–120 | 100 | [Mở tập khoảng 100](books/g1-n100.abc) |

Nốt được đếm theo từng lần đánh phím ở cả hai tay. Hai tay cùng đánh hai phím tính 2; giữ một nốt dài tính 1; nghỉ không tính. Nhóm n100 có thời lượng tối đa 96 giây ở mốc 60 BPM của file.

Mỗi nhóm gồm 30 bài tay phải dẫn (`R`), 30 bài tay trái dẫn (`L`), 25 bài đối đáp (`A`) và 15 bài cùng nhịp (`S`). Mỗi bài luôn có nốt thực ở cả hai tay; khi tập riêng một tay, nội dung của bài vẫn giữ hai khuông.

## Nội dung G1

Giọng C major; tay phải C4–G4, tay trái C3–G3. Mỗi tay chỉ lặp nốt hoặc đi liền bậc, kể cả ở chỗ nối câu và qua nghỉ. Dùng nhịp 2/4, 3/4 hoặc 4/4, nốt đen/trắng và nốt dài trọn ô, nghỉ cơ bản. Không có móc đơn, hợp âm trong một tay, đảo phách, tie, repeat hoặc pedal.

Độ dài tăng để luyện đọc liên tục; yêu cầu cao độ và nhịp vẫn là G1 nội bộ Pianist. Các bài 3–5 nốt là mô-típ luyện đọc rất ngắn. Bài dài có nhiều câu và biến thể; có những cặp chuyển vai để luyện cùng mẫu bằng tay còn lại.

## Cách đọc file

Với `L:1/4`, `C` là nốt Đô đen ở C4, `C2` là Đô trắng, `C4` là Đô tròn; `C,` là C3; `z` là lặng đen. Dòng `[V:RH]` thuộc tay phải, `[V:LH]` thuộc tay trái. Mỗi cặp dòng hiển thị tối đa bốn ô liên tiếp. Chú thích `%` ghi số nốt, kiểu phối hợp và họ mẫu; không cần chơi những dòng chú thích.

Giữ nhịp thoải mái khi đọc. Nếu muốn theo dõi lần đọc đầu, chọn bài chưa tập và nghe mẫu sau lượt đọc đó. Mốc 60 BPM trong file là điểm khởi đầu có thể điều chỉnh.

## Kết quả kiểm

- 700 file riêng và 7 tập, mỗi tập chứa 100 bài; ID X duy nhất từ 1 đến 700.
- 1.400 lượt chuyển đổi bằng abc2xml: 700 file riêng và từng bài trong 7 tập. Không có chẩn đoán lỗi/cảnh báo; đối chiếu cao độ, thời điểm, trường độ và khuông với bản biên soạn.
- Mọi bài đủ phách mỗi tay, đúng vùng G1, đúng khoảng nốt, có bước liền và có nốt ở hai tay. Các kiểu đối đáp/cùng nhịp được kiểm theo thời gian thực của nốt.
- 700 nội dung khác nhau; 466 nhóm dấu vết sau chuẩn hóa cao độ bắt đầu từng tay và chuyển vai. Con số này mô tả các mẫu liên quan, không phải 466 ý nhạc độc lập được chuyên gia xác nhận.
- Không có bài dài nào chỉ là một vòng lặp nguyên xi một hoặc hai ô. Các bài cùng mẫu chuẩn hóa không nằm liền nhau trong tập gộp.

Đây là nhạc do AI biên soạn và kiểm; chưa có đánh giá giáo viên hoặc thử nghiệm hiệu quả học. Kiểm cấu trúc không thay cho đánh giá âm nhạc của người dạy.

[Mục lục từng bài](index.tsv) chứa số nốt mỗi tay, vị trí trong tập, nhịp, độ dài và họ mẫu. [Báo cáo kiểm đầy đủ](validation.json) ghi số đếm, hash và các nhóm biến thể. Bảy tập ABC chỉ là bản gộp của 700 file riêng, không tính thêm bài.

Để kiểm và đóng gói lại từ bản biên soạn trong repository:

```powershell
python -X utf8 buildscripts/pianist/package-g1-abc.py --convert --books
```
