# Kết quả bộ 700 bài G3 bằng ABC

Hoàn thành ngày 22/10/2026 theo [kế hoạch G3](G3_ABC_COMPOSITION_PLAN.md) và [đặc tả hai khuông](GRAND_STAFF_BANK_PLAN.md). Đầu ra: [hướng dẫn và bảy tập ABC](../../scores/composed/g3-abc/README.md), [gói 700 bài](../../scores/composed/g3-abc-700.zip).

| Nhóm | Số bài | Fourth / fifth / arpeggio | Số nốt thực | Dài nhất ở 60 BPM |
|---|---:|---:|---:|---:|
| n4 | 100 | 50 / 30 / 20 | 3–5 | 4 giây |
| n6 | 100 | 50 / 30 / 20 | 6–8 | 8 giây |
| n10 | 100 | 50 / 30 / 20 | 9–14 | 12 giây |
| n20 | 100 | 50 / 30 / 20 | 15–24 | 18 giây |
| n30 | 100 | 50 / 30 / 20 | 26–38 | 36 giây |
| n50 | 100 | 50 / 30 / 20 | 40–69 | 54 giây |
| n100 | 100 | 50 / 30 / 20 | 70–120 | 90 giây |

Tổng 350 bài quãng bốn, 210 bài quãng năm, 140 bài hợp âm rải và 20.608 lần đánh phím. Mỗi nhóm có 30 phải dẫn, 30 trái dẫn, 25 đối đáp, 15 cùng nhịp; tổng 210/210/175/105 bài theo vai.

Giữ C major, vùng RH C4–G4/LH C3–G3 và nhịp cơ bản R0–R2 để tập trung quãng mới; đây là phần nằm trong R0–R3 được phép của G3. Fourth không vượt quãng bốn ở tay trọng tâm, fifth/arpeggio không vượt quãng năm; tay phụ chỉ lặp/bước liền. Từng bài có nốt thật ở cả hai tay, mỗi tay đơn âm. Không thêm hợp âm đồng thời, móc đơn, tie, đảo phách, đổi khóa/giọng hoặc pedal.

Bằng chứng quãng bốn/năm cần hai nốt tiếp nhau không xen nghỉ và cùng ô, đúng 5/7 bán cung. Mẫu rải cần ba nốt C/E/G khác nhau tiếp nối trong cùng ô, có quãng năm giữa hai lần đánh kề nhau; tay trọng tâm giữ trong bộ ba Đô trưởng. Vì vậy chuỗi chỉ đi quãng ba hoặc cú nhảy duy nhất qua ranh giới đoạn không đủ điều kiện. Các giới hạn quãng vẫn kiểm toàn bộ chuỗi, kể cả qua nghỉ và chỗ ghép đoạn.

Nguồn gồm 300 bài ngắn ghi nguyên văn và 400 bài có trình tự cố định từ 203 đoạn được sử dụng trong `buildscripts/pianist/compositions/g3/`. [Công cụ đóng gói](../../buildscripts/pianist/package-g3-abc.py) không quyết định cao độ, không chọn ngẫu nhiên, không chuyển vị hoặc sửa nhạc. Bài dài có hai, ba hoặc năm đoạn; các biến thể dùng chung đoạn và chuyển vai được ghi rõ, không tuyên bố 700 ý giai điệu độc lập.

700 nội dung khác nhau, không trùng hoàn toàn với G1/G2. Có 449 dấu vết chuẩn hóa theo cao độ bắt đầu từng tay và chuyển vai; dấu vết mô tả mẫu liên quan, không chứng nhận số ý nhạc độc lập. Không có hai bài cùng dấu vết chuẩn hóa nằm liền nhau trong tập. Không bài dài nào chỉ là vòng một hoặc hai ô lặp nguyên xi.

1.400 lượt chuyển đổi đạt, gồm 700 file riêng và 700 vị trí trong bảy tập. Dùng abc2xml đã ghim của repository cùng bộ đọc MusicXML độc lập từ công cụ G1 để đối chiếu nốt, nghỉ, onset, trường độ và staff; mọi bài ra một part piano và hai staves. Nếu converter bỏ biểu diễn staff im lặng trọn một ô nội bộ, bộ kiểm chỉ bổ sung đúng khoảng nghỉ ngầm định đó để so với nghỉ được viết; không dùng để che mất nốt hoặc thiếu nghỉ một phần ô.

[Kiểm hồi quy](../../buildscripts/pianist/check-g3-abc.py) đạt sáu test, gồm 24 trường hợp nhạc sai bị từ chối: thiếu trọng tâm, fifth trong nhánh fourth, quãng mới chỉ qua nghỉ/vạch ô, mẫu rải chỉ đi quãng ba/thiếu âm/ra ngoài bộ ba/qua vạch ô, tay phụ có quãng mới, móc đơn, trắng sai phách, thiếu/thừa phách, sai octave/vùng, tay im lặng, hợp âm, dấu hóa, tie, đối đáp chồng tiếng hoặc cùng nhịp lệch thời gian. Kiểm lại toàn bộ file/tập, ID X 1401–2100 và không trùng với 1.400 bài G1/G2.

[Mục lục](../../scores/composed/g3-abc/index.tsv) có nhánh, vai, tay trọng tâm, số nốt, nhịp và vị trí trong tập. [JSON](../../scores/composed/g3-abc/validation.json) có bằng chứng nốt cụ thể và nguồn đoạn theo từng bài. ZIP chứa 700 file riêng, bảy tập, README, TSV và JSON; tập gộp không tính thêm bài.

Phạm vi bàn giao là ABC văn bản và kiểm cấu trúc/chuyển đổi. Chưa có giáo viên duyệt, thử nghiệm hiệu quả học hoặc render từng bài trong native MuseScore. Grade là G3 nội bộ Pianist. Kho đang phục vụ trên web và bộ chấm không thuộc lần bàn giao này.
