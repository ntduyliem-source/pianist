# Thử quy trình K3 trên một bài thật

Ngày 21/10/2026. Đây là thử nghiệm một nguồn để xem quy trình; chưa phải K3 toàn kho hoặc một bản phát hành bài tập.

## Nguồn và việc đã làm

**Mary Had a Little Lamb**, arrangement by Tinashe Nyamukapa; nguồn [MuseScore 191215](https://musescore.com/user/200832/scores/191215), đã có trong kho PDMX local. SHA MXL `721d9c271afdda9cc586368dd7b11f02b6db57eaf83a130607f0c1419213a1fc`.

- Nạp cache K1, kiểm SHA nguồn/phân tích và snapshot MuseScore đã dùng để xem cả bản gốc.
- Bản này có 8 ô 4/4, 26 lần đánh tay phải và 32 lần đánh tay trái; giữ cả hai khuông trong phần xem nguồn.
- Gọi đúng `music21.analysis.segmentByRests.Segmenter.getSegmentsList`. Mỗi tay chỉ ra **1 chuỗi** vì không có rest. Thuật toán này không tự đưa ra các biên câu/mô-típ bên trong bài.
- Xét ngữ cảnh và ghi rõ review của assistant cho biên, cấu hình tay, ngón/vị trí và giọng. Không phải giáo viên duyệt; BPM 60 là phạm vi thử kỹ thuật local, chưa phải tốc độ học đã chứng minh hoặc kiểm đàn thật.
- Liệt kê đủ **36 khoảng ô × 3 cấu hình tay = 108 lựa chọn**, kể cả khoảng chưa có quyết định biên; chạy nguyên 25 bộ tiêu chí K2 tạo **2.700 verdict**.
- Chiếu mọi lựa chọn đạt local về MusicXML, đọc lại bằng music21, kiểm event gốc rồi đối chiếu độc lập qua native MuseScore. Không sửa rule K2 hoặc kernel chấm khi tập.

## Biên được xét trong nguồn cụ thể

| Phần | Biên local có căn cứ | Phạm vi nhận định |
|---|---|---|
| Tay phải | Đầu bài; hết ô 2, 4, 8 | Mô-típ E–D–C–D / E–E–E; câu mở kết E–G–G; câu đáp kết C tròn. Các biên khác chưa được chứng nhận. |
| Tay trái | Đầu và cuối từng ô | Mỗi ô là một lượt mẫu đệm C–G–E–G hoặc D–G–F–G; được xét là mô-típ đệm, không coi mỗi ô là một câu giai điệu. |
| Hai tay | Giao các biên của hai tay: đầu, hết ô 2, 4, 8 | Giữ chung thời gian và kiểm cả phần đệm. |

**48 lựa chọn có hai biên đã xét; 60 lựa chọn còn thiếu quyết định biên.** Các biên trong ô chưa nằm trong thử nghiệm này vì API K2 hiện nhận khoảng ô nguyên. Không suy rằng đã tìm ra mọi đơn vị nhạc có thể có trong tác phẩm.

Hồ sơ [mary-k3-review.json](../../scores/curriculum/examples/mary-k3-review.json) ghi từng lý do. Biên và ngón ở đó do assistant xem nguồn, không do thuật toán tự khám phá; script chỉ áp dụng hồ sơ đã có. Mỗi thao tác này cần được giải quyết rõ trước khi hứa tự nhận bài trên toàn kho.

## Kết quả thực chạy

| Kết quả kết hợp biên + grade | Lựa chọn |
|---|---:|
| Đạt tiêu chí local | 40 |
| Cần xem xét thêm | 28 |
| Không đạt bộ tiêu chí đang có | 40 |
| Tổng | 108 |

40 lựa chọn đạt gồm **6 tay phải** (2 G1, 4 G2) và **34 tay trái** (G3 hợp âm rải). Hai tay không có lựa chọn đạt: đệm bốn nốt đen mỗi ô vượt yêu cầu đệm thưa của G5; bài cũng không có mẫu hai tay móc đơn của G8. Điều đó không có nghĩa bản nhạc hai tay sai.

Chỉ có **28 nội dung nốt khác nhau** trong 40 lựa chọn; các nội dung này vẫn chồng lấn và cùng một tác phẩm. Không gọi là 40 bài độc lập hoặc tăng số đa dạng bằng nhãn grade.

| Ví dụ | Kết quả và lý do |
|---|---|
| Phải, ô 1–2, 7 lần đánh | G1 nhánh nốt dài: bước liền, nốt đen/trắng; giữ hết mô-típ E lặp. Native: 7 target, nhóm khoảng 6 nốt. |
| Phải, ô 1–4, 13 lần đánh | G2: có quãng E4–G4 xen bước liền. Native: 13 target, nhóm khoảng 10 nốt. |
| Trái, ô 1, 4 lần đánh | G3 hợp âm rải: C3–G3–E3–G3, quãng 5 trong mẫu đệm C trưởng đã xét. Native: 4 target, nhóm khoảng 4 nốt. |
| Phải, chỉ ô 1, 4 lần đánh | Một số kiểm G1 đạt nhưng biên cuối chưa được xét; kết quả vẫn cần xem xét, không phát hành vì vừa đủ 4 nốt. |
| Trái, chỉ ô 3, 4 lần đánh | D3–G3–F3–G3 không đủ bằng chứng nhóm triad theo profile arpeggio; chưa có hồ sơ nhóm melodic phù hợp, giữ review. |
| Hai tay, ô 1–4, 29 lần đánh | Có biên nhưng không đạt các profile hai tay hiện tại; không bỏ nốt phần đệm để ép G5. |

**40/40** lựa chọn đạt local khớp nguồn qua phép chiếu/đọc lại và đối chiếu MuseScore. Dựng thêm sheet/timeline cho ba ví dụ G1/G2/G3 bằng renderer thật: đủ glyph, số target đúng, editor không bị đổi. Chưa đóng gói ABC/MXL vào catalog phát hành; `publishedExercises=0`.

## Tái chạy và truy xuất

```powershell
.\.tools\curriculum-python\Scripts\python.exe -X utf8 buildscripts/pianist/demo-curriculum-song.py
node tests/browser/pianist/q2-native.cjs --jobs artifacts/curriculum-k3-one-song/jobs.json --report artifacts/curriculum-k3-one-song/native/report.json
node tests/browser/pianist/q4-prepared.cjs --jobs artifacts/curriculum-k3-one-song/render-jobs.json --out artifacts/curriculum-k3-one-song/render --inspect
```

Hai lệnh native dùng server local 8787 và bản WASM hiện có. Script đọc nguồn/cache ở chế độ chỉ đọc; kết quả ở `artifacts/curriculum-k3-one-song/`:

- `report.json`: đủ 108 lựa chọn và 25 verdict/lựa chọn.
- `rest-proposals.json`: đầu ra gốc của segmenter, version và hash module.
- `candidates/<tay>-<ô đầu>-<ô cuối>.json`: bằng chứng grade, quyết định biên, event nguồn và kết quả chiếu khi đủ điều kiện.
- `projected/<id>/exercise.musicxml`: từng đoạn đạt local; `analysis.json` đi kèm. Những đoạn này dùng minh họa, chưa nhập catalog.
- `native/report.json`, `render/report.json`: đối chiếu nguồn, target, glyph và trạng thái editor.
- `ui-check.json`: 108 lựa chọn, 25 profile, highlight nốt thật, ba sheet trích; kiểm bố cục 390/320 px.

[Receipt nhỏ đi cùng code](k3-one-song/verification.json). Dữ liệu nguồn và kết quả lớn giữ local.
