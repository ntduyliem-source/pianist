# Kế hoạch code Pianist Web

Cập nhật: 18/10/2026. Nền tảng: **web chạy trong trình duyệt**. M0/editor MuseScore và thư viện được giữ. Bộ chấm cũ đã xóa khỏi source sản phẩm, thay bằng engine V2 đối chiếu code gốc. Màn tập riêng, chỉ đọc, không notation edit. **Phần M7 chấm trường độ/arpeggio cũ đã gỡ; không dùng việc gỡ này để tuyên bố M7 hoàn tất.** Xem [hướng dẫn hiện tại](PIANIST_WEB.md), [nghiệm thu R0–R7](R0_R7_RESULTS.md), [bằng chứng M0](M0_RESULTS.md). MIDI thật và hosting HTTPS để sau theo yêu cầu người dùng.

Mục tiêu sản phẩm: mở website → nhập MXL → chỉnh sửa bản nhạc → lưu/mở lại hoặc tải file về → tập piano theo **Đúng nốt** hoặc **Theo BPM** → xem kết quả và tập lại đoạn yếu. Editor và màn hình tập dùng cùng nội dung bản nhạc, kể cả thay đổi chưa xuất file. “Pianist” là tên làm việc.

**Kế hoạch thay toàn bộ bộ chấm ngày 18/10/2026**

Yêu cầu: thay 100% mã chấm tự xây, ưu tiên tuyệt đối khả năng kiểm tra giữ BPM.
Đã triển khai engine `pianist-v2.osu-676f3b0.pts-b40e412.1`, schema kết quả 2.
Bản cũ tại `8a9674403d9fc0d67e133842b6854620be39ac29` chỉ còn trong lịch sử Git.
Kế hoạch này thay thế lựa chọn matcher, ngưỡng và công thức điểm của bản trước.
Các phần M0–M7 phía dưới ghi lại phạm vi sản phẩm và tình trạng triển khai cũ.

**Trạng thái thực hiện R0–R7**

| Bước | Trạng thái / bằng chứng |
| --- | --- |
| R0 | Đã ghim 26 source/license; runner C# chạy phương thức upstream nguyên văn, không lấy TS làm oracle. |
| R1 | 329 scenario khớp code C# ở kernel và host event-time, gồm 9 nốt −120 ms, octave, hợp âm, miss, biên OD và random có seed. |
| R2 | Adapter/clock/MIDI/Worker mới; native corpus, MIDI mô phỏng qua production Worker, count-in CC64, offset và replay đạt. |
| R3 | 4 hàm Wait PTS giữ nguyên; kiểm latch hợp âm, nốt lặp, sai octave, count-in; browser 8 hit + 1 input thừa. |
| R4 | Đã gỡ duration/arpeggio tự đặt, ghi raw Note Off/CC64, đối chiếu 68 probe hold-tail. **Còn mở toàn lifecycle hold và chấm diễn cảm piano; UI công bố chưa hỗ trợ. M7 chưa hoàn tất.** |
| R5 | UI/results/history chỉ dùng V2; browser kiểm snapshot sau edit/Back, giữ A–B/BPM/vòng, mở đúng project; highlight từ input/judgement. |
| R6 | Đã xóa module/Worker/controller/MIDI/transport cũ, contract/CLI/test chuyển V2, native bỏ hệ số release. Audit bundle/map/WASM và cache scope có cổng kiểm riêng. |
| R7 | Corpus, build, unit/integration, replay, stress và browser đã có bằng chứng; đóng gói/kiểm offline ghi tại báo cáo R0_R7_RESULTS. MIDI thật/HTTPS chưa nghiệm thu. |

Các phân tích và tiêu chí bên dưới giữ lại để truy nguyên quyết định. Những
câu “chưa chạy” trong mục nghiên cứu mô tả thời điểm lập kế hoạch; kết quả
runner và giới hạn hiện tại nằm trong [PROVENANCE](../third_party/practice-sources/PROVENANCE.md).

**Nguồn đã kiểm tra và quyết định sử dụng**

| Repo và commit ghim | Logic có trong source | Vai trò trong bản thay thế |
| --- | --- | --- |
| [Piano Trainer Studio](https://github.com/ztbishop/piano-trainer-studio/tree/b40e412ccbc701094a9bb4bfe91ef45c32065704), AGPL-3.0 | Wait/Realtime/Follow, nốt mong đợi theo tay/bè, bộ đếm đúng/sai, traversal và metronome | Nguồn port chế độ Đúng nốt; đối chiếu bài hai bè. Không dùng nguyên Realtime làm tiêu chuẩn BPM nghiêm ngặt. |
| [MusicLearn Trainer](https://github.com/LachlanB96/musiclearn-trainer/tree/e2c0fe01215c67cb8c4544b1e2220f4844cad297), AGPL-3.0 | Songs chạy theo tempo; ghép vào hit gần nhất; phân loại Perfect/Good/sớm/trễ | Nguồn so sánh hành vi và phản ví dụ. Không chọn hàm chấm hợp âm làm lõi. |
| [MIDI Rhythm Trainer](https://github.com/erangithub/eran_reaper_jsfx/tree/23bbc5c62c421fdd69dda7baca6609b704910ff6), GPL-3.0-or-later | Note On so với lưới beat, subdivision/swing/phase, error bound 1–250 ms, latency compensation −200…+200 ms | Nguồn kiểm tra độc lập phép đổi beat/thời gian, sớm/trễ và bù trễ; không quyết định pitch/miss của bản piano. |
| [osu!lazer / osu!mania](https://github.com/ppy/osu/tree/676f3b01f28841ebd97ab583e178f2d7b99fe48c), MIT | Hit windows, judgement từng note, thứ tự nốt cùng phím, tự miss, hold head/tail; có test replay cho các tình huống này | **Nguồn chính được chọn để port lõi BPM**, với cổng đối chiếu bắt buộc trước tích hợp. Chỉ lấy phần luật và dependency cần thiết, không lấy giao diện/game assets. |
| [PianoBooster](https://github.com/pianobooster/PianoBooster/tree/6dafdcbdfc5d35d12cecb051c30632d0f5be5806), GPL-3.0-or-later | `CConductor::pianistInput`, `followPlaying`, chế độ Play Along và Follow You, `CRating` | Đối chiếu bổ sung về luyện MIDI. Không chọn làm lõi BPM của đợt này: mô hình chord/follow/rating khác yêu cầu đánh giá từng onset. |

Các giới hạn có ảnh hưởng trực tiếp đến lựa chọn:

- MusicLearn [`songNote` / `resolveHit`](https://github.com/LachlanB96/musiclearn-trainer/blob/e2c0fe01215c67cb8c4544b1e2220f4844cad297/ui/index.html#L904)
  dùng pitch class trong hợp âm và trung bình offset có dấu. Probe chạy nguyên
  hàm `resolveHit` với hai nốt −100/+100 ms trả về `perfect`, offset 0. Vì vậy
  không thể copy nguyên hàm này để đánh giá độ đồng đều của từng nốt piano.
- Piano Trainer Studio [`tryReserveRealtimeUpcomingHeldNote`](https://github.com/ztbishop/piano-trainer-studio/blob/b40e412ccbc701094a9bb4bfe91ef45c32065704/js/trainer-core.js#L1635)
  cho đặt trước nốt đang giữ trong khoảng nhìn trước 1,1 beat;
  [`buildExpectedNotesFromEntries`](https://github.com/ztbishop/piano-trainer-studio/blob/b40e412ccbc701094a9bb4bfe91ef45c32065704/js/feedback-engine.js#L1059)
  có thể chuyển reservation thành hit. Đây là hành vi hỗ trợ tập, không phải
  quy tắc chấm onset theo cửa sổ ms cố định. Probe hàm reservation xác nhận
  trường hợp trước một beat được nhận; chưa chạy toàn ứng dụng upstream.
- MIDI Rhythm Trainer [`isHit`](https://github.com/erangithub/eran_reaper_jsfx/blob/23bbc5c62c421fdd69dda7baca6609b704910ff6/midi_rhythm_trainer#L445)
  chấm theo lưới nhịp tuần hoàn trong REAPER. Nó không ánh xạ một input vào
  một nốt cụ thể của MusicXML; không được dùng nó thay matcher của bản nhạc.
- osu!mania [`HitWindows`](https://github.com/ppy/osu/blob/676f3b01f28841ebd97ab583e178f2d7b99fe48c/osu.Game/Rulesets/Scoring/HitWindows.cs),
  [`DrawableNote`](https://github.com/ppy/osu/blob/676f3b01f28841ebd97ab583e178f2d7b99fe48c/osu.Game.Rulesets.Mania/Objects/Drawables/DrawableNote.cs)
  và [`OrderedHitPolicy`](https://github.com/ppy/osu/blob/676f3b01f28841ebd97ab583e178f2d7b99fe48c/osu.Game.Rulesets.Mania/UI/OrderedHitPolicy.cs)
  là code C#. Cần port cả đường xử lý input, thứ tự xét và chốt kết quả liên quan;
  chỉ chép bảng hit windows sẽ không tạo thành bộ chấm đúng. Policy của upstream
  không cho cửa sổ muộn của nốt trước kéo qua onset nốt kế tiếp cùng làn.
  [Test nốt sai thứ tự](https://github.com/ppy/osu/blob/676f3b01f28841ebd97ab583e178f2d7b99fe48c/osu.Game.Rulesets.Mania.Tests/TestSceneOutOfOrderHits.cs)
  và [test hold](https://github.com/ppy/osu/blob/676f3b01f28841ebd97ab583e178f2d7b99fe48c/osu.Game.Rulesets.Mania.Tests/TestSceneHoldNoteInput.cs)
  là đầu vào của cổng kiểm chứng. Chưa chạy các suite upstream này trong lượt lập kế hoạch.

Không repo nào ở trên đã được xác nhận là bộ chấm piano hoàn chỉnh gồm onset,
trường độ, pedal và diễn cảm. Chọn osu!mania là quyết định kỹ thuật dựa trên
source và test hiện có, chưa phải tuyên bố bản port hay tích hợp MIDI đã đạt.
Các source đã tải được đối chiếu Git blob với tree của commit ghim. Bằng chứng
nghiên cứu local: `artifacts/reference-audit-2026-10-18/`, gồm probe nguyên hàm
và kết quả JSON; đây không phải test nghiệm thu engine mới.

**Phạm vi xóa và thay thế**

| Mã hiện tại | Hành động trong đợt thay thế |
| --- | --- |
| Toàn bộ `packages/practice-core/`: `bpm.ts`, `wait.ts`, `release.ts`, `plan.ts`, `results.ts`, `replay.ts`, `comparison.ts` | Xóa toàn bộ sau khi engine mới qua kiểm chứng; không copy helper, matcher DP, cách chia block 8 nốt/1.500 ms, các rule hay công thức ngầm sang tên mới. |
| `packages/practice-worker/practice.worker.ts` | Xóa và thay Worker/protocol mới, nhận duy nhất engine mới. |
| `apps/pianist-web/src/practice/session.ts`, `feedback.ts` | Thay bộ điều khiển lượt và bộ chuyển kết quả thành highlight; UI chỉ hiển thị judgement từ engine. |
| `apps/pianist-web/src/platform/transport.ts`, `calibration.ts`; phần xử lý event/phím/pedal trong `midi.ts` | Thay lớp clock, calibration và trạng thái MIDI phục vụ luyện; quyền thiết bị vẫn qua Web MIDI. Không để filter count-in hay cách bù trễ cũ quyết định kết quả mới. |
| Các kiểu `Plan`, config, judgement, result/replay và `ALGORITHM_VERSION` trong `packages/score-contracts/index.ts` | Contract mới độc lập; tách dữ liệu snapshot của MuseScore khỏi kiểu của bộ chấm cũ. |
| Rule `releaseRatio` 0,5/0,25 và các quyết định chấm trong `src/web/appjs/practicesnapshot.cpp` | Xóa các hệ số chấm tự đặt. Bridge cung cấp dữ liệu score/playback đã xác minh và ký hiệu gốc; không tự gán dung sai hoặc điểm. |
| Các nhánh tạo plan/session, đổi config, xem kết quả/lịch sử trong `workspace.ts`, `main.tsx`, backup/export | Nối vào API mới; không giữ đường gọi bộ chấm cũ hoặc tự tính lại màu/điểm trong component. |
| Test/helper/CLI replay/stress còn import engine cũ; JS/Worker build, source map và service-worker cache của bản phát hành mới | Thay test bằng dữ liệu chuẩn độc lập; loại bỏ mọi dependency và artifact cũ khỏi gói mới. Không giữ engine cũ làm oracle. |

M0/editor MuseScore, nhập/xuất, thư viện và bản nhạc của người dùng nằm ngoài
phạm vi xóa bộ chấm. Dữ liệu lịch sử giữ nguyên như bản ghi chỉ đọc, có nhãn
phiên bản cũ; bản mới không chạy lại grader cũ hoặc so điểm cũ với điểm mới.
Đây là thay mã chạy và artifact phát hành, không viết lại lịch sử Git hay xóa
dữ liệu thư viện. Không có fallback, feature flag hay thư mục `legacy` chứa
grader cũ trong source sản phẩm mới.

**Kiến trúc thay thế**

`MuseScore snapshot → score adapter mới → danh sách target theo thời gian thực diễn`

`Web MIDI → MIDI state/clock adapter mới → engine BPM hoặc Wait → judgement log → UI/kết quả`

- `third_party/practice-sources/`: source tối thiểu được ghim, LICENSE, SHA-256,
  mapping symbol nguồn → symbol port, danh sách thay đổi bắt buộc cho web.
- `packages/practice-engine-v2/`: contract mới, bản port osu!mania cho BPM,
  bản port Wait của Piano Trainer Studio, adapter dữ liệu và bộ kết quả mới.
- `packages/practice-worker-v2/`: host của engine, event/protocol và lifecycle mới.
- `tests/reference-runners/`: chạy source gốc độc lập với bản port. Với osu!
  dùng C# và các dependency cần thiết; stub chỉ được thay I/O/UI, không thay
  thuật toán quyết định hit/miss. Nếu chưa tách được thì chạy suite trong
  checkout upstream, không dùng bản TypeScript mới để tự xác nhận chính nó.

Mỗi đoạn luật có nguồn là một trong ba loại: giữ nguyên upstream, port cơ học,
hoặc phần thích nghi có đặc tả/test riêng. Phần chưa có nguồn phù hợp phải được
ghi rõ; không gọi code tự viết mới là code đã port. Lớp adapter có nhiệm vụ đổi
schema, clock, MIDI và ID, không được tự có matcher hoặc grader thứ hai.

**Luật BPM phải thể hiện bằng test trước khi nối UI**

1. Timeline chạy theo tempo đã chọn hoặc tempo map của score. Không kéo tempo
   theo người chơi, tự dừng chờ nốt hay tự hiệu chỉnh offset trong lúc chấm.
   Nhãn BPM phải nói rõ đơn vị phách, kể cả nhịp ghép như 6/8.
2. Cùng một mốc thời gian cho metronome, target và input. Dùng timestamp nhận
   từ Web MIDI và ánh xạ sang audio clock; UI frame hay thời điểm Worker nhận
   message không được thay timestamp bấm phím. Offset hiệu chuẩn áp dụng đúng
   một lần; dấu của offset phải có ca kiểm chứng cụ thể.
3. Mỗi pitch MIDI là một làn logic, hỗ trợ dải MIDI 0–127; khác octave là khác
   pitch. Chuyển hợp âm/hai tay thành các target đồng thời; tie/unison/repeat
   có ID lần diễn riêng. Hand attribution lấy từ score, không suy đoán tay thật.
4. Port luật xét nốt cùng làn và chốt hit/miss của osu!mania, gồm thứ tự dispatch.
   Bỏ hoàn toàn tối ưu coverage bằng DP và ranh giới block tự đặt của bản cũ.
   Chốt rõ hành vi bỏ nốt, bấm thừa, nốt dày, bấm sớm trước nốt kế; không hứa
   suy ra ý định người chơi trong các chuỗi cùng pitch vốn có thể nhập nhằng.
5. Bản parity đầu dùng đúng hit windows/profile upstream. Một profile học piano
   khác chỉ được thêm như thay đổi có tên, phiên bản, bảng ms và test; không
   mặc nhiên kế thừa bộ 50/120/250 ms hay trọng số điểm cũ.
6. Chấm delta từng onset; thống kê độ lệch tuyệt đối riêng với xu hướng sớm/trễ.
   Hai offset −100/+100 ms không được làm cả hợp âm thành Perfect. Mỗi event
   chỉ tiêu thụ một target vật lý; input không được tiêu thụ được ghi riêng.
7. Count-in vẫn cập nhật pedal, Note Off và trạng thái thiết bị. Attack ngoài
   phạm vi chấm không được ghi điểm, nhưng không được làm mất trạng thái CC64.
   Pause, mất focus, disconnect và reset tạo ranh giới lượt rõ ràng; event cũ
   không được làm thay đổi kết quả mới.
8. Event log và replay giữ timestamp, seq, port/channel, tempo map, config,
   revision score và phiên bản nguồn. Đổi cách chia batch hoặc tốc độ render
   không làm đổi kết quả. Quá hạn giao input phải báo gián đoạn có lý do, không
   lặng lẽ đổi thành người chơi đánh sai.

Tổng điểm timing nếu có lấy luật/weights đã port của nguồn đã chọn. Tỷ lệ nốt,
input thừa, delta và tiến độ là báo cáo riêng, công bố mẫu số; phải ghi rõ
accuracy của upstream có phạt input thừa hay không. Không tái dùng công thức
điểm ngầm của Pianist cũ hoặc để bấm loạn trông giống chơi chính xác.

**Các bước thực hiện và cổng nghiệm thu**

| Bước | Công việc cụ thể | Điều kiện xong |
| --- | --- | --- |
| R0 — Khóa nguồn và hành vi | Đóng băng commit/source hash/license; xác định toàn bộ dependency của judgement; dựng runner upstream và corpus đầu vào/đầu ra. | Chạy được code gốc cho hit windows, nốt cùng pitch, missed/extra và hai tay. Ghi kết quả và giới hạn; nếu nguồn không đạt corpus thì đánh giá nguồn khác, không quay lại grader cũ. |
| R1 — Port BPM trước | Port HitWindows, ManiaHitWindows, OrderedHitPolicy, note judgement và đường dispatch/finalization cần thiết. Chạy độc lập khỏi React/MuseScore. | Cùng event stream/profile cho cùng target association, judgement, delta và thời điểm chốt như source gốc. Sai khác số thực chỉ cho sai số biểu diễn đã ghi; phân loại/ID phải khớp. |
| R2 — Nối timeline và MIDI | Adapter mới cho score/repeat/tempo/A–B/loop; Web MIDI timestamp, audio clock, calibration, CC64/device/channel, Worker. | Corpus native MusicXML/MXL và MIDI mô phỏng đi hết đường production, không dùng adapter giả thay phần đang nghiệm thu; sửa tận gốc mất pedal trong count-in. |
| R3 — Port Đúng nốt | Tách Wait của Piano Trainer Studio, expected group/match/advance và dependency; bỏ Follow/Realtime reservation khỏi mode này. | Kiểm hợp âm thiếu nốt, pitch/octave sai, Note On lặp, nhả/đánh lại và tie. Ghi rõ Wait upstream ghi nhận nốt đã đánh hay yêu cầu giữ đồng thời; mọi khác biệt với yêu cầu Pianist phải có fixture, không sao lại `WaitCore`. |
| R4 — Trường độ và pedal | Port/test hold judgement upstream cho bài luyện giữ phím được định nghĩa rõ; xác minh dữ liệu MIDI CC64 theo nguồn chuẩn, cùng thời điểm onset và release. Đặc tả riêng pedal/articulation/legato của piano. | Không đồng nhất hold-note game với diễn cảm piano. Xóa grader duration cũ; nhánh sustain chưa có nguồn/expected output đủ phải hiện chưa hỗ trợ, không cho điểm phỏng đoán. Chỉ đánh dấu M7 hoàn tất khi nhánh này có corpus đạt, không dùng việc tắt tính năng để nghiệm thu M7. |
| R5 — UI và kết quả | API/controller/feedback/history/replay mới; mọi lối vào practice kiểm project/revision; config thuộc đúng bài; nút từ kết quả mở đúng project. | Highlight khi nhận phím, màu judgement từ engine, repeat không dính màu cũ; Browser Back sau sửa bài dùng snapshot mới; đoạn/BPM không tự reset; history không mở nhầm bài. |
| R6 — Xóa engine cũ và chuyển hẳn | Xóa các module trong bảng phạm vi, test/helper/import/fallback; chuyển dữ liệu lịch sử chỉ đọc; làm sạch build và tạo release cache mới. | Build graph, bundle, source map, Worker và offline cache mới không chứa implementation grader cũ; mở/restore history không tải grader cũ. Không duy trì hai engine trong bản phát hành. |
| R7 — Nghiệm thu lại và đóng gói | Chạy corpus độc lập, browser/MIDI mô phỏng, replay/stress/offline; build/typecheck; kiểm gói triển khai và báo cáo khoảng còn mở. | Tất cả cổng BPM đạt; không còn P1/P2 về chấm hoặc state của lượt trong phạm vi đã xác minh; số đo có file bằng chứng. MIDI thật và HTTPS chờ điều kiện đã thống nhất, không ghi thành đã kiểm. |

Thứ tự bắt buộc: R0 → R1 → R2, sau đó R3/R4 → R5 → R6 → R7.
Các quyết định luật R4 phải được chốt trong đặc tả trước khi công bố tính năng;
không tự thêm thuật toán chấm pedal để đẩy nhanh mốc. Khi triển khai có thể
phát triển engine mới trong vùng cách ly trước cutover; R6 bắt buộc xóa hẳn mã
cũ, không để vùng cách ly thành cơ chế chạy song song trong sản phẩm.

**Corpus tối thiểu để nghiệm thu BPM và tích hợp**

| Ca | Kỳ vọng phải chứng minh độc lập |
| --- | --- |
| 9 C4 tại 500…2.100 ms, cách 200 ms; tất cả input sớm 120 ms | Với cửa sổ upstream cho phép: 9 association đúng thứ tự, delta −120 ms, không tự chuyển thành +80 ms hoặc rơi mất nốt ở ranh giới block. |
| Bỏ nốt đầu chuỗi C4 dày rồi chơi các nốt sau đúng lịch | Miss đúng mục tiêu; không kéo lệch toàn bộ chuỗi để tối đa số match. |
| Biên từng hit window | Kiểm ngay trong/đúng biên/ngay ngoài ở cả hai phía; giữ đúng quy tắc bao hàm của upstream. |
| Bấm trước onset 1 beat, giữ phím qua onset | BPM không ghi Perfect do phím đã giữ; không nhập reservation hỗ trợ của PTS vào luật BPM. |
| Hợp âm với −100/+100 ms; hợp âm thiếu/thừa nốt | Delta từng nốt còn nguyên, không triệt tiêu nhau; một input không thành hai lần đánh. |
| Note On velocity 0, Note On trùng, Note Off nhiều kênh/cổng | Phân loại theo trạng thái MIDI được đặc tả; không đếm nốt mới từ phím còn giữ hoặc tắt nhầm nốt cổng khác. |
| Pedal ON −500 ms, note ON 0, OFF 100, pedal OFF 1.000 | Ghi đúng key interval 100 ms và sustain interval 1.000 ms cho ca không retrigger; đánh giá duration là cổng R4 riêng, không sửa onset theo pedal. |
| Hai tay khác mật độ; unison, tie, voice/cross-staff | Pitch/occurrence đúng, chỉ tiêu thụ một physical attack khi thực sự cùng mục tiêu; không yêu cầu attack ở tie continuation. |
| Pickup, rest, triplet, tempo change, 6/8, repeat/volta/DC/DS, A–B/loop | Lịch target đối chiếu dữ liệu phát MuseScore và thời gian tính độc lập; UI đổi frame không đổi lịch. |
| Offset ±, count-in, pause/resume, disconnect/reconnect | Bù đúng một lần; state pedal đúng; không biến reset thành lỗi nhả; event của epoch cũ không được ghi điểm. |
| Tick 16/40/100 ms, batch MIDI và giao trễ trong giới hạn | Cùng target ID/grade/delta và kết quả cuối; ghi rõ ordering/watermark ở thời điểm chốt. |
| Phiên bỏ dở, nhiều loop, BPM tăng từng loop | Mẫu số dựa trên phần đủ điều kiện đã đánh giá; không chấm nốt tương lai thành miss; không so lượt khác profile thành cùng chuẩn. |
| Sửa bài → Browser Back; đổi trang; mở kết quả bài khác | Snapshot/revision/config/project đúng, tất cả lối vào dùng controller mới. |
| Score dài và input dày | Đo memory/jitter/throughput; không thêm ranh giới cắt matcher để đạt số đo; quá giới hạn báo rõ trước/chuyển interrupted, không trả điểm sai. |
| Clean release, update từ bản cũ, offline, restore backup | Chỉ engine mới được nạp; dữ liệu lịch sử vẫn đọc được; backup của chính app phải restore được, gồm title dài (B06). |

Giá trị expected đến từ source gốc và các fixture tính độc lập. Replay của chính
engine mới chỉ kiểm tính lặp lại, không thay thế bằng chứng chấm đúng. Các test
cũ có thể cung cấp dữ liệu tình huống sau khi bỏ mọi import/helper grader cũ,
nhưng expected phải được xét lại theo luật mới; không dùng 102 test cũ làm
bằng chứng thay thế đã hoàn tất.

Theo dõi thêm lỗi WebGL/native abort R01 trong báo cáo
[audit hệ thống](BUG_AUDIT_2026-10-18.md): đây là lỗi engine/lifecycle cần điều tra
riêng, thay grader không tự chứng minh đã sửa. Các lỗi B01–B05 phải có ca nghiệm
thu ở các bước trên; B06 thuộc backup được kiểm ở R7. Bản kế hoạch không đóng
bất kỳ lỗi nào chỉ vì đã nêu hướng xử lý.

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

Checkbox đã đánh dấu có bằng chứng trong báo cáo tương ứng M0 hoặc M1–M6; các ô còn trống là backlog. Lộ trình đặt M0–M2 trước phần luyện tích hợp. Thực tế đã triển khai M3–M6 khi M2 chưa hoàn tất toàn bộ ma trận editor; đây là phần chưa tuân thủ cổng nghiệm thu, không có nghĩa M2 được bỏ qua. Xem [đối chiếu triển khai và repo tham khảo](IMPLEMENTATION_AUDIT.md).

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

Bridge đã có version/revision, hủy response snapshot cũ và nút hủy trong lúc kiểm tra file/tải engine. Hủy importer C++ đang chạy đồng bộ chưa được port thành tác vụ có thể ngắt.

Nghiệm thu: mở MXL → sửa → lưu thư viện → reload → mở lại được; tải MSCZ/MXL mang nội dung đã sửa. Bộ nhớ filesystem tạm của WASM không được coi là đã lưu bền vững.

**M2 — Hoàn thiện editor và tạo dữ liệu luyện**

- [ ] Đạt các nhóm editor trong ma trận dưới đây; giữ nguyên các lệnh MuseScore tái sử dụng được, port những phần phụ thuộc desktop.
- [x] Xây `ScoreSnapshotBuilder` lấy nội dung đang mở, không phụ thuộc file trên đĩa.
- [x] Xử lý nhiều voice, chord, rest, tie, tuplets, pickup, chuyển tempo, repeats, volta và jumps có navigation rõ trong corpus; tách tick ký âm khỏi thời gian thực hiện.
- [x] Gộp unison cùng pitch/onset thành một mục tiêu vật lý có nhiều anchor; các lần đánh cùng pitch về sau vẫn là mục tiêu riêng.
- [x] Phân vai trò trái/phải theo part/staff/voice và cho chỉnh; nhận diện cross-staff. Không dùng một điểm chia cao độ cho mọi bài.
- [x] Quy định cách xử lý grace note, ornament, arpeggio, fermata; trường hợp chưa hỗ trợ phải được giải thích trước khi tập.
- [x] Xuất geometry/semantic anchors dùng cho highlight, chọn ô nhịp và cuộn; vô hiệu hóa geometry cũ khi layout thay đổi.
- [x] Viết test score adapter và corpus import/export với kết quả âm nhạc độc lập, tách lỗi layout khỏi lỗi nội dung.

Corpus hiện có pickup/tuplet/tempo/tie/unison, volta, D.C. al Fine, D.S. al Coda,
cross-staff và ký hiệu đặc biệt. Volta/DC/DS đã qua vòng MXL xuất–nhập với
fingerprint không đổi. Đây là corpus ban đầu; ma trận editor và mọi biến thể
navigation/text-only chưa được coi là đã nghiệm thu.

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

Đường MIDI đã kiểm bằng event giả lập và kiểm thử router; thêm 12 ca qua cổng Web MIDI giả lập → router → session/transport → Worker thật → kết quả/replay (`npm run test:midi`). Người dùng xác nhận chưa có đàn, ưu tiên mô phỏng trước; quyền thiết bị/rút cắm đàn vật lý vẫn cần nghiệm thu thực tế.

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
- [x] Chuẩn bị Caddy/Docker Compose, WASM MIME, cache, COOP/COEP và MIDI cùng origin; chạy Caddy thật trên loopback và kiểm hash/headers bằng script.
- [ ] Thử domain HTTPS top-level với chứng chỉ hợp lệ. Người dùng chưa có hosting; gói triển khai được chuẩn bị, chưa publish.
- [x] PWA/offline là bước hoàn thiện sau khi tải tài nguyên thành công: cache có version, không trộn JS/engine cũ mới, không coi cache là nơi lưu project.
- [x] Đóng gói notices có inventory/hash, source archive đúng Git commit, toolchain và hướng dẫn build; gói public dùng bài tự tạo CC0, bỏ ví dụ local.
- [ ] Hoàn tất kiểm kê dependency đã link và corresponding source/điều kiện phân phối Qt static cho đúng artifact trước phát hành công khai.
- [ ] Nghiệm thu toàn bộ ma trận editor và các ca bắt buộc. Mục chưa đạt được ghi thành lỗi chặn hoặc giới hạn công khai, không coi bản alpha là hoàn thành yêu cầu.

Nghiệm thu v1: mở URL trên máy chưa cài MuseScore → nhập MXL → sửa → lưu/tải/mở lại → dùng đàn MIDI tập cả hai chế độ → xem lịch sử → xuất MXL. Chốt triển khai hosting khi bắt đầu thực hiện phát hành; lượt lập kế hoạch này chưa tạo hay publish website.

IndexedDB có cơ chế quota và eviction phụ thuộc trình duyệt; thiết kế cần có phục hồi và tải bản sao thay vì hứa dữ liệu cục bộ tồn tại vĩnh viễn. [Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

**M7 — Luyện nâng cao và đồng bộ tùy nhu cầu**

- [x] Chấm độ dài riêng theo Note Off hoặc sustain CC64 từng device/channel; gate staccato 50%, staccatissimo 25%, nốt thường/tie 100%; pause/disconnect không tạo lỗi nhả sớm giả. Mặc định tắt, chỉ có trong BPM.
- [x] Profile arpeggio lên/xuống trong từng hợp âm: 80/120/200 ms, tối đa nửa trường độ; snapshot native có fixture kiểm chứng.
- [ ] Kiểm policy độ dài với người chơi/đàn thật; chấm legato theo câu nhạc, rest theo từng bè và pedal theo ký hiệu riêng. MIDI không đo được chính xác lúc âm piano vật lý tắt.
- [ ] Realization grace/ornament và arpeggio xuyên khuông; fermata diễn cảm. Hiện công khai policy bỏ grace, chấm nốt ornament chính, không chấm độ dài ornament và fermata theo native timeline.
- [x] Phát riêng bè/tay còn lại bằng lọc role/event; hai tay piano có thể chung instrument track.
- [x] Tăng/giảm BPM giữa các lượt loop theo mức đặt trước đã hiển thị; timeline được lập trước, không tự kéo theo người chơi.
- [ ] Mở rộng browser/tablet sau đo hiệu năng và thiết bị thực tế.
- [ ] Nếu cần tài khoản: thêm API xác thực, object storage cho file, database metadata/lịch sử, revision conflict và đồng bộ. Chấm thời gian vẫn ở trình duyệt.
- [x] Chỉ so sánh tiến bộ giữa những lượt hoàn thành có cấu hình, score, nguồn input, clock và phiên bản thuật toán tương thích.
- [x] Nhập/xuất toàn bộ thư viện, bản nguồn, recovery và lịch sử; xem trước/kiểm hash trước khôi phục; tạo ID mới và commit một transaction. Không tự áp dụng calibration của máy cũ.

Âm tay còn lại hiện là âm hướng dẫn tổng hợp, không phải tiếng piano MS Basic.
Chấm độ dài là policy luyện tập có phiên bản, chưa phải đánh giá diễn cảm hay
âm thanh piano vật lý. Tài khoản, tablet và đồng bộ là nhánh mở rộng có điều
kiện, chưa được nghiệm thu.

**6. Quy tắc của thiết kế cũ — được thay thế bởi kế hoạch ngày 18/10/2026**

Các ngưỡng và công thức dưới đây mô tả thiết kế trước. Khi viết bản thay thế,
dùng nguồn ghim, luật BPM và các cổng R0–R7 ở đầu tài liệu; không lấy phần này
làm đặc tả để chép lại engine cũ.

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
