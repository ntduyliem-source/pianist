# Pianist Web V2 — nghiệm thu R0–R7

> **Tài liệu theo mốc:** giữ để truy vết quyết định và kết quả tại thời điểm viết. Hướng dẫn vận hành, kiến trúc và pipeline đang dùng nằm ở [tài liệu hiện hành](current/README.md); không dùng số lượng hoặc checklist cũ thay cho catalog/manifest hiện tại.

Ngày 18/10/2026. Báo cáo đợt thay lõi BPM; phần R4 đã được bổ sung ở [R4_RESULTS](R4_RESULTS.md), engine hiện tại `pianist-v2.osu-676f3b0.pts-b40e412.mir-fe73b35.ns-3582550.2`, schema kết quả 2. Số liệu 56 test và artifact v2-final bên dưới là mốc trước R4; không dùng để mô tả bản R4 mới.
Bản này thay toàn bộ bộ chấm tự viết cũ, ưu tiên onset theo BPM. Editor
MuseScore, nhập/xuất, thư viện và dữ liệu người dùng được giữ.

## Kết quả theo mốc

| Mốc | Đã thực hiện | Bằng chứng / giới hạn |
| --- | --- | --- |
| R0 | Ghim 26 source/license bằng Git blob + SHA-256. Runner .NET 10 chạy phương thức C# gốc. | `manifest.json`, `extractions.json`, `reference-corpus.py`; không lấy bản TS làm oracle. |
| R1 | Port hit windows, dispatch/notelock, hit/miss và weights modern osu!mania. | 329 scenario khớp ID/grade/delta/thời điểm/seq/extra ở kernel; cùng 329 ca khớp ở host event-time. Đây là 329 ca độc lập kiểm hai tầng. |
| R2 | Timeline, MIDI state, audio clock, calibration, Worker và controller mới. | Native corpus repeat/volta/DC/DS/tie/tempo/tuplets/cross-staff; MIDI mô phỏng xuyên router/controller/Worker production; count-in CC64, bù offset, pause/hold/resume, replay. |
| R3 | 4 hàm Wait của Piano Trainer Studio giữ nguyên body, host Wait riêng. | Latch đủ pitch, sai octave, duplicate, nhả/đánh lại, count-in; browser 8 hit, 1 input thừa, replay khớp. |
| R4 | Đã thay bằng mir_eval offset + note-seq sustain/retrigger + pedal profile piano_transcription. Mốc nhả gọi renderer MuseScore. Có công tắc pedal. | 535 ca khớp code Python gốc; native corpus và browser MIDI giả lập, replay. Xem [nghiệm thu mới](R4_RESULTS.md). Phạm vi CC64 nhị phân/nhả phím, không diễn cảm/half-pedal/arpeggio. |
| R5 | UI/results/history/replay mới, highlight từ input/judgement, bảo vệ project/revision/cấu hình. | Browser sửa bài → Back đổi đủ 9 pitch theo snapshot mới; A–B 2–2, BPM 65, 2 vòng vẫn giữ; lịch sử mở đúng project. |
| R6 | Xóa 13 module grader/Worker/controller/MIDI/transport/calibration cũ; contract, tests, CLI, stress chuyển V2. Native bỏ releaseRatio/releaseUnsupported. | Audit source, bundle, source map và WASM không có các symbol/implementation cũ. Snapshot live xuất raw articulations, không hệ số release. SW activation chỉ xóa cache cũ trong đúng scope. |
| R7 | Build tối ưu native + shell/typecheck, 56 test, browser/MIDI giả lập, replay, stress, hash/header check, chuẩn bị gói deploy. | Offline install đã báo sẵn sàng; xem giới hạn thử mất mạng bên dưới. MIDI thật và HTTPS chưa thử theo yêu cầu. |

## Điều đã chứng minh về BPM

- **9 C4 chơi sớm 120 ms:** 9/9 association đúng, delta đều −120 ms, 0 extra,
  0 fault; không đổi thành +80 ms tại ranh giới block. Cùng kết quả với tick
  16/40/100 ms và delivery delay trong ngân sách, cũng qua Worker production.
- **Hợp âm −100/+100 ms:** từng note giữ delta; median tuyệt đối 100 ms dù
  signed mean bằng 0. Oracle trả OK cho từng note, không Perfect.
- **Sai octave, bỏ nốt đầu, bấm trước một beat rồi giữ:** không được chuyển
  thành hit nhờ pitch class/held reservation. Biên OD 0/2,5/5/7,5/10 và
  160 case random có seed nằm trong corpus.
- **Browser thực:** 8/8 nốt vào qua MIDI router → audio mapping → browser
  Worker, mỗi nốt −120 ms, đều Meh, accuracy 50/305 = 16,4%, không miss/extra.
  Kết quả ghi nhãn mô phỏng và replay khớp. Ca không bấm trả 8 Miss.
- Offset áp dụng một lần; input đến quá 150 ms báo fault thay vì chấm sai.
  Hiệu chuẩn mới theo device ID; tập lại lịch sử đàn khác không mang offset
  cũ. So sánh tiến bộ loại lượt giả lập, bỏ dở hoặc khác nguồn clock.

Accuracy chỉ dùng base-score weights của nguồn, không phải full osu total
score/combo/rank. Extra không trừ accuracy upstream, luôn được báo riêng với
precision và số lần bấm. Xem [hướng dẫn](PIANIST_WEB.md) và
[mapping nguồn → code](../third_party/practice-sources/PROVENANCE.md).

## Kiểm chứng và file bằng chứng

`npm test`: 56/56 đạt. Build shell chạy `tsc --noEmit` và Vite thành công.
Native JS/WASM đã link lại tối ưu sau khi bỏ release policy. C# runner có
0 warning/0 error. Không tuyên bố đã chạy toàn bộ suite NUnit/ứng dụng osu!,
toàn UI Piano Trainer Studio hay REAPER; runner/stub và giới hạn đã công bố.

Corpus tái tạo được lưu trong `tests/fixtures/pianist/reference/`. Bộ test
và script đối chiếu nằm trong source phát hành. Artifact local dưới
`artifacts/r0-r7/` không đóng vào web public:

| File | Nội dung |
| --- | --- |
| `upstream-runner.log` | Chạy code C# gốc hai lịch clock |
| `build-final.log`, `tests-final.log` | Test/build/typecheck |
| `browser-bpm-simulation.json`, `browser-bpm-result.png` | Lượt −120 ms trên browser và ảnh kết quả |
| `browser-wait.json`, `browser-bpm-misses.json` | Wait và BPM không input |
| `before-edit.json`, `after-back.json` | Revision/pitch/A–B/BPM/vòng trước/sau sửa |
| `browser-history-project.txt` | Kết quả mở đúng project |
| `native-v2-snapshot.json` | Snapshot từ WASM mới, 9 anchor, raw articulations |
| `practice-v2-final.png` | Màn tập Phố Xa; khung dưới navbar và bàn phím trong viewport sau sửa layout |
| `cutover.json` | 13 module cũ vắng mặt; source/build/map/WASM đã kiểm |
| `stress.json` | 50.000 target, 100.000 MIDI event, 50.000 judgement, 0 extra/fault |
| `local-release-check.json`, `public-release-check.json` | Hash/size và headers theo phạm vi ghi trong từng report |

Stress Node: build timeline 109,6 ms, replay 686,1 ms, bước xử lý P99 0,0463 ms,
max 11,4 ms, heap 79,6 MiB trên máy này. Đây không phải benchmark browser DOM,
âm thanh hay chứng nhận chạy ổn trên mọi máy/đàn.

## Offline, phát hành và khoảng còn mở

Browser đã cài và kiểm hash bộ offline, thông báo tài nguyên sẵn sàng; reload
và thư viện vẫn hoạt động. Test SW kiểm manifest ghim theo release và dọn cache
đúng scope. **Chưa chứng minh reload khi mạng/server thực sự mất kết nối**:
lớp duyệt tự động chặn cả lệnh tạm dừng server hiện có và khởi động server thử
riêng, không trả lý do chi tiết. Không coi việc cài cache thành thử mất mạng.

Gói chuẩn bị tại `artifacts/releases/pianist-web-2026-10-18-v2-final/`. `SOURCE.json`
và `site/release.json` ghi chính xác commit, version, hash; có zip web, source,
notices, Caddy/Compose và DEPLOY.txt. Không phát hành domain/hosting. Phố Xa
local không vào gói public; public dùng fixture CC0. Đàn USB MIDI thật, latency
thực và HTTPS/chứng chỉ chờ môi trường đã thống nhất.

R01 WebGL/native abort trong audit cũ chưa có bằng chứng sửa tận gốc. Không
quan sát abort trong các lượt browser mới; guard chặn thao tác ghi sau lỗi
native được test. Nhả phím/pedal R4 đã có source và corpus riêng ở báo cáo bổ sung;
M7 diễn cảm/half-pedal/arpeggio còn mở, không bật lại thuật toán cũ để lấp chỗ trống.
