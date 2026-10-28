# Thư viện piano được phát hành

`songs/` giữ MXL dùng để phát hành. `catalog.json` là danh mục đang dùng; tên hiển thị,
tác phẩm, phiên bản và hash nằm ở đây. Chuẩn hóa phần trình bày theo hồ sơ dưới đây;
không sửa nốt, tie hoặc thời điểm nhả pedal để ép qua bộ nhận.
Các báo cáo `IMPORT_REPORT*.md` là lịch sử từng đợt nhập, không phải số lượng hiện tại.

## Bổ sung Carpenters ngày 28/10/2026

Catalog hiện có **162 phiên bản / 151 tác phẩm**. Nhận cả ba MXL: **Top of the
World** và **Yesterday Once More V1/V2**. Hai phiên bản Yesterday Once More được
phân biệt bằng nhãn **52 ô nhịp** và **43 ô nhịp**; cùng tác phẩm nhưng khác bản
phối. Không có file trùng hoặc bị loại. Cả ba đều đủ hai khuông và đã mở, phát,
ánh xạ nốt bằng MuseScore.

Chuẩn hóa ba bản mới theo `pianist-a4-v1`, giữ nguyên 159 phiên bản cũ. Toàn bộ
162 phiên bản / 490 trang đã được đối chiếu bằng native renderer; không có
sai khác dữ liệu biểu diễn trước/sau hoặc cảnh báo tràn khung. Sáu trang mới đã
được xem trực tiếp. Ghi công nhạc Richard Carpenter và lời John Bettis dựa trên
trang chính thức dẫn trong `metadata-overrides.json`; không suy đoán người soạn
piano. File gốc, hash và kết quả kiểm nằm trong
[biên nhận lô nhập](IMPORT_RECEIPT_2026-10-28_CARPENTERS.json) và
`NORMALIZATION_RECEIPT.json`.

## Bổ sung 8 bản ngày 26/10/2026

Đợt này đưa catalog lên **159 phiên bản / 149 tác phẩm**. Nhận đủ tám MXL chính trong
`8-Ban-Piano-MXL-Tu-File-Dinh-Kem.zip`: Nữ nhi tình, Dám hỏi đường ở nơi đâu,
Thiên Trúc thiếu nữ, Vân cung tấn âm, Trư Bát Giới cõng vợ, Hương lúa, Nghe lời mẹ
và Dạ khúc. Tất cả là tác phẩm mới, đủ hai khuông; không có bản trùng hoặc bị loại.
Bản diễn giải khác trong `QA/alternatives/` chỉ là tài liệu đối chiếu của ZIP,
không được tự thêm thành bài thứ chín.

Tám bản đã kiểm mở/phát bằng MuseScore, giữ đúng dữ liệu nhạc trước/sau chuẩn hóa,
ánh xạ đủ nốt nhìn thấy và dựng 27 trang/8 thumbnail. Toàn catalog được đối chiếu
159 bản, 484 trang, không có cảnh báo tràn khung. Những bản không đổi được giữ
nguyên byte. Nguồn nguyên byte và kết quả từng bài nằm trong
[biên nhận lô nhập](IMPORT_RECEIPT_2026-10-26_EIGHT_PIANO.json) và
`NORMALIZATION_RECEIPT.json`.

Giữ các bất thường nguồn: Nữ nhi tình ô 30 có 4½ phách trong 4/4; Trư Bát Giới
cõng vợ ô 17 có khoảng trống giữa hai nốt A4 được nối tie; Vân cung tấn âm ô 5
có hai chỉ dẫn cường độ đồng thời. Riêng bản cuối giữ tọa độ ký hiệu dynamics
để MuseScore không đổi velocity khi dàn lại trang. Không chọn hộ một cách sửa nhạc.
Đường D.S./Coda của Nghe lời mẹ đã kiểm trực tiếp từ MuseScore: ô 1–76 → 13–35 →
77–78, tổng 101 lượt ô nhịp. Ghi công Thiên Trúc thiếu nữ được tách đúng vai trò
nhạc/lời theo nguồn dẫn trong `metadata-overrides.json`; tên chưa đủ chứng cứ
vẫn để trống. Chưa đối chiếu từng nốt với ảnh gốc ngoài ZIP.

## Chuẩn metadata và MXL ngày 25/10/2026

Đã áp dụng cho **151 phiên bản / 141 tác phẩm**, dựng và kiểm khung **457 trang**,
tạo lại **151 thumbnail**. MXL từ 3.30 MB còn 1.27 MB. Có nguồn ghi công dùng được
cho người viết nhạc ở 47 bản và người chuyển soạn ở 42 bản; 104/109 bản còn lại
không tự điền hai trường tương ứng. Có thể vẫn có thông tin người chép hoặc trình
bày. Chưa xác minh độc lập toàn bộ các tên do bản nguồn tự khai.

**Giới hạn được ghi nhận:** 5 bản còn lỗi XSD có sẵn trong nguồn: Detective Conan
Main Theme, We Wish You a Merry Christmas, White Blossoms V1/V2, Chuyện người đan
áo. Có thứ tự phần tử sai, kiểu hợp âm trống hoặc chỉ dẫn metronome thiếu dữ liệu.
Không đoán loại hợp âm/tempo để làm báo cáo hết cảnh báo. 151 bản vẫn đọc được
bằng MuseScore và khớp nhạc trước/sau chuẩn hóa. Đây là chuẩn hóa trình bày, không
phải xác nhận mọi ký hiệu của nguồn là đúng.

10 bản đại diện đã được lưu MSCZ, xuất MXL rồi đọc lại bằng engine; so sánh cùng
thao tác trên nguồn trước/sau không có sai khác mới. Một số khác biệt roundtrip
vốn có của engine (rest/tempo/dynamics/pedal) được ghi trong
`artifacts/library-standardization-2026-10-25/browser-audit.json`; không khẳng định
mọi phép xuất MusicXML của MuseScore đều giữ nguyên tuyệt đối. Giao diện được kiểm
ở 390/768/1440 px với ba kiểu xem; đây là kiểm trình duyệt Edge, không phải kiểm
Safari trên thiết bị iOS thật. Trạng thái phát hành theo `deploy/pages-release.json`
và phiên bản `release.json` đang được website phục vụ.

- `title`: tên tác phẩm; các tên cũ/tên tìm kiếm nằm trong `aliases`.
- `composer`, `lyricist`, `arranger`, `transcriber`, `performer`: lần lượt là người
  viết nhạc, viết lời, chuyển soạn, chép lại, trình bày. Không dùng ca sĩ làm giá trị
  thay thế tác giả. Trường không đủ chứng cứ được bỏ trống, không ghi “Composer / arranger”.
- `workId` và `version` giữ nguyên. Trùng tên không có nghĩa cùng tác phẩm. Chỉ
  truyền thông tin người viết nhạc/lời giữa các phiên bản cùng `workId` khi không
  có mâu thuẫn; không truyền người chuyển soạn giữa các phiên bản.
- Thông tin trong nguồn được ghi rõ là **nguồn tự khai**; chỉ những mục có dẫn
  chứng kiểm chứng bên ngoài mới được đánh dấu tương ứng trong hồ sơ. Quyết định
  biên tập nằm ở `metadata-overrides.json`, không nằm rải rác trong giao diện.
- Giao diện thư viện hiển thị tên bài, người viết nhạc/lời và người chuyển soạn/
  chép lại khi có. Editor và thiết lập tập hiển thị đầy đủ vai trò. Tìm không dấu
  áp dụng cả tên tác phẩm, tên cũ và các tên ghi công. Chip phiên bản vẫn giữ nhỏ.

MXL dùng hồ sơ **`pianist-a4-v1`**: MusicXML 4.0 nén, root `score.musicxml`, A4 đứng,
lề 15 mm, khuông 7 mm, font nhạc Leland, chữ FreeSerif có đủ dấu tiếng Việt; chữ
Hoa dùng Noto Sans CJK SC, ký hiệu riêng dùng Leland Text. Tiêu đề ở giữa, ghi công
theo vai trò ở phải, bản quyền nguồn được giữ. MuseScore tự dàn lại các hệ thống
khuông sau khi bỏ tọa độ/chiều rộng cố định. Không ép số ô nhịp mỗi dòng.

`layout-overrides.json` ghi ngoại lệ có đối soát, gồm việc giữ điểm xuống hệ của
**Ai đưa em về — Nguyễn Ánh 9** để không đổi đường đi vòng lặp của MuseScore và
xuống dòng những chú thích nguồn dài. Không thay từ ngữ, nốt, offset hoặc nhịp.
Kiểm tra khung trang phát hiện chữ tràn mép, không thay thế việc xem ảnh để phát
hiện mọi va chạm. Các lỗi nhạc có sẵn trong nguồn vẫn được ghi nhận, không tự đoán
cách sửa. Nhận bài đủ hai khuông không đồng nghĩa xác nhận nguồn hoàn toàn đúng.

### Các file cần tìm

| Vị trí | Mục đích |
| --- | --- |
| `songs/<slug>.mxl` | MXL chuẩn hóa đang dùng |
| `catalog.json` | Metadata, phiên bản, hash, hồ sơ trình bày |
| `metadata-overrides.json` | Sửa thông tin có chứng cứ theo từng bản |
| `layout-overrides.json` | Ngoại lệ trình bày đã kiểm bằng native |
| `originals/<catalog-hash>.zip` | Catalog và MXL nguyên byte trước mỗi đợt chuẩn hóa; không phát hành lên web |
| `NORMALIZATION_RECEIPT.json` | Biên nhận XML, nguồn ghi công, các chỗ còn thiếu, kết quả native từng bản |
| `previews/manifest.json` | Ảnh trang đầu dựng từ hash MXL hiện tại bằng MuseScore |

`sourceSha256` giữ liên kết nguồn canonical trước đó; `sourceHashes` giữ mọi hash
đã phát hành của cùng phiên bản. Khi mở lại, app nhận diện đúng bản đã lưu và giữ
nguyên nội dung chỉnh sửa/khôi phục của người dùng, không thay MSCZ cũ bằng MXL mới.
Do đó bản người dùng đã chỉnh sửa có thể giữ trình bày cũ. Thư viện mới dùng MXL
chuẩn hóa; bản cá nhân không bị ghi đè ngầm.

### Quy trình cho lần bổ sung tiếp theo

Chạy từ gốc repository; mỗi lô dùng **một thư mục work mới**. Sau bước nhập qua
`curate-library.py`, chuẩn hóa trước khi tạo ảnh và đóng gói:

```powershell
python -X utf8 buildscripts/pianist/normalize-library.py prepare --work artifacts/library-normalization-next-batch
node buildscripts/pianist/audit-library-layout.cjs artifacts/library-normalization-next-batch
python -X utf8 buildscripts/pianist/normalize-library.py apply --work artifacts/library-normalization-next-batch
node buildscripts/pianist/build-library-previews.cjs
node src/web/appjs/install.js build.artifacts
python -X utf8 buildscripts/pianist/package-web.py
```

Trước `apply`, đọc báo cáo metadata, xem ảnh các trang và kiểm các cảnh báo. Nếu
cần sửa, cập nhật override rồi chạy lại `prepare` và audit với `--resume`; chỉ
tái sử dụng kết quả trùng hash cả nguồn, đầu ra và renderer. Audit so sánh chính
xác dữ liệu phát của MuseScore trước/sau: cao độ, onset/release, bè, lặp, tempo,
pedal, và ánh xạ nốt sang SVG. Fingerprint XML độc lập giữ mọi nội dung nhạc ngoài
danh sách thuộc tính trình bày được phép thay. Không thêm lỗi XSD so với nguồn.

`apply` từ chối nếu catalog hiện tại thay đổi, thiếu audit bản chính xác, còn chữ
vượt mép hoặc bản gốc không khớp hash. Không xóa bài nếu chuẩn hóa gặp lỗi. Bộ đóng
gói từ chối bản mới chưa qua hồ sơ chuẩn hóa; nội dung đủ hai khuông vẫn được giữ
để xử lý, không biến lỗi trình bày thành tiêu chí loại bài. Muốn thay đổi quy tắc
chung phải tăng phiên bản `PROFILE`; các bản đã chuẩn hóa không đổi được giữ byte
nguyên khi chạy lô sau. Nguồn nhập mới trùng hash cũ được nhận diện và bỏ qua;
file nén lại có byte khác vẫn được đối chiếu XML với bản trước chuẩn hóa trong
`originals/`, tránh tạo thêm phiên bản giả.

## Chính sách hiện hành: đủ hai khuông thì nhận

Mốc ngày 25/10/2026 có **151 phiên bản / 141 tác phẩm** sau khi nhận **Dù cho tận thế**;
đã phát hành trong release `pianist-web-2026-10-25-library-normalization`. Chỉ nhận một phiên bản tương
thích để giữ 74 dấu Ped. và 66 hợp âm đúng vị trí dưới dạng chữ; giữ nguồn canonical
nguyên byte và liên kết bằng `sourceSha256`. Nốt, nghỉ và nhịp không thay đổi.
Không có tham chiếu chấm pedal vì nguồn thiếu điểm nhả. Xem
[biên nhận và giới hạn roundtrip](IMPORT_RECEIPT_2026-10-25_DU_CHO_TAN_THE.json).

Mốc trước đó có 150 phiên bản / 140 tác phẩm. Khôi phục 35 bản từng bị loại ở đợt
24/10 và nhận lại năm bản đủ hai khuông từng cách ly: Họa tâm, Nếu em đã quên
(bản đầy đủ), Chỉ có đôi ta, Mưa trên cuộc tình (V2), White Blossoms (V2).
Báo cáo QUALITY_RECEIPT_2026-10-24.json giữ nguyên làm lịch sử của chính sách cũ;
không còn là danh sách được phép tập.
[Đối soát chính sách mới và kiểm thử từng bản](ADMISSION_RECEIPT_2026-10-24_TWO_STAVES.json).

- Điều kiện nội dung duy nhất để nhận là đúng hai khuông cấu trúc. Một part hai
  khuông hoặc hai part một khuông đều hợp lệ; nghỉ, ẩn khuông và đổi khóa không
  làm mất tư cách nhận bài. Các file hỏng/không đọc được và tham chiếu khuông
  không hợp lệ vẫn được báo lỗi nhập.
- Tên nhạc cụ, nốt hoa mỹ, ornament, rải hợp âm, tie, nhịp hoặc pedal thiếu dữ liệu
  là thông tin kiểm tra, không phải lý do loại bài. Không viết thêm nốt, đổi nhịp
  hoặc đoán điểm nhả pedal để ép nguồn qua kiểm tra.
- Bộ tập dùng các lần phát nốt MPE từ MuseScore, gồm cả nốt hoa mỹ và các nốt bung
  ra từ trill/tremolo/rải hợp âm. Pitch/onset/offset và ánh xạ nốt do engine cấp.
  Bản nguồn thiếu nhịp/tie/đích nhảy được tập theo cách MuseScore đọc file đó;
  nhận bài không có nghĩa xác nhận mọi ký hiệu trong nguồn đều chính xác.
- Pedal chỉ chấm khi có khoảng chỉ dẫn trong MuseScore; không tự thêm thời điểm
  nhả cho ký hiệu bắt đầu đơn lẻ. Tắt pedal vẫn có thể chấm nốt, BPM và nhả phím.
  Khi nhiều bè yêu cầu giữ cùng một phím qua lần đánh lại, vẫn chấm đủ các lần
  đánh; không kết luận sai trường độ ở chỗ không thể thực hiện bằng một phím.
- Giữ nguyên workId, số version và nội dung nhạc MXL (ngoài chuẩn hóa trình bày có đối soát;
  bản tương thích được cung cấp riêng phải có biên nhận biến đổi như Dù cho tận thế).
  sourceSha256 liên kết bản dùng trong thư viện với nguồn canonical. Không xóa file
  Downloads hay bản chỉnh sửa của người dùng.

Chính sách cấu trúc dùng chung ở library_staff_policy.py và library-admission.ts.
library_content_policy.py chỉ ghi nhận thông tin; không chặn do ký hiệu.
curate-library.py vẫn bỏ bản trùng nội dung và tạo version N+1 cho bản phối khác.
Ảnh xem trước và hình sheet do MuseScore dựng từ chính bản MXL được giữ lại.

## Đối soát ngày 23/10/2026

Catalog ở mốc này có **131 phiên bản / 127 tác phẩm** sau [lô 42 bài nhạc Hoa](IMPORT_REPORT_2026-10-23_CHINESE_42.md): nhận 38 bản (34 tập được, 4 chỉ nghe/chỉnh sửa); bốn đầu vào cảnh báo giữ ngoài phát hành.

Mốc trước đó có **93 phiên bản / 89 tác phẩm** sau [gói 16 bài nhạc Hoa](IMPORT_REPORT_2026-10-23_CHINESE_16.md): nhận 15 bản (9 tập được, 6 chỉ nghe/chỉnh sửa), cách ly Họa tâm thiếu nguồn. Thanh hoa sứ dùng bản thay thế đã kiểm sửa cấu trúc/XSD và kiểm native lại.

Trước đó có **78 phiên bản / 75 tác phẩm** sau khi bổ sung
[Wo Bu Hou Hui](IMPORT_REPORT_2026-10-23_WO_BU_HOU_HUI.md), đủ hai khuông,
681 nốt, nghe/chỉnh sửa/tập được.

Lô bổ sung trước đó có **77 phiên bản / 74 tác phẩm**: thêm 16
tác phẩm mới và một phiên bản Thức giấc; 31 bản trùng được bỏ qua, hai MXL sai số
khuông và một PDF không được nhận. 12 bản mới tập được, năm bản có nốt hoa mỹ
chỉ nghe/chỉnh sửa sau khi kiểm native đầy đủ. Xem [báo cáo lô mới](IMPORT_REPORT_2026-10-23_BATCH.md).

Đã đọc toàn bộ 65 MXL; giữ **60 phiên bản thuộc 58 tác phẩm**. Các MXL còn lại,
ID, `workId`, số phiên bản và thứ tự giữ nguyên. Hai nhóm có nhiều phiên bản vẫn giữ đủ.

| Bản bỏ khỏi thư viện phát hành | Cấu trúc nguồn |
| --- | --- |
| Và thế là hết | Một khuông piano |
| Tình em là đại dương — bản ngắn | Một khuông piano |
| Mojito | Ba khuông: một part piano trống một khuông và một part piano hai khuông |
| Chính Chúa chọn con | Ba khuông: giọng hát một khuông và piano hai khuông |
| Cho em một lần yêu | Ba khuông: một part piano trống một khuông và một part piano hai khuông |

[Hồ sơ từng file và lý do](STAFF_POLICY_REPORT.json). Bản gốc của năm file và catalog
trước thay đổi được lưu ở `artifacts/library-two-staff-2026-10-23/originals/` trên máy
phát triển; Git cũng giữ lịch sử. Không đụng file Downloads, kho grade hoặc `warehouse`.

Kiểm chính sách và luồng nhập:

```powershell
python -m unittest discover -s tests/library -p 'test_library_*.py'
```
