# Bằng chứng M0, 16/10/2026

Được tạo bởi bản build của nhánh `pianist/m0-web`, dựa trên MuseScore `3654226c2e99289916916953a98e585a3d3b315a`. Chi tiết môi trường, phạm vi và giới hạn nằm trong [M0_RESULTS.md](../M0_RESULTS.md).

Các file `core-*`, `features-*` là baseline tự động của commit `d005272d`. Các file `shell-*` ghi bằng chứng kiểm tra tương tác sau khi hoàn thiện giao diện MuseScore; không dùng kết quả baseline để khẳng định đã chạy lại script headless trên giao diện mới.

- `core-chrome.json`, `core-edge.json`: 12 kiểm tra cốt lõi, startup và heap.
- `features-chrome.json`, `features-edge.json`: Properties, palette, clipboard và PCM; các screenshot chỉ chứng minh phần nhìn thấy.
- `01-imported.musicxml`, `01-plain-xml-imported.musicxml`: bài mẫu sau nhập MXL/XML; `02-edited.musicxml`: tất cả nốt đã tăng một bán cung.
- `05-saved.mscz`, `06-exported.mxl`: bytes tải từ editor sau sửa; `07-project-reopened.musicxml`: dữ liệu sau mở lại MSCZ.
- `18-added-reopened.musicxml`: dữ liệu sau xóa nốt cũ, nhập hai nốt mới và lưu/mở lại.
- `editor.png`, `settings.png`: giao diện thật, không phải mockup.
- `shell-editor.png`, `shell-in-app.json` và các file `shell-*`: giao diện mới và các lần lưu/xuất qua menu, phím tắt, dialog của người dùng.

Chạy lại bằng các lệnh trong [runbook](../M0_RUNBOOK.md). Log và toàn bộ file trung gian nằm ở `artifacts/m0` trên máy phát triển, được bỏ qua bởi Git. Không cần binary hoặc SDK để đọc bằng chứng này.

![Editor MuseScore trong trình duyệt sau khi hoàn thiện shell](shell-editor.png)
