# Chọn đúng công cụ Pianist

Đọc [tài liệu phát triển hiện hành](../../docs/current/development.md) trước khi chạy. Danh sách đầy đủ và trạng thái từng script nằm trong [tooling-index.json](tooling-index.json); `check-tooling.py` kiểm mọi script ở thư mục này được phân loại đúng một lần và file còn tồn tại. Cổng `check-pianist.py fast` chạy kiểm này.

| Việc cần làm | Điểm vào |
|---|---|
| Dựng ứng dụng hoàn chỉnh | `setup-web.ps1`, `build-pianist.ps1` |
| Chạy local | `serve-web.py` |
| Kiểm source / gói native / một nhóm browser | `check-pianist.py fast` / `native` / `browser --suite …` |
| Kiểm API package và hướng phụ thuộc | `node buildscripts/pianist/check-dependencies.cjs` (cũng thuộc cổng `fast`) |
| Nhận bài vào thư viện | `curate-library.py --append`; luật hai khuông dùng chung trong `library_staff_policy.py` |
| Kiểm nguồn tám grade hiện dùng | `check-authored-grades.py`; cấu hình ở `scores/grades/definition.json` |
| Đóng gói grade hiện có sang MXL để chạy web | `composed-reading-bank.py` |
| Biên tập lại nguồn grade khi có yêu cầu đổi nội dung | Các `package-g*-abc.py` / `package-advanced-abc.py`, sau đó bộ kiểm tương ứng |
| Tạo gói phát hành | `package-web.py`, `stage-release.py`, `verify-release.py` |
| Đưa đúng release lên Pages | `deploy-pages.py` qua workflow; [quy trình](../../deploy/PAGES.md) |

`library_import.py`, `web_bank_release.py`, `grade_definition.py` và các module dấu gạch dưới chủ yếu là thư viện hỗ trợ, không phải tất cả đều là lệnh CLI.

**Nhóm `references`** giữ công cụ tái tạo code/oracle từ upstream đã ghim. Chúng vẫn được bảo trì để đối chiếu nguồn chấm; không cần chạy lại khi chỉ sửa giao diện. Không cập nhật nguồn upstream hoặc đổi thuật toán như một tác dụng phụ của refactor.

**Nhóm `legacy-qk`** thuộc các thử nghiệm kho tải/trích đoạn trước đây. Chúng không tạo kho G1–G8 đang dùng. Giữ đường dẫn để các báo cáo và lab cũ còn truy được; không đưa các lệnh `auto-curriculum`, `complete-curriculum-bank`, `package-reading-bank` vào build mặc định. Trước khi chủ động chạy lại cần đọc kế hoạch lịch sử, input/output và tùy chọn xóa/ghi của chính script đó. Việc có file trên đĩa không chứng minh nó được phát hành.

```powershell
python buildscripts/pianist/check-tooling.py --list grades
python buildscripts/pianist/check-tooling.py --list legacy-qk
```

Khi thêm, đổi tên hoặc bỏ script, cập nhật inventory cùng thay đổi. Thông số toolchain/requirements/lockfile không phải script và vẫn được kiểm bởi build/source pins riêng. Không chuyển nguyên nhóm lịch sử sang thư mục con khi chưa xử lý các import và `ROOT = parents[2]` của chúng.
