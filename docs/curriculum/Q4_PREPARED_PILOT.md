# Q4 — lô bài tập sinh sẵn đầu tiên

Ngày nghiệm thu: **21/10/2026**. Đã bổ sung nền v2 cho Q0–Q2 và chạy nhánh Q3–Q4 từ nhạc thật đến catalog cố định: **14 bài G1–G2 từ 6 file nguồn**, có MusicXML, sheet MuseScore, timeline theo phách, bằng chứng nguồn/biên/grade và hash từng tài nguyên.

Đây là **kho mẫu local để kiểm đường build**. Màn chọn grade/độ dài và quiz chuyển bài liên tục Q5–Q7 chưa được tích hợp; bản online chưa thay đổi. Chưa hoàn tất Q3–Q4 cho mọi grade hoặc toàn bộ kho nguồn.

[Gói ZIP 294.566 byte](../../artifacts/curriculum-prepared/pianist-q4-g1-g2-pilot.zip) · [Bằng chứng kiểm tra](q4/verification.json) · [Manifest local](../../artifacts/curriculum-prepared/manifest.json).

## 1. Kết quả có thể kiểm lại

| Nội dung | Kết quả |
|---|---:|
| Đơn vị đã xét / file nguồn đã xem ngữ cảnh | 19 / 7 |
| Bài nhận vào pilot / file nguồn của bài nhận | 14 / 6 |
| G1 / G2 | 7 / 7 |
| Tay phải / tay trái / hai tay | 12 / 2 / 0 |
| Nội dung chính xác / motif hash khác nhau | 14 / 12 |
| Cặp chồng lấn cùng dòng nguồn | 4 |
| Đơn vị pending/bị loại | 5 |
| Phân tích Q2 cũ được giữ lại sau migration | 823 |

14 bài không có nghĩa 14 trải nghiệm độc lập: ba mô-típ Czerny có quan hệ chuyển vị; các đoạn Mary có phần chồng nhau. Catalog giữ `exactHash`, `motifHash`, nguồn và span để Q5 chọn bài có thể tránh lặp. Chưa dùng ID cụm thay đổi theo kho làm định danh lịch sử.

| Nhóm độ dài mỗi bài | Khoảng nhận | Số bài |
|---|---:|---:|
| Khoảng 4 | 3–5 | 1 |
| Khoảng 6 | 6–8 | 6 |
| Khoảng 10 | 9–14 | 6 |
| Khoảng 20 | 15–24 | 0 |
| Khoảng 30 | 25–39 | 1 |
| Khoảng 50 | 40–69 | 0 |
| Khoảng 100 | 70–120 | 0 |

Các khoảng là cấu hình sản phẩm trong [length-buckets.v2.json](../../scores/curriculum/length-buckets.v2.json), không phải liều lượng đã được khoa học chứng minh. Chọn đơn vị nhạc trước, đếm target bằng score-adapter hiện có sau khi kiểm native, rồi mới xếp nhóm. Không cắt câu cho vừa số nốt.

## 2. Từng bài trong lô

| Bài/đoạn nguồn | Grade | Tay | Target | Loại đơn vị |
|---|---:|---|---:|---|
| Czerny — mô-típ C–D–E | G1 | Phải | 6 | Mô-típ |
| Czerny — mô-típ D–E–F | G1 | Phải | 6 | Mô-típ |
| Czerny — mô-típ E–F–G | G1 | Phải | 6 | Mô-típ |
| Mary — mô-típ mở đầu | G1 | Phải | 7 | Mô-típ |
| Mary — câu kết | G1 | Phải | 13 | Câu |
| Twinkle — câu đáp đầu | G1 | Phải | 7 | Câu |
| Twinkle — câu giữa | G1 | Phải | 7 | Câu |
| Frère Jacques — mô-típ mở đầu | G2 | Phải | 4 | Mô-típ |
| Mary — câu đầu | G2 | Phải | 13 | Câu |
| Mary — toàn bộ giai điệu | G2 | Phải | 26 | Giai điệu hoàn chỉnh |
| Five Finger 1 — câu tay phải | G2 | Phải | 9 | Câu |
| Five Finger 1 — câu tay trái | G2 | Trái | 9 | Câu |
| Five Finger 2 — câu tay phải | G2 | Phải | 12 | Câu |
| Five Finger 2 — câu tay trái | G2 | Trái | 12 | Câu |

Tên trên là nhãn đoạn để đọc báo cáo. SHA nguồn, metadata xuất xứ, dòng/bè, ô bắt đầu/kết thúc và event ID nằm trong [reviewed-units.v2.json](../../scores/curriculum/reviewed-units.v2.json) và từng `exercise.json`. “Giai điệu hoàn chỉnh” không có nghĩa giữ cả phần đệm hai tay của nguồn.

G1 dùng bước liền/nốt lặp, trong một vị trí tay đã khai báo, với các nhánh tiết tấu riêng. G2 tách **quãng 3 trên nhịp đã biết** và **cặp móc đơn trên cao độ bước liền**. Bộ lọc yêu cầu có quan hệ trọng tâm thực sự trong đoạn, không chỉ một giá trị maxInterval. Xem [thiết kế grade và căn cứ](GRADE_DESIGN.md) và [5 profile đã triển khai](../../scores/curriculum/grades.v2.json).

## 3. Năm đơn vị không đưa vào gói

| Đơn vị | Lý do giữ lại ngoài pilot |
|---|---|
| Czerny, ô 13–16 | Có breath mark chưa được profile hỗ trợ; giữ ký hiệu gốc. |
| Frère Jacques, mô-típ hỏi 3 nốt | Ngón E=1/G=4 của nguồn xung đột với mẫu tay C4 đang xét. |
| Frère Jacques, bốn ô đầu | Cùng xung đột ngón nguồn; không tự ghi đè để qua lọc. |
| Ode to Joy, ba ô đầu | Cắt trước ô thứ tư kết câu; giữ cả kết câu thì gặp nhịp chấm dôi ngoài G1. |
| Five Finger 1, riêng ô đầu | Bỏ mất nốt chủ kéo dài ở ô tiếp theo; đủ 8 nốt không đủ để nhận. |

Đây là lý do không hợp **lựa chọn/profile hiện tại**, không phải kết luận tác phẩm sai. Đổi biên/profile về sau phải xét và kiểm lại; không chỉ sửa nhãn accepted.

## 4. Code gốc và phần quyết định của dự án

- **music21 10.5.0** phân tích ký âm và quãng có cách viết nốt. Hàm gốc `music21.analysis.segmentByRests.Segmenter.getSegmentsList` được gọi trên từng dòng đơn âm có Note/Rest/Clef, giữ source event ID; lưu version và SHA code. Kết quả chỉ là đề xuất theo rest/clef, không tự xác nhận câu nhạc.
- **Hồ sơ xét nội dung:** đã đọc sự kiện/ký hiệu và xem sheet nguồn đầy đủ qua MuseScore cho 7 file. Mỗi lựa chọn ghi lý do hai biên, cấu trúc nhạc, thế tay, giọng và hash ngữ cảnh có cả bè/tay lân cận. Người xét ghi rõ **Codex, vai trò assistant**, `teacherReviewed=false`; chưa có giáo viên hoặc kiểm đàn thật.
- **Quy tắc Pianist:** các điều kiện G1–G2 là hiện thực hóa đặc tả đã chốt, không tuyên bố music21 cung cấp hệ grade này. Không viết thuật toán mới tự phát hiện mọi câu nhạc hoặc tự nhận mọi đề xuất rest.
- **Kiểm nhạc:** chiếu đoạn liên tục từ nguồn → chuẩn hóa lại → đối chiếu sự kiện nguồn → native MuseScore → Worker renderer. Bài không qua kiểm giữ ngoài release.
- **Chấm thực hành:** không sửa `packages/practice-engine-v2`. Timeline dùng `createTimeline/settingsFor` hiện có. Với bài trích tay trái thành một staff, truyền vai trò tay trái rõ ràng, tránh mặc định staff đầu là tay phải.

Khoảng 40–80 BPM được kiểm kỹ thuật ở đơn vị nốt đen; không phải tốc độ học tối ưu hoặc xác nhận ergonomics trên đàn thật. Bộ nhận pilot còn bảo thủ về ký hiệu, giọng và vị trí bàn tay.

## 5. Build, kiểm và đóng gói

Các phần mới: [CLI](../../buildscripts/pianist/prepare-curriculum.py), [bộ lọc/đối chiếu](../../buildscripts/pianist/curriculum_prepared.py), [model](../../packages/exercise-generator/prepared-model.ts), [contract](../../packages/exercise-generator/prepared-contract.ts).

Chạy từ thư mục gốc repo, sau khi có corpus Q1, cache Q2 và native build hiện tại. Browser checks cần server local 8787:

```powershell
# Chỉ một lần với cache v1 đúng bộ hash đã khóa:
.\.tools\curriculum-python\Scripts\python.exe -X utf8 buildscripts/pianist/normalize-curriculum.py migrate-cache

# Xem ngữ cảnh nguồn; không tự duyệt:
.\.tools\curriculum-python\Scripts\python.exe -X utf8 buildscripts/pianist/prepare-curriculum.py inspect
node tests/browser/pianist/q4-prepared.cjs --jobs artifacts/curriculum-prepared/inspection/jobs.json --out artifacts/curriculum-prepared/inspection/render --inspect

# Sau khi hoàn tất hồ sơ xét nội dung:
.\.tools\curriculum-python\Scripts\python.exe -X utf8 buildscripts/pianist/prepare-curriculum.py prepare
node tests/browser/pianist/q2-native.cjs --jobs artifacts/curriculum-prepared/jobs.json --report artifacts/curriculum-prepared/native/report.json
node tests/browser/pianist/q4-prepared.cjs
.\.tools\curriculum-python\Scripts\python.exe -X utf8 buildscripts/pianist/prepare-curriculum.py finalize
```

`finalize` dựng lại lựa chọn từ nguồn và hồ sơ xét, kiểm pipeline/code/native/renderer hash cùng danh sách job, snapshot và số target trước khi phát hành catalog local. Mỗi release có thư mục theo hash, manifest được thay cuối cùng. Đổi nhãn hoặc lời nhận xét không đổi ID nhạc; đổi metadata có thể tạo release mới. Các release cũ được giữ lại.

Gói ZIP của lượt này chứa `manifest.json`, catalog và tài nguyên 14 bài, tổng 72 file; 1.208.808 byte trước nén, **294.566 byte sau nén**. Đã đọc lại ZIP và kiểm toàn bộ hash/kích thước tài nguyên trong catalog. Đây không phải ước lượng kích thước cho cả kho.

SHA256 ZIP: `b5d0a6d9eafbaaa65a1c27ae33e7eb6821f0382baa44280ae600c2f056a27784`.

Kho và ảnh/snapshot nằm trong `artifacts`, không đưa nhạc nguồn vào commit. Gói này dùng local; chưa đưa lên bản online.

## 6. Thêm MXL về sau

1. Giữ bản gốc ở thư mục local, chẳng hạn `examples/local/...`; thêm mục vào `local.entries` của [sources.lock.json](../../scores/curriculum/sources.lock.json), theo mẫu hiện có: ID, đường dẫn tương đối repo, bytes, SHA256, title/composer, visibility. Không khai quyền phát hành khi chưa biết.
2. Chạy `collect-curriculum.py --offline` để cập nhật catalog từ các archive đã có và nguồn local. Nếu archive khóa chưa có, cần bước tải Q1 trước.
3. Chạy `normalize-curriculum.py normalize --source-list <file.json>` với `{"sourceHashes":["<sha256>"]}`. Cache theo bytes nguồn + code/options/limits parser; đổi metadata/thêm nguồn không làm mất toàn bộ cache. Test CLI đã xác nhận thêm file thứ hai chỉ phân tích file mới.
4. Thêm lựa chọn **pending** vào reviewed-units, xuất ngữ cảnh và xem sheet nguồn. Dùng `selection_hash`/`context_evidence` để ràng buộc hồ sơ đúng nguồn/biên/profile; ghi lý do và phạm vi xét. Sửa nguồn hoặc lựa chọn thì hồ sơ cũ không còn đủ điều kiện.
5. Chạy prepare → native → Worker → finalize như trên. Xem reject và coverage; nguồn mới không hợp G1–G2 vẫn giữ trong kho nguồn, không ép xuống grade thấp.

**Giới hạn hiện tại:** cache chuẩn hóa Q2 đã hỗ trợ bổ sung; kiểm native/render Q4 còn chạy lại toàn bộ lô prepared khi build, chưa có cache bỏ qua từng bài ở tầng này. Import vào thư viện thông thường không tự chạy pipeline duyệt kho. Thêm hàng nghìn nguồn chưa đồng nghĩa tự nhận hàng nghìn bài đúng grade.

## 7. Kiểm thử và việc tiếp theo

| Kiểm | Kết quả |
|---|---|
| Python pipeline/corpus/cache/profile/CLI | 79 test qua |
| Web unit tests, gồm hồi quy bộ chấm hiện có | 141 test qua |
| TypeScript | `tsc --noEmit` qua |
| Nguồn → XML → native | 14/14 khớp |
| Worker glyph/count, editor không bị thay đổi | 14/14 qua |
| Catalog tải HTTP và hash/timeline | 14/14 qua; kiểm tại 60 BPM và hai đầu 40/80 |
| Build lại cùng input | Cùng catalog/manifest |
| Sửa giả receipt: pipeline/input/snapshot/count | Cả 4 bị chặn; release cũ giữ nguyên |

Fixture kỹ thuật: 3 nốt; 120 nốt một tay trên 5 hệ khuông; 120 nốt hai tay trên 3 hệ; pickup 3 nốt. Tất cả qua glyph/count/editor checks. **Đây là fixture kiểm renderer, không tính vào 14 bài nhạc thật**. Bộ nhận bài v2 vẫn giữ pickup/biên trong ô ngoài pilot khi chưa có hồ sơ hỗ trợ đầy đủ.

Phần còn thiếu: G3–G8, hai tay trong kho nội dung, nhóm 20/50/100 nốt, độ phủ 88 phím, quy mô lớn và duyệt chuyên môn. G1 cũng chưa có bài tay trái trong lô này. Bước tiếp theo là **Q5–Q7: cho web tải catalog, chọn grade/tay/độ dài, dựng sheet, tập đúng nốt/BPM và chuyển bài**, với kiểm nối timeline trước khi mở rộng kho. Chưa được dùng số bài lô này để hứa gần như không lặp.
