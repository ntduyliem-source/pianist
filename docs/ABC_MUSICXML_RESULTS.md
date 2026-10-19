# Nghiệm thu ABC/MusicXML — A5–A7

Ngày 19/10/2026. Mốc đầu vào: A4 `8ad8b2be`; bản an toàn trước ABC:
`f87189eefc45b64e828ebf6d196016d5f20c3985`.

## A5 — Tập và đối chiếu hai định dạng

Đã đạt trên Edge 155.0.4283.62 và Chrome 154.0.8037.17.
Không thay scoring kernel, MIDI clock, công thức BPM/R4 hoặc renderer native.

- 13 cặp nhập ABC/MXL/XML thực sự vào MuseScore; mỗi lần nhập có đủ mapping
  nốt sang SVG riêng. Tám fixture ABC có expected âm nhạc đếm độc lập từ A1;
  năm cặp từ XML kiểm thêm repeat, volta, pedal, tie và nhiều bè.
- 74 cấu hình cho timeline tương đương: tempo cố định/theo bài, chọn tay/bè,
  A–B, ba vòng và tăng BPM. Không sửa fingerprint production để gộp hai project.
- 70 lượt qua MIDI router → PracticeController → Worker production cho kết quả
  tương đương: đúng mốc, sớm 120 ms, nhả sớm, sai octave, pedal tắt, Wait và
  pause/resume. Replay khớp cả onset và R4. Runner chỉ thay I/O clock/audio/MIDI
  để thực thi xác định; không thay matcher hay tự tạo judgement.
- UI với fixture CC0 16 ô nhịp: A3–B12, 300 BPM, ba vòng; cả ABC và MXL đạt
  90/90 attack, mọi mốc nhả đúng, pedal F1=1. Camera chuyển system/quay A;
  màu vòng cũ được xóa; nốt cùng pitch ở ô tương lai không sáng theo phím giữ.
  Nghe đoạn không ghi lượt chấm; full sheet, ẩn thanh, chọn tay, count-in,
  Wait hợp âm/sai octave/Note On lặp, pause/resume và replay đều qua UI thật.

Bằng chứng local: `artifacts/abc/a5/native.json`, `worker-parity.json`,
`{msedge,chrome}/ui-result.json`, JSON từng lượt và ảnh held. Các file này được
ignore, không nằm trong gói public. Snapshot references không phải dữ liệu
chơi đàn thật; thiếu mốc native vẫn là `unavailable`.

## A6 — Offline và đóng gói

Đã triển khai manifest gồm core ABC/Pyodide, source, license, fixture ABC CC0,
hash service worker và xác minh các pins khi đóng gói. Dung lượng hiển thị lấy
từ manifest; worker kiểm dung lượng phần thiếu cộng 10% khoảng trống dự phòng.
Chỉ thao tác ABC mới tải runtime online; chuẩn bị offline tải toàn bộ release.

Cache thiếu file bị trả 503 thay vì lấy code từ phiên bản server khác. Nút chuẩn
bị offline kiểm/khôi phục cache bằng đúng SHA-256; cập nhật chờ tab cũ đóng,
không `skipWaiting` hoặc chiếm phiên tập. Cache được giới hạn theo URL scope;
IndexedDB được giữ nguyên. Kết quả nghiệm thu cuối và gói public ghi dưới đây
sau khi chạy kiểm thử trên bản source sạch.

## Giới hạn đã giữ nguyên

ABC chưa bảo toàn mọi cấu trúc MusicXML. Các ngoại lệ A1/A4 vẫn có fixture và
thông báo từ chối: trường độ bị làm tròn, tie/jump/cross-staff ngoài profile,
grace/ornament/fermata/custom-key chưa được xác minh đầy đủ; mốc nhả đổi do
nhạc cụ; pedal direction có offset bị converter gốc làm lệch.
Xem [đối chiếu và vị trí code upstream](ABC_CONVERTER_RESULTS.md).

Phố Xa dùng MXL gốc ở local. Không công bố bản ABC tương đương khi conversion
bị từ chối, không sửa tick/pedal hoặc dung sai chấm để làm dữ liệu khớp. MSCZ
giữ dự án đang sửa đầy đủ; MXL vẫn là đường trao đổi notation hiện có.
MIDI thật, HTTPS/hosting và kiểm nghĩa vụ phát hành công khai giữ phạm vi đã
chốt; gói triển khai được chuẩn bị local, chưa publish.

## Tái lập

```powershell
python -X utf8 tests/reference-runners/abc/oracle.py
python -X utf8 tests/reference-runners/abc/practice-fixtures.py
node tests/browser/pianist/abc-practice-pairs.cjs
# Từ apps/pianist-web:
node --import tsx ../../tests/reference-runners/abc/practice-parity.mts ../../artifacts/abc/a5/pairs.json
# Từ root, sau build/package:
node tests/browser/pianist/abc-practice-ui.cjs
node tests/browser/pianist/abc-offline.cjs
node tests/browser/pianist/abc-limits.cjs
# Lặp các browser runner với PIANIST_BROWSER_CHANNEL=chrome.
```

`abc-offline.cjs` phục vụ release trên một server thử nghiệm riêng, từ
`PIANIST_SITE` hoặc `build.artifacts`. Nó không sửa server 8787/thư viện của
người dùng. Các script browser dùng profile tạm. Test offline khóa mạng cả
browser lẫn server: các lần trình duyệt tự kiểm tra `sw.js` vẫn bị từ chối;
không dùng các lần kiểm tra đó để cấp tài nguyên ứng dụng.
