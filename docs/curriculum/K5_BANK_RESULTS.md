# K5 — kho MXL đã tổng kiểm và đóng gói

Ngày 21/10/2026. **Đã hoàn tất lượt xử lý K3–K5 cho kho hiện tại; quota 300 bài cho mỗi lựa chọn chưa đạt.**

Gói có **5.460 MXL không trùng** (tăng **176** so với lô cũ), thuộc **5.172 nhóm motif**. Hai lô có 5.461 bản ghi đã kiểm; một nội dung trùng giữa hai lô chỉ tính một lần. Các đoạn chồng lấn vẫn có thể tồn tại; nhóm motif không phải chứng nhận mọi trải nghiệm là độc lập.

**9/56 ô đạt 300; còn 47 ô thiếu tổng 11.537 lượt bài theo ô.** Không dùng số vượt của một ô để bù ô khác.

## Số bài từng lựa chọn

| Grade | ~4 | ~6 | ~10 | ~20 | ~30 | ~50 | ~100 | Tổng |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| G1 | 159 | 83 | 32 | 15 | 0 | 0 | 0 | 289 |
| G2 | 128 | 125 | 97 | 64 | 11 | 2 | 1 | 428 |
| G3 | 112 | 136 | 175 | 210 | 174 | 62 | 3 | 872 |
| G4 | 344 | 336 | 340 | 326 | 304 | 301 | 323 | 2274 |
| G5 | 0 | 3 | 0 | 1 | 0 | 0 | 0 | 4 |
| G6 | 127 | 223 | 305 | 318 | 255 | 168 | 33 | 1429 |
| G7 | 16 | 19 | 5 | 8 | 4 | 0 | 0 | 52 |
| G8 | 47 | 21 | 19 | 15 | 4 | 5 | 1 | 112 |

Các khoảng lần đánh tương ứng: 3–5 / 6–8 / 9–14 / 15–24 / 25–39 / 40–69 / 70–120. Tie không thêm lần đánh. Bộ lọc nội dung, ngưỡng grade và cách đếm không được nới trong lượt này.

## Từng K đã bàn giao

| Bước | Kết quả |
|---|---|
| K1 | Cả 14.960 nguồn hiện giữ có kết quả; 14.840 nguồn có phân tích và đã quét, 120 nguồn có lý do riêng. |
| K2 | Giữ nguyên 25 profile và chính sách đọc nhạc đã thống nhất. Không tìm ngón hoặc đổi logic chấm BPM. |
| K3 | Đã quét hết 14.840 nguồn đọc được; không còn nguồn cần retry trong hàng quét. Bài dài Merry Widow Waltzes hoàn tất ở lượt retry hữu hạn. |
| K4 | Lô bổ sung có 177 MXL qua chiếu nguồn, music21, native MuseScore và renderer; 176 nội dung mới sau gộp với kho cũ. |
| K5 | Kiểm checkpoint/ứng viên, file/proof/catalog, thống kê grade × profile × tay × độ dài, tạo 56 chỉ mục và ZIP có manifest hash. |

120 nguồn còn hạn chế gồm **62 cần xác minh nhạc cụ**, **57 lỗi/giới hạn importer** (19 lỗi parse, 13 vượt giới hạn nốt, 25 timeout sau thử lại) và **1 vượt giới hạn XML container**. Đây là các kết quả đã ghi lý do, không được tính thành bài tập và không đồng nghĩa tất cả file nhạc đều hỏng.

Trong 361 nguồn từng thiếu tên piano, 299 nguồn được xác minh: 152 qua tên dịch MuseScore và 147 qua metadata đã kiểm hash cùng cấu trúc grand staff. Bản dành cho importer chỉ đổi text nhãn nhạc cụ; K5 đọc lại bản gốc/bản dẫn xuất để so toàn bộ XML ngoài nhãn. 49 nguồn lỗi nhập đã có tên piano được thử lại nguyên byte. **File nguồn gốc không bị sửa.**

## Kiểm chứng

- **158 test Python đạt**; có test grade, nguồn, biên, MusicXML, worker, resume, tên nhạc cụ, nhập nguồn, bỏ trùng, quota và đóng gói.
- Đối soát checkpoint của cả hai lô; lô cũ có 5.674 ứng viên = 5.284 đã xuất + 287 trùng + 103 thuộc lựa chọn đã đủ. Không tính staging vào số bài đạt.
- Đối soát độc lập 5.461 bản ghi với nguồn/ô nhịp/tay/profile/motif trong chính proof của bản đó: không sai lệch.
- **10.571 file thuộc kho cũ giữ nguyên hash**, gồm toàn bộ MXL/proof và catalog/progress/database. Các bài một khuông vẫn còn nguyên. Nguồn gốc đã được người dùng xóa được ghi `originalSourceRetained: false`; hồ sơ kiểm lịch sử của bài vẫn được giữ.
- Chạy lại lệnh xuất lô bổ sung không thêm bài hoặc đổi catalog. Catalog của hai lô sau chạy lại khớp hash đầu vào gói K5.
- Đã đọc lại từng mục ZIP, kiểm CRC và SHA-256; chạy độc lập `--verify` trên thư mục gói cũng đạt.

## Gói bàn giao

- Release: `reading-mxl-v1-be09d10ff801b28a`.
- [ZIP MXL và catalog](../../artifacts/curriculum-bank/reading-mxl-v1-be09d10ff801b28a.zip): **11.184.156 byte**, khoảng **11,18 MB**.
- Tổng riêng MXL: **7.116.370 byte**; proof/cache nguồn ở ngoài gói tải.
- [Thư mục release](../../artifacts/curriculum-bank/releases/reading-mxl-v1-be09d10ff801b28a/index.json): bắt đầu bằng `index.json`, tải một chỉ mục grade/độ dài rồi một MXL.
- [Receipt kiểm chứng](k5/verification.json); [cách chạy và bổ sung nguồn](BANK_BUILD.md).

**Đây là kho offline, `requiresAppIntegration: true`.** Chưa nối kho mới vào màn quiz hoặc cập nhật bản online trong K. Các bước Q5–Q9 là tích hợp tiếp theo.

## Quota chưa đủ nghĩa là gì

Nguồn đã đọc được đều đã đi qua bộ quét, nhưng bộ điều kiện hiện hành chỉ nhận những đoạn có nốt, nhịp, biên và tay phù hợp. Lô bổ sung tăng nhiều nhất ở G4/G6, nên tăng số file không đồng nghĩa tăng số lựa chọn đạt 300. Chạy lại cùng dữ liệu/rule không tạo thêm nội dung mới.

Để lấp ô thiếu cần bổ sung nguồn thực sự có các đặc điểm còn thiếu, đặc biệt G1 đoạn dài, G5 đệm thưa hai tay và các profile G7/G8. Bảng thiếu đầy đủ nằm trong `coverage.json`. Công cụ nhập nguồn và lệnh nối các K đã có; không tự lặp nốt, đổi grade hoặc tạo bản sao để đạt số.
