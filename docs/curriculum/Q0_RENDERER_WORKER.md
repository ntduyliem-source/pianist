# Q0 — renderer MuseScore chạy trong Worker

Ngày 20/10/2026. Phần này xử lý đường dựng câu tiếp theo làm chặn UI/MIDI đã đo trong [điều tra trước](Q0_RENDER_INVESTIGATION.md). Đây là nền tảng cho Q4–Q5; chưa có giao diện quiz hoặc kho grade mới.

## Đường thực thi

`ExerciseRenderer.prepare(bytes, filename, signal)` → module Worker → `PianistRenderer.wasm` → `WebApi::prepareSnapshot()` → `snapshotFor()` → snapshot SVG + nốt + lịch MIDI → structured clone về UI.

Renderer và editor dùng các thư viện C++ MuseScore được build từ cùng source. Renderer có QGuiApplication, IoC, project tạm, heap và vòng sự kiện riêng. Nó không mở QML, cửa sổ editor hoặc thiết bị âm thanh. Bộ chấm, MIDI router, AudioClock và PracticeController hiện có không thay đổi.

`EngineBridge.preparedSnapshot()` vẫn là API đồng bộ dành cho chuẩn bị ngoài phiên và đối chứng editor. Không dùng nó trong luồng quiz đang chạy. API bất đồng bộ có bundle riêng `app/exercise-renderer.js`; không tải WASM renderer khi chỉ mở thư viện/editor.

Luồng gọi phải `await renderer.warm()` trước khi bắt đầu đồng hồ. Không đặt thời gian tải và biên dịch WASM đầu tiên vào khoảng thời gian user đang chơi.

## Đối chiếu mã gốc

| Phần | Nguồn và cách tái sử dụng |
|---|---|
| Import/layout/SVG/nốt/release/pedal | Gọi nguyên đường `src/web/appjs/webapi.cpp`, `practicesnapshot.cpp`, MusicXML reader, SVG writer và `CompatMidiRender` đã dùng trong editor. Không sao chép rồi viết lại phép chấm hoặc cách suy trường độ. |
| Khởi tạo MuseScore | Thứ tự register resources/exports, resolve imports, pre-init/init/all-inited từ `src/app/internal/consoleapp.cpp`. Dùng các module cần cho import/render. `ProjectAudioSettings::makeDefault()` cần `PlaybackConfiguration`, nên đăng ký cấu hình thật, không khởi động PlaybackController. |
| Runtime độc lập | Tham khảo lifecycle trong [webmscore v1.2.1 `web/main.cpp`](https://github.com/LibreScore/webmscore/blob/v1.2.1/web/main.cpp). Không dùng WASM của repo này thay engine vì khác API snapshot/glyph ID. |
| Qt offscreen QPA | Adapter nhỏ trong `src/web/renderer/offscreen.cpp`: virtual screen, raster pixmap, QFreeTypeFontDatabase và QEventDispatcherWasm. Đối chiếu [Qt 6.10.2 offscreen](https://github.com/qt/qtbase/blob/v6.10.2/src/plugins/platforms/offscreen/qoffscreenintegration.cpp) và [minimal](https://github.com/qt/qtbase/blob/v6.10.2/src/plugins/platforms/minimal/qminimalintegration.cpp). |
| Qt timer trong Worker | [QWasmTimer 6.10.2](https://github.com/qt/qtbase/blob/v6.10.2/src/corelib/platform/wasm/qwasmsuspendresumecontrol.cpp#L239-L257) gọi `window.setTimeout/clearTimeout`. Entry point cung cấp đúng hai hàm timer của Worker dưới tên này. Không giả lập DOM. |

Font fallback cho chữ của offscreen FreeType có thể khác Qt browser QPA. SVG `<title>` cũng chứa tên project tạm. Vì thế không khẳng định toàn bộ SVG giống từng byte. Oracle kiểm đủ trường của từng anchor theo ID, kích thước trang, dữ liệu nhạc, và hình/transform của mọi glyph có `data-practice-notes`. Thứ tự duyệt QHash không phải thứ tự nhạc; không so các mảng anchor theo chỉ số.

## Quản lý tài nguyên và lỗi

- Một Worker tồn tại trong suốt instance; một yêu cầu native tại một thời điểm. Hàng đợi tối đa 16 yêu cầu và tổng 32 MiB input. Không tạo Worker mới cho từng câu.
- Chuyển bản sao bytes sang Worker; nguồn trong thư viện/editor không bị detach.
- Hủy yêu cầu đang chờ thì không gửi vào WASM. Hủy yêu cầu đang chạy thì bỏ kết quả nhưng giữ slot cho đến khi native trả về. `dispose()` chấm dứt Worker và giải phóng cả heap.
- Boot quá 90 giây, render quá 30 giây hoặc Worker chết: reject toàn bộ yêu cầu đang chờ, terminate; lần thử tiếp có thể khởi động instance mới. Đây là giới hạn xử lý lỗi, không phải ngân sách hiệu năng cho BPM.
- Hash input, kiểm SHA256 của glue/WASM, parse JSON và cache đều chạy trong Worker. Cache LRU giới hạn 16 MiB theo ước lượng chuỗi UTF-16; key gồm hash WASM, hash nguồn và filename.
- Glue đã kiểm hash được import qua blob. `locateFile` trỏ về URL renderer thật vì Emscripten vẫn tính URL WASM khi đã cung cấp `wasmBinary`.
- Hai binary và `renderer/build.json` được đóng gói cùng manifest/offline cache. Packager đối chiếu kích thước và hash của cặp binary với build stamp; công cụ phát hành từ chối FastLink.

## Nghiệm thu

**Release tối ưu đã qua gate Q0 trên máy đo.** 131/131 unit test, TypeScript/Vite build và kiểm tra gói local qua. 15 file của bộ chấm và cặp binary editor giữ nguyên checksum. [Báo cáo native](q0/worker-native-report.json) và [kiểm tra loader thực](q0/renderer-loader-report.json) lưu kết quả đầy đủ.

| Phép đo | Desktop | Viewport 390×844, main thread 4× |
|---|---:|---:|
| Dựng native mới trong lúc MIDI chạy, không cache | 60 | 60 |
| MIDI nhận / dự kiến | 64 / 64 | 64 / 64 |
| Nốt perfect / tổng | 32 / 32 | 32 / 32 |
| MIDI delivery p95 | 0,10 ms | 1,27 ms |
| Long task UI ≥ 50 ms giao với thời gian render | 0 | 0 |
| Roundtrip dựng câu p50 / p95 | 64,40 / 85,13 ms | 64,03 / 83,38 ms |
| Refill câu 4 nốt đen, p95 / max | 16,13 / 16,90 ms | 15,50 / 16,65 ms |

Worker có heap WASM 128 MiB ổn định trong 120 lượt đo live; đây không phải tổng RAM trình duyệt và chưa phải soak test dài hạn. WASM thêm 79.325.776 byte (75,65 MiB), glue 171.233 byte, tải khi gọi renderer hoặc chuẩn bị bản offline. Cold boot local đo khoảng 1,96 giây; mạng và điện thoại thật có thể khác.

Loader trong bundle phát hành đã được thử độc lập khi không có editor: từ chối WASM sai hash, khởi động lại thành công sau lỗi, cache đúng, không detach input và tiếp tục dùng được sau file hỏng/hủy yêu cầu đang chạy.

Harness có hai chế độ: mặc định giữ phép thử đồng bộ cũ để tái hiện nguyên nhân; `--worker` dùng API mới. Cả hai dùng cùng 9 fixture, editor làm oracle, MIDI producer độc lập, MIDI router, Web Audio clock và grading Worker của sản phẩm.

Trong phép thử live, mỗi yêu cầu đổi filename để không hit cache. Chỉ chấp nhận khi có ít nhất 10 lần dựng thật trong lúc chơi, đủ 64 MIDI packets/32 target, hoàn tất lượt, không miss và không có long task UI giao với khoảng render. CPU 4× là CDP throttling **luồng chính của trang** với viewport 390×844; renderer Worker không bị throttle bởi lệnh này. [Chromium `InspectorEmulationAgent::setCPUThrottlingRate`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc) chỉ chấp nhận page. Đây là kiểm đường giao MIDI/UI chậm, chưa phải đo tốc độ dựng nhạc trên điện thoại thật.

Phép thử refill dùng 20 yêu cầu mới cho câu **4 nốt đen liên tiếp tại 240 BPM**, thời lượng thực tế 1.000 ms. Đo roundtrip renderer, chưa bao gồm chuyển câu và mount sheet trong UI quiz tương lai. Không suy từ đó rằng mọi câu 4 nốt đều dài 1 giây: hợp âm và trường độ ngắn khác hoàn toàn. Q3–Q5 vẫn phải dùng thời lượng timeline của profile/BPM thật để quyết định queue đủ hay thiếu. Không nới cửa sổ chấm để che renderer chậm.

Số đo nghiệm thu Release được lưu trong `q0/worker-native-report.json` sau khi chạy bản tối ưu. Kết quả FastLink chỉ dùng kiểm chức năng/bootstrap, không dùng để kết luận hiệu năng phát hành.

## Chạy lại

```powershell
./buildscripts/pianist/build-renderer.ps1 -Publish
npm.cmd --prefix apps/pianist-web test
npm.cmd --prefix apps/pianist-web run build
python buildscripts/pianist/package-web.py
node tests/browser/pianist/q0-native.cjs --worker --require-realtime
node tests/browser/pianist/q0-renderer-loader.cjs
python buildscripts/pianist/audit-practice-cutover.py
```

Build riêng renderer cần cache `build.m0` đã cấu hình bằng toolchain dự án. Lệnh build toàn bộ `build-pianist.ps1` cũng dựng và cài renderer sau editor. `-FastLink` chỉ để lặp sửa bootstrap; binary được link ở staging, không ghi đè file preview đang phục vụ giữa chừng.
