# Phát triển và kiểm thử Pianist

Điểm vào: [tài liệu hiện hành](README.md), [kiến trúc](architecture.md), [bản đồ nội dung](content-pipeline.md). Quy trình release ở [release.md](release.md) và [deploy/PAGES.md](../../deploy/PAGES.md).

[Bản đồ công cụ](../../buildscripts/pianist/README.md) phân biệt pipeline đang dùng, công cụ đối chiếu nguồn upstream và thử nghiệm Q/K lịch sử. Mỗi script phải được đăng ký trong inventory; CI báo lỗi khi có script mới chưa phân loại hoặc đường dẫn đã mất.

## Chạy checkout trên Windows

Dùng PowerShell 7 và toolchain đã ghim trong `buildscripts/pianist/toolchain.json`. Các lệnh dưới đây chạy từ root repository, trừ chỗ có `Push-Location`. `setup-web.ps1` chuẩn bị dependencies; checkout mới cần build native trước khi mở app.

```powershell
& ./buildscripts/pianist/setup-web.ps1
& ./buildscripts/pianist/build-pianist.ps1
python buildscripts/pianist/serve-web.py
```

Mở <http://127.0.0.1:8787/pianist.html>. Server mặc định chỉ phục vụ loopback. Vite xuất shell vào `build.artifacts/app/`; website hoàn chỉnh còn cần loader, JS/WASM MuseScore, renderer, bộ tiếng, manifest và tài nguyên được scripts chuẩn bị. Chạy Vite đơn lẻ không dựng đủ ứng dụng.

Khi chỉ sửa TypeScript/CSS và đã có native tương ứng:

```powershell
& ./buildscripts/pianist/build-pianist.ps1 -SkipEngine -SkipInstall
```

Chỉ dùng `-SkipInstall` khi lockfile/dependencies đã được cài. Chỉ dùng `-SkipEngine` khi không thay source/API native và bộ binary local đúng phiên bản cần kiểm. Nếu thay C++ hoặc JS glue phải dựng/cài lại đúng target trước khi gọi package-web.

## Build từng target

```powershell
& ./buildscripts/pianist/build-web.ps1 -Target audio -Jobs 6
& ./buildscripts/pianist/build-web.ps1 -Target app -Jobs 6
& ./buildscripts/pianist/build-renderer.ps1 -Jobs 6 -Publish
```

App và renderer dùng chung `build.m0/`: chạy lần lượt, không cấu hình/link hai target này cùng lúc. Build tối ưu có bước `wasm-opt` chạy lâu mà log ít; kiểm đúng tiến trình/log trước khi kết luận bị treo. `-FastLink` chỉ dành cho development, không đưa binary đó vào release tối ưu. `-SkipConfigure` chỉ dùng khi CMake cache đúng target/cấu hình; wrapper renderer có kiểm chế độ fast-link.

## Chọn kiểm thử theo phạm vi sửa

Lệnh kiểm thống nhất là `check-pianist.py`; xem [validation.md](validation.md) để biết môi trường, từng cổng và report. `fast` kiểm source, không cần binary native. `native` kiểm gói đã build và chạy các browser suite tuần tự; runner không tự build hoặc tải WASM.

```powershell
python buildscripts/pianist/check-pianist.py fast
python buildscripts/pianist/check-pianist.py native --list
python buildscripts/pianist/check-pianist.py browser --suite practice-stop
```

CI `.github/workflows/pianist-checks.yml` chạy cổng source trên push/PR/manual với dependencies ghim. Kết quả tổng hợp được ghi ở `artifacts/checks/<timestamp>-<mode>/report.json`. Không diễn giải việc CI source đạt là native/browser đã đạt; cổng native phải có report riêng cho gói đang kiểm.

| Thay đổi | Kiểm chính |
|---|---|
| TypeScript/domain/UI contracts | `npm test`, `npm run build` trong `apps/pianist-web/` |
| Library/version/validator grade | Python `tests/library/`, kiểm catalog/hash và bank parity tương ứng |
| Native timing/cursor/tie | `native-time-ties.cjs`, `playback-sync.cjs`, `native-sheet-integrity.cjs` |
| Practice audio/Stop/pedal | `native-preview.cjs`, `practice-stop.cjs` |
| Grade picker/prefetch/advance | `grade-practice.cjs`, unit bank/selector/retry/settings |
| Nhập/xuất ABC/MSCX | `format-integrity.cjs`, suites converter/import/export theo thay đổi |
| Mobile/full sheet/piano | `mobile-editor-touch.cjs`, `mobile-native-audition.cjs`, `piano-88.cjs`, kiểm browser có liên quan |
| Bỏ mã chấm cũ/provenance | `audit-practice-cutover.py`, source verification tests |

```powershell
Push-Location apps/pianist-web
try {
    npm.cmd ci --no-audit --no-fund
    npm.cmd test
    npm.cmd run build
} finally { Pop-Location }
python -m unittest discover -s tests/library -p 'test_*.py'
python buildscripts/pianist/audit-practice-cutover.py
```

Browser suites nằm trong `tests/browser/pianist/`; cài dependencies bằng `npm ci` tại đó, giữ server local chạy và kiểm hướng dẫn/biến cấu hình đầu mỗi harness trước khi chạy. Phần lớn native suites hiện dùng Edge qua Playwright. Ví dụ từ root:

```powershell
node tests/browser/pianist/native-sheet-integrity.cjs
node tests/browser/pianist/grade-practice.cjs
```

MIDI mô phỏng kiểm đường router/controller/Worker production, nhưng không thay kiểm đàn MIDI thật. Viewport mobile mô phỏng không thay kiểm trên điện thoại vật lý. Chỉ chạy thêm suite khi sửa mới hoặc bằng chứng thất bại yêu cầu, không dùng số lần chạy làm thước đo chất lượng.

## Quy tắc khi refactor

- Một commit định dạng không đổi logic; một commit chuyển module có phạm vi rõ. Không đổi thuật toán chấm, dữ liệu nhạc hoặc schema dữ liệu chỉ để làm thư mục đẹp hơn.
- Khóa regression cho những đường dễ hỏng: Start/Stop giữa lúc tải, pause/resume, chuyển grade, A–B/repeat, full sheet, đúng nốt/nhả/pedal, giữ project editor khi nghe grade.
- Source grade, MXL, ID và thứ tự cần đối chiếu trước/sau. Refactor không được tạo kho mới hoặc thay bài. Các bài thư viện bị loại theo yêu cầu riêng có receipt và diff riêng.
- Không đưa scoring/time interpolation mới vào JSX. Giao diện nhận snapshot/trạng thái/lệnh, thời gian diễn tấu lấy từ native/transport theo hợp đồng hiện có.
- Không sửa tài nguyên phát sinh trong `build.artifacts/` để chữa source. Không di chuyển core MuseScore hoặc third-party chỉ để đồng nhất tên với code Pianist.

## Chuẩn bị phát hành

Suite `python buildscripts/pianist/check-pianist.py browser --suite ux-upgrade` chạy MuseScore thật cho thư viện nghe/pause/seek/Stop, giữ editor/Undo, theme native, nhiều layout/version và pinch trang 2. MIDI và sự kiện Audio Session trong suite là mô phỏng; không thay cho kiểm iPhone/iPad Safari với công tắc im lặng hoặc đàn thật. Cần Safari có Audio Session API để yêu cầu `type='playback'`; không thể suy ra trạng thái công tắc vật lý từ browser desktop.

Sau khi kiểm và commit source sạch:

```powershell
python buildscripts/pianist/package-web.py
python buildscripts/pianist/stage-release.py --output artifacts/releases/pianist-refactor-reviewed
python buildscripts/pianist/verify-release.py --directory artifacts/releases/pianist-refactor-reviewed/site --public
python buildscripts/pianist/serve-web.py --directory artifacts/releases/pianist-refactor-reviewed/site --port 8788
```

Chọn thư mục release mới cho mỗi lần staging, không ghi đè một gói đã phát hành. `package-web.py` tính integrity cho đúng bytes hiện có; không phải compiler và không thể tự sửa binary cũ. `stage-release.py` kiểm source sạch/binary tối ưu và tạo source archive đúng commit.

Sau khi phát hành GitHub Release và cập nhật `deploy/pages-release.json`, chờ workflow thành công rồi kiểm URL bằng release verifier + smoke browser. Manifest deploy là con trỏ release; không sửa version hoặc hash bằng phỏng đoán. Xem [quy trình Pages](../../deploy/PAGES.md).
