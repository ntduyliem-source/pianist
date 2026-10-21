# Q3 — trích đoạn nguyên bản và bộ lọc grade

Triển khai ngày 21/10/2026. **Đây là pipeline offline tạo ứng viên, không phải quiz đã bật trên web và chưa phải kho bài được duyệt sư phạm.** Logic chấm BPM, trường độ và pedal hiện có không thay đổi.

## Phạm vi đã code

- Duyệt cửa sổ ở biên ô với nhiều độ dài; giới hạn tìm kiếm 4–64 lần đánh dự kiến, không cố định bốn ô. Ô kết chỉ có phần nối của tie vẫn được xét. Không thêm ô nghỉ rỗng để tăng số biến thể.
- 14 profile cho G1–G8: hướng đi theo từng họ nhịp, quãng 3, cặp móc đơn riêng, hình triad với quãng 4/5, vị trí mới, hai tay với bass thưa, bước nhảy có chuẩn bị, chấm dôi, tie qua phách, đảo phách, 6/8 và vùng phím khác. Mỗi điều kiện loại độc lập có mã; bài không có kỹ năng trọng tâm không lấp vào kho của grade mới.
- 21 đề xuất vị trí tay có bảng **cao độ được viết → ngón**, không suy ngón từ một khoảng MIDI. Đường chuyển vị trí chỉ đi giữa các bảng đã khai báo, có điều kiện nốt dài/lặng và thời gian chuẩn bị tại BPM tối đa. Các bảng này chưa được xác nhận phù hợp cho mọi bàn tay.
- Nhận diện dấu hóa bằng cách viết nốt và quãng music21. Bộ lọc không coi C–C♯ là bước liền, không nhận giọng thứ đã khai báo vào profile trưởng; mode không được nguồn khai báo vẫn để `unconfirmed`.
- Chặn hợp âm/đa âm trong một dòng, bè chéo staff, tie/nốt giữ/pedal/slur bị cắt, spanner chưa khép, octave shift chưa có profile, lấy đà/ô không đủ, đổi nhịp/khóa/hóa biểu/tempo trong câu, tuplet và biểu cảm/kỹ thuật chưa có profile. Fingering gốc mâu thuẫn với đề xuất tay cũng bị chặn.
- Lưu exact hash, motif chuẩn hóa chuyển vị và nhóm cửa sổ chồng lấn. Quy tắc gần trùng là ≥50% độ dài của đoạn ngắn hơn, cùng nguồn và tập dòng; dùng nhóm liên thông nên có thể gộp rất chặt một chuỗi cửa sổ trượt. Đây là cấu hình chống đếm phồng, không phải ngưỡng khoa học.

Các profile/range/BPM là **thiết kế sản phẩm cần duyệt**, dựa trên [căn cứ grade](GRADE_DESIGN.md); không phải cấp chứng chỉ hay liều tập đã được nghiên cứu xác nhận. Nhánh hợp âm đồng thời, đổi vai tay ở G5, giọng thứ, 8va và câu ghép chưa được bật.

## Hai lớp đối chiếu độc lập

`MXL gốc → Q2/music21 → lựa chọn dòng + ô → MusicXML trích đoạn → music21 đọc lại → MuseScore native → createTimeline hiện có`

Khi bỏ dòng không tập, một note thông thường được thay bằng `forward` giữ nguyên duration; một thành viên chord bị bỏ không làm dịch cursor. `backup`, `forward` và divisions gốc được giữ. Đây là phép chiếu XML trên thời gian đã đọc bởi music21, không phải bộ tính timing từ XML mới. Khóa, hóa biểu, nhịp và tempo đang có hiệu lực được mang vào đầu đoạn; layout trang nguồn được bỏ để MuseScore dàn lại. Bản gốc không sửa.

1. **Đối chiếu nguồn:** nốt/rest được chọn giữ cao độ, cách viết, onset, duration, tie, articulation và notation. Thời gian từng ô, tempo, khóa/hóa biểu/nhịp và phân vùng dòng phải khớp sau dịch mốc về 0. Có map event/dòng nguồn → event/dòng trích đoạn. Tách bè trái không làm mất thông tin tay chỉ vì nó trở thành staff 1 trong XML mới.
2. **Đối chiếu native:** dùng nguyên [gate Q2](../../packages/exercise-generator/source-verification.ts) và harness đã có; kiểm note/rest/voice/staff/tie, key, meter, pedal và chronology. Số `N` cuối cùng lấy từ `createTimeline`, không lấy số phần tử `<note>` hoặc bộ đếm Python. Native có blocker hoặc N ngoài 4–64 thì loại.

Source có lỗi ở ô khác chỉ được phục hồi khi đoạn sạch được xuất lại và qua cả hai lớp này. Warning không định vị được không bị xóa bằng suy đoán. Chưa có chứng nhận bảo toàn toàn bộ biểu cảm trình diễn: các profile đầu không chấm dynamics, và context dynamics trước đoạn chưa được đưa thành dữ liệu luyện. Vì vậy trạng thái vẫn là **ứng viên cần duyệt câu nhạc**.

Các API upstream được dùng là [music21 Interval](https://music21.org/music21docs/moduleReference/moduleInterval.html), `Chord.isMajorTriad/isMinorTriad`, importer Q2 đã khóa phiên bản; phép chiếu giữ quy tắc cursor của [MusicXML forward/backup](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/forward/). Phân loại grade và gộp trùng là quy tắc chọn nội dung của Pianist; không được gắn nhãn thuật toán chấm điểm lấy từ upstream.

## Kết quả pilot

Số liệu có thể kiểm lại trong [coverage.json](q3/coverage.json) và [verification.json](q3/verification.json). Bảng cập nhật sau lần native cuối của pipeline này.

<!-- Q3_COUNTS_START -->
**528 nguồn đã quét → 1,368 cửa sổ qua bộ lọc → 177 trích đoạn đại diện → 177/177 khớp native.** Không có lỗi ở phép chiếu nguồn hoặc gate native trong tập này.

| Grade | Đoạn khớp native | Nhóm sau gộp gần trùng | File nguồn | Thiếu so với pilot 100 |
|---|---:|---:|---:|---:|
| G1 | 10 | 10 | 8 | 90 |
| G2 | 21 | 21 | 17 | 79 |
| G3 | 12 | 12 | 11 | 88 |
| G4 | 101 | 100 | 58 | 0 |
| G5 | 3 | 3 | 1 | 97 |
| G6 | 1 | 1 | 1 | 99 |
| G7 | 5 | 5 | 5 | 95 |
| G8 | 30 | 27 | 19 | 73 |

G4 đạt số lượng nhóm pilot; điều này chưa đồng nghĩa đã duyệt giáo trình. Hiện **0 profile bật, 0 bài được duyệt để tập, 0 bài mới phát hành công khai**. Đã chạy **64 kiểm thử Python, 137 kiểm thử web, 20 fixture native và dựng 112 sheet để duyệt**; các fixture là bài tự soạn kiểm phần mềm, không cộng vào kho nhạc thật.
<!-- Q3_COUNTS_END -->

Số nhóm tác phẩm **đã xác minh** vẫn là 0: nhiều file hoặc nhiều title không chứng minh là nhiều tác phẩm độc lập. Nguồn trùng hash giữ đủ các origin, không chọn tùy tiện một tên. Số liệu của các grade không cộng thành tổng câu độc lập vì một đoạn có thể phù hợp nhiều profile.

## Bổ sung nguồn có mục tiêu

Sau pilot 334 nguồn, dùng metadata trong kho Q1 để tìm thêm 196 nguồn piano chưa chuẩn hóa theo các từ như Beyer, Czerny, Duvernoy, Gurlitt, beginner, easy, Twinkle, Ode to Joy. Tên chỉ thu hẹp hàng đợi, không quyết định grade. 194 nguồn chuẩn hóa thêm thành công; hai nguồn bị chặn. Tổng Q2 hiện xử lý 823/37.629 file hợp lệ, 528 chuẩn hóa; 36.806 file chưa phân tích. Các native receipt toàn nguồn Q2 trước đó vẫn chỉ có 334; các nguồn mới được kiểm native ở mức trích đoạn trong Q3.

Q2 nhận thêm `--source-list` chứa SHA256 lấy từ review queue; hash ngoài queue bị từ chối. 627 bản ghi Q2 trước đó được kiểm không đổi; chỉ bổ sung bản ghi mới. Không tải lại archive, không sửa Q1, không dùng nhãn `easy` để bỏ qua bộ lọc.

Các grade thiếu phải tuyển thêm đúng quãng/hướng, tay, họ nhịp và vùng đàn ghi trong `source-gaps.json`. Ví dụ có nhiều đoạn stepwise không bù được việc thiếu quãng 6–7–8; một bản nhạc có 50 cửa sổ chồng lấn cũng không được gọi là 50 nội dung độc lập.

## Trạng thái duyệt và dữ liệu

`scores/curriculum/grades.v1.json` hiện có `enabled:false`. `CorpusFragmentCandidate` trong [corpus-model.ts](../../packages/exercise-generator/corpus-model.ts) tách khỏi `Fragment` đã duyệt của Q0. Mọi trích đoạn có `review.status=pending`, `acceptedForPractice=false`, `teacherReviewed=false`; việc khớp MuseScore không tự đổi các cờ này.

Đầu ra ở `artifacts/curriculum-fragments/` (không commit nội dung nhạc tải về):

| File | Vai trò |
|---|---|
| `grades.v1.json` | Cấu hình và đề xuất template dùng trong đúng lần scan |
| `scan.json`, `candidates.v1.json` | Định danh nguồn, ứng viên, lý do, pipeline version |
| `fragments/<id>/excerpt.musicxml` | Trích đúng dòng/ô nguồn; không chuyển vị hoặc ghép câu |
| `fragments/<id>/analysis.json` | Dữ liệu đầy đủ của Q2: events, contexts, ties, tempo… |
| `fragments/<id>/fragment.json` | Provenance, map dòng/event, profile witness, hash và native receipt |
| `fragments.v1.json` | Chỉ mục những đoạn đã khớp native, vẫn chờ duyệt nội dung |
| `rejected.jsonl` | Quyết định loại theo cửa sổ/profile |
| `projection-rejected.json`, `native-rejected.json` | Lỗi ở hai lớp đối chiếu |
| `coverage.json`, `source-gaps.json` | Độ phủ thật và thiếu hụt so với chỉ tiêu |
| `review-queue.json` | Lấy mẫu phân tầng tối đa 30/grade; báo thiếu, không tạo mẫu giả |

Cache gắn source hash + Q2 analysis hash + dependency/rules/code version. Cache hỏng phải dựng lại; đọc Q1/Q2 ở chế độ read-only trong Q3. Native receipt phải khớp engine/verifier/input và snapshot hash. Finalize đọc lại nguồn, chạy lại verdict profile và phép chiếu; không tin riêng nhãn accept trong một file JSON sửa tay.

## Chạy lại

Tại root repo, sau khi có Q1/Q2 và native build đang phục vụ trên localhost:8787:

```powershell
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/fragment-curriculum.py scan --per-grade 100 --workers 4
node tests/browser/pianist/q2-native.cjs --jobs artifacts/curriculum-fragments/jobs.json --report artifacts/q3-native/report.json
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/fragment-curriculum.py finalize
node tests/browser/pianist/q3-review.cjs
```

Trang xem mẫu cục bộ: `http://127.0.0.1:8787/q3-review/index.html`. Đây là SVG MuseScore thật kèm nguồn, số nốt, dòng đã chọn và profile; không phải route quiz của sản phẩm. Trang này chỉ hỗ trợ kiểm hình/nguồn, không tự ghi quyết định duyệt.

```powershell
.tools/curriculum-python/Scripts/python.exe buildscripts/pianist/prepare-q3-fixtures.py
node tests/browser/pianist/q2-native.cjs --jobs artifacts/q3-fixtures/jobs.json --report artifacts/q3-fixtures/report.json
.tools/curriculum-python/Scripts/python.exe -m unittest discover -s tests/curriculum -v
npm.cmd --prefix apps/pianist-web test
npm.cmd --prefix apps/pianist-web run build
```

## Điều chưa hoàn tất của Q3

Chỉ tiêu pilot là 100 nhóm đoạn/grade; kho đầy đủ cần 1.000 nhóm gần trùng, 50 tác phẩm đã xác minh và 100 motif/grade. Thiếu nguồn và duyệt nội dung là phần việc còn lại, không được gọi là đạt bằng nhân bản chuyển quãng tám. Cần duyệt câu/tiểu câu và ngón cho từng họ mới, tối thiểu 30 mẫu phân tầng/grade khi đủ nguồn; không có nhãn “giáo viên đã duyệt” trong đợt này.

Q4 chọn/chuyển vị theo seed, Q5 hàng đợi sheet, Q6 luồng BPM liên tục và UI quiz vẫn chưa triển khai ở mốc này. MIDI thật và HTTPS không thuộc lần nghiệm thu này.
