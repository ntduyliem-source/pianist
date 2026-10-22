# Kết quả bộ 700 bài G1 bằng ABC

Hoàn thành bộ nội dung ngày 22/10/2026 theo [kế hoạch sáng tác](G1_ABC_COMPOSITION_PLAN.md). Đầu ra là [bộ ABC](../../scores/composed/g1-abc/README.md) và [gói ZIP](../../scores/composed/g1-abc-700.zip).

| Nhóm | Số bài | Số nốt thực | Thời lượng dài nhất ở 60 BPM |
|---|---:|---:|---:|
| n4 | 100 | 3–5 | 8 giây |
| n6 | 100 | 6–8 | 8 giây |
| n10 | 100 | 9–14 | 16 giây |
| n20 | 100 | 15–24 | 32 giây |
| n30 | 100 | 25–39 | 40 giây |
| n50 | 100 | 41–69 | 64 giây |
| n100 | 100 | 70–120 | 96 giây |

Mỗi nhóm đạt 30 bài phải dẫn, 30 trái dẫn, 25 đối đáp, 15 cùng nhịp. Tổng 20.320 lần đánh phím trong 700 nội dung riêng. Bộ kiểm loại trùng hoàn toàn trước khi đóng gói; 466 dấu vết mẫu sau chuẩn hóa ghi nhận các biến thể có liên quan, gồm các cặp chuyển vai tay. Các tập được sắp để không đặt hai mẫu chuẩn hóa giống nhau cạnh nhau.

Nguồn biên soạn là bảy bảng văn bản trong `buildscripts/pianist/compositions/g1/`: mỗi dòng ghi đầy đủ mọi ô của hai tay. `package-g1-abc.py` không chọn cao độ hoặc sinh câu nhạc; nó thêm header, bọc dòng, sắp thứ tự tập, kiểm và đóng gói những nội dung đã viết.

1.400 lượt chuyển đổi đối chiếu file riêng và vị trí trong tập gộp đều đạt. Kiểm dùng converter đã ghim của dự án cùng bộ đọc event MusicXML độc lập trong script đóng gói. Mọi nốt và thời gian nghỉ được đối chiếu; khi abc2xml bỏ biểu diễn nghỉ của một khuông im lặng trọn ô, bộ kiểm đối chiếu khoảng im lặng ngầm định đúng ô đó. Không dùng quy tắc này để chấp nhận nốt bị mất hoặc khoảng nghỉ thiếu trong ô.

Kiểm thêm chín trường hợp âm nhạc sai xác nhận bộ kiểm từ chối quãng nhảy, quãng nhảy qua nghỉ, đảo phách do đặt trắng sai phách, nốt dài sai ô, sai quãng tám, hợp âm, móc đơn, nghỉ không đúng profile và thiếu phách. Mọi ID X từ 1–700 duy nhất; file UTF-8, không có vòng lặp nguyên xi một hoặc hai ô làm toàn bộ bài dài.

Phạm vi nghiệm thu là ABC văn bản và đối chiếu cấu trúc chuyển đổi. Chưa kiểm render từng bài trong native MuseScore, chưa có giáo viên duyệt hoặc nghiên cứu hiệu quả học. Không thay kho đang phục vụ trên web hoặc sửa bộ chấm trong lần bàn giao nội dung này.
