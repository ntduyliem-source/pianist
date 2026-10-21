# Script quét nguồn tự động

Ngày 21/10/2026. Script đã có ở [auto-curriculum.py](../../buildscripts/pianist/auto-curriculum.py). Đầu vào là catalog/cache K1; không yêu cầu điền biên, grade hoặc ngón cho từng tác phẩm. Bản hiện tại bổ sung bằng chứng máy có thể đối soát, điểm cắt trong ô và phân đoạn theo rest; chưa hoàn tất K3 toàn kho hoặc K4 xuất MXL.

## Logic bằng lời

1. Đi qua từng nguồn trong catalog. Nguồn chưa đọc được ở K1 giữ nguyên lý do; nguồn có dữ liệu nhạc được nạp một lần và kiểm hash.
2. Với mỗi dòng đơn âm, gộp chuỗi tie thành một lần đánh cho bước phân tích. Dùng **nguyên code LBDM của MTCExtractFeatures** tính thay đổi quãng, khoảng giữa các lần đánh và khoảng nghỉ. Đầu ra là độ mạnh biên sau từng nốt.
3. Giữ các cực đại dương làm đề xuất, thêm đầu/cuối nguồn và đầu/cuối nhóm do `music21.analysis.segmentByRests` trả về. Giữ đúng thời gian phân số của cả điểm trong ô; không làm tròn. Đọc nhịp vẫn theo pha ô/phách gốc.
4. Đề xuất cấu hình tay, rồi dùng routing nguyên bản của PianoPlayer với kiểm khóa nhạc/chéo tay/bè cùng tay. Ghi đây là cấu hình tập được kiểm về cấu trúc, không giả là nhãn tay của tác giả. Hai tay dùng giao các điểm cắt để giữ chung thời gian.
5. Xét **mọi cặp biên** trong phạm vi 3–120 lần đánh, gồm cả đoạn chồng lấn. Không có hạn ngạch số đoạn mỗi nguồn hoặc top-N. Kiểm nốt giữ/tie/slur/pedal, sau đó đối chiếu đủ 25 profile K2.
6. Với profile còn khả năng đạt, dùng bằng chứng máy: mode ghi trong nguồn hoặc hai bộ tìm giọng music21 đồng thuận và khớp hóa biểu; gợi ý ngón từ PianoPlayer rồi kiểm thế năm ngón cố định, tie và ngón ghi sẵn. Máy không tạo người duyệt giả. Bằng chứng bị sửa hoặc gắn sai nguồn/đoạn/profile sẽ không được nhận.
7. Tách `contentPassedProfiles` khỏi `readyForNativeProfiles` và `approvedForPractice`. Đoạn lấy trọn phạm vi nguồn hoặc trọn tất cả nốt của các dòng được chọn, có biên ô và không lỗi toàn vẹn, có thể vào hàng kiểm native sau khi đạt grade. Đoạn con chỉ có biên do mô hình dự đoán vẫn cần căn cứ ngữ cảnh; không tự gắn nhãn trọn câu.
8. Lưu ứng viên, lý do bị loại và điều kiện còn thiếu; cache theo nguồn/phân tích/code/rule. PianoPlayer chạy một lần trên mỗi dòng/tay rồi dùng lại cho các đoạn. Hash nguồn/phân tích kiểm trước/sau lượt quét; kiểm ngữ cảnh được dùng lại trong lượt. Nhiều worker chạy song song; lỗi/timeout được ghi riêng. Chạy lại kiểm hash rồi dùng cache hợp lệ.

Các phép loại sớm chỉ dùng đúng điều kiện số tay, quãng, hóa biểu và nhịp của K2, có event/ngữ cảnh chứng minh. Các profile còn khả năng được chạy qua code K2 nguyên bản. Test đối chiếu đủ 25 profile và các ngữ cảnh bị loại xác nhận không đổi trạng thái; cache trong lượt giữ nguyên cả verdict và các nốt làm bằng chứng.

## Thuật toán gốc và phạm vi

- [MTCExtractFeatures](https://github.com/pvankranenburg/MTCExtractFeatures/blob/faf310528ee27cfc1f60aaacb10c9545eaa0b301/src/mtc_to_seqs.py), commit `faf310528ee27cfc1f60aaacb10c9545eaa0b301`: lấy nguyên chín thân hàm LBDM, giữ trọng số/công thức; giấy phép MIT đi kèm tại `third_party/curriculum-sources/mtc-lbdm/`.
- [LBDM, Cambouropoulos (2001)](https://quod.lib.umich.edu/i/icmc/bbp2372.2001.021/): mô hình đề xuất biên từ sự thay đổi của giai điệu. Điểm số không phải xác suất chính xác hoặc chứng nhận hết câu.
- [Chứng từ code gốc](../../third_party/curriculum-sources/mtc-lbdm/UPSTREAM.json) ghi source hash, commit, từng hàm và hash; test kiểm thân hàm vẫn khớp. Wrapper chỉ đổi dữ liệu đầu vào/mapping về nốt nguồn và lựa chọn cực đại; không tự viết lại công thức.
- [PianoPlayer](https://github.com/marcomusy/pianoplayer/tree/6fb0e2114d7b21f75c0be5208172e1243a57323e), MIT: giữ nguyên `hand.py`, `models.py`, metadata và hàm routing; [chứng từ từng file/hàm](../../third_party/curriculum-sources/pianoplayer/UPSTREAM.json). Không sửa hàm chi phí hoặc tìm ngón. Adapter gộp tie, giữ ngón nguồn, kiểm tọa độ phím và ánh xạ kết quả về event gốc.
- music21 **10.5.0**: `KrumhanslSchmuckler` và `AardenEssen` phân tích cả vùng có cùng ngữ cảnh hóa biểu. Chỉ nhận dự đoán trưởng khi hai kết quả đồng thuận và khớp hóa biểu; bất đồng giữ review. Đây là chính sách chọn kết quả mô hình, không xác suất đúng đã được hiệu chuẩn.
- `Segmenter.getSegmentsList` nguyên bản music21 bổ sung đề xuất trước/sau rest hoặc đổi clef. Một rest riêng lẻ không chứng minh hết câu. Bằng chứng lưu nhóm event, phiên bản và hash code gốc.

Ngón do máy đề xuất được phân biệt với ngón trong nguồn. Phạm vi tự kiểm hiện là thế năm ngón cố định; chuyển vị trí, nhảy xa, ngón thay thế, ngữ cảnh hợp âm/mô-típ G3 và đọc vùng đàn G8 chưa tự được chứng nhận. Điểm chi phí của PianoPlayer không phải điểm khó hoặc ngưỡng sinh lý. `modeled-bpm-scope` chỉ ghi lần chạy tại **60 BPM nốt đen** (40 BPM đen chấm dôi ở 6/8), không tuyên bố người học đã chơi được hoặc đây là tốc độ tối ưu.

Không dùng hồ sơ Mary hoặc danh sách `reviewed-units.v2.json` trong bước quét. Danh sách bảy nguồn của lượt thử chỉ chọn những nguồn được chạy; không truyền các điểm cắt cũ vào thuật toán.

## Kết quả bản có bằng chứng máy

[Receipt và hash](k3-machine-evidence/verification.json) ghi **39/39 nguồn quét xong, không lỗi**, gồm bảy nguồn pilot và 32 nguồn khác được chọn theo thứ tự hash từ tập K1 không có blocker. Đây là thử tích hợp, chưa phải quét đủ 37.629 nguồn.

| Kết quả | Số lượng |
|---|---:|
| Đoạn ứng viên đã xét | 10.828 |
| Lượt kiểm 25 profile | 270.700 |
| Đoạn còn khả năng đạt ít nhất một profile | 379 |
| Đoạn qua tiêu chí nội dung với bằng chứng máy | 73 |
| Đoạn đủ điều kiện chuyển sang kiểm native | 1 |
| Bài đã xuất MXL/duyệt phát hành trong bước này | 0 |

73 đoạn vẫn có chồng lấn và chưa qua K4; không gọi là 73 bài độc lập đã sẵn sàng tập. Trong đó có 39 nhãn G1, 13 G2, 7 G4, 4 G5 và 15 G7; một đoạn có thể khớp nhiều profile. G3/G6/G8 chưa có bài được tự nhận qua bộ bằng chứng hiện tại.

Chạy lại dùng cache **39/39**, giữ nguyên số lượng/kết quả. **124 test đều qua**, gồm so code upstream, so gợi ý ngón với lời gọi trực tiếp cho cả hai tay, giữ tie/ngón nguồn, không bỏ bè cùng tay, bảo toàn pha nhịp tại biên trong ô, chống sửa bằng chứng và phát hiện mutation trước khi lưu.

Một nguồn nhịp 2/2 từng chạm timeout 180 giây. Dùng chung phép kiểm giảm còn 121,547 giây; đưa điều kiện meter/hóa biểu K2 lên lọc sớm còn **20,016 giây trong lượt cuối**. Đối chiếu đủ **6.446 ID ứng viên và 161.150 trạng thái profile** với bản trước xác nhận kết quả không đổi. Không sửa thuật toán PianoPlayer hoặc đổi 2/2 thành 4/4 để qua grade.

Các file kiểm tại `artifacts/curriculum-k3-evidence/`; kết quả quét cuối ở `final/`. Chưa chạy K3 toàn kho, chưa có catalog MXL mới hoặc thay đổi màn tập/web online trong bước này.

## Lượt thử đầu trước khi có bằng chứng máy — lưu lịch sử

Trên bảy nguồn thật đã dùng ở pilot trước: **7/7 quét được, 290 ứng viên, 7.250 lượt kiểm profile; 193 ứng viên chưa bị loại bởi ít nhất một profile**. Điểm cắt giờ do mô hình đề xuất, nên số này không cùng định nghĩa với 40 lựa chọn Mary đã xét bằng tay.

Chạy lại dùng cache đủ **7/7** nguồn, giữ nguyên kết quả. Bộ kiểm Python có **108 test đều qua**, gồm đối chiếu code gốc, gộp tie, không làm tròn biên, polyphony, parity với K2 và kiểm nguồn/cache qua worker thật. [Receipt của lượt thử](auto-script/verification.json).

**193 là số ứng viên, không phải 193 bài tập được duyệt.** Ở lượt thử đầu này chưa có bộ tạo bằng chứng máy cho tay/giọng/ngón. Số bài được phát hành là 0.

`reviewNeeds` gom những loại bằng chứng còn thiếu để chọn việc cần làm tiếp. LBDM có thể đề xuất nhầm hoặc bỏ sót; thử kỹ thuật không thay thế kiểm độ đúng phân câu trên toàn kho piano.

## Đối chiếu biên với nguồn đã kiểm

`audit-curriculum-boundaries.py` đối chiếu kết quả quét với hồ sơ cũ mà không đưa các hồ sơ đó vào scanner. Phải tách **14 đơn vị accepted-local-pilot** và **5 đơn vị pending**; không dùng cả 19 làm mẫu dương. Các hồ sơ do assistant kiểm, chưa có giáo viên kiểm và không gán nhãn hết mọi điểm của bản nhạc, nên chỉ báo số đơn vị tìm lại được; không suy ra precision/độ chính xác toàn kho.

LBDM riêng tìm lại đủ hai biên của **8/14** đơn vị accepted; khi bổ sung phân đoạn rest tìm lại **12/14**. Hai đơn vị còn thiếu là mô-típ E–F–G của Czerny và mô-típ đầu Frère Jacques. Không thêm riêng tọa độ hai bài vào bộ quét để làm đẹp kết quả. Điểm cắt trong ô vẫn cần K4 kiểm layout/clock/native trước khi trở thành bài tập.

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
| `report.json` | Số nguồn, ứng viên, đoạn khớp tiêu chí nội dung, đoạn đủ điều kiện chuyển sang kiểm native và nhóm bằng chứng còn thiếu. |
| `source-outcomes.json` | Trạng thái/lý do cho từng nguồn trong lượt chạy. |
| `scans/<source-sha>.json.gz` | Đề xuất LBDM/rest, thời gian cắt chính xác, trace giọng/ngón/tay, mọi đoạn được xét và kết quả từng profile. |

Script chưa xuất mỗi ứng viên thành MXL hoặc nhập thư viện web. Theo quyết định ngày 21/10/2026, K4 sẽ lưu mỗi bài đã qua kiểm bằng một file MXL, bỏ bước chuyển ABC. Trước đó cần hoàn thiện bằng chứng tự động về biên/tay/ngữ cảnh/grade và chạy K3 trên toàn catalog; xem [việc triển khai tiếp theo](GRADED_BANK_PLAN.md#việc-triển-khai-tiếp-theo). Không đưa kho MXL gốc vào trình duyệt.
