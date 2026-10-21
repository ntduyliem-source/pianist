# Script quét nguồn tự động

Ngày 21/10/2026. Script đã có ở [auto-curriculum.py](../../buildscripts/pianist/auto-curriculum.py). Đầu vào là catalog/cache K1; không yêu cầu điền biên, grade hoặc ngón cho từng tác phẩm.

## Logic bằng lời

1. Đi qua từng nguồn trong catalog. Nguồn chưa đọc được ở K1 giữ nguyên lý do; nguồn có dữ liệu nhạc được nạp một lần và kiểm hash.
2. Với mỗi dòng đơn âm, gộp chuỗi tie thành một lần đánh cho bước phân tích. Dùng **nguyên code LBDM của MTCExtractFeatures** tính thay đổi quãng, khoảng giữa các lần đánh và khoảng nghỉ. Đầu ra là độ mạnh biên sau từng nốt.
3. Giữ các cực đại dương làm đề xuất, thêm đầu/cuối nguồn. Mọi đề xuất trong ô được ghi lại; bản đầu chỉ đưa điểm trùng chính xác mép ô vào bộ xét K2 hiện có, không làm tròn điểm cắt sang ô gần nhất.
4. Đề xuất cấu hình tay theo khóa nhạc; ghi rõ đây là giả thuyết. Hai tay dùng giao các điểm cắt để giữ chung thời gian. Những voice khác cùng tay còn chưa được xác nhận vẫn bị K2 giữ lại để xét.
5. Xét **mọi cặp biên** trong phạm vi 3–120 lần đánh của bản đầu, gồm cả đoạn chồng lấn. Không có hạn ngạch số đoạn mỗi nguồn hoặc top-N. Kiểm nốt giữ/tie/slur/pedal, sau đó đối chiếu đủ 25 profile K2.
6. Lưu ứng viên, lý do bị loại và điều kiện còn thiếu; cache theo nguồn/phân tích/code/rule. Nhiều worker chạy song song; một file lỗi hoặc timeout có bản ghi riêng và không làm mất phần đã xong. Chạy lại kiểm hash rồi dùng cache hợp lệ.

Các phép loại sớm chỉ dùng đúng điều kiện số tay và quãng của K2, có event chứng minh. Các profile còn khả năng được chạy qua code K2 nguyên bản. Test đối chiếu trên đủ 25 fixture profile xác nhận không đổi trạng thái so với gọi toàn bộ K2.

## Thuật toán gốc và phạm vi

- [MTCExtractFeatures](https://github.com/pvankranenburg/MTCExtractFeatures/blob/faf310528ee27cfc1f60aaacb10c9545eaa0b301/src/mtc_to_seqs.py), commit `faf310528ee27cfc1f60aaacb10c9545eaa0b301`: lấy nguyên chín thân hàm LBDM, giữ trọng số/công thức; giấy phép MIT đi kèm tại `third_party/curriculum-sources/mtc-lbdm/`.
- [LBDM, Cambouropoulos (2001)](https://quod.lib.umich.edu/i/icmc/bbp2372.2001.021/): mô hình đề xuất biên từ sự thay đổi của giai điệu. Điểm số không phải xác suất chính xác hoặc chứng nhận hết câu.
- [Chứng từ code gốc](../../third_party/curriculum-sources/mtc-lbdm/UPSTREAM.json) ghi source hash, commit, từng hàm và hash; test kiểm thân hàm vẫn khớp. Wrapper chỉ đổi dữ liệu đầu vào/mapping về nốt nguồn và lựa chọn cực đại; không tự viết lại công thức.

Không dùng hồ sơ Mary hoặc danh sách `reviewed-units.v2.json` trong bước quét. Danh sách bảy nguồn của lượt thử chỉ chọn những nguồn được chạy; không truyền các điểm cắt cũ vào thuật toán.

## Kết quả thử tự động

Trên bảy nguồn thật đã dùng ở pilot trước: **7/7 quét được, 290 ứng viên, 7.250 lượt kiểm profile; 193 ứng viên chưa bị loại bởi ít nhất một profile**. Điểm cắt giờ do mô hình đề xuất, nên số này không cùng định nghĩa với 40 lựa chọn Mary đã xét bằng tay.

Chạy lại dùng cache đủ **7/7** nguồn, giữ nguyên kết quả. Bộ kiểm Python có **108 test đều qua**, gồm đối chiếu code gốc, gộp tie, không làm tròn biên, polyphony, parity với K2 và kiểm nguồn/cache qua worker thật. [Receipt của lượt thử](auto-script/verification.json).

**193 là số ứng viên, không phải 193 bài tập được duyệt.** K2 vẫn yêu cầu bằng chứng ngữ cảnh/ngón/BPM và các giả thuyết tay/biên cần kiểm. Script không điền tên người duyệt hoặc tự đặt trạng thái đạt để vượt các điều kiện đó. Số bài được phát hành ở bước này là 0.

Việc còn lại cần giải quyết theo từng nhóm quy tắc/thuật toán và kiểm trên tập tham chiếu, thay vì bắt buộc viết một hồ sơ tay cho từng tác phẩm. `reviewNeeds` gom những loại bằng chứng còn thiếu để chọn việc cần làm tiếp. LBDM có thể đề xuất nhầm hoặc bỏ sót; lượt thử này kiểm tích hợp kỹ thuật và hồi quy, chưa đo được độ chính xác phân câu trên toàn kho piano. Chưa hoàn tất K3/K4.

## Chạy

```powershell
# Toàn catalog; mọi nguồn có trạng thái, nguồn có cache K1 được quét:
.\.tools\curriculum-python\Scripts\python.exe -X utf8 -u buildscripts/pianist/auto-curriculum.py --workers 4

# Thử một tập nguồn có SHA rõ ràng:
.\.tools\curriculum-python\Scripts\python.exe -X utf8 -u buildscripts/pianist/auto-curriculum.py --source-list artifacts/curriculum-boundary-research/trial-sources.json --output artifacts/curriculum-auto-trial --workers 4
```

`--source-list` nhận JSON `{ "sourceHashes": ["sha256", ...] }`. Bỏ tùy chọn này để đi toàn kho. `--limit 0` là mặc định toàn bộ nguồn; timeout mặc định 180 giây/nguồn là giới hạn tài nguyên, không phải hạn ngạch ứng viên. File timeout được thử lại ở lượt sau; không ghi là đã quét thành công. Có lỗi thì CLI trả mã lỗi sau khi lưu những nguồn còn lại.

Kết quả mặc định tại `artifacts/curriculum-auto/`:

| File | Nội dung |
|---|---|
| `report.json` | Số nguồn, đoạn ứng viên, lượt kiểm và nhóm bằng chứng còn thiếu. |
| `source-outcomes.json` | Trạng thái/lý do cho từng nguồn trong lượt chạy. |
| `scans/<source-sha>.json.gz` | Các đề xuất LBDM theo từng nốt, cấu hình tay giả định, mọi đoạn được xét và kết quả từng profile. |

Script chưa xuất mỗi ứng viên thành ABC/MXL hoặc nhập thư viện web. Công việc đó chỉ nên làm cho nội dung qua các bước kiểm tiếp theo. Không đưa kho MXL gốc vào trình duyệt.
