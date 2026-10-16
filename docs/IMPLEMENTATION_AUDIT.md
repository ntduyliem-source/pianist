# Đối chiếu lộ trình và logic tham khảo

Ngày 16/10/2026, rà soát theo phản hồi của người dùng. Source trước rà soát:
`33b68f61`; đợt hoàn thiện tiếp theo bắt đầu từ `c52e83ce`. Kết luận: triển khai bám nhiều nguyên tắc đã thống nhất, nhưng
**chưa đủ điều kiện tuyên bố hoàn tất toàn bộ các M hoặc nghiệm thu v1**.

## Lộ trình và thực tế

| Mốc | Đã có bằng chứng | Chưa đủ/khác kế hoạch |
| --- | --- | --- |
| M0 | Fork MuseScore; native editor WASM; MXL → sửa → undo/redo → lưu/mở lại; xuất MXL | Đây là proof of concept, không phải đầy đủ chức năng desktop |
| M1 | Thư viện, lưu riêng MSCZ, giữ nguồn, autosave/recovery, lease, version/revision, giữ undo khi đổi màn hình | Importer C++ đồng bộ chưa hủy giữa lúc parse; quota/kill-tab chưa kiểm đủ tình huống |
| M2 | Snapshot/geometry từ score đang sửa; tie/unison; thêm corpus volta, DC/Fine, DS/Coda, cross-staff, fermata; kiểm MXL round-trip và PDF render | Chưa đạt toàn bộ ma trận editor hoặc mọi biến thể navigation |
| M3 | Router MIDI, held keys/CC64, Worker và Đúng nốt; 12 ca tích hợp với cổng Web MIDI giả lập, gồm ngắt/kết nối lại và replay | Quyền/rút cắm/chơi đàn MIDI thật chưa nghiệm thu |
| M4 | Timeline BPM cố định, matcher onset, bù trễ, calibration, replay | Bộ test ban đầu bỏ sót các ca bên dưới; chưa đo jitter/drift/calibration thật |
| M5 | Practice riêng chỉ đọc; highlight tức thì từng nốt/phím, partial chord, repeat/loop reset, A–B, tay/voice, zoom/cuộn; chỉ mount overlay trang gần viewport | Bài rất dài và đủ máy/browser chưa kiểm đủ |
| M6 | Build tối ưu, release hash trước khởi tạo, staged link, notices thực từ dependency, lịch sử/version, JSON/CSV, offline và mẫu HTTPS | Chưa deploy HTTPS, audit phân phối hoặc nghiệm thu browser/đàn đầy đủ |
| M7 | Âm hướng dẫn tay còn lại; BPM tăng/giảm theo mức đặt trước; so sánh lượt tương thích | Chấm độ dài/pedal, profile ký hiệu nâng cao; tablet/tài khoản/đồng bộ theo nhu cầu vẫn mở |

Lộ trình đặt M0–M2 trước phần luyện tích hợp. Thực tế M3–M6 đã được triển khai
khi M2 còn thiếu ma trận editor. Đó là lệch thứ tự cổng nghiệm thu; phần code
luyện chạy không thay thế việc hoàn tất M2. Đánh dấu feature có code cũng không
đồng nghĩa mốc đã qua tất cả điều kiện nghiệm thu.

## Ba repo được dùng như thế nào

Bộ chấm Pianist được viết mới bằng TypeScript theo các quy tắc đã chọn trong
kế hoạch; không nhúng nguyên module chấm của ba repo. Những repo này không
cung cấp một bộ chấm đã được xác nhận đầy đủ cho pitch + onset + duration +
pedal + hai bè. Việc đối chiếu source không phải thử đàn thật trên các repo.

| Nguồn tại commit đã khảo sát | Nguyên tắc chọn dùng | Hiện thực trong Pianist |
| --- | --- | --- |
| [MusicLearn Trainer](https://github.com/LachlanB96/musiclearn-trainer/blob/e2c0fe01215c67cb8c4544b1e2220f4844cad297/ui/index.html#L886) | Tách pitch và độ sớm/trễ; tham số Perfect 50 ms / Good 120 ms | `bpm.ts` chấm delta từng target. `results.ts` dùng abs median/P90 và chord spread. Không lấy trung bình có dấu của hợp âm làm độ chính xác: -100/+100 ms phải có abs 100 và spread 200, không Perfect |
| [Piano Trainer Studio](https://github.com/ztbishop/piano-trainer-studio/blob/b40e412ccbc701094a9bb4bfe91ef45c32065704/js/trainer-core.js#L2436) | Hai hành vi wait và realtime; phân vai trò tay/bè | `wait.ts` chỉ tiến khi đủ pitch đang giữ hợp lệ, có attack mới; `bpm.ts` đối sánh theo lịch độc lập. Không sử dụng Follow Me làm chế độ kiểm tra giữ BPM. Thời gian không tự kéo theo người chơi |
| [MIDI Rhythm Trainer](https://github.com/erangithub/eran_reaper_jsfx/blob/23bbc5c62c421fdd69dda7baca6609b704910ff6/midi_rhythm_trainer#L445) | Cửa sổ timing và offset latency cố định | `transport.ts` dùng AudioContext output clock; `midi.ts` giữ timestamp; `bpm.ts` trừ offset đúng một lần. Beat map lấy từ score MuseScore. Không port toàn bộ swing/lane engine JSFX/REAPER |

Các chi tiết Pianist tự xây thêm: matching có thứ tự theo pitch, mỗi input chỉ
ghép một target; phân biệt extra/miss; unison nhiều anchor thành một mục tiêu;
tie không đòi attack lặp; partial result không tính nốt tương lai là miss;
grace/ornament/arpeggio có policy đơn giản hiển thị trước khi tập.

Nguồn code tại đây:

- [Đúng nốt](../packages/practice-core/wait.ts).
- [BPM và đối sánh](../packages/practice-core/bpm.ts).
- [Công thức kết quả](../packages/practice-core/results.ts).
- [Kế hoạch theo score](../packages/practice-core/plan.ts).
- [Transport/audio clock](../apps/pianist-web/src/platform/transport.ts).
- [Bộ test domain](../apps/pianist-web/tests/core.test.ts).

## Đợt hoàn thiện `pianist-onset-1.1.0`

**Highlight đã hoạt động trên bản nhạc và bàn phím.** Worker gửi phản hồi ngay
khi nhận input. Trong hợp âm chờ đủ nốt, pitch đang giữ được đánh dấu tạm;
nhả phím thì mất ghi nhận tạm. Trong BPM, đối sánh tạm có thể thay đổi ứng viên
trong chuỗi cùng pitch, còn điểm chính thức chỉ chốt sau deadline. Màu/✓ đúng
không bị cursor che; occurrence mới của repeat/loop không kế thừa màu lần trước.

Đã đối chiếu lại ba source ở commit ghi trong bảng. Khoảng thiếu đáng kể so với
Piano Trainer Studio là phản hồi held-note tức thì và phát tay còn lại; nay đã có
cả hai. Accompaniment hiện dùng âm hướng dẫn tổng hợp. Không lấy việc nhận nốt
đang ngân từ trước làm attack mới. So với MusicLearn, tiếp tục giữ delta từng nốt,
median/P90 tuyệt đối và spread để lỗi sớm/trễ không tự triệt tiêu. Offset/timing
window cố định theo tinh thần Rhythm Trainer; vẫn không tự kéo clock theo input.

Các sửa bổ sung:

- Sửa thứ tự deadline với offset âm ở đầu lượt; start kép/worker lỗi trong lúc
  audio đang mở không làm sống lại session. Calibration hủy khi mất focus,
  bỏ mẫu giao trễ; stop trong lúc resume audio không phát lại accompaniment.
- Router chỉ nhận nguồn/cổng đã chọn; giữ disarmed keys tới Note Off thật;
  CC64 độc lập từng channel; CC120/123 chuyển lượt sang gián đoạn. Có test
  permission-denied/reconnect bằng giả lập, không gắn nhãn đã thử đàn thật.
- Wait lưu timestamp từng attack để tính chord spread; extra gắn đúng nhóm,
  ô nhịp và lượt dù người chơi chờ lâu. Mẫu số 0 hiện “—”, timing wait không áp dụng;
  median với số mẫu chẵn lấy trung bình hai giá trị giữa.
- Chặn mở/kéo thả file, New/Save As/đổi project trong lượt tập đang chạy hoặc
  tạm dừng; không cho score bên dưới thay đổi trong khi Worker còn chấm lịch cũ.
- Worker gửi delta và bỏ thông báo tick không đổi. BPM dùng hàng đợi deadline;
  overlay chỉ dựng gần viewport. Stress domain 50.000 nốt/100.000 event:
  50.000 match, 0 fault, replay 316 ms, P99 bước 0,021 ms, heap Node 94,7 MiB.
  Đây không phải số đo latency MIDI hoặc RAM toàn ứng dụng.
- Native importer trước đó bỏ explicit D.C. khi `inferTextType=false`; sửa
  đường web giữ navigation MusicXML. D.C. al Fine và D.S. al Coda nay đúng lịch;
  MXL round-trip giữ fingerprint. Phát hiện thêm lỗi bộ nhớ khi đổi nhiều bài;
  đường publish project được bổ sung chuyển qua context rỗng và giữ đời bài cũ.
- Kiểm hash JS/WASM trước chạy; build native link ngoài thư mục preview rồi
  mới publish. Gói tối ưu khoảng 134,5 MiB, so với 180,1 MiB phát triển trước đó.
  Runtime notices thực được đóng gói; chưa thay thế audit phân phối đầy đủ.

Hiện có **85 test đạt**, không skip, gồm domain, actual Worker với MIDI giả lập,
storage rollback, bridge, loader/offline và lifecycle. Build TypeScript/Vite và
native tối ưu đã chạy. Bằng chứng UI: C4 trong hợp âm C/E/G chuyển xanh ngay,
C♯4 báo đỏ; BPM C4 trễ 151 ms hiện vàng và kết quả khớp 1/5, 4 miss, 0 extra.
Đàn vật lý vẫn chưa được nghiệm thu. Offline trên gói tối ưu đã được thử khi
server tắt: native engine/snapshot/Worker và highlight B2 của Phố Xa đều chạy.
Xem [báo cáo kiểm tra](M1_M6_RESULTS.md).

Theo xác nhận của người dùng, chưa có đàn nên đợt tiếp theo nghiệm thu bằng
MIDI mô phỏng trước. Thêm 12 ca tích hợp dùng `MidiRouter`, `PracticeSession`,
`PracticeTransport`, worker entry point và bộ chấm production; giả lập cổng
Web MIDI, AudioContext và timer ở biên ngoài. Mỗi ca kiểm cả kết quả mong đợi
và replay lại toàn bộ command log. Fixture native repeat/tie/unison chạy qua
ba chu kỳ timer 16/40/100 ms cho cùng kết quả. Đây là kiểm tra logic tích hợp,
không phải đo độ trễ hoặc xác nhận quyền thiết bị của trình duyệt thật.

## Lỗi phát hiện trong lượt rà soát trước (`1.0.1`)

Năm ca hồi quy mới đều thất bại trên grader 1.0.0 trước sửa; test log local ở
`artifacts/m1-m6/audit-regression-before.log`. Các lỗi được sửa ở 1.0.1:

1. Target C4 đã chốt, về sau bấm C4 thừa trong lúc bài còn chạy: trước đây bị
   gắn `late-after-finalization` và ngắt lượt. Nay input ngoài toàn bộ cửa sổ
   ứng viên được tính extra, timeline tiếp tục.
2. Pitch không có target, bấm sát cuối bài: hàng đợi extra có thể chưa xả khi
   kết quả complete. Nay phân loại ngay vì không có ứng viên có thể ghép;
   phím sai vẫn làm giảm precision.
3. Offset dương: deadline chốt chưa chờ phần offset dù input còn trong cửa sổ
   hợp lệ. Nay deadline tính thêm phần offset dương trên clock transport.
4. Input đúng tại biên cuối ±250 ms + giao trễ 120 ms: tick có thể chốt trước
   event cùng biên. Nay chỉ chốt sau biên bao hàm.
5. Completion với offset dương phải giữ mở đến hạn giao input cuối, kể cả extra.

Thêm test thứ sáu từ chối replay sai phiên bản thuật toán. Tổng tại đợt đó
**36/36 đạt**, TypeScript strict và Vite build đạt. Grader được tăng lên
`pianist-onset-1.0.1`; retry từ lịch sử dùng version mới, kết quả cũ giữ nguyên.
Log cũ 1.0.0 phải replay bằng đúng source phiên bản đó.

Kiểm tra UI sau sửa: Phố Xa ô đầu, hai tay, BPM 20, không đếm vào; target B2
ở 0 ms đã chốt, sau đó bấm B2 tại 2.645,754 ms. Giao diện ghi 1 extra và vẫn
chạy, không chuyển interrupted. Dừng chủ động lúc khoảng 9 giây cho kết quả
aborted, 18/20 mục tiêu đã chốt, 1 extra, faults rỗng. JSON tải từ UI xác nhận
algorithmVersion 1.0.1 và reason `outside-pitch-window`; lưu local trong
`artifacts/m1-m6/audit-ui-extra.json`. Bài mẫu đã trả về trạng thái sẵn sàng tập.

Các test không chứng minh mọi bài piano hoặc mọi thiết bị đã đúng. Cần hoàn
tất corpus/M2, chấm đàn thật/M4 và release gates/M6 trước khi gọi là v1 đạt.
Onset đúng chưa chứng minh nhả phím/giữ phím/pedal/diễn cảm đúng.
