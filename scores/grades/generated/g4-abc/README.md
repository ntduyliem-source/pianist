# 700 bài đọc nhạc G4 bằng ABC

Bộ tiếp theo của [G1](../g1-abc/README.md), [G2](../g2-abc/README.md) và [G3](../g3-abc/README.md), gồm **700 bài piano hai khuông**, 100 bài mỗi khoảng nốt. G4 giới thiệu vị trí ký âm mới và âm vực rộng hơn, giữ nhịp/phối hợp quen. Mỗi file ABC chứa đầy đủ hai tay để học.

| Nhóm | Khoảng được nhận | Số nốt thực | Số bài | Tập ABC | Dài nhất ở 60 BPM |
|---|---:|---:|---:|---|---:|
| n4 | 3–5 | 3–5 | 100 | [Mở tập khoảng 4](books/g4-n4.abc) | 8 giây |
| n6 | 6–8 | 6–8 | 100 | [Mở tập khoảng 6](books/g4-n6.abc) | 8 giây |
| n10 | 9–14 | 9–14 | 100 | [Mở tập khoảng 10](books/g4-n10.abc) | 12 giây |
| n20 | 15–24 | 15–24 | 100 | [Mở tập khoảng 20](books/g4-n20.abc) | 18 giây |
| n30 | 25–39 | 26–38 | 100 | [Mở tập khoảng 30](books/g4-n30.abc) | 36 giây |
| n50 | 40–69 | 40–69 | 100 | [Mở tập khoảng 50](books/g4-n50.abc) | 54 giây |
| n100 | 70–120 | 70–120 | 100 | [Mở tập khoảng 100](books/g4-n100.abc) | 90 giây |

Bảy tập gộp tương ứng đúng 700 file riêng trong các thư mục n4…n100, không tính thêm bài. Thứ tự tập xen trọng tâm và vai tay, giãn những mẫu đọc liên quan. Số trong ID là định danh, không phải thứ tự khó tuyệt đối.

## Ba nhánh G4

Mỗi nhóm có **50 bài `upper`, 30 bài `lower`, 20 bài `span`**. Chú thích đầu file và [mục lục](index.tsv) ghi nhánh cùng tay trọng tâm.

| Nhánh | Khi tay phải là trọng tâm | Khi tay trái là trọng tâm | Cách luyện đọc |
|---|---|---|---|
| `upper` | G4–D5: `G A B c d` | G3–D4: `G, A, B, C D` | Nhận vị trí cao hơn vùng năm nốt cũ; mỗi bài có nốt mới thật |
| `lower` | A3–E4: `A, B, C D E` | A2–E3: `A,, B,, C, D, E,` | Nhận vị trí thấp hơn vùng cũ; mỗi bài có La hoặc Si phía dưới |
| `span` | C4–C5 | C3–C4 | Đọc đường đi liên tục phủ một quãng tám bằng các bước không quá quãng năm |

Ví dụ `C G c` đi C4 → G4 → C5: âm vực toàn mô-típ là quãng tám, từng bước lần lượt là quãng năm và quãng bốn. Các bài `span` có đường đi thật, không lấy hai nốt cách nhau quãng tám rồi nhảy thẳng. Quãng vẫn được kiểm qua nghỉ, vạch nhịp và chỗ nối đoạn.

Tay phụ giữ vùng G1 và chỉ lặp/bước liền. Hai vùng tay luôn tách nhau, tay trái thấp hơn tay phải; không trùng phím hoặc chéo vùng. Nhãn vị trí chỉ mô tả nốt viết, không chứng nhận số ngón hay thế tay tối ưu.

Giữ hóa biểu C và nhịp cơ bản 2/4, 3/4 hoặc 4/4: đen, trắng, nốt dài vừa ô và nghỉ cơ bản. Mỗi tay đơn âm, cả hai tay có nốt thật. Bộ này chưa đưa thêm móc đơn, hợp âm đồng thời, phối hợp độc lập, tie, đảo phách, đổi khóa/giọng, repeat hoặc pedal. G4 là thang nội bộ Pianist.

Mỗi nhóm có 30 bài phải dẫn (`R`), 30 trái dẫn (`L`), 25 đối đáp (`A`) và 15 cùng nhịp (`S`). `lead=RH/LH` chỉ tay mang trọng tâm mới. `A` trao lượt không chồng tiếng; `S` cùng thời điểm đánh và trường độ, tay phụ vẫn đơn giản. Nhánh span không nằm trong kiểu S của bộ này.

## Đọc đúng octave trong ABC

Với `L:1/4`, `C` là nốt Đô đen C4, `c` là Đô đen C5, `C,` là C3. **`A,` là A3 và `A,,` là A2**; clef=bass không tự hạ cao độ. Con số sau nốt là trường độ: `C4` trong ABC là một nốt Đô tròn ở C4, không phải cách ghi số octave.

`C2` là nốt trắng, `z` là lặng đen, `[V:RH]` là tay phải và `[V:LH]` là tay trái. Dòng `%` là chú thích. Mỗi cặp dòng viết tối đa bốn ô liên tiếp.

Số nốt tính theo lần đánh của cả hai tay: hai phím cùng lúc tính 2, một nốt giữ dài tính 1, nghỉ không tính. Chọn tập riêng một tay không đổi nhóm độ dài của bài hai tay. Tempo 60 BPM là mốc điều chỉnh được.

Nếu theo dõi lượt đọc đầu, chọn bài chưa tập và nghe mẫu sau lượt đó. Bộ có các bài đổi vai và dùng chung đoạn; gặp lại đoạn đã biết cần phân biệt với đọc nội dung hoàn toàn mới.

## Nội dung và kiểm tra

300 bài ngắn ghi trọn hai tay trong nguồn; 400 bài còn lại có trình tự riêng từ **209 đoạn ABC được sử dụng**. Bài n30/n50/n100 có hai, ba hoặc năm đoạn, gồm tương phản, trở lại và kết. Các biến thể dùng chung đoạn/chuyển vai được ghi rõ; 700 bài không tương đương 700 ý nhạc độc lập.

- 700 nội dung khác nhau, không trùng hoàn toàn với nhau hoặc với G1–G3; tổng 20.673 lần đánh.
- 1.400 lượt chuyển đổi đạt: từng file riêng và từng bài trong bảy tập. Đối chiếu cao độ thực, onset, trường độ, nghỉ và khuông; mọi bài có một part piano với hai khuông.
- Kiểm đủ phách, vùng theo tay/nhánh, quãng không quá năm, tay phụ quen, tách vùng hai tay và bằng chứng vị trí/span. Không dùng nghỉ hoặc chỗ ghép để che cú nhảy lớn.
- 461 dấu vết sau chuẩn hóa cao độ bắt đầu từng tay và chuyển vai; đây là các mẫu liên quan, không chứng nhận số ý nhạc độc lập. Không có hai mẫu chuẩn hóa giống nhau liền nhau trong tập.
- Bảy test hồi quy đạt, gồm 30 trường hợp nhạc cố ý sai bị từ chối. ID X duy nhất 2101–2800, nối tiếp ba bộ trước.

[JSON](validation.json) ghi số đếm, nguồn đoạn và bằng chứng nốt mới hoặc đường đi phủ quãng tám. Nhạc được AI biên soạn và kiểm cấu trúc; chưa có giáo viên duyệt, thử nghiệm hiệu quả học hoặc render từng bài trong native MuseScore.

Kiểm và đóng gói lại từ repository:

```powershell
python -X utf8 buildscripts/pianist/package-g4-abc.py --convert --books
python -X utf8 buildscripts/pianist/check-g4-abc.py
```
