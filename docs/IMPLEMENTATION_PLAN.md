# Kế hoạch code Pianist Web

Cập nhật: 16/10/2026. Nền tảng được người dùng xác nhận: **web chạy trong trình duyệt**. M0 đã có fork và editor WebAssembly chạy thật. M1–M6 đã có mã nguồn cho shell, lưu/phục hồi, snapshot native, hai chế độ tập, kết quả/lịch sử và gói offline; các cổng nghiệm thu còn thiếu được ghi dưới đây. Màn tập là chức năng riêng, chỉ đọc bản nhạc, không có notation edit. Xem [hướng dẫn hiện tại](PIANIST_WEB.md), [kết quả M1–M6](M1_M6_RESULTS.md) và [bằng chứng M0 trước đó](M0_RESULTS.md). Chưa nghiệm thu đàn MIDI thật, toàn bộ ma trận editor hoặc phát hành HTTPS công khai.

Mục tiêu sản phẩm: mở website → nhập MXL → chỉnh sửa bản nhạc → lưu/mở lại hoặc tải file về → tập piano theo **Đúng nốt** hoặc **Theo BPM** → xem kết quả và tập lại đoạn yếu. Editor và màn hình tập dùng cùng nội dung bản nhạc, kể cả thay đổi chưa xuất file. “Pianist” là tên làm việc.

**1. Quyết định nền tảng và phạm vi**

- Phát hành dưới dạng website HTTPS. Người dùng không phải cài MuseScore hay một ứng dụng Windows để sử dụng.
- Ưu tiên kiểm thử Chrome/Edge trên máy tính có đàn MIDI. Đây là phạm vi hỗ trợ ban đầu; các trình duyệt khác được mở rộng sau kiểm thử tính năng, hiệu năng và MIDI thật.
- Nhập MXL/MusicXML và MSCZ; lưu project gốc bằng MSCZ để giữ dữ liệu editor; cho xuất MXL để trao đổi. Lưu trong thư viện trình duyệt và tải file về là hai thao tác riêng.
- Editor phải có chỉnh sửa ký âm, undo/redo, lưu và xuất thực sự. Bản chỉ hiển thị khuông nhạc là nguyên mẫu, chưa đáp ứng yêu cầu.
- V1 dùng đàn MIDI. Bàn phím ảo dùng để thử giao diện; nhận diện âm thanh từ microphone là một hạng mục nghiên cứu riêng.
- Luồng tập và chấm điểm chạy trên máy người dùng. Thiết kế ban đầu dùng thư viện cục bộ, chưa bắt buộc tài khoản; đồng bộ nhiều thiết bị có thể bổ sung sau.
- Giao diện luyện cần dùng được ở các kích thước cửa sổ thông thường. Hỗ trợ đầy đủ editor và đàn MIDI trên điện thoại/tablet chưa được xác nhận.

Web MIDI yêu cầu môi trường phù hợp và quyền thiết bị; ứng dụng phải kiểm tra khả năng của trình duyệt trước khi cho kết nối. [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API).

**2. Hướng dùng MuseScore trên web**

Chọn **fork MuseScore Studio, thử nghiệm nhánh build `app-web` bằng Qt/WebAssembly, giữ editor của MuseScore và bổ sung cầu nối JavaScript**. Giao diện thư viện, tập đàn và lịch sử được xây bằng TypeScript; phần editor kế thừa chạy trong vùng hiển thị WebAssembly.

Hướng này đã được kiểm chứng ở M0 cho các thao tác editor cốt lõi; các khoảng trống được ghi trong ma trận M0. Mã nguồn v4.7.5 ghi `app-web` là thử nghiệm nội bộ. Web shell có thanh nhập nốt, palette, layout, inspector và notation view; bản fork đã sửa các lỗi build, giao diện và bridge để dùng nền này. [CMake MuseScore](https://github.com/musescore/MuseScore/blob/v4.7.5/CMakeLists.txt), [NotationFrame.qml](https://github.com/musescore/MuseScore/blob/v4.7.5/src/web/appshell/qml/NotationFrame.qml).

Các phát hiện cần phản ánh vào code:

| Thành phần đã khảo sát | Hệ quả triển khai |
| --- | --- |
| Web API upstream có load score, khởi động audio và callback khi lưu project | Có nền để nối UI web, nhưng phải mở rộng API và kiểm thử toàn bộ luồng. |
| `WebApi::load` trong tag khảo sát ghi dữ liệu vào đường dẫn `current.mscz` cố định | Bridge mới phải nhận tên/định dạng đúng cho MXL/XML/MSCZ và gọi importer phù hợp; không đổi đuôi MXL rồi coi là đã hỗ trợ. |
| `webmscore` cung cấp đọc, render, xuất và tổng hợp âm thanh | Có thể tham khảo cách đóng gói WASM; API công khai đã khảo sát chưa cung cấp trọn bộ editor và undo/redo. |
| OSMD là thư viện hiển thị MusicXML | Có ích cho nguyên mẫu hiển thị; không thay thế yêu cầu editor kế thừa MuseScore. |

Nguồn: [webapi.cpp](https://github.com/musescore/MuseScore/blob/v4.7.5/src/web/appjs/webapi.cpp), [muapi.js](https://github.com/musescore/MuseScore/blob/v4.7.5/src/web/appjs/distr/muapi.js), [webmscore](https://github.com/LibreScore/webmscore), [OSMD](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay).

M0 phải chứng minh nhập → sửa → undo/redo → lưu → mở lại ngay trong trình duyệt. Nếu nền `app-web` không đạt, đầu ra là danh sách thiếu sót, mức công port và đề xuất điều chỉnh có bằng chứng. Không tự chuyển mục tiêu sang desktop, cũng không coi một viewer là editor hoàn chỉnh. Phương án viết editor web mới trên engine MuseScore chỉ được lập lại kế hoạch khi đã đánh giá chi phí; không mặc định đây là việc có sẵn trong thư viện.

**3. Kiến trúc dự kiến**

| Lớp | Công nghệ/hành vi dự kiến | Trách nhiệm |
| --- | --- | --- |
| Vỏ ứng dụng | React + TypeScript + Vite, dạng SPA | Thư viện, mở file, chuyển màn hình, thiết lập, lịch sử. Không cần SSR cho luồng luyện. |
| Editor | Fork MuseScore, C++/Qt biên dịch WebAssembly | Mô hình score, lệnh sửa, undo/redo, layout, import/export. |
| Cầu nối editor | TypeScript + API WASM mở rộng | Project revision, lưu bytes, snapshot ký âm, vị trí nốt và trạng thái editor. |
| Bộ chấm | TypeScript độc lập UI, chạy trong Web Worker | Timeline, đối sánh input, Đúng nốt, Theo BPM, kết quả và replay. |
| Thiết bị | Web MIDI | Nhận Note On/Off/CC và timestamp; quản lý kết nối. |
| Âm thanh | Web Audio; AudioWorklet khi cần | Metronome, đếm vào, tiếng đàn, lịch phát. |
| Lưu dữ liệu | IndexedDB, Blob; tải file qua trình duyệt | Project, bản tự lưu, cấu hình và kết quả. |
| Phân phối | Static hosting/CDN qua HTTPS, headers phù hợp WASM | Tải app, engine, font và âm thanh theo phiên bản. |

Stack này đã được triển khai; phiên bản công cụ được khóa trong toolchain và lockfile. C++/Qt là công cụ xây engine chạy trong trình duyệt, không phải yêu cầu cài phần mềm trên máy người dùng.

Luồng dữ liệu:

```text
MXL / MusicXML / MSCZ
         ↓
MuseScore editor trong trình duyệt
         ├── serialize project → IndexedDB / tải MSCZ / xuất MXL
         └── snapshot cùng revision + geometry
                            ↓
                    PracticePlanBuilder
                            ↓
Web MIDI → chuẩn hóa thời gian → Practice Worker → kết quả
                            ↑                       ↓
                    Web Audio clock          UI luyện / lịch sử
```

Chỉ engine giữ score có thể chỉnh sửa. Worker nhận dữ liệu bất biến; UI không tự sửa một bản MusicXML thứ hai. Khi vào màn hình tập, khóa chỉnh sửa score cho session đó và tạm ngừng các tác vụ layout/editor không cần thiết. Khi quay lại editor, giữ project và undo stack. Mỗi thay đổi score tạo revision mới và làm snapshot cũ hết hiệu lực.

Practice view ưu tiên lấy bản vẽ và tọa độ từ cùng engine. Bridge cần cung cấp geometry có semantic anchor; không giả định SVG xuất sẵn đã chứa ID từng nốt. Việc dùng renderer thứ hai sẽ cần đối chiếu layout, nhịp, repeats và mapping riêng nên chưa nằm trong đường triển khai chính.

Qt WASM có thể được nhúng vào vùng DOM. Build dùng threads cần HTTPS và cấu hình cross-origin isolation; phải xác minh đúng cấu hình của bản engine đã build. [Qt for WebAssembly](https://doc.qt.io/qt-6/wasm.html).

Cấu trúc hiện tại trong fork MuseScore:

```text
apps/pianist-web/
  src/main.tsx              màn thư viện/editor/tập/kết quả/lịch sử
  src/workspace.ts          project, mount editor, focus, lưu/phục hồi
  src/practice/             vòng đời session
  src/platform/             MIDI, audio, storage, capabilities
packages/score-contracts/    schema/version dữ liệu qua bridge
packages/practice-core/     plan, state machine, matcher, metrics
packages/practice-worker/   protocol worker và xử lý event
packages/engine-bridge/     TypeScript adapter cho WASM
src/web/appjs/              API C++/JS và practicesnapshot.cpp
tests/fixtures/             score và chuỗi MIDI có kết quả chuẩn
tests/browser/              luồng web tích hợp
docs/                       kế hoạch, quyết định, ma trận tính năng
```

Dùng engine upstream làm nơi thực hiện lệnh sửa. Không tạo undo stack riêng trong React để cạnh tranh với undo của MuseScore. Focus và MIDI router quyết định input đi vào editor hoặc buổi tập; một input không đồng thời thêm nốt vào score và nhận điểm luyện.

**4. Hợp đồng dữ liệu và đồng hồ**

| Dữ liệu | Nội dung bắt buộc |
| --- | --- |
| `ScoreSnapshot` | Schema version, project ID, revision, fingerprint nội dung, part/staff/voice, tempo map, repeat map và chính sách ký hiệu đặc biệt. |
| `ExpectedAttack` | ID mục tiêu vật lý, pitch MIDI, onset/duration theo timeline thực hiện, occurrence, nhóm hợp âm, vai trò tay/bè và các score anchor. |
| `ScoreAnchor` | Identity của phần tử trong snapshot và geometry version. Không lưu con trỏ WASM hay coi tọa độ pixel là identity bền vững. |
| `InputEvent` | Sequence, loại event, device/channel, pitch/velocity/CC, timestamp đã chuẩn hóa, thời điểm nhận xử lý, epoch và nguồn MIDI/ảo. |
| `SessionConfig` | Mode, đoạn tập, vai trò, tempo/đơn vị phách, tolerance, calibration, chính sách nghỉ/tie, phiên bản bộ chấm. |
| `SessionPlan` | Mục tiêu theo thời gian tương đối đầu đoạn tập; repeats/voltas đã mở rộng theo occurrence. |
| `NoteAssessment` | Matched/missed/extra, input gắn với mục tiêu, delta, trạng thái tạm/chốt và lý do không đủ điều kiện chấm. |
| `SessionResult` | Revision/config đã dùng, số mục tiêu dự kiến/đã đánh giá, chỉ số, từng lượt loop và trạng thái complete/aborted/interrupted. |

Bridge dự kiến cần các thao tác `openDocument`, `serializeProject`, `exportMusicXml`, `getSnapshot`, `getLayoutAnchors`, `setPracticeActive` và thông báo `revisionChanged`, `saveCompleted`, `error`. Đây là API phải xây hoặc nối vào upstream, không phải API đã có đầy đủ. Request/response có ID, schema version, revision và lỗi rõ ràng; sao chép bytes ra khỏi heap trước khi bộ nhớ WASM có thể đổi.

Chuẩn hóa thời gian sang mili giây theo cùng time origin của trang. Giữ `MIDIMessageEvent.timeStamp`; không thay nó bằng thời điểm callback được xử lý. Web MIDI định nghĩa timestamp lúc hệ thống nhận thông điệp. [W3C Web MIDI](https://www.w3.org/TR/webmidi/#midimessageevent-interface).

```text
expectedPerfMs = transportOriginPerfMs + planOnsetMs
deltaMs = normalizedInputPerfMs - calibratedOffsetMs - expectedPerfMs
```

Âm thanh dùng đồng hồ Web Audio; bridge đổi sang trục performance để chấm và hiển thị. Có thể dùng cặp `contextTime/performanceTime` của `getOutputTimestamp()` khi khả dụng để ước lượng lúc âm ra thiết bị; lưu rõ nguồn clock và đường fallback. Không cộng/trừ output latency hai lần. [AudioContext.getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).

Worker nhận thời gian đã chuẩn hóa từ trang; nếu dùng đồng hồ riêng phải chuyển time origin rõ ràng. `requestAnimationFrame` chỉ vẽ, timer chỉ đánh thức xử lý, không quyết định độ đúng nhịp. Offset hiệu chuẩn được cố định trong một lượt, tách theo thiết bị/đường âm thanh. Không tự trừ lỗi trung bình của người chơi để làm đẹp điểm.

Worker không loại bỏ được mọi độ trễ: nếu main thread hoặc hệ điều hành chặn việc giao MIDI, event vẫn có thể đến muộn. Cần log độ trễ giao event, giới hạn chốt kết quả và đánh dấu gián đoạn hệ thống; không biến mất dữ liệu input thành lỗi người chơi. V1 tạm dừng khi tab bị ẩn, mất thiết bị hoặc audio bị suspend, rồi đếm vào lại.

**5. Lộ trình code và điều kiện qua mốc**

Checkbox đã đánh dấu có bằng chứng trong báo cáo M0; các ô còn trống là backlog. M0–M2 đi trước phần luyện tích hợp.

**M0 — Chứng minh editor MuseScore chạy và lưu được trên web**

- [x] Tạo [fork Pianist](https://github.com/ntduyliem-source/pianist), nhánh `pianist/m0-web`, từ tag `v4.7.5`, commit `3654226c2e99289916916953a98e585a3d3b315a`.
- [x] Khóa Qt 6.10.2 WASM single-thread, Emscripten 4.0.7, CMake/Ninja và emsdk commit; bổ sung script setup/build cục bộ.
- [x] Build `app-web` và audio worklet; mở qua localhost có COOP/COEP trên Chromium, Chrome và Edge. Ghi payload, WASM heap, JS heap ước lượng, startup và console. Chưa đo toàn bộ RSS hoặc mạng WAN.
- [x] Bridge nhập theo filename/format MXL/MusicXML/MSCZ, không đổi đuôi; input lỗi giữ project hiện tại.
- [x] Thêm/sửa/xóa nốt, đổi trường độ, undo/redo, tải MSCZ rồi mở lại; xuất MXL rồi nhập lại. So sánh dữ liệu nốt bằng parser độc lập.
- [x] Hoàn thiện shell editor theo bố cục MuseScore: mở trực tiếp piano trống; menu File và phím tắt; toolbar, sidebar, status/zoom, Mixer, bàn phím piano; ẩn giao diện kiểm thử khỏi luồng sử dụng bình thường. Kiểm tra tương tác và file tải xuống trong trình duyệt.
- [x] Khảo sát palette, inspector, selection, clipboard, phím tắt, font tiếng Việt, zoom, audio và popup; ghi rõ giới hạn của các dialog đồng bộ chưa port.
- [x] Lập ma trận [M0_RESULTS.md](M0_RESULTS.md), phạm vi trình duyệt/corpus và bằng chứng. Chưa đồng nghĩa toàn bộ chức năng trong ma trận sản phẩm đã đạt.
- [x] Chốt tiếp tục engine MuseScore WASM; dự trù công port còn thiếu theo từng nhóm trong báo cáo M0 trước khi mở rộng.

Nghiệm thu: có bản chạy trong trình duyệt và bằng chứng file sau khi sửa/lưu có thể mở lại đúng. Build thành công hoặc render được sheet đơn thuần chưa đủ. Ma trận editor phải nêu những gì chưa đạt; không quảng bá tương đương hoàn toàn MuseScore khi còn khoảng trống.

**M1 — Vỏ web và vòng đời project**

Các ô đã đánh dấu dưới đây thể hiện phần triển khai và kiểm tra được ghi trong báo cáo; không thay thế các cổng nghiệm thu v1 với đàn thật/hosting. Một mục gồm cả code và phép đo chưa làm vẫn để mở.

- [x] Tạo shell TypeScript với các màn Thư viện → Editor → Tập → Kết quả và trạng thái engine loading/error.
- [x] Nhúng editor WASM; quản lý focus, resize, bàn phím và vòng đời module, giữ undo khi đổi màn hình.
- [ ] Xây bridge có version/revision, cancel và bỏ response cũ; gom điểm sửa upstream vào module nhỏ.
- [x] Mở bằng chọn file/kéo thả; giữ bản nguồn. Giới hạn tài nguyên giải nén MXL, xử lý file lỗi mà không phá project đang mở.
- [x] Tạo repository IndexedDB cho project bytes, metadata, recovery và migration. Chỉ báo “đã lưu” sau khi transaction thành công.
- [x] Tách “Lưu trong thư viện”, “Tải MSCZ” và “Xuất MXL”. Có fallback download; File System Access chỉ là tăng tiện lợi khi hỗ trợ.
- [x] Thêm autosave theo revision đã commit, phục hồi sau reload, xử lý quota và khóa ghi khi mở cùng project ở nhiều tab.
- [x] Kiểm tra snapshot và chuyển màn hình với score có thay đổi chưa tải về; không buộc người dùng xuất rồi nhập lại để tập.

Bridge đã có version/revision và hủy response snapshot cũ; hủy importer C++ đang chạy đồng bộ chưa được port thành tác vụ có thể ngắt.

Nghiệm thu: mở MXL → sửa → lưu thư viện → reload → mở lại được; tải MSCZ/MXL mang nội dung đã sửa. Bộ nhớ filesystem tạm của WASM không được coi là đã lưu bền vững.

**M2 — Hoàn thiện editor và tạo dữ liệu luyện**

- [ ] Đạt các nhóm editor trong ma trận dưới đây; giữ nguyên các lệnh MuseScore tái sử dụng được, port những phần phụ thuộc desktop.
- [x] Xây `ScoreSnapshotBuilder` lấy nội dung đang mở, không phụ thuộc file trên đĩa.
- [ ] Xử lý nhiều voice, chord, rest, tie, tuplets, pickup, chuyển tempo, repeats, volta và jumps; tách tick ký âm khỏi thời gian thực hiện.
- [x] Gộp unison cùng pitch/onset thành một mục tiêu vật lý có nhiều anchor; các lần đánh cùng pitch về sau vẫn là mục tiêu riêng.
- [x] Phân vai trò trái/phải theo part/staff/voice và cho chỉnh; nhận diện cross-staff. Không dùng một điểm chia cao độ cho mọi bài.
- [ ] Quy định cách xử lý grace note, ornament, arpeggio, fermata; trường hợp chưa hỗ trợ phải được giải thích trước khi tập.
- [x] Xuất geometry/semantic anchors dùng cho highlight, chọn ô nhịp và cuộn; vô hiệu hóa geometry cũ khi layout thay đổi.
- [ ] Viết test score adapter và corpus import/export với kết quả âm nhạc độc lập, tách lỗi layout khỏi lỗi nội dung.

Nghiệm thu: snapshot của project đã sửa tạo đúng lịch mục tiêu và ánh xạ lại score. Những nhóm editor chưa đạt vẫn là backlog bắt buộc, không mất đi vì đã có hai chế độ tập.

Ma trận editor tối thiểu để nghiệm thu sản phẩm theo yêu cầu:

| Nhóm | Thao tác cần có |
| --- | --- |
| File/project | Mở MXL/XML/MSCZ; New/Save/Save As; autosave/recovery; xuất MXL và tải MSCZ. |
| Nhập và sửa nốt | Nốt đơn, hợp âm, dấu lặng, pitch/octave, accidental, trường độ/chấm dôi; nhập bàn phím/chuột và MIDI khi editor hoạt động. |
| Cấu trúc thời gian | Ô nhịp, nhịp lấy đà, time/key signature, tempo, tuplets, nhiều voice, repeats/voltas. |
| Biểu diễn và ký hiệu | Tie, slur, articulation, dynamics, pedal, ornament; chỉnh thuộc tính của ký hiệu. |
| Part/staff | Thêm/sửa part, instrument, staff/clef, chuyển khuông phù hợp piano; giữ dữ liệu score nhiều bè. |
| Thao tác biên tập | Selection/range, copy/cut/paste, xóa, transpose, undo/redo, phím tắt và inspector/palette. |
| Bố cục và văn bản | Tên bài, chữ/lời/chord symbols, system/page break, layout, style và zoom. |
| Xem/nghe/xuất | Playback, chọn vị trí nghe, font chuẩn, bản in/PDF qua đường web được kiểm chứng. |

“Đủ chức năng” được quản lý bằng ma trận và hồi quy thực tế. Các chức năng editor khác của MuseScore phát hiện khi kiểm kê phải được bổ sung vào bảng khoảng trống. Plugin native, VST và các dịch vụ bên ngoài không được coi là tự có chỉ vì kế thừa mã nguồn editor.

**M3 — Web MIDI và chế độ Đúng nốt**

- [x] Kết nối bằng hành động người dùng, kiểm tra Web MIDI và quyền truy cập; không xin SysEx khi không dùng.
- [x] Normalize Note On velocity 0 thành Note Off; theo dõi held keys và CC64; chuyển timestamp, sequence, epoch vào Worker.
- [x] Route input độc quyền tới editor hoặc session. Rút thiết bị thì pause và giải phóng trạng thái hợp lý; kết nối lại cần xác nhận thiết bị và đếm vào.
- [x] Xây state machine `Ready → CountingIn → Running ↔ Paused → Completing → Finished`, cùng cancel/error/interrupted.
- [x] Với nốt đơn, đúng pitch mới tiến. Với hợp âm thường, đủ các phím yêu cầu đang giữ hợp lệ mới tiến; lưu lỗi và độ trải các lần đánh.
- [x] Mục tiêu đánh lại đòi Note On mới; tie liên tục không đòi đánh lại. Phím giữ từ trước session không tự nhận điểm.
- [x] Chốt chính sách nghỉ trong Đúng nốt: giữ chỉ dẫn nghỉ theo tốc độ tham chiếu rồi chuyển nhóm; không chấm timing như chế độ BPM.
- [x] Hiển thị nốt thiếu/thừa, bàn phím, số nhóm đúng ngay lần đầu và số lần sửa; kiểm thử bằng event replay trước khi thử đàn thật.

Đường MIDI đã kiểm bằng event giả lập và kiểm thử router; quyền thiết bị/rút cắm đàn vật lý vẫn cần nghiệm thu thực tế.

Nghiệm thu: nốt sai không tiến; đủ nốt đúng mới tiến; hoàn thành bài sau nhiều lần sửa không bị báo “độ chính xác 100%”.

**M4 — Chế độ Theo BPM và bộ chấm thời gian**

- [x] Xây `PracticeTransport`: tempo/đơn vị phách, count-in, lịch audio và chuyển đồng hồ. Đổi tốc độ luyện không sửa tempo ký âm.
- [x] Chạy timeline liên tục dù sai hoặc thiếu nốt. Metronome đặt lịch trước trên Web Audio; rAF chỉ cập nhật cursor.
- [x] Viết matcher theo pitch và occurrence, dùng bộ đệm đối sánh cục bộ có thứ tự; hỗ trợ bỏ lỡ và input thừa thay vì chỉ kiểm tra nốt tại cursor.
- [x] Giữ kết quả tạm khi còn ứng viên nhập nhằng; chốt sau cửa sổ trễ và giới hạn giao event. Event quá muộn được ghi rõ, không âm thầm sửa điểm đã công bố.
- [x] Chấm delta từng nốt; phân biệt đúng pitch, đúng thời điểm và độ đồng thời hợp âm. Không lấy trung bình có dấu làm độ chính xác.
- [x] Hoàn tất mục tiêu cuối sau khi hết cửa sổ nhận hợp lệ; mọi input chỉ được dùng một lần.
- [ ] Có giới hạn queue và phát hiện dữ liệu thất lạc/jank nghiêm trọng. Đo ảnh hưởng GUI/WASM/audio trên MIDI thật.
- [ ] Thêm hiệu chuẩn input/audio, lưu config và phiên bản thuật toán; tách dữ liệu đàn thật khỏi input ảo và MIDI loopback.
- [x] Viết replay harness để cùng snapshot/config/event log cho cùng kết quả bất kể frame rate.

Đã có queue limit, phát hiện jank và bài calibration 12 click; chưa đo bù trễ/jitter với đàn thật nên hai mục có phép đo vẫn mở.

Nghiệm thu: bài vẫn chạy khi người chơi im lặng; thiếu một nốt không làm sai dây chuyền cả bài; lỗi hợp âm sớm/trễ và timing từng tay được ghi đúng.

**M5 — Trải nghiệm luyện hoàn chỉnh**

- [x] Score làm trung tâm; có chọn tay/bè, mode, tempo, count-in, metronome, play/pause/restart và bàn phím.
- [x] Highlight theo semantic anchor, có chữ/ký hiệu ngoài màu; hiển thị sớm/trễ theo ms khi hữu ích.
- [x] Chọn đoạn A–B/ô nhịp, tự cuộn, zoom và chuyển hệ khuông ổn định.
- [x] Loop có occurrence riêng từng lượt; giữ cửa sổ đối sánh ở hai phía biên loop để một input không nhận điểm hai lần.
- [x] Khi bắt đầu giữa một chuỗi tie, công khai quy tắc đánh lại nốt đầu đoạn để thiết lập âm.
- [x] Pause/resume không biến phím đang giữ thành Note On mới; seek/restart/đổi lịch cấp epoch mới và hủy công việc cũ.
- [x] Khi tab ẩn, audio suspend hoặc thiết bị mất kết nối, chuyển trạng thái gián đoạn; resume có đếm vào và không chấm thời gian gián đoạn là miss.
- [x] Kết quả chỉ rõ nốt sai/thiếu/thừa, timing, hợp âm, ô nhịp yếu và nút tập lại; dừng session trước khi sửa score hoặc đổi phân bè.
- [x] Chỉnh UI, phím tắt và tiếng Việt; hoàn thiện luồng lỗi tải engine/thiết bị/lưu file ngay tại nơi thao tác.

Nghiệm thu: người dùng đi hết luồng sửa → tập → kết quả → sửa trên cùng bài, không mất undo/nội dung, không kẹt âm và không dùng anchor cũ.

**M6 — Lịch sử, kiểm thử web và phát hành v1**

- [x] Lưu session/config/calibration/algorithm version/fingerprint và từng lượt loop trong IndexedDB; phân biệt complete/aborted/interrupted.
- [x] Lịch sử bám revision, không gắn nhầm nốt sau khi sửa bài; có xuất kết quả JSON/CSV và replay log tùy chọn, giới hạn dung lượng.
- [x] Xử lý quota, lỗi ghi, migration và recovery. Tải file về luôn là đường sao lưu độc lập với dữ liệu trình duyệt.
- [ ] Kiểm thử browser integration và MIDI/audio thật; đo lần tải lạnh/ấm, RAM và bài dài trên máy mục tiêu.
- [x] Đóng gói WASM/font/sound có version/hash; lazy-load tài nguyên. Không tải lại engine hay activate bản cập nhật giữa session.
- [ ] Cấu hình HTTPS, WASM MIME, cache, COOP/COEP khi build yêu cầu và chính sách thiết bị phù hợp; thử ở trang top-level cùng origin.
- [x] PWA/offline là bước hoàn thiện sau khi tải tài nguyên thành công: cache có version, không trộn JS/engine cũ mới, không coi cache là nơi lưu project.
- [ ] Kiểm tra giấy phép mã nguồn, Qt, font và soundfont; chuẩn bị notices và source/build tương ứng với bản phân phối.
- [ ] Nghiệm thu toàn bộ ma trận editor và các ca bắt buộc. Mục chưa đạt được ghi thành lỗi chặn hoặc giới hạn công khai, không coi bản alpha là hoàn thành yêu cầu.

Nghiệm thu v1: mở URL trên máy chưa cài MuseScore → nhập MXL → sửa → lưu/tải/mở lại → dùng đàn MIDI tập cả hai chế độ → xem lịch sử → xuất MXL. Chốt triển khai hosting khi bắt đầu thực hiện phát hành; lượt lập kế hoạch này chưa tạo hay publish website.

IndexedDB có cơ chế quota và eviction phụ thuộc trình duyệt; thiết kế cần có phục hồi và tải bản sao thay vì hứa dữ liệu cục bộ tồn tại vĩnh viễn. [Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

**M7 — Luyện nâng cao và đồng bộ tùy nhu cầu**

- [ ] Chấm giữ phím/pedal với policy cho staccato, legato, tie, rest theo bè; MIDI không đo được chính xác lúc âm piano vật lý tắt.
- [ ] Thêm profile cho grace/arpeggio/ornament/fermata và bộ fixture được người chơi kiểm tra.
- [ ] Phát riêng bè/tay còn lại bằng lọc role/event; hai tay piano có thể chung instrument track.
- [ ] Tăng/giảm BPM giữa các lượt loop theo tiêu chí đã hiển thị; phân biệt bài kiểm tra nhịp cố định với mode đi theo người chơi.
- [ ] Mở rộng browser/tablet sau đo hiệu năng và thiết bị thực tế.
- [ ] Nếu cần tài khoản: thêm API xác thực, object storage cho file, database metadata/lịch sử, revision conflict và đồng bộ. Chấm thời gian vẫn ở trình duyệt.
- [ ] Chỉ so sánh tiến bộ giữa những lượt có cấu hình tương thích; bổ sung nhập/xuất thư viện khi cần chuyển thiết bị.

**6. Quy tắc chấm phải khóa trước khi viết thuật toán**

- Cửa sổ ghép và ngưỡng đúng nhịp là hai khái niệm riêng. Một nốt có thể đúng pitch nhưng ngoài ngưỡng timing.
- Giá trị thử nghiệm ban đầu: Perfect 50 ms, Good 120 ms, cửa sổ ghép tối đa 250 ms mỗi phía. Đây là tham số sản phẩm cần kiểm thử đàn thật, không phải chuẩn âm nhạc.
- Điều chỉnh đối sánh theo mật độ các mục tiêu có thể nhầm lẫn; không siết dung sai tay trái chậm chỉ vì tay phải đang chạy nhanh.
- Mỗi input được ghép tối đa một mục tiêu vật lý. Hai bè cùng pitch/onset có thể dùng chung mục tiêu với nhiều anchor; nốt cùng pitch ở thời điểm khác phải đánh mới.
- Hợp âm giữ delta từng nốt, sai lệch tuyệt đối và độ trải onset. Ví dụ -100/+100 ms có trung bình 0 nhưng sai lệch tuyệt đối trung bình 100 ms và độ trải 200 ms, không được chấm Perfect.
- Nốt sai pitch thường tạo một input thừa và một mục tiêu bỏ lỡ. Ghép chẩn đoán để giải thích lỗi không biến nốt sai thành match đúng.
- Rest của một bè không bắt cả đàn im lặng; v1 xử lý Note On không có mục tiêu phù hợp, chấm độ dài giữ âm thuộc M7.
- MIDI thông thường không chứng minh tay thật nào đã chơi. “Tay trái/phải” trong kết quả là attribution theo score, tránh tính điểm hai lần ở vùng trùng pitch.
- Điểm phiên bỏ dở tính trên phần đã chốt, kèm tiến độ; chưa đến nốt không được tự coi là miss.
- Đổi score/tempo/đoạn tập hoặc seek tạo lịch mới và ranh giới kết quả rõ ràng; callback epoch cũ bị bỏ.

Gọi N là số mục tiêu vật lý đủ điều kiện trong phạm vi đánh giá đã chốt, M là số khớp pitch, U là input thừa, G là số đúng pitch và đạt timing:

| Chỉ số | Định nghĩa |
| --- | --- |
| Bao phủ nốt | M/N, kèm số lượng thực tế. |
| Chính xác các lần bấm | M/(M+U), để bấm thừa không được lợi. |
| Đúng nốt và nhịp | G/N, áp dụng chế độ Theo BPM. |
| Bỏ lỡ | N−M khi kết quả mục tiêu đã chốt. |
| Sai lệch timing | Median/P90 của abs(delta), kèm số mẫu; trung bình có dấu chỉ thể hiện xu hướng sớm/trễ. |
| Hợp âm | Đủ nốt, delta từng nốt và spread; arpeggio dùng policy riêng. |
| Đúng nốt | Tiến độ, tỷ lệ nhóm đúng ngay lần đầu, số lần sửa; không gán timing score theo lịch BPM. |
| Mẫu số bằng 0 | Chưa có dữ liệu/không áp dụng. |

Không gộp vội thành một điểm tổng che khuất nốt thiếu/thừa. Nếu thêm điểm tổng sau này, phải công khai trọng số và lưu phiên bản công thức.

**7. Bộ kiểm thử nghiệm thu**

Fixture gồm score/snapshot, cấu hình, event có timestamp và kết quả chuẩn được xác định độc lập. Test domain dùng Vitest hoặc công cụ tương đương; browser flow dùng Playwright; phần C++ dùng test phù hợp upstream. Những kiểm tra này có mục tiêu phát hiện lỗi mất dữ liệu và chấm sai, không chỉ lặp lại cách code được viết.

| ID | Tình huống | Kết quả bắt buộc |
| --- | --- | --- |
| T01 | Web mở MXL, sửa, undo/redo, lưu MSCZ, reload/mở lại | Nội dung sửa được giữ; không chỉ hiển thị ảnh sheet. |
| T02 | Xuất MXL rồi nhập lại | Pitch, nhịp và cấu trúc đúng trong corpus; đối chiếu layout riêng. |
| T03 | Bản nhạc lỗi hoặc MXL vượt giới hạn tài nguyên | Báo lỗi; project đang mở không hỏng. |
| T04 | Nốt đúng/sai, hợp âm chưa đủ trong Đúng nốt | Chỉ tiến khi đủ điều kiện; ghi được lỗi lần đầu. |
| T05 | Tie qua vạch nhịp, sau đó đánh lại C4 | Tie không đòi attack mới; nốt viết đánh lại thì có. |
| T06 | Phím giữ trước start hoặc qua pause | Không nhận điểm từ attack chưa xảy ra. |
| T07 | Hai bè trùng pitch/onset | Một mục tiêu vật lý; highlight đúng nhiều anchor. |
| T08 | Target 0/500/1000 ms; input 0/480/1040 ms; offset 0 | Delta 0/−20/+40 ms. |
| T09 | Hợp âm −100/+100 ms | Không Perfect; abs trung bình 100, spread 200 ms. |
| T10 | Hợp âm cả hai nốt trễ 80 ms | Đồng thời nhưng vẫn trễ 80 ms. |
| T11 | C4 lặp nhanh, thiếu lần bấm giữa | Miss đúng occurrence; không lệch cả chuỗi hoặc tái dùng input. |
| T12 | Tay trái thiếu, tay phải tiếp tục | Ghi nhận theo timeline độc lập. |
| T13 | Tuplet, 6/8, phách chấm dôi và pickup | Đúng đơn vị phách và thời gian thực hiện. |
| T14 | Tempo map, repeat, volta, jump | Mục tiêu và cursor đúng từng occurrence. |
| T15 | Replay cùng timestamp ở các frame rate | Kết quả chấm không đổi. |
| T16 | Queue delay, khác time origin, bù trễ biết trước | Chuẩn hóa đúng; quá giới hạn giao event được đánh dấu. |
| T17 | Bấm nhiều phím quanh nốt đúng | Extra làm giảm precision. |
| T18 | Không bấm trong BPM | Timeline vẫn hoàn tất và ghi đủ miss hợp lệ. |
| T19 | Pause/seek/restart/loop | Không kẹt âm, không double-score, không nhận callback cũ. |
| T20 | Rút/cắm MIDI, velocity 0, bị từ chối quyền | State đúng, có đường phục hồi, không crash. |
| T21 | Zoom/layout và chuyển editor ↔ tập | Anchor đúng revision; overlay không sửa màu score/undo. |
| T22 | Sửa bài sau khi có lịch sử | Lịch sử giữ revision cũ, session mới dùng nội dung mới. |
| T23 | Quota, lỗi ghi, nhiều tab, reload lúc lưu | Trạng thái lưu trung thực; đọc lại bản đã commit; không ghi đè âm thầm. |
| T24 | Tab ẩn/audio suspend/main thread bị chặn | Pause/gián đoạn rõ; không chấm lỗi hệ thống thành lỗi người chơi. |
| T25 | Deploy HTTPS trên máy chưa cài MuseScore | WASM/font/audio/MIDI hoạt động; MXL vào được editor. |
| T26 | Cache cũ, đổi bản app, offline sau tải | Không trộn binary/API version, không cập nhật giữa session. |
| T27 | Đàn thật và đường âm thanh khác nhau | Đo calibration, jitter, drift; ghi máy/trình duyệt/thiết bị. |
| T28 | Toàn bộ ma trận editor | Mỗi nhóm có case đạt trên browser; các thiếu sót có trạng thái. |
| T29 | Pedal, legato, staccato, rest theo bè ở M7 | Policy chấm phù hợp, tách giữ phím và âm duy trì. |

Replay chứng minh tính quyết định của thuật toán; nó không thay thế đo độ trễ MIDI/audio thật. Các giới hạn tải, RAM và số trang được chốt từ đo M0, rồi dùng làm tiêu chí hồi quy ở M6.

**8. Thứ tự bắt đầu code**

1. **Gói A — M0:** build editor web và chứng minh MXL → sửa → undo → lưu/mở lại. Đây là rủi ro lớn nhất và là gói đầu tiên.
2. **Gói B — M1:** shell + bridge + IndexedDB, vòng đời project và khôi phục.
3. **Gói C — M2:** snapshot/geometry và ma trận editor; hoàn thiện các phần editor thiếu.
4. **Gói D — M3:** MIDI router + state machine + Đúng nốt.
5. **Gói E — M4:** clock + matcher + BPM + replay/đàn thật.
6. **Gói F — M5–M6:** loop/UX + lịch sử + kiểm thử browser + phát hành HTTPS.

Ước lượng lịch tổng sau Gói A, khi biết khối lượng port editor, kích thước WASM và chất lượng clock. Có thể xây fixture/thuật toán thuần TypeScript trong lúc sửa tích hợp, nhưng không dùng kết quả phần luyện để tuyên bố editor web đã hoàn thành.

**9. Nguồn ý tưởng và phần thuật toán được giữ lại**

Bản HTML hiện tại là mẫu hành vi: hai mode, chọn đoạn, đếm vào, metronome, tự cuộn và kết quả. Nó dùng ABC; đường MXL/editor mới phải có model và adapter riêng. Logic cũ có chỗ lấy onset sớm nhất của hợp âm và phụ thuộc bước hiện tại; không dùng nguyên cách đó làm bộ chấm mới. [Giao diện hiện tại](C:/Users/Admin/Desktop/2026/piano/index.html), [practice.js](C:/Users/Admin/Desktop/2026/piano/assets/js/practice.js), [midi.js](C:/Users/Admin/Desktop/2026/piano/assets/js/midi.js).

Ba repo trong tài liệu tham khảo được dùng để đối chiếu source, chưa được kiểm thử trực tiếp với đàn trong lượt nghiên cứu:

| Repo | Phần tham khảo | Điểm cần xử lý trong bộ chấm mới |
| --- | --- | --- |
| MusicLearn Trainer | Hiển thị timing và nhận input | Trung bình offset có dấu của hợp âm có thể triệt tiêu sớm/trễ. |
| Piano Trainer Studio | Luồng web, MusicXML, phân bè và mode luyện | Giữ/tap nốt sớm và matching pitch phục vụ trải nghiệm; không thay thế phép chấm onset độc lập. |
| MIDI Rhythm Trainer | Lưới nhịp, latency compensation, thống kê | Là plugin JSFX/REAPER; không cung cấp đầy đủ mục tiêu theo score và miss khi im lặng. |

Nguồn code đã khảo sát: [MusicLearn Trainer](https://github.com/LachlanB96/musiclearn-trainer/tree/e2c0fe01215c67cb8c4544b1e2220f4844cad297), [Piano Trainer Studio](https://github.com/ztbishop/piano-trainer-studio/tree/b40e412ccbc701094a9bb4bfe91ef45c32065704), [MIDI Rhythm Trainer](https://github.com/erangithub/eran_reaper_jsfx/blob/23bbc5c62c421fdd69dda7baca6609b704910ff6/midi_rhythm_trainer). Thuật toán dự kiến viết theo hợp đồng ở mục 6; việc lấy trực tiếp mã nguồn phải xét giấy phép của repo tương ứng.

Tài liệu nền: [MuseScore v4.7.5](https://github.com/musescore/MuseScore/releases/tag/v4.7.5), [WASM build script](https://github.com/musescore/MuseScore/blob/v4.7.5/buildscripts/ci/wasm/build.sh), [MusicXML importer/exporter](https://github.com/musescore/MuseScore/blob/v4.7.5/src/importexport/musicxml/musicxmlmodule.cpp), [MusicXML compressed MXL](https://www.w3.org/2021/06/musicxml40/tutorial/compressed-mxl-files/), [MusicXML note](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/note/).
