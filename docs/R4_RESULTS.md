# R4 — nhả phím và pedal có đối chiếu nguồn

> **Tài liệu theo mốc:** giữ để truy vết quyết định và kết quả tại thời điểm viết. Hướng dẫn vận hành, kiến trúc và pipeline đang dùng nằm ở [tài liệu hiện hành](current/README.md); không dùng số lượng hoặc checklist cũ thay cho catalog/manifest hiện tại.

Ngày 18/10/2026. Engine `pianist-v2.osu-676f3b0.pts-b40e412.mir-fe73b35.ns-3582550.2`.
Hoàn tất phạm vi **nhả phím, sustain và pedal CC64 nhị phân** trên web.
Điểm BPM osu! giữ nguyên. Không bật lại grader duration/arpeggio cũ.
MIDI thật và HTTPS để sau theo yêu cầu người dùng.

## Nguồn, hàm và quyết định tích hợp

| Nguồn ghim | Code sử dụng | Vai trò |
| --- | --- | --- |
| [mir_eval fe73b353](https://github.com/mir-evaluation/mir_eval/blob/fe73b3533737814f83dbd9739f06e90f5f82f758/mir_eval/transcription.py), MIT | `match_note_offsets`, `match_notes`, `precision_recall_f1_overlap`, `average_overlap_ratio`; util `_bipartite_match`, `f_measure` | Offset, matching interval và P/R/F1/overlap. Port TS đối chiếu Python gốc. |
| [Magenta note-seq 3582550](https://github.com/magenta/note-seq/blob/35825508885343fb06f93dc87ff491dbbf034505/note_seq/sequences_lib.py#L1536), Apache-2.0 | Toàn hàm `apply_sustain_control_changes`, thứ tự bốn loại event | Sustain theo instrument, CC64 ≥64, nhả pedal, đánh lại cùng pitch và event đồng thời. |
| [piano_transcription 1ade7dc](https://github.com/bytedance/piano_transcription/blob/1ade7dcd4348add669a67c6e6282456c8c6633bd/pytorch/calculate_score_for_paper.py#L270) | Lời gọi mir_eval cho pedal: constant pitch, onset 0,2 s, offset ratio 0,2, minimum 0,05 s | Chỉ đối chiếu lựa chọn tham số. Không chép implementation chưa có license vào sản phẩm, không dùng model AI. |
| MuseScore base 3654226 | Gọi trực tiếp `CompatMidiRender::renderScore`; `RepeatList`; pedal Spanner | Cung cấp Note Off thực tế của renderer, anchor/tick/thời gian và ký hiệu pedal theo lần diễn. |

33 file nguồn/license có Git blob và SHA-256 trong
[`manifest.json`](../third_party/practice-sources/manifest.json).
Hàm gốc, dòng nguồn và hash body ở
[`r4-symbols.json`](../third_party/practice-sources/r4-symbols.json).
Mapping sang file sản phẩm và các thay đổi host ở
[`PROVENANCE.md`](../third_party/practice-sources/PROVENANCE.md).

Nhả phím giữ association mà osu! đã quyết định. Chỉ so offset với Note Off
native bằng phép kiểm mir_eval: khoảng cách làm tròn 4 chữ số thập phân giây,
`≤ max(20% trường độ tham chiếu, 50 ms)`. JS không tự đặt tỷ lệ staccato,
staccatissimo hay nốt thường. Đây là profile luyện theo cách MuseScore phát,
không phải chuẩn diễn tấu duy nhất.

Pedal dùng đúng profile 200 ms nêu trên; sustain dùng toàn thuật toán
note-seq. Các adapter chỉ đổi đơn vị, ánh xạ anchor/device/channel,
chuyển mốc theo tempo/A–B/vòng và ghi nhận event thực/gián đoạn. Không có
điểm tổng tự trộn onset, độ dài và pedal.

## Hành vi sản phẩm

- **Dùng pedal** ngay trên bàn phím: bật/tắt sustain ảo và đánh giá pedal/âm ngân.
  **Đạp pedal · ON / Nhả pedal · OFF** gửi CC64 khi dùng bàn phím ảo.
  Tắt khi pedal đang đạp sẽ nhả ngay. Cấu hình lưu theo bài, khóa trong lượt.
- **Chấm nhả phím · BPM** là công tắc riêng. Tắt pedal vẫn chấm Note Off.
  Chế độ Đúng nốt không chấm thời gian nhả/pedal.
- Hiện phản hồi nhả đúng/sớm/trễ; kết quả tách nhả phím, âm ngân, pedal và BPM.
  Có mốc, delta, dung sai, matching/P/R/F1; JSON giữ CC64/key interval gốc;
  CSV thêm offset nhả và sustain; replay kiểm lại cả R4.
- Kết thúc tự nhiên chờ hết cửa sổ nhả cuối, gồm cửa sổ âm ngân.
  Stop/pause/reset/disconnect không tạo lần nhả thật. CC64 tổng hợp chỉ đóng
  state, không được nhận điểm nhả âm. Pedal còn giữ/bị ngắt không hiện F1 hoàn chỉnh.
- Chỉ dẫn pedal lấy từ score, mở rộng theo repeat, cắt theo A/B và bắt đầu
  lại ở vòng mới. Không có chỉ dẫn hoặc chọn nhiều part thì báo không có
  tham chiếu. Một part piano dùng hai khuông vẫn hỗ trợ.
- Engine ID/fingerprint có version mới và dữ liệu tham chiếu nhả/pedal;
  lịch sử cũ giữ nguyên, không chạy lại bằng luật mới. Backup khôi phục R4
  và kiểm cấu trúc/matching trước khi render.

## Kiểm chứng độc lập và tích hợp

`reference-r4.test.ts` gửi **535 ca** vào Python chạy file upstream gốc:
168 offset, 163 pedal, 204 sustain. So sánh bool, cặp matching và mọi metric;
gồm biên làm tròn, 63/64, retrigger, event đồng thời, nhiều instrument,
drums, khoảng trống và dữ liệu random có seed. Oracle không import TS sản phẩm.
Chỉ protobuf data container/unquantized flag được thay bằng host đơn giản;
không tuyên bố chạy toàn stack huấn luyện Magenta.

Corpus native `pedal-duration.musicxml` là bài CC0 tự tạo: staccato,
staccatissimo, tie xuyên ô, lặp hai ô hai lần, hai khuông, ba đoạn pedal
trong lịch diễn. `pedal-duration-snapshot.json` được tải bằng nút Snapshot
JSON từ WASM tối ưu; chỉ bỏ SVG và thay ID project local, giữ nguyên timing.
Kiểm cả tempo score, A/B vào giữa tie và loop tăng BPM.

MIDI mô phỏng đi qua router/controller/**Worker production**, gồm offset
75 ms, delivery 30 ms, pause/resume, state-only, channel isolation, nhả
sớm/trễ/không nhả, toggle pedal, âm ảo và replay. Các ca BPM cũ vẫn chạy.

| Browser production — bài native 17 target | Kết quả |
| --- | --- |
| Note On/Off và pedal theo mốc native | 17 Perfect, 17 nhả đúng, 17 âm ngân đúng, pedal 3/3; P/R/F1 100%; replay khớp |
| Tắt pedal, Note On/Off theo mốc native | 17 nhả đúng; pedal `disabled`, không chấm sustain; replay khớp |
| Onset −120 ms, chỉ giữ 20 ms, không pedal | 17 Meh, accuracy BPM 16,4%; 17 nhả sớm, pedal 0/3/F1 0%; replay khớp |
| Đạp pedal ảo rồi tắt Dùng pedal | CC64 ON → OFF, nút ảo disabled, cấu hình giữ khi tập lại |

Đây là mô phỏng có nhãn; không dùng để so tiến bộ với lượt người chơi.
Test/build cuối: **71/71 test**, TypeScript/Vite và native WASM tối ưu.
Audit cutover kiểm source/bundle/map/WASM không có grader cũ.
Artifact local ở `artifacts/r4-research/`: `tests-final.log`, `build-web.log`,
`browser-r4-perfect.json`, `browser-r4-pedal-off.json`, `browser-r4-early.json`,
`native-pedal-duration.json`. Ảnh và report đóng gói cũng lưu tại đây.
Các fixture/test/source gốc nằm trong source archive; bằng chứng local không
được đưa vào web public.

## Giới hạn và phát hành

Không chấm half-pedal/độ sâu, acoustic decay, legato theo câu, diễn cảm hoặc
realization arpeggio/grace. Native release thiếu/nhập nhằng hoặc ornament
nhiều attack được ghi `unavailable`, không đoán hệ số thay thế. Cửa sổ
mir_eval là profile transcription có thể tái tạo, chưa được nghiệm thu về
sư phạm trên đàn thật. M7 nâng cao không được đánh dấu hoàn tất vì R4 này.

Gói chuẩn bị `artifacts/releases/pianist-web-2026-10-18-r4/` có source đúng
commit, license, web zip, manifest/hash và cấu hình triển khai. Public chỉ
chứa bài CC0; Phố Xa local không vào gói. Chưa publish hay kiểm HTTPS.
Không thay đổi kết luận offline/mất mạng hoặc lỗi WebGL còn mở trong
[R0_R7_RESULTS](R0_R7_RESULTS.md).

Tái lập: cài dependencies ở `tests/reference-runners/r4/requirements.txt`
vào `.tools/r4-python`, chạy `npm --prefix apps/pianist-web test`, rồi
`buildscripts/pianist/build-pianist.ps1`. CLI `scripts/replay.ts` kiểm JSON
với đúng engine version. Hướng dẫn chi tiết trong PROVENANCE và PIANIST_WEB.
