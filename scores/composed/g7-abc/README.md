# 700 bài piano G7 — ABC văn bản

100 bài ở mỗi nhóm n4, n6, n10, n20, n30, n50, n100. G7 là grade nội bộ Pianist, không phải cấp thi ABRSM.

| Nhánh | Mỗi nhóm | Điều phải đọc được |
|---|---:|---|
| dotted | 25 | Đen chấm dôi + móc đơn: 1,5 + 0,5 phách đen |
| tie | 25 | Móc đơn ở nửa phách nối cùng cao độ qua phách kế tiếp, không đánh lại đầu nối |
| sync | 25 | Móc đơn + đen + móc đơn: 0,5 + 1 + 0,5 phách, nốt đen bắt đầu ở nửa phách |
| compound | 25 | 6/8, hai phách lớn mỗi ô, mỗi phách bằng ba móc đơn |

Mỗi nhóm có 50 bài phải và 50 bài trái làm trọng tâm. Các nhánh tiết tấu tách riêng; giai điệu chỉ dùng C4–G4 hoặc C3–G3, tối đa quãng năm. Tay phụ đơn âm đánh ở đầu ô; cả hai tay đều có nốt thật. Không thêm hợp âm hoặc nhảy quãng sáu trở lên.

Ba nhánh đầu ở 4/4, Q:1/4=60. Nhánh compound ở 6/8, **Q:3/8=60: 60 phách đen chấm dôi/phút**, tức 180 móc đơn/phút. Không áp 60 nốt đen/phút cho 6/8. `L:1/4` vẫn là đơn vị viết trong cả bộ: `C/2` là móc đơn, `C3/2` là đen chấm dôi, `C3` chiếm trọn một ô 6/8. Khi tập có thể giảm tempo.

Ví dụ `[V:RH] C D/2 E/2-E2 |]` có ba lần đánh: Đô, Rê, Mi. Mi móc đơn nối với Mi trắng; phần sau dấu `-` không tạo lần đánh mới. Dấu nối này giữ cao độ; không phải legato giữa hai nốt khác nhau.

| Thư mục | Số lần đánh hai tay, sau gộp tie |
|---|---:|
| n4 | 3–5 |
| n6 | 6–8 |
| n10 | 9–14 |
| n20 | 15–24 |
| n30 | 25–39 |
| n50 | 40–69 |
| n100 | 70–120 |

Mở file riêng hoặc bảy tập trong `books/` bằng trình đọc ABC hỗ trợ nhiều voice, `%%score`, độ dài phân số và tie. Mỗi tập có 100 tune; chọn tune tiếp theo nếu trình đọc chỉ hiện một bài. `index.tsv` có nhánh, thứ tự và thời lượng; `validation.json` ghi bằng chứng trên lưới phách. Các mốc `atQuarter` trong JSON tính từ 0 bằng đơn vị nốt đen, kể cả ở 6/8.

Khi đọc trước, xác định đơn vị phách rồi gõ tiết tấu một lần trước khi ghép cao độ nếu cần. Dùng bài chưa đọc cho lượt sight reading. 100 dòng chủ đề được viết thành bảy phiên bản độ dài, với các đoạn phát triển và biến thể chuyển tay dùng chung. Không coi đây là 700 giai điệu độc lập; tránh đọc cả bảy phiên bản cùng số liên tiếp.

Trợ lý viết các đoạn và trình tự cố định; công cụ chỉ ghép và kiểm. Đã kiểm ABC riêng và mọi tune trong tập qua MusicXML, bao gồm onset, độ dài, tie hai đầu, số lần đánh và metronome đen chấm dôi của 6/8. Chưa có giáo viên duyệt, thử nghiệm hiệu quả học hay kiểm hiển thị trên mọi phần mềm ABC.
