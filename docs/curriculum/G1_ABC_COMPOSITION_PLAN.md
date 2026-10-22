# Kế hoạch sáng tác 700 bài G1 bằng ABC

Ngày 22/10/2026. Mục tiêu là **100 bài G1 ở mỗi khoảng nốt**, tổng cộng **700 bài**, do trợ lý trực tiếp sáng tác và biên tập thành văn bản ABC. Script dùng để kiểm, đếm, tìm trùng và đóng gói; quyết định giai điệu, tiết tấu, câu nhạc và hai tay nằm trong quá trình sáng tác.

Đã có [700 bài và kết quả kiểm](G1_ABC_RESULTS.md). Các quy tắc dưới đây được giữ làm căn cứ biên soạn.

Đây là kế hoạch cho bộ nhạc mới. Grade dùng thang nội bộ Pianist, giữ yêu cầu hai khuông và chọn tay lúc tập của [kế hoạch hai khuông](GRAND_STAFF_BANK_PLAN.md). Yêu cầu mới dùng ABC và sáng tác nguyên bản áp dụng cho bộ này; không cần trích nguồn hoặc bàn giao MXL. Các kho nhạc trích trước đó có quy trình riêng.

## Quy mô và cách đếm

| Nhóm | Số lần đánh phím của cả hai tay | Số bài đạt cần có | Đơn vị âm nhạc dự kiến |
|---|---:|---:|---|
| n4 | 3–5 | 100 | Một mô-típ rất ngắn, đọc hướng hoặc trao lượt giữa hai tay |
| n6 | 6–8 | 100 | Mô-típ có đáp lại hoặc đổi hướng |
| n10 | 9–14 | 100 | Câu ngắn có điểm tựa và điểm dừng |
| n20 | 15–24 | 100 | Một cặp câu hỏi và đáp |
| n30 | 25–39 | 100 | Hai hoặc ba câu có liên hệ |
| n50 | 40–69 | 100 | Đoạn ngắn phát triển một ý, có tương phản |
| n100 | 70–120 | 100 | Tiểu phẩm gồm nhiều câu ngắn, có trở lại và kết |
| **Tổng** | | **700** | |

N là số **lần đánh nốt có cao độ** cộng hai tay. Hai tay đánh cùng lúc hai phím khác nhau tính 2; một nốt giữ bốn phách tính 1; đánh lại cùng phím tính thêm 1; dấu nghỉ không tính. Bộ này không dùng hợp âm trong một tay, tie hoặc repeat, nên không có khác biệt giữa số nốt phát âm lần đầu và số lần đánh do những ký hiệu đó. Cách đếm được xác nhận bằng dữ liệu sau parse, không đếm chữ cái trong file ABC.

Khoảng nốt luôn tính trên bài hai tay đầy đủ. Chọn tập tay trái không đổi nhóm nốt của bài. Hai vùng âm không trùng phím nên không có vấn đề gộp unison vật lý.

Không ép đúng 4, 6, 10… nốt. Nếu câu tự nhiên có 12 nốt, nhận vào n10. Chốt cấu trúc trước, kiểm số sau; chỉnh lại câu hoặc chuyển đúng nhóm nếu ngoài khoảng, không chặt đuôi hoặc thêm nốt rỗng để đạt quota. Phân bố số nốt cần trải trong từng khoảng, không dồn mọi bài vào cận dưới.

## Giới hạn G1 của bộ này

| Thành phần | Quy định |
|---|---|
| Giọng | C major, không dấu hóa bất thường, không đổi giọng |
| Tay phải | C4–G4; trong ABC là C D E F G |
| Tay trái | C3–G3; trong ABC là C, D, E, F, G, |
| Chuyển động | Nốt lặp hoặc bước liền trong từng tay; ít nhất một tay có bước liền thực |
| Qua chỗ nghỉ hoặc sang câu | Vẫn kiểm quãng giữa hai nốt phát âm liên tiếp của cùng tay; nghỉ không cho phép giấu một cú nhảy |
| Số nốt | Mỗi tay tối đa một nốt đang phát âm; không hợp âm trong cùng tay |
| Nhịp | 2/4, 3/4 hoặc 4/4, cố định trong một bài |
| Trường độ | Đen, trắng; trắng chấm dôi chỉ dùng trọn ô 3/4, tròn chỉ dùng trọn ô 4/4 |
| Vị trí nốt trắng | 4/4 bắt đầu phách 1 hoặc 3; 2/4 ở phách 1; 3/4 ở phách 1 hoặc 2. Không dùng nốt trắng từ phách 2 qua phách mạnh 3 trong 4/4 |
| Dấu nghỉ | Lặng đen trong câu; nghỉ trọn ô khi tay kia chơi được phép, ghi rõ trong ABC |
| Phối hợp | Luân phiên; hai tay cùng mẫu onset; hoặc một tay giữ nốt dài trong lúc tay kia đi bước |
| Ngoài bộ G1 | Móc đơn, đảo phách, chấm dôi dài–ngắn, tie, lấy đà, đổi khóa, chéo tay, pedal, nhiều bè trong một tay |
| Tempo | Ghi Q:1/4=60 làm mốc đọc/nghe mẫu ban đầu; người học có thể điều chỉnh, không coi 60 là tốc độ tối ưu đã được chứng minh |

Cả hai tay có ít nhất một nốt thực trong mỗi bài. Được nghỉ theo lượt hoặc theo câu; không thêm khuông nghỉ toàn bài để gọi là piano hai tay. Với bài dài, thiết kế số lần tham gia của tay phụ theo cấu trúc từng câu, tránh một nốt tay phụ duy nhất ở đầu bài rồi mất hẳn.

Vùng năm nốt không yêu cầu phải dùng đủ cả năm nốt trong mọi bài. Bài ngắn có thể chỉ dùng hai hoặc ba cao độ. Không tự thêm số ngón hoặc pedal để che một chuyển động vượt giới hạn.

## Cách sáng tác từng bài

Mỗi bài bắt đầu từ một ý nhỏ: đi lên, đi xuống, lên rồi trở về, nốt lặp dẫn vào bước liền, hoặc giữ phách qua một chỗ nghỉ. Chọn nhịp và cách hai tay đối đáp phù hợp ý đó, rồi viết nhạc trực tiếp thành ABC.

1. **Viết một mô-típ dễ nhận.** Chọn đường nét, vị trí bắt đầu và cách đặt nốt dài/ngắn. Điểm bắt đầu không luôn là C, nhưng toàn bài vẫn trong vùng đã quy định.
2. **Dựng câu đáp có quan hệ.** Câu sau có thể đổi hướng, thay nốt kết, chuyển vai hai tay hoặc đổi nhịp của một phần đã quen. Mọi biến đổi đều được viết và xét lại trong ngữ cảnh hai tay.
3. **Đặt hai tay vào cùng một ý nhạc.** Tay phụ có thể đáp lại mô-típ, giữ nền hoặc cùng đi ở quãng thuận. Chọn các điểm tựa hòa âm nghe ổn; nốt căng ngắn có hướng đi tiếp. Tránh giữ lâu quãng hai, bảy hoặc tritone giữa hai tay ở điểm tựa, đồng thời xét tai nghe thay vì dùng quy tắc quãng như chứng nhận hay nhạc.
4. **Kết phù hợp kích thước.** Mô-típ 3–5 nốt có thể dừng để luyện hướng, không quảng cáo là một câu có cadence hoàn chỉnh. Câu và tiểu phẩm dài hơn cần điểm dừng nghe được; thường trở về vùng chủ âm hoặc kết với C/E/G trong ngữ cảnh ổn định.
5. **Đọc lại từng tay rồi đọc dọc hai tay.** Kiểm cả chỗ nối câu: bước cuối của câu trước sang bước đầu của câu sau vẫn phải là lặp hoặc liền bậc. Không lắp hai câu đúng riêng lẻ thành một bài sai ở điểm nối.

Ở bài dài, dùng các cấu trúc như A–A′–B–A″: giới thiệu, biến đổi, tương phản và trở lại có kết. Dấu A′ chỉ câu có thay đổi thực về đường nét, tiết tấu hoặc vai tay. Không sao chép nguyên 2 ô nhiều lần để chạm mốc 100 nốt; đoạn trở lại có mục đích âm nhạc vẫn được dùng. Không có yêu cầu cứ dài hơn thì thêm kỹ thuật khó hơn.

Với n100, ưu tiên khoảng 80–100 lần đánh trong 16–24 ô, thường nhóm thành các câu bốn ô; cấu trúc khác được dùng khi có lý do âm nhạc. Lưu thời lượng dự kiến tại 60 BPM để nhận ra bài bị kéo dài bằng nốt giữ hoặc nghỉ. Bài vượt khoảng hai phút cần xét lại cấu trúc, mật độ và mục tiêu đọc liên tục; không tăng BPM để che độ dài. Đây là mốc biên tập thử nghiệm, không phải giới hạn sức tập đã được nghiên cứu xác nhận.

Không bắt mọi bài phải theo I–IV–V–I: bass chuyển C sang F đã vượt bước liền của G1 nếu không có các bước trung gian. Dùng âm nền hoặc đường bass liền bậc khi phù hợp, và ưu tiên đường tay hợp lệ.

## Phân bổ 100 bài trong mỗi nhóm

Mỗi bài có một kiểu phối hợp chính để việc đếm không chồng lặp:

| Kiểu chính | Số bài mỗi nhóm | Cách viết |
|---|---:|---|
| Tay phải dẫn | 30 | Phải đi bước/đổi hướng; trái giữ nốt dài hoặc nhắc nền ở điểm chung |
| Tay trái dẫn | 30 | Trái đọc mô-típ rõ; phải giữ hoặc nhắc nền đơn giản |
| Hai tay đối đáp | 25 | Trao lượt rõ, có nghỉ theo phách; bài ngắn được trao lượt ngay trong ô |
| Hai tay cùng nhịp | 15 | Cùng onset và trường độ; từng tay vẫn chỉ lặp hoặc bước liền |
| **Tổng** | **100** | |

Một bài có thể chứa hơn một kiểu nhưng chỉ được tính vào kiểu chính đã ghi. Trong từng nhóm còn theo dõi các thẻ đi lên, đi xuống, đổi hướng, nốt lặp và giữ phách qua nghỉ. Không ép mọi giao điểm có cùng số lượng: ở n4, đổi hướng cần ba nốt trong một tay; nếu đồng thời cả hai tay đều có ba onset thì đã có sáu nốt và thuộc n6.

Lộ trình đọc trong mỗi nhóm đi từ nốt đều và vị trí quen, sang nốt dài/nghỉ, rồi các biến thể đã biết. Không coi thứ tự 1–100 là thang khó tuyệt đối; các thẻ kỹ năng giúp chọn lại bài đúng nhu cầu.

Với n4/n6, số ý âm nhạc cơ bản hữu hạn. Mục tiêu là 100 bản tập khác nhau có chủ đích, không hứa 100 mô-típ không liên quan. Đổi điểm xuất phát, hướng, thời lượng, chỗ nghỉ hoặc tay đọc có thể là biến thể luyện chuyển giao; ghi chung họ mô-típ để không trình bày như ý hoàn toàn mới.

Đổi tên, số X, tốc độ, chú thích, xuống dòng hoặc cách viết tương đương không tạo bài mới. Thay nốt hoặc chuyển vai tay được xem xét theo nội dung mới và mục tiêu học, không mặc nhiên hợp lệ chỉ vì hash khác. Bài dài bao gồm nguyên một bài ngắn rồi lặp thêm phải được phát hiện và biên tập lại.

## Quy ước văn bản ABC

Dùng ABC 2.1 với L:1/4, một bài trong mỗi file, hai voice cố định RH/LH và nhóm hai khuông bằng `%%score { RH | LH }`. Đặt `name="Piano"` chỉ ở voice RH để phù hợp cách ghép grand staff của abc2xml đang dùng trong Pianist. Ghi đủ trường X, T, C, M, L, Q, V và K; không dùng include hoặc phần mở rộng để sinh nhạc.

ABC ghi cao độ bằng chữ và dấu phẩy: C là C4, C, là C3; đặt clef=bass không tự chuyển cao độ xuống. Với L:1/4, C là một nốt đen, C2 là trắng, C4 là tròn; z là lặng đen. Các trường độ phải hợp nhịp của ô. Nguồn cú pháp: [ABC 2.1](https://abcnotation.com/wiki/abc:standard:v2.1), [abc2xml](https://wim.vree.org/svgParse/abc2xml.html) và [fixture hai khuông của dự án](../../tests/fixtures/pianist/abc/piano-core.abc).

Ví dụ n10 viết riêng để minh họa kế hoạch: tay phải 7 lần đánh, tay trái 3, tổng 10. Tay trái giữ nền; tay phải đi lên rồi trở về. `C,2 C,2` là hai lần đánh lại, không phải tie.

```abc
%abc-2.1
X:1
T:G1 mẫu 10 nốt Đi lên rồi trở về
C:Nhạc do trợ lý AI sáng tác
M:4/4
L:1/4
Q:1/4=60
%%score { RH | LH }
V:RH clef=treble name="Piano"
V:LH clef=bass
K:C
% G1; nhom=n10; tong=10; phai=7; trai=3; trongtam=buoc-lien
[V:RH] C D E F | E D C2 |]
[V:LH] C,4 | C,2 C,2 |]
```

File mẫu độc lập: [g1-n10-plan-example.abc](examples/g1-n10-plan-example.abc). Mẫu này minh họa định dạng; chưa tính là kho đã hoàn thành. Người dùng nhận ABC văn bản. Chuyển đổi nội bộ khi kiểm không làm phát sinh yêu cầu phải nhận hoặc quản lý MXL.

## Trình tự thực hiện khi sáng tác bộ bài

1. **Lập bảng đề bài.** Dành 100 ID cho mỗi nhóm, ghi khoảng nốt, kiểu phối hợp chính, trọng tâm, nhịp và hình thức. Bảng là phân công nội dung, chưa phải 700 bài đã viết.
2. **Sáng tác lô đầu 35 bài.** Năm bài mỗi nhóm, bao phủ kiểu phối hợp và độ dài. Đọc, kiểm và biên tập ngay để phát hiện vấn đề của n4 hoặc cách phát triển n100. Bài đạt tính trong 100 bài của nhóm.
3. **Hoàn thiện mỗi nhóm còn 95 bài.** Viết từng lô tối đa 10 bài; với bài dài có thể chia lô nhỏ hơn. Sau mỗi lô, kiểm máy và so trùng với toàn bộ phần đã có, rồi sửa bằng quyết định sáng tác. Không viết hết 700 mới phát hiện một quy ước sai.
4. **Duyệt âm nhạc và thứ tự học.** Đọc lại đường nét, phách mạnh/yếu, kết câu, hai tay và các đoạn lặp. Khi triển khai, dùng nghe/render để hỗ trợ kiểm nội bộ nếu có; file ABC cuối vẫn đủ làm đầu ra. Không gắn nhãn giáo viên đã duyệt nếu chỉ có trợ lý duyệt.
5. **Đóng gói sau khi đếm thực.** Mỗi nhóm đủ 100 bài đã qua kiểm; báo riêng lỗi còn lại, số họ mô-típ và số biến thể. Gộp tunebook từ chính các file đã duyệt và kiểm lại từng tune sau khi gộp.

## Những điều kiểm trước khi nhận một bài

- **ABC:** parser nhận đủ nội dung, không có lỗi hoặc sửa âm thầm trường độ; MusicXML trung gian có đúng một part piano và hai staff. Hai bè có cùng số ô, đúng tổng trường độ từng ô và cùng điểm kết.
- **G1:** đúng cao độ, giọng, vùng, trường độ và kiểu phối hợp; không bỏ qua quãng ở biên ô/câu hoặc qua chỗ nghỉ; có bước liền và có nốt thực cả hai tay.
- **Số lượng:** đếm pitch events cả hai tay; kiểm lại nhãn n4…n100 và số riêng từng tay. Không lấy số ô, ký tự hay onset chung thay số lần đánh.
- **Âm nhạc:** nhiệm vụ học nghe/nhìn được, chỗ nghỉ có vai trò, câu dài có phát triển và điểm kết; nhịp khó nhất vẫn trong G1.
- **Trùng:** so cao độ, onset, duration, rest và tay sau chuẩn hóa; so tiếp mô-típ theo quãng để phát hiện chuyển vị hoặc đảo vai. Trùng hoàn toàn bị loại; biến thể có mục đích được gắn họ và xếp cách nhau.
- **Tính nhất quán của gói:** ID duy nhất toàn bộ 700 bài, UTF-8, tên file đúng nhóm, tunebook tương ứng đúng nội dung đã duyệt. X dùng số nguyên duy nhất khi gộp; ID bền của bài giữ trong tên file/chú thích.

Các phép kiểm cấu trúc không chứng minh chất lượng âm nhạc hoặc hiệu quả học. Bằng chứng tiếp theo là thử đọc bài mới ở người học, theo dõi cao độ, nhịp và ngừng lại; bài đã nghe trước hay tập lại được phân biệt với lần đọc đầu.

## Đầu ra dự kiến

```text
scores/composed/g1-abc/
  n4/g1-n4-001.abc … g1-n4-100.abc
  n6/g1-n6-001.abc … g1-n6-100.abc
  n10/g1-n10-001.abc … g1-n10-100.abc
  n20/g1-n20-001.abc … g1-n20-100.abc
  n30/g1-n30-001.abc … g1-n30-100.abc
  n50/g1-n50-001.abc … g1-n50-100.abc
  n100/g1-n100-001.abc … g1-n100-100.abc
  books/g1-n4.abc … g1-n100.abc
```

700 file bài là nội dung gốc; 7 tunebook chỉ là bản gộp tiện dùng, không tính thêm bài. Các thông tin mục tiêu, số nốt và họ biến thể có thể nằm trong chú thích `%` của từng ABC. Báo cáo kiểm và bảng theo dõi phục vụ biên tập, không bắt người học sử dụng thêm định dạng nhạc khác.

Các giới hạn G1 và phân bổ 30/30/25/15 là quyết định biên soạn cần hiệu chỉnh qua thử nghiệm. Nghiên cứu về [độ khó bản nhạc và khoảng mắt đọc trước tay](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0285043) gợi ý kiểm soát yêu cầu đồng thời; nghiên cứu trên người chơi chuyên sâu không xác nhận 100 bài mỗi nhóm hoặc 60 BPM là liều tập tối ưu.
