# Pianist Web — kết quả triển khai M1–M6

Ngày kiểm tra: 16/10/2026. Đây là bản chạy local, chưa nghiệm thu phát hành v1.
M0 trước đó ở commit `73b82fe`; báo cáo này mô tả phần bổ sung sau M0.

## Trạng thái

| Mốc | Phần đã chạy | Cổng còn mở |
| --- | --- | --- |
| M1 | React/TypeScript shell; thư viện IndexedDB; nguồn file; save/save-as/download; autosave/recovery; bridge version/revision; giữ editor và undo khi đổi màn hình | Importer C++ đồng bộ chưa hỗ trợ hủy giữa lúc parse; kiểm thử quota/kill-tab diện rộng còn thiếu |
| M2 | Snapshot trực tiếp từ score đang sửa, native SVG/geometry, staff/voice, tie/unison, performed repeat timeline và tempo map; xuất PDF | Chưa nghiệm thu toàn bộ ma trận editor; corpus volta/jump/cross-staff/fermata còn cần mở rộng |
| M3 | MIDI router; nguồn ảo riêng; Worker; state machine; Đúng nốt có lỗi lần đầu, hợp âm, nốt lặp và rest | Quyền MIDI/rút cắm đàn thực chưa kiểm tra |
| M4 | Audio clock, count-in/metronome, BPM timeline độc lập, matcher có giới hạn, timing từng nốt, calibration và replay | Chưa đo calibration/jitter/drift trên thiết bị thực |
| M5 | Màn tập chỉ đọc riêng; chọn tay/voice, đoạn A–B, loop, zoom/cuộn, pause/resume, kết quả và tập lại đoạn yếu | Chưa benchmark score ở giới hạn tối đa hoặc đủ máy/trình duyệt |
| M6 | Lịch sử/config/revision; JSON/CSV/replay; build helper; release manifest SHA-256; offline; mẫu cấu hình HTTPS và notices | Chưa publish HTTPS; build tối ưu, ma trận Chrome/Edge mới, toàn bộ giấy phép phân phối và nghiệm thu v1 còn mở |

M7 (chấm độ dài/pedal, accompaniment từng tay, profile ornament nâng cao,
tài khoản/đồng bộ) chưa triển khai. Pedal hiện chỉ được nhận/hiển thị, không chấm.

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

`npm test`: ban đầu **30/30 đạt**. Rà soát sau phản hồi của người dùng phát hiện
thêm lỗi ngoài phạm vi bộ test đó; bản sửa có **36/36 đạt**, không skip.
Xem [đối chiếu và ca hồi quy](IMPLEMENTATION_AUDIT.md).
TypeScript strict và Vite build đạt.
Native notation WASM build đạt sau bridge/SVG/PDF/font changes; audio dùng binary
M0 đã build. Bản native đang phục vụ dùng FastLink phát triển, chưa có phép đo
performance của build tối ưu.

Các nhóm test gồm matching pitch/onset, hợp âm -100/+100 ms, nốt lặp thiếu ở
giữa, tay trái thiếu không ngăn tay phải, extra/precision, im lặng trong BPM,
frame-rate 15/60/144, event giao quá trễ, offset áp dụng một lần, rest/held keys,
tie/unison/loop, beat unit/tempo map, partial result, replay pause boundaries,
ZIP expansion/path traversal, XML entities, MIDI velocity-zero/CC64/timestamp,
audio output clock, IndexedDB migration/recovery/lease và vòng đời session.
Finish đồng thời chỉ tạo một kết quả; Worker lỗi vẫn kết thúc được với trạng
thái interrupted; input không sẵn sàng bị chặn trước khi tạo audio/Worker.

Bộ chấm `pianist-onset-1.0.1` sửa extra sau pitch đã chốt, extra sát cuối bài,
deadline khi offset dương và biên thời gian bao hàm. Replay yêu cầu đúng phiên
bản thuật toán; kết quả cũ không bị sửa. Ca replay UI trong bảng dưới được đo
với 1.0.0 tại commit `33b68f61`, không được coi là ca replay 1.0.1.

Fixture CC0 `tempo-repeat-tie.musicxml` có kỳ vọng tính độc lập: 3 ô nhịp viết,
pickup 1/8, 2/4, tempo 80→120, triplet, tie qua vạch, repeat và unison. Snapshot
lấy từ WASM thật có 11 nốt viết, 20 notehead thực hiện và 16 attack vật lý,
5 occurrence; tổng thời gian 4.375 ms trong sai số số thực. Test không tự tạo
expected bằng chính plan builder.

Tên Txx trong các test domain là nhãn cục bộ; bộ test này không có nghĩa toàn
bộ 29 dòng nghiệm thu của kế hoạch sản phẩm đã được kiểm đủ.

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
| PDF | Xuất PDF fixture thật 37.358 byte, `%PDF`/EOF hợp lệ và có 1 trang; chưa render soát layout PDF |
| Đúng nốt, Phố Xa ô đầu/tay trái | Bấm sai không tiến; sau 8 mục tiêu đúng: coverage 8/8, precision 89%, đúng lần đầu 7/8, 1 lần sửa; không báo tất cả chỉ số 100% |
| BPM, Phố Xa ô đầu/hai tay | 120 BPM, không bấm: hoàn tất khoảng 2 giây; 20/20 mục tiêu đã đánh giá, 20 miss, 0 extra |
| Pause/resume và bỏ dở | Fixture 20 BPM: vị trí 0:04 và 7/16 mục tiêu đã chốt đứng yên khi pause; resume rồi dừng ra aborted, không tính 9 mục tiêu tương lai thành miss |
| Replay log từ UI | CLI replay đúng kết quả pause/resume ở trên: `same: true`, evaluated 7, extra 1, không fault |
| Lịch sử/tập lại | Kết quả còn sau reload, giữ nguồn ảo/revision/fingerprint; tập lại giữ đoạn và config |

JSON kết quả, snapshots, PDF và ảnh kiểm tra tại máy này ở
`artifacts/m1-m6/` (gitignored). Snapshot fixture CC0 đã bỏ SVG nằm trong
`tests/fixtures/pianist/practice/engine-snapshot.json` để test tái lập được.

## Offline

Đã cài một release 39 tài nguyên, khoảng 180,1 MiB qua nút chuẩn bị offline.
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
2. Chạy lại ma trận editor đầy đủ và corpus volta/jump/cross-staff/ký hiệu khó,
   kiểm round-trip import/export; sửa các dialog upstream còn phụ thuộc desktop.
3. Build tối ưu; đo tải lạnh/ấm, RAM và score dài trên Chrome/Edge mục tiêu.
4. Chọn domain/host, deploy nguyên release qua HTTPS và kiểm trên máy sạch;
   rà đủ source/build/notices/giấy phép trước phân phối công khai.

Không gắn nhãn v1 nghiệm thu hoàn tất trước các bước này. Hướng dẫn build,
sử dụng và các giới hạn hiện tại ở [PIANIST_WEB.md](PIANIST_WEB.md).
