# Grade cho kho bài piano sinh sẵn

Cập nhật **21/10/2026, v2**. Thiết kế này dùng kho bài hoàn chỉnh được chuẩn bị/kiểm offline. Web chọn bài đã duyệt theo grade, tay, nhóm độ dài và mode; không tạo nốt mới trong phiên. [Kế hoạch Q](IMPLEMENTATION_PLAN.md) và [quy tắc xây kho](GENERATION_RULES.md) là hai tài liệu đi cùng.

Người học mục tiêu đã đọc và chơi được nhưng chậm, căng thẳng khi đọc sheet và dễ mất nhịp. Grade tổ chức nội dung để luyện quan hệ ký âm–bàn phím–thời gian, không phải chẩn đoán người học. **G1–G8 là thiết kế Pianist có căn cứ tham chiếu, chưa phải hệ cấp độ được thực nghiệm chứng minh tối ưu và không tương đương cấp chứng chỉ.**

<a id="evidence"></a>
## 1. Bằng chứng, suy luận và giới hạn

Các nguồn dưới đây đã được đối chiếu ngày 21/10/2026. Nghiên cứu thực nghiệm, khung lý thuyết và tài liệu giảng dạy không được dùng thay thế lẫn nhau.

| Mã / nguồn gốc | Nội dung có thể dựa vào | Áp dụng vào thiết kế | Không được suy ra |
|---|---|---|---|
| **E1 — Waters, Townsend & Underwood (1998), nghiên cứu sight-reading piano**. [Bài gốc/abstract](https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/j.2044-8295.1998.tb02676.x) | Các nhiệm vụ nhận mẫu, liên hệ thị giác–âm thanh và dự đoán có quan hệ với năng lực đọc nhạc. Đã đọc abstract; không khẳng định đã kiểm toàn văn. | Giữ đơn vị nhạc có quan hệ, thay ngữ cảnh trong kho, ghi nhãn mẫu thực xuất hiện. | Quan hệ thống kê không chứng minh kho này gây tiến bộ, hoặc số nốt/lần gặp tối ưu. |
| **E2 — Imai-Matsumura & Mutou (2023), 39 pianist/người học hướng chuyên nghiệp**. [PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0285043) | Trong hai bản có độ khó khác nhau, khoảng đọc trước của mắt so với tay lớn hơn ở bản dễ. | Suy luận thiết kế: khi thêm một yêu cầu, giữ các yêu cầu còn lại quen; kiểm mật độ và BPM cùng ký âm. | Không chứng minh liều tập cho người mới, tỷ lệ trộn bài, hoặc chính xác G1–G8; không suy eye–hand span thành độ dài cả bài. |
| **E3 — Guadagnoli & Lee (2004), Challenge Point Framework**. [Abstract gốc](https://pubmed.ncbi.nlm.nih.gov/15130871/) | Khung lý thuyết xét tương tác trình độ người tập và độ khó nhiệm vụ trong học vận động. | Xét từng trục đọc/nhịp/vận động; không dùng một điểm trung bình để che một yêu cầu quá khó. | Đây không phải thử nghiệm giáo trình piano này, không cung cấp BPM, ngưỡng pass hay “tỷ lệ thành công tối ưu” áp dụng sẵn. |
| **E4 — Faber, giáo trình/phương pháp giảng dạy**. [Primer Q&A](https://pianoadventures.com/piano-books/basic-piano-adventures/primer/q-and-a/), [Level 1 Q&A](https://pianoadventures.com/piano-books/basic-piano-adventures/level-1/q-and-a/), [Level 1 Concepts](https://pianoadventures.com/piano-books/basic-piano-adventures/level-1/things-to-know/) | Đọc qua điểm mốc, bước liền/bước bỏ qua; quãng đặt trong giai điệu, hòa âm và vận động; có chuyển vị. | Làm nền tham chiếu cho G1–G4 và việc giữ mẫu trong ngữ cảnh âm nhạc. | Giáo trình không xác nhận bảng grade Pianist, cũng không cho phép sao chép bài tập sách vào kho. |
| **E5 — ABRSM Piano 2025–2026, tham chiếu sư phạm/đánh giá**. [Tài liệu gốc, trang 15–16](https://www.abrsm.org/sites/default/files/2024-06/Piano%202025%20%26%202026%20Prac%20syllabus%2020240524_access.pdf) | Yêu cầu sight-reading phân biệt độ dài theo ô, nhịp, giọng, vị trí và tay riêng/tay cùng. | Tách độ dài khỏi grade; kiểm các trục riêng; hai tay là yêu cầu phối hợp cần profile riêng. | Không ánh xạ G5 Pianist thành ABRSM Grade 5. Thứ tự chính xác của Pianist không được ABRSM xác nhận. |
| **E6 — Aiba & Sakaguchi (2018), 16 pianist có kỹ năng**. [Frontiers](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02192/full) | Trong nhiệm vụ nhận nốt, cặp quãng tám có thể được xử lý như hình mẫu; nhận dạng và cao độ tuyệt đối không luôn trùng mức chính xác. | Tách nhận hình trên khuông khỏi khả năng di chuyển/giữ tay. G6 phải kiểm vận động riêng. | Không chứng minh người mới nên nhảy quãng tám sớm, cũng không xác nhận độ thoải mái của bất kỳ thế tay cụ thể nào. |

Phần thiết kế rút ra: luyện nhịp từ đầu; thêm yêu cầu theo họ bài; giữ ngữ cảnh nhạc; phân biệt độ dài, mật độ và độ khó vận động; kiểm điều kiện tại BPM chọn. **Không có nguồn ở bảng này xác nhận các mốc 4/6/10/20/30/50/100 nốt, tám grade, số lần gặp để thành phản xạ, hoặc trình tự này là tốt nhất.** Các mốc là lựa chọn sản phẩm và phải được ghi đúng như vậy.

<a id="rules"></a>
## 2. Những quy tắc dùng chung

### Quãng, bè và tay

- Quãng giai điệu đo giữa các lần đánh liên tiếp trong cùng dòng/bè, giữ cách viết nốt. Dùng music21.interval, không thay bằng chênh MIDI. E–F là quãng 2; C–C♯ không phải bước liền đổi bậc.
- Kiểm khoảng trống giữa hai nốt: quãng qua rest vẫn ảnh hưởng việc tìm phím kế tiếp nhưng không tự là một motif liền mạch. Bằng chứng trọng tâm phải nằm trong đơn vị nhạc đã xác nhận.
- Quãng giữa hai tay, hợp âm đồng thời và âm đang giữ được kiểm riêng. Staff không tự là hand hoặc voice. Không flatten cả piano rồi tính chuỗi quãng.
- Bản đầu dùng quãng chuẩn P1, m2/M2, m3/M3, P4/P5, m6/M6, m7/M7, P8 trong giới hạn profile. Quãng tăng/giảm, giọng thứ hoặc chromaticism cần profile riêng; không loại nguồn gốc, chỉ chưa nhận vào profile hiện tại.

### Vận động và ký âm

Hồ sơ thế tay phải nói rõ tay, cao độ có cách viết, ngón, vị trí, chuyển vị trí, ngón đang giữ, điều kiện legato/nhả và khoảng BPM đã kiểm. Ngón có sẵn trong nguồn là bằng chứng tham chiếu, không tự bảo đảm phù hợp mọi bàn tay. Đề xuất ngón phải ghi là đề xuất, không gán ngầm cho tác giả.

K3 hiện bổ sung bằng chứng loại `machine` từ PianoPlayer nguyên bản, commit `6fb0e2114d7b21f75c0be5208172e1243a57323e`: chỉ nhận làm chứng cứ nội dung khi kết quả giữ ngón nguồn/tie và khớp một thế năm ngón cố định có thứ tự. Bằng chứng được tái tính/đối soát nguồn, không điền tên người duyệt. `modeled-bpm-scope` ghi đúng điểm chạy 60 BPM nốt đen và kích thước tay M của mô hình; không thay đánh giá tốc độ học, độ thoải mái hoặc xác nhận chuyên môn. Chuyển tay/nhảy xa và các ngữ cảnh chưa đủ bằng chứng giữ review. Chi tiết và giới hạn ở [AUTO_SCRIPT.md](AUTO_SCRIPT.md).

21 mẫu của Q3 v1 chỉ là đề xuất vị trí. Việc mọi pitch nằm trong một mapping không chứng minh cả chuỗi chơi thoải mái. Mở rộng mẫu cần nguồn/đối chiếu và ví dụ đạt/lỗi; không dựng fingering từ min/max MIDI.

Ở bài chuyển tay, xét từ lúc bàn tay/ngón được giải phóng đến lần đánh mới cùng trạng thái các ngón khác; nếu legato đòi một chuyển ngón, đường chuyển phải được duyệt. Thời gian từ onset trước tới onset sau không tự là toàn bộ thời gian di chuyển. Mức 750 ms của Q3 v1 không phải ngưỡng sinh lý đã được chứng minh và không được dùng một mình để duyệt.

Khóa, hóa biểu và dấu chuyển quãng tám phải đúng ngữ cảnh. G1–G3 khởi đầu vùng dễ đọc quanh C3 cho tay trái/C4 cho tay phải, không ép mọi âm ngoài vùng đó thành cùng grade bằng chuyển quãng tám tự động. Vùng khác cần cả mẫu tay và cách ký âm tương ứng. Mở vùng đã kiểm giữa các khối từ sớm; không đợi G8 mới đổi vùng.

### Tiết tấu và BPM

Các ký hiệu R dưới đây là **họ cấu trúc**, không chỉ danh sách trường độ. Kiểm pha trong ô/phách bằng phân số; không dùng offset toàn bản để loại nhầm một mẫu hợp lệ ở ô sau.

| Họ | Nội dung nhận ở bản đầu | Phải kiểm |
|---|---|---|
| R0 | Nốt đen đều trong 2/4, 3/4, 4/4 | Vị trí trên lưới phách, không rest/tie giấu trong dòng. |
| R1 | Đen, trắng, trắng chấm dôi trong 3/4, tròn khi vừa ô | Có nốt dài thực sự; bảo toàn số phách và chỗ kết. Không tự kéo trường độ cho đủ ô. |
| R2 | Nốt cơ bản và lặng đen | Có rest thật; rest nội câu không tự thành điểm cắt. |
| R3 | Cặp móc đơn trọn một phách xen nhịp đã biết | Cả hai nốt và pha phách; không móc đơn lẻ làm lệch trọng âm chưa được học. |
| R4 | Cặp đen chấm dôi–móc đơn xen nhịp quen | Có đúng quan hệ dài–ngắn và vị trí trong ô, không gán cả câu chỉ từ dấu chấm dôi. |
| R5 | Nối từ phần yếu qua phách, có trước/sau để đọc | Cao độ/tie giữ nguyên, không biến note-off/on thành nốt đánh lại; có ngữ cảnh đủ nhận phách. |
| R6 | Mẫu đảo phách móc đơn–đen–móc đơn trong hai phách | Đúng vị trí trọng âm, không chỉ đúng tổng trường độ; phải nghe/đọc được phần trước/sau. |
| R7 | 6/8 chia hai phách đen chấm dôi: nhóm ba móc đơn, đen+móc đơn hoặc đen chấm dôi | Nhóm theo phách và đơn vị BPM; không hiểu 6/8 như sáu phách đen. |

R4–R7 là profile riêng, không một nhóm trộn tất cả. Dấu nối/biểu cảm chưa hỗ trợ phải có lý do cụ thể, không được âm thầm xóa để qua lọc. Các họ có thể mở rộng khi đã đối chiếu và duyệt, không gán mọi tiết tấu khác vào “G8”.

Khoảng 40–80 BPM của cấu hình cũ là mặc định thử kỹ thuật, **không phải tốc độ học tối ưu**. V2 lưu beatUnit, khoảng BPM thực đã kiểm cho profile/bài và tempo nguồn riêng. Thời gian luyện tính theo timeline cùng đơn vị phách; 6/8 dùng đen chấm dôi. Chậm hơn không tự chữa sai ngón/độ khó, nhanh hơn không tự đổi nhãn grade. Không quảng cáo khả năng chơi tại BPM chưa được kiểm.

## 3. Quy tắc từng grade

Mỗi grade gồm các profile, không phải một bộ tối đa tùy ý trộn. Bài trọng tâm phải có dấu chứng cụ thể trong nhạc; bài ôn ghi riêng. K2 đã triển khai 25 profile G1–G8 trong [grades.v3.json](../../scores/curriculum/grades.v3.json), với kết quả `pass` / `fail` / `review` và bằng chứng sự kiện; xem [K1–K2](K1_K2_RESULTS.md). Đây là bộ tiêu chí nội dung, chưa phải kho bài đã qua K3/K4. Bộ lọc G1–G2 và lô bài mẫu V2 được giữ để kiểm hồi quy; giữ grades.v1.json làm bằng chứng cũ. [Báo cáo pilot](Q4_PREPARED_PILOT.md) ghi phạm vi và các ô coverage còn trống của lô 14 bài.

### G1 — Điểm mốc và hướng đi

**Mục tiêu:** đọc điểm xuất phát rồi theo bước liền, giữ phách qua nốt dài/rest. Căn cứ E4; cách giảm yêu cầu đồng thời là suy luận E2–E3.

- G1-direction: một tay, dòng đơn âm, P1/m2/M2 trong một vị trí đã kiểm; phải có bước liền. Nhánh đổi hướng có cả hướng lên và xuống. R0 trước, R1/R2 là nhánh riêng.
- Khởi đầu C major, không dấu hóa ngoài giọng/đổi khóa/chuyển vị trí trong bài, một nốt mới mỗi onset.
- Mô-típ rất ngắn có thể chỉ có một hướng; nhãn là luyện hướng đó, không được tính đã phủ đảo hướng.
- Loại quãng 3, móc đơn, nốt bị giữ chồng không được xử lý. Chuỗi chỉ một cao độ có thể là bài nhịp riêng, không tính là trọng tâm bước liền.
- Số nốt dài hơn không làm tăng grade; một bài 100 nốt chỉ được nhận khi nguồn thật liên tục đáp ứng điều kiện, không tự lặp motif để đủ số.

### G2 — Bước bỏ qua một bậc và chia phách

**Mục tiêu:** phân biệt quãng 3 trong ngữ cảnh quen; luyện chia phách ở họ riêng. E4 là tham chiếu dạy quãng; E2–E3 hỗ trợ quyết định không tăng hai yêu cầu cùng lúc.

- G2-third: có cả quãng 3 và bước liền trong đơn vị, tối đa m3/M3, một tay/một vị trí; R0–R2.
- G2-eighth-pair: cao độ G1, có cặp móc đơn đúng pha R3. Không gọi bài này là luyện quãng 3.
- Chỉ sau kiểm các họ giới thiệu mới có profile kết hợp quãng 3 + R3, ghi rõ là bài củng cố.
- Bản đầu giữ C major và thế tay đã kiểm. Câu có quãng 3 nhưng tie bị cắt hoặc đổi thế tay không được nhận.
- Không đếm nốt lặp làm bằng chứng đủ trọng tâm; ghi vị trí cụ thể của mẫu trong bài.

### G3 — Nhận nhóm giai điệu và quãng 4–5

**Mục tiêu:** đọc đường nét thành nhóm thay vì chỉ gọi từng nốt. E1 là bằng chứng liên hệ nhận mẫu với đọc nhạc; E4 là tham chiếu quãng trong ngữ cảnh.

- G3-arpeggio: có quãng 4/5 trong mẫu hợp âm rải được xác định và phù hợp ngữ cảnh; giữ nguyên đoạn chuẩn bị/kết. Dùng music21 kiểm hợp âm, còn chức năng trong câu cần bằng chứng phân tích.
- G3-melodic: có quãng 4/5 trong mô-típ/giai điệu đã duyệt dù không là hợp âm rải. Không bắt mọi quãng 4/5 thành triad.
- Cả hai: tối đa P5, một tay đơn âm, nhịp R0–R3, một thế tay/đường ngón không chuyển vị trí đã kiểm; khởi đầu C major.
- Một bộ ba triad xuất hiện tình cờ hoặc quãng 5 đi qua ranh giới không liên quan không đủ gán trọng tâm.
- Hợp âm đánh đồng thời là profile khác; bản đầu chưa tự nhận ba phím cùng lúc vì chúng có tên hợp âm quen.

### G4 — Điểm xuất phát mới, giọng mới và chuyển vị trí

**Mục tiêu:** dùng lại mẫu quen ở vị trí khác. E4 có chuyển vị; kiểm tải phối hợp dựa trên suy luận E2–E3.

- G4-position: đoạn G1–G3 bắt đầu tại vị trí mới đã kiểm, giữ cố định trong bài. C/G/F major; quãng tối đa P5, R0–R3.
- G4-shift: có chuyển vị trí thật, đường tay/ngón, thời điểm chuẩn bị và trạng thái nhả được duyệt tại BPM cho phép. Không đồng thời thêm giọng lạ/nhịp mới vào bài giới thiệu.
- Mỗi bản chuyển giọng được tạo offline, giữ ký âm đúng, kiểm phím đen/trắng/ngón và có nhãn biến thể. Không chỉ cộng số MIDI.
- Vị trí G4 v1 chỉ chứng minh pitch thuộc một mẫu mới; không được dùng nó làm bằng chứng đã có chuyển tay giữa câu.
- Hạ số nốt hoặc kéo BPM chậm không tự hợp thức hóa một chuyển tay chưa rõ.

### G5 — Hai tay giữ chung nhịp

**Mục tiêu:** đọc hai dòng và giữ đồng bộ khi một tay chuyển động. E5 tham chiếu tách tay riêng/tay cùng; thứ tự G5 và các giới hạn là thiết kế, không cấp ABRSM.

- G5-melody-bass: giai điệu đơn âm tối đa P5 trên bass đơn âm. Bản đầu C major, 2/4–4/4, R0–R2, mỗi tay có vị trí đã kiểm.
- Bass tối đa một lần đánh mỗi ô, trường độ tối thiểu hai phách đen; hai dòng có lần đánh ở phách đầu của đoạn. Không dùng điều này để sửa bass gốc.
- Kiểm số nốt đang giữ, số ngón cần hoạt động và nhả riêng; một nốt mới mỗi tay chưa đủ nếu âm giữ làm tay không thể đi tiếp.
- G5-left-melody là nhánh đổi vai có bài duyệt riêng: tay trái chuyển động, tay phải đệm thưa theo cùng nguyên tắc; không tráo vai bằng đổi nhãn staff.
- Loại chéo tay, cùng phím giữa hai tay, nhiều voice độc lập trong một tay ở bản đầu. Giữ hai khuông theo cùng thời gian.
- Không đếm một bè tách ra làm bài hai tay. Nhạc hai tay N nhỏ có thể khó hơn bài một tay dài.

### G6 — Nhảy giai điệu có chuẩn bị

**Mục tiêu:** tìm đích và tiếp tục mẫu quen sau quãng 6/7/8. E6 giúp tách nhận hình khỏi vận động; không có bằng chứng trực tiếp xác nhận vị trí G6 trong chuỗi.

- Profile riêng cho m6/M6, m7/M7, P8; ghi hướng lên/xuống và đường trở về khi có.
- Khởi đầu một tay, C/G/F major đã kiểm, R0–R2. Quãng lớn phải nằm trong đơn vị có cấu trúc, không là sản phẩm của nối hai bài.
- Đường tay có chuẩn bị thực: khoảng nghỉ/nhả phù hợp hoặc chuyển ngón đã duyệt; tiếp tục bằng quan hệ quen. Kiểm phím đang giữ và khoảng BPM.
- Không đồng nhất quãng giai điệu với khả năng căng tay giữ hợp âm cùng quãng.
- Loại mẫu chỉ có thời gian onset dài nhưng tay chưa được giải phóng/đường legato chưa giải quyết. Một quan hệ quãng lớn không đủ duyệt cả câu.

### G7 — Đọc nhịp trong mẫu cao độ quen

**Mục tiêu:** duy trì mạch qua vị trí vào nốt ít quen. E5 tham chiếu trục nhịp; hạn chế các trục còn lại là suy luận E2–E3.

- G7-dotted, G7-tie, G7-syncopation, G7-compound tương ứng R4–R7; mỗi bài có witness của cấu trúc đang luyện.
- Giới thiệu trên cao độ G1–G2, một tay/vị trí quen, khởi đầu C major. Hai tay hoặc vùng khác chỉ ở profile củng cố đã kiểm.
- Giữ đủ nốt/rest trước và sau để thấy trọng âm; không cắt đúng ở chỗ đảo phách rồi mất ngữ cảnh.
- R7 là 6/8 với BPM đen chấm dôi; không nối ngầm sang 3/4 hoặc 4/4.
- Tuplet, đổi meter, nhảy rộng và giọng chưa học không tự được nhận. Nhịp vẫn đã luyện từ G1; G7 không là “bắt đầu học BPM”.

### G8 — Chuyển giao các mẫu đã học trên đàn

**Mục tiêu:** phối hợp và đọc ở nhiều vùng, tiến tới A0–C8. Đây là mục tiêu sản phẩm suy luận từ E1–E3/E6, không đảm bảo “phản xạ đỉnh cao”.

- G8-register: mẫu G1–G3 ở vùng mới, điều kiện vận động quen, nhịp đơn giản; kiểm khóa/số dòng phụ/8va và kích thước sheet.
- G8-combination: tổ hợp cụ thể của profile đã duyệt (ví dụ hai tay và tiết tấu quen); mô tả riêng thay vì lấy mọi giới hạn tối đa.
- C/G/F major là phạm vi ban đầu. Giọng khác, hợp âm nhiều nốt, nhiều voice, pedal bắt buộc cần hồ sơ riêng, không miễn kiểm vì nhãn G8.
- C/G/F chưa phủ đủ 88 phím: còn thiếu các lớp cao độ C♯/D♭, D♯/E♭, G♯/A♭. Mở các họ giọng/vị trí bổ sung qua kiểm riêng; báo từng phím MIDI 21–108 thực có trong bài approved, cùng quan hệ đi vào/đi ra, tay và vùng ký âm. Min/max chạm A0/C8 không đủ, và coverage nội dung không phải chứng nhận người học làm chủ 88 phím.
- Không tăng mật độ cùng lúc khi lần đầu đổi vùng; bài phải chứa nhiệm vụ chuyển vùng thực để được tính trọng tâm tương ứng.
- Quét đủ MIDI 21–108 không chứng minh biết tìm phím trong mọi ngữ cảnh, kỹ thuật hoặc BPM. Báo độ phủ nội dung riêng với hiệu quả người học.

## 4. Độ dài, loại đơn vị và trọng tâm độc lập

Các nhóm v2 là **3–5 / 6–8 / 9–14 / 15–24 / 25–39 / 40–69 / 70–120** ứng với nhãn khoảng **4 / 6 / 10 / 20 / 30 / 50 / 100**. Ví dụ, bài 7 nốt thuộc nhóm “khoảng 6”. Ranh giới là cấu hình sản phẩm, không kết quả nghiên cứu.

- Nhóm độ dài đo toàn bài ở tay được chấm; không theo dòng/khuông.
- Loại đơn vị là mô-típ, câu/tiểu câu, hoặc cụm câu liên tục. Nhóm 4/6 cần kiểm rõ có phải mô-típ; không tự gọi phrase.
- Bài dài phải giữ nội dung grade trong toàn bài và đi tới điểm kết có căn cứ. Không lặp mẩu để đủ nốt.
- Bài có thể hợp nhiều grade ở vai trò ôn; chỉ được tính trọng tâm nơi nó có yêu cầu mới thực sự. Lưu primaryProfile và các reviewProfiles; không cộng nhiều nhãn thành nhiều bài.
- Một grade dài không tự khó bằng grade cao hơn. App hiển thị thêm điểm vào, số ô, thời gian theo BPM và vai trò tay.

## 5. Hồ sơ để nhận bài, không chỉ một nhãn grade

Mỗi bài chuẩn bị phải có:

| Hồ sơ | Bằng chứng tối thiểu |
|---|---|
| Nguồn và đơn vị | Hash nguồn, part/voice, khoảng ô/tick/note, loại đơn vị và lý do cả hai biên. |
| Ngữ cảnh | Sheet/âm thanh nguồn đủ thấy đơn vị trước và sau hoặc tới mép tác phẩm; giữ ký âm có hiệu lực. |
| Điều kiện nhạc | Kết quả từng rule; interval có cách viết, onset/duration, rhythm cell với pha, nốt đồng thời/đang giữ. |
| Trọng tâm | Event ID cụ thể cho quan hệ đang luyện; không chỉ maxInterval/maxDuration. |
| Tay và BPM | Vai trò tay, đường ngón/vị trí, nhả/chuyển, khoảng BPM và phương pháp thực đã kiểm. |
| Duyệt | Chấp nhận/từ chối/chờ, lý do, người/công cụ, ngày và phạm vi; tách khớp native với duyệt âm nhạc. |
| Phân loại | Profile/version, loại nội dung, nhóm độ dài sau đếm native, exact/motif/source identity. |

Chưa chắc biên/ngón/giọng thì giữ pending. Một kiểm tra do công cụ hoặc trợ lý thực hiện phải ghi đúng phương pháp, không đổi thành “giáo viên piano đã duyệt”. Kế hoạch không mặc định đã có người duyệt chuyên môn; nhãn đó chỉ dùng khi có bằng chứng thật.

Kiểm mẫu phân tầng gồm cả nhận và loại, cả bài ngắn/dài, tay trái/phải, chiều quãng, giọng, nhịp, vùng. Mẫu đạt kỹ thuật không chứng minh tác dụng học dài hạn. Không đặt ngưỡng pass khoa học không có nguồn: bài được app chấm theo engine hiện có; user tự chọn level; chuyển bài trong BPM theo clock kể cả miss.

## 6. Cách tăng kho mà không làm sai grade

Bổ sung nguồn mới vào cùng phiên bản rule đã duyệt không tự thay độ khó. Đổi rule phải tạo version mới và đánh giá lại bài bị ảnh hưởng. Điều kiện grade là các phép kiểm độc lập, không một điểm số trung bình có thể bù nhịp quá khó bằng quãng dễ.

Nguồn Việt/classical qua cùng kiểm kỹ năng. Metadata giúp chọn hàng đợi và nhãn xuất xứ, không tự chứng minh pattern “đặc trưng Việt”. Những họ chưa đủ bài được ghi là ít/thiếu; không lấy họ ôn lấp vào cột kỹ năng mới.

Trước khi thêm một rule mới: ghi mục tiêu, nguồn/căn cứ, suy luận, ví dụ đạt/lỗi và ảnh hưởng tới coverage. Không đổi tùy tiện sau khi thấy yield thấp, nhưng cũng không mặc định bộ lọc v1 quá chặt là đúng sư phạm. Mỗi sửa đổi phải giải thích được lỗi nhận/loại cụ thể.

## 7. Tài liệu và cấu hình lịch sử

[STRATEGY.md](STRATEGY.md), [EXERCISES.md](EXERCISES.md), course.json giữ đề xuất 96 bài cũ làm tư liệu. [Q3_EXTRACTION.md](Q3_EXTRACTION.md) và grades.v1.json mô tả candidate v1: 4–64 target, mẫu tay hạn chế, chưa duyệt. Chúng không điều khiển grade/độ dài v2.

V2 cần cấu hình mới trước khi code áp dụng. Các nguồn nghiên cứu/giáo trình là căn cứ cho phương pháp; không biến chúng thành kho MXL có thể sao chép tùy ý. Chỉ đưa nội dung đủ quyền vào gói công khai; file cá nhân giữ phạm vi phù hợp.
