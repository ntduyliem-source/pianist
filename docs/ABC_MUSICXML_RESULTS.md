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
IndexedDB được giữ nguyên.

Browser runner kiểm chín nhóm bằng server và profile riêng:

1. Mở thư viện/MXL không tải ABC runtime.
2. Runtime bị sửa bytes bị từ chối trước thực thi; bài/thư viện giữ nguyên;
   thử lại với bytes đúng thành công.
3. Chuẩn bị đầy đủ từng file trong manifest và kiểm hash cache.
4. Đóng/mở lại app khi server từ chối mọi request; mở MSCZ đã lưu và nhập
   ABC mới, sửa, xuất ABC, nhập lại được.
5. MIDI mô phỏng offline chạy BPM/R4, đạt pedal F1=1.
6. Phiên bản mới chờ trong khi engine/phiên tập cũ tiếp tục dùng đúng release.
7. Đóng tab cũ kích hoạt bản mới, giữ IndexedDB.
8. Xóa một file runtime khỏi cache gây 503; chuẩn bị lại khôi phục bytes đúng.
9. Bản cập nhật sai hash không kích hoạt hoặc thay code/dữ liệu đang dùng.

**9/9 nhóm đạt trên Edge 155.0.4283.62 và Chrome 154.0.8037.17** với gói
public release `202b89c9bb8138302cd5`. Không page error. Các bằng chứng ở
`artifacts/abc/a6/{msedge,chrome}/result.json` và JSON lượt tập offline.
Khi chạy hai browser đồng thời, một lượt Chrome tự pause ở đầu phiên vì
output audio clock thay đổi; runner đã báo fail, ảnh/JSON được giữ tại
`artifacts/abc/a7/chrome-clock-pause.*`. Chạy riêng Chrome qua lại toàn bộ
chín nhóm, không sửa code hay bỏ kiểm clock/score. Đây không phải bằng chứng
timing của đàn MIDI thật; máy/browser đổi clock vẫn phải tạm dừng theo engine.

## A7 — Hồi quy và gói triển khai

| Kiểm tra | Kết quả |
| --- | --- |
| Node, gồm đối chiếu upstream và lỗi storage/conversion/offline | 110/110; không skip |
| `npm run test:midi` (tập con của suite trên) | 16/16 |
| TypeScript/Vite | Đạt |
| Editor M0 trên Edge và Chrome | 12/12 nhóm mỗi trình duyệt; không page error |
| Worker converter so CPython trên Chrome | 31/31, gồm 24 nhận và 7 từ chối đúng; 8 fixture có expected độc lập vào native |
| Thư viện/tunebook/backup A3 trên Chrome | 7/7 nhóm; Edge đã qua ở A3 |
| Sửa/lưu/xuất/nhập lại A4 trên Chrome | 10/10 nhóm; Edge đã qua ở A4 |
| Tập A5 | 13 cặp, 74 timeline, 70 lượt Worker; UI hai trình duyệt như trên |
| Phố Xa local, MXL và ABC sinh từ converter gốc | MXL có 1.282 anchor; ABC bị từ chối, giữ nguyên revision/nốt MXL |
| Audit thay bộ chấm | 13 file cũ vắng mặt; 53 file nguồn/build/map sạch |
| Public release, hash/pins/inventory/header qua HTTP loopback | 151/151 tài nguyên đạt; không file local/private trong web root; chưa kiểm HTTPS |

Không có thay đổi C++/bridge hoặc grading trong A5–A7. Nghiệm thu dùng cặp
JS/WASM tối ưu đã build và kiểm ở A4, cùng frontend vừa build lại. Không ghi
nhận đây là một lần biên dịch native mới. Source converter gốc vẫn đúng pins;
không thêm công thức thời gian, matcher hoặc cách sửa dữ liệu âm nhạc.

Gói triển khai cuối đặt tại
`artifacts/releases/pianist-web-2026-10-19-abc/`. Release web
`202b89c9bb8138302cd5` có **151 tài nguyên, 156.872.607 byte (~149,6 MiB)**;
zip web khoảng 79,5 MiB. Phần runtime/source/license ABC gồm 17 file,
14.257.744 byte; core tải lúc conversion ít hơn tổng này. Gói public chỉ có
mẫu CC0, không có Phố Xa hoặc dữ liệu IndexedDB. `SOURCE.json` ghi commit
chính xác và source archive; `SHA256SUMS.json` kiểm zip/source/cấu hình deploy.
Danh tính release phụ thuộc bytes tài nguyên và template service worker;
commit tài liệu sau nghiệm thu không làm đổi các bytes ứng dụng đó.
Mốc code A5: `83e07db1`; A6: `9834e38b`. Gói source cuối gồm cả báo cáo A7;
đọc `SOURCE.json` để lấy commit đầy đủ và checksum chính xác của gói đó.

A5–A7 đã hoàn thành **trong profile giới hạn của A1/A4**. Các ca ngoài profile
được kiểm bằng hành vi từ chối và giữ bản đang mở, không tính thành một ca
chuyển đổi thành công. Phố Xa ở cả hai định dạng là bằng chứng giới hạn này.

## Giới hạn đã giữ nguyên

ABC chưa bảo toàn mọi cấu trúc MusicXML. Các ngoại lệ A1/A4 vẫn có fixture và
thông báo từ chối: trường độ bị làm tròn, tie/jump/cross-staff ngoài profile,
grace/ornament/fermata/custom-key chưa được xác minh đầy đủ; mốc nhả đổi do
nhạc cụ; pedal direction có offset bị converter gốc làm lệch.
Xem [đối chiếu và vị trí code upstream](ABC_CONVERTER_RESULTS.md).

Phố Xa dùng MXL gốc ở local. Converter báo `illegal duration 22/3`,
`illegal duration 2/3` và tie giữa hai cao độ khác nhau. Không công bố bản ABC
tương đương khi conversion bị từ chối, không sửa tick/pedal hoặc dung sai chấm
để làm dữ liệu khớp. MSCZ
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
# Kiểm chính gói public:
$env:PIANIST_SITE = 'D:\duan\pianist\artifacts\releases\pianist-web-2026-10-19-abc\site'
node tests/browser/pianist/abc-offline.cjs
python buildscripts/pianist/verify-release.py --directory $env:PIANIST_SITE --public
```

`abc-offline.cjs` phục vụ release trên một server thử nghiệm riêng, từ
`PIANIST_SITE` hoặc `build.artifacts`. Nó không sửa server 8787/thư viện của
người dùng. Các script browser dùng profile tạm. Test offline khóa mạng cả
browser lẫn server: các lần trình duyệt tự kiểm tra `sw.js` vẫn bị từ chối;
không dùng các lần kiểm tra đó để cấp tài nguyên ứng dụng.
