# Kho grade đang dùng

Định nghĩa hiện hành: [definition.json](definition.json). Đây là edition `authored-2026-10-22-v1`: 8 grade × 7 khoảng × 100 bài = **5.600 bài**. Nội dung là các bài đã được AI biên soạn và lưu sẵn; không phải đoạn trích từ corpus public MXL, cũng không sinh nốt trong lúc tập.

```text
scores/grades/
  definition.json       # IDs, chủ đề, khoảng nốt, quota, đường dẫn
  authored/g1/ … g8/     # 61 bảng TXT: nguồn nhạc cần đọc/sửa khi có yêu cầu
  generated/g1-abc/ … g8-abc/
    n4/ … n100/         # từng ABC, ví dụ g1-n4-001.abc
    books/              # tập có thứ tự đọc đã duyệt
    index.tsv           # ID → vị trí tập, nhánh, số nốt hai tay
    validation.json     # bằng chứng đóng gói edition
  generated/*.zip      # các gói tải của edition
```

`generated/` được giữ trong Git vì đây là bản nội dung đã duyệt, cần đối chiếu nguyên byte trước khi chuyển đổi. Nó có thể được đóng gói lại từ `authored/`, nhưng việc tổ chức lại thư mục không cho phép tự sinh hoặc thay nhạc. Cache nằm ở `artifacts/`; MXL web nằm ở `build.artifacts/curriculum/`, được tải theo hash trong manifest phát hành. Hai thư mục đó không phải nguồn nhạc.

## Một định nghĩa, nhiều nơi dùng

[grade_definition.py](../../buildscripts/pianist/grade_definition.py) đọc cùng JSON với [adapter TypeScript](../../apps/pianist-web/src/exercises/definition.ts). Packager, bộ kiểm nguồn, publisher, release verifier và bộ chọn grade trên web cùng lấy IDs/7 khoảng/quota từ đây. Các thuật toán duyệt cao độ, nhịp, hợp âm và tie vẫn nằm trong validator được ghi ở mỗi grade; tên chủ đề không thay thế những phép kiểm đó.

Edition này giữ cố định 100 bài/option, số `X:` 1–5600 và thứ tự ID. Đổi quota, số grade, thứ tự khoảng hoặc thuật toán nguồn cần edition mới và kế hoạch chuyển đổi rõ ràng; không đổi JSON để âm thầm đánh lại số bài cũ. Source validator hiện vẫn chứa phân bổ nhánh/vai tay của edition này.

## Vì sao ABC còn ghi đường dẫn cũ?

Các `% source=buildscripts/pianist/compositions/gN/...:dòng` trong ABC và báo cáo là **định danh nguồn lịch sử**, không phải đường dẫn vật lý hiện tại. `definition.json` ánh xạ:

```text
buildscripts/pianist/compositions/  →  scores/grades/authored/
scores/composed/                   →  scores/grades/generated/
```

`logical_source()` tạo lại đúng định danh cũ khi kiểm nguồn ở thư mục mới. Nhờ đó ABC, báo cáo, ZIP, IDs, hash và thứ tự tập không thay đổi. README bên trong `generated/` cũng là tài liệu của edition được giữ nguyên byte; đường dẫn cũ trong đó và trong kế hoạch lịch sử được tra qua bảng trên. Dùng [bản đồ nội dung hiện hành](../../docs/current/content-pipeline.md) để tìm file mới.

## Kiểm và đóng gói

Từ gốc repository:

```powershell
python buildscripts/pianist/check-authored-grades.py
python buildscripts/pianist/composed-reading-bank.py
```

Lệnh đầu chỉ đọc và duyệt 5.600 bài nguồn. Lệnh sau đối chiếu từng ABC/tập/index với nguồn, chuyển bằng abc2xml đã ghim, so từng cao độ/nghỉ/onset/trường độ/khuông/hợp âm/tie rồi mới ghi manifest MXL. Bất kỳ thiếu bài, lệch quota, đổi thứ tự tập hay sai chuyển đổi đều dừng pipeline. Chỉ chạy các `package-*-abc.py` khi thực sự cần đóng gói thay đổi nội dung đã được yêu cầu; không cần chạy chúng khi chỉ build web.

Xem [hướng dẫn edition](generated/G1_G8_ABC_GUIDE.md), [quy tắc duyệt cao độ](../../docs/curriculum/GRADE_PITCH_VALIDATION.md) và [phát hành](../../deploy/PAGES.md).

## Bằng chứng chuyển thư mục

[RELOCATION_REPORT.json](RELOCATION_REPORT.json) ghi kiểm tra ngày 23/10/2026: 5.751 file nguồn/sản phẩm giữ nguyên byte; 5.600 ABC và thứ tự tập khớp nguồn; 5.600 MXL được chuyển mới bằng converter (không dùng cache) rồi đối chiếu toàn bộ sự kiện. Toàn bộ 5.658 file của bản phát hành trùng byte với kho trước chuyển thư mục, kể cả manifest/index; release vẫn là `web-19bd56fc7a853511a57a`. Bộ kiểm theo definition mới chấp nhận đúng kho này. Không cần ghi đè các MXL đang dùng bằng bản giống hệt.
