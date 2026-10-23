# Bản đồ nội dung nhạc

Cập nhật ngày 23/10/2026. Phân biệt **thư viện bài hát**, **nguồn grade hiện dùng**, **tài nguyên build** và **kho nghiên cứu local**. Không phải mọi MXL có trên đĩa đều thuộc ứng dụng.

## Tìm đúng file

| Cần tìm | Nơi lưu | Vai trò |
|---|---|---|
| Catalog bài hát được phát hành | `scores/library/catalog.json` | Tên, tác giả, version, URL, bytes, SHA-256; nguồn quyết định danh sách |
| MXL từng bài hát | `scores/library/songs/<slug>.mxl` | File được catalog tham chiếu; giữ nguyên nội dung nhạc đã duyệt |
| Lịch sử nhận/bỏ thư viện | `scores/library/IMPORT_REPORT.md` và receipts liên quan | Bằng chứng theo đợt, không thay catalog hiện hành |
| Nội dung biên soạn gốc của grade | `buildscripts/pianist/compositions/g1/` … `g8/` | Văn bản nguồn chứa các ô nhịp hai tay đã viết sẵn |
| Từng bài ABC có tên dễ tìm | `scores/composed/g1-abc/n4/g1-n4-001.abc` | Sản phẩm đóng gói từ nguồn; đổi grade/khoảng/ID theo bài cần tìm |
| Thứ tự trong tập và đặc điểm từng bài | `scores/composed/gN-abc/index.tsv` | Tra score ID, book position, số lần đánh và nhánh bài |
| Tập ABC gộp | `scores/composed/gN-abc/books/` | Một tập 100 tune; không tính là 100 bài mới ngoài file riêng |
| Hướng dẫn/kết quả kiểm từng grade | `scores/composed/gN-abc/README.md`, `validation.json` | Nội dung thực tế và bằng chứng đóng gói bộ đó |
| MXL grade dùng trên web | `build.artifacts/curriculum/<release>/exercises/<sha256>.mxl` | Tài nguyên phát sinh, xác minh theo manifest; không sửa tay |
| Map tên bài → MXL hash | `build.artifacts/curriculum/<release>/indexes/gN-nX.json` | Tra `scoreId`, `bookPosition`, `path`, `abcSha256`, số nốt từng tay |
| Con trỏ release grade | `build.artifacts/curriculum/manifest.json` | Chỉ đúng bộ `index.json` + SHA-256 của release đang đóng gói |
| Cache chuyển đổi/đối chiếu | `artifacts/composed-reading-cache/` | Có thể dựng lại; không phải nguồn bài |
| Kho tải nghiên cứu | `warehouse/`, `scores/curriculum/`, các artifact Q/K | Không tự động phát hành và không phải nguồn grade G1–G8 hiện tại |
| Ví dụ local | `examples/local/` | Không đưa vào gói public; gồm các nguồn local theo máy |
| Bản người dùng chỉnh sửa | IndexedDB của trình duyệt | Không nằm trong `scores/library/`; sao lưu qua ứng dụng |

`gN`, `nX`, `<release>` và `<sha256>` trong bảng là ký hiệu thay thế, không phải tên thư mục nguyên văn.

## Kho grade hiện tại là gì

Kho đang dùng gồm **5.600 bài: 8 grade × 7 khoảng × 100 bài**, mỗi bài có đủ hai khuông và nốt thật ở hai tay. Người dùng chọn chấm một tay vẫn xem cùng bản nhạc hai khuông. Browser chọn thứ tự hoặc random trong bộ đã tải, không trích đoạn nhạc thật theo thời gian thực.

Đây là nội dung AI biên soạn cố định trong `compositions/`, không phải 5.600 đoạn trích từ kho public MXL. Các bài có motif/biến thể liên quan; 5.600 file không có nghĩa 5.600 giai điệu độc lập. Xem [hướng dẫn kho](../../scores/composed/G1_G8_ABC_GUIDE.md).

| Option | Số lần đánh của cả hai tay |
|---|---:|
| n4 | 3–5 |
| n6 | 6–8 |
| n10 | 9–14 |
| n20 | 15–24 |
| n30 | 25–39 |
| n50 | 40–69 |
| n100 | 70–120 |

Nghỉ không tính; mỗi phím của hợp âm tính một attack; phần giữ tiếp của tie không thêm attack. Mục tiêu cũ 300 bài/option không mô tả số lượng kho hiện đang chạy: hiện tại là 100/option.

Lần sửa validator ngày 23/10/2026 chỉ mở khả năng kiểm cao độ theo tám grade, không sinh hay thay nhạc. Kho thực tế vẫn có 29 phím trắng; validator có thể nhận A0–C8 theo điều kiện grade không đồng nghĩa nội dung đã phủ 88 phím. Xem [quy tắc duyệt](../curriculum/GRADE_PITCH_VALIDATION.md).

## Tra một MXL từ ID dễ đọc

Ví dụ sau chỉ đọc chỉ mục của release local, không thay đổi kho:

```powershell
$gradeManifest = Get-Content build.artifacts/curriculum/manifest.json -Raw | ConvertFrom-Json
$gradeIndexPath = "build.artifacts/curriculum/$($gradeManifest.releaseId)/indexes/g1-n4.json"
$gradeRows = (Get-Content $gradeIndexPath -Raw | ConvertFrom-Json).entries
$gradeRows | Where-Object scoreId -eq 'g1-n4-001' | Select-Object scoreId, bookPosition, path, sha256, countRight, countLeft
```

Thứ tự ID `001` không nhất thiết là thứ tự khó hoặc vị trí trong tập. Dùng `bookPosition` khi cần tái hiện thứ tự tập. Hash trong tên MXL bảo vệ tính toàn vẹn; tên dễ đọc được giữ trong index, không nên đổi tất cả MXL hash thành slug.

## Bổ sung hoặc loại bài đúng đường

- **Thư viện:** chỉ nhận piano đủ hai khuông theo dữ liệu native; một part hai khuông hoặc hai part piano mỗi part một khuông đều có thể hợp lệ, không chỉ kiểm tên file hay số part. Chuẩn bị input + báo cáo kiểm native, dùng `curate-library.py --append`/`library_import.py`; bản trùng byte bỏ qua, bản khác cùng tác phẩm có version. Khi tên/tác giả chưa đủ định danh, khai báo `workId` hoặc `newWork`. Không tự gộp các tác giả đã biết nhưng khác nhau chỉ vì cùng tên.
- **Loại bài:** thay catalog và file được duyệt trong cùng thay đổi, lưu lý do/receipt. Yêu cầu loại bài thư viện đã được người dùng cho phép là ngoại lệ nội dung của đợt refactor; không xóa kho grade hoặc sửa nhạc để che lỗi.
- **Grade:** sửa nội dung nguồn chỉ khi có yêu cầu đổi kho; chạy bộ duyệt grade và converter trước khi đóng gói. Không chỉnh trực tiếp file trong `build.artifacts/`. Đổi số grade/option/định dạng cần cập nhật schema có version, loader và tests đồng bộ.
- **Đóng gói:** `composed-reading-bank.py` đối chiếu nguồn, giữ số nốt/khuông/timing/tie, viết index + MXL + manifest. `package-web.py` và release verifier chỉ lấy những asset thuộc manifest/catalog.

Các scripts Q/K và corpus cũ vẫn giữ để tra lịch sử. Không chạy lại một script lịch sử chỉ để bổ sung bài vào kho đang dùng; trước tiên xác định source, schema đầu ra và pipeline có thực sự đọc nó hay không.
