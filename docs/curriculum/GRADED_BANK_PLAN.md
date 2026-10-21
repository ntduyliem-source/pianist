# Kho MXL theo grade × độ dài

Cập nhật 21/10/2026 theo yêu cầu mới: **mỗi lựa chọn độ dài trong mỗi grade phải có tối thiểu 300 bài**. Có 8 grade × 7 độ dài = **56 ô**, tối thiểu 16.800 lượt bài trong các ô. Không dùng tổng của grade để bù ô thiếu.

## Cách chạy

1. Lấy từng nguồn đã đọc ở K1; kiểm hash nguồn và dữ liệu phân tích.
2. Tìm mọi đoạn phù hợp trong nguồn cho các ô còn thiếu. Biên có tín hiệu từ nguyên tác, music21 Segmenter hoặc LBDM upstream. Chỉ xuất biên đúng ô nhịp ở phiên bản này; điểm trong ô không bị làm tròn.
3. Kiểm đúng nội dung từng profile: nốt, quãng có cách viết, tiết tấu theo pha phách, âm vực, đủ bè của tay đã chọn, nốt giữ/tie/slur và ngữ cảnh. Không gọi bộ tìm ngón.
4. **Xuất ngay từng đoạn đạt thành MXL**, đọc lại chính file đó bằng music21, đối chiếu mọi sự kiện với nguồn, rồi mở bằng MuseScore để kiểm timeline và glyph. Không chờ quét hết kho mới xuất.
5. Chỉ MXL qua mọi kiểm tra, không trùng nội dung đã lưu, mới được tính vào ô grade × độ dài. Giữ toàn bộ đoạn đạt của nguồn đang xử lý nên ô có thể vượt 300.
6. Xong một nguồn thì lưu checkpoint. **Dừng khi cả 56 ô đạt 300**, hoặc hết hàng nguồn hữu hạn. Ô đủ được bỏ khỏi lượt tìm tiếp theo. Nếu hết nguồn vẫn thiếu, báo từng ô thiếu và lý do; không lặp nốt, đổi tên hay nới rule để lấp số.

K1 có 37.629 kết quả; 17.926 nguồn có phân tích để xét tiếp. 19.703 nguồn còn lại có lỗi/giới hạn hoặc chưa xác định phần piano, không tự biến thành bài tập. Nguồn có phân tích vẫn có thể bị loại khi trích đoạn. Chưa tuyên bố 56 ô đã đủ trước kết quả chạy.

## Grade đang dùng

Bộ kiểm đọc nhạc mới ở [reading-bank.v1.json](../../scores/curriculum/reading-bank.v1.json), dùng lại các phép kiểm ký âm/nhịp của 25 profile [V3](../../scores/curriculum/grades.v3.json). Thay đổi phạm vi được ghi rõ: **grade nội dung đọc nhạc, không chứng nhận thế tay, ngón tối ưu hay BPM người học**. Logic chấm khi chơi của web không đổi.

| Grade | Nội dung phải có; các giới hạn cũ về nhịp/giọng vẫn áp dụng |
|---|---|
| G1 | Một dòng C–G vùng C4 tay phải/C3 tay trái; có bước liền, tối đa quãng 2; R0/R1/R2 riêng. |
| G2 | Quãng 3 xen bước liền trên R0–R2; hoặc cao độ G1 với cặp móc đơn R3. |
| G3 | Có quãng 4–5 trong vùng quen. Nhánh hợp âm rải cần nhóm ba nốt liền được music21 nhận là triad; không suy chức năng hòa âm. |
| G4 | Vùng mới ngoài C–G, span tối đa quãng 5; hoặc span rộng hơn quãng 5 đến quãng 8, vẫn chỉ bước/quãng tối đa 5. Chưa gọi đây là đường chuyển ngón đã kiểm. |
| G5 | Hai dòng/tay đồng thời; giai điệu và đệm thưa, bass tối đa một lần đánh mỗi ô, giữ ít nhất hai phách đen; không chéo tay hoặc bỏ bè khó. |
| G6 | Có nhảy quãng 6, 7 hoặc 8 theo nhánh/hướng cụ thể, sau đó có mẫu bước/quãng nhỏ; không chứng nhận kỹ thuật nhảy tại một BPM. |
| G7 | R4 chấm dôi / R5 tie / R6 đảo phách / R7 nhịp 6/8, mỗi họ riêng, trên cao độ quen tối đa quãng 3. |
| G8 | Có nốt ở/vượt dòng kẻ phụ thứ ba, span cục bộ tối đa quãng 5; hoặc hai tay với giai điệu cặp móc đơn và đệm thưa. G4 không nhận yêu cầu vùng kẻ phụ xa này. |

**Không tìm ngón:** số ngón vốn có trong MXL được giữ nguyên; không thêm hoặc sửa. Không cần máy đoán được tonic khi nguồn không ghi mode: lưu là không xác định, vẫn kiểm hóa biểu và mọi dấu hóa. Mode thứ ghi rõ vẫn nằm ngoài bộ profile V3 hiện tại. Đây là thay đổi phạm vi minh bạch, không giả hồ sơ giáo viên hay bằng chứng mô hình.

**Biên đoạn:** nguồn-start/end, slur/section gốc, điểm Segmenter/LBDM trùng chính xác biên ô, kèm kiểm không cắt đứt ký âm. Tín hiệu mô hình là heuristic lựa chọn đoạn đọc, không bảo đảm mỗi đoạn là một câu nhạc hoàn chỉnh theo giáo viên. Catalog ghi `teacherReviewedPhrase: false`; không đổi nhãn này để tăng số. Nguồn có pickup, repeat, pedal hoặc ký hiệu chưa hỗ trợ được ghi lý do, không âm thầm xóa.

## 56 lựa chọn cần đủ bài

Mỗi hàng G1–G8 có cùng các cột sau, **mỗi cột tối thiểu 300 bài**:

| Lựa chọn | Số lần đánh thực chấp nhận |
|---|---|
| Khoảng 4 | 3–5 |
| Khoảng 6 | 6–8 |
| Khoảng 10 | 9–14 |
| Khoảng 20 | 15–24 |
| Khoảng 30 | 25–39 |
| Khoảng 50 | 40–69 |
| Khoảng 100 | 70–120 |

Đếm bằng timeline MuseScore hiện có sau khi mở MXL; tie không thêm lần đánh. Không chặt/kéo dài đoạn để đạt mốc. Tay/profile được thống kê riêng; quota hiện tại là **grade × độ dài**, không nhân thêm theo tay.

Mốc 300 và các nhóm độ dài là yêu cầu thu thập/sản phẩm, **không phải liều luyện đã được khoa học chứng minh**. [Căn cứ nghiên cứu/giáo trình](GRADE_DESIGN.md#evidence) chỉ hỗ trợ nguyên tắc phân tách yêu cầu và giữ ngữ cảnh; không xác nhận những ngưỡng này là tối ưu.

## Lệnh và đầu ra

```powershell
.tools/curriculum-python/Scripts/python.exe -X utf8 buildscripts/pianist/prepare-reading-bank.py --workers 8 --min-per-option 300
```

Đối soát riêng các file đã ghi (có thể chạy trong lúc xuất):

```powershell
.tools/curriculum-python/Scripts/python.exe -X utf8 buildscripts/pianist/audit-reading-bank.py
```

Lệnh audit kiểm snapshot đã commit trong SQLite, file MXL, hash hồ sơ, bằng chứng native/render và cách đếm từng ô; không nhận file còn ở staging hoặc suy số bài từ số ứng viên.

- Mỗi bài: `artifacts/curriculum-prepared/releases/reading-options-v1/exercises/<id>.mxl`.
- Chỉ mục: `catalog.json` trong cùng thư mục; lưu grade/profile, tay, độ dài, nguồn, ô nhịp, hash.
- Số thực từng ô và phần thiếu: `progress.json`, trường `verifiedUniqueByOption` và `remainingByOption`.
- Checkpoint: `bank.sqlite`; bằng chứng từng bài: `proofs/<id>.json.gz`; biên/từ chối từng nguồn: `scans/` và bảng `sources`.
- `staging/` chỉ là file chờ kiểm; **không tính là bài đạt**. Các lô thử cũ giữ riêng, không cộng vào quota.

Có thể tạo file `STOP_AFTER_SOURCE` trong thư mục release để dừng sạch sau nguồn đang làm; xóa đúng file này rồi chạy lại để tiếp tục. Không dùng lệnh quét/kill cây tiến trình. Chạy lại kiểm MXL, proof và cấu hình; không nhân đôi bài. Thêm nguồn qua K1 rồi chạy lại với cùng rule; thay rule phải có phiên bản kho mới.

Nội dung trùng chính xác được gộp dù khác file/tên/số ngón. Các biến thể chuyển giọng được gắn nhóm motif riêng để không gọi là ý nhạc độc lập. Đoạn chồng lấn vẫn có thể được lưu theo yêu cầu lấy mọi đoạn phù hợp; tránh gặp liên tiếp các đoạn gần giống thuộc bước chọn bài trên web sau này.

K3 và K4 nay chạy nối tiếp trên từng nguồn. K5 đối soát file/catalog và 56 ô sau lượt chạy. Màn quiz/tích hợp catalog lên web là bước sau; lệnh này không sửa editor, scoring, server hay bản online.
