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
| `packages/score-formats/` | Chuyển ABC bằng converter ghim, Worker nội bộ và kiểm bảo toàn nhạc | Đoán thêm dữ liệu converter không giữ được |
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

Thư viện dùng `application/library-player.ts` với factory chọn `SampleAudition`/`NativeAudition` và cùng `GradeAudioLoan` để nghe MXL/MSCZ mà không thay project/Undo editor. Stop, đổi bài và chuyển màn hủy yêu cầu cũ, trả native project trước khi tiếp tục. Player có subscription hoạt động riêng để các card không render lại theo từng frame âm thanh. Thumbnail do `platform/score-thumbnail.ts` gọi renderer Worker riêng, cache theo hash nguồn và phiên bản renderer; không mượn editor để chụp ảnh.

Theme và Audio Session nằm ở `platform/theme.ts` / `platform/audio-session.ts`. Theme web gọi `setUiTheme` để đổi cả giao diện native qua `IUiConfiguration`, không invert canvas. Audio Session yêu cầu `playback` khi API tồn tại và dừng/pause đúng chủ sở hữu khi hệ thống ngắt âm thanh. MIDI là một router thuộc workspace; các `MidiStatus` ở header chỉ là view của cùng router, không tạo kết nối theo tab.

`practice/useSheetGesture.ts` chỉ xử lý camera: pinch giữ điểm neo theo tọa độ từng trang, pan và tạm ngừng bám sheet. Nó không đổi SVG, nốt hoặc timestamp chấm. Title của bài vẫn có trong bản nhạc gốc/settings và heading trợ năng; không chiếm thêm một hàng trên sheet.

- **Nghe mẫu/editor:** MuseScore cung cấp MPE, MIDI qua chính `FluidSequencer`, tempo map, repeat và spans. Mặc định `SampleAudition` phát MIDI đó bằng Tone.js + @tonejs/piano; tick Tiếng MuseScore mới tải audio worklet/MS Basic và dùng `NativeAudition`. Thanh chạy đọc đồng hồ âm thanh đang phát; không dùng timer cố định để đoán vị trí. Đổi tốc độ lấy lại native MPE; pause cố định không được co giãn như toàn bộ timeline.
- **Tập:** MIDI đi qua router → đồng hồ đầu ra Web Audio → controller/Worker → bộ chấm ghim. Bàn phím ảo và tay đệm dùng output đã chọn: mẫu piano nhẹ hoặc MS Basic qua native FluidSynth. Kênh 0 của bàn phím ảo và kênh 15 của tay đệm tách biệt. Oscillator chỉ làm metronome. Tay đệm hiện dùng velocity/mốc nhả CompatMidi; không tuyên bố tái hiện mọi articulation MPE.
- **Hiển thị:** SVG nguyên trang do MuseScore xuất; camera dùng system box, highlight dùng định danh/path native. Render frame không quyết định judgement hoặc sửa timestamp MIDI.

Các phiên bản thuật toán, symbol gốc và giấy phép ở [PROVENANCE.md](../../third_party/practice-sources/PROVENANCE.md). Engine ID trong `packages/practice-engine-v2/model.ts` quyết định khả năng replay/so sánh; không đổi chỉ để đổi tên file.

## Quyền sở hữu và điểm ghép nối

Entry `src/main.tsx` chỉ mount `app/App.tsx`. Shell/route/dialog ở `app/`; màn thư viện và chọn bài free play ở `features/library/`; thanh editor ở `features/editor/`; kết quả/lịch sử ở `features/results/`. `shared/ui/Icon.tsx` dùng chung biểu tượng. `practice/ui/` chứa các phần trình bày phản hồi, pedal, nghe mẫu và chọn A–B; chúng nhận dữ liệu/callback, không sở hữu Worker hoặc native engine.

State/view types và factory state mới cho từng workspace nằm trong `application/workspace-state.ts`. `platform/engine-host.ts` sở hữu lần khởi động notation native dùng chung, metadata document và focus Qt. Bridge không chờ bộ tiếng; audio native khởi động khi người dùng chọn tiếng MuseScore và bấm phát/tập. Service nhận callback có kiểu; chính sách revision/autosave, save/export và session thuộc lớp điều phối. Kiểu config mô tả hợp đồng glue hiện có, không thay runtime validation của native API. Tests của host kiểm lỗi/retry, notation không phụ thuộc audio readiness, callback/revision và tránh giành focus khỏi dialog.

`application/session-lifecycle.ts` là nơi tạo và sở hữu controller của lượt tập. `workspace.session` chỉ đọc; UI/queue grade dùng coordinator để tạo, thay callback kết quả và dọn đúng instance. Callback cũ không được công bố sau khi thay lượt; coordinator dọn và phát trạng thái khi startup thất bại. Kết quả đã chơi vẫn được lưu dù rời màn tập, nhưng việc chuyển sang Results phải kiểm lại chủ sở hữu sau khi lưu. Subscription vẽ sheet tách khỏi subscription trạng thái dùng cho navbar/grade; không còn `ws.patch({})` phát lại toàn bộ app mỗi frame. Calibration dùng coordinator riêng để giữ đường MIDI đổi cao độ về C4 hiện có, không đưa MIDI hai lần vào lượt tập chính.

`application/practice-repository.ts` giữ cấu hình theo project, calibration theo thiết bị, danh sách thư viện/lịch sử và lưu kết quả. Các khóa IndexedDB, phạm vi ô nhịp, ưu tiên offset và lựa chọn giữ replay vẫn như trước. `application/grade-audio-loan.ts` giữ việc mượn engine để nghe grade, bản editor native được giữ cùng undo/redo và bản bytes dự phòng để tải khi lỗi; generation guard loại kết quả chờ âm thanh của bài cũ.

Các ranh giới được củng cố sau review 25/10/2026:

- `application/editor-audition.ts` sở hữu transport piano nhẹ của editor. Toolbar Qt và thanh web gửi lệnh đến cùng chủ sở hữu; vị trí hiển thị dùng performed time được ánh xạ từ tempo map native. Chuyển màn hoặc đổi bộ tiếng phải dừng chủ sở hữu trước khi đổi trạng thái native.
- `application/practice-audio.ts` chọn và khởi tạo cùng output cho tập và đo bù trễ. Calibration không giả định notation engine đã tải driver MS Basic.
- `platform/latest-project-document.ts` chọn bản lưu/recovery theo revision rồi updatedAt, lấy bytes, filename, title và revision cùng nhau. Nghe, thumbnail và mở editor dùng cùng quy tắc; liên kết metadata thư viện không nâng revision của bytes cũ.
- `application/score-reference.ts` phân biệt project cá nhân với tài sản grade/giáo trình. Khôi phục backup đổi ID project được sao chép, giữ ID tài sản dùng chung để lịch sử vẫn mở đúng bài.
- `application/attempt-persistence.ts` giữ kết quả chưa lưu độc lập với vòng đời màn tập. Banner ở shell cung cấp Lưu lại/Tải JSON và cảnh báo trước khi đóng tab; không hứa dữ liệu trong RAM sẽ sống qua reload.
- `practice/measure-range.ts` phân biệt nhãn ô native với index nội bộ. Số ô trùng phải chọn rõ vị trí; kết quả cũ thiếu nhãn ghi thứ tự thay vì đoán số in trên sheet.
- Worker chết hoặc không trả lời khi đóng lượt: controller giữ snapshot judgement cuối đã nhận, ghi outcome `interrupted`, không gắn replay đầy đủ, rồi giải phóng phiên. Không suy diễn thêm judgement từ dữ liệu thiếu.
- Chuyển online chỉ unregister Service Worker. Các tab đang mở vẫn cần cache của worker cũ; worker mới chỉ thu gom cache cũ trong cùng scope khi không còn cửa sổ ở scope đó. Cache có thể còn chiếm dung lượng sau khi chuyển online để bảo vệ các tab đang tập.

`workspace.ts` còn là façade cho điều hướng, import/project/recovery/autosave và MIDI. `PracticeScreen.tsx` điều phối tương tác UI với coordinator và nghe thử; `Exercises.tsx` giữ queue/renderer/prefetch, lựa chọn grade và auto-next. Controller, AudioClock, native bridge và scorer không đổi thuật toán trong lần tách này. Những phần này vẫn là điểm ghép nối cần review khi thêm luồng mới; không tuyên bố workspace đã thành module nhỏ hay đã loại hết mọi coupling.

`style.css` hiện là danh sách import theo đúng thứ tự cascade cũ. Rules của shell, thư viện, editor và kết quả nằm cạnh feature; base bàn phím 88 phím ở `practice/styles/piano.css`. Các lớp responsive/sửa đè dùng chung giữ trong `styles/`, CSS practice cũ còn ở `practice/styles/legacy-layout.css`. `practice-v2.css` vẫn là style màn sheet-first. Xem `src/styles/README.md` để biết các lớp phải giữ thứ tự; chưa xóa selector khi chưa có bằng chứng không dùng. Giá trị vị trí/zoom tính theo hình học tiếp tục dùng inline style.

## API và ranh giới được kiểm

```text
app composition / navigation
  → feature library / editor / practice / grades / results
    → application services và session coordinator
      → platform adapters + packages domain/native
```

Đây là hướng tổ chức trách nhiệm; không bắt buộc mọi thao tác tạo một class hay package mới. Module chỉ phục vụ một feature nằm cạnh feature. Các import xuyên package phải đi qua `index.ts`; app không import implementation sâu hoặc nguồn upstream của bộ chấm. `practice-engine-v2` công bố engine, model, timeline, replay/kết quả và hàm trình bày cửa sổ timing dùng nguyên quy tắc upstream. Factory của `practice-worker-v2` tạo Worker khi được gọi; chỉ import API không tự khởi động Worker.

`score-formats` công bố client, import/export và kiểm fidelity; converter Worker nằm trong package này. Native API, callback và audio driver được mô tả ở `engine-bridge/native-api.ts`. Snapshot native và semantics có kiểu riêng, không giả định chúng đã chứa project ID/hash do ứng dụng bổ sung. `score-contracts/native-decoder.ts` kiểm cấu trúc, giới hạn, revision và liên kết ID cho cả bridge và renderer. Nó không chỉnh, sắp xếp hoặc lượng tử hóa dữ liệu nhạc; chính sách nhận piano hai khuông nằm riêng trong library admission.

Callback JSON chỉ nhận dữ liệu thô, việc parse/kiểm diễn ra sau khi lệnh C++ đã trả về và dọn project tạm. Dữ liệu nhị phân phải được sao chép khi vùng nhớ native còn sống; lỗi sao chép được giữ lại để ném sau khi native đã dọn. Các callback trước đó được khôi phục kể cả khi lệnh thất bại. Khi nâng MuseScore, đối chiếu [bản đồ patch native](native-patches.md), kiểu API và decoder cùng nhau.

`buildscripts/pianist/check-dependencies.cjs` phân tích AST để chặn import sâu xuyên package, package phụ thuộc app, domain phụ thuộc UI/I/O và hướng phụ thuộc trái danh sách đã khai báo. Nó kiểm cả import type, re-export, dynamic import có đường dẫn tĩnh và URL Worker. Đây là kiểm ranh giới package, không phải bằng chứng mọi phụ thuộc giữa các folder UI đều được loại bỏ; đường dẫn module native động vẫn do runtime asset loader xác minh.

Giới hạn nhập/xuất, tính hai khuông, data schema, ID/hash bài và hành vi Stop phải có kiểm hồi quy trước/sau khi chuyển. Bất kỳ thay đổi bản nhạc hoặc luật chấm nào là công việc riêng, không được lẫn vào commit refactor.
