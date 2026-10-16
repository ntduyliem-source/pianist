# Pianist Web — kết quả triển khai M1–M6

Ngày kiểm tra: 16/10/2026. Đây là bản chạy local, chưa nghiệm thu phát hành v1.
M0 trước đó ở commit `73b82fe`; báo cáo này bao gồm đợt hoàn thiện sau `c52e83ce`.

## Trạng thái

| Mốc | Phần đã chạy | Cổng còn mở |
| --- | --- | --- |
| M1 | React/TypeScript shell; IndexedDB, autosave/recovery; version/revision; nút hủy ở preflight/tải engine; test rollback transaction, bỏ snapshot cũ; giữ undo khi đổi màn hình | Importer C++ đồng bộ chưa hỗ trợ hủy giữa lúc parse; quota/kill-tab thật diện rộng còn thiếu |
| M2 | Snapshot/SVG/geometry, staff/voice, tie/unison, tempo; corpus native volta, DC/Fine, DS/Coda, cross-staff và ký hiệu đặc biệt; PDF đã render kiểm tra | Chưa nghiệm thu toàn bộ ma trận editor và mọi biến thể jump/text-only |
| M3 | MIDI router; nguồn ảo riêng; Worker; state machine; Đúng nốt có lỗi lần đầu, hợp âm, nốt lặp và rest | Quyền MIDI/rút cắm đàn thực chưa kiểm tra |
| M4 | Audio clock, count-in/metronome, BPM timeline độc lập, matcher có giới hạn, timing từng nốt, calibration và replay | Chưa đo calibration/jitter/drift trên thiết bị thực |
| M5 | Màn tập chỉ đọc; highlight ngay nốt/phím, partial chord, đúng occurrence; A–B/loop/zoom/cuộn; chỉ mount overlay gần viewport; kết quả/tập lại | Chưa benchmark score tối đa trên đủ máy/trình duyệt |
| M6 | Build tối ưu, hash JS/WASM trước chạy, staged link; lịch sử, JSON/CSV, release manifest/offline, notices runtime thực | Chưa publish HTTPS; ma trận Chrome/Edge mới, giấy phép/source phân phối đầy đủ và nghiệm thu v1 còn mở |
| M7 | Phát tay còn lại bằng âm hướng dẫn; BPM đổi theo mức đặt trước sau mỗi loop; so sánh lượt tương thích | Duration/pedal và profile ký hiệu nâng cao chưa triển khai; tài khoản/tablet/đồng bộ là phần mở rộng có điều kiện |

Pedal hiện được nhận/hiển thị theo channel và giải phóng đúng khi pause/reset,
nhưng chưa chấm cách dùng pedal hoặc độ dài âm.

## Bài mẫu Phố Xa

- Đã lấy đúng file MXL được Musix tham chiếu; bản local ở
  `examples/local/pho-xa.mxl`, 25.903 byte, SHA-256
  `319dee74d098e16af5ffafeae76e4fc6821397f8e18363cf16282157d4734a97`.
- Hero thư viện mở **Phố Xa**. Nếu bản nguồn giống một bài đã có, mở lại bài đó
  thay vì nhập trùng. File nguồn và bản lưu MSCZ là hai dữ liệu riêng.
- Editor native mở được bài; màn tập hiện 50 ô nhịp, 7 trang và 1.179 mục tiêu
  vật lý sau chính sách tie/unison/grace của Pianist. Không dùng số lượng notehead
  MusicXML làm mẫu số chấm điểm. Chưa đối chiếu từng mục tiêu của toàn bộ bài bằng tay.
- Sửa fallback font Courier New ở WASM sang Edwin để bản SVG giữ chữ Việt đúng.
- Bản phối do người dùng cung cấp nằm trong thư mục gitignored; không được đưa
  vào public source. Checkout không có file này dùng fixture piano CC0.

## Kiểm thử tự động

`npm test`: hiện **85/85 đạt**, không skip (ban đầu 30, các đợt audit trước 36 và 73).
Rà soát phát hiện thêm lỗi ngoài phạm vi bộ test cũ và bổ sung hồi quy.
Xem [đối chiếu và ca hồi quy](IMPLEMENTATION_AUDIT.md).
TypeScript strict và Vite build đạt.
Native notation WASM build đạt sau bridge/SVG/PDF/font changes; audio dùng binary
M0 đã build. Main engine đã link tối ưu, WASM khoảng 80 MiB, JS khoảng 264 KB;
gói 54 tài nguyên khoảng 134,5 MiB, giảm từ 180,1 MiB của gói phát triển.
Build vào staging rồi publish khi link xong; loader kiểm SHA/length JS/WASM
trước chạy. Không được coi giảm dung lượng là đã đo latency đàn thật.

Các nhóm test gồm matching pitch/onset, hợp âm -100/+100 ms, nốt lặp thiếu ở
giữa, tay trái thiếu không ngăn tay phải, extra/precision, im lặng trong BPM,
frame-rate 15/60/144, event giao quá trễ, offset áp dụng một lần, rest/held keys,
tie/unison/loop, beat unit/tempo map, partial result, replay pause boundaries,
ZIP expansion/path traversal, XML entities, MIDI velocity-zero/CC64/timestamp,
audio output clock, IndexedDB migration/recovery/lease và vòng đời session.
Finish đồng thời chỉ tạo một kết quả; Worker lỗi vẫn kết thúc được với trạng
thái interrupted; input không sẵn sàng bị chặn trước khi tạo audio/Worker.

Bộ chấm `pianist-onset-1.0.1` trước đó sửa extra sau pitch đã chốt, extra sát cuối bài,
deadline khi offset dương và biên thời gian bao hàm. Replay yêu cầu đúng phiên
bản thuật toán; kết quả cũ không bị sửa. Ca replay UI trong bảng dưới được đo
với 1.0.0 tại commit `33b68f61`, không được coi là ca replay 1.1.0.

`pianist-onset-1.1.0` thêm live feedback tức thì và chốt điểm tách biệt,
timestamp chord spread trong wait, extra theo nhóm/ô/lượt, null khi không có
mẫu số; chữa offset âm ở đầu lượt, nguồn MIDI/held-key/reset, hủy audio và
calibration. Worker thực đã chạy qua test adapter MIDI giả lập, không chỉ gọi
core trực tiếp. Bộ test bảo vệ việc dừng rồi không tự khởi động lại vì callback cũ.

Fixture CC0 `tempo-repeat-tie.musicxml` có kỳ vọng tính độc lập: 3 ô nhịp viết,
pickup 1/8, 2/4, tempo 80→120, triplet, tie qua vạch, repeat và unison. Snapshot
lấy từ WASM thật có 11 nốt viết, 20 notehead thực hiện và 16 attack vật lý,
5 occurrence; tổng thời gian 4.375 ms trong sai số số thực. Test không tự tạo
expected bằng chính plan builder.

Corpus mở rộng dùng quarter=60: volta [1,2,1,3] = 4 giây; DC/Fine
[1,2,3,1,2] = 5 giây; DS/Coda [1,2,3,4,2,3,5] = 7 giây. Cả ba đã xuất MXL và
nhập lại với fingerprint/timeline không đổi. DC ban đầu chỉ đi [1,2,3] do
default text inference; đường import WASM đã sửa giữ explicit sound navigation.
Cross-staff giữ role theo staff nguồn và geometry theo staff hiển thị. Fixture
grace/arpeggio/trill/fermata phát đủ bốn cảnh báo; có 5 attack, grace B3 bị bỏ;
fermata giữ duration native 6.000 − 1.000/480 ms. Xem [corpus](../tests/fixtures/pianist/practice/README.md).

Stress domain Node: 50.000 nốt, 100.000 event, 50.000 match/0 fault;
build plan 112,5 ms, replay 316,1 ms, P99 bước 0,0209 ms, heap Node 94,7 MiB.
`artifacts/m1-m6/core-stress.json` ghi phạm vi; không bao gồm DOM/browser audio/MIDI thật.

Tên Txx trong các test domain là nhãn cục bộ; bộ test này không có nghĩa toàn
bộ 29 dòng nghiệm thu của kế hoạch sản phẩm đã được kiểm đủ.

## Nghiệm thu bằng MIDI mô phỏng trước khi có đàn

Người dùng xác nhận chưa có đàn MIDI. Đợt này thêm **12/12 ca tích hợp đạt**
trong [midi-simulation.test.ts](../apps/pianist-web/tests/midi-simulation.test.ts).
Chạy lại từ `apps/pianist-web` bằng `npm run test:midi`; các ca cũng được chạy
trong `npm test`. Log test/build local:
`artifacts/m1-m6/midi-simulation-build.log`.

Đường chạy là `MIDIPort.onmidimessage` giả lập → router production → session
production → transport/đổi clock production → **worker module production chạy
trong Node worker thread** → matcher → summary. Chỉ MIDIAccess/MIDIPort,
AudioContext và timer là giả lập. Callback ngắt cổng/reset được nối như workspace;
không khởi động native editor, UI hay xin quyền Web MIDI của trình duyệt.
Mọi ca đều đối chiếu kết quả mong đợi độc lập rồi replay command log của session;
toàn bộ trường kết quả (trừ UUID/ngày tạo) phải khớp chính xác.

| Ca mô phỏng | Kết quả |
| --- | --- |
| Hợp âm chờ đủ, sai phím, sustain, Note On lặp, velocity 0 | Nốt đang giữ có feedback tạm ngay; sustain không giữ credit của phím đã nhả; nốt lặp cần attack mới. 4 match, 1 extra, precision 80%, timing không áp dụng |
| Hợp âm −100/+100 ms, bỏ một nốt lặp, sai pitch và nốt trễ 180 ms | 5 match, 2 miss, 1 extra; median abs 100 ms, spread 200 ms; 4/7 đúng timing |
| Nốt lặp mơ hồ | Highlight tạm đổi ứng viên khi có attack tiếp theo; chốt 2 match với grade outside/perfect, không đếm tạm thành điểm |
| Hai channel cùng pitch, CC123 ở một channel | Router giữ phím/pedal ở channel kia, session gián đoạn và xóa credit tạm; giữ phím cũ không nhận điểm sau resume |
| Rút/cắm cổng khi giữ phím và pedal | Nhả trạng thái, đóng băng session; từ chối resume khi thiếu cổng; chọn lại mới resume/đếm vào; không hoàn tất hợp âm bằng phím cũ |
| Pause BPM trong 30 giây mô phỏng | Không tính khoảng pause thành miss; input lúc pause bị bỏ, resume chốt 3/3 đúng |
| Offset −200 ms và +80 ms (2 ca) | Offset áp dụng một lần; delivery 0/119/35 ms và timestamp dạng epoch vẫn khớp 3/3, delta gần 0 ms |
| Delivery 121 ms và timestamp đi trước 11 ms (2 ca) | Session interrupted, không tự chấm miss/credit, không cho resume với dữ liệu lỗi; kết quả partial có mẫu số rỗng |
| Message epoch cũ | Event/final/error cũ không đổi session hiện tại; lượt đúng vẫn hoàn thành |
| Fixture native repeat/tie/unison, timer 16/40/100 ms | Cùng 16 mục tiêu, 14 match, 2 miss, 0 extra, không fault; kết quả chấm giống nhau ở cả ba nhịp callback |

Mô phỏng không ghi lượt giả vào IndexedDB của người dùng. Đợt này không đổi
thuật toán `pianist-onset-1.1.0`. Các con số timestamp/delivery là dữ liệu thử
có chủ ý, **không phải số đo latency/jitter đàn hoặc audio thật**. Kiểm thử này
cũng không thay thế quyền thiết bị, USB/driver hay kiểm tra UI bằng đàn thật.

## Luồng đã kiểm qua giao diện thật

Trình duyệt: Codex In-app Browser (Chromium), thao tác UI qua CUA. Các số liệu
Chrome/Edge trong báo cáo M0 thuộc commit cũ, không được tính là lượt chạy mới.

| Luồng | Bằng chứng quan sát |
| --- | --- |
| MXL Phố Xa → thư viện → reload → mở lại | Project MSCZ khoảng 94 KB mở lại được, bản nguồn giữ nguyên |
| Chuyển editor ↔ tập | Practice chỉ đọc, không hiện palette/inspector/nhập nốt; editor giữ cùng project và undo |
| Snapshot từ nội dung đang sửa | Với fixture CC0, select-all/pitch-up làm cả 11 pitch tăng 1; Undo sau khi đi qua màn tập trả cả 11 pitch và fingerprint gốc; revision tăng đúng |
| Autosave/recovery | Sửa mà không bấm Save → báo tự lưu → reload → mở lại có thông báo phục hồi; snapshot đúng nội dung đã sửa |
| Save As | ID project mới; undo của native editor vẫn dùng được; snapshot giữ nội dung tương ứng |
| Nhiều tab | Tab thứ hai bị từ chối mở cùng project trước khi load engine; tab đầu giữ nội dung/undo |
| PDF | Đợt mới: special-symbols xuất PDF thật 29.741 byte, 1 trang A4; Poppler render kiểm tra title/khuông/grace/arpeggio/trill/fermata rõ, không thiếu glyph |
| Đúng nốt, Phố Xa ô đầu/tay trái | Bấm sai không tiến; sau 8 mục tiêu đúng: coverage 8/8, precision 89%, đúng lần đầu 7/8, 1 lần sửa; không báo tất cả chỉ số 100% |
| BPM, Phố Xa ô đầu/hai tay | 120 BPM, không bấm: hoàn tất khoảng 2 giây; 20/20 mục tiêu đã đánh giá, 20 miss, 0 extra |
| Pause/resume và bỏ dở | Fixture 20 BPM: vị trí 0:04 và 7/16 mục tiêu đã chốt đứng yên khi pause; resume rồi dừng ra aborted, không tính 9 mục tiêu tương lai thành miss |
| Replay log từ UI | CLI replay đúng kết quả pause/resume ở trên: `same: true`, evaluated 7, extra 1, không fault |
| Lịch sử/tập lại | Kết quả còn sau reload, giữ nguồn ảo/revision/fingerprint; tập lại giữ đoạn và config |

Kiểm tra bổ sung trên build tối ưu bằng UI và parse file xuất độc lập:

| Ca | Kết quả |
| --- | --- |
| Highlight wait | C4 đang giữ trong hợp âm C/E/G có màu xanh/ghi nhận tạm, E/G vẫn thiếu; C♯4 đỏ và tăng extra. Phố Xa: B2 đúng hiện ✓, cursor chuyển F♯3; lỗi trước đó vẫn được giữ |
| Highlight BPM | C4 trễ 151 ms hiện vàng/“lệch”; JSON cuối: 1/5 khớp, 4 miss, 0 extra, timing 0/5 |
| Loop thay đổi BPM | DS/Coda, 2 lượt, +10: giao diện lượt hai hiện 70 BPM từ mức đầu 60; 14 mục tiêu riêng |
| Octave/undo | Ctrl+A/Ctrl+Up tăng cả 6 pitch (gồm grace) 12 semitone; undo phục hồi |
| Chord symbol/slur | Ctrl+K nhập Am7 tạo harmony A/minor-seventh; S tạo slur start/stop; undo dùng được |
| Palette | Double-click mf tạo dynamics mf; pedal tạo start/stop; XML xuất xác nhận |
| Ô nhịp | Ctrl+B thêm ô thứ 6 vào score 5 ô; XML xuất xác nhận, undo dùng được |
| Hóa biểu/nhịp | Palette đổi C major → G major (`fifths=1`), 4/4 → 3/4; file MusicXML xác nhận, undo dùng được |
| Instrument | Dialog I thêm Flute: XML có Piano + Flute; undo về Piano |
| Runtime | Phát hiện một lỗi native memory khi đổi liên tiếp bài có jump; bổ sung context rỗng trước publish bài mới và giữ đời bài cũ. Chạy lại hai vòng DC XML → DC MXL → DS/Coda (6 lần nhập/chuyển practice), không tái hiện lỗi; snapshot cuối giữ fingerprint. Lỗi native có đường tải lại trang, ngăn autosave chạm memory hỏng |
| Đổi bài trong session | Mở volta khi đang tập DS/Coda bị từ chối ngay; title/score hiện tại không đổi. New/Save As/đổi project/rename cũng được chặn bằng test |

Các file `editor-*.musicxml`, `live-bpm-result.json`, `*-snapshot.json` và ảnh
trong `artifacts/m1-m6` là bằng chứng local. Các thao tác trên không phủ mọi
palette/property/dialog hoặc nhập từ đàn vật lý.

JSON kết quả, snapshots, PDF và ảnh kiểm tra tại máy này ở
`artifacts/m1-m6/` (gitignored). Snapshot fixture CC0 đã bỏ SVG nằm trong
`tests/fixtures/pianist/practice/engine-snapshot.json` để test tái lập được.

## Offline

Đợt cuối đã cài release `3c83840d508d87b1daff`: **54 tài nguyên, 134,5 MiB**.
Tắt hẳn server (0 listener ở cổng 8787), reload trang qua Service Worker;
mở Phố Xa vào native engine, tạo snapshot 50 ô/7 trang/1.179 mục tiêu.
Chọn tay trái/ô đầu, khởi động Worker Đúng nốt: C3 sai giữ nguyên mục tiêu,
B2 đúng hiện ✓ trên score và phím xanh, thống kê 1 match/1 extra/1 trong 8 nhóm.
Đây là kiểm tra thực của loader kiểm hash với release manifest được worker giữ
cùng phiên bản; không phụ thuộc server đang chạy. Ảnh `pho-xa-offline-highlight.png`.
Sau kiểm tra đã bật lại server, dùng **Dùng online** rồi reload giao diện bình thường.

Lần kiểm tra trước đây đã cài một release 39 tài nguyên, khoảng 180,1 MiB qua nút chuẩn bị offline.
Service Worker kiểm SHA-256 và cache nguyên bộ. Tắt preview server, xác nhận
HTTP không đáp ứng, rồi reload thư viện: mở lại Phố Xa vào native engine,
chuyển practice 7 trang/1.179 mục tiêu và khởi động BPM Worker được.
Sau đó bật lại server; không dùng kết quả này để tuyên bố cả buổi tập dài hoặc
đồng bộ nhiều phiên bản đã được kiểm đầy đủ. Gói đã thử offline có mã
`2a6671de6648b275ad12`; build cuối có thêm sửa lifecycle Finish và test tương ứng.

Đã dùng nút **Dùng online** để bỏ cache thử nghiệm trước khi nạp build cuối,
giúp preview tiếp tục phản ánh thay đổi source. Thư viện IndexedDB được giữ.

## Các bước nghiệm thu còn lại

1. Thử đàn MIDI thực: quyền truy cập, chọn cổng/rút cắm, timestamp, 12-click
   calibration, jitter/drift, pedal state; lưu model đàn/OS/browser/audio output.
2. Chạy ma trận editor đầy đủ; mở rộng biến thể jump/text-only, voice, signatures,
   layout và round-trip; sửa các dialog upstream còn phụ thuộc desktop.
3. Đo tải lạnh/ấm, RAM và score dài trên Chrome/Edge mục tiêu với build tối ưu mới.
4. Chọn domain/host, deploy nguyên release qua HTTPS và kiểm trên máy sạch;
   rà đủ source/build/notices/giấy phép trước phân phối công khai.

Không gắn nhãn v1 nghiệm thu hoàn tất trước các bước này. Hướng dẫn build,
sử dụng và các giới hạn hiện tại ở [PIANIST_WEB.md](PIANIST_WEB.md).
