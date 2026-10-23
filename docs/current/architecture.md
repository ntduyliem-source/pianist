# Kiến trúc Pianist

Bản đồ hiện trạng ngày 23/10/2026, cập nhật theo các module của [kế hoạch refactor](../REFACTOR_PLAN.md). Trạng thái nghiệm thu mỗi giai đoạn nằm trong kế hoạch. Hướng dẫn chạy ở [development.md](development.md), dữ liệu nhạc ở [content-pipeline.md](content-pipeline.md).

## Các lớp đang có

| Vùng | Trách nhiệm | Không được tự đảm nhiệm |
|---|---|---|
| `apps/pianist-web/src/` | Giao diện React, luồng mở bài/tập/nghe, lựa chọn grade | Tự diễn giải lại notation hoặc tự đặt thuật toán chấm |
| `packages/score-contracts/` | Hợp đồng snapshot: trang SVG, nốt, ô nhịp, lượt lặp, mốc native | I/O, UI hoặc chỉnh nhạc |
| `packages/engine-bridge/` | API TypeScript tới MuseScore WASM | Trở thành renderer/score matcher thứ hai |
| `packages/exercise-renderer/` | Dựng snapshot grade bằng native renderer trong Worker | Sửa nội dung bài khi tải |
| `packages/practice-engine-v2/` | Adapter timeline, bộ chấm, kết quả và replay | Import React hoặc quyết định bố cục màn hình |
| `packages/practice-worker-v2/` | Thực thi engine chấm ở Worker | Quản lý thư viện hoặc điều hướng |
| `packages/score-formats/`, `score-format-worker/` | Chuyển ABC bằng converter ghim và kiểm bảo toàn nhạc | Đoán thêm dữ liệu converter không giữ được |
| `apps/pianist-web/src/platform/` | IndexedDB, MIDI, audio clock, offline, tải engine và file | Định nghĩa lại grade hoặc matcher |
| `src/web/` và các thay đổi native MuseScore | Editor, engraving, playback, timing, âm piano, dữ liệu gốc cho web | Nhận luật UI làm nguồn thời gian hoặc cao độ |
| `buildscripts/pianist/`, `deploy/` | Build, kiểm nội dung, đóng gói, xác minh và phát hành | Lấy mọi file local đưa lên web |

Các thư mục `src/`, `share/`, `thirdparty/`, `test/` lớn phần nhiều thuộc MuseScore upstream. `third_party/` là nơi nguồn tham khảo/phụ thuộc riêng của Pianist được ghim. Không gom hai cây này chỉ vì tên giống nhau.

## Luồng bản nhạc

```text
File người dùng / thư viện được duyệt
  → kiểm đầu vào và hash khi có manifest
  → ABC: converter ghim → MusicXML
  → MuseScore import/editor → lưu project MSCZ trong IndexedDB
  → snapshot native chỉ đọc → sheet và timeline tập
```

MSCX được giữ nguyên XML, đưa vào container bằng writer MuseScore rồi đọc qua đường native. Xuất ABC dùng project native tạm để nhập lại/đối chiếu; không thay project đang mở khi kiểm thất bại.

Nguồn grade cố định → validator → ABC→MXL đã đối chiếu → manifest release → browser chọn bài/prefetch → native renderer → cùng màn Practice và cùng bộ chấm. Browser không sinh hoặc sửa nốt để phù hợp grade.

## Hai đường âm thanh và một bộ chấm

- **Nghe mẫu/editor:** MuseScore native playback cung cấp âm thanh, tempo map, repeat, vị trí và spans. Thanh chạy/đầu nốt theo các mốc đó; pause cố định không được co giãn như toàn bộ timeline.
- **Tập:** MIDI đi qua router → đồng hồ đầu ra Web Audio → controller/Worker → bộ chấm ghim. Bàn phím ảo và tay đệm dùng MS Basic qua native FluidSynth. Oscillator chỉ làm metronome. Tay đệm hiện dùng velocity/mốc nhả CompatMidi; không tuyên bố tái hiện mọi articulation MPE.
- **Hiển thị:** SVG nguyên trang do MuseScore xuất; camera dùng system box, highlight dùng định danh/path native. Render frame không quyết định judgement hoặc sửa timestamp MIDI.

Các phiên bản thuật toán, symbol gốc và giấy phép ở [PROVENANCE.md](../../third_party/practice-sources/PROVENANCE.md). Engine ID trong `packages/practice-engine-v2/model.ts` quyết định khả năng replay/so sánh; không đổi chỉ để đổi tên file.

## Quyền sở hữu và điểm ghép nối

Entry `src/main.tsx` chỉ mount `app/App.tsx`. Shell/route/dialog ở `app/`; màn thư viện và chọn bài free play ở `features/library/`; thanh editor ở `features/editor/`; kết quả/lịch sử ở `features/results/`. `shared/ui/Icon.tsx` dùng chung biểu tượng. `practice/ui/` chứa các phần trình bày phản hồi, pedal, nghe mẫu và chọn A–B; chúng nhận dữ liệu/callback, không sở hữu Worker hoặc native engine.

State/view types và factory state mới cho từng workspace nằm trong `application/workspace-state.ts`. `platform/engine-host.ts` sở hữu lần khởi động native dùng chung, chờ bộ tiếng sẵn sàng trước khi công bố bridge, metadata document và focus Qt. Service nhận callback có kiểu; chính sách revision/autosave, save/export và session thuộc lớp điều phối. Kiểu config mô tả hợp đồng glue hiện có, không thay runtime validation của native API. Tests của host kiểm lỗi/retry, thứ tự audio readiness, callback/revision và tránh giành focus khỏi dialog.

`application/session-lifecycle.ts` là nơi tạo và sở hữu controller của lượt tập. `workspace.session` chỉ đọc; UI/queue grade dùng coordinator để tạo, thay callback kết quả và dọn đúng instance. Callback cũ không được công bố sau khi thay lượt; coordinator dọn và phát trạng thái khi startup thất bại. Kết quả đã chơi vẫn được lưu dù rời màn tập, nhưng việc chuyển sang Results phải kiểm lại chủ sở hữu sau khi lưu. Subscription vẽ sheet tách khỏi subscription trạng thái dùng cho navbar/grade; không còn `ws.patch({})` phát lại toàn bộ app mỗi frame. Calibration dùng coordinator riêng để giữ đường MIDI đổi cao độ về C4 hiện có, không đưa MIDI hai lần vào lượt tập chính.

`application/practice-repository.ts` giữ cấu hình theo project, calibration theo thiết bị, danh sách thư viện/lịch sử và lưu kết quả. Các khóa IndexedDB, phạm vi ô nhịp, ưu tiên offset và lựa chọn giữ replay vẫn như trước. `application/grade-audio-loan.ts` giữ việc mượn engine để nghe grade, bản editor native được giữ cùng undo/redo và bản bytes dự phòng để tải khi lỗi; generation guard loại kết quả chờ âm thanh của bài cũ.

`workspace.ts` còn là façade cho điều hướng, import/project/recovery/autosave và MIDI. `PracticeScreen.tsx` điều phối tương tác UI với coordinator và nghe thử; `Exercises.tsx` giữ queue/renderer/prefetch, lựa chọn grade và auto-next. Controller, AudioClock, native bridge và scorer không đổi thuật toán trong lần tách này. Những phần này vẫn là điểm ghép nối cần review khi thêm luồng mới; không tuyên bố workspace đã thành module nhỏ hay đã loại hết mọi coupling.

`style.css` hiện là danh sách import theo đúng thứ tự cascade cũ. Rules của shell, thư viện, editor và kết quả nằm cạnh feature; base bàn phím 88 phím ở `practice/styles/piano.css`. Các lớp responsive/sửa đè dùng chung giữ trong `styles/`, CSS practice cũ còn ở `practice/styles/legacy-layout.css`. `practice-v2.css` vẫn là style màn sheet-first. Xem `src/styles/README.md` để biết các lớp phải giữ thứ tự; chưa xóa selector khi chưa có bằng chứng không dùng. Giá trị vị trí/zoom tính theo hình học tiếp tục dùng inline style.

## Ranh giới mong muốn sau refactor

```text
app composition / navigation
  → feature library / editor / practice / grades / results
    → application services và session coordinator
      → platform adapters + packages domain/native
```

Đây là hướng phụ thuộc; không bắt buộc mọi thao tác tạo một class hay package mới. Module chỉ phục vụ một feature nên nằm cạnh feature. Chỉ tách shared khi có trách nhiệm hoặc hợp đồng được dùng thật ở nhiều nơi.

Giới hạn nhập/xuất, tính hai khuông, data schema, ID/hash bài và hành vi Stop phải có kiểm hồi quy trước/sau khi chuyển. Bất kỳ thay đổi bản nhạc hoặc luật chấm nào là công việc riêng, không được lẫn vào commit refactor.
