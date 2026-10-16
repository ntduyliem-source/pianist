# Pianist Web — chạy và sử dụng

Pianist hiện có ba khu vực riêng: **Thư viện**, **Editor MuseScore** và
**Tập piano**. Màn tập chỉ hiển thị bản nhạc đọc, các thiết lập luyện tập,
bàn phím và kết quả; không có công cụ sửa ký âm. Engine editor được giữ
trong cùng trang để chuyển màn hình không mất project hoặc undo.

## Chạy tại máy này

```powershell
# Sau khi đã setup/build engine M0:
.\buildscripts\pianist\build-pianist.ps1 -SkipEngine -SkipInstall
python buildscripts/pianist/serve-web.py
```

Mở `http://127.0.0.1:8787/pianist.html`. Server chỉ phục vụ loopback.
Từ checkout sạch, chạy `setup-web.ps1` trước rồi chạy `build-pianist.ps1 -FastLink`
để build cả hai engine, cài dependencies theo lockfile, test và đóng gói shell.
`-FastLink` là bản phát triển, chưa phải số đo build tối ưu phát hành.

## Luồng sử dụng

1. Nhập MXL/XML/MSCZ bằng nút nhập hoặc kéo file vào trang; tối đa 32 MiB.
   File nguồn được giữ riêng trong thư viện trên thiết bị.
2. Chỉnh sửa trong editor MuseScore. **Lưu thư viện/Ctrl+S** lưu bền vững vào
   IndexedDB; **Lưu bản mới/Ctrl+Shift+S** tạo project mới, giữ undo của editor.
   **Tải MSCZ** và **Xuất MXL/MusicXML/PDF** tạo file độc lập trên máy.
3. Chọn **Tập bài này**. Bản tập lấy từ score hiện tại, kể cả thay đổi chưa
   tải file; không cần xuất rồi nhập lại. Chọn tay, khuông/voice, đoạn A–B,
   tempo, đơn vị phách, số lượt và metronome trước khi bắt đầu.
4. Kết nối/chọn đàn MIDI bằng thao tác người dùng. Bàn phím ảo 88 phím và
   A–L/W E T Y U dùng để thử; lịch sử phân biệt nguồn ảo và đàn thật.
5. Kết thúc để xem nốt khớp/thiếu/thừa, timing từng nốt, hợp âm, lượt loop
   và ô nhịp cần tập lại. JSON/CSV giữ toàn bộ kết quả; bảng hiển thị 500 nốt đầu.
6. Về editor để sửa tiếp. Muốn đổi bài/cấu hình khi đang tập, kết thúc lượt trước.

Phố Xa là bài mẫu chính tại workspace này; xem [nguồn file mẫu](../examples/README.md).
Checkout không có file người dùng sẽ dùng fixture piano CC0 của dự án.

## Hai chế độ tập

**Đúng nốt:** đủ các pitch của nhóm hợp âm đang giữ hợp lệ mới tiến.
Nốt lặp cần Note On mới; phím giữ từ trước hoặc pedal không tự nhận điểm.
Khoảng nghỉ được giữ theo tốc độ tham chiếu. Lần sửa/bấm sai vẫn giảm precision
và tỷ lệ đúng ngay lần đầu, kể cả khi cuối cùng chơi hết bài.

**Theo BPM:** lịch chạy liên tục, giữ tỷ lệ tempo map của score; lỗi người chơi
không kéo lệch đồng hồ. Mỗi input chỉ ghép một mục tiêu. Cửa sổ ghép ±250 ms,
Perfect ≤50 ms, Good ≤120 ms; đây là tham số thử nghiệm, chưa được chuẩn hóa
bằng đo đàn thật. Hợp âm giữ delta từng nốt và độ trải onset; -100/+100 ms
không được biến thành lỗi 0 ms.

Nốt và phím nhận phản hồi ngay: xanh là đúng pitch, vàng là ngoài ngưỡng timing,
đỏ là phím thừa/sai. Viền đứt/dấu chấm là kết quả đang ghép; dấu ✓ là đã chốt.
Trong Đúng nốt, hợp âm thiếu hiển thị riêng từng pitch đang giữ; nhả phím trước
khi đủ hợp âm sẽ bỏ phần ghi nhận tạm. Khi repeat/loop quay lại, highlight dùng
đúng occurrence mới; nốt đã chấm không bị màu cursor che mất.

Matcher chia các mục tiêu cùng pitch thành cụm tối đa 8 nốt hoặc 1,5 giây;
biên cụm được cố định ở trung điểm hai onset để không tái sử dụng input.
Trong cụm dùng đối sánh có thứ tự: ưu tiên số khớp, rồi sai lệch tuyệt đối.
Kết quả chốt sau cửa sổ muộn + ngân sách giao event 120 ms + phần offset dương;
biên thời gian được giữ mở đến sau hạn này. Phản hồi tạm hiện ngay và có thể
đổi ứng viên khi gặp chuỗi cùng pitch; điểm chính thức đợi hết cụm. Event quá trễ/queue quá lớn làm lượt gián đoạn,
không âm thầm sửa kết quả đã chốt.

Timestamp gốc MIDI được giữ và đổi về cùng trục performance; xem
[Web MIDI specification](https://www.w3.org/TR/webmidi/#midimessageevent-interface).
Transport dùng clock Web Audio và
[getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp),
có fallback ghi rõ trong kết quả. rAF/khung hình không quyết định điểm.
Bù trễ cố định cho cả lượt; có trường nhập tay và bài đo 12 click MIDI,
cần ít nhất 8 mẫu. Chưa có kết quả đo thiết bị thực trong lượt phát triển này.

Tie liên tục gộp thành một lần đánh; bắt đầu giữa tie thì đánh lại nốt đầu đoạn.
Unison cùng onset/pitch được gộp, giữ tất cả anchor/vai khuông. Grace được bỏ
qua, ornament chấm nốt chính và arpeggio chấm như hợp âm thường; score có các
ký hiệu này yêu cầu xác nhận quy tắc trước khi tập. Fermata giữ thời gian phát
native MuseScore, không tự chờ người chơi. Chưa chấm giữ phím/pedal.

Khi tập một tay theo BPM, có thể bật **Phát tay còn lại** bằng âm hướng dẫn tổng
hợp; các nốt này không được tính vào điểm và unison với tay đang tập bị loại khỏi
âm hướng dẫn. **Sau mỗi lượt** đặt mức đổi BPM cố định, có một phách nghỉ giữa
hai lượt. Lịch được lập trước khi bắt đầu; giao diện hiện BPM của lượt đang chạy.
Kết quả chỉ so sánh với lượt hoàn thành gần nhất có cùng score/cấu hình/nguồn
input/clock; không trộn lượt bỏ dở hoặc MIDI thật với bàn phím ảo.

## Lưu, phục hồi và nhiều tab

Project, bản nguồn, recovery, kết quả và calibration nằm trong IndexedDB v2.
Tự lưu sau khoảng 1,6 giây không chỉnh sửa. Mở lại project sẽ phục hồi bản
recovery mới hơn bản lưu thư viện. Chỉ báo đã lưu sau khi transaction commit.
Save As tạo ID mới; lịch sử cũ vẫn bám ID/revision/fingerprint cũ.

Web Locks khóa cùng project giữa các tab, có lease IndexedDB dự phòng.
Lỗi quota không được coi là lưu thành công; đường tải MSCZ vẫn dùng được.
Lưu trữ bài là thao tác có thể khôi phục, giữ cả recovery; không xóa vĩnh viễn.
Không dựa vào filesystem tạm WASM hay cache PWA làm nơi lưu project.

Ẩn tab, mất focus, audio suspend, rút đàn hoặc jank trên 500 ms làm buổi tập
tạm dừng/gián đoạn. Resume dùng lại vị trí đã đóng băng và đếm vào theo cấu hình;
phím đang giữ không thành lần đánh mới. Đổi lịch tạo session/epoch mới.

## Replay và kiểm tra

```powershell
cd apps/pianist-web
npm ci
npm test
npm run build
node --import tsx scripts/replay.ts C:\path\to\result.json
```

Chọn **Lưu event log để replay** trước khi tập. Log chứa input, các lần tiến
đồng hồ và ranh giới clear-held khi pause/resume. CLI đối chiếu lại assessments
và extras với kết quả đã lưu. Log quá lớn bị bỏ; 20 lượt mới nhất giữ replay
tùy dung lượng, các summary cũ vẫn còn. Xem [bằng chứng](M1_M6_RESULTS.md).

Replay chỉ chạy cùng `algorithmVersion`. Bản hiện tại là `pianist-onset-1.1.0`;
log 1.0.0 cần commit `33b68f61`, log 1.0.1 cần commit `c52e83ce`. Tập lại từ lịch sử tạo lượt
mới với phiên bản bộ chấm hiện tại, không thay kết quả đã lưu.

## Đóng gói và phát hành

`package-web.py` tạo manifest SHA-256 và một service worker gắn với đúng bộ
binary/JS/CSS. **Chuẩn bị dùng offline** tải và kiểm hash toàn bộ bộ tài nguyên
khoảng 134,5 MiB với build tối ưu đã kiểm tra. Mỗi worker giữ một phiên bản, kể
cả release manifest; không `skipWaiting` giữa session. JS/WASM được kiểm hash
trước khi khởi tạo, tránh chạy cặp binary đang cập nhật dở.
Đóng các tab rồi mở lại để dùng bản mới. Cache không thay thế thư viện IndexedDB.

`deploy/Caddyfile` có mẫu HTTPS, WASM MIME, COOP/COEP và policy MIDI cùng origin.
Build native mặc định tối ưu; `-FastLink` dành cho phát triển. Link app vào
`.tools/web-stage-app` rồi mới copy cặp JS/WASM hoàn tất, sau đó chạy lại
`build-pianist.ps1 -SkipEngine -SkipInstall` để đóng gói manifest/shell.
Manifest ghi source commit, trạng thái source có sửa và kiểu link.

Chưa chọn domain/host và chưa publish. Phải triển khai thư mục release nguyên
bộ, không thay từng binary đang được phục vụ. Đóng gói source/build tương ứng
và hoàn tất [notices](THIRD_PARTY_NOTICES.md) trước phân phối công khai.

Giới hạn hiện tại: snapshot tối đa 40 trang/50.000 nốt viết/24 MiB SVG;
plan tối đa 100.000 mục tiêu/2 giờ và 10 loop. Đã thử bài 50 ô nhịp Phố Xa,
chưa đo giới hạn này trên đủ cấu hình máy/đàn. Stress test domain 50.000 nốt
không thay thế benchmark toàn bộ browser/âm thanh. M7 còn duration/pedal,
profile ornament nâng cao và các phần mở rộng tài khoản/tablet/đồng bộ.
