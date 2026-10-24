# Thư viện piano được phát hành

`songs/` giữ MXL dùng để phát hành. `catalog.json` là danh mục đang dùng; tên hiển thị,
tác phẩm, phiên bản và hash nằm ở đây. Chỉ chuẩn hóa tên font chữ đã kiểm đối chiếu;
không sửa nốt, tie hoặc thời điểm nhả pedal để ép qua bộ nhận.
Các báo cáo `IMPORT_REPORT*.md` là lịch sử từng đợt nhập, không phải số lượng hiện tại.

## Chính sách hiện hành: đủ hai khuông thì nhận

Catalog có **150 phiên bản / 140 tác phẩm**. Khôi phục 35 bản từng bị loại ở đợt
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
- Giữ nguyên workId, số version và bản MXL (ngoài chuẩn hóa tên font có đối soát).
  sourceSha256 liên kết các bản lưu cũ với nguồn trước chuẩn hóa. Không xóa file
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
