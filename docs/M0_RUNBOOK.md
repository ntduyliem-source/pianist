# Chạy bản thử Pianist Web M0

M0 kiểm chứng editor MuseScore thực sự trong trình duyệt. Đây là bản kỹ thuật cục bộ, chưa có thư viện IndexedDB, chế độ tập, chấm BPM hay tài khoản. Xem [kết quả và giới hạn đã kiểm chứng](M0_RESULTS.md).

## Nền mã và công cụ

- Fork: https://github.com/ntduyliem-source/pianist
- Nhánh làm việc: `pianist/m0-web`.
- Upstream: MuseScore Studio `v4.7.5`, commit `3654226c2e99289916916953a98e585a3d3b315a`.
- Qt 6.10.2 `wasm_singlethread`, Emscripten 4.0.7. Host Qt Windows chỉ cung cấp công cụ build; sản phẩm đầu ra là JavaScript/WebAssembly.
- Phiên bản đầy đủ: `buildscripts/pianist/toolchain.json`.
- Máy phát triển cần Windows, PowerShell, Git, Python 3.11+ và Node.js trên PATH. Dành dung lượng cho source, SDK, archive và build; dùng ổ còn trống cho cả thư mục project lẫn TEMP.

## Build và phục vụ cục bộ

Tại thư mục gốc repo, chạy lần lượt:

```powershell
.\buildscripts\pianist\setup-web.ps1
.\buildscripts\pianist\build-web.ps1 -Target audio
.\buildscripts\pianist\build-web.ps1 -Target app -FastLink
python buildscripts/pianist/prepare-fixtures.py
python buildscripts/pianist/serve-web.py
```

Mở `http://127.0.0.1:8787/pianist.html` bằng Chrome/Edge trên máy tính. Máy người dùng chỉ chạy trình duyệt; không cần cài ứng dụng MuseScore.

Các SDK nằm trong `.tools`, output trong `build.artifacts`, thư mục build là `build.m0` và `build.audio.m0`. Tất cả đều được bỏ qua bởi Git. Build log nằm ở `artifacts/m0`. Có thể chạy build app với `-SkipConfigure` khi đã cấu hình; Ninja vẫn tự chạy lại CMake khi input CMake thay đổi. `-Jobs 12` là mặc định, có thể giảm trên máy ít RAM.

Script setup đã được chạy trên workspace này; chưa kiểm chứng cài mới trên máy Windows sạch. Nên đặt repo ở đường dẫn ngắn, ổ đủ chỗ và bật `git config core.longpaths true` cho checkout Windows.

`-FastLink` giữ tối ưu C++ Release nhưng bỏ các lượt tối ưu Binaryen tốn thời gian ở bước liên kết, phù hợp kiểm thử port M0. Để đo bản tối ưu phát hành, chạy lại app **không có** `-FastLink` và **không có** `-SkipConfigure`; sau đó chạy lại nghiệm thu. Số đo của bản FastLink không đại diện cho kích thước bản phát hành cuối.

Server chỉ bind loopback và đặt MIME cho WASM, COOP/COEP cùng các header cần thiết. Chưa triển khai lên hosting. Không mở HTML bằng `file://`.

Nếu chỉ sửa file JavaScript/HTML của bridge sau khi đã build, sao chép lại bằng:

```powershell
node src/web/appjs/install.js build.artifacts
```

## Thao tác trong trình duyệt

1. Mở trang: editor hiển thị trực tiếp bản piano trống 16 ô nhịp, hai khuông. Thanh công cụ, palette, Properties, Mixer, bàn phím và các dialog được dùng lại từ MuseScore.
2. **File → Open… / Ctrl+O** để chọn `.mxl`, `.musicxml`, `.xml`, `.mscz`, `.mscx`. **File → New… / Ctrl+N** tạo bản piano trống khác.
3. Chọn nốt và sửa trong vùng editor. Dùng **View → Palettes / Layout / Properties**, hoặc F9/F7/F8. Kéo đường chia để thay đổi kích thước panel.
4. **File → Save / Ctrl+S** tải MSCZ. **File → Export… / Ctrl+Shift+E** mở hộp chọn MXL hoặc MusicXML. Chưa có autosave hay thư viện trình duyệt trong M0.
5. Trước khi đổi bài có thay đổi chưa lưu, chọn **Save / Discard / Cancel**. Mở lại file vừa tải để xác minh thay đổi. Dấu `*` phản ánh trạng thái project từ engine, bao gồm thiết lập âm thanh.
6. Dùng Play, rewind, metronome và tempo trên toolbar MuseScore. Web Audio được chuẩn bị trước và mở khóa khi có thao tác người dùng; không cần nút bật tiếng riêng. Đã thấy con trỏ chạy và Mixer có tín hiệu; chưa đo latency/loa thật.
7. Thanh dưới cùng có thông tin nốt đang chọn, Concert pitch, Page/Continuous view và zoom. **View → Piano keyboard / Mixer / Navigator** mở các panel; **Restore default layout** khôi phục bố cục.

Giao diện bình thường không hiển thị nút/log kỹ thuật. Chỉ khi thêm `?diagnostics=1` vào URL mới có các nút nghiệm thu bridge. Test tự động tự thêm tham số này; luồng menu và dialog của người dùng được kiểm tra riêng trong [báo cáo M0](M0_RESULTS.md).

Các phím đã kiểm tra: Ctrl+A, ArrowUp, Ctrl+Z, Delete, N, 5, C, D, Escape; phím 4 đổi sang móc đơn. Ctrl+C/Ctrl+V đạt trên Chrome/Edge khi có quyền clipboard. Nếu Ctrl+V không nhận trên bản Chromium khác, dùng Edit → Paste; chưa đảm bảo clipboard giữa các ứng dụng.

Giới hạn bridge hiện tại: 32 MiB cho file đầu vào; đây là giới hạn bytes nén, chưa phải ngân sách giải nén hay chính sách hỗ trợ mọi score. File lỗi không được thay thế project đang mở nếu importer trả về lỗi. Parts và Page settings đã được mở thử; chưa nghiệm thu toàn bộ dialog hoặc tính năng MuseScore.

## Nghiệm thu tự động

Test cần server đang chạy, Node.js, Python và Playwright Chromium. Cài phụ thuộc test vào `tests/browser/pianist`:

```powershell
npm --prefix tests/browser/pianist ci
Push-Location tests/browser/pianist
npx playwright install chromium
Pop-Location
node tests/browser/pianist/m0-smoke.cjs
```

Có thể dùng Playwright có sẵn bằng `NODE_PATH`. Khi ổ hệ thống ít chỗ, đặt `TEMP`, `TMP`, npm cache và `PLAYWRIGHT_BROWSERS_PATH` vào ổ chứa project trước khi cài. `PIANIST_URL` thay URL mặc định; `PIANIST_PYTHON` thay lệnh Python nếu cần.

Đặt `PIANIST_BROWSER_CHANNEL=chrome` hoặc `msedge` để kiểm tra trình duyệt đã cài trên máy; kết quả sẽ nằm trong `artifacts/m0/chrome` hoặc `artifacts/m0/msedge`. Mặc định dùng Chromium của Playwright.

Test chạy 12 ca: mở MXL từ file input, sửa cao độ thật, undo/redo, tải MSCZ/MXL, mở lại, nhập/xóa nốt và đổi trường độ bằng bàn phím. Nội dung được so sánh bằng parser Python độc lập. Archive lỗi và XML hỏng phải giữ project đang mở, không abort runtime. Bằng chứng gồm MusicXML trước/sau, file MSCZ/MXL, screenshot, console và `result.json` trong `artifacts/m0/browser`.

Khảo sát thêm palette, Properties, clipboard, zoom, popup và PCM:

```powershell
$env:PIANIST_BROWSER_CHANNEL = 'chrome'
node tests/browser/pianist/m0-smoke.cjs
node tests/browser/pianist/m0-panels.cjs
```

Đổi thành `msedge` để kiểm tra Edge. Khảo sát bổ sung cấp quyền clipboard trong context test riêng; đọc từng cờ `passed` trong `artifacts/m0/panels-chrome/result.json`, không chỉ nhìn exit code. Screenshot dùng viewport 1440×1000 và fixture cố định; nếu đổi UI, cập nhật tọa độ dựa trên hình thực tế.

Corpus ban đầu chỉ gồm bài piano hai ô nhịp tự tạo (CC0), hai khuông, hợp âm, dấu lặng, tempo và tiêu đề tiếng Việt. Test này chưa đại diện cho toàn bộ MusicXML, repeats/voltas, tuplets, nhiều bè hoặc mọi dialog của MuseScore. Các chức năng đó phải được đánh giá riêng trước khi tuyên bố hỗ trợ.

## Giấy phép

Giữ nguyên LICENSE, thông báo bản quyền và giấy phép tài nguyên của upstream. Fork dựa trên MuseScore GPL-3.0; việc phát hành engine web và các thành phần liên kết phải được rà soát theo giấy phép tương ứng. Âm thanh mẫu sử dụng tài nguyên `MS Basic.sf3` đã có trong repo; giữ kèm giấy phép nguồn khi đóng gói bản phát hành.
