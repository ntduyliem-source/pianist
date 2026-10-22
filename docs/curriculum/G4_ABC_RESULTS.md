# Kết quả bộ 700 bài G4 bằng ABC

Hoàn thành ngày 22/10/2026 theo [kế hoạch G4](G4_ABC_COMPOSITION_PLAN.md) và [đặc tả hai khuông](GRAND_STAFF_BANK_PLAN.md). Đầu ra: [hướng dẫn và bảy tập ABC](../../scores/composed/g4-abc/README.md), [gói 700 bài](../../scores/composed/g4-abc-700.zip).

| Nhóm | Số bài | Upper / lower / span | Số nốt thực | Dài nhất ở 60 BPM |
|---|---:|---:|---:|---:|
| n4 | 100 | 50 / 30 / 20 | 3–5 | 8 giây |
| n6 | 100 | 50 / 30 / 20 | 6–8 | 8 giây |
| n10 | 100 | 50 / 30 / 20 | 9–14 | 12 giây |
| n20 | 100 | 50 / 30 / 20 | 15–24 | 18 giây |
| n30 | 100 | 50 / 30 / 20 | 26–38 | 36 giây |
| n50 | 100 | 50 / 30 / 20 | 40–69 | 54 giây |
| n100 | 100 | 50 / 30 / 20 | 70–120 | 90 giây |

Tổng 350 bài vùng cao, 210 bài vùng thấp, 140 bài mở span quãng tám và 20.673 lần đánh phím. Mỗi nhóm có 30 phải dẫn, 30 trái dẫn, 25 đối đáp, 15 cùng nhịp; tổng 210/210/175/105 theo vai.

Upper dùng G4–D5 ở RH hoặc G3–D4 ở LH; lower dùng A3–E4 hoặc A2–E3; span dùng C4–C5 hoặc C3–C4. Tay phụ giữ vùng G1 và lặp/bước liền. Mỗi bài có nốt mới ngoài vùng cũ hoặc một đường đi liên tục phủ đủ 12 bán cung. Mọi bước tối đa quãng năm, không tritone jump; nghỉ và chỗ ghép không miễn kiểm quãng. Toàn vùng LH thấp hơn toàn vùng RH, nên không nhận trùng phím/chéo vùng dù hai tay trao lượt.

Giữ hóa biểu C, nhịp cơ bản và phối hợp đã biết. Không thêm móc đơn, hợp âm đồng thời trong một tay, nhiều bè, tie, đảo phách, đổi khóa/giọng hoặc pedal. Nhãn vùng là ràng buộc ký âm/cao độ, không chứng nhận ngón hay thế tay tối ưu. Đây là G4 nội bộ Pianist.

Nguồn gồm 300 bài ngắn ghi nguyên văn và 400 bài có trình tự riêng từ 209 đoạn được sử dụng trong `buildscripts/pianist/compositions/g4/`. [Công cụ đóng gói](../../buildscripts/pianist/package-g4-abc.py) không quyết định nốt, chuyển vị, lựa ngẫu nhiên hoặc sửa nhạc. Bài dài có hai, ba hoặc năm đoạn; dùng chung đoạn/chuyển vai là các biến thể được công khai, không phải 700 ý nhạc độc lập.

700 nội dung khác nhau, không trùng hoàn toàn với G1–G3. Có 461 dấu vết chuẩn hóa theo cao độ bắt đầu từng tay và chuyển vai; dấu vết chỉ mô tả các mẫu liên quan. Không có hai bài cùng dấu vết chuẩn hóa liền nhau trong tập. Không bài dài nào chỉ là vòng một hoặc hai ô lặp nguyên xi.

1.400 lượt chuyển đổi đạt: 700 file riêng và từng vị trí trong bảy tập. Dùng abc2xml đã ghim cùng bộ đọc MusicXML độc lập từ G1, mở bảng tên nốt của bộ đọc cho đủ A–G. Đối chiếu octave thực, cao độ, onset, trường độ, nghỉ và staff; mọi bài ra một part piano với hai staves. Khi converter không ghi biểu diễn staff im lặng trọn một ô nội bộ, bộ kiểm chỉ bổ sung đúng khoảng nghỉ ngầm định đó để so với nghỉ được viết; không dùng để che mất nốt hoặc thiếu nghỉ một phần ô.

[Kiểm hồi quy](../../buildscripts/pianist/check-g4-abc.py) đạt bảy test, gồm 30 trường hợp nhạc sai bị từ chối: thiếu vị trí mới, ra ngoài vùng khai báo, thiếu đầu thấp/cao của span, nhảy quãng tám/sáu/tritone, nhảy qua nghỉ/vạch ô, span bị ngắt bởi nghỉ, sai octave ABC, tay phụ ra vùng hoặc nhảy quãng ba, hai tay trùng/chéo vùng, móc đơn, trắng sai phách, thiếu/thừa phách, tay im lặng, hợp âm, dấu hóa, tie, đối đáp chồng tiếng, cùng nhịp lệch thời gian hoặc chỉ lặp một cao độ mới. Có ca đạt xác nhận `c=C5`, `A,=A3`, `A,,=A2` và đường `C G c` phủ quãng tám bằng hai bước nhỏ hơn.

[Mục lục](../../scores/composed/g4-abc/index.tsv) có nhánh, vai, tay trọng tâm, số nốt, nhịp và vị trí trong tập. [JSON](../../scores/composed/g4-abc/validation.json) có vị trí nốt mới hoặc đường MIDI phủ quãng tám, nguồn đoạn và dấu vết. ZIP có 700 file riêng, bảy tập, README, TSV và JSON; tập gộp không tính thêm bài. X 2101–2800 nối tiếp ba bộ trước.

Phạm vi bàn giao là ABC văn bản và kiểm cấu trúc/chuyển đổi. Chưa có giáo viên duyệt, thử nghiệm hiệu quả học hoặc render từng bài trong native MuseScore. Kho đang phục vụ trên web và bộ chấm không thuộc lần bàn giao này.
