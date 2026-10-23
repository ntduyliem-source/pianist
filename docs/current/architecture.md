# Kiến trúc Pianist

Bản đồ hiện trạng ngày 23/10/2026, cập nhật theo việc chia UI/CSS ở giai đoạn 2 của [kế hoạch refactor](../REFACTOR_PLAN.md). Hướng dẫn chạy ở [development.md](development.md), dữ liệu nhạc ở [content-pipeline.md](content-pipeline.md).

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

## Chỗ ghép nối hiện cần tách

Entry `src/main.tsx` chỉ mount `app/App.tsx`. Shell/route/dialog ở `app/`; màn thư viện và chọn bài free play ở `features/library/`; thanh editor ở `features/editor/`; kết quả/lịch sử ở `features/results/`. `shared/ui/Icon.tsx` dùng chung biểu tượng. `practice/ui/` chứa các phần trình bày phản hồi, pedal, nghe mẫu và chọn A–B; chúng nhận dữ liệu/callback, không sở hữu Worker hoặc native engine.

`workspace.ts` hiện giữ navigation, project/recovery, engine, MIDI và tham chiếu session. `PracticeScreen.tsx` vừa dựng UI vừa tạo/dừng session và nghe thử. `Exercises.tsx` vừa quản lý queue/renderer/prefetch, vừa dựng lựa chọn grade. Cả ba có thể kết thúc hoặc thay session.

Đây là lý do ưu tiên làm rõ quyền sở hữu vòng đời buổi tập. Mục tiêu là một coordinator nhận lệnh start/pause/resume/stop, còn UI và queue grade chỉ gọi API. `PracticeController`, `AudioClock`, native bridge và scorer vẫn giữ trách nhiệm hiện tại.

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
