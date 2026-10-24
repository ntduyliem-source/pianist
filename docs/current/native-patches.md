# Bản đồ thay đổi MuseScore native của Pianist

Mốc đối chiếu là MuseScore `v4.7.5`, commit `3654226c2e99289916916953a98e585a3d3b315a`, được ghi trong [toolchain.json](../../buildscripts/pianist/toolchain.json). Đây là bản đồ để bảo trì fork; không coi các file native dưới đây là mã upstream nguyên vẹn. Các thay đổi có từ nhiều đợt trước, không phải tất cả được viết trong đợt refactor này.

| Phạm vi | Nơi đọc chính | Lý do và điều phải giữ khi nâng upstream | Bằng chứng liên quan |
|---|---|---|---|
| Bootstrap, exports và build web | `src/app/{CMakeLists.txt,appfactory.cpp,main.cpp,webapi_export.cpp,exported_functions.cmake,internal/guiapp.cpp}`, `src/web/*/CMakeLists.txt` | Ghép editor/audio/renderer WASM vào API web. App và renderer dùng cấu hình build khác nhau; không chạy configure hai target cùng lúc. | Build ba target tối ưu, native startup, package verifier |
| Editor Qt và lệnh ứng dụng | `src/web/appshell/`, `src/framework/global/internal/platform/web/webinteractive.*`, `src/notationscene/widgets/editstyle.cpp` | Khung editor, focus/touch, menu/lệnh save/export, dialog cuộn vừa viewport. Phần `Q_OS_WASM` không được làm hỏng desktop. | Mobile editor/touch, mở/lưu/xuất native |
| Project tạm, snapshot và xuất file | [webapi.cpp](../../src/web/appjs/webapi.cpp), [practicesnapshot.cpp](../../src/web/appjs/practicesnapshot.cpp), `src/engraving/api/v1/{qmlpluginapi.*,util.*}` | Native đọc/ghi/engrave project; snapshot mang dữ liệu gốc và SVG nguyên trang. Project editor/undo được giữ khi mượn engine nghe grade. Callback JavaScript không được ném lỗi làm bỏ qua cleanup project native. | Format integrity, grade route/Stop, library-policy, unit callback cleanup |
| Nhận piano hai khuông | `practicesnapshot.cpp` cùng `platform/library-admission.ts` và `library_staff_policy.py` | Native xuất danh sách khuông/part, mọi thay đổi nhạc cụ và MIDI program. Chính sách nhận thư viện dùng các dữ kiện đó; không nhận theo tên bài hoặc chỉ đếm số part. | Kiểm toàn bộ catalog bằng native; từ chối 1/3 khuông và nhạc cụ khác; nhập lô nguyên tử |
| Thời gian, repeat và nhả phím | [practicetiming.h](../../src/web/appjs/practicetiming.h), `practicesnapshot.cpp`, `src/importexport/musicxml/internal/import/importmusicxmlpass2.cpp` | Dùng native RepeatList/tempo/pause và CompatMidiRender. Import giữ điều hướng MusicXML tường minh khi suy luận văn bản bị tắt; không tự tái tạo repeat/tempo bằng UI. | Native time/ties, playback-sync, A–B, format parity |
| Đồng hồ âm thanh và lifecycle playback | `src/web/audioengine/`, `src/framework/audio/driver/platform/web/`, `src/framework/audio/main/internal/player.*`, `src/playback/internal/playbackcontroller.cpp`, `src/web/appjs/distr/{audiodriver.js,audio_worklet_processor.js,native-playback-clock.js,audio-ready.js}` | Vị trí nghe theo đồng hồ audio native; loại sequence/callback của project cũ, chỉ tạo sequence/track web sau handshake MS Basic (`web-audio-ready`), không giữ con trỏ player đã hủy. Khởi động notation không phụ thuộc âm thanh. | Native preview/PCM, playback-sync, Stop/pause/resume/chuyển bài |
| MIDI cho piano nhẹ | `src/framework/audio/engine/internal/synthesizers/fluidsynth/fluidsequencer.h`, `practicesnapshot.cpp`, `webapi_export.cpp` | `getSamplePlayback(speed)` gọi `FluidSequencer` gốc trên MPE ở tốc độ yêu cầu; xuất MIDI + spans + tempo map. Không chép thuật toán trường độ/pedal sang JSX. | Sample output/PCM, A–B, seek, native pause/ties |
| Tiếng phím ảo và tay đệm | `src/framework/audio/engine/internal/synthesizers/fluidsynth/fluidsynth.*`, `src/web/audioengine/` | Preview gọi FluidSynth/MS Basic của native. Không thay tiếng piano bằng oscillator; metronome là đường riêng. | Native-preview PCM, 88 phím, pedal/Stop |
| Định danh nốt được phát | `src/framework/mpe/events.h`, `src/engraving/playback/renderingcontext.h`, `src/engraving/playback/renderers/noterenderer.cpp` | `sourceId`/`tiedSources` chỉ mang provenance sau khi native quyết định tie/repeat. Không dùng chúng để thay thuật toán scheduling hoặc chấm; không serialize địa chỉ con trỏ sang audio engine. | Tied-source spans, playback-sync và native-time-ties |
| Highlight và font SVG | `src/importexport/imagesexport/internal/svggenerator.cpp`, `src/framework/draw/types/font.cpp` | Native gắn `data-practice-notes` cho đầu nốt/dấu hóa/dấu chấm/cán. Không suy ID bằng khoảng cách hình học. Fallback Courier New→Edwin chỉ cho glyph vẽ WASM, giữ tên font trong score/XML. | Native sheet integrity, pedal/clef, note ink, format integrity |
| Import lỗi và tương thích WASM | `src/importexport/musicxml/internal/import/importmusicxml.cpp`, `src/framework/audio/common/{audiotypes.h,workmode.cpp}`, soundfont/audio module headers, `src/framework/global/thirdparty/kors_async/async/internal/ringqueue.h` | MXL rỗng phải lỗi; web không chạy Qt dialog đồng bộ để chấp nhận import dở. Audio build không Qt dùng kiểu phù hợp; ringqueue tránh shift 32 trên `size_t` 32-bit. | Build native + import rejection/không mất project + playback startup |
| Cài runtime và tài nguyên web | `src/web/appjs/{install.js,distr/muapi.js,distr/muimpl.js,templates/,viewer/}`, `src/web/renderer/` | Glue, template piano hai khuông, PWA/offline và renderer dùng asset đúng manifest. Installer chỉ giữ MXL curated còn thuộc catalog trong output. | Release inventory/hash, library-policy, renderer grade startup |

Các tên trong `{…}` và `*` là cách gộp đường dẫn để đọc bảng, không phải lệnh shell. Đường âm nghe dùng MPE native; tham chiếu trường độ tập hiện dùng CompatMidi. Không tuyên bố hai đường tương đương mọi articulation.

## Đối chiếu trước khi nâng phiên bản

Giao diện sáng/tối: `WebApi::setWebTheme` trong `webapi.cpp`, export `setWebTheme` và glue `setUiTheme` chỉ chuyển `light`/`dark` tới API upstream `muse::ui::IUiConfiguration::setCurrentTheme`. Shell theo lựa chọn hệ thống hoặc người dùng; native nhận theme đã giải quyết. Thay đổi này cần build lại app, không cần đổi engine chấm/audio/renderer. Suite `ux-upgrade` kiểm native chấp nhận theme và dữ liệu nốt/Undo còn nguyên.

Từ root repo, lấy mốc đang ghim trong toolchain rồi xem diff thực tế. Các lệnh sau dùng mốc của bản đồ này:

```powershell
git diff --stat 3654226c2e99289916916953a98e585a3d3b315a -- src
git diff 3654226c2e99289916916953a98e585a3d3b315a -- src/web/appjs/practicesnapshot.cpp
git diff 3654226c2e99289916916953a98e585a3d3b315a -- src/framework/mpe/events.h src/engraving/playback
```

Khi đổi upstream, xét từng nhóm patch: upstream đã sửa tương đương chưa, signature/ownership có đổi không, snapshot/clock còn đúng contract không. Không chép lại cả file đã thay đổi lên upstream mới. Build lại app/audio/renderer tương ứng, kiểm native với gói cùng source, rồi cập nhật mốc và bản đồ này.

Mã chấm được lấy từ các repo khác được quản lý riêng bằng [PROVENANCE.md](../../third_party/practice-sources/PROVENANCE.md) và source pins. Refactor module/import không phải lý do để đổi kernel, engine ID, cửa sổ BPM hoặc tolerance trường độ/pedal.


## Thứ tự tải âm thanh web

Khi mở editor trước rồi mới bật âm MuseScore, `Playback::addSequence()` có thể chờ
`isAudioStartedChanged`, nhưng sự kiện này đến trước lúc MS Basic tải qua mạng xong.
Nếu tạo track ngay lúc đó, `EventAudioSource` không nhận được synth và chờ chuẩn bị
mãi; đổi sang bài khác tạo lại track sau khi font đã có nên che lỗi.

Pianist giữ `onProjectChanged()` chưa tạo sequence khi audio web chưa sẵn sàng.
`checkAudioReady()` đối chiếu resource MS Basic thực sự trong audio engine rồi mới
gửi `web-audio-ready`. Action này được nhận cả khi chưa mở score, refresh profile và
khởi tạo project hiện hành. Request sequence còn có generation + weak project guard.
UI chờ native track available có deadline; Stop/đổi output loại request cũ.

Editor piano nhẹ gọi `updateWebPlaybackPosition` theo đồng hồ đầu ra để cập nhật
cursor native. Đây là adapter hiển thị; MPE/tempo/repeat vẫn do MuseScore quyết định.
