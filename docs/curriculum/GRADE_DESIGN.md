# Thiết kế grade cho quiz piano liên tục

Chọn grade → app sinh câu nhạc ngắn → chơi bằng chế độ đúng nốt hoặc BPM → chuyển tiếp trong cùng luồng. Mỗi grade cung cấp nhiều câu mới để luyện cùng một nhóm kỹ năng. Đây là thiết kế hiện hành, thay thế vai trò lộ trình chính của bộ 96 bài cố định.

Quy tắc chọn đoạn nhạc thật, biến đổi, giới hạn số nốt và chuẩn bị câu khi đang tập được đặc tả trong [GENERATION_RULES.md](GENERATION_RULES.md). Phương án là **phân tích kho trước, tạo câu theo yêu cầu trong phiên tập**, với hàng đợi câu đã render sẵn.

Các mốc tải kho, viết thuật toán, tích hợp web, kiểm thử và phát hành nằm trong [kế hoạch triển khai Q0–Q9](IMPLEMENTATION_PLAN.md).

Người học đã đọc được và chơi được nhưng chậm, căng thẳng khi nhìn sheet và dễ mất nhịp. Vì vậy, nhiệm vụ đầu tiên là đọc các quan hệ đơn giản trong một câu nhạc và thực hiện kịp phách. Các bài một phím vẫn hữu ích khi cần tách riêng nhịp, nhưng không chiếm một giai đoạn dài bắt buộc.

## Căn cứ để chia grade

| Căn cứ | Kết quả hoặc nội dung nguồn | Quyết định thiết kế rút ra |
|---|---|---|
| [Waters, Townsend và Underwood 1998](https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/j.2044-8295.1998.tb02676.x) | Năng lực nhận dạng mẫu, liên hệ ký âm với âm thanh và dự đoán có liên hệ với năng lực sight reading. Đây là nghiên cứu các thành phần kỹ năng, không phải thử nghiệm một lộ trình grade. | Đơn vị luyện là cụm nhạc có cấu trúc; người học được gặp lại quan hệ quen thuộc trong những câu mới. |
| [Aiba và Sakaguchi 2018](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02192/full) | Trong thí nghiệm với 16 pianist có kỹ năng, hai nốt cách quãng tám được xử lý như một mẫu hình; phạm vi đọc được mở rộng so với điều kiện nốt đơn. | Tách độ khó nhận hình trên khuông khỏi độ khó vận động. Kết quả này không chứng minh người mới nên tập đánh quãng tám trước quãng nhỏ. |
| [Nghiên cứu eye–hand span 2023](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0285043) | 39 pianist có nhiều năm kinh nghiệm đọc trước xa hơn ở bản dễ so với bản khó trong thí nghiệm. | Giữ câu đủ đơn giản để người học còn thời gian chuẩn bị nốt tiếp theo. Đây là suy luận cho thiết kế; không suy ra phải nhìn trước đúng một số ô cố định. |
| [Guadagnoli và Lee 2004](https://pubmed.ncbi.nlm.nih.gov/15130871/) | Khung lý thuyết challenge point xét tương tác giữa trình độ người tập và độ khó nhiệm vụ. | Xét đồng thời hình nốt, vận động, nhịp và thời gian xử lý; tăng một yêu cầu chính khi thêm nội dung. Khung này không cung cấp BPM hay tỷ lệ thành công tối ưu cho Pianist. |
| [Faber Level 1 Q&A](https://pianoadventures.com/piano-books/basic-piano-adventures/level-1/q-and-a/) và [khái niệm Level 1](https://pianoadventures.com/piano-books/basic-piano-adventures/level-1/things-to-know/) | Giáo trình đi từ bước liền và bước bỏ qua một bậc tới cách gọi quãng 2, 3, rồi mở rộng 4, 5; dùng chuyển vị và đặt quãng trong giai điệu, hòa âm, kỹ thuật, luyện tai. | Dùng trình tự này làm nền sư phạm cho các grade đầu; quãng mới xuất hiện trong câu có các quan hệ đã học. |
| [Alfred Basic Piano Course](https://www.alfred.com/pages/alfreds-basic-piano-course-overview) | Bắt đầu bằng định hướng bàn phím, tiết tấu đơn giản, hướng đi; tiếp đến các quãng trong vị trí C rồi vị trí G. | Dạy điểm xuất phát và quan hệ giữa các nốt; mở rộng vị trí bàn tay theo từng bước có chuẩn bị. |

Nghiên cứu hỗ trợ các nguyên tắc trên; giáo trình cung cấp cách tổ chức thực hành. **Bảng grade dưới đây là phương án thiết kế có căn cứ, chưa phải một hệ thống được thực nghiệm chứng minh tối ưu.** Không gắn nhãn “khoa học” cho số grade, số lần gặp, tỷ lệ trộn câu hoặc ngưỡng pass do sản phẩm lựa chọn.

## Các grade tích lũy kỹ năng

Các grade là của Pianist, không tương đương cấp chứng chỉ ABRSM hay cấp sách Faber. Mỗi grade giữ các kỹ năng trước đó; mục tiêu mới không chiếm toàn bộ câu.

| Grade | Trọng tâm mới | Quan hệ quãng và cấu trúc câu | Điều giữ đơn giản khi giới thiệu |
|---|---|---|---|
| G1 — Hướng đi và điểm mốc | Đọc nốt đầu, đi lên, đi xuống, trở lại | Nốt lặp và bước liền quãng 2 trong vùng 3–5 bậc; có đổi hướng. Nốt đầu thay đổi giữa các câu. | Một tay mỗi câu, đổi tay giữa các khối. Bắt đầu bằng đen đều; thêm trắng, tròn và lặng đen trong họ câu riêng trên cao độ quen. |
| G2 — Phân biệt bước liền và bước nhảy nhỏ | Nhận quãng 3 giữa các bước liền | Thêm bước bỏ qua một bậc; xen nốt lặp, quãng 2 và 3 trong cùng câu. | Giữ vị trí bàn tay và mẫu nhịp đã biết khi thêm quãng 3. Họ nhịp mới có cặp móc đơn trên một phách dùng cao độ G1. Các câu thuần G1 vẫn xuất hiện. |
| G3 — Nhìn thành nhóm nốt | Nhận đường nét và hình hợp âm rải | Thêm quãng 4, 5 qua những mẫu có quan hệ hòa âm, kết hợp với quãng 2, 3. Duyệt riêng từng mẫu ngón và hướng đi. | Trước hết trong vùng năm bậc, một tay; giữ nhịp quen. Hợp âm đánh đồng thời là nhánh bài riêng. |
| G4 — Mang mẫu sang vị trí mới | Tìm lại điểm mốc và dịch chuyển tay | Cùng các họ mẫu G1–G3 ở các vị trí và giọng dễ đã chọn; thêm chuyển vị trí có thời gian chuẩn bị. | Khi mới đổi giọng, giữ nhịp và đường nét quen. Chuyển vị trí giữa câu được chuẩn bị bằng nốt dài hoặc lặng. |
| G5 — Phối hợp hai tay | Đọc quan hệ giữa hai dòng | Một dòng chuyển động trên nền nốt bass giữ hoặc điểm bass thưa; sau đó đổi vai hai tay. Quãng vẫn thuộc các họ đã biết. | Bắt đầu với điểm vào cùng phách; giới hạn mật độ tay đệm và thay vị trí. |
| G6 — Đến đúng vùng sau bước nhảy | Tìm đích và chuẩn bị di chuyển | Bổ sung quãng 6, 7, 8 trong câu; cùng quãng phải được luyện lên và xuống, đi và trở về. Các quãng nhỏ tiếp tục nối câu. | Bước nhảy giai điệu tách khỏi yêu cầu với tay giữ một hợp âm rộng. Bắt đầu một tay, khoảng thời gian chuẩn bị dài. |
| G7 — Giữ nhịp khi thông tin dày hơn | Đọc tiết tấu trong khi giữ mạch | Phát triển từ nhịp cơ bản đã học sang các họ chấm dôi, nối qua phách và đảo phách; dùng hình cao độ đã quen. | Mỗi họ nhịp mới giữ phạm vi và chuyển tay đơn giản. Nhịp 6/8 có họ bài và đơn vị phách riêng. |
| G8 — Chuyển giao trên toàn đàn | Kết hợp trong câu nhạc và vùng phím đa dạng | Mẫu quen ở vùng thấp, giữa, cao; câu nhạc thật có chuyển vị trí, đệm và các quan hệ đã học. Mở dần tới A0–C8. | Mật độ giảm khi chuyển tới vùng ít quen; các câu ở hai đầu đàn dùng ký âm phù hợp, có thể có dấu chuyển quãng tám. |

Phạm vi G1 và các khoảng số nốt trong đặc tả sinh bài là cấu hình khởi đầu đề xuất, không phải kết quả một thí nghiệm. Nhịp được rèn từ grade đầu, phù hợp với nội dung cơ bản trong [Faber Primer](https://pianoadventures.com/piano-books/basic-piano-adventures/primer/q-and-a/). Trước khi đưa vào app, mỗi họ bài cần chốt mẫu nhịp, danh sách vị trí, cách viết dấu hóa, giới hạn chuyển tay và ví dụ đã duyệt. Bảng này không cho phép sinh bất kỳ câu nào chỉ vì quãng lớn nhất còn nằm trong giới hạn.

**Mở rộng vùng đàn bắt đầu từ các grade đầu.** Thay vị trí giữa những khối câu đã được chuẩn bị; grade sau bổ sung yêu cầu chuyển vùng ngay trong lúc chơi. G8 là phối hợp rộng hơn, không phải lần đầu người học được chạm phím ngoài vùng giữa. Phủ đủ 88 cao độ không đồng nghĩa đã thành thạo kỹ thuật trên 88 phím.

## Cách làm quen một quan hệ mới

Trong mỗi grade, bộ đề được tổ chức theo ba bước cố định:

1. **Nhìn rõ quan hệ mới:** câu đơn giản làm nổi bật điểm mới, còn nhịp và vị trí đã quen.
2. **Phân biệt trong câu:** trộn điểm mới với quan hệ cũ; người học phải đọc để biết câu tiếp tục đi liền hay nhảy.
3. **Chuyển sang ngữ cảnh khác:** đổi điểm bắt đầu, đường nét hoặc vị trí trong phạm vi grade, rồi dùng câu chưa thấy có cấu trúc tương tự.

Ví dụ khi thêm quãng 3: `C4 D4 E4 D4` → `C4 E4 D4 C4` → `D4 F4 E4 D4`. Đây là ví dụ do thiết kế soạn, không phải bài trích nghiên cứu. Người học gặp quan hệ đi liền và bỏ qua một bậc trong những câu khác nhau; không phải học thuộc một đáp án hay chỉ gọi tên quãng.

Chuỗi này là lựa chọn sư phạm dựa trên các căn cứ ở trên. Bằng chứng xen kẽ trong học nhạc còn phụ thuộc nhiệm vụ và trình độ: [Carter và Grahn 2016](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01251/full) nghiên cứu 10 clarinetist trình độ cao, kết quả không đồng nhất giữa giám khảo. Vì vậy chưa đặt một tỷ lệ như 70/20/10 rồi coi là tối ưu cho piano.

Người dùng chọn grade. Bộ sinh đề dùng quy tắc và thứ tự nội dung đã duyệt; kế hoạch này không bổ sung mô hình đo “phản xạ”, chẩn đoán người học hoặc tự điều chỉnh độ khó.

## Số lượng lớn nhưng vẫn đúng grade

**Lặp kỹ năng, đổi câu nhạc.** Bộ sinh dùng các họ câu có cấu trúc: hướng lên/xuống, quay về, nốt láng giềng, nhóm hợp âm rải, mẫu đệm và tiết tấu đã được duyệt theo grade. Những cấu trúc này cần xuất hiện lại để được nhận biết trong ngữ cảnh mới.

- Thay đổi tổ hợp mẫu, nốt xuất phát, điểm đổi hướng, nhịp thuộc họ đã học và vùng phím được phép. Mỗi thay đổi phải qua toàn bộ ràng buộc grade.
- Lưu dấu nhận dạng nội dung để tránh lặp nguyên câu đã chơi; nhận diện riêng các câu chỉ chuyển giọng/quãng tám. Việc lặp một quan hệ hay một họ mẫu là chủ đích luyện tập.
- Chỉ đổi BPM, âm thanh hoặc cách hiển thị không được tính là câu nhạc mới.
- Quãng phải có cả cách viết trên khuông và khoảng cách cao độ. Ví dụ E–F là quãng 2 dù cách nhau một bán âm; C–C♯ không phải bước đi lên một bậc trên khuông. Khoảng cách MIDI cũng không đủ để suy ra thế tay.
- Xét đồng thời quãng, tầm âm, số dấu hóa, mẫu ngón, chuyển tay, số nốt đồng thời, mật độ onset và thời gian tới nốt tiếp theo. Mỗi điều kiện có giới hạn riêng; cao độ dễ không bù cho một tiết tấu ngoài grade.

Mục tiêu sản phẩm là một kho câu đủ lớn để luyện lâu mà hiếm gặp lại nguyên đề. **Số câu cho từng grade phải được kiểm đếm sau bộ lọc**, tách số họ mẫu, số câu khác cấu trúc và số biến thể chuyển vị. Hiện chưa có số lượng đã xác minh cho bộ sinh này. Không dùng số tổ hợp ngẫu nhiên trước lọc để quảng cáo hàng triệu bài có chất lượng.

Grade đầu có ít họ mẫu hơn. Khi gần hết nội dung hợp lệ, tiếp tục biến thể trong giới hạn hoặc thông báo tái sử dụng; không lén thêm quãng, nhịp hay chuyển tay ngoài grade để tăng số lượng.

## Dùng nhạc thật

[Kho đã khảo sát](SOURCES.md) là nguồn tìm họ mẫu và các trích đoạn phù hợp. 1.462 MXL OpenScore đã tải không đồng nghĩa có 1.462 bài dễ; phần lớn là thanh nhạc với đệm piano. [24 cửa sổ đã chọn](REAL_EXCERPTS.md) là ứng viên cần duyệt tiếp.

Giữ hai loại rõ ràng: **trích đoạn nguyên bản** có nguồn và vị trí ô; **câu do bộ sinh tạo** có mẫu tham chiếu và lịch sử biến đổi. Nhạc Việt và classical cùng qua điều kiện grade về đọc, nhịp và vận động. Một kiểu đệm không được gắn nhãn “đặc trưng nhạc Việt” chỉ vì xuất hiện trong một bản nhạc Việt.

Các grade đầu có thể cần câu tự soạn theo mẫu sư phạm vì trích đoạn thật thường kèm nhiều yêu cầu khác. Các grade sau tăng nguồn câu nhạc thật khi chúng phù hợp. Giáo trình Alfred/Faber là tham chiếu phương pháp, không phải kho bài được mặc nhiên sao chép vào app.

## Luồng chơi và chấm

Sheet có câu đang chơi và câu tiếp theo đủ sớm để chuẩn bị. Việc sinh và render chạy trước lượt chơi, không chèn hộp kết quả giữa các câu.

| Chế độ | Chuyển câu |
|---|---|
| Đúng nốt | Dùng bộ chấm hiện có; hoàn tất các nhóm nốt thì sang câu kế. Phím còn giữ không tự tính là lần nhấn cho câu mới. Kết quả chế độ này không xác nhận giữ BPM. |
| BPM | Giữ đồng hồ và phách liên tục. Tới ranh giới câu thì chuyển, kể cả có nốt sai hoặc bỏ lỡ; lỗi được ghi nhận. Người học tiếp tục từ vị trí thời gian hiện tại. |

Chuyển câu là thao tác của phiên tập; không mặc nhiên là “pass grade”. Người dùng có thể chọn grade trực tiếp. Nếu bổ sung chứng nhận qua grade sau này, phải đánh giá trên câu mới và kiểm tra lại ở buổi khác; chưa có ngưỡng điểm khoa học để tự động chứng nhận “phản xạ đỉnh cao”.

Giữ nguyên logic chấm upstream hiện có. Về triển khai, engine hiện chạy timeline hữu hạn; ghép nhiều câu trên một timeline/batch cần bảo toàn clock, thời điểm nhả, pedal và các hit window tại biên. Không gọi khởi động lại và đếm vào ở mỗi câu rồi gọi đó là BPM liên tục. Đây là hạng mục phải thiết kế và kiểm thử khi code, chưa phải tính năng đã hoạt động.

## Trạng thái các tài liệu cũ

[STRATEGY.md](STRATEGY.md), [EXERCISES.md](EXERCISES.md) và `course.json` giữ bộ đề xuất 96 bài làm tư liệu và ví dụ. Các profile pass, số lượng và thứ tự trong đó không điều khiển grade mới. MXL mẫu, kiểm tra importer và kiểm kê nguồn vẫn giữ giá trị kỹ thuật; chúng không xác minh hiệu quả sư phạm của bộ sinh quiz.
