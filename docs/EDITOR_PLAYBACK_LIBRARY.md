# Editor playback và thư viện bài hát

Ngày 19/10/2026. Bản này bổ sung playback trong editor, bộ bài MXL người dùng
cung cấp và đường phát hành GitHub Pages. Bộ chấm BPM/Đúng nốt/R4 giữ nguyên.

## Playback

Thanh web có phát/tạm dừng, dừng, thanh tua và thời gian. Space hoạt động khi
focus trong editor; nút và ô nhập giữ hành vi bàn phím thông thường. Chuyển màn
dừng phát, không tạo lịch sử luyện tập.

`WebApi::editorPlayback()` gọi controller/actions native của MuseScore:

- `src/playback/internal/playbackcontroller.cpp`: play, pause, stop và tempo.
- `src/playback/qml/MuseScore/Playback/playbacktoolbarmodel.cpp`: tua bằng
  action `rewind` với `audio::secs_t`.
- `getEditorPlayback()` đọc `IPlaybackState`, total play time và tempo multiplier.

Sequencing, repeat, articulation và âm thanh dùng engine MuseScore/MS Basic.
Không tạo scheduler hay oscillator web thay cho playback editor.

Đã sửa race của lần mở đầu: AudioWorklet khởi tạo xong chưa có nghĩa MS Basic
đã được tải/đăng ký. Trước khi tạo project, `waitForAudioReady()` chờ
`IPlayback::availableInputResources()` báo đúng resource `MS Basic`, dựa trên
luồng `WebSoundFontController` và `FluidResolver`. Timeout báo lỗi có thể tải lại.
Không dùng thời gian chờ cố định làm điều kiện sẵn sàng.

Tempo multiplier native tác động tempomap. `EngineBridge::setPractice()` giữ
tốc độ editor, dừng phát, trả multiplier về 1 trước khi lấy snapshot tập;
quay lại editor khôi phục tốc độ. Không thay công thức chấm hay dữ liệu tempo
viết của bài tập.

## Thư viện

Đọc đúng 23 file người dùng nêu; nhận **18 MXL**, tổng **215.405 bytes**.
Giữ nguyên bytes nguồn và kiểm SHA-256 mỗi lần tải. Danh mục/lazy download
được dùng chung ở Thư viện và trang chọn bài tập. Mở lại cùng nguồn dùng bản
đã lưu trên thiết bị, giữ nội dung chỉnh sửa.

Năm file không đưa vào thư viện public:

- Một PDF không có MusicXML đính kèm, chưa được editor/tập hỗ trợ.
- Một Merry Go Round trùng nội dung XML với bản còn lại.
- Ba bản có grace notes chưa được snapshot tập theo dõi đầy đủ: Em ơi Hà Nội
  phố (964/1.023), Tình em là đại dương — Duy Mạnh (952/955), Mùa xuân đó có
  em (1.432/1.442).

Ba MXL này hợp lệ về file nhưng không đủ coverage cho thư viện tập hiện tại.
Không sửa nhạc hoặc tự thêm thuật toán chấm grace để cho qua kiểm tra.
Chi tiết từng file: [IMPORT_REPORT](../scores/library/IMPORT_REPORT.md).
File gốc ở máy người dùng được giữ nguyên.

## Kiểm chứng

- 116 test Node đạt, gồm catalog/hash và audio-ready/timeout/retry; oracle
  BPM/R4 hiện có tiếp tục đạt. TypeScript/Vite và audit cutover được chạy
  trước khi đóng gói.
- `song-library-audit.cjs`: cả 18 bài được native engine nhập, có đủ anchor
  nốt nguồn, định danh SVG khớp và playback tiến thời gian. Năm trường hợp
  loại được ghi lý do; không có page error.
- `editor-playback-library.cjs`: mẫu mở đầu phát được PCM thật từ native
  AudioWorklet; pause/resume/tua/stop/Space đạt. Bản vừa sửa phát được;
  tốc độ editor không làm đổi snapshot tập; đổi màn dừng phát; tìm/mở lại
  bài thư viện không tạo project trùng.
- `m0-smoke.cjs`: editor WASM, MXL/XML, sửa cao độ/trường độ, undo/redo,
  MSCZ/MXL save/reopen, nhập lỗi giữ bài và note entry đạt trên Edge.
- Kiểm native boot trên host static không có COOP/COEP đạt. Đàn MIDI thật
  chưa được kiểm; các kiểm thử MIDI hiện dùng mô phỏng.

Evidence máy phát triển nằm ở `artifacts/song-import/` và `artifacts/m0/`,
không đưa browser storage/raw download paths vào bản public.

## Phát hành

[GitHub Pages](../deploy/PAGES.md) nhận web ZIP tối ưu từ GitHub Release,
kiểm SHA-256 và source commit trước khi xuất bản. Release đi cùng source ZIP
đúng commit, notices, source pins và cấu hình Caddy. Bộ bài public chỉ lấy từ
`scores/library/catalog.json`; Phố Xa và ví dụ local không được tự động xuất.

Nghiệm thu online dùng `verify-release.py --public --github-pages` để kiểm
HTTPS, WASM MIME, toàn bộ resource hash, ABC runtime và 18 bài, sau đó chạy
playback/library bằng browser trên URL thật. Lệnh không coi localhost là
bằng chứng HTTPS và không yêu cầu header tùy ý mà Pages không hỗ trợ.
