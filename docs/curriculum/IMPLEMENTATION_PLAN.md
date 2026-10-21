# Kế hoạch Q0–Q9: kho bài tập piano sinh sẵn theo grade

Cập nhật **21/10/2026 — hoàn thành K1–K2** của [kế hoạch xây kho](GRADED_BANK_PLAN.md): toàn bộ 37.629 nguồn có kết quả, 17.926 có dữ liệu nhạc; tiêu chí V3 có 25 profile G1–G8. Bước kế tiếp là K3 quét mọi đoạn. Xem [báo cáo K1–K2](K1_K2_RESULTS.md). Bản này thay kế hoạch sinh/biến đổi câu trong phiên ngày 20/10. Lô Q3–Q4 cũ vẫn gồm **14 bài G1–G2 dùng thử local**, có hồ sơ xét nguồn, biên, grade và kiểm MuseScore. Q5–Q9 chưa triển khai; bản online chưa thay đổi. Xem [kết quả và giới hạn pilot](Q4_PREPARED_PILOT.md).

Kết quả cần đạt: **mở web → chọn grade, tay, độ dài, đúng nốt/BPM → tập bài có sẵn đã kiểm → chuyển bài tiếp**. Bài có nguồn nhạc thật, highlight đúng, sheet chiếm phần lớn màn hình, nghe bằng MuseScore, bật/tắt pedal và full sheet. Màn tập không có notation editing. MIDI thật vẫn để sau; nghiệm thu trước bằng MIDI mô phỏng.

## 1. Quyết định và phạm vi

MXL gốc → phân tích offline → xác định đơn vị nhạc → kiểm grade → xuất từng bài thành MXL/mở lại kiểm MuseScore → đếm nốt/xếp nhóm → duyệt → đóng gói → web chọn bài để tập. Quyết định ngày 21/10/2026: giữ MXL cho kho bài tập, bỏ chuyển ABC.

| Thành phần | Quyết định v2 |
|---|---|
| Tạo nội dung | Thực hiện offline. Mỗi bài phát hành có nội dung, nguồn, điểm đầu/cuối, grade và ID cố định. |
| Trong phiên | Lọc/chọn bài đã duyệt, tránh lặp, tải tài nguyên và điều phối chơi. Không cắt nhạc, chuyển giọng hoặc ghép mô-típ trong phiên. |
| Bản đầu | Đoạn nguyên bản liên tục từ một nguồn, chọn rõ một tay hoặc cả hai tay. Không xóa nốt khó để ép grade. |
| Biến thể | Chuyển vị là phần mở rộng offline; mỗi biến thể phải kiểm và duyệt riêng. Ghép các nguồn khác nhau chưa thuộc bản đầu. |
| Độ dài | Bảy nhóm khoảng 4, 6, 10, 20, 30, 50, 100 nốt **mỗi bài tập**, độc lập với grade. |
| Layout | Số dòng/khuông phụ thuộc màn hình và mật độ ký âm. Hai tay giữ grand staff; bài một tay ghi rõ tay được trích. |
| Chấm | Giữ kernel và cửa sổ chấm hiện có từ osu!mania, Piano Trainer Studio, mir_eval, note-seq; không viết lại bộ chấm. |
| Người học | User tự chọn; không thêm hệ đo “phản xạ”, mô hình thích nghi hoặc tự cấp chứng nhận trình độ. |

Bản này quy định công việc và nghiệm thu; [GRADE_DESIGN.md](GRADE_DESIGN.md) quy định grade và bằng chứng; [GENERATION_RULES.md](GENERATION_RULES.md) quy định cách lấy đoạn, kiểm, cập nhật kho và chọn bài. Các báo cáo Q0–Q3 và grades.v1.json là bằng chứng của lần triển khai cũ, không tự trở thành dữ liệu được duyệt theo v2.

## 2. Hiện trạng đã kiểm

Mốc v1 để đối chiếu: catalog và artifact ngày 21/10/2026, tại commit 51268eec37:

| Tầng | Thực tế |
|---|---:|
| Mục nguồn / hash MXL riêng | 37.631 / 37.630 |
| File qua kiểm ZIP/XML | 37.629 |
| Đã phân tích nhạc / còn chưa phân tích | 823 / 36.806 |
| Có dữ liệu chuẩn hóa để xét đoạn / bị từ chối phân tích | 528 / 295 |
| Cửa sổ ứng viên qua bộ lọc Q3 v1 | 1.368 |
| Đoạn đã đối chiếu MuseScore | 177, từ 82 file nguồn |
| Nhóm gần trùng trong toàn bộ 177 đoạn | 151, theo quy tắc gom hiện tại |
| Bài được duyệt cho tập / profile đã bật | 0 / 0 |

528 file chuẩn hóa không có nghĩa toàn bộ nội dung đều được nhận. 295 file bị từ chối có thể do thiếu thông tin piano hoặc hạn chế hỗ trợ, không đồng nghĩa nhạc sai. Nguồn hợp lệ gồm 36.149 PDMX, 1.461 OpenScore và 19 file cá nhân/thư viện. Xem [Q1](Q1_CORPUS.md), [Q2](Q2_NORMALIZATION.md), [Q3](Q3_EXTRACTION.md), [verification](q3/verification.json).

**Bổ sung v2:** giữ lại 823 kết quả phân tích qua migration đã kiểm hash; xét 19 đơn vị từ 7 file nguồn, nhận 14 bài từ 6 file (7 G1, 7 G2), giữ 5 đơn vị pending/bị loại. Có 12 motif hash và 4 cặp chồng lấn nguồn, nên không gọi 14 bài là 14 trải nghiệm độc lập. Đây là lô kiểm đường build, chưa phải kho lớn đủ mọi grade/độ dài. Các số và receipt v1 bên dưới được giữ nguyên.

| Grade | Nhóm đoạn Q3 đã kiểm | Nhóm trong khoảng mặc định **cũ** |
|---|---:|---:|
| G1 | 10 | 3 trong 8–16 |
| G2 | 21 | 10 trong 8–20 |
| G3 | 12 | 6 trong 12–24 |
| G4 | 100 | 13 trong 12–24 |
| G5 | 3 | 0 trong 16–32 |
| G6 | 1 | 1 trong 12–24 |
| G7 | 5 | 1 trong 16–32 |
| G8 | 27 | 3 trong 24–48 |

Các grade chồng lấn; không cộng hàng thành tổng độc lập. V2 phải kiểm kê theo **grade × profile × tay × loại nhịp × nhóm độ dài × loại đơn vị nhạc**, sau duyệt. Các số trên không phải tồn kho phát hành.

## 3. Quy tắc grade và căn cứ

G1–G8 là các cấp kỹ năng Pianist, không tương đương ABRSM/Faber và chưa được thực nghiệm xác nhận là lộ trình tối ưu. Các giới hạn cụ thể là quyết định thiết kế. [Bảng bằng chứng](GRADE_DESIGN.md#evidence) tách nghiên cứu, giáo trình và suy luận; mỗi profile phải liên kết tới căn cứ của nó.

- **E1–E3:** nghiên cứu về nhận mẫu, đọc trước và tương tác giữa trình độ với độ khó hỗ trợ xét nhiều yêu cầu cùng lúc; không cung cấp số grade, số nốt hay ngưỡng pass cho app.
- **E4–E5:** Faber và ABRSM cung cấp khung kỹ năng tham chiếu; không phải thử nghiệm hiệu quả hệ Pianist.
- **E6:** nghiên cứu nhận dạng quãng tám ở pianist có kỹ năng không chứng minh người mới nên nhảy quãng tám trước bước liền.

| Grade / mục tiêu | Quy tắc nhận bài trọng tâm | Giới hạn | Lý do và mức bằng chứng |
|---|---|---|---|
| **G1 — điểm mốc, hướng đi** | Một dòng đơn âm; nốt lặp/quãng 2 và có bước liền thực sự. Profile đổi hướng có cả lên và xuống. Một vị trí 3–5 bậc đã kiểm. | Khởi đầu C major, khóa Sol/Fa chuẩn; không chuyển vị trí bàn tay giữa bài. Đen, nốt dài và lặng đen thành họ riêng; chưa móc đơn/đảo phách. | Đọc quan hệ theo E4; giảm yêu cầu đồng thời là suy luận E2–E3. Phạm vi/giọng là thiết kế. |
| **G2 — quãng 3 và chia phách** | Họ A có quãng 3 xen bước liền, tối đa quãng 3, nhịp G1. Họ B có cặp móc đơn trọn phách với cao độ G1. | Một tay/một vị trí. Không đồng thời thêm quãng mới và tiết tấu mới vào bài giới thiệu. | E4 hỗ trợ bước liền/bước bỏ qua; tách hai họ là thiết kế theo E2–E3. |
| **G3 — nhóm giai điệu, quãng 4–5** | Có quãng 4 hoặc 5 trong đường nét có tổ chức. Phân biệt họ hợp âm rải có ngữ cảnh hòa âm và họ giai điệu đã duyệt. Tối đa quãng 5. | Một tay, đơn âm, thế tay đã kiểm, nhịp đã học. Ba cao độ tình cờ tạo hợp âm không đủ. | E1 hỗ trợ nhận mẫu; E4 đặt quãng trong giai điệu/hòa âm. Tách G3 là thiết kế. |
| **G4 — vị trí và giọng mới** | Họ A: mẫu G1–G3 ở điểm xuất phát mới trong C/G/F major. Họ B: chuyển vị trí trong bài theo đường ngón có chuẩn bị. | Họ A không chứng nhận chuyển tay. Họ B kiểm nhả/chuyển tại BPM cho phép. Không thêm nhịp mới; tối đa quãng 5. | E4 có chuyển vị; kiểm soát tải là suy luận E2–E3. Chuyển giọng không bảo đảm vận động dễ như cũ. |
| **G5 — phối hợp hai tay** | Hai dòng đồng bộ: giai điệu đơn âm và bass thưa/giữ. Bản đầu bass tối đa một lần đánh mỗi ô, dài ít nhất hai phách đen; cùng phách ở điểm vào đầu. Đổi vai tay thành profile riêng. | Mỗi tay tối đa một nốt mới tại một điểm vào; kiểm cả âm giữ. Chưa đa bè trong một tay, chéo tay/chung phím. | E5 phân biệt tay riêng/tay cùng; giảm mật độ là thiết kế theo E2–E3. E5 không quy định chờ G5 của Pianist. |
| **G6 — nhảy giai điệu 6–7–8** | Có quãng 6, 7 hoặc 8; chia profile theo quãng/hướng, tiếp tục bằng mẫu quen và có đường di chuyển tay kiểm được. | Ban đầu một tay, nhịp quen. Không biến thành hợp âm phải giữ rộng; onset cách xa không tự chứng minh tay được rảnh. | E6 giúp phân biệt nhận hình và vận động; trình tự/đường tay vẫn là thiết kế cần duyệt. |
| **G7 — tiết tấu có trọng tâm** | Các họ riêng: chấm dôi, nối qua phách, đảo phách, 6/8. Phải có đúng cấu trúc nhịp đang luyện. | Giới thiệu nhịp mới trên cao độ G1–G2/vị trí quen. 6/8 dùng phách đen chấm dôi; chưa trộn tuplet/đổi nhịp/chuyển tay mới. | E5 xét nhịp riêng; giảm yêu cầu còn lại là suy luận E2–E3. Nhịp cơ bản đã có từ G1. |
| **G8 — phối hợp và chuyển vùng** | Bài kết hợp các họ đã duyệt và vùng đàn trong A0–C8. Có nhãn vai trò tay, khóa/8va và thao tác cụ thể. | Giới thiệu vùng mới giảm mật độ. Không nhận mọi đoạn khó; hợp âm nhiều nốt, nhiều bè, pedal bắt buộc cần profile riêng. | E1–E3 hỗ trợ chuyển mẫu sang ngữ cảnh khác; phủ 88 phím là mục tiêu, không chứng nhận thành thạo. |

[Quy tắc chi tiết](GRADE_DESIGN.md#rules) quy định họ nhịp, cách kiểm quãng/ngón và ví dụ nhận/loại. Không trộn mọi giá trị tối đa của grade. Bài ôn có nhãn riêng, không lấp số lượng trọng tâm. Mở vùng đàn bằng profile đã kiểm từ các grade trước; G8 không phải lần đầu ra khỏi vùng giữa.

**Phủ 88 phím là nghiệm thu riêng:** C/G/F major của bản đầu còn thiếu các phím C♯/D♭, D♯/E♭, G♯/A♭. Mở thêm các họ giọng/vị trí theo cùng quy tắc duyệt, rồi báo coverage của từng MIDI pitch 21–108 trong bài approved và của các quan hệ đi vào/đi ra phím đó. Chưa đủ thì ghi rõ thiếu; một lần xuất hiện không chứng minh người học đã làm chủ phím. Không gán cả kho là “đủ 88 phím” chỉ vì min/max chạm A0/C8.

## 4. Độ dài được chọn sau cấu trúc nhạc

| ID | Nhãn web | N bao gồm hai đầu |
|---|---|---:|
| n4 | Khoảng 4 nốt | 3–5 |
| n6 | Khoảng 6 nốt | 6–8 |
| n10 | Khoảng 10 nốt | 9–14 |
| n20 | Khoảng 20 nốt | 15–24 |
| n30 | Khoảng 30 nốt | 25–39 |
| n50 | Khoảng 50 nốt | 40–69 |
| n100 | Khoảng 100 nốt | 70–120 |

Đây là phân nhóm sản phẩm, không phải liều luyện khoa học. N là timeline.targets.length của tay/bè được chấm: hợp âm ba phím là ba target; chuỗi tie là một lần đánh; rest/pedal không cộng. Lưu thêm số điểm vào, số nốt từng tay, ô và thời lượng theo BPM. Không đếm XML note hoặc ép số nốt mỗi dòng sheet.

Đơn vị trọn vẹn có 23 nốt thuộc n20, 29 nốt thuộc n30. Không cắt nốt kết để đúng 20, không lặp/đệm thêm để lên 100. Bài dưới 3/trên 120 giữ trong nguồn, ngoài nhóm bản đầu. Chỉ tách bài dài tại biên đơn vị nhạc đã xác nhận. Không tự đổi grade/nhóm khi hết bài.

## 5. Điều kiện để không cắt đại

1. **Chọn đơn vị trước N:** mô-típ nguyên vẹn, câu/tiểu câu đã xác định, hoặc đoạn liên tục nhiều câu. Ghi đúng loại; 4–6 nốt không tự là “nguyên câu”.
2. **Hồ sơ cả hai biên:** nguồn, part/voice, ô/tick/note ID, ngữ cảnh trước/sau, lý do bắt đầu/kết thúc, cách kiểm. Vạch ô, rest, slur hoặc nốt chủ riêng lẻ không đủ chứng minh kết câu.
3. **Code gốc đúng phạm vi:** music21.analysis.segmentByRests chỉ đề xuất nhóm đơn âm theo rest/clef. Chạy trên từng dòng đã tách; không flatten hai tay hoặc bỏ chord để coi là đã phân tích đủ. Ưu tiên nguồn có cấu trúc rõ; trường hợp chưa chắc phải duyệt ngữ cảnh sheet/âm thanh.
4. **Bảo toàn nhạc:** giữ lấy đà/nốt kết, tie, khóa/giọng, lặng có chức năng, quan hệ hai tay, nhả/pedal. Mở rộng biên làm vượt nhóm thì phân sang nhóm đúng, không tự thêm rest vào nguyên tác.
5. **Kiểm cả đơn vị:** không xóa nốt/bè/nhịp khó bên trong để ép grade. Chọn một tay nguyên vẹn được phép nếu khai báo rõ; không tráo bè giữa chừng.
6. **Đúng nhạc khác đúng sư phạm:** khớp MuseScore chưa chứng minh câu có nghĩa/thế tay tốt. Hồ sơ duyệt ghi người/công cụ, phương pháp, bằng chứng và phạm vi thực đã kiểm; không tự gắn nhãn giáo viên.
7. **Chưa chắc thì chưa phát hành:** giữ ứng viên kèm lý do; tiếp tục nguồn khác, không nới điều kiện để đạt quota.

[GENERATION_RULES.md](GENERATION_RULES.md#boundaries) quy định thủ tục và phản chứng. Không yêu cầu người dùng tự cắt hoặc tự gán grade khi nhập nguồn.

## 6. Các mốc Q và nghiệm thu mới

### Q0 — Hợp đồng dữ liệu và renderer

**Đã có:** Worker/MuseScore và kiểm không đổi editor, không chặn MIDI trong fixture Q0. [Báo cáo](Q0_RENDERER_WORKER.md).

**Bổ sung v2:** schema PreparedExercise, BoundaryEvidence, GradeProfile, LengthBucket, CorpusRelease, ExerciseSession; thử 3 và 120 target, nhiều hệ khuông, grand staff, pickup/bài dài. Bỏ giả định mọi câu là 4–64 nốt hoặc được biến đổi trong phiên. Renderer phục vụ layout/preview của bài cố định.

**Xong khi:** schema nhất quán, nội dung không đổi qua layout, native snapshot/anchor khớp timeline, editor nguyên vẹn. Bằng chứng Q0 cũ không tự xác nhận 120 nốt.

### Q1 — Nguồn và cơ chế bổ sung

**Đã có:** kho có hash/nguồn/resume; dùng lại 37.629 file hợp lệ trước khi tải thêm đại trà.

**Cần làm:** nhập theo manifest có MXL, nguồn/URL, metadata, quyền sử dụng, hash. Nhận diện trùng byte và cùng tác phẩm/bản chuyển soạn khi xác minh được. Giữ bản gốc; bổ sung không xóa dữ liệu ngoài phạm vi thay đổi.

**Xong khi:** nhập mới, nhập lại, đổi metadata và thay bytes có kết quả xác định; báo riêng file mới/trùng/cần phân tích lại. Không tự đưa bài import vào kho đã duyệt.

### Q2 — Chuẩn hóa và sửa cache

**Đã có:** music21 10.5.0 khóa dependency, dữ liệu thời gian chính xác/native gate; 823 file đã xử lý.

Tách parserVersion khỏi corpusVersion/profileVersion. Q2 hiện hash toàn bộ sources.lock.json vào định danh parser nên thêm nguồn có thể làm mất hiệu lực cache toàn kho. Cache mới theo nội dung + parser/dependency/options; đổi grade chạy lại phân loại; đổi metadata chỉ làm mới provenance/quyền và quyết định phụ thuộc metadata.

Chạy theo lô có resume trên 36.806 file còn lại; ưu tiên nhóm đang thiếu dựa trên dữ liệu nhạc. Tên “easy”, tác giả, mã nhạc cụ chỉ xếp thứ tự xét. Tách lỗi file, chưa hỗ trợ parser và không hợp profile.

**Xong khi:** thêm manifest không bắt parse lại nguồn cũ không đổi; đổi parser kiểm lại đúng phần phụ thuộc. Fixture tie/bè/dấu hóa khớp native; có thời gian/bộ nhớ/tiến độ để tiếp tục sau gián đoạn.

### Q3 — Phân đoạn có căn cứ và phân grade

**Đã có một phần v1:** cửa sổ biên ô, 14 profile ứng viên, 177 đoạn khớp native; chưa có xác nhận biên câu/ngón, profile còn tắt.

Triển khai mục 3–5; tìm đơn vị trước số nốt, lưu bằng chứng biên và loại mô-típ/câu/cụm câu. Kiểm trên mẫu nguồn đã định danh, gồm cả đoạn bị bộ lọc bỏ, để thấy nhận nhầm và loại nhầm. Không tự đưa mô hình phân đoạn mới vào dùng khi chưa đối chiếu code/paper gốc.

Rà các hạn chế v1: 21 mẫu tay chưa phải danh mục vận động đầy đủ; ba cao độ tạo hợp âm chưa chứng minh motif hòa âm; đứng ở vị trí mới khác chuyển tay; khoảng onset không tự là thời gian tay được tự do. Không sửa quy tắc chỉ để tăng số ứng viên.

**Xong khi:** mỗi bài nhận có bằng chứng hai biên, verdict từng điều kiện, vai trò tay, trọng tâm, đối chiếu nguồn/native. Mỗi profile có ví dụ đạt và phản chứng; chưa chắc thì cách ly. 177 đoạn cũ phải xét lại theo v2.

### Q4 — Xây kho bài hoàn chỉnh offline

**Pilot đã chạy:** CLI `inspect → prepare → finalize`, schema bài cố định, nguồn/biên/grade review, kiểm nguồn/native/Worker, catalog có hash và coverage. Lô đầu có 14 bài; nhánh này cần hồ sơ duyệt từng đơn vị. Chưa tự động nhận câu từ toàn bộ 37 nghìn file, chưa có G3–G8. [Báo cáo Q4](Q4_PREPARED_PILOT.md) ghi rõ phần đã đạt và phần cần mở rộng.

Thay nhiệm vụ “sinh câu trong phiên” bằng build kho tái lập. Xuất đơn vị từ một nguồn qua Q3 thành MXL; mở lại chính MXL bằng MuseScore, native xác nhận N, xếp n4–n100, duyệt, gộp gần trùng, tạo chỉ mục và gói. Lưu MXL, timeline theo phách, nguồn/biên, profile, N/điểm vào/tay, nhịp, phạm vi BPM đã kiểm và phiên bản. Kho bài tập không chuyển qua ABC.

Chuyển vị, nếu bổ sung, được tạo/duyệt offline như bài riêng liên kết nguyên bản. Không dùng lặp đoạn hoặc đổi BPM để tăng số bài. Nhóm 100 nốt lấy đoạn liên tục/nhiều câu vốn liên tiếp, không nối mẩu rời.

**Xong khi:** cùng nguồn/phiên bản cho cùng nội dung/ID; mọi bài có kiểm nguồn/native; thuộc đúng một nhóm độ dài; có coverage theo tổ hợp và log reject. Không gọi 10.000 lần rút đề là 10.000 bài. Kho nghiên cứu lớn không mặc nhiên đưa vào Git.

### Q5 — Tải gói, chọn bài và chuẩn bị sheet

Chọn từ bài approved theo grade/profile/tay/độ dài/nhịp/BPM; ưu tiên chưa gặp, luân phiên nguồn. Seed chỉ tái hiện thứ tự với cùng phiên bản kho. Tải shard theo nhu cầu, kiểm hash, cache có giới hạn; không precache cả kho.

Chuẩn bị bài hiện tại và ít nhất hai bài kế; độ sâu còn dựa trên thời gian nhạc sẵn sàng và thời gian chuẩn bị đo được. Dùng layout native đã tạo offline; nếu cần reflow, Worker chỉ đổi layout và kiểm anchors của bài cố định. Không mặc định SVG A4 thích hợp mọi màn hình.

**Xong khi:** chỉ đặt lịch bài ready; đổi/hủy không nhận callback cũ; thiếu bài/mất mạng có xử lý rõ. Nghe bằng MuseScore đúng bài, tạm ngừng chấm và không tranh quyền audio với queue.

### Q6 — Luồng chấm liên tục, ưu tiên BPM

Sinh sẵn không tự giải quyết clock. Engine nhận timeline hữu hạn, AudioClock.start đặt lại origin; session phải giữ một mốc chung và điều phối bài đã chuẩn bị.

- Đúng nốt chuyển sau các nhóm hoàn thành; phím còn giữ không thành lần đánh mới.
- BPM chuyển theo lịch dù sai/miss; nốt cuối được hoàn tất hit window đúng. Không reset/count-in mỗi bài rồi gọi là liên tục.
- Khối cùng BPM, đơn vị phách và meter. Khoảng chuẩn bị giữa bài được định lịch/hiển thị riêng; không sửa nguyên tác hoặc kéo dài vì tải chậm.
- Kiểm tay, release/pedal tại biên; cùng grade chưa đủ để nối.
- Queue cạn, audio suspend, tab ẩn, MIDI ngắt: báo gián đoạn, tắt âm treo; không chấm lỗi hệ thống thành miss.

**Xong khi:** replay nhiều bài cho cùng judgements/extras/release/pedal như timeline tham chiếu chạy liền; kernel không đổi. Kiểm cả 3 và 120 nốt. Hướng host/replay cần đo và chứng minh parity, chưa phải chức năng đã có.

### Q7 — Màn Bài tập trong web

Route #/exercises: grade → tay → độ dài → đúng nốt/BPM → Bắt đầu. Họ bài/loại nhịp mô tả ngắn, gắn kho thực; không đổi meter trong khối ngầm. Mỗi tổ hợp hiện số bài/nhóm; 0 bài không cho bắt đầu và gợi ý lựa chọn có dữ liệu.

Tái dùng sheet/highlight/camera. Hai tay hiện grand staff; một tay ghi rõ. Full sheet giữ pause, nghe, pedal, thoát; khóa cấu hình ảnh hưởng chấm theo quy tắc hiện có. Có đọc trước bài kế, không popup mỗi bài.

DB bài tập riêng lưu lựa chọn, lịch sử chống trùng, session; không tự tạo project thư viện. Refresh/Back/đổi màn hình không làm mất editor. Không thêm đo phản xạ hoặc ép đạt pass mới được chọn grade.

**Xong khi:** mở app chơi qua nhiều bài bằng MIDI mô phỏng; full sheet/nghe/pedal/nguồn/đổi cấu hình/hết kho hoạt động desktop và mobile. HTML kiểm mẫu nội bộ không thay nghiệm thu này.

### Q8 — Kiểm nội dung, hồi quy và nâng kho

| Nhóm | Ca bắt buộc |
|---|---|
| Biên nhạc | Đủ N nhưng mất lấy đà/nốt kết; vạch ô giữa câu; rest nội câu; slur không phải nhãn phrase; tay kia còn giữ; tie/pedal qua biên; bài dài nhiều câu. |
| Grade | Đủ maxInterval nhưng thiếu trọng tâm; sai cách viết quãng; nhịp mới cộng chuyển tay mới; bộ ba hợp âm tình cờ; ngón chưa xác nhận; BPM ngoài phạm vi. |
| Độ dài | Ranh giới 3/5/6/8/9/14/15/24/25/39/40/69/70/120; 2 và 121 ngoài catalog; hợp âm/tie; đổi tay phải là bản đã kiểm riêng. |
| BPM | Cùng cao độ sát biên, sớm/muộn, sai/thừa/miss, MIDI giao trễ hợp lệ, nhả/pedal, nối khối, queue cạn. |
| Kho | Thêm nguồn không parse lại toàn bộ; đổi nhóm gần trùng không mất lịch sử; sai hash; ghim phiên bản; rollback. |
| UI/hồi quy | Desktop, 360×800, 390×844, landscape; highlight/camera; native playback; editor mobile; MXL/ABC; thư viện/backup; A–B. |

Mục tiêu kỹ thuật, không phải ngưỡng sư phạm: không có chuẩn bị bài gây main-thread stall ≥50 ms khi chơi trong cấu hình kiểm; soak 30 phút và replay ít nhất 1.000 biên ở nhiều BPM, ghi thiết bị/điều kiện. Bộ nhớ không tăng theo tổng số bài. Kiểm viewport không được gọi là kiểm đàn thật/mọi trình duyệt mobile.

Tự động kiểm mọi bài; mọi hồ sơ biên/grade có quyết định duyệt thực. Rà thêm mẫu phân tầng ít nhất 30 bài/profile khi đủ, hoặc toàn bộ nếu ít hơn; 30 là ngân sách QA, không chứng minh hiệu quả học. Lỗi phát hiện thành fixture/điều kiện loại; kiểm cả các ứng viên bị loại, không chỉ mẫu được nhận.

### Q9 — Phát hành gói và bản online

Đích là GitHub Pages hiện tại khi triển khai tới mốc này. Manifest/shard có hash, nguồn/quyền; đo dung lượng và dùng kiểm release/deploy hiện có. Không tải toàn bộ kho gốc về trình duyệt. Xác minh giới hạn hosting/ngân sách tại lúc phát hành.

Ghim app/native/schema/profile/corpus/layout tương thích trong session. Chỉ đổi kho ở phiên sau; công bố manifest sau khi đủ shard. Giữ bản trước để rollback, không xóa lịch sử/project.

**Xong khi:** URL mở thẳng #/exercises; lựa chọn/số lượng đúng catalog; chơi/nghe/full sheet/pedal qua smoke test; không trộn version; có rollback. Ghi rõ grade/độ dài còn ít hoặc chưa có.

## 7. Thứ tự làm và mốc bàn giao

**Ưu tiên hiện tại theo yêu cầu mới:** hoàn thiện phần xây kho theo [kế hoạch riêng K1–K5](GRADED_BANK_PLAN.md). Đi qua từng nguồn, đọc toàn bộ, xét mọi đoạn có biên hợp lệ với mọi profile và đưa tất cả đoạn đạt vào kho. Không dùng lô 14 bài để kết thúc giai đoạn xây kho hoặc chuyển ngay sang màn quiz.

**Đã xong K1 và K2:** 37.629 nguồn đã có kết quả; cache được đối soát; API/CLI V3 kiểm đủ 25 profile và trả đạt/không đạt/cần xem xét. **Script K3 đã bổ sung bằng chứng máy:** biên LBDM/rest chính xác, routing, giọng và ngón cố định qua upstream; kết quả nội dung, biên và native tách riêng. **Tiếp theo:** mở rộng các bằng chứng còn thiếu, chạy K3 toàn catalog, rồi K4 kiểm và xuất từng bài MXL. Xem [thứ tự và đầu ra cụ thể](GRADED_BANK_PLAN.md#việc-triển-khai-tiếp-theo). Bộ chấm khi tập giữ nguyên.

1. Đọc toàn bộ nguồn, dùng lại cache đúng phiên bản; ghi trạng thái và lý do từng file.
2. Hoàn thiện các phép kiểm G1–G8 và quét mọi đơn vị phù hợp, không giới hạn số đoạn mỗi nguồn.
3. Đối chiếu mọi đoạn đạt với native, xếp độ dài, giữ xuất xứ và thống kê toàn kho.
4. Sau mốc bàn giao dữ liệu mới nối **Q5–Q6–Q7 thành màn tập dùng được**, kiểm BPM qua biên; tiếp tục mở rộng theo báo thiếu, Q8 và Q9.

Demo có thể dùng vài bài đã kiểm, hiện rõ “kho nhỏ”; không chứng nhận đủ G1–G8. Mục tiêu mở rộng: 1.000 nhóm đoạn/grade, 50 nhóm tác phẩm đã xác minh, 100 motif/grade. Đây là mục tiêu sản phẩm cần đo, không dự báo chắc chắn. Mục tiêu tham khảo một tổ hợp thường dùng là 100 nhóm; ít hơn vẫn công bố số thật và khả năng gặp lại. Không nhồi mọi tổ hợp, nhất là nguyên câu 4 nốt hoặc đoạn 100 nốt rất đơn giản.

Chỉ báo “đủ các level” khi mọi profile cốt lõi G1–G8 công bố có nội dung được duyệt và coverage; không suy rằng mọi tay/nhịp/độ dài đều đủ. “Kho lớn theo độ dài” cần số từng tổ hợp. Bỏ nghiệm thu cũ “sinh 10.000 câu bằng seed”.

## 8. Bổ sung nguồn về sau

Nhập nguồn → kiểm hash → parse mới/thay đổi → phân đoạn/grade offline → đối chiếu/duyệt → chống trùng/coverage → build bản kho mới → kiểm → phát hành.

Tách sourceHash, parserVersion, boundaryRuleVersion, profileVersion, notationVersion, corpusVersion. Thành phần đổi thì chỉ dùng lại bằng chứng còn đúng phạm vi phụ thuộc; không kế thừa duyệt cho nội dung đã đổi. ID nhóm gần trùng có thể thay: lịch sử lưu exercise ID, exact hash, motif hash và vị trí nguồn ổn định; nhóm có version/mapping riêng.

Test nâng kho chứng minh cùng bài không thành chưa gặp vì đổi ID nhóm; không sửa bài đang chơi; không nới grade ngầm; rút bài catalog không phá project cá nhân.

## 9. Điểm chạm code

| Đã có | Vai trò |
|---|---|
| [collect-curriculum.py](../../buildscripts/pianist/collect-curriculum.py), [curriculum_catalog.py](../../buildscripts/pianist/curriculum_catalog.py) | Tải/nhập nguồn, provenance; thêm quy trình nhập theo lô. |
| [normalize-curriculum.py](../../buildscripts/pianist/normalize-curriculum.py), [curriculum_normalize.py](../../buildscripts/pianist/curriculum_normalize.py) | Parser, cache mới, native gate. |
| [curriculum_fragments.py](../../buildscripts/pianist/curriculum_fragments.py), [fragment-curriculum.py](../../buildscripts/pianist/fragment-curriculum.py) | Thay cách chọn/duyệt ứng viên, giữ đối chiếu nguồn. |
| [model.ts](../../packages/exercise-generator/model.ts), [corpus-model.ts](../../packages/exercise-generator/corpus-model.ts) | Tách candidate, bài approved và catalog. Tên package không chứng minh generator realtime tồn tại. |
| [exercise-renderer](../../packages/exercise-renderer), [source-verification.ts](../../packages/exercise-generator/source-verification.ts) | Render/glyph/timeline; kiểm 3–120 nốt và nhiều layout. |
| [score-adapter.ts](../../packages/practice-engine-v2/score-adapter.ts), [controller-v2.ts](../../apps/pianist-web/src/practice/controller-v2.ts) | Target/kernel giữ nguyên; điều phối liên tục phải chứng minh parity. |
| [PracticeScreen.tsx](../../apps/pianist-web/src/practice/PracticeScreen.tsx), [Sheet.tsx](../../apps/pianist-web/src/practice/Sheet.tsx), [NoteInk.tsx](../../apps/pianist-web/src/practice/NoteInk.tsx) | Sheet, highlight, full sheet, nghe và pedal. |

**Đã tạo cho pilot:** scores/curriculum/grades.v2.json, length-buckets.v2.json, reviewed-units.v2.json; packages/exercise-generator/prepared-model.ts và prepared-contract.ts; buildscripts/pianist/prepare-curriculum.py; artifacts/curriculum-prepared/manifest.json và releases/<version>. **Chưa tạo:** catalog-selector.ts, apps/pianist-web/src/exercises và catalog công khai curriculum/manifest.json. Không sửa grades.v1.json/receipt Q0–Q3 cho giống đã đạt v2. Mỗi mốc triển khai lưu commit và bằng chứng riêng, tách dữ liệu/kỹ thuật/duyệt nội dung/trải nghiệm dùng được.
