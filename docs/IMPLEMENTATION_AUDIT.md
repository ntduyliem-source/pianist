# Đối chiếu lộ trình và logic tham khảo

Ngày 16/10/2026, rà soát theo phản hồi của người dùng. Source trước rà soát:
`33b68f61`. Kết luận: triển khai bám nhiều nguyên tắc đã thống nhất, nhưng
**chưa đủ điều kiện tuyên bố hoàn tất toàn bộ các M hoặc nghiệm thu v1**.

## Lộ trình và thực tế

| Mốc | Đã có bằng chứng | Chưa đủ/khác kế hoạch |
| --- | --- | --- |
| M0 | Fork MuseScore; native editor WASM; MXL → sửa → undo/redo → lưu/mở lại; xuất MXL | Đây là proof of concept, không phải đầy đủ chức năng desktop |
| M1 | Thư viện, lưu riêng MSCZ, giữ nguồn, autosave/recovery, lease, version/revision, giữ undo khi đổi màn hình | Importer C++ đồng bộ chưa hủy giữa lúc parse; quota/kill-tab chưa kiểm đủ tình huống |
| M2 | Snapshot/geometry từ score đang sửa; tie/unison; staff/voice; timeline từ RepeatList native | Chưa đạt toàn bộ ma trận editor và corpus volta/jump/cross-staff/fermata; không được đánh dấu mốc hoàn tất |
| M3 | Router MIDI, held keys/CC64, Worker và Đúng nốt; đã thử bằng event/keyboard ảo | Quyền/rút cắm/chơi đàn MIDI thật chưa nghiệm thu |
| M4 | Timeline BPM cố định, matcher onset, bù trễ, calibration, replay | Bộ test ban đầu bỏ sót các ca bên dưới; chưa đo jitter/drift/calibration thật |
| M5 | Practice riêng chỉ đọc; A–B, tay/voice, tempo/loop, zoom/cuộn, kết quả/tập lại | UI đã chạy local; bài rất dài và đủ máy/browser chưa kiểm đủ |
| M6 | Lịch sử/version, JSON/CSV, release hash, offline, mẫu HTTPS/notices | Chưa deploy HTTPS, build tối ưu, audit phân phối hoặc nghiệm thu browser/đàn đầy đủ |
| M7 | Chưa triển khai | Chấm độ dài/pedal, accompaniment, profile ký hiệu nâng cao, đồng bộ tài khoản còn ở lộ trình mở rộng |

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

## Lỗi phát hiện trong lượt rà soát

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

Thêm test thứ sáu từ chối replay sai phiên bản thuật toán. Tổng hiện tại
**36/36 đạt**, TypeScript strict và Vite build đạt. Grader được tăng lên
`pianist-onset-1.0.1`; retry từ lịch sử dùng version mới, kết quả cũ giữ nguyên.
Log cũ 1.0.0 phải replay bằng đúng source phiên bản đó.

Kiểm tra UI sau sửa: Phố Xa ô đầu, hai tay, BPM 20, không đếm vào; target B2
ở 0 ms đã chốt, sau đó bấm B2 tại 2.645,754 ms. Giao diện ghi 1 extra và vẫn
chạy, không chuyển interrupted. Dừng chủ động lúc khoảng 9 giây cho kết quả
aborted, 18/20 mục tiêu đã chốt, 1 extra, faults rỗng. JSON tải từ UI xác nhận
algorithmVersion 1.0.1 và reason `outside-pitch-window`; lưu local trong
`artifacts/m1-m6/audit-ui-extra.json`. Bài mẫu đã trả về trạng thái sẵn sàng tập.

36 test không chứng minh mọi bài piano hoặc mọi thiết bị đã đúng. Cần hoàn
tất corpus/M2, chấm đàn thật/M4 và release gates/M6 trước khi gọi là v1 đạt.
Onset đúng chưa chứng minh nhả phím/giữ phím/pedal/diễn cảm đúng.
