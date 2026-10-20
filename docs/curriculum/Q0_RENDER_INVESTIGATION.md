# Điều tra khựng khi dựng câu kế tiếp trong Q0

Ngày 20/10/2026. Code sản phẩm được đo: `5e7008da90`, WASM Release tối ưu SHA256 `6faf0ad73f9d78b0540edb95dbce7797a8739eb5aa77511ac79c61fdee9acfbc`. Kết quả và toàn bộ 240 mẫu đo nằm trong [render-investigation.json](q0/render-investigation.json).

**Nguyên nhân đã xác nhận: dựng snapshot MuseScore đồng bộ chiếm main thread; phần xuất và đóng gói SVG là phần tốn thời gian nhất trong các phép đối chứng.** Main thread đó cũng giao MIDI cho Worker và bơm lịch Web Audio. Khi bị chiếm khoảng 400 ms, controller phát hiện quá hạn 250 ms và chủ động ngắt lượt.

Phạm vi: đây là lỗi tái hiện trong prototype Q0 khi chuẩn bị câu mới đồng thời với BPM. API `preparedSnapshot()` hiện chỉ được gọi từ harness Q0, chưa được gọi từ UI quiz. Màn tập sản phẩm gọi snapshot trước khi bắt đầu lượt tại [workspace.ts](../../apps/pianist-web/src/workspace.ts). Các số đo này không khẳng định mọi lượt tập online đều đang gặp cùng lỗi.

## Luồng chạy thực tế

```text
Main thread:
preparePracticeSnapshot(bytes)
  → copy bytes vào WASM
  → tạo project tạm
  → project->load(): nhập MusicXML, setup score, layout, khởi tạo notation/playback
  → snapshotFor():
      xuất SVG từng trang
      lấy anchor, tie, repeat và nhịp
      CompatMidiRender tạo reference nhả phím
      tạo lịch performed/pedal, mã hóa JSON và callback
  → giải phóng project tạm
  → JSON.parse
  → trả quyền chạy cho event loop

Trong khoảng này:
MIDI đã đến → callback nhận MIDI phải đợi → chưa postMessage đến Worker chấm
Timer BPM 20 ms → phải đợi → chưa bổ sung lịch âm thanh
Frame mới/highlight → phải đợi
```

Đường gọi: [JS wrapper](../../src/web/appjs/distr/muimpl.js), [project tạm](../../src/web/appjs/webapi.cpp), [snapshot](../../src/web/appjs/practicesnapshot.cpp), [bridge](../../packages/engine-bridge/index.ts).

`project->load()` gọi code MuseScore trong [NotationProject](../../src/project/internal/notationproject.cpp), [EngravingProject](../../src/engraving/engravingproject.cpp), [MasterNotation](../../src/notation/internal/masternotation.cpp). Việc không đưa project tạm vào `globalContext()` bảo toàn editor, nhưng không tạo thread riêng.

Trong vòng gây khựng của `q0-lab.midiProbe`, mỗi lần chỉ gọi `b.preparedSnapshot(...)`. Không tạo timeline hay chèn sheet mới vào DOM trong vùng đo đó. `createTimeline()` của bài đang chơi đã chạy trước khi bắt đầu. Vì vậy không thể quy thời gian native này cho thuật toán chọn grade, chấm BPM hoặc cuộn sheet.

## Đo đối chứng trên cùng đoạn 32 nốt

Edge 155.0.4283.62 headless, Xeon E5-2680 v4, 56 logical processors. Mỗi cấu hình làm nóng 3 lần, đo 10 lần, cách nhau 80 ms. Bảng dùng median chuẩn, trung bình hai giá trị giữa của 10 mẫu. CPU 4× là giả lập qua CDP, không phải điện thoại thật.

| Phép đo | CPU bình thường | CPU giảm tốc 4× |
|---|---:|---:|
| Project tạm + snapshot có SVG | 82,30 ms | 413,16 ms |
| Project tạm + semantics không SVG | 19,09 ms | 96,95 ms |
| Score đã nạp + snapshot có SVG | 77,62 ms | 340,69 ms |
| Score đã nạp + semantics không SVG | 8,18 ms | 36,62 ms |
| Riêng JSON.parse trong phép đo đầu | 0,44 ms | 1,92 ms |

Copy đầu vào khoảng 0,01 ms ở cả hai cấu hình. Khoảng từ callback native tới lúc hàm C++ trả về khoảng 0,82 / 4,56 ms; khoảng này gồm cleanup cuối snapshot và project, không phải timer riêng của destructor.

Các đối chứng cho thấy đường có SVG tăng chi phí rất mạnh ngay cả khi score đã nạp. Semantics không SVG vẫn chạy `CompatMidiRender` và xuất reference trường độ/pedal. Vì thế R4 reference không giải thích phần chênh lớn đó.

Đây là so sánh hai đường API, **không phải phép đo riêng từng hàm C++**. Semantics còn xuất rests/keys/slurs/spelling mà snapshot có SVG không xuất. Chênh lệch chỉ ước lượng công việc liên quan SVG, bao gồm xuất hình, đóng gói và chuyển dữ liệu; không được ghi thành thời gian chính xác của `SvgWriter::write()`.

K008 MXL chỉ 1.202 byte. Với cùng MusicXML đã giải nén, median đầy đủ vẫn là 88,04 / 404,60 ms. Không có chứng cứ ZIP hoặc dung lượng tải xuống là nút thắt của trường hợp này.

## Phần chữ trang giấy làm câu ngắn nặng thêm

[SvgWriter](../../src/importexport/imagesexport/internal/svgwriter.cpp) vẽ các đối tượng trên trang qua painter; [SvgPaintEngine::drawPathData](../../src/importexport/imagesexport/internal/svggenerator.cpp) ghi từng tọa độ vector vào chuỗi SVG.

K008 tạo 133.041 ký tự SVG. Riêng thuộc tính `d` của 9 path thuộc class `Text` đã có 85.516 ký tự, khoảng 64% kích thước toàn SVG. Các path đầu nốt thuộc class `Note` có 6.712 ký tự; đây chưa bao gồm stem hoặc các ký hiệu khác.

Đối chứng chỉ sửa **bản sao của fixture tự soạn trong dự án**: bỏ work title, creator và rights khỏi đầu vào thử. Không sửa nguồn nhạc, file gốc, UI hoặc quy tắc chấm. Assertions xác nhận notes, onset, duration, staff/voice, tie, performed, key releases, beats, pedal và thời lượng vẫn giống bản gốc.

| Bản sao thử | CPU bình thường | CPU 4× | Ký tự SVG |
|---|---:|---:|---:|
| K008 MusicXML đầy đủ | 85,34 ms | 382,36 ms | 133.046 |
| Cùng nhạc, bỏ phần chữ nói trên | 45,54 ms | 217,08 ms | 47.296 |

Loại phần chữ trang giấy làm nhẹ đáng kể trong fixture này, nhưng bản nhẹ vẫn chặn hơn 200 ms ở CPU 4×. Chưa đủ để cam kết BPM liên tục. Không suy ra rằng mọi bản nhạc đều có cùng tỷ lệ chi phí chữ.

Các câu tổng hợp một khuông 4/16/64 nốt có median lần lượt 14,62 / 22,40 / 58,95 ms ở CPU thường và 61,66 / 108,89 / 297,43 ms ở CPU 4×. Số nốt không đủ để dự đoán chi phí; số khuông, ký hiệu và phần chữ cũng ảnh hưởng. Những câu này chỉ là fixture hiệu năng, không phải kho bài học.

## Vì sao Worker chấm vẫn không cứu được BPM?

- [Controller](../../apps/pianist-web/src/practice/controller-v2.ts) gọi `tick()` mỗi 20 ms. Nếu khoảng cách thực tế giữa hai tick lớn hơn 250 ms, nó gọi `pause(..., true, ...)`, đặt trạng thái `interrupted`.
- [AudioClock](../../apps/pianist-web/src/platform/audio-clock-v2.ts) chỉ bổ sung âm thanh tới 250 ms phía trước. Âm thanh đã lên lịch có thể tiếp tục trong lúc main thread bận; phần tiếp theo không được bổ sung kịp.
- [MidiRouter](../../apps/pianist-web/src/platform/midi-v2.ts) nhận event trên main thread, giữ timestamp gốc nhưng ghi `receivedMs` lúc callback thực sự chạy. Sau đó controller mới chuyển event sang Worker.
- [Engine](../../packages/practice-engine-v2/engine.ts) dùng giới hạn giao event mặc định 150 ms. Chậm hơn có thể tạo `input-delivery-outside-bound`. Controller cũng có thể ngắt trước khi những event đó được đưa vào engine; không phải lần ngắt nào cũng có fault này.

[Phép thử MIDI trước đó](q0/native-report.json) là đối chứng chạy đồng thời: không render thì cả hai cấu hình nhận 64 packet và chấm đủ 32 nốt; CPU 4× có render bị ngắt sau một lần native khoảng 407 ms. Lần điều tra này đo riêng các đường API ngoài phiên MIDI để phân biệt chi phí.

Nới 250 ms hoặc 150 ms không làm main thread rảnh và không khôi phục các âm thanh chưa được lên lịch. Bọc `ccall` trong Promise/setTimeout cũng chỉ đổi lúc bắt đầu công việc đồng bộ.

## Hướng sửa phù hợp bằng chứng

1. Giữ mọi lời gọi native đồng bộ ngoài khoảng chấm BPM trong khi chưa có renderer riêng.
2. Hoàn thiện MuseScore renderer chạy Worker với vòng đời engine riêng, giữ reader/layout/SVG/ID nốt/reference của cùng source. Worker chấm hiện có giữ nguyên. Bản thử `webmscore` trước đó chưa đáp ứng hợp đồng snapshot của sản phẩm.
3. Với câu quiz trích đoạn, dùng bố cục gọn; đưa tên bài, tác giả và nguồn ra UI bên ngoài sheet thay vì khắc lại thành path cho mỗi câu. Vẫn giữ attribution; giữ nguyên bản nhạc đầy đủ của editor/thư viện.
4. Chuẩn bị và cache câu tiếp theo theo nội dung + chuyển vị + cấu hình layout. Tính độ dài hàng đợi từ thời gian render và thời lượng câu ngắn nhất theo BPM, rồi kiểm lại với producer MIDI độc lập. Worker riêng chỉ giải quyết chặn UI; vẫn phải nghiệm thu tốc độ tạo đủ câu.

Không đổi thuật toán/cửa sổ chấm. SHA256 của 15 file engine khớp baseline. Lượt điều tra chỉ thêm harness và bằng chứng, không phát hành thay đổi runtime. Q0 vẫn chưa qua gate renderer.

## Tái hiện

Sau khi local server phục vụ đúng package Q0 tại cổng 8787:

```powershell
node tests/browser/pianist/q0-render-profile.cjs
node tests/browser/pianist/q0-render-profile.cjs --variants-only
```

Harness kiểm checksum WASM/glue trước khi đo. Các kết quả thô ở `artifacts/q0/profile/`; bản tổng hợp có lưu từng mẫu và checksum kết quả thô. DOMParser dùng để thống kê path chạy **sau** vùng tính thời gian.

CPU profile được lưu nhưng WASM Release không có name/DWARF sections. Không dùng symbol map cũ của bản FastLink để gán tên cho function index; chưa công bố tỷ lệ CPU riêng cho từng hàm nội bộ SVG.
