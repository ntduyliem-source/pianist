# Nhập gói 16 bài nhạc Hoa — 23/10/2026

Gói ZIP đã kiểm đúng 184.494 bytes và SHA-256 `246babe915f2bf4720f20e265a818c5baf69dcd1a870d6051d8f542a15492e23`, chứa đúng 16 MXL. ABC, CSV, README và ảnh nguồn chỉ phục vụ đối chiếu; không thành bài trong catalog.

**Nhận 15 phiên bản: 14 tác phẩm mới + 1 Version 2; cách ly Họa tâm; không có bản trùng nội dung. Catalog hiện có 93 phiên bản / 89 tác phẩm.**

9 phiên bản mới tập được. 6 phiên bản có nốt hoa mỹ chỉ nghe/chỉnh sửa: 999 đóa hồng, Người tình mùa đông, Đồng thoại, Bến Thượng Hải, Chuột yêu gạo và Thanh hoa sứ. Native editor giữ đủ nốt nguồn và nốt hoa mỹ; playback/ánh xạ đạt, nhưng bộ tập chưa theo dõi đủ các nốt hoa mỹ nên Tập bị khóa.

**Họa tâm:** cách ly toàn bộ file ngoài thư viện phát hành. Tay phải ô 69 trong ảnh thiếu 3,5 phách chưa xác định; không khôi phục, không tự điền, không bật chấm. MusicXML đúng XSD không chứng minh nguồn nhạc đã đầy đủ.

**Thanh hoa sứ:** bản gốc trong ZIP bị cách ly vì `ending` đặt sau `repeat` trong `barline` (XML dòng 9353, ô 25), không đúng XSD 4.0. Sau đó bên bàn giao cung cấp riêng bản sửa 15.079 bytes, SHA-256 `f161272b882a9accef08097308c4ff0bca750270dc730a65f5947f2092ec12bc`. Đã đối chiếu toàn XML sau chuẩn hóa khoảng trắng: chỉ đổi đúng thứ tự hai thẻ đó, dữ liệu còn lại giữ nguyên. Bản thay thế đạt XSD và được kiểm native lại: giữ 1.040 nốt, gồm 2 nốt hoa mỹ, chỉ nghe/chỉnh sửa. Không tải lại ZIP version 1, không nhập lại các bản đã đạt. Receipt giữ cả hash bản bị loại và bản thay thế; đây là sửa đầu vào chưa phát hành, không tạo version trùng.

**Ánh trăng nói hộ lòng tôi:** thêm Version 2 cùng tác phẩm có tên Việt/Anh khớp (The Moon Represents My Heart); 361 nốt, khác bytes và MusicXML canonical. Giữ nguyên Version 1 và dùng dropdown hiện có.

Toàn bộ 15 bản nhận đúng hai khuông piano, qua XSD MusicXML 4.0 trong source MuseScore, nhập/xuất native giữ số nốt, SVG mapping không thiếu nốt hiển thị và playback native. Thumbnail do renderer native tạo. Bộ font hiện tại có thể không hiện phần chữ Hán trong tiêu đề sheet; tên catalog dùng tiếng Việt.

Giữ nguyên 78 bản cũ, metadata/ID/workId/version/thứ tự và bytes. Các MXL mới được sao chép nguyên bytes. Nguồn ghi Source/arranger/Music21 không được tự coi là tác giả; credits gốc giữ trong receipt. Không thay logic chấm hoặc nội dung grade.

Đợt này kiểm tương thích ứng dụng, không xác nhận độc lập toàn bộ bản chép so với 59 ảnh nguồn/bản thu: gói chỉ kèm một ảnh cắt lỗi Họa tâm và báo cáo đối chiếu của bên bàn giao.

Đã kiểm qua giao diện cả 15 bản nhận: Nghe/Stop có tín hiệu âm thanh native,
Editor mở đúng bytes, chín bản vào Tập đúng số nốt/trang/ô, sáu bản có nốt hoa mỹ
bị chặn cả từ thư viện lẫn Editor. Dropdown Version 2 giữ qua reload và vừa viewport
360/390/1440 px. Bản sửa Thanh hoa sứ được kiểm riêng, không nhập lại 14 bản đã đạt.
54 kiểm thử thư viện Python qua.

[Receipt từng file và bằng chứng](IMPORT_RECEIPT_2026-10-23_CHINESE_16.json).

| File nguồn | Tên | Kết quả | Version | Chi tiết |
|---|---|---|---|---|
| 01-999-Doa-Hong.mxl | 999 đóa hồng | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 278 nốt; bộ tập chưa hỗ trợ 1 nốt hoa mỹ. |
| 02-Nguoi-Tinh-Mua-Dong.mxl | Người tình mùa đông | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 1336 nốt; bộ tập chưa hỗ trợ 14 nốt hoa mỹ. |
| 03-Dong-Thoai.mxl | Đồng thoại | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 914 nốt; bộ tập chưa hỗ trợ 15 nốt hoa mỹ. |
| 04-Than-Thoai.mxl | Thần thoại | Bài mới | 1 | 1484 nốt; 6 trang; MuseScore playback/mapping đạt |
| 05-Tan-Uyen-Uong-Ho-Diep-Mong.mxl | Tân uyên ương hồ điệp mộng | Bài mới | 1 | 217 nốt; 1 trang; MuseScore playback/mapping đạt |
| 06-Anh-Trang-Noi-Ho-Long-Toi.mxl | Ánh trăng nói hộ lòng tôi | Version mới | 2 | 361 nốt; 2 trang; MuseScore playback/mapping đạt |
| 07-Nu-Hon-Biet-Ly.mxl | Nụ hôn biệt ly | Bài mới | 1 | 516 nốt; 2 trang; MuseScore playback/mapping đạt |
| 08-Ben-Thuong-Hai.mxl | Bến Thượng Hải | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 721 nốt; bộ tập chưa hỗ trợ 4 nốt hoa mỹ. |
| 09-Diem-Mat-Mat.mxl | Điềm mật mật | Bài mới | 1 | 521 nốt; 2 trang; MuseScore playback/mapping đạt |
| 10-Chuot-Yeu-Gao.mxl | Chuột yêu gạo | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 1288 nốt; bộ tập chưa hỗ trợ 2 nốt hoa mỹ. |
| 11-Sau-Nay.mxl | Sau này | Bài mới | 1 | 787 nốt; 3 trang; MuseScore playback/mapping đạt |
| 12-Nhung-Nam-Ay.mxl | Những năm ấy | Bài mới | 1 | 716 nốt; 3 trang; MuseScore playback/mapping đạt |
| 13-May-Man-Be-Nho.mxl | May mắn bé nhỏ | Bài mới | 1 | 714 nốt; 3 trang; MuseScore playback/mapping đạt |
| 14-Thanh-Hoa-Su.mxl | Thanh hoa sứ | Bài mới | 1 | Chỉ nghe/chỉnh sửa. Nghe/chỉnh sửa đầy đủ 1040 nốt; bộ tập chưa hỗ trợ 2 nốt hoa mỹ. |
| 15-Hoa-Tam.mxl | Họa tâm | Cách ly | — | Cách ly nguồn thiếu: tay phải ô 69 chưa xác định 3,5 phách. Không tự điền hoặc bật tập tính điểm. |
| 16-Do-Ta-Khong-Do-Nang.mxl | Độ ta không độ nàng | Bài mới | 1 | 338 nốt; 2 trang; MuseScore playback/mapping đạt |
