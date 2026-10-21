# Kế hoạch xây kho bài tập theo grade

**Mục tiêu:** đọc từng bài nguồn → tìm mọi đoạn phù hợp từng grade → kiểm và nhập toàn bộ đoạn đạt vào kho offline. Màn quiz triển khai sau.

Hiện có **37.629 file hợp lệ; 823 đã phân tích, 36.806 chưa chạy**. Lô 14 bài chỉ dùng kiểm hồi quy.

## Quy trình cho từng file

```text
Với từng file trong catalog nguồn:
    Đọc toàn bộ bản nhạc hoặc dùng cache còn hợp lệ
    Xác định các dòng piano, cấu hình tay và biên đơn vị nhạc
    Liệt kê mọi đoạn liên tục giữa các biên hợp lệ
    Với từng đoạn và từng cấu hình tay hợp lệ:
        Kiểm mọi profile của G1–G8 trên toàn đoạn
        Nếu đạt: xuất đoạn, đối chiếu nguồn và MuseScore
        Đếm nốt, xếp nhóm độ dài, lưu bài và tất cả profile đạt
        Nếu thiếu bằng chứng/lỗi: lưu trạng thái và lý do
    Lưu tiến độ và số lượng kết quả của file
```

**Xét mọi cặp biên hợp lệ**, kể cả đoạn chồng lấn và các câu vốn liên tiếp. Không giới hạn một đoạn/file, lấy top N, chọn đại diện hoặc dừng khi đủ quota.

Biên phải có căn cứ theo [quy tắc phân đoạn](GENERATION_RULES.md#boundaries), bảo toàn lấy đà, kết câu, tie/slur, rest, âm giữ và pedal. Hai tay dùng cùng biên. Số nốt hoặc vạch ô không tự chứng minh hết câu.

## Năm bước triển khai

| Bước | Việc phải làm | Đầu ra và điều kiện hoàn thành |
|---|---|---|
| **K1 Đọc toàn kho** | Đọc 37.629 file, dùng cache đúng phiên bản, có resume. Kiểm lại 295 trường hợp từng bị từ chối. | Mọi nguồn có kết quả: đọc được, lỗi file hoặc chưa hỗ trợ, kèm lý do. |
| **K2 Hoàn thiện tiêu chí G1–G8** | Kiểm quãng, nhịp, bè/tay, đường ngón, ký âm và trọng tâm; có ví dụ đạt/không đạt cho từng rule. | Rule có phiên bản và sự kiện nốt chứng minh. Điều kiện chưa xác định trả về cần xem xét. |
| **K3 Quét mọi đoạn** | Xét toàn bộ dòng piano, cấu hình tay, cặp biên hợp lệ và profile. Cache đặc điểm đã đọc. | Mọi đoạn được phân loại đạt/không đạt/cần xem xét; đầu vào là catalog toàn kho. |
| **K4 Kiểm và nhập kho** | Đối chiếu nguyên tác → MusicXML → native MuseScore/timeline/glyph. Đếm nốt, xếp độ dài; thử ABC và kiểm nhập lại. | Bài có ID, nguồn/biên/tay, bằng chứng grade, định dạng/hash và kết quả kiểm. |
| **K5 Tổng kiểm và đóng gói** | Đối soát từng nguồn/đoạn; kiểm bỏ sót; thống kê grade × profile × tay × độ dài. | Catalog theo phiên bản, số thực và phần còn thiếu. Chạy lại không nhân đôi; thêm nguồn chỉ xử lý phần mới/thay đổi. |

## Các grade cần xét

Đây là bảng tóm tắt; điều kiện đầy đủ lấy từ [GRADE_DESIGN.md](GRADE_DESIGN.md#rules). Mỗi grade có nhiều profile riêng, không chỉ xét quãng lớn nhất.

| Grade | Trọng tâm cần có trong đoạn |
|---|---|
| G1 | Nốt lặp và bước liền, một tay/vị trí quen; nhánh nhịp cơ bản riêng. |
| G2 | Quãng 3 xen bước liền; hoặc cặp móc đơn trên cao độ G1 ở profile riêng. |
| G3 | Quãng 4–5 trong mẫu giai điệu/hợp âm rải có căn cứ; đường ngón phù hợp. |
| G4 | Vị trí/giọng mới hoặc chuyển vị trí thật; xét riêng hai yêu cầu này. |
| G5 | Hai tay chung nhịp, giai điệu và đệm thưa; kiểm cả các nốt đang giữ. |
| G6 | Nhảy quãng 6–8 có chuẩn bị và đường tay hợp lệ. |
| G7 | Nhịp chấm dôi, tie, đảo phách hoặc 6/8 trên mẫu cao độ quen; mỗi họ xét riêng. |
| G8 | Đọc ở vùng đàn mới và tổ hợp kỹ năng đã học; chỉ nhận tổ hợp có profile cụ thể. |

Grade là thiết kế Pianist có căn cứ tham chiếu, chưa được chứng minh tối ưu. Bài phải có trọng tâm thực, không tự gắn tất cả grade cao hơn.

**Độ dài:** 4/6/10/20/30/50/100 nốt tương ứng **3–5 / 6–8 / 9–14 / 15–24 / 25–39 / 40–69 / 70–120** lần đánh. Đếm sau kiểm native rồi xếp nhóm; không cắt câu cho đủ số. Hợp âm ba phím tính ba target; tie nối không thêm lần đánh.

## Định dạng lưu được đề xuất

**Ưu tiên mỗi bài một file `<id>.abc`**, dùng converter gốc đã tích hợp trong app. MXL nguồn giữ một bản trong kho gốc để truy xuất và build lại. Catalog nhỏ chứa grade/profile, tay, số nốt, nguồn/biên, định dạng và hash; hồ sơ kiểm chứng đầy đủ giữ ở kho build.

Đo cùng 14 đoạn G1–G2 hiện có, chỉ tính nội dung ký âm:

| Định dạng | Tổng byte |
|---|---:|
| MusicXML | 70.806 |
| MXL nén từ chính các đoạn đó | 16.204 |
| ABC | 2.680 |

[Kết quả đo](../../artifacts/curriculum-bank-format-review/size-comparison.json): 14 đoạn ngắn một tay chuyển đi/về thành công, chưa kiểm lại native ở phép đo này. Không suy tỷ lệ cho toàn kho. Riêng snapshot/SVG của 14 bài chiếm 584.475 byte.

Web tải ABC và metadata, dùng luồng ABC → MusicXML → MuseScore để tạo sheet/timeline; tải trước và cache bài sắp tập. Đo cả độ trễ và runtime; không kèm toàn bộ snapshot/SVG/hồ sơ kiểm chứng trong gói mặc định.

ABC phải giữ cao độ, onset, trường độ/nhả phím, bè/tay, nhịp, repeat và pedal khi nhập lại. [xml2abc](https://wim.vree.org/svgParse/xml2abc.html) và [kiểm thử dự án](../ABC_CONVERTER_RESULTS.md) có giới hạn đã biết. Đoạn đạt grade nhưng ABC mất dữ liệu vẫn lưu `<id>.mxl`. Đây là đề xuất, chưa đổi catalog/app.

## Quy tắc để mở rộng mà không mất chất lượng

- Tự nhập mọi đoạn đủ bằng chứng/kiểm tra; chỉ trường hợp chưa xác định cần xem xét thêm. Bỏ yêu cầu mọi đoạn phải có tên trong danh sách nhập tay.
- `segmentByRests` chỉ đề xuất biên. Kiểm phương pháp trên mẫu có tham chiếu trước khi dùng rộng; không tự coi mọi đề xuất là câu hoàn chỉnh.
- Một nội dung có thể có nhiều profile/xuất xứ. Giữ các đoạn chồng lấn đạt chuẩn; đánh dấu nhóm gần giống để tránh lặp lúc tập.
- Lỗi từng file/đoạn được ghi riêng; có checkpoint để tiếp tục. Kiểm chống bỏ sót bằng cách đối chiếu bộ quét với liệt kê mọi cặp biên trên fixture nhỏ.

**Bàn giao:** báo cáo quét toàn kho, catalog bài đạt và hàng chờ có lý do. Tách số nội dung độc lập, số nhãn grade và nhóm gần giống. Ô thiếu phải có kết quả quét giải thích; hoàn thành bộ quét chưa đồng nghĩa mọi grade đã đủ bài.
