# Kho nhạc và bằng chứng nguồn cho lộ trình

Thiết kế hiện hành từ **21/10/2026 là kho bài sinh sẵn theo grade**, với các nhóm khoảng 4/6/10/20/30/50/100 nốt mỗi bài. Xem [kế hoạch Q v2](IMPLEMENTATION_PLAN.md), [quy tắc grade và căn cứ](GRADE_DESIGN.md), [quy tắc trích/duyệt/build kho offline](GENERATION_RULES.md). Web chọn bài đã duyệt để tập liên tục; không cắt/chuyển vị câu trong phiên. Số file nguồn không phải số bài đúng grade. Phần lộ trình 96 bài và các mẫu khảo sát bên dưới được giữ làm tư liệu, không là điều kiện để trì hoãn luồng tập trên web.

Kiểm tra ngày 20 tháng 10 năm 2026. Phân biệt **file đã tải**, **ứng viên đã lọc metadata**, **đoạn đã đọc cấu trúc** và **bài đã nghiệm thu trong app**. Số file không mặc nhiên là số tác phẩm khác nhau hoặc số bài đúng level.

**Cập nhật Q1:** công cụ thu thập chính thức đã nhập 37.631 mục nguồn, có 37.630 hash MXL riêng và 37.629 nội dung qua kiểm ZIP/XML. Một file bị chặn vì vượt giới hạn XML, mọi mục đều có trạng thái hoặc lý do cụ thể. Xem [báo cáo Q1](Q1_CORPUS.md) và [manifest](../../scores/curriculum/sources.lock.json). Các kết quả phân tích đoạn nghiên cứu bên dưới vẫn là tư liệu thử nghiệm; chưa thay cho phân tích và duyệt Q2–Q3.

**Cập nhật Q2:** đã có đường phân tích chính thức bằng music21 và đối chiếu với MuseScore, tách khỏi parser khảo sát bên dưới. Lượt nghiệm thu chạy 627 nội dung nguồn; không phải toàn kho và chưa có bài được gán grade. Xem [Q2_NORMALIZATION.md](Q2_NORMALIZATION.md).

**Cập nhật Q3, 21/10/2026:** bổ sung có mục tiêu 196 nguồn từ kho đã tải, tổng 528 nguồn chuẩn hóa được quét. Bộ lọc cho 1.368 cửa sổ ứng viên; 177 trích đoạn đại diện đều khớp MuseScore. Sau gộp gần trùng, chỉ G4 đạt số lượng pilot 100 nhóm; mọi profile vẫn chờ duyệt nội dung, chưa bật quiz. Xem [báo cáo Q3](Q3_EXTRACTION.md) và [độ phủ từng grade](q3/coverage.json).

**Phạm vi thực tế khi đổi sang v2:** Q2 đã xử lý tổng 823 file (528 chuẩn hóa, 295 bị từ chối), còn 36.806 file hợp lệ chưa phân tích. 177 đoạn Q3 đến từ 82 file, gồm 151 nhóm gần trùng theo chính sách hiện tại; chưa đoạn nào được duyệt cho tập. Các nhóm này chưa có đầy đủ bằng chứng biên câu và grade/tay theo v2. Ưu tiên khai thác kho đã tải, bổ sung có mục tiêu khi biết phần thiếu. Không sửa các receipt Q0–Q3 hoặc gọi 37 nghìn file là kho bài tập đã sẵn sàng.

## Những gì đã có trên máy

| Kho | Số lượng thực tế | Trạng thái | Vị trí |
|---|---:|---|---|
| OpenScore Lieder | 1.462 file MXL; 18.585.785 byte trước khi đóng gói thêm | Đã tải, đối chiếu Git blob, đọc ZIP và parse XML tất cả. 1.432 file có part tên piano theo bộ lọc tên bảo thủ. | [Gói MXL và giấy phép](D:/duan/pianist/artifacts/curriculum-research/openscore-lieder-1462-mxl.zip) |
| PDMX | Metadata 254.077 dòng, hai archive MXL/metadata | Đã tải CSV và archive, đối chiếu MD5 công bố và khóa thêm SHA256. | [Kho PDMX Q1](D:/duan/pianist/artifacts/curriculum-corpus/raw/pdmx) |
| PDMX một part mã piano | 36.150 ứng viên đã trích MXL và metadata | Metadata đồng thời thuộc no_license_conflict, all_valid, deduplicated, n_tracks=1 và tracks=0. 36.149 MXL qua kiểm ZIP/XML; một file vượt ngưỡng XML. Chờ phân tích nội dung nhạc ở Q2. | [Catalog Q1](D:/duan/pianist/artifacts/curriculum-corpus/catalog.sqlite) |
| Thư viện người dùng | 18 file MXL trong catalog hiện tại | Đã đọc lại cấu trúc; có cả nhạc Việt và bài quen thuộc quốc tế. | [Catalog nguồn](D:/duan/pianist/scores/library/catalog.json) |
| MXL mở đầu | 12 bài gốc do chương trình soạn | Đã nhập native MuseScore của app, đối chiếu số nốt và glyph, khởi động playback thành công. | [Gói K001–K012](D:/duan/pianist/docs/curriculum/starter-scores.zip) |
| Đoạn nhạc thật được chọn mẫu | 24 đoạn từ 24 file | 18 đoạn OpenScore, 6 đoạn trong thư viện người dùng; đã định danh part/staff/ô, chờ duyệt câu nhạc và excerpt trong app. | [Danh sách chi tiết](D:/duan/pianist/docs/curriculum/REAL_EXCERPTS.md) |

Đối chiếu lại SHA256: 1.462 mục OpenScore tương ứng **1.461 nội dung MXL độc lập**, tổng 18.562.991 byte khi chỉ tính mỗi hash một lần. Có hai mục mang tên khác nhau nhưng trùng nội dung; cần kiểm provenance trước khi phân phối. Số 18.585.785 byte ở bảng trên cộng theo mục nguồn. Không dùng 1.462 để khẳng định có từng ấy tác phẩm khác nhau.

[source-inventory.json](D:/duan/pianist/docs/curriculum/source-inventory.json) ghi nguồn từng MXL OpenScore, đường dẫn trên máy, commit, SHA256 và giấy phép. Gói ZIP giữ tên tác giả, bộ tác phẩm và tên bài theo thư mục nguồn; file phân tích nội bộ dùng hash để tránh va chạm tên.

## OpenScore Lieder dùng để làm gì

Nguồn [OpenScore/Lieder](https://github.com/OpenScore/Lieder) tại commit `38c5db510224d9facdc4b08d741fc788cfb58ea8`. Repo công bố các bản mã hóa theo CC0. Đây chủ yếu là **giọng hát với phần đệm piano**, có cả duet và cách chia part khác; không gọi cả 1.462 file là piano solo.

Lợi ích cho chương trình là nhiều câu đệm, bass, chuyển hòa âm và hình nhịp thật. Khi tách một staff làm bài kỹ năng, phải ghi rõ đó là phần trích của bản đệm. Muốn dùng cả hai tay phải giữ đúng hai staff của part piano, không đưa giọng hát vào tay phải một cách ngầm định. [README và giấy phép gốc](https://github.com/OpenScore/Lieder/tree/38c5db510224d9facdc4b08d741fc788cfb58ea8).

Lượt lọc ban đầu tìm 126 cửa sổ từ 67 file đáp ứng một bộ điều kiện khá hẹp: staff đơn âm, nhảy tối đa bảy bán âm, phạm vi không quá một quãng tám, nốt ngắn nhất ít nhất móc đơn, hóa biểu không quá hai dấu và nhịp 2/4, 3/4 hoặc 4/4; đồng thời không có tie/grace/tuplet trong cửa sổ. Đây là kết quả của bộ lọc ứng viên có giới hạn số cửa sổ lưu mỗi file, **không phải tổng số đoạn dễ trong cả kho**.

## PDMX dùng để mở rộng sau khi duyệt

[PDMX](https://github.com/pnlong/PDMX) cung cấp dữ liệu lớn lấy từ MuseScore. Bản [Zenodo 15571083](https://zenodo.org/records/15571083) có archive MXL khoảng 1,9 GB và CSV khoảng 225 MB; không cần tải PDF khoảng 9,6 GB để tuyển bài MusicXML.

Chuỗi lọc metadata được đếm tại máy:

| Điều kiện tích lũy | Còn lại |
|---|---:|
| Tất cả dòng | 254.077 |
| Không có cờ xung đột giấy phép | 222.856 |
| Thêm all_valid | 222.820 |
| Thêm deduplicated | 77.321 |
| Thêm một track và mã chương trình 0 | 36.150 |

Mã 0 là ứng viên piano theo encoding metadata, chưa chứng minh score là bản piano solo tốt. “All valid” cũng không có nghĩa bản đúng level hoặc không sai nhạc. Cờ no_license_conflict giảm một vấn đề đã biết, không thay việc kiểm nguồn của bản định phát hành. Tác giả PDMX báo 31.221 trường hợp bất nhất giấy phép và khuyến nghị subset này. [Thông báo chính thức](https://github.com/pnlong/PDMX#updates-).

Trong 36.150 dòng, tìm chuỗi tên liên quan đến Beyer được 4 dòng, Czerny 37, Duvernoy 9, Gurlitt 3. Đó là kết quả tìm tên trong metadata, không phải bộ giáo trình đầy đủ; còn có thể thiếu tên, trùng bản chuyển soạn hoặc gắn tên sai. Không được tuyên bố “đã có trọn bộ Beyer/Czerny” từ các con số này.

MD5 CSV đã tải: `30392ccf38bb63ce70e7afae70f9c88c`. Không đưa 36.150 ứng viên lên GitHub Pages trước khi chọn và duyệt. App tải score theo nhu cầu; kho nghiên cứu và kho phát hành là hai phạm vi riêng.

## Các nguồn bổ sung có mục đích riêng

| Nguồn | Định dạng đã xác minh | Cách dùng phù hợp | Điều cần kiểm trước khi đưa vào app |
|---|---|---|---|
| [ASAP](https://github.com/fosfrancesco/asap-dataset/tree/afc815c75c42e83a79c03feb6da8a35e77d4c6b8) | Cây repo tại commit đã kiểm có 235 file `.musicxml` | Chọn đoạn piano thật ở phần sau của lộ trình; kiểm tương quan score/performance nếu cần nghiên cứu | README có những số đếm khác giữa phần mô tả và bảng; dùng số file thực tế tại commit, không gọi 235 là 235 tác phẩm duy nhất. Giấy phép repo CC BY-NC-SA 4.0. Chưa tải toàn bộ XML. |
| [DCML distant listening corpus](https://github.com/DCMLab/distant_listening_corpus) | Repo tổng liên kết các submodule; nhiều corpus dùng MuseScore MSCX và dữ liệu phân tích | Thêm các bộ piano có tổ chức theo tác giả, như Schumann Kinderszenen, Grieg Lyric Pieces, Tchaikovsky Seasons | Đây không phải một thư mục MXL tải thẳng. Kiểm giấy phép từng corpus, export MusicXML từ MuseScore và duyệt lại. Chưa thu thập các submodule trong lượt này. |
| [Mutopia](https://www.mutopiaproject.org/) | Thường có LilyPond, PDF và MIDI | Tra tác phẩm và bản khắc; bổ sung khi có đường chuyển đổi bảo toàn ký hiệu | Không hứa mọi bài có MXL. MIDI không giữ đủ thông tin để thay MusicXML chuẩn khi chấm ký hiệu. |
| [MuseScore](https://musescore.com/) | Các định dạng tải phụ thuộc bản và quyền tài khoản | Người dùng lấy các bản có quyền tải, ưu tiên MXL/MusicXML và giữ link nguồn | Kiểm bản piano hai staff, bỏ lead sheet thiếu đệm nếu mục tiêu là hai tay; không tự vượt paywall. |
| [ABRSM](https://www.abrsm.org/en-gb/syllabuses), [RCM](https://www.rcmusic.com/learning/digital-learning/rcm-online-ear-training-rcm-online-sight-reading/sight-reading) | Giáo trình, yêu cầu kỹ năng và tài liệu thương mại/miễn phí tùy mục | Đối chiếu trình tự kỹ năng, dùng sách được mua để tập riêng | Không mặc nhiên có quyền sao chép bài tập hoặc tải hàng loạt MXL. |

ASAP và DCML là nguồn nghiên cứu kỹ thuật chính thức; các số lượng và định dạng được đọc từ repo, không dựa vào lời mô tả của một trang tổng hợp. Gói OpenScore là kho đã thu thập thực tế của lượt này.

## Người dùng chuẩn bị gì để có phần Việt phong phú

Trước mắt có thể dùng sáu đoạn E19–E24 từ file đã cung cấp. Để đạt mốc đầu 80 đoạn Việt/quen thuộc với giả định hai đoạn tốt mỗi bản, đặt mục tiêu **40 tác phẩm khác nhau được duyệt**. 18 file đang có chưa chắc đều cho hai đoạn đúng mức; cần thêm bản sau khi phân tích, không chỉ thêm file trùng tên.

Ưu tiên các bản piano dễ với giai điệu rõ và bass thưa. Có thể tìm bản thuộc Beyer Op.101, Czerny Op.599, Duvernoy Op.176, Burgmüller Op.100, Schumann Op.68 hoặc Tchaikovsky Op.39 làm ứng viên cổ điển có tính sư phạm; số opus không tự xác định level cho mọi bài. Cần file thực tế rồi phân tích từng đoạn. Không dùng etude tốc độ dày của Czerny làm bài mở đầu chỉ vì nó nằm trong một giáo trình nổi tiếng.

Với nhạc Việt, ưu tiên nhiều tác phẩm và người chuyển soạn khác nhau hơn là mười bản cùng một ca khúc. Gửi kèm:

- MXL hoặc MusicXML; ABC dùng được nếu đã kiểm chuyển đổi. Giữ bản MusicXML gốc khi có pedal, nhiều voice hoặc ký hiệu phức tạp.
- Link trang nguồn và tên người chuyển soạn. Tách file dùng cá nhân với file có quyền phân phối trong app công khai.
- Các bản có đủ phần piano muốn tập. PDF chỉ dùng đối chiếu; chuyển PDF sang nốt cần công đoạn OMR và sửa, không coi là nguồn MXL đã chuẩn.

Không cần người dùng tự cắt đoạn hoặc tự gán level trước. Lượt triển khai sau có thể tự đọc đặc điểm, đề xuất cửa sổ và cho duyệt; vẫn cần kiểm câu nhạc và khả năng chơi trước khi phát hành.

## Hồ sơ xác minh có thể đọc lại

- [Kết quả đọc cấu trúc 18 file đang có](D:/duan/pianist/artifacts/curriculum-research/local-scores.json).
- [Kết quả đọc kho OpenScore](D:/duan/pianist/artifacts/curriculum-research/openscore-summary.json).
- [Kết quả native MuseScore của 12 bài mẫu](D:/duan/pianist/artifacts/curriculum-research/native-audit.json).
- [Danh mục 96 bài kỹ năng ở dạng dữ liệu](D:/duan/pianist/docs/curriculum/course.json).
- [Danh mục 24 đoạn thật ở dạng dữ liệu](D:/duan/pianist/docs/curriculum/real-excerpts.json).

Kho lớn giải quyết sự đa dạng; việc giữ nhịp và đọc mới phụ thuộc cả lựa chọn độ khó, cách tập và tiêu chuẩn chuyển giao. Không biến số lượng file thành cam kết về trình độ sau một số ngày.
