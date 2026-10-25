# Giáo trình piano

Kho này phục vụ lựa chọn **Tập piano → Theo giáo trình**. Mỗi bài là một MXL độc lập,
giữ đúng số bài và đủ hai khuông. Tập tay trái/phải/hai tay là lựa chọn trong màn tập,
không phải ba bản nhạc bị tách riêng. Điểm số dùng chung engine của màn tập piano.

| Bộ | Bài hiện có | Toàn bộ cuốn/phần |
| --- | --- | --- |
| Hanon — Phần I | 1–20 | 20 |
| Czerny — Op.599 | 1–60 | 100 |
| Czerny — Op.299 | 1–15 | 40 |
| Burgmüller — Op.100 | 1–18 | 25 |
| Czerny — Op.821 | 1–18 | 160 |
| Czerny — Op.840 | 1–10 | 50 |
| Duvernoy — Op.176, tuyển chọn | 1, 2, 6, 7, 9, 10, 11, 19 | 25 |

Tổng: **7 bộ, 149 bài**. `expectedLessons` chỉ quy mô bản gốc, không phải số bài đã
tải. `missingLessons` ghi rõ bài chưa có. Không tạo bài giả, không tự điền ngón,
không đánh số liên tục để che khoảng thiếu, không tự đặt chuẩn “pass” cho giáo trình.

## Cây thư mục

- `catalog.json`: dữ liệu gọn cho ứng dụng, chỉ trỏ tới bài có file đã kiểm.
- `sources.json`: công thức nhập với URL, SHA-256 ghim cố định, thành viên ZIP nếu có,
  bằng chứng nguồn/giấy phép. Không cần đưa file này vào bản web.
- `<book-id>/<lesson-id>.mxl`: bản nhạc nguồn; file MXL gốc được giữ nguyên byte,
  XML gốc chỉ được bọc ZIP theo chuẩn MXL mà không sửa nội dung.
- `NOTICE.txt`: nguồn, quyền sử dụng và các giới hạn được đóng gói cùng bản web.

`lesson.file` có dạng `methods/<book-id>/<lesson-id>.mxl`, tính từ gốc tài nguyên
`scores/`. Không trỏ tới thư viện bài hát, kho grade hay đường dẫn trên máy tác giả.

## Kiểm tra và bổ sung

Kiểm tra offline toàn bộ bài đã commit:

```powershell
python buildscripts/pianist/prepare-method-books.py --verify
```

Tái tạo từ nguồn đã ghim (mạng chỉ dùng khi cache thiếu):

```powershell
python buildscripts/pianist/prepare-method-books.py --download
```

Cache nằm tại `artifacts/method-books/cache/`. Với các bài PDMX, importer tái sử dụng
MXL gốc đã commit nếu hash trùng; không cần tải lại cả kho 1,9 GB. Khi thêm bài PDMX
mới, cung cấp `localFile` và hash của file gốc đã được tải từ bộ dữ liệu.

Để thêm bài: xác minh cuốn/số bài và nguồn, thêm mục vào `sources.json`, chạy importer,
kiểm release bằng `methods_release.py` và chạy kiểm native MuseScore trước phát hành.
Hash nguồn thay đổi sẽ làm importer dừng để được rà soát; không tự thay bản nhạc.
Importer kiểm đủ hai khuông bằng cùng chính sách thư viện, giữ nguyên dấu hóa, nhịp,
repeat, lời chỉ dẫn và số ngón. Toàn bộ đầu vào phải đạt trước khi ghi tài nguyên ra.

WhiteNote công bố file để dùng công khai nhưng không có giấy phép định danh cho các
bản chép. Nhãn `LicenseRef-WhiteNote-Public-Use` ghi đúng thực trạng đó, không đổi thành
CC0. Các file Noctave và PDMX có ghi quyền tương ứng theo từng bài; xem `NOTICE.txt`.
