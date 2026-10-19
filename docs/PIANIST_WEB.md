# Pianist Web — sử dụng bản V2

Cập nhật 19/10/2026. **Thư viện**, **Editor MuseScore** và **Tập piano** là ba màn riêng. Màn tập chỉ đọc bản nhạc; nhập/sửa/lưu vẫn dùng MuseScore WASM. Bộ chấm cũ đã bị xóa. Xem [nguồn và symbol](../third_party/practice-sources/PROVENANCE.md), [báo cáo R0–R7](R0_R7_RESULTS.md).

## Chạy local và build

```powershell
# Sau khi đã build native; -SkipEngine dùng cặp JS/WASM hiện có:
.\buildscripts\pianist\build-pianist.ps1 -SkipEngine -SkipInstall
python buildscripts/pianist/serve-web.py
```

Mở <http://127.0.0.1:8787/pianist.html>. Server phục vụ loopback, port 8787. Checkout mới cần `setup-web.ps1` rồi `build-pianist.ps1`. Build native mặc định tối ưu; `-FastLink` dành cho phát triển, không được đóng gói phát hành.

## Luồng sử dụng

1. Nhập ABC một bài hoặc MXL/MusicXML/MSCZ (tối đa 32 MiB), hay mở bài trong thư viện. Thanh **Tập piano** mở trang chọn bài, dùng được cả khi chưa mở editor.
2. **Lưu thư viện/Ctrl+S** lưu IndexedDB. **Lưu bản mới/Ctrl+Shift+S** tạo project riêng. Tải MSCZ/xuất MXL, XML, PDF tạo file trên máy.
3. **Tập bài này** lấy snapshot hiện tại, gồm sửa đổi chưa xuất file. Chọn A/B bằng ô nhịp trên bản nhạc hoặc trường số, tay/khuông/voice, BPM/đơn vị phách, tempo cố định hoặc tempo score, số vòng và mức tăng BPM.
4. Kết nối/chọn đàn MIDI hoặc dùng phím ảo/phím máy tính A W S E D F T G Y H U J. Bàn phím hiển thị một quãng có thể đổi, nhận toàn dải MIDI 0–127.
5. Bắt đầu, tạm dừng/tiếp tục hoặc kết thúc. Kết quả có delta từng nốt, miss, input thừa, JSON, CSV và replay. Nút tập lại ô nhịp mở đúng project.

Cấu hình đoạn/BPM thuộc từng bài. Quay lại từ editor, kể cả Browser Back, tạo snapshot mới. Lượt đang chạy/đang tạm dừng khóa thao tác đổi bài. Phố Xa do người dùng cung cấp là ví dụ local; gói public dùng bài CC0.

## Nhập ABC — A1/A2

Nút mở file và kéo thả nhận `.abc` UTF-8. abc2xml 2.68 nguyên bản chạy trong Worker Pyodide cùng website, rồi MusicXML đi vào editor MuseScore. Có thể sửa, undo/redo, lưu thư viện, tải MSCZ/MXL và tập như bài nhập từ MXL. Bài đã lưu mở bằng MSCZ, không chuyển ABC lại. Màn tập giữ bộ chấm BPM/Đúng nốt/R4 hiện có.

Lần mở ABC đầu tải thêm khoảng 13,5 MB runtime; MXL không tải phần này. `build-pianist.ps1` chuẩn bị runtime tự động; nếu chỉ build web bằng npm, chạy thêm `python buildscripts/pianist/prepare-score-format-sources.py`. Tất cả xử lý tại máy, không gửi bản nhạc đi.

ABC nhiều bài hiện báo lỗi để người dùng tách file; chọn bài là A3. Converter có giới hạn: các ca mất trường độ, tie, D.C./D.S./Coda và bè xuyên khuông đã phát hiện sẽ bị từ chối, giữ nguyên bài đang mở. Với Phố Xa, tiếp tục dùng **MXL gốc**; bản ABC chưa đạt kiểm chứng âm nhạc. Xem [profile và bằng chứng](ABC_CONVERTER_RESULTS.md).

Hủy khi đang đọc/chuyển ABC dừng Worker. Chọn file khác trong giai đoạn có thể hủy sẽ thay lượt mở cũ; bước nhập native cuối khóa thay file. Chưa có nút xuất ABC (A4), chưa tích hợp runtime ABC vào gói offline/phát hành (A6); chuẩn bị offline hiện tại không bảo đảm mở ABC mới khi mất mạng.

## Màn tập v2 và toàn màn hình

**Chỉ bản nhạc** mở fullscreen nếu trình duyệt hỗ trợ, hoặc phủ vùng ứng dụng khi fullscreen không khả dụng. Thanh điều khiển trên cùng cao khoảng 39 px ở desktop; **Ẩn thanh điều khiển** dành toàn bộ viewport cho sheet. Nút nhỏ **Hiện điều khiển** đưa thanh trở lại. Bấm **Thoát toàn màn hình** hoặc Escape để về bố cục thường. Không có thao tác chỉnh sửa notation trong màn tập.

Bản nhạc dùng SVG do MuseScore xuất, xếp liên tục theo system và giữ cả hai khuông piano, dynamics/pedal, tên nhạc cụ. Không ký âm lại bằng một renderer khác. **Vừa chiều rộng** tự thích ứng kích thước cửa sổ; có các mức zoom 60–180%. Bàn phím hỗ trợ có thể thu gọn; phím máy tính vẫn hoạt động khi ẩn bàn phím hoặc mở fullscreen.

**Cuộn theo nhạc** giữ system đang chơi trong vùng đọc, chừa chỗ nhìn trước. BPM đi theo thời gian diễn tấu của bản nhạc kể cả khi người chơi bỏ nốt hoặc gặp dấu nghỉ; Đúng nốt đi theo nhóm hiện tại của engine. Repeat, A–B và vòng tập quay về đúng vị trí. Cuộn tay bằng chuột, cảm ứng hoặc phím điều hướng tạm ngưng bám bài; **Tiếp tục theo bài** khôi phục. Đây là logic trình bày, không thay matcher, clock hoặc điểm của engine.

**Chọn đoạn** mở A–B theo ô nhịp; nhập đủ số rồi Enter/rời trường hoặc chọn A/B trực tiếp trên sheet. **Nghe đoạn** phát âm hướng dẫn theo timeline, không tạo kết quả chấm. **Lại đoạn** lưu lượt hiện tại với trạng thái dừng sớm rồi bắt đầu lượt mới tại A, giữ màn tập. **Thiết lập** gom MIDI, tay/bè, count-in, vòng tập, tempo, trường độ, pedal và hiệu chuẩn; mở thiết lập khi đang chơi sẽ tạm dừng lượt.

Kiểm tra v2: 83 test tự động, gồm oracle C#/Python của BPM/R4 và các ca camera, repeat, A–B, lưu lượt khi restart, màu nốt và giữ/nhả đúng lần đánh; build TypeScript/Vite và audit loại bỏ bộ chấm cũ đạt. Kiểm trình duyệt local với Phố Xa: nhập A–B nhiều chữ số, nghe đoạn và chạy BPM, di chuyển viewport, cuộn tay/quay lại, tạm dừng/restart, fullscreen và ẩn thanh. Đàn MIDI thật và HTTPS vẫn để sau.

## Đúng nốt — Piano Trainer Studio

Dùng bốn hàm Wait nguyên văn của upstream ghim `b40e412`. Mỗi nhóm yêu cầu đúng pitch MIDI, gồm octave. Nhóm tiến khi đã ghi nhận đủ nốt; **không bắt buộc giữ đồng thời toàn bộ hợp âm**. Đây là hành vi latch của nguồn gốc. Nốt lặp cần nhả rồi đánh lại; Note On trùng khi còn giữ được router chuẩn hóa. Phím giữ từ count-in/resume không tự ghi thêm điểm. Chế độ này không cho điểm timing và không áp dụng Follow/Realtime reservation của upstream.

## Theo BPM — osu!mania

Lịch chạy độc lập với người chơi. Mỗi pitch là một làn, xét theo thứ tự và notelock của osu!mania `676f3b0`. Mỗi input tiêu thụ tối đa một target; không có matcher DP, cụm 8 nốt hoặc ranh giới 1,5 giây. Các nốt cùng pitch dày vẫn có thể nhập nhằng về ý định người chơi; bản này tuân theo policy nguồn gốc.

Profile modern Mania, không Classic/mods. Ở OD 5 mặc định:

| Grade | Cửa sổ tuyệt đối của upstream | Điểm gốc |
| --- | ---: | ---: |
| Perfect | 19,5 ms | 305 |
| Great | 49,5 ms | 300 |
| Good | 82,5 ms | 200 |
| OK | 112,5 ms | 100 |
| Meh | 136,5 ms | 50 |
| Miss | 173,5 ms | 0 |

Bảng là `ResultFor`; đường dispatch còn áp dụng notelock và tự Miss ngay sau cửa sổ Meh. Không hiểu dòng Miss là cho phép hit muộn 173,5 ms. Thay OD dùng đúng hàm nội suy/floor của upstream, không đổi ngưỡng ngầm cho piano.

Accuracy = tổng trọng số judgement / (305 × số nốt đã đánh giá). Upstream không trừ input thừa vào accuracy; UI luôn hiển thị riêng input thừa và precision = nốt nhận đúng / số lần bấm đã chấm, gồm lần bấm bị nhận Miss. Coverage = nốt nhận đúng / số nốt đã đánh giá. Lượt dừng sớm không biến các nốt tương lai thành Miss. Trung vị/P90 sai lệch tuyệt đối tách khỏi xu hướng sớm/trễ có dấu: −100/+100 ms không tạo thành cả hợp âm Perfect.

## Clock, MIDI, hiệu chuẩn và highlight

Input giữ timestamp Web MIDI, đổi về cùng trục với target/metronome qua Web Audio `getOutputTimestamp`, fallback `currentTime` có ghi provenance. UI frame không quyết định điểm. Worker xử lý theo thời gian event và ngân sách giao 150 ms; vượt hạn báo gián đoạn. Offset được trừ đúng một lần. Bài hiệu chuẩn 12 click dùng controller/Worker thật, cần ít nhất 8 hit; đề xuất median offset có cả sai lệch phản ứng người chơi, không phải đo riêng latency phần cứng. Chỉ áp dụng khi bấm xác nhận, lưu theo device ID.

Count-in vẫn nhận Note Off/CC64. CC64 ≥64 bật, ≤63 tắt, tách từng channel/port. Đổi thiết bị không mang offset của đàn cũ. Pause/ẩn tab/disconnect/audio suspend hoặc lịch audio bị trễ trên 250 ms đóng băng lượt; resume đếm vào lại và chỉ phục hồi phím đang giữ dưới dạng state, không tự tạo attack.

Highlight tô trực tiếp **nét nốt MuseScore** theo cách trình bày của HTML Liem Piano Coach được cung cấp (`assets/js/render.js`, `assets/css/components.css`), không phủ khung chữ nhật. Nốt cần chơi xanh lam, đúng xanh lá, timing chưa tốt vàng, Miss đỏ. Phím đang giữ có quầng sáng nhẹ, nối đúng sequence của lần Note On đã được engine chấm với trạng thái Note Off từ MIDI router; không dùng giới hạn 250 ms hoặc so pitch để làm sáng nốt tương lai. Bàn phím hỗ trợ vẫn hiện phím đang giữ bằng xanh lam. Nghe đoạn tô màu theo từng span/trường độ native và không tạo judgement.

SVG exporter gắn `data-practice-notes` từ chính Note/Chord vào đầu nốt, dấu hóa, dấu chấm, thân/móc nốt. UI dùng định danh tick/track/note tương ứng snapshot để vẽ lại đúng path gốc bằng màu phản hồi; không suy đoán vị trí từ bounding box. Các đầu nốt trong hợp âm giữ màu độc lập; thân chung hiện vàng nếu trạng thái các nốt khác nhau. Đúng nốt hiển thị đỏ tại bước có input thừa, nhưng không ghi Miss giả cho target. Màu judgement lấy từ engine; UI không có matcher tạm hay công thức điểm riêng. Repeat/loop bỏ màu của lần diễn trước khi A bắt đầu, giữ màu cuối vòng trong khoảng nghỉ giữa hai vòng.

Kiểm trình duyệt ngày 18/10/2026: Phố Xa có đủ 1.282 đầu nốt khớp định danh SVG; anchors, performed, keyReleases, pedal, beats và occurrences trước/sau thay đổi giống nhau. Chạy MIDI mô phỏng 80 BPM, A4–B10, 3 vòng hoàn thành 273/273 onset, không Miss/input thừa. Nốt giữ dài có hiệu ứng giữ phím; đổi hệ 4–7 sang 8–10 và quay A đưa camera về đúng hệ, xóa màu vòng cũ. R4 có 240 mốc nhả đúng và 33 target thiếu mốc native (giới hạn đã ghi nhận), không diễn giải thành đủ 273 nhả đúng. Bằng chứng local ở `artifacts/practice-v2/demo/` (snapshot, audit, MIDI result và ảnh).

## Trường độ, pedal và ký hiệu

R4 chấm **nhả phím**, **âm ngân theo sustain** và **pedal CC64 nhị phân** riêng với điểm BPM. Bật/tắt **Chấm nhả phím khi tập BPM** trong Thiết lập. Công tắc **Pedal** nằm ngay trên bàn phím, trong Thiết lập và trên thanh fullscreen; nút **Đạp pedal / Nhả pedal** dùng với bàn phím ảo. Công tắc được khóa trong lượt để cấu hình chấm không thay đổi giữa chừng; kết thúc lượt để đổi. Cấu hình được lưu theo bài. Tắt pedal sẽ ngừng sustain ảo và chấm pedal/âm ngân; vẫn nhận Note Off và chấm nhả phím nếu được bật. Dữ liệu MIDI gốc vẫn được giữ.

Mốc nhả lấy trực tiếp từ `CompatMidiRender` của MuseScore, gồm staccato/staccatissimo và tie, không đặt lại tỷ lệ articulation trong JavaScript. Phép kiểm offset của **mir_eval** dùng sai lệch làm tròn 4 chữ số thập phân giây, dung sai `max(20% trường độ tham chiếu, 50 ms)`. Nốt được ghép bởi bộ BPM hiện có; bộ nhả không ghép lại để sửa điểm onset. Đây là so với cách MuseScore phát bài, không phải khẳng định chỉ có một cách diễn tấu đúng.

**Magenta note-seq** xử lý sustain và đánh lại cùng cao độ. `soundOffMs` raw trong JSON vẫn là lúc đóng cổng sustain; phần `r4.sound` chứa offset do thuật toán note-seq suy ra, có cắt âm trước tại lần đánh lại. Cả hai không đo acoustic decay. Pedal so với ký hiệu rõ trong bản nhạc, đi theo repeat/A–B/loop; profile có nguồn từ piano_transcription sử dụng mir_eval, cửa sổ đạp 200 ms và nhả `max(20% đoạn pedal, 50 ms)`. Kết quả có matching/precision/recall/F1, không trộn thành một điểm tổng tự đặt.

Không có ký hiệu pedal hoặc chọn nhiều part thì không suy đoán pedal đúng. Mốc nhả native thiếu/nhập nhằng, ornament nhiều attack hoặc arpeggio không được bù bằng hệ số đoán. Pause/disconnect/stop không được coi là nhả thật; pedal chưa nhả đủ không hiện F1 hoàn chỉnh. Chế độ Đúng nốt không chấm timing nhả/pedal. Half-pedal, legato theo câu, arpeggio và diễn cảm nâng cao vẫn chưa hỗ trợ. Xem [đối chiếu R4 và giới hạn](R4_RESULTS.md).

Tie liên tục không cần attack mới; vào giữa tie/A–B hoặc vòng mới cần đánh lại. Unison cùng pitch/onset gộp một attack, giữ anchor của các bè. Grace bị bỏ qua, ornament chấm nốt chính; arpeggio chưa được realize thành onset rải. Các giới hạn hiển thị trong phần cảnh báo của lượt. Khi chọn một tay có thể phát tay còn lại bằng âm hướng dẫn tổng hợp; âm hướng dẫn không được chấm.

## Lưu, lịch sử và replay

Thư viện, nguồn, recovery, kết quả và settings nằm trong IndexedDB v2. Tự lưu sau khoảng 1,6 giây không sửa. Web Locks/lease tránh hai tab ghi cùng project. Chỉ báo lưu sau khi transaction commit; lỗi quota vẫn có đường tải MSCZ. Lưu trữ bài có thể phục hồi, không xóa vĩnh viễn.

**Tải toàn bộ thư viện** tạo `.pianist.zip`; khôi phục kiểm hash/giới hạn và tạo ID mới, không ghi đè. Giới hạn 256 MiB nén/giải nén, 1.000 bài, 10.000 lượt/settings. Calibration thiết bị khác không được tự kích hoạt.

Kết quả mới dùng schema 2, engine `pianist-v2.osu-676f3b0.pts-b40e412.mir-fe73b35.ns-3582550.2`. Lịch sử khác engine giữ dữ liệu chỉ đọc, không chạy lại hoặc so điểm bằng bộ luật mới. Chọn lưu replay trước lượt tập; log gồm input gốc, clock, boundary và các mapping clock khi resume. JSON chứa đầy đủ; CSV có judgement BPM, mốc nhả/delta/dung sai và sustain; bảng UI hiển thị tối đa 1.000 nốt. Replay quá giới hạn không được giữ như log đầy đủ. Chỉ so lượt hoàn thành cùng engine/score/cấu hình/device/loại clock; lượt mô phỏng, nhả bị ngắt hoặc pedal chưa đầy đủ không tham gia so sánh tiến bộ.

```powershell
cd apps/pianist-web
npm ci
npm test
npm run test:midi
npm run build
node --import tsx scripts/replay.ts C:\path\to\result-v2.json
```

`test:midi` kiểm engine và đường router/controller/Worker production, chỉ thay phần I/O thiết bị, clock/audio có kiểm soát. Không cần đàn thật. Test R4 cần `python -m pip install --target .tools/r4-python -r tests/reference-runners/r4/requirements.txt` từ root để chạy code Python gốc. Thêm `?diagnostics=1` vào URL sẽ có nút MIDI mô phỏng −120 ms và **MIDI mô phỏng trường độ + pedal**: đi qua router production, ghi nhãn rõ trong kết quả. Đây không phải lượt người chơi. Bài kiểm CC0: `fixtures/pedal-duration.musicxml`.

## Offline và gói triển khai

**Chuẩn bị dùng offline** tải và kiểm SHA-256 bộ JS/WASM/tài nguyên khoảng 135 MiB. Mỗi service worker giữ một release; không đổi code giữa lượt. Đóng tab cũ rồi mở lại để kích hoạt release mới. Khi kích hoạt, cache code cũ trong cùng scope bị xóa; IndexedDB/thư viện không bị xóa.

```powershell
# Sau build tối ưu, test và commit source sạch:
python buildscripts/pianist/package-web.py
python buildscripts/pianist/stage-release.py --output artifacts/releases/pianist-web-2026-10-18-r4
python buildscripts/pianist/verify-release.py --directory artifacts/releases/pianist-web-2026-10-18-r4/site --public
```

Gói có site, zip web, source đúng commit, toolchain/lockfile, hash, Caddy/Compose và DEPLOY.txt. Chưa phát hành hosting. Phải cung cấp source tương ứng và notices của PTS AGPL, osu! MIT, MuseScore/Qt khi phân phối; xem [inventory](THIRD_PARTY_NOTICES.md). Đàn thật/HTTPS chưa kiểm theo phạm vi đã thống nhất. Giới hạn snapshot 40 trang/50.000 nốt viết/24 MiB SVG, timeline 100.000 target/2 giờ/10 vòng; stress Node không thay benchmark máy/đàn.
