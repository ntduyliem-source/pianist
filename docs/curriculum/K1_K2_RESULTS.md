# K1–K2: đọc toàn kho và bộ tiêu chí G1–G8

Ngày 21/10/2026. Đã hoàn thành K1–K2 trên kho MXL đã tải; không nhập kho ABC khảo sát vào đợt này. [Receipt đối soát](k1-k2/verification.json) ghi số thực, hash và phạm vi kiểm.

## Phạm vi bàn giao

- **K1:** đọc nguồn theo catalog, giữ cache đúng parser/hash, chạy lại 295 kết quả từng bị từ chối, ghi trạng thái và lý do từng nguồn.
- **K2:** API và CLI kiểm nội dung theo **25 profile G1–G8**, trả `pass`, `fail` hoặc `review` với source event IDs. Chưa xác định thì `review`.
- **K3/K4 chưa thực hiện ở lượt này:** chưa quét mọi cặp biên, chưa xuất thêm bài tập vào kho. K2 pass chưa thay thế kiểm câu/mô-típ, đối chiếu nguồn và native MuseScore.
- Bộ chấm trình diễn, editor, màn tập và bản online không thay đổi.

## Kết quả toàn kho

| Kết quả K1 | Số nguồn |
|---|---:|
| Tổng file hợp lệ trong catalog / đã có kết quả | 37.629 / 37.629 |
| Chưa xử lý | 0 |
| Có dữ liệu nhạc chuẩn hóa | 17.926 |
| Trong đó không có parser blocker | 10.774 |
| Cần xác định rõ phần piano (`piano-not-explicit`) | 19.627 |
| Lỗi nhập music21 | 26 |
| Vượt giới hạn 20.000 nốt | 10 |
| Quá 45 giây sau lượt kiểm lại với 4 worker | 28 |
| Số staff chưa hỗ trợ | 12 |

17.926 nguồn chuẩn hóa gồm 7.152 nguồn còn ký hiệu/ngữ cảnh cần xử lý; không đồng nghĩa có 17.926 nguồn được phát hành. 19.627 nguồn thiếu căn cứ nhận diện piano được giữ để review, không bị xóa hoặc kết luận là nhạc hỏng. 76 trường hợp còn lại giữ lỗi/giới hạn riêng.

Đã kiểm lại đủ **295/295** kết quả từ lần chạy cũ: giữ nguyên mã lý do; 292 thiếu căn cứ piano, 2 chưa hỗ trợ số staff, 1 lỗi nhập harmony. Trong nhóm 292 có 275 nguồn không ghi tên nhạc cụ và 17 có tên nhưng chưa đủ điều kiện nhận diện. Lượt kiểm lại 30 timeout ở mức đồng thời thấp hơn đọc được thêm 2 nguồn; 28 nguồn vẫn vượt giới hạn. Không bỏ harmony hoặc tăng giới hạn ngầm để biến thành đạt.

Đối soát toàn bộ 37.629 bản ghi kiểm hash blob, liên kết SHA nguồn và kết quả từng nguồn. Không có bản ghi thiếu/hỏng. Đây là kiểm cache, chưa phải nghiệm thu MuseScore/grade. Số bài tập mới xuất ở K1–K2 là **0**; lô 14 bài cũ vẫn chỉ là pilot.

## K1: chạy tiếp và truy xuất kết quả

```powershell
.\.tools\curriculum-python\Scripts\python.exe buildscripts/pianist/normalize-curriculum.py normalize --workers 12 --recycle 32 --retry-rejected
```

Chạy tiếp thông thường bỏ `--retry-rejected`. Mỗi kết quả được commit ngay vào SQLite. Tối đa một bản nhạc/kết quả đang chờ ở mỗi worker; worker được thay sau 32 file, khi crash hoặc quá 45 giây. Đọc nốt vẫn dùng nguyên `curriculum_normalize.normalize`/music21 10.5.0. Số worker không nằm trong định danh dữ liệu nhạc; timeout, giới hạn nốt, parser/dependency/options vẫn được khóa trong cache.

Hash nguồn mới được kiểm trong worker trước parse; nguồn dùng cache vẫn được đọc lại để kiểm hash. Hash blob và nguồn bên trong blob phải cùng đúng. Lỗi I/O, checksum, crash/timeout không trở thành kết quả nhạc có thể tái sử dụng vĩnh viễn. Thêm nguồn không làm mất cache của nguồn cũ.

| Tài nguyên local | Nội dung |
|---|---|
| `artifacts/curriculum-normalized/normalization.sqlite` | Mỗi SHA nguồn có trạng thái, dữ liệu phân tích nén hoặc lý do không đọc được. |
| `artifacts/curriculum-normalized/progress.json` | Tiến độ, số còn lại của lượt chạy và thời gian. |
| `artifacts/curriculum-normalized/report.json` | Tổng hợp toàn catalog ở parser hiện tại; không phải số bài tập. |
| `artifacts/curriculum-normalized/source-outcomes.jsonl` | Một dòng cho từng nguồn hiện có, kể cả `pending` khi chưa chạy xong. |
| `artifacts/curriculum-normalized/cache-audit.json` | Đối soát 37.629 bản ghi, hash dữ liệu và liên kết nguồn; `passed: true`. |
| `artifacts/curriculum-normalized/retry-audit.json` | Trước/sau của nhóm bị từ chối được yêu cầu kiểm lại. |
| `artifacts/curriculum-normalized/legacy-rejections-detail.json` | 295 trường hợp cũ, thông tin nhạc cụ và lý do trước/sau. |
| `artifacts/curriculum-normalized/timeout-recheck.json` | Kiểm lại 30 timeout: 2 đọc được, 28 còn vượt giới hạn. |
| `artifacts/curriculum-normalized/k1-worker-parity.json` | 12 nguồn thật: hash phân tích của worker tái sử dụng khớp các kết quả lịch sử có receipt native. |

`read` có nghĩa đã có dữ liệu phân tích; vẫn có thể chứa ký hiệu cần kiểm thêm. `needs-instrument-review` không có nghĩa MXL hỏng. `unsupported-or-parse-error` giữ mã và lỗi cụ thể để phân biệt hạn chế importer với dữ liệu nguồn. Không xóa hoặc sửa nhạc để biến trường hợp đó thành thành công.

Chạy `normalize-curriculum.py audit` để đối soát cache; lệnh trả mã lỗi nếu thiếu kết quả, sai hash/liên kết nguồn hoặc thiếu lý do từ chối. Dữ liệu lớn ở `artifacts/` được giữ local; receipt nhỏ trong `docs/curriculum/k1-k2/` đi cùng code.

## K2: tiêu chí có thể thực thi

| Grade | Số profile | Phép kiểm trọng tâm |
|---|---:|---|
| G1 | 4 | Bước liền với nốt đen / nốt dài / lặng; đổi hướng là profile riêng. |
| G2 | 2 | Quãng 3 có xen bước liền; cặp móc đơn đúng pha trên mẫu bước liền. |
| G3 | 2 | Quãng 4–5 trong giai điệu hoặc hợp âm rải; cần bằng chứng ngữ cảnh, không chỉ ba pitch tạo triad. |
| G4 | 2 | Vị trí mới cố định; chuyển vị trí thật. Đổi nhãn vị trí không đủ: phải có mapping phím–ngón và mốc vị trí khác nhau. |
| G5 | 2 | Giai điệu tay phải/tay trái với đệm thưa; cùng điểm vào, kiểm âm đang giữ, chéo tay và chung phím. |
| G6 | 6 | Quãng 6/7/8 × lên/xuống; tiếp nối mẫu quen, đối chiếu release/tie và đường di chuyển tại BPM được ghi trong hồ sơ. |
| G7 | 4 | Chấm dôi, tie qua phách, đảo phách, 6/8; so ô/phách bằng phân số. 6/8 dùng phách đen chấm dôi. |
| G8 | 3 | Đọc vùng đàn mới; phối hợp hai tay với cặp móc đơn, tách vai giai điệu trái/phải. Không có profile “mọi thứ khó”. |

Quy tắc nằm trong [grades.v3.json](../../scores/curriculum/grades.v3.json); code trong [curriculum_grades.py](../../buildscripts/pianist/curriculum_grades.py). V2 và lô 14 bài cũ giữ nguyên để kiểm hồi quy; K3 dùng V3 khi triển khai bộ quét.

Mỗi kết quả gắn version/config hash, SHA nguồn/phân tích, khoảng ô, dòng–tay, ngữ cảnh trước/sau, verdict từng phép kiểm và event IDs chứng minh. Thiếu bằng chứng về giọng, ngón/vị trí, vận động, ngữ cảnh mẫu hoặc BPM thì trả `review`; có vi phạm cụ thể thì trả `fail`. Một đoạn được xét với mọi profile, không tự nâng nhãn lên tất cả grade cao hơn. Nếu nguồn còn bè khác, cần `sourceLineHands` có căn cứ; bỏ bè của cùng tay để hạ độ khó bị loại, chưa rõ tay thì giữ `review`.

Hồ sơ tay gồm `handPath` cho từng nốt và `positions` ánh xạ phím–ngón có nguồn tham chiếu. Chuyển tay/nhảy quãng cần `movements` chỉ rõ hai event, khoảng từ lúc nhả thật tới nốt kế (bao gồm cả chuỗi tie), kỹ thuật và phạm vi BPM. Không lấy khoảng onset làm toàn bộ thời gian tay rảnh, không dùng ngưỡng 750 ms như chứng cứ sinh lý. Hồ sơ review vẫn là bằng chứng được khai báo, không phải máy tự chứng minh phù hợp mọi bàn tay.

### Dùng từ bộ quét K3

`assess_all(index, selection, evidence_by_profile, config)` nhận `SourceIndex` từ dữ liệu K1. `selection` chứa `sourceSha256`, `analysisSha256`, `lineHands`, `startMeasure`, `endMeasure`. Không yêu cầu đoạn có tên trong `reviewed-units.v2.json` hoặc một danh sách whitelist.

CLI kiểm các lựa chọn cụ thể:

```powershell
.\.tools\curriculum-python\Scripts\python.exe buildscripts/pianist/grade-curriculum.py --selections artifacts/curriculum-grades/real-selections.json --output artifacts/curriculum-grades/real-source-report.json
```

File đầu vào có dạng `{ "selections": [{ "selection": { ... }, "evidenceByProfile": { ... } }] }`. CLI đọc source/cache ở chế độ chỉ đọc. Đây là công cụ kiểm K2, chưa phải bộ quét mọi đoạn của K3.

## Đối chiếu code gốc và kiểm thử

- Parsing, pitch, quãng có cách viết, hợp âm và hóa biểu dùng music21 10.5.0. Receipt `fixture-verification.json` ghi hash module `interval`, `chord`, `key` đã dùng.
- G1–G8 và R0–R7 là phép kiểm sản phẩm theo [GRADE_DESIGN.md](GRADE_DESIGN.md), không được gán thành thuật toán phân grade có sẵn của music21 hay một chuẩn khoa học đã chứng minh. Không thêm điểm khó cộng trọng số hoặc mô hình tự đoán thế tay/câu nhạc.
- 25 profile có 75 ví dụ `pass` / `fail` / thiếu bằng chứng. Đây là dữ liệu tổng hợp để kiểm code, **không phải nhạc thật hoặc bài tập đưa vào kho**. Có XML, hồ sơ và verdict để mở kiểm tại `artifacts/curriculum-grades/examples/`.
- Kiểm CLI trên 19 đoạn nguồn thật tạo đủ 475 verdict: 436 `fail`, 39 `review`, 0 tự động được phát hành. Không chuyển nguyên receipt V2 sang V3 rồi coi là đã duyệt.
- Bộ kiểm Python có 102 test; log tại `artifacts/curriculum-k1-k2-tests.log`. Kiểm riêng worker với 12 bản nhạc thật khớp hash kết quả lịch sử.

## Bước kế tiếp

K3 nối catalog K1 với bộ tiêu chí V3: duyệt mọi nguồn, xác định biên có căn cứ và xét mọi đoạn liên tục/cấu hình tay phù hợp. K4 mới đối chiếu native và lưu từng bài, ưu tiên ABC nếu bảo toàn nhạc, MXL khi cần. Không đưa 37 nghìn MXL gốc vào gói tải của trình duyệt.
