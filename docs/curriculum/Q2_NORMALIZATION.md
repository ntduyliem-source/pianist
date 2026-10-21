# Q2 — Chuẩn hóa nhạc và đối chiếu MuseScore

Ngày nghiệm thu theo máy người dùng: **20/10/2026** (log UTC sang 21/10).

Q2 bổ sung pipeline chạy trên máy build. music21 đọc cấu trúc nhạc; MuseScore native đang dùng trong ứng dụng là đối chứng độc lập. Bộ chấm BPM, trường độ và pedal không thay đổi. Chưa có route quiz mới ở bước này.

## Phạm vi nghiệm thu

Chạy một pilot tái lập được gồm **627 nội dung MXL khác hash**: 512 PDMX, 96 OpenScore Lieder, 19 bài cá nhân hiện có. Hai nguồn lớn chọn theo thứ tự SHA256, không theo tên bài hay nhãn “easy”. Đây là mẫu kiểm pipeline, không phải bộ bài đã chia grade hay mẫu đại diện sư phạm.

- 334 file đọc được qua music21: 223 PDMX, 92 OpenScore, toàn bộ 19 bài cá nhân.
- 292 file chưa có tên nhạc cụ đủ rõ là piano hoặc có tên nhạc cụ mâu thuẫn. Không coi đây là file nhạc hỏng.
- Một file vượt phạm vi hỗ trợ 4 khuông/part của bộ phân tích này, được giữ nguyên kèm mã chặn.
- **37.002 / 37.629 file hợp lệ của Q1 chưa chạy Q2 trong lượt nghiệm thu này.** Công cụ có thể tiếp tục toàn kho và dùng lại kết quả đã kiểm.

Số đối chiếu native, số đủ điều kiện vào hàng đợi xem xét trích đoạn và bằng chứng kiểm thử nằm trong [verification.json](q2/verification.json). “Đủ điều kiện xem xét” chưa có nghĩa đúng grade, có thế tay tốt hoặc đủ quyền phát hành. Không có bài nào được tự chuyển thành `public-approved`.

| Nguồn pilot | File đã xử lý | music21 đọc được / đã đối chiếu native | Khớp dữ liệu native | Không còn blocker để xét đoạn |
|---|---:|---:|---:|---:|
| PDMX | 512 | 223 | 207 | 155 |
| OpenScore Lieder | 96 | 92 | 14 | 1 |
| Thư viện cá nhân | 19 | 19 | 13 | 5 |
| **Tổng** | **627** | **334** | **234** | **161** |

100 file chưa qua gate native, trong đó một lần API native không đọc được bản toàn bài. Các lý do xuất hiện nhiều gồm voice đổi khuông cần xử lý riêng, số nốt khác nhau do ký hiệu chưa hỗ trợ, liên kết tie và pedal không khớp. Một file có thể có nhiều lý do. Đây là trạng thái tuyển nguồn cho quiz, không phải kết luận mọi file bị chặn đều là bản nhạc sai.

**Kiểm thử:** 42 test Python và 137 test web qua; build TypeScript/Vite và `pip check` qua. 12 fixture live native đạt đúng kỳ vọng (8 ca nhận, 4 ca chặn). 15 file bộ chấm giữ nguyên SHA256 và hash nội dung catalog Q1 vẫn khớp mốc Q1. Chạy lại dùng cache 627/627 kết quả chuẩn hóa, 334/334 receipt native, không phát sinh job native mới.

## Đường code và nguồn đối chiếu

Khóa bộ **24 package, gồm music21 10.5.0**, defusedxml và các dependency trực tiếp/gián tiếp bằng phiên bản và SHA256 wheel trong [lock Windows Python 3.11](../../buildscripts/pianist/curriculum-normalize-win-py311.lock). Môi trường nằm ở `.tools/curriculum-python`, độc lập với Python hệ thống. Thư viện này không được đưa vào browser bundle.

[Bản phát hành music21 10.5.0](https://github.com/cuthbertLab/music21/releases/tag/v10.5.0) có sửa cách áp dụng clef không ghi số khuông. Đã đối chiếu trực tiếp [xmlToM21.py tại v10.5.0](https://github.com/cuthbertLab/music21/blob/v10.5.0/music21/musicxml/xmlToM21.py), đặc biệt `xmlToNote`, `xmlToChord`, `xmlBackup`, `xmlForward`, `xmlNoteToGeneralNoteHelper` và `xmlDirection`.

[Adapter Q2](../../buildscripts/pianist/curriculum_normalize.py) gọi nguyên các phương thức upstream qua `super()`. Lớp quan sát chỉ gắn định danh phần/ô nhịp/nốt gốc, giữ trường độ phân số từ XML để phát hiện thay đổi, và ghi thời điểm direction do parser xác định. Patch lớp được giới hạn trong một lần import, có `finally` khôi phục; chạy batch bằng process riêng, không dùng nhiều thread cùng sửa parser.

Quãng dùng `music21.interval.Interval`: C–C♯ là quãng đồng âm tăng, C–D♭ là quãng hai thứ dù cùng cách một bán cung. Dữ liệu không đổi tên nốt dựa trên MIDI. Dấu 8va dùng [Ottava.interval của upstream](https://github.com/cuthbertLab/music21/blob/v10.5.0/music21/spanner.py): giữ cả cao độ phải bấm và cách ghi nốt trên khuông. MusicXML biểu diễn pitch của ottava theo cao độ phát ra; không cộng thêm một octave lần nữa.

Đối chứng native dùng `EngineBridge.semantics(bytes, filename)` và `WebApi::prepareProject()` của fork hiện tại. Cùng byte XML được kiểm SHA256 trước khi đưa vào MuseScore. Harness kiểm hash JS/WASM với `release.json` rồi lưu engine build, hash source, hash analysis, hash code validator và snapshot thực tế.

## Dữ liệu được giữ

| Nội dung | Cách lưu / kiểm |
|---|---|
| Nguồn | SHA256 nối về catalog Q1; giữ mọi provenance ở catalog, không chọn một tên làm đại diện cho các nguồn trùng nội dung. |
| Nốt | Step, alter, octave, sounding MIDI, written pitch, accidental hiển thị, type/dot/time-modification, vị trí XML gốc. |
| Thời gian | Phân số tối giản theo quarter note; không đổi sớm sang millisecond. Không làm tròn 1/7 quarter sang tick 480 PPQ để ép khớp. |
| Part/khuông/bè | Part ID gốc, staff gốc và voice dạng chuỗi; so khớp toàn bộ nhóm nốt để ánh xạ voice native. Không giả định voice “5” là tay trái. |
| Ngữ cảnh | Các đổi clef, key, meter; tempo, slur, direction 8va/pedal còn gắn vị trí. XML nguyên gốc vẫn là nguồn ký âm đầy đủ. |
| Tie / hợp âm | Định danh tie đầu–cuối khi liên kết rõ ràng; từng pitch của chord giữ duration riêng. Trường độ khác nhau trong một chord bị chặn nếu upstream không biểu diễn tương đương. |
| Quan hệ giai điệu | Chỉ nốt tấn công đơn trong cùng line; chord/rest/overlap không bị coi là một quãng giai điệu. Các quãng xuất ra ghi rõ cơ sở `sounding-spelled-pitch`. |
| Tay/ngón | `hand: null`, `handAssignment: unreviewed`. Q3 phải áp template đã duyệt; không suy thế tay từ khoảng MIDI. |
| Điểm cắt sơ bộ | Biên ô nhịp và danh sách tie, nốt giữ, pedal đi qua; `structurallyClear` chỉ là một điều kiện cấu trúc, chưa phải câu tập hợp lệ. |

Clef/8va có fixture kiểm thêm ký hiệu trong MSCZ do MuseScore vừa lưu. Bộ so sánh snapshot tổng quát kiểm cao độ/cách viết nốt, thời điểm/trường độ, khuông/bè, tie, rest tường minh, key, meter và pedal. Nó không tuyên bố kiểm mọi chi tiết khắc nhạc bằng tọa độ; Q0 đã có kiểm glyph/anchor, còn Q3 phải dựng lại và kiểm từng trích đoạn cụ thể.

## Gate trước khi dùng làm câu tập

1. Q1 ZIP/XML và hash nguồn phải còn đúng. Chọn part piano bằng tên nhạc cụ rõ ràng; mã chương trình MIDI một mình không đủ.
2. music21 import không được âm thầm làm mất ký hiệu: ghi issue cụ thể cho grace, ornament, cue, pedal không hỗ trợ, tie hở, backup không hợp lệ, direction dạng chữ cần xem lại, v.v.
3. So từng nhóm nốt với native bằng pitch/spelling/onset/duration/staff/voice. Thất bại trả mã riêng; không sửa nốt hoặc nới sai số để ép qua.
4. Dùng **chính `createTimeline()` hiện tại** cho số target sau gộp tie/unison; kiểm cả hàng target và số onset. Không có bộ đếm/chấm BPM mới viết bằng Python.
5. Chỉ khi native khớp và không còn blocker mới có `eligibleForFragmentReview: true`. Q3 vẫn cần kiểm đoạn, grade, thế tay, độ đa dạng và quyền phát hành.

Theo [MusicXML duration](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/duration/), duration cũng điều khiển backup/forward; không thể lấy thứ tự XML như thứ tự chơi. [MusicXML note](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/note/) phân biệt tie cho âm thanh và tied cho ký âm. Các trường này được giữ và kiểm, không thay bằng một parser khảo sát tự viết.

Một file có ký hiệu cần xử lý ở ngoài đoạn mong muốn không bị xóa. Issue giữ vị trí khi xác định được. Q3 có thể tạo đoạn khác tránh ký hiệu đó và chạy lại **toàn bộ gate trên XML của đoạn**. Không được bỏ cờ trên bản toàn bài rồi coi phần còn lại tự động hợp lệ.

## Chạy lại / tiếp tục

```powershell
# Cài môi trường build độc lập, wheel bắt buộc đúng hash.
powershell -File buildscripts/pianist/setup-curriculum.ps1

# Pilot đã chạy; thứ tự chọn theo SHA256, có cache.
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/normalize-curriculum.py normalize --collection pdmx --limit 512
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/normalize-curriculum.py normalize --collection openscore-lieder --limit 96
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/normalize-curriculum.py normalize --collection user-library

# Tiếp tục mọi file Q1, tối đa 4 process; lưu kết quả sau từng file.
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/normalize-curriculum.py normalize

# Native oracle dùng preview local đang chạy ở :8787.
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/normalize-curriculum.py export-native
node tests/browser/pianist/q2-native.cjs
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/normalize-curriculum.py import-native

# Bộ test và các fixture riêng.
.tools/curriculum-python/Scripts/python.exe -m unittest discover -s tests/curriculum -v
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/prepare-q2-fixtures.py
node tests/browser/pianist/q2-native.cjs --jobs artifacts/q2-fixtures/jobs.json
npm.cmd --prefix apps/pianist-web test
npm.cmd --prefix apps/pianist-web run build
```

`--timeout` mặc định 45 giây/file, `--max-notes` 20.000 và `--workers` từ 1 đến 4. Đây là giới hạn vận hành, không phải phân cấp khó/dễ. Process quá hạn bị kết thúc và file có mã lỗi; không làm mất kết quả đã lưu. Chỉ một tiến trình CLI được sửa cùng output tại một thời điểm.

`artifacts/curriculum-normalized/normalization.sqlite` tách khỏi catalog Q1 mở read-only. Cache gắn hash code/lock/config, kiểm lại hash đầu vào, tự dựng lại blob hỏng. Receipt native lỗi thời do đổi source/parser/validator/engine không được dùng cho gate hiện tại. Raw corpus, venv, database và full snapshot không commit hoặc đưa lên web.

Sau `import-native`, `export-native` bỏ qua các receipt còn đúng phiên bản (cả kết quả khớp lẫn bị chặn có bằng chứng). Dùng `--refresh-native` để kiểm lại chúng, chẳng hạn sau một lỗi import tạm thời. Không dùng việc đổi BPM hoặc nới sai số để sửa một mismatch.

## Việc kế tiếp — Q3

Tạo trích đoạn theo biên hợp lệ và khoảng 4–64 **target**, gắn profile grade có điều kiện riêng, phân nhóm motif/gần trùng và thống kê thiếu nội dung. Đợt phân tích toàn kho tiếp theo phải đi cùng nhu cầu độ phủ; 627 file pilot không được dùng để suy ra đã đủ 1.000 đoạn/grade hay 10.000 câu/grade.

Q2 chưa tạo UI quiz, chưa đặt tiêu chuẩn pass mới, chưa tự gán thế tay/ngón, và chưa đưa 37 nghìn bài lên GitHub Pages. MIDI thật vẫn nằm ngoài lần nghiệm thu này.
