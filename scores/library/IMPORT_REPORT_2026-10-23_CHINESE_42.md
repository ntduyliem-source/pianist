# Nhập lô 42 bài nhạc Hoa — 23/10/2026

ZIP đúng 420.318 bytes, SHA-256 `6f5cf08b6086018f5a9659d3fe0afa61ef0b757a51da2f4ce17a980edb9a0bcf`; đủ 42 MXL và 42 ABC. Đã đọc `Trang-thai-nhap.json` trước khi kiểm. Chỉ MXL là đầu vào thư viện; ABC và tài liệu không thành bài.

**Nhận 38 phiên bản: 38 bài mới, 0 version mới; 0 bản trùng; 4 bản loại/cách ly. 34 bản tập được, 4 bản chỉ nghe/chỉnh sửa.**

Catalog sau lô này: **131 phiên bản / 127 tác phẩm**. Giữ nguyên 93 phiên bản trước đó, bao gồm lô 16 và Thanh hoa sứ đã sửa; không nhập lại lô 16.

Các bản chỉ nghe/chỉnh sửa: Vì một người ra đi, Liều thuốc cho trái tim, Thằng Tàu lai, Cuộc tình trong cơn mưa — Tình yêu còn xa. Nốt hoa mỹ được giữ đủ qua native editor export; bộ tập chưa theo dõi đủ nên nút Tập bị khóa.

## Bốn đầu vào không phát hành

- **Nếu em đã quên — bản đầy đủ (07):** tay phải ô 2 có 4,5 phách trong 4/4. Cách ly, không tự sửa. Bản đơn giản (10) là bản phối khác; nếu đạt kiểm ứng dụng thì nhận riêng với nhãn Bản đơn giản, không coi là bản trùng.
- **Mưa trên cuộc tình (42):** tay phải ô 4 có 5 phách trong 4/4, tay trái ô 4/12/47 thiếu trường độ xác định. Cách ly đầu vào này, không tự điền. Bản Mưa trên cuộc tình đã có trước đó giữ nguyên.
- **Yêu em trọn đời (19):** giọng hát và hai tay piano tổng ba khuông, không đạt chính sách đúng hai khuông. Giữ nguyên file nguồn ngoài gói phát hành; không bỏ bè hát.
- **Chỉ có đôi ta (20):** thiếu To Coda/đích Coda rõ trong nguồn. Cách ly vì chưa xác định luồng nhảy, không đoán lộ trình hoặc bật tập.

Họa tâm từ lô 16 tiếp tục cách ly vì nguồn thiếu; không có thay đổi.

## Phạm vi kiểm

Mỗi bản nhận phải đúng hai khuông piano, XSD MusicXML 4.0 trong source MuseScore, native import/export giữ số nốt, SVG mapping đủ nốt hiển thị và playback native đạt. Thumbnail do pinned native renderer tạo. File MXL được giữ nguyên bytes; các nguồn ghi Source/arranger/Music21 không được tự coi là tên tác giả. Không đổi logic chấm hoặc nội dung grade.

Ghi chú nguồn về pedal không có điểm nhả, luyến thiếu đầu/cuối, nhịp được suy ra, nhãn lặp và D.S./Coda được giữ trong receipt. Các kiểm này không khẳng định đã khôi phục ký hiệu không có trong nguồn, hoặc xác nhận độc lập toàn bộ bản chép so với ảnh/bản thu. Không tự thêm nhả pedal, đích nhảy hay nốt/phách.

[Receipt từng file](IMPORT_RECEIPT_2026-10-23_CHINESE_42.json).

Đã kiểm qua giao diện 38/38 bản được nhận: Nghe/Stop có tín hiệu âm thanh native,
Editor mở đúng bytes nguồn và đúng số nốt/trang/ô. 34 bản vào Tập được; bốn bản
có nốt hoa mỹ bị chặn cả từ thư viện lẫn Editor. Các bản/phiên bản cũ vẫn có đủ
dropdown; layout vừa viewport 360/390/1440 px. 54 kiểm thử thư viện Python qua.

| File nguồn | Bài | Kết quả | Version | Chi tiết |
|---|---|---|---|---|
| 01-Vi-Mot-Nguoi-Ra-Di.mxl | Vì một người ra đi | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 1204 nốt; bộ tập chưa hỗ trợ 18 nốt hoa mỹ. |
| 02-Vi-Sao-Trong-Long-Toi.mxl | Vì sao trong lòng tôi | Bài mới | 1 | 544 nốt; 2 trang; MuseScore playback/mapping đạt |
| 03-Dan-Ong-Khong-Duoc-Quen-Het-Tinh-Con-Nghia.mxl | Đàn ông không được quên hết tình còn nghĩa | Bài mới | 1 | 1152 nốt; 3 trang; MuseScore playback/mapping đạt |
| 04-Anh-Khong-Muon-Bat-Cong-Voi-Em.mxl | Anh không muốn bất công với em | Bài mới | 1 | 520 nốt; 3 trang; MuseScore playback/mapping đạt |
| 05-Khi-Nguoi-Dan-Ong-Khoc.mxl | Khi người đàn ông khóc | Bài mới | 1 | 756 nốt; 3 trang; MuseScore playback/mapping đạt |
| 06-Lieu-Thuoc-Cho-Trai-Tim.mxl | Liều thuốc cho trái tim | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 871 nốt; bộ tập chưa hỗ trợ 2 nốt hoa mỹ. |
| 07-Neu-Em-Da-Quen.mxl | Nếu em đã quên — bản đầy đủ | Loại/cách ly | — | Cách ly nguồn mâu thuẫn nhịp: tay phải ô 2 có 4,5 phách trong 4/4; không tự sửa hoặc bật tập. |
| 08-Tinh-Don-Coi-2-Lac-Mat-Dong-Song.mxl | Tình đơn côi 2 | Bài mới | 1 | 477 nốt; 2 trang; MuseScore playback/mapping đạt |
| 09-Noi-Gi-Di.mxl | Nói gì đi | Bài mới | 1 | 1308 nốt; 4 trang; MuseScore playback/mapping đạt |
| 10-Neu-Em-Da-Quen-Ban-Don-Gian.mxl | Nếu em đã quên | Bài mới | 1 | 366 nốt; 2 trang; MuseScore playback/mapping đạt |
| 11-Tieng-sao-phieu-bong.mxl | Tiếng sáo phiêu bồng | Bài mới | 1 | 967 nốt; 3 trang; MuseScore playback/mapping đạt |
| 12-Sao-em-no-ra-di.mxl | Sao em nỡ ra đi | Bài mới | 1 | 1138 nốt; 3 trang; MuseScore playback/mapping đạt |
| 13-Cam-ta-tinh-em.mxl | Cảm tạ tình em | Bài mới | 1 | 507 nốt; 2 trang; MuseScore playback/mapping đạt |
| 14-Hoang-hon-cung-say.mxl | Hoàng hôn cũng say | Bài mới | 1 | 699 nốt; 3 trang; MuseScore playback/mapping đạt |
| 15-Nhung-loi-doi-gian.mxl | Những lời dối gian | Bài mới | 1 | 628 nốt; 2 trang; MuseScore playback/mapping đạt |
| 16-Tinh-vo-canh-bay.mxl | Tình vô cánh bay | Bài mới | 1 | 512 nốt; 2 trang; MuseScore playback/mapping đạt |
| 17-Tien-ban-len-duong.mxl | Tiễn bạn lên đường | Bài mới | 1 | 1212 nốt; 4 trang; MuseScore playback/mapping đạt |
| 18-Chia-tay-trong-mua.mxl | Chia tay trong mưa | Bài mới | 1 | 745 nốt; 3 trang; MuseScore playback/mapping đạt |
| 19-Yeu-em-tron-doi.mxl | Yêu em trọn đời | Loại/cách ly | — | Loại theo chuẩn hai khuông: nguồn có giọng hát + hai khuông piano (3 khuông); giữ nguyên nguồn, không bỏ bè hát. |
| 20-Chi-co-doi-ta.mxl | Chỉ có đôi ta | Loại/cách ly | — | Cách ly luồng nhảy chưa xác định: có Segno/D.S. al Coda nhưng thiếu To Coda/đích Coda rõ; không tự đặt đích hoặc bật tập. |
| 21-Lang-quen-chieu-thu.mxl | Lãng quên chiều thu | Bài mới | 1 | 212 nốt; 2 trang; MuseScore playback/mapping đạt |
| 22-Melody.mxl | Melody | Bài mới | 1 | 1779 nốt; 8 trang; MuseScore playback/mapping đạt |
| 23-Tinh-nhu-la-bay-xa.mxl | Tình như lá bay xa | Bài mới | 1 | 338 nốt; 2 trang; MuseScore playback/mapping đạt |
| 24-Mua-tuyet.mxl | Mưa tuyết | Bài mới | 1 | 503 nốt; 3 trang; MuseScore playback/mapping đạt |
| 25-Tinh-xua-nghia-cu-2.mxl | Tình xưa nghĩa cũ 2 | Bài mới | 1 | 525 nốt; 3 trang; MuseScore playback/mapping đạt |
| 26-Thang-Tau-lai.mxl | Thằng Tàu lai | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 884 nốt; bộ tập chưa hỗ trợ 2 nốt hoa mỹ. |
| 27-Trong-vang.mxl | Trống vắng | Bài mới | 1 | 380 nốt; 3 trang; MuseScore playback/mapping đạt |
| 28-Vo-tinh.mxl | Vô tình | Bài mới | 1 | 364 nốt; 2 trang; MuseScore playback/mapping đạt |
| 29-Ta-tro-ve.mxl | Ta trở về | Bài mới | 1 | 1247 nốt; 4 trang; MuseScore playback/mapping đạt |
| 30-Le-tinh.mxl | Lệ tình | Bài mới | 1 | 584 nốt; 6 trang; MuseScore playback/mapping đạt |
| 31-Co-be-Tieu-Vy.mxl | Cô bé Tiểu Vy | Bài mới | 1 | 387 nốt; 2 trang; MuseScore playback/mapping đạt |
| 32-Biet-khuc-cho-nhau.mxl | Biệt khúc cho nhau | Bài mới | 1 | 820 nốt; 3 trang; MuseScore playback/mapping đạt |
| 33-Thien-ha-huu-tinh-nhan.mxl | Thiên hạ hữu tình nhân | Bài mới | 1 | 832 nốt; 2 trang; MuseScore playback/mapping đạt |
| 34-Tam-hon-xao-dong.mxl | Tâm hồn xao động | Bài mới | 1 | 1292 nốt; 4 trang; MuseScore playback/mapping đạt |
| 35-Kiep-rong-buon.mxl | Kiếp rong buồn | Bài mới | 1 | 441 nốt; 2 trang; MuseScore playback/mapping đạt |
| 36-Khi-co-don-em-nho-ai.mxl | Khi cô đơn em nhớ ai | Bài mới | 1 | 731 nốt; 3 trang; MuseScore playback/mapping đạt |
| 37-Ao-mong-tinh-yeu.mxl | Ảo mộng tình yêu | Bài mới | 1 | 879 nốt; 3 trang; MuseScore playback/mapping đạt |
| 38-Tim-dau-yeu-xua.mxl | Tìm dấu yêu xưa | Bài mới | 1 | 779 nốt; 3 trang; MuseScore playback/mapping đạt |
| 39-Cuoc-tinh-trong-con-mua-Tinh-yeu-con-xa.mxl | Cuộc tình trong cơn mưa — Tình yêu còn xa | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 1066 nốt; bộ tập chưa hỗ trợ 23 nốt hoa mỹ. |
| 40-Mua-xuan-ca-giua-que-huong.mxl | Mùa xuân ca giữa quê hương | Bài mới | 1 | 430 nốt; 2 trang; MuseScore playback/mapping đạt |
| 41-Them-Mot-Lan-Dau.mxl | Thêm Một Lần Đau | Bài mới | 1 | 956 nốt; 4 trang; MuseScore playback/mapping đạt |
| 42-Mua-Tren-Cuoc-Tinh.mxl | Mưa trên cuộc tình | Loại/cách ly | — | Cách ly nguồn mâu thuẫn/thiếu nhịp: tay phải ô 4 có 5 phách trong 4/4, tay trái ô 4/12/47 thiếu trường độ xác định; không tự điền hoặc bật tập. |
