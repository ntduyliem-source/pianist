# Ví dụ bài tập từ đề xuất 96 bài

> Bộ này được giữ làm ví dụ và fixture; không còn là chuỗi bài bắt buộc. Thiết kế hiện hành là [grade với quiz liên tục](GRADE_DESIGN.md). Các mức BPM và profile dưới đây thuộc đề xuất cũ, chưa áp dụng cho grade mới.

Đây là 96 bài kỹ năng được soạn cho lộ trình, không phải bài trích từ nghiên cứu hay giáo trình có sẵn. Bài K001–K012 đã có MXL mẫu trong `starter-scores`; các bài còn lại là đặc tả để soạn và duyệt bản nhạc. Các trích đoạn nhạc thật nằm trong REAL_EXCERPTS.md và có nguồn riêng.

C4 là Đô giữa, MIDI 60. P = tay phải; T = tay trái. `q` = đen, `h` = trắng, `w` = tròn, `e` = móc đơn, `s` = móc kép; dấu chấm tăng thêm nửa trường độ; `R` = lặng. Dấu `|` ngăn ô, `~` nối cùng cao độ, `[C4,E4]` là hai nốt đồng thời. `×4` là lặp toàn bộ cụm bốn lần. Mọi số BPM dùng nốt đen, trừ chỗ ghi rõ **chấm dôi** trong 6/8. Khóa Fa dùng cho T, khóa Sol cho P, trừ bản khắc nhạc yêu cầu đổi khóa có ghi rõ.

Mỗi bài: xem sheet và đặt tay → tập ở tốc độ đầu → sửa riêng điểm sai → thử tốc độ đích. Không tăng tempo giữa lượt được chấm. Qua bài theo profile A/B/C/D trong STRATEGY.md. Khi bài lặp lại một mẫu, kết quả chỉ chứng minh đã luyện được mẫu đó; khả năng đọc mới được kiểm tra ở bài chuyển giao riêng.

Với hai tay, mỗi dòng lấp đầy cùng số ô. Một tay nghỉ khi bài chỉ yêu cầu tay còn lại. Có thể chọn ngón phù hợp bàn tay; MIDI không chứng nhận số ngón. Các bài có quãng rộng yêu cầu chuyển cả bàn tay, không giữ các nốt xa nhau cùng lúc.


## Giai đoạn 0 Giữ mạch nhịp khi việc đọc còn rất nhẹ

12 bài kỹ năng; profile **A**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K001 Một phím tay phải

**Tay:** P. **Tempo:** 60 → 60. **Qua bài:** A.

C4q C4q C4q C4q; 8 ô, 4/4

**Mục đích:** Tách việc giữ nhịp khỏi việc tìm nốt.

### K002 Một phím tay trái

**Tay:** T. **Tempo:** 60 → 60. **Qua bài:** A.

C3q C3q C3q C3q; 8 ô, 4/4

**Mục đích:** Kiểm tra tay trái độc lập ở cùng nhịp.

### K003 Đánh và nghỉ luân phiên

**Tay:** P. **Tempo:** 60 → 60. **Qua bài:** A.

C4q Rq C4q Rq; 8 ô, 4/4

**Mục đích:** Giữ phách trong khoảng không phát âm.

### K004 Nốt trắng

**Tay:** P. **Tempo:** 60 → 60. **Qua bài:** A.

C4h C4h; 8 ô, 4/4

**Mục đích:** Đếm hai phách cho một lần nhấn, không tự tăng tốc.

### K005 Đen và trắng

**Tay:** P. **Tempo:** 60 → 66. **Qua bài:** A.

C4q C4q C4h | C4h C4q C4q; cụm 2 ô × 4, 4/4

**Mục đích:** Đổi mật độ nốt mà không đổi phách.

### K006 Nhóm ba phách

**Tay:** P. **Tempo:** 60 → 66. **Qua bài:** A.

C4q C4q C4q; 8 ô, 3/4

**Mục đích:** Phân biệt phách và độ dài ô nhịp.

### K007 Vào đúng sau dấu lặng

**Tay:** T. **Tempo:** 60 → 66. **Qua bài:** A.

C3q Rq; 16 ô, 2/4

**Mục đích:** Tự giữ phách nghỉ trước lần nhấn kế tiếp.

### K008 Đổi hai nốt tay phải

**Tay:** P. **Tempo:** 60 → 66. **Qua bài:** A.

C4q D4q C4q D4q; 8 ô, 4/4

**Mục đích:** Thêm lựa chọn cao độ nhỏ vào nhiệm vụ nhịp.

### K009 Đổi hai nốt tay trái

**Tay:** T. **Tempo:** 60 → 66. **Qua bài:** A.

C3q D3q C3q D3q; 8 ô, 4/4

**Mục đích:** Tay trái đổi phím mà không kéo chậm phách.

### K010 Trở lại sau một ô nghỉ

**Tay:** P. **Tempo:** 60 → 66. **Qua bài:** A.

Ô 1–3 và 5–8: C4q C4q C4q C4q. Ô 4: Rw. Nhịp 4/4

**Mục đích:** Giữ vị trí trong bài khi có bốn phách im lặng.

### K011 Giữ nhịp khi tắt click

**Tay:** P. **Tempo:** 60 → 60. **Qua bài:** A.

C4q C4q C4q C4q; 8 ô, 4/4; count-in 4 phách, metronome tắt trong bài

**Mục đích:** Kiểm tra duy trì nhịp nội tại ở nhiệm vụ dễ.

### K012 Ghép nhịp và ba nốt

**Tay:** P. **Tempo:** 60 → 66. **Qua bài:** A.

C4q D4q C4h | D4h C4q Rq | E4q D4q C4q Rq | C4h C4h | C4q Rq D4q Rq | E4h D4h | Rq C4q D4q E4q | C4h Rh; 8 ô, 4/4

**Mục đích:** Đọc một chuỗi ngắn có thay đổi nhưng vẫn chơi đến hết.

## Giai đoạn 1 Đọc quan hệ nốt quanh các mốc

12 bài kỹ năng; profile **A**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K013 Ba nốt lên xuống tay phải

**Tay:** P. **Tempo:** 60 → 72. **Qua bài:** A.

C4q D4q E4h | E4q D4q C4h; × 4, 4/4

**Mục đích:** Đọc chiều đi và bậc liền.

### K014 Ba nốt lên xuống tay trái

**Tay:** T. **Tempo:** 60 → 72. **Qua bài:** A.

C3q D3q E3h | E3q D3q C3h; × 4, 4/4

**Mục đích:** Đọc khóa Fa bằng quan hệ nốt.

### K015 Mốc Sol tay phải

**Tay:** P. **Tempo:** 60 → 72. **Qua bài:** A.

G4q A4q B4h | B4q A4q G4h; × 4, 4/4

**Mục đích:** Tạo mốc thứ hai ngoài Đô giữa.

### K016 Mốc Fa tay trái

**Tay:** T. **Tempo:** 60 → 72. **Qua bài:** A.

F3q G3q A3h | A3q G3q F3h; × 4, 4/4

**Mục đích:** Tạo mốc Fa trong khóa Fa.

### K017 Bậc liền trong năm nốt phải

**Tay:** P. **Tempo:** 60 → 72. **Qua bài:** A.

C4q D4q E4q F4q | G4q F4q E4q D4q; × 4, 4/4

**Mục đích:** Nhìn cụm năm nốt, giữ tay ổn định.

### K018 Bậc liền trong năm nốt trái

**Tay:** T. **Tempo:** 60 → 72. **Qua bài:** A.

C3q D3q E3q F3q | G3q F3q E3q D3q; × 4, 4/4

**Mục đích:** Độc lập đọc và vận động năm ngón tay trái.

### K019 Quãng ba tay phải

**Tay:** P. **Tempo:** 60 → 72. **Qua bài:** A.

C4q E4q D4q F4q | E4q G4q E4q C4q; × 4, 4/4

**Mục đích:** Phân biệt bước liền với bỏ một bậc.

### K020 Quãng ba tay trái

**Tay:** T. **Tempo:** 60 → 72. **Qua bài:** A.

C3q E3q D3q F3q | E3q G3q E3q C3q; × 4, 4/4

**Mục đích:** Đọc hình quãng trong khóa Fa.

### K021 Nốt lặp xen bậc liền

**Tay:** P. **Tempo:** 60 → 72. **Qua bài:** A.

E4q E4q F4q E4q | D4q D4q C4h; × 4, 4/4

**Mục đích:** Nhận nốt lặp để giảm số quyết định.

### K022 Hai phím đen

**Tay:** P. **Tempo:** 56 → 66. **Qua bài:** A.

C#4q D#4q C#4h | D#4q C#4q D#4h; × 4, 4/4; hóa biểu 0, ghi dấu hóa tạm

**Mục đích:** Gắn ký hiệu thăng với cụm hai phím đen.

### K023 Ba phím đen

**Tay:** P. **Tempo:** 56 → 66. **Qua bài:** A.

F#4q G#4q A#4h | A#4q G#4q F#4h; × 4, 4/4; hóa biểu 0

**Mục đích:** Nhận vị trí trong cụm ba phím đen.

### K024 Chuyển dòng khóa Sol và Fa

**Tay:** P rồi T. **Tempo:** 60 → 72. **Qua bài:** A.

Ô 1–4: dùng bài 017; ô 5–8: dùng bài 018. Tay còn lại nghỉ; 4/4

**Mục đích:** Chuyển cách đọc giữa hai khóa, chưa cần hai tay đồng thời.

## Giai đoạn 2 Chia phách và đọc trường độ

12 bài kỹ năng; profile **B**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K025 Cặp móc đơn trên một phím

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** B.

C4e C4e C4q C4h; 8 ô, 4/4

**Mục đích:** Giữ hai phần bằng nhau của một phách.

### K026 Móc đơn đổi hai nốt

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** B.

C4e D4e E4q D4q C4q; 8 ô, 4/4

**Mục đích:** Thêm cao độ vào nhịp chia đôi.

### K027 Móc đơn tay trái

**Tay:** T. **Tempo:** 56 → 72. **Qua bài:** B.

C3e D3e E3q D3q C3q; 8 ô, 4/4

**Mục đích:** Đọc móc đơn trong khóa Fa.

### K028 Lặng ở nửa phách đầu

**Tay:** P. **Tempo:** 56 → 66. **Qua bài:** B.

Re C4e D4q E4h; 8 ô, 4/4

**Mục đích:** Vào nốt sau phách chính mà không đổi tốc độ.

### K029 Lặng ở nửa phách sau

**Tay:** P. **Tempo:** 56 → 66. **Qua bài:** B.

C4e Re D4q E4h; 8 ô, 4/4

**Mục đích:** Giữ ngắn một nốt và đếm phần còn lại.

### K030 Đen chấm dôi và móc đơn

**Tay:** P. **Tempo:** 56 → 66. **Qua bài:** B.

C4q. D4e E4h; 8 ô, 4/4

**Mục đích:** Phân biệt tỉ lệ 3:1 với hai nốt đều.

### K031 Dấu nối cùng ô

**Tay:** P. **Tempo:** 56 → 66. **Qua bài:** B.

C4q~C4e D4e E4h; 8 ô, 4/4

**Mục đích:** Không đánh lại nốt được nối; đối chiếu trường độ với bài 030.

### K032 Dấu nối qua vạch nhịp

**Tay:** P. **Tempo:** 56 → 66. **Qua bài:** B.

Rh C4h~ | C4q D4q E4h; × 4, 4/4

**Mục đích:** Giữ qua phách mạnh mà không nhấn lại.

### K033 Trường độ trắng và lặng

**Tay:** T. **Tempo:** 56 → 66. **Qua bài:** B.

C3h Rh | D3q Rq E3h; × 4, 4/4

**Mục đích:** Kết thúc tiếng đúng chỗ; bật đánh giá trường độ.

### K034 Nhịp ba có móc đơn

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** B.

C4q D4e E4e F4q | E4q D4q C4q; × 4, 3/4

**Mục đích:** Giữ nhóm ba khi mật độ nốt thay đổi.

### K035 Câu có lấy đà viết đủ ô

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** B.

Rh Rq C4q | D4q E4q F4h | E4q D4q C4h | C4h Rh; × 2, 4/4

**Mục đích:** Vào trước ô chính; không phải bắt đầu bài ở phách 1 bằng một nốt.

### K036 Trộn bốn hình nhịp

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** B.

C4q D4q E4h | E4e D4e C4q Rh | Rq C4q D4q E4q | C4q. D4e E4h; × 2, 4/4

**Mục đích:** Chuyển hình nhịp theo sheet, không giữ một pattern máy móc.

## Giai đoạn 3 Ghép hai tay mà vẫn giữ phách

12 bài kỹ năng; profile **B**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K037 Hai tay cùng lúc trên nốt đơn

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4q D4q E4q D4q. T: C3q D3q E3q D3q. 8 ô, 4/4

**Mục đích:** Căn hai tay ở cùng onset.

### K038 Hai tay đi ngược chiều

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4q D4q E4q F4q | G4q F4q E4q D4q. T: G3q F3q E3q D3q | C3q D3q E3q F3q. × 4, 4/4

**Mục đích:** Chuyển từ đối xứng không gian sang đọc hai dòng.

### K039 Tay trái giữ tròn

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4q D4q E4q D4q. T: C3w. 8 ô, 4/4

**Mục đích:** Một tay giữ khi tay kia tiếp tục.

### K040 Tay trái giữ trắng

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4q D4q E4q D4q. T: C3h G2h. 8 ô, 4/4

**Mục đích:** Đọc hai tốc độ hoạt động.

### K041 Tay phải giữ, tay trái chuyển

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: E4w. T: C3q D3q E3q D3q. 8 ô, 4/4

**Mục đích:** Đảo vai trò để tránh tay trái chỉ biết đi theo.

### K042 Đối đáp hai phách

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4q D4q Rh | E4q D4q Rh. T: Rh C3q D3q | Rh E3q C3q. × 4, 4/4

**Mục đích:** Chuyển lượt tay không tạo khoảng dừng ngoài bản nhạc.

### K043 Lặng một tay, tay kia đi tiếp

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4q Rq E4q Rq. T: C3q D3q E3q D3q. 8 ô, 4/4

**Mục đích:** Không để dấu lặng tay phải làm dừng tay trái.

### K044 Móc đơn phải trên bass tròn

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4e D4e E4q D4q C4q. T: C3w. 8 ô, 4/4

**Mục đích:** Giữ bass ổn định khi tay phải chia phách.

### K045 Móc đơn trái trên nốt phải giữ

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: E4w. T: C3e D3e E3q D3q C3q. 8 ô, 4/4

**Mục đích:** Tay trái có nhiệm vụ chia phách riêng.

### K046 Hai tay trong nhịp ba

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: C4q D4q E4q | E4q D4q C4q. T: C3h. | G2h. × 4, 3/4

**Mục đích:** Đọc cả hai tay trong ba phách.

### K047 Hai dòng có hình khác nhau

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** B.

P: E4h D4q C4q | D4q E4q C4h. T: C3q G2q C3h | G2h C3q G2q. × 4, 4/4

**Mục đích:** Theo dõi các lần bắt đầu không luôn trùng nhau.

### K048 Hai tay khi không có click

**Tay:** Cả hai. **Tempo:** 60 → 60. **Qua bài:** B.

Nội dung bài 039; 8 ô, 4/4; count-in 4, metronome tắt

**Mục đích:** Giữ phách mà không phụ thuộc hoàn toàn vào click.

## Giai đoạn 4 Hóa biểu và cụm hòa âm cơ bản

12 bài kỹ năng; profile **C**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K049 Năm nốt Sol trưởng

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu G: G4q A4q B4q C5q | D5q C5q B4q A4q; × 4, 4/4

**Mục đích:** Đọc trong vị trí mới của giọng Sol.

### K050 Fa thăng trong Sol trưởng

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu G: D4q E4q F#4q G4q | G4q F#4q E4q D4q; × 4, 4/4

**Mục đích:** Thực hiện F# từ hóa biểu, không nhờ dấu hóa ở từng nốt.

### K051 Si giáng trong Fa trưởng

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu F: F4q G4q A4q Bb4q | C5q Bb4q A4q G4q; × 4, 4/4

**Mục đích:** Đọc phím đen từ hóa biểu giáng.

### K052 Tay trái trong Fa trưởng

**Tay:** T. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu F: F3q G3q A3q Bb3q | C4q Bb3q A3q G3q; × 4, 4/4

**Mục đích:** Chuyển kiến thức hóa biểu sang khóa Fa.

### K053 Rê trưởng

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu D: D4q E4q F#4q G4q | A4q G4q F#4q E4q; × 4, 4/4

**Mục đích:** Đọc hai dấu thăng ở vị trí năm ngón.

### K054 Si giáng trưởng

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu Bb: Bb3q C4q D4q Eb4q | F4q Eb4q D4q C4q; × 4, 4/4

**Mục đích:** Đọc hai dấu giáng mà không đếm lại từ Đô.

### K055 La thứ tự nhiên

**Tay:** T. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu 0: A2q B2q C3q D3q | E3q D3q C3q B2q; × 4, 4/4

**Mục đích:** Phân biệt hình ngón của giọng thứ với trưởng.

### K056 Rê thứ và Đô thăng tạm

**Tay:** P. **Tempo:** 56 → 72. **Qua bài:** C.

Hóa biểu Dm: D4q E4q F4q G4q | A4q G4q F4q E4q | D4h C#4q D4q | F4q E4q D4h; × 2, 4/4

**Mục đích:** Đọc dấu hóa ngoài hóa biểu.

### K057 Hai nốt đồng thời

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

[C4,E4]h [D4,F4]h | [E4,G4]h [C4,E4]h; × 4, 4/4

**Mục đích:** Đọc một hình quãng thay vì dò từng phím.

### K058 Hai nốt tay trái

**Tay:** T. **Tempo:** 52 → 66. **Qua bài:** C.

[C3,E3]h [D3,F3]h | [E3,G3]h [C3,E3]h; × 4, 4/4

**Mục đích:** Nhận quãng hòa âm trong khóa Fa.

### K059 Ba nốt trong một quãng năm

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

[C4,E4,G4]h Rh | [F4,A4,C5]h Rh | [G4,B4,D5]h Rh | [C4,E4,G4]h Rh; × 2, 4/4

**Mục đích:** Đọc hợp âm; có hai phách nghỉ để chuyển cả bàn tay.

### K060 Đảo hợp âm nhỏ

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

[C4,E4,G4]h Rh | [E4,G4,C5]h Rh | [G3,C4,E4]h Rh | [C4,E4,G4]h Rh; × 2, 4/4

**Mục đích:** Nhận cùng một hợp âm ở dạng đảo; quãng rộng nhất chín bán âm, chọn bài thay thế nếu không vừa tay.

## Giai đoạn 5 Dịch vị trí tay và đọc nhiều vùng đàn

12 bài kỹ năng; profile **C**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K061 Hai vị trí Đô và Sol tay phải

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

C4q D4q E4q Rq | G4q A4q B4q Rq; × 4, 4/4

**Mục đích:** Nhấc và đặt tay trong phách nghỉ.

### K062 Hai vị trí Đô và Sol tay trái

**Tay:** T. **Tempo:** 52 → 66. **Qua bài:** C.

C3q D3q E3q Rq | G2q A2q B2q Rq; × 4, 4/4

**Mục đích:** Di chuyển tay trái mà vẫn biết phách.

### K063 Đổi quãng tám tay phải

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

C4h Rh | C5h Rh | G4h Rh | G5h Rh; × 2, 4/4

**Mục đích:** Dùng cùng tên nốt ở hai vùng, không yêu cầu giãn quãng tám.

### K064 Đổi quãng tám tay trái

**Tay:** T. **Tempo:** 52 → 66. **Qua bài:** C.

C3h Rh | C2h Rh | G2h Rh | G3h Rh; × 2, 4/4

**Mục đích:** Định vị bass thấp bằng di chuyển bàn tay.

### K065 Một quãng tám có điểm chuyển tay

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

C4q D4q E4q Rq | F4q G4q A4q Rq | B4q C5q B4q Rq | A4q G4q F4q Rq; × 2, 4/4

**Mục đích:** Chia đường dài thành các nhóm nhỏ có thời gian chuyển.

### K066 Giảm thời gian chuyển tay

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

C4e D4e E4q Rq G4q | A4e B4e C5q Rq G4q; × 4, 4/4

**Mục đích:** Chuẩn bị đích đến trong lúc còn thời gian.

### K067 Dòng phụ phía trên

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

A5q G5q F5q E5q | F5q G5q A5h; × 4, 4/4

**Mục đích:** Đọc vùng cao hơn khuôn nhạc quen.

### K068 Dòng phụ phía dưới

**Tay:** T. **Tempo:** 52 → 66. **Qua bài:** C.

E2q F2q G2q A2q | G2q F2q E2h; × 4, 4/4

**Mục đích:** Đọc bass thấp hơn vùng quen.

### K069 Cụm phím đen ở hai quãng tám

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

C#4q D#4q Rh | C#5q D#5q Rh | F#4q G#4q A#4h | F#5q G#5q A#5h; × 2, 4/4

**Mục đích:** Chuyển mốc cụm hai và ba phím đen giữa các vùng.

### K070 Hai tay đổi vùng riêng

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** C.

Ô lẻ P: C4q D4q E4h; T: C3h Rh. Ô chẵn P: G4q A4q B4h; T: G2h Rh. 8 ô, 4/4

**Mục đích:** Đọc đích đến riêng cho từng tay.

### K071 Quãng nhảy nối tiếp có nghỉ

**Tay:** T. **Tempo:** 52 → 66. **Qua bài:** C.

C2q Rq G2q Rq | D2q Rq A2q Rq | E2q Rq B2q Rq | F2q Rq C3q Rq; × 2, 4/4

**Mục đích:** Luyện root và fifth ở bass mà không giữ tay căng.

### K072 Đường di chuyển không theo thang âm

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** C.

C4h Rh | G5h Rh | E4h Rh | C6h Rh | A4h Rh | F5h Rh | D4h Rh | B4h Rh; 8 ô, 4/4

**Mục đích:** Đọc đích không dự đoán được chỉ từ chiều đi.

## Giai đoạn 6 Pattern đệm và nhịp trong câu nhạc

12 bài kỹ năng; profile **D**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K073 Bass một nốt dưới giai điệu

**Tay:** Cả hai. **Tempo:** 56 → 72. **Qua bài:** D.

4 ô P: E4q G4q E4h | F4q A4q F4h | G4q B4q G4h | E4q D4q C4h. T: C3w | F2w | G2w | C3w. × 2, 4/4

**Mục đích:** Ghép giai điệu và đổi hòa âm ở đầu ô.

### K074 Bass root và fifth

**Tay:** Cả hai. **Tempo:** 56 → 72. **Qua bài:** D.

P như 073. T: C3h G2h | F2h C3h | G2h D3h | C3h G2h. × 2, 4/4

**Mục đích:** Giữ hai điểm bass đều trong mỗi ô.

### K075 Hợp âm rải đều nốt đen

**Tay:** T. **Tempo:** 56 → 72. **Qua bài:** D.

C3q E3q G3q E3q | F2q A2q C3q A2q | G2q B2q D3q B2q | C3q E3q G3q E3q; × 2, 4/4

**Mục đích:** Đọc các nốt hợp âm theo thứ tự thời gian.

### K076 Alberti đơn giản

**Tay:** T. **Tempo:** 56 → 72. **Qua bài:** D.

C3q G3q E3q G3q | F2q C3q A2q C3q | G2q D3q B2q D3q | C3q G3q E3q G3q; × 2, 4/4

**Mục đích:** Nhận thứ tự thấp cao giữa cao thường gặp trong đệm cổ điển.

### K077 Alberti dưới nốt phải giữ

**Tay:** Cả hai. **Tempo:** 56 → 72. **Qua bài:** D.

T như 076. P: E4w | F4w | G4w | E4w. × 2, 4/4

**Mục đích:** Ổn định pattern khi tay phải có nhiệm vụ riêng.

### K078 Đệm nhịp ba

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** D.

T: C3q [E3,G3]q [E3,G3]q | G2q [B2,D3]q [B2,D3]q. P: E4h. | D4h. × 4, 3/4

**Mục đích:** Phân biệt bass ở phách 1 với hợp âm ở phách 2 và 3.

### K079 Rải nhịp sáu tám một tay

**Tay:** T. **Tempo:** chấm dôi 44 → 56. **Qua bài:** D.

C3e E3e G3e E3e G3e E3e | G2e B2e D3e B2e D3e B2e; × 4, 6/8

**Mục đích:** Nghe và đọc hai nhóm ba móc đơn.

### K080 Rải sáu tám dưới giai điệu

**Tay:** Cả hai. **Tempo:** chấm dôi 44 → 56. **Qua bài:** D.

T như 079. P: E4q. D4q. | D4q. C4q. × 4, 6/8

**Mục đích:** Giữ hai phách lớn khi hai tay có mật độ khác nhau.

### K081 Đảo phách bằng dấu nối

**Tay:** P. **Tempo:** 52 → 66. **Qua bài:** D.

C4q D4e E4e~E4h | D4q C4q C4h; × 4, 4/4

**Mục đích:** Giữ nốt bắt đầu ở nửa phách qua điểm nhấn kế tiếp.

### K082 Đảo phách trên bass đều

**Tay:** Cả hai. **Tempo:** 52 → 66. **Qua bài:** D.

P như 081. T: C3h G2h | G2h C3h. × 4, 4/4

**Mục đích:** Bass làm điểm tựa khi giai điệu đi lệch phách.

### K083 Nghe và chơi lại một nhịp đệm

**Tay:** Cả hai. **Tempo:** 60 → 72. **Qua bài:** D.

Nội dung bài 073; nghe MuseScore một lần, tắt playback rồi chơi 8 ô, 4/4

**Mục đích:** Nối hình trên sheet với âm thanh; lượt này là học có nghe mẫu.

### K084 Pedal nhị phân có tham chiếu

**Tay:** Cả hai. **Tempo:** 52 → 60. **Qua bài:** D.

P: [C4,E4,G4]h Rh | [F4,A4,C5]h Rh | [G4,B4,D5]h Rh | [C4,E4,G4]h Rh; × 2. T nghỉ. Mỗi ô: pedal CC64 xuống ở phách 1, lên ở phách 3; 4/4

**Mục đích:** Phân biệt nhả phím và dứt âm; bài riêng về CC64, không phải mẫu pedal nghệ thuật.

## Giai đoạn 7 Toàn bộ bàn phím và chuyển sang đọc mới

12 bài kỹ năng; profile **D**. Mục tiêu tăng độ khó ở đúng thành phần ghi trong từng bài.

### K085 Vùng thấp A0 đến B1

**Tay:** T. **Tempo:** 52 → 60. **Qua bài:** A.

Lấy từng MIDI 21…35, mỗi nốt h rồi Rh thành một ô 4/4; hai lượt. Lượt 1 tăng dần. Lượt 2 theo chỉ số (7i mod 15), i=0…14

**Mục đích:** Định vị đủ 15 phím thấp bằng cách chuyển tay; không giãn tay giữ chúng.

### K086 Vùng C2 đến B3

**Tay:** T rồi P. **Tempo:** 52 → 60. **Qua bài:** A.

Lấy MIDI 36…59, h rồi Rh mỗi ô 4/4. Lượt T tăng dần, lượt P theo (7i mod 24), i=0…23

**Mục đích:** Nhận 24 vị trí vùng thấp và giữa; đổi tay là một lượt riêng.

### K087 Vùng C4 đến B5

**Tay:** P rồi T. **Tempo:** 52 → 60. **Qua bài:** A.

Lấy MIDI 60…83, h rồi Rh mỗi ô 4/4. Lượt P tăng dần, lượt T theo (7i mod 24), i=0…23

**Mục đích:** Nhận 24 vị trí vùng giữa và cao.

### K088 Vùng C6 đến C8

**Tay:** P. **Tempo:** 52 → 60. **Qua bài:** A.

Lấy MIDI 84…108, h rồi Rh mỗi ô 4/4; lượt 1 tăng dần, lượt 2 theo (7i mod 25), i=0…24. Khắc nhạc dùng 8va hoặc 15ma phù hợp

**Mục đích:** Nhận 25 phím cao; tổng bốn vùng là 88 phím khác nhau.

### K089 Mười hai hợp âm trưởng rải

**Tay:** P. **Tempo:** 52 → 60. **Qua bài:** A.

Root theo C4,G3,D4,A3,E4,B3,F#3,Db4,Ab3,Eb4,Bb3,F4. Mỗi root r: r-q, (r+4)-q, (r+7)-q, Rq; 12 ô 4/4, hai lượt

**Mục đích:** Chuyển hình trưởng qua đủ 12 pitch class; đây là dịch mẫu có chủ đích.

### K090 Mười hai hợp âm thứ rải

**Tay:** T. **Tempo:** 52 → 60. **Qua bài:** A.

Root C3,G2,D3,A2,E3,B2,F#2,Db3,Ab2,Eb3,Bb2,F3. Mỗi root r: r-q, (r+3)-q, (r+7)-q, Rq; 12 ô 4/4, hai lượt

**Mục đích:** Phân biệt hình thứ trong các vùng tay trái; không coi là 12 bài nhạc mới.

### K091 Ba nốt trong một phách

**Tay:** P. **Tempo:** 52 → 60. **Qua bài:** D.

(C4 D4 E4)t G4q E4q C4q; 8 ô 4/4; t là ba nốt chia đều một phách đen

**Mục đích:** Đọc chùm ba thật, không thay bằng ba móc đơn.

### K092 Bốn nốt trong một phách

**Tay:** P. **Tempo:** 48 → 60. **Qua bài:** D.

C4s D4s E4s F4s G4q E4q C4q; 8 ô, 4/4

**Mục đích:** Tăng mật độ cục bộ, vẫn giữ ba phách còn lại đơn giản.

### K093 Ghép nhịp mới với chuyển vị trí

**Tay:** Cả hai. **Tempo:** 56 → 72. **Qua bài:** D.

P: G4q A4e B4e C5h | E5q D5q C5h. T: C3h G2h | F2h C3h. × 4, 4/4

**Mục đích:** Kết hợp chuyển vùng, chia phách và bass.

### K094 Ba giọng theo thứ tự cố định

**Tay:** Cả hai. **Tempo:** 56 → 72. **Qua bài:** D.

Cụm 4 ô của K073 một lần nguyên gốc trong C, một lần dịch tất cả nốt lên 7 bán âm trong G, một lần lên 5 bán âm trong F; thêm 1 ô nghỉ giữa cụm. 14 ô, 4/4. Không đổi octave ngoài hai phép dịch này

**Mục đích:** Nhận cấu trúc qua hóa biểu khác; bản soạn phải ghi rõ mọi nốt.

### K095 Hai tay đọc liên tục không click

**Tay:** Cả hai. **Tempo:** 60 → 72. **Qua bài:** D.

Ghép bài 073 rồi bài 082, mỗi bài 8 ô, thành 16 ô 4/4; count-in 4; metronome tắt

**Mục đích:** Giữ nhịp qua thay đổi texture khi không có click.

### K096 Chuyển giữa chia đôi và chia ba

**Tay:** Cả hai. **Tempo:** 72 và chấm dôi 56. **Qua bài:** D.

Hai lượt riêng: bài 093 ở 4/4 q=72, sau đó bài 080 ở 6/8 q.=56. Mỗi lượt 8 ô; phải đạt cả hai, không đổi BPM giữa lượt

**Mục đích:** Kiểm tra phân nhóm nhịp và giữ pulse trong hai cách chia phách.

## Điều kiện riêng

K001–K012 và K085–K090 là bài kỹ thuật có mẫu dễ biết trước: yêu cầu không nhầm cao độ, không bấm thừa ở lượt qua bài; dùng ngưỡng thời gian A cho K085–K090 vì đây là kiểm tra định vị, không phải tốc độ cao. K085–K088 qua đủ từng vùng riêng, không lấy trung bình để che phím chưa biết.

K025–K036: bắt đầu xem trường độ trong lúc luyện; chỉ dùng trường độ làm điều kiện bắt buộc ở K029, K031, K032, K033. Bài K031 nối trong ô có cùng âm thanh với K030 nhưng ký hiệu khác: đây là bài chuyển cách đọc, không phải nội dung âm nhạc hoàn toàn mới.

K039–K041 kiểm tra trường độ ở tay giữ nốt. K084 yêu cầu MIDI có CC64, bản nhạc có pedal reference mà importer nhận được, và profile P trong STRATEGY.md. Nếu chưa có pedal hoặc tham chiếu không hợp lệ, ghi “chưa kiểm”, không chấm trượt và không tuyên bố hoàn thành kỹ năng pedal.

K011, K048 và K095 tắt click trong khi chơi nhưng giữ count-in. AudioClock hiện tại lên lịch count-in độc lập với click trong bài, nên cấu hình này đã được code hỗ trợ.

K094 cần bản MusicXML đã khắc với ba hóa biểu và các phép dịch đã chỉ định trước khi phát hành. Không dịch MIDI tùy ý trong lúc người học đang chơi. K096 là hai kết quả độc lập, phải đạt cả hai.

K091–K092 có mật độ cao hơn: chỉ tăng lên tempo đích khi vẫn thoải mái ở tempo đầu. Bài không yêu cầu căng tay hay cố nhấn nhanh để vượt đau. Hoàn tất 96 bài không đồng nghĩa trình độ nghệ sĩ biểu diễn; đây là nền tảng để tiếp tục đọc kho trích đoạn tăng dần.
