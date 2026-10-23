# Pianist Web — hướng dẫn hiện hành

Cập nhật ngày 23/10/2026. **Thư viện**, **Editor MuseScore** và **Tập piano** là ba màn riêng. Màn tập chỉ đọc bản nhạc. [Mở ứng dụng online](https://ntduyliem-source.github.io/pianist/).

[Tài liệu cho người phát triển](current/README.md) gồm kiến trúc, vị trí nguồn bài, build/kiểm thử và release. Những kết quả nghiệm thu ở các tài liệu M/R/A/Q/K mô tả phiên bản tại thời điểm viết, không thay hướng dẫn này.

## Thư viện và editor

Nhập ABC, MXL/MusicXML, MSCZ hoặc MSCX, tối đa 32 MiB. Có thể chọn file hoặc kéo thả. ABC nhiều bài mở hộp chọn các tune cần nhập và tune sẽ mở trước. File đọc lỗi không được thay bản đang mở.

**Bài hát có sẵn** lấy từ [catalog được duyệt](../scores/library/catalog.json). Mỗi tác phẩm có nhiều bản sẽ có dropdown chọn version; bản trùng byte không thêm version. Khi mở, ứng dụng kiểm bytes/SHA-256, nhập rồi giữ bản riêng trên thiết bị. Lần mở lại dùng bản đã lưu, giữ các chỉnh sửa của bạn. Danh sách nhận/bỏ theo đợt ở [report thư viện](../scores/library/IMPORT_REPORT.md); catalog hiện hành quyết định các bản được đóng gói.

Editor dùng MuseScore để chỉnh nốt, undo/redo, lưu và phát nhạc. **Lưu thư viện/Ctrl+S** lưu trong trình duyệt. **Lưu bản mới/Ctrl+Shift+S** tạo project riêng. Tải MSCZ giữ dự án native; xuất MXL/MusicXML để trao đổi notation, PDF để in.

**Phát nhạc**, **Tạm dừng**, **Dừng** và thanh tua điều khiển playback native MuseScore, dùng tiếng MS Basic và bản nhạc đang sửa. Space phát/tạm dừng khi focus thuộc editor; trong nút/ô nhập, Space giữ hành vi của control đó. Chuyển khỏi editor dừng playback editor. Phát editor không tạo lượt tập hoặc điểm.

Bản nhạc đang sửa có thể được đưa sang tập bằng snapshot native, gồm các thay đổi hiện tại. Snapshot tập không sửa lại bản nhạc. Các khóa/biểu cảm có trong file nguồn được giữ, không tự coi ký hiệu khác thường là lỗi để xóa.

## Hai cách chọn bài tập

Trong **Tập piano**:

- **Free play:** chọn bài từ thư viện hoặc nhập file. Chọn đoạn A–B, số vòng, tay/khuông/bè, tempo và chế độ chấm.
- **Theo grade:** chọn G1–G8, một hoặc nhiều khoảng nốt, random hoặc theo thứ tự. Kho hiện có 5.600 bài, 100 bài cho mỗi grade × khoảng nốt; mỗi bài giữ đủ hai khuông. Chọn một tay chỉ thay phần được chấm. Có **Bài kế** và **Tự chuyển**.

Grade là bộ nội bộ Pianist đã biên soạn sẵn; ứng dụng chọn/sắp bài trong kho, không sinh nốt hoặc trích nhạc theo thời gian thực. Nguồn ABC được chuyển sang MXL và đối chiếu trước khi phát hành. Xem [nội dung/giới hạn kho](../scores/composed/G1_G8_ABC_GUIDE.md) và [bản đồ file](current/content-pipeline.md). Kho hiện tại chưa phủ đủ 88 phím; việc mở rộng bộ duyệt không tự thay bài.

**Đúng nốt** chuyển khi đã nhận đủ nốt của lượt. **BPM** kết thúc theo timeline rồi báo kết quả; tự sang bài không có nghĩa lượt vừa rồi đã đạt. Cả free play và grade dùng cùng màn tập và cùng engine chấm.

## Điều khiển buổi tập và nghe mẫu

**Tập / Tạm dừng / Tiếp** điều khiển lượt chấm. **Dừng** kết thúc lượt hiện tại, lưu lượt dở dang và giữ màn bản nhạc. **Tập lại đoạn** kết thúc lượt cũ rồi bắt đầu lượt mới tại A. Stop vẫn dùng được trong lúc đang chuẩn bị âm thanh hoặc đếm vào.

**Nghe MuseScore** có phát/tạm dừng và nút dừng riêng. Phạm vi nghe là đoạn A–B hoặc toàn bài, có lặp và tốc độ nghe riêng trong Thiết lập. Nghe dùng native playback, không tạo điểm, không thay BPM chấm. Đổi tốc độ/seek/A–B dùng mapping thời gian native, gồm tempo, dấu lặp và pause; không lấy tỷ lệ thời gian toàn bài để đoán vị trí.

Kết nối/chọn MIDI trong Thiết lập hoặc dùng bàn phím ảo **đủ 88 phím A0–C8**, không có nút chọn quãng. Phím máy tính `A W S E D F T G Y H U J K O L P ;` tương ứng C4–E5; đây là vùng gõ nhanh, không phải toàn bộ 88 phím. Có thể dùng chuột/cảm ứng cho các phím khác. Bàn phím ảo và tay đệm phát MS Basic qua native FluidSynth; metronome dùng tiếng click riêng.

Công tắc **Pedal** có ở giao diện thường, Thiết lập và thanh full sheet. **Đạp/Nhả pedal ảo** dùng khi đầu vào là bàn phím ảo. Tắt pedal dừng sustain ảo và chấm pedal/âm ngân; chấm Note Off vẫn có nếu bật chấm nhả phím. Kết thúc lượt trước khi đổi cấu hình chấm để kết quả không trộn hai chính sách.

## Sheet, full sheet và chọn đoạn

**Chỉ bản nhạc** mở fullscreen khi trình duyệt hỗ trợ, hoặc phủ vùng ứng dụng. Thanh nhỏ vẫn có Nghe, Dừng, pedal và điều khiển cần thiết. Có thể ẩn thanh rồi dùng nút **Hiện điều khiển** để đưa lại. Escape/Thoát toàn màn hình trở về bố cục thường.

Ứng dụng hiển thị **nguyên trang SVG do MuseScore xuất**. System box chỉ hướng dẫn camera, không dùng cắt mép trang làm mất pedal, dynamics hoặc ký hiệu nằm ngoài khuông. Thu phóng Tự động, Vừa chiều rộng và 60–180% thay cách nhìn, không ký âm lại bản nhạc. Vừa chiều rộng trên màn hẹp sẽ làm nốt nhỏ hơn.

**Cuộn theo nhạc** giữ vùng đang chơi trong tầm nhìn. Khi nghe, cursor/highlight dùng mốc native; khi tập BPM dùng timeline đã chọn; Đúng nốt theo nhóm hiện tại. Repeat/A–B/vòng tập quay về vị trí tương ứng và xóa màu của lần diễn trước. Cuộn tay tạm ngưng bám; **Tiếp tục theo bài** bật lại.

**Chọn đoạn** mở các trường ô A/B hoặc bật chọn trực tiếp trên sheet. Có thể chọn vùng ô bằng chuột, hoặc focus vùng chọn rồi Enter/Space. Mở Thiết lập khi đang chơi sẽ tạm dừng.

Highlight tô nét nốt MuseScore theo định danh native: cần chơi xanh lam, đúng xanh lá, timing chưa tốt vàng, Miss đỏ. Note On/Off cùng lần đánh điều khiển trạng thái giữ; không tô nốt tương lai chỉ vì trùng pitch. Nghe mẫu tô theo span native và không tạo judgement. Bàn phím hỗ trợ hiện phím đang giữ.

## Đúng nốt, BPM, trường độ và pedal

**Đúng nốt** dùng phần Wait ghim từ Piano Trainer Studio. Cần đúng pitch MIDI gồm octave; hợp âm ghi nhận từng nốt đúng, không bắt buộc giữ tất cả cùng lúc. Nốt lặp cần nhả rồi đánh lại. Phím đã giữ từ count-in/resume không tự được cộng điểm. Chế độ này không chấm timing/nhả/pedal.

**BPM** dùng osu!mania, lịch độc lập với người chơi. Mỗi pitch là một làn; mỗi input tiêu thụ tối đa một target theo thứ tự/notelock upstream. Accuracy, input thừa, precision và coverage được hiển thị riêng; dừng sớm không biến nốt tương lai thành Miss. Hệ thống không sửa nhịp theo người chơi để làm đẹp điểm.

R4 đánh giá nhả phím, âm ngân sustain và CC64 nhị phân riêng với điểm onset. Mốc nhả/velocity lấy từ CompatMidi MuseScore, theo tay/bè đã chọn. Phép đánh giá offset dùng mir_eval; sustain/đánh lại dùng Magenta note-seq. Đây là đối chiếu với tham chiếu native, không khẳng định chỉ có một cách diễn tấu đúng. Half-pedal và diễn cảm nâng cao chưa được chấm.

Đoạn có **arpeggio, ornament hoặc grace** chưa được adapter chấm BPM đúng sẽ bị chặn rõ ràng, kể cả tay đệm đang bật. Pause cố định bằng giây cũng bị chặn khi chấm theo tempo của bản nhạc. Có thể chọn đoạn khác, tắt tay đệm nếu phù hợp, dùng Đúng nốt hoặc nghe MuseScore. Không giả vờ đã chấm đủ bằng cách bỏ nốt hoa mỹ hay đánh arpeggio thành hợp âm đồng thời.

Xem [nguồn thuật toán, commit và symbol](../third_party/practice-sources/PROVENANCE.md), [kết quả sửa đã xác nhận](AUDIT_FIXES_2026-10-23.txt). Các ngưỡng nội bộ không phải chứng nhận kỹ năng piano hoặc grade thi.

## Clock và gián đoạn

Timestamp MIDI được đổi về cùng trục với target/metronome bằng đồng hồ đầu ra Web Audio. Worker chấm event; frame UI không quyết định điểm. Offset chỉ áp dụng một lần, lưu theo thiết bị. Hiệu chuẩn đề xuất từ các lần bấm theo click, có cả phản ứng người chơi, không phải phép đo riêng latency phần cứng.

Pause, ẩn tab, mất focus, ngắt đàn, audio suspend hoặc lịch âm thanh bị trễ có thể đóng băng lượt. Resume đếm vào lại, nhận trạng thái phím/pedal đang giữ mà không tạo attack mới. CC64 ≥64 bật, ≤63 tắt; không biến Pause/Stop thành sự kiện nhả thật để tính điểm.

## ABC: nhập và xuất có kiểm

Nút mở file nhận ABC UTF-8. abc2xml 2.68 ghim chạy trong Worker Pyodide, rồi MusicXML đi vào MuseScore. Bài đã lưu dùng MSCZ để mở lại, không chuyển ABC lại. ABC nhiều tune chỉ lưu cùng lượt sau khi toàn bộ tune được chọn chuẩn bị thành công; có hủy khi còn trong giai đoạn cho phép.

**Xuất ABC** dùng xml2abc 1.77 ghim rồi nhập lại vào project native tạm để đối chiếu. Nếu pitch, nhịp/trường độ, bè, repeat/tie, nhả/pedal, velocity hoặc dynamics không được bảo toàn theo profile, ứng dụng từ chối xuất và giữ bản đang sửa. ABC vẫn có thể thay bố cục/font/khoảng cách. MSCZ giữ đầy đủ project; MXL là đường trao đổi notation.

Lần đầu dùng ABC cần tải runtime bổ sung; chỉ mở MXL không cần runtime này. Không gửi bản nhạc lên server. Converter có giới hạn; nguồn ABC ngoài không có bản gốc đối chiếu không được gắn nhãn tương đương một MXL chưa biết. [Profile và bằng chứng converter](ABC_CONVERTER_RESULTS.md) là báo cáo theo phiên bản; kiểm bảo toàn hiện hành nằm trong source và tests.

## Lưu, backup và lịch sử

Projects, source, recovery, kết quả và settings lưu trên thiết bị trong IndexedDB. Tự lưu sau khoảng 1,6 giây không sửa; thông báo lưu chỉ sau transaction commit. Web Locks/lease ngăn hai tab cùng ghi project. Lỗi dung lượng vẫn có đường tải MSCZ; lưu trữ bài có thể phục hồi.

**Tải toàn bộ thư viện** tạo `.pianist.zip`; khôi phục kiểm hash/giới hạn, tạo ID mới và không ghi đè project hiện có. Thư viện local không tự nằm trên GitHub hay đồng bộ sang thiết bị khác.

Kết quả mới dùng schema 2 và engine ID trong `packages/practice-engine-v2/model.ts`. Lịch sử khác engine giữ dữ liệu để đọc, không replay hoặc so sánh bằng luật mới. Chọn lưu MIDI trước lượt để giữ replay; JSON có dữ liệu đầy đủ, CSV có judgement và mốc nhả/sustain. Chỉ so các lượt cùng engine/bài/cấu hình/device/loại clock phù hợp; lượt mô phỏng được ghi nhãn riêng.

## Offline và chạy local

**Chuẩn bị dùng offline** tải/kiểm SHA-256 các tài nguyên của release, gồm native engine, bộ tiếng, grade và runtime ABC. Dung lượng lấy từ manifest hiện tại, không dùng con số cố định trong hướng dẫn. Chờ hoàn tất, đóng các tab Pianist rồi mở lại. Mỗi service worker giữ một release; bản cập nhật không được trộn JS/WASM khác phiên bản. IndexedDB vẫn giữ thư viện người dùng.

Có thể chuyển **Dùng online**. Nếu cache thiếu/sai, kết nối lại và chuẩn bị offline để xác minh/khôi phục đúng bytes. Kho local nghiên cứu không được tải theo gói public.

Để build/chạy <http://127.0.0.1:8787/pianist.html>, xem [hướng dẫn phát triển](current/development.md). Để phát hành, xem [release](current/release.md). MIDI thật và điện thoại thật chưa được xác nhận bởi các test mô phỏng; kết quả từng đợt ghi rõ giới hạn kiểm.
