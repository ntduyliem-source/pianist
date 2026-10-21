# K3 — kho MXL đã xuất

Ngày 21/10/2026. **Đã xử lý hết hàng nguồn có dữ liệu K1; chưa đạt đủ quota.** Trạng thái máy: `source-queue-exhausted`.

Có **5.284 file MXL** đã qua đối chiếu với nguồn, kiểm MuseScore và renderer; **9/56 lựa chọn** đạt tối thiểu 300. Còn **47 lựa chọn thiếu**, tổng thiếu **11.570 lượt bài theo ô**. Không dùng số vượt 300 của một ô để bù ô khác.

## Số bài thực tế

| Grade | ~4 | ~6 | ~10 | ~20 | ~30 | ~50 | ~100 | Tổng | Ô đủ 300 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| G1 | 159 | 83 | 32 | 15 | 0 | 0 | 0 | 289 | 0/7 |
| G2 | 127 | 124 | 97 | 64 | 11 | 2 | 1 | 426 | 0/7 |
| G3 | 112 | 136 | 175 | 210 | 174 | 62 | 3 | 872 | 0/7 |
| G4 | 300 | 301 | 313 | 313 | 302 | 301 | 323 | 2153 | 7/7 |
| G5 | 0 | 3 | 0 | 1 | 0 | 0 | 0 | 4 | 0/7 |
| G6 | 126 | 222 | 300 | 301 | 236 | 158 | 33 | 1376 | 2/7 |
| G7 | 16 | 19 | 5 | 8 | 4 | 0 | 0 | 52 | 0/7 |
| G8 | 47 | 21 | 19 | 15 | 4 | 5 | 1 | 112 | 0/7 |

Mốc độ dài đếm lần đánh thực: 3–5 / 6–8 / 9–14 / 15–24 / 25–39 / 40–69 / 70–120. Tie không thêm lần đánh. Không thêm nốt hoặc lặp đoạn để đủ độ dài.

## Phạm vi nguồn

- Tổng catalog: 37.629 nguồn. K1 có dữ liệu phân tích cho 17.926 nguồn.
- K3 xử lý hoàn tất: 17.926; còn cần xử lý lại: 0. Đã xử lý lại xong cả 21 nguồn vượt thời gian ở lượt đầu.
- 19.703 nguồn chưa vào K3: 19.627 chưa đủ căn cứ nhận diện phần piano; 26 lỗi nhập music21; 28 quá thời gian K1; 10 vượt giới hạn nốt; 12 chưa hỗ trợ số staff. Đây không phải kết luận tất cả các file này hỏng.

## Đối soát

- 5.284 MXL và hồ sơ kiểm tra đều qua audit; catalog, SQLite, số lượng theo 56 ô và thư mục file khớp nhau. Không có file thừa/thiếu trong thư mục đầu ra hoặc MXL trùng byte.
- MXL tổng cộng **6.898.367 byte**, khoảng **6,90 MB**; có **5.020 nhóm motif**. Đây chưa phải toàn bộ dung lượng hồ sơ/cache.
- **139 kiểm thử Python đạt**. Receipt lưu hash log, định danh pipeline, hash catalog và kết quả audit. Audit kiểm file/hồ sơ đã gắn với kết quả nguồn/MuseScore; không phải một lượt đánh giá âm nhạc độc lập mới.
- Nguồn cuối `A Paixão` hoàn tất, không bổ sung bài: cả 73 ô nhịp có `text-direction-review`. Nguồn chứa tên hợp âm/lời ca dưới dạng chỉ dẫn chữ; bộ lọc hiện tại giữ để xem xét, không kết luận bản nhạc hỏng và không tự xóa các chỉ dẫn đó.

## Phần còn thiếu

**Điều tra bổ sung:** [bộ nhận diện nguồn đang bỏ sót dữ liệu](PIANO_SOURCE_DIAGNOSIS.md). Trong 18.784 file trống tên nhạc cụ ở XML, 18.770 vẫn có metadata MuseScore ghi Piano. Chúng bị chặn trước khi xét grade. Trạng thái hết hàng nguồn ở lượt này chỉ áp dụng cho dữ liệu được bộ nhận diện cũ cho qua, chưa chứng minh đã khai thác hết kho nhạc.

Chạy lại cùng dữ liệu và cùng tiêu chí không tự tạo thêm bài cho 47 ô thiếu. Muốn đạt quota phải giải quyết các nguồn chưa nhận diện piano hoặc bổ sung nguồn phù hợp từng ô; nếu sửa phạm vi grade hay cách xử lý ký hiệu thì cần phiên bản mới và kiểm lại. Không tiếp tục quét vòng quanh những nguồn đã hoàn tất.

Ví dụ, G5 hiện yêu cầu hai dòng/tay cùng điểm vào, giai điệu trong vùng C–G và đệm tối đa một lần đánh mỗi ô, giữ ít nhất hai phách đen. Nhánh này không nhận đệm hợp âm hoặc bass rải dày. Đây là giới hạn nội dung của chính sách hiện tại, không phải lỗi file và không được nới ngầm để đủ 300.

## Cách tính và giới hạn

- Chỉ file MXL đã ghi, qua kiểm nguồn/native/render, có hồ sơ ràng buộc hash mới được tính. Staging và các lô thử cũ không tính vào kho này.
- Đoạn trùng nội dung được gộp; các đoạn chồng lấn vẫn có thể tồn tại. Nhóm motif được lưu để bước chọn bài trên web tránh lặp gần nhau.
- Không tìm hoặc tự thêm ngón. Grade hiện tại là tiêu chí nội dung đọc nhạc; không chứng nhận thế tay, BPM người học hay câu nhạc đã được giáo viên duyệt.
- Biên xuất đúng ô nhịp và có tín hiệu nguyên tác/Segmenter/LBDM; không chặt theo một số nốt cố định. Tín hiệu mô hình không bảo đảm câu nhạc hoàn chỉnh về mặt giảng dạy.
- Tiêu chí, nguồn thuật toán và lệnh chạy: [kế hoạch hiện hành](GRADED_BANK_PLAN.md). Kết quả K1/K2 lịch sử được giữ riêng.

## Tài nguyên

- MXL: `artifacts/curriculum-prepared/releases/reading-options-v1/exercises/<id>.mxl`.
- Catalog/checkpoint: `catalog.json`, `progress.json`, `bank.sqlite` trong cùng thư mục release.
- Hồ sơ từng bài: `proofs/<id>.json.gz`; cache xét từng nguồn: `scans/`.
- [Receipt kết quả](k3-bank/verification.json) lưu đủ 56 ô, phần thiếu, thống kê nguồn và mã từ chối.
- Chưa tích hợp kho này vào quiz/web; editor và logic chấm khi chơi không thay đổi.
