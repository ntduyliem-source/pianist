# Kế hoạch xây kho bài tập theo grade

**Mục tiêu:** đọc từng bài nguồn → tìm mọi đoạn phù hợp từng grade → kiểm và nhập toàn bộ đoạn đạt vào kho offline. Màn quiz triển khai sau.

**K1–K2 đã hoàn thành ngày 21/10/2026:** 37.629/37.629 nguồn có kết quả, 17.926 có dữ liệu nhạc, 19.627 cần xác định phần piano, 76 gặp lỗi/giới hạn hỗ trợ; không còn file chờ. Bộ tiêu chí V3 có 25 profile G1–G8. Xem [báo cáo và bằng chứng](K1_K2_RESULTS.md). Bước tiếp theo là **K3 quét mọi đoạn**; lô 14 bài cũ chỉ dùng kiểm hồi quy.

**Đã có script tự quét theo lô:** [AUTO_SCRIPT.md](AUTO_SCRIPT.md) dùng nguyên LBDM của MTCExtractFeatures để đề xuất biên mà không nhập hồ sơ từng bài, rồi kiểm K2 với cache/resume. Lượt kiểm hiện tại: 39 nguồn, 10.828 đoạn ứng viên, 73 đoạn khớp tiêu chí nội dung, một đoạn chuyển được sang hàng kiểm native; chưa có bài MXL mới được phát hành và chưa hoàn tất K3/K4 toàn kho.

**K3 đã bổ sung:** điểm cắt chính xác trong ô, phân đoạn rest bằng music21, bằng chứng máy riêng cho routing/tay/giọng/ngón cố định và đối chiếu với code PianoPlayer gốc. Grade nội dung đạt chưa đồng nghĩa bài đã qua kiểm biên/native. Biên mô hình tìm lại 12/14 đơn vị accepted trong tập tham chiếu cũ; K3 toàn kho còn chưa hoàn tất.

**Quyết định định dạng ngày 21/10/2026:** theo yêu cầu người dùng, mỗi bài tập xuất thành MXL. Bỏ bước chuyển ABC và kiểm chuyển ngược trong quy trình xây kho này.

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
| **K4 Kiểm và nhập kho** | Trích MusicXML từ nguyên tác, đóng gói MXL; mở lại chính file MXL bằng MuseScore và đối chiếu timeline/glyph với đoạn nguồn. Đếm nốt, xếp độ dài. | Mỗi bài có file MXL, ID, nguồn/biên/tay, bằng chứng grade, hash và kết quả kiểm. |
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

## Việc triển khai tiếp theo

1. **Hoàn thiện điều kiện tự nhận bài ở K3.** Đã có bộ kiểm dùng chung cho biên chính xác, đủ bè thuộc tay, đồng thuận giọng và gợi ý ngón cố định từ upstream. Còn cần mở rộng/kiểm căn cứ đơn vị nhạc, chuyển vị trí/nhảy xa, ngữ cảnh nhóm G3 và vùng ký âm G8. BPM của mô hình chỉ là thông số chạy kỹ thuật, không chứng nhận tốc độ người học. Tiếp tục đối chiếu trên mẫu đã kiểm, gồm đoạn bị bỏ và đề xuất thừa; không nới tiêu chí để tăng số lượng.
2. **Chạy K3 trên toàn catalog.** Quét mọi nguồn có dữ liệu K1 bằng script, xét mọi cặp biên hợp lệ và mọi profile trong phạm vi hỗ trợ; lưu tiến độ. Hiện có 17.926 nguồn có dữ liệu, không đồng nghĩa tất cả đều đủ điều kiện xuất bài. Những nguồn cần xác định phần piano, lỗi hoặc chưa hỗ trợ phải có trạng thái và hướng xử lý riêng. Báo số đoạn đạt, không đạt và chưa đủ căn cứ theo từng grade; không đếm ứng viên thành bài hoàn chỉnh.
3. **Nối K4 để tạo kho MXL dùng được.** Xuất mọi đoạn đạt thành file riêng, mở lại bằng MuseScore và so với đoạn nguồn; chỉ bài qua kiểm mới vào catalog. Xếp nhóm 4/6/10/20/30/50/100 theo số lần đánh thực tế, giữ trọn đơn vị nhạc. K5 tổng kiểm trước khi đưa catalog lên web.

**Đầu ra cần bàn giao:** báo cáo đủ trạng thái từng nguồn, catalog theo grade/tay/độ dài, các file MXL đã kiểm và danh sách trường hợp chưa giải quyết. Số lượng công bố lấy từ kết quả chạy; không cam kết trước số bài đạt.

## Định dạng lưu đã chốt

**Mỗi bài một file `<id>.mxl`.** MXL là MusicXML nén; kho bài tập không qua ABC. MXL nguồn giữ nguyên một bản để truy xuất và build lại. Catalog nhỏ chứa grade/profile, tay, số nốt, nguồn/biên, đường dẫn MXL và hash; hồ sơ kiểm chứng đầy đủ giữ ở kho build.

Đường dẫn dự kiến cho đầu ra K4: `artifacts/curriculum-prepared/releases/<version>/exercises/<id>.mxl`, cùng `catalog.json` tại thư mục phiên bản. Đây là đích triển khai tiếp theo; script K3 hiện chỉ xuất kết quả quét, chưa tạo các file bài tập này.

Web tải MXL và metadata theo nhu cầu, dùng luồng MuseScore hiện có để tạo sheet/timeline; tải trước và cache bài sắp tập. Đo cả độ trễ và runtime; không kèm toàn bộ kho nguồn hoặc hồ sơ kiểm chứng trong gói mặc định.

Giữ MXL loại bỏ bước chuyển qua ABC, nhưng vẫn phải kiểm lỗi khi trích đoạn: cao độ, onset, trường độ/nhả phím, rest/tie/slur, bè/tay, nhịp, dấu hóa, repeat và pedal. Đối chiếu sau khi mở lại chính MXL sẽ phát hành. Chức năng nhập ABC sẵn có của thư viện/editor nằm ngoài thay đổi định dạng kho này.

## Quy tắc để mở rộng mà không mất chất lượng

- Tự nhập mọi đoạn đủ bằng chứng/kiểm tra; chỉ trường hợp chưa xác định cần xem xét thêm. Bỏ yêu cầu mọi đoạn phải có tên trong danh sách nhập tay.
- `segmentByRests` chỉ đề xuất biên. Kiểm phương pháp trên mẫu có tham chiếu trước khi dùng rộng; không tự coi mọi đề xuất là câu hoàn chỉnh.
- Một nội dung có thể có nhiều profile/xuất xứ. Giữ các đoạn chồng lấn đạt chuẩn; đánh dấu nhóm gần giống để tránh lặp lúc tập.
- Lỗi từng file/đoạn được ghi riêng; có checkpoint để tiếp tục. Kiểm chống bỏ sót bằng cách đối chiếu bộ quét với liệt kê mọi cặp biên trên fixture nhỏ.

**Bàn giao:** báo cáo quét toàn kho, catalog bài đạt và hàng chờ có lý do. Tách số nội dung độc lập, số nhãn grade và nhóm gần giống. Ô thiếu phải có kết quả quét giải thích; hoàn thành bộ quét chưa đồng nghĩa mọi grade đã đủ bài.
