# Vì sao 19.627 nguồn bị chặn ở bước nhận diện piano

Ngày 21/10/2026. Điều tra toàn bộ 19.627 nguồn mang mã `piano-not-explicit`, đọc lại XML và metadata gốc, kiểm hash cả hai. Không có lỗi hash/I/O trong lượt kiểm này. [Receipt](piano-identification/verification.json) lưu số đếm và hash các báo cáo chi tiết.

**Trạng thái sau điều tra:** người dùng yêu cầu chỉ giữ sheet nguồn đủ hai staff piano. [Đã dọn kho nguồn còn 14.960 file](SOURCE_POOL_CLEANUP.md), giữ nguyên toàn bộ bài tập. Các số đếm bên dưới là snapshot trước khi dọn.

**Đã xử lý tiếp tại K5:** trong nhóm còn giữ, 299 nguồn có bản dành cho importer chỉ đổi nhãn nhạc cụ (152 tên dịch MuseScore, 147 theo metadata/cấu trúc grand staff). 291 nguồn trong nhóm chưa đọc được đã vào lượt quét bổ sung; 62 trường hợp nhận diện vẫn được ghi lý do. Xem [kết quả đầy đủ](K5_BANK_RESULTS.md).

**Kết luận:** bộ lọc lúc thu thập quá rộng, còn bộ nhận diện lúc xử lý quá hẹp. 19.627 nguồn này đã bị chặn trước khi music21 đọc nốt và trước khi xét grade. Vì vậy, việc hết hàng nguồn K3 hiện tại không chứng minh đã khai thác hết kho nhạc.

## Đã tải những gì

- PDMX: 36.150 ứng viên theo metadata, lọc `n_tracks=1`, `tracks=0` và các cờ valid/dedup/license trong manifest. Đây là tập ứng viên từ một kho tổng hợp, chưa chứng nhận từng bản là piano solo.
- OpenScore Lieder: 1.462 mục nguồn, chủ yếu ca khúc có giọng hát và phần đệm piano; cũng có bản không có phần piano.
- Thư viện cá nhân: 19 mục.

Sau gộp trùng và kiểm container/XML có 37.629 nguồn vào hàng xử lý. Trong đó 17.926 nguồn được bộ nhận diện cũ cho qua để phân tích; 19.627 bị chặn vì nhãn nhạc cụ, 76 gặp lỗi/giới hạn khác.

Ví dụ lọc đầu vào sai: `MyFirstDramSetCore` có part `Drumset`, các nhạc cụ Acoustic Bass Drum/Snare/Cymbal, nhưng CSV vẫn có `n_tracks=1`, `tracks=0`. Nó lọt vào tập ứng viên piano. Mã track riêng lẻ không đủ xác nhận loại bản nhạc.

## Bộ nhận diện đã làm gì

`curriculum_normalize.select_piano` chỉ tìm ba từ `piano`, `pianoforte`, `klavier` trong tên part hoặc instrument của XML. Code không dùng nhãn nhạc cụ trong metadata MuseScore đã tải cùng bản nhạc. Tên trống hoặc piano viết bằng nhiều ngôn ngữ khác không được nhận.

| Nhãn trong XML của nguồn bị chặn | Số file |
|---|---:|
| Toàn bộ tên part/instrument trống | 18.784 |
| Có tên khác/tên chung, gồm cả piano viết bằng ngôn ngữ khác | 830 |
| Có từ piano nhưng xung đột nhãn Voice/Vocal/... | 13 |
| **Tổng** | **19.627** |

Trong 18.784 file trống tên XML, **18.770 có metadata MuseScore ghi `Piano`**. Trong toàn nhóm bị chặn, **19.314 có nhãn metadata chính xác `Piano`**. Đây là nhãn nguồn, không tự chứng nhận bố cục piano hai tay hay đủ điều kiện grade; code đã không tận dụng nó ngay cả để xét tiếp.

Lỗi bỏ sót tên rõ ràng: 40 file có tên `鋼琴`, 17 có `钢琴`, 18 có `ピアノ`, 10 có `피아노`. Các nhóm tên có thể giao nhau, không cộng chúng thành số nguồn duy nhất. Ví dụ Prelude Op.28 No.20 của Chopin được ghi `鋼琴` nên bị chặn bởi bộ lọc ba từ.

## Cấu trúc thật của nhóm bị chặn

| Bố cục | Số file |
|---|---:|
| Một part, một staff/khuông độc lập | 19.222 |
| Một part, hai staff | 370 |
| Bố cục khác | 35 |
| **Tổng** | **19.627** |

Đây là số staff độc lập trong cấu trúc score, không phải số dòng khuông nhìn thấy trên trang. Trong nhóm trống tên, 18.639 file có một part/một staff và 144 có một part/hai staff.

Xét riêng loại nốt, 19.436 file chỉ có nốt cao độ; **191 chỉ có nốt gõ `unpitched`**. Phân loại nốt là chiều thống kê khác với bố cục ở bảng trên. Không được đưa các bản chỉ có nốt gõ vào bài nhận cao độ piano.

Nhiều bản một staff là giai điệu dân ca/tune và có thể là nguồn để xét bài tập một tay. Nhãn Piano hoặc một staff không chứng minh đó là bản soạn piano solo; hai staff cũng cần xét bè và nội dung. Nhóm 19 nghìn này không cung cấp sẵn 19 nghìn bản piano hai tay đã được xác minh.

## Hệ quả và việc cần sửa

5.284 bài MXL hiện có vẫn là kết quả đã kiểm của lượt lọc cũ. Chưa có cơ sở dùng lượt đó để kết luận toàn bộ kho thiếu bài. Ngoài nhận diện nguồn, các giới hạn grade/giọng/âm vực/tiết tấu và cách giữ lại ký hiệu chưa hỗ trợ còn quyết định số đoạn xuất được.

Bước sửa cần làm trước khi tải thêm hàng loạt:

1. Bổ sung nhận diện tên piano đa ngôn ngữ; đối chiếu metadata đã tải thay vì chỉ tìm ba từ trong XML.
2. Tách trường hợp nhạc cụ không rõ tên khỏi nhạc không dùng được. Kiểm nốt cao độ, staff/clef/bè và metadata để xác định nguồn có thể xét tiếp cho bài một tay hoặc hai tay; giữ rõ căn cứ và phần còn chưa chắc.
3. Loại nốt gõ và xung đột nhạc cụ rõ ràng bằng nội dung, dù CSV có `tracks=0`.
4. Phiên bản hóa thay đổi nhận diện, đọc và xét lại nguồn bị chặn; giữ bản gốc. Đối chiếu file bài tập với nguồn và MuseScore trước khi tăng bộ đếm.

Lượt điều tra này chưa sửa code nhận diện, chưa nhập thêm nguồn vào K3 và chưa thay đổi tiêu chí grade. Số bài có thể bổ sung chỉ biết sau khi xử lý lại; không cam kết đạt 300 cho mọi lựa chọn bằng cách đổi nhãn nguồn.
