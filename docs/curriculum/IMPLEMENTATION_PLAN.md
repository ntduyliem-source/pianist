# Kế hoạch triển khai kho nhạc và quiz piano theo grade

Ngày 20 tháng 10 năm 2026. Kết quả cần đạt: **mở web → chọn grade → chọn đúng nốt/BPM và khoảng x–y nốt → chơi một luồng câu nhạc mới liên tục**, có nguồn nhạc thật, highlight đúng nốt và sheet chiếm phần lớn màn hình.

Phương án: tải và phân tích kho trên máy phát triển; đưa các gói dữ liệu đã tuyển lên web; chọn câu và tạo biến thể theo yêu cầu trong trình duyệt. Mỗi câu dùng đường ký âm MuseScore và bộ chấm hiện có. Giữ [GRADE_DESIGN.md](GRADE_DESIGN.md) và [GENERATION_RULES.md](GENERATION_RULES.md) làm đặc tả sư phạm và điều kiện sinh câu.

Đây là kế hoạch code Q0–Q9. Các chỉ tiêu dung lượng, số câu, giới hạn hiệu năng là mục tiêu sản phẩm cần kiểm chứng khi thực hiện, không phải số lượng hiện đã đạt hoặc liều tập được khoa học xác nhận. MIDI thật để sau; nghiệm thu kỹ thuật trước bằng MIDI mô phỏng. Đích phát hành là web GitHub Pages đang có.

## Quyết định triển khai

| Thành phần | Quyết định |
|---|---|
| Nguồn gốc | Giữ MXL nguyên bản và nguồn/giấy phép/hash ở kho cục bộ. |
| Phân tích | Dùng music21 cho đọc nhạc, quãng và chuyển vị; đối chiếu cao độ/thời gian/bè với MuseScore hiện có. Khóa phiên bản và checksum dependency. |
| Dữ liệu đưa lên web | Chỉ mục nhỏ, đoạn nốt có cấu trúc và các phép biến đổi được duyệt; chia gói nén theo grade/profile. |
| Sinh đề | Thuật toán chọn có ràng buộc và seed; không gọi LLM trong phiên tập. |
| Câu đầu tiên | Đoạn nguyên bản hoặc chuyển vị. Câu tổ hợp chỉ được bật sau khi có các điểm nối đã duyệt. |
| Giao diện | Thêm mục Bài tập trong Tập piano, route `#/exercises`; màn chơi dùng lại thành phần sheet, không có notation editing. |
| Độ dài | User chọn khoảng bao gồm hai đầu, `4 ≤ x ≤ y ≤ 64`; số đếm cuối cùng là target phải nhấn sau chuyển đổi. |
| Luồng chạy | Chuẩn bị trước câu tiếp theo; chế độ BPM dùng cùng mốc đồng hồ qua các câu. |
| Chấm | Giữ thuật toán và cửa sổ hiện có của osu!mania, Piano Trainer Studio, mir_eval và note-seq. Phần thêm là dữ liệu và điều phối. |
| Lưu trữ | Lưu lịch sử đề đã gặp và phiên quiz riêng; không tự biến mỗi câu thành một project trong thư viện. |

[music21 converter](https://music21.org/music21docs/moduleReference/moduleConverter.html) hỗ trợ đọc MusicXML; [module interval](https://music21.org/music21docs/moduleReference/moduleInterval.html) phân biệt các thuộc tính quãng. Không thay parser khảo sát cũ bằng một bộ tính quãng chỉ dựa trên khoảng cách MIDI khác.

## Kho sẽ tải và cách xác định đủ lớn

### Nguồn đầu vào

| Nguồn | Trạng thái đã xác minh tại máy | Việc cần làm |
|---|---|---|
| [OpenScore Lieder](https://github.com/OpenScore/Lieder/tree/38c5db510224d9facdc4b08d741fc788cfb58ea8) | 1.462 mục nguồn, **1.461 nội dung MXL khác SHA256**, khoảng 18,6 MB; đã tải. | Tái dùng file hiện có. Đối chiếu cặp trùng hash nhưng khác tên nguồn; giữ cả provenance, không đếm thành hai nội dung mới. Tuyển đúng phần piano. |
| [PDMX bản Zenodo 15571083](https://zenodo.org/records/15571083) | CSV đã có; 36.150 dòng ứng viên một track mã piano sau bộ lọc metadata. MXL chưa tải. | Tải `mxl.tar.gz` khoảng **1,9 GB**, thêm `metadata.tar.gz` khoảng **159,4 MB** để đối chiếu thông tin nguồn khi cần. Giữ nguyên bản CSV đã kiểm. |
| Thư viện hiện tại | 18 MXL, gồm bài Việt và quốc tế; Phố Xa là ví dụ riêng. | Phân tích cục bộ, nhận diện tác phẩm/bản chuyển soạn; chỉ phát hành công khai phần có nguồn và quyền phù hợp. |
| Bổ sung có mục tiêu | Chưa có bộ MXL giáo trình dễ đã tuyển đầy đủ. | Khi báo cáo thiếu G1–G3, tìm trong PDMX và các nguồn có phép tải những bản piano nhập môn, dân ca đơn giản, mẫu từ Beyer/Czerny/Duvernoy/Gurlitt; kiểm file thực tế thay vì gán grade theo tên tác giả. |

Phần tải thêm chính khoảng **2,1 GB** theo kích thước làm tròn của hai archive. Dự trù ban đầu 10 GB chỗ trống cho archive, MXL được tuyển, chỉ mục và cache; đo dung lượng thật trước khi mở rộng. Không cần tải PDF 9,6 GB hay dữ liệu âm thanh để làm pipeline này.

Manifest tải phải khóa record 15571083, URL từ record, kích thước và checksum:

| File PDMX | MD5 công bố để kiểm bản tải |
|---|---|
| `mxl.tar.gz` | `49ffd75ecf5489c0be6d41182eb11ff7` |
| `metadata.tar.gz` | `5bc79445090dd2fe5e96cffa77a3461c` |
| `PDMX.csv` | `30392ccf38bb63ce70e7afae70f9c88c` |

Sau tải tính thêm SHA256 nội bộ; không dùng checksum như bằng chứng tác quyền. PDMX khuyến nghị subset không có cờ xung đột giấy phép trong [README](https://github.com/pnlong/PDMX#updates-). Bộ lọc ứng viên tiếp tục dùng `no_license_conflict ∩ all_valid ∩ deduplicated`, rồi kiểm nội dung piano thực tế; mã chương trình piano không đủ xác nhận nhạc cụ hay trình độ.

Archive có thể chứa toàn bộ kho nhưng chỉ giải nén các MXL nằm trong danh sách cần phân tích trước. Bộ tải hỗ trợ tiếp tục, kiểm checksum trước khi dùng, giới hạn số tác vụ; xử lý archive bằng đường dẫn đã kiểm nằm trong workspace, không cho symlink hoặc đường dẫn thoát thư mục.

### Chỉ tiêu nội dung

**Mục tiêu bản đầy đủ:** mỗi grade có ít nhất **1.000 đoạn nguồn đạt điều kiện sau gộp gần trùng**, từ ít nhất **50 nhóm tác phẩm**, và ít nhất **100 mẫu hình cao độ–tiết tấu khác nhau sau chuẩn hóa chuyển vị**. Các đoạn cùng một tác phẩm hoặc hai bản chuyển soạn của nó phải được nhận diện khi có đủ metadata.

Trên nền đó, mục tiêu khả năng sinh là **10.000 câu khác nội dung mỗi grade trong các khoảng nốt mặc định**, gồm trích đoạn, phép chuyển vị hợp lệ và câu tổ hợp được duyệt. Đây là chỉ tiêu kiểm thử, chưa phải dự báo kho hiện tại chắc chắn cung cấp được. Tăng số nốt, đổi BPM hoặc đổi giao diện không được dùng để khai tăng số câu.

| Grade | Khoảng nốt mặc định | Nội dung mới phải có trong phần luyện trọng tâm |
|---|---:|---|
| G1 | 8–16 | Hướng đi, nốt lặp, quãng 2; các họ nhịp cơ bản |
| G2 | 8–20 | Quãng 3 xen quãng 2; cặp móc đơn trong họ luyện nhịp riêng |
| G3 | 12–24 | Quãng 4–5 trong cụm giai điệu/hợp âm rải |
| G4 | 12–24 | Chuyển vị trí hoặc giọng trong danh sách được duyệt |
| G5 | 16–32 | Hai tay với giai điệu và bass thưa/giữ |
| G6 | 12–24 | Quãng 6–7–8 giai điệu và chuẩn bị chuyển tay |
| G7 | 16–32 | Các họ nhịp phức tạp, xét riêng từng họ |
| G8 | 24–48 | Phối hợp các kỹ năng đã học tại nhiều vùng đàn |

Các chỉ tiêu phải được báo riêng cho nội dung mới của grade và bài ôn; không lấp đầy G6 bằng câu chỉ có quãng 2 rồi gọi đã đủ kho quãng lớn. Một đoạn có thể phù hợp nhiều grade, nên không cộng các cột để quảng cáo tổng số bài độc lập.

Trước khi chạy đủ kho, dùng **100 đoạn ứng viên/grade** làm pilot. Nếu grade thiếu nguồn, Q3 phải trả báo cáo thiếu theo từng quãng, tay, nhịp và vùng phím, rồi tuyển thêm đúng nhóm đó. Có thể phát hành beta các grade đủ điều kiện, nhưng chưa gọi Q0–Q9 hoàn tất cho toàn bộ G1–G8. Không nới grade hoặc nhân bản đổi quãng tám để vượt chỉ tiêu.

## Q0 Chốt hợp đồng dữ liệu và kiểm rủi ro native

**Cập nhật triển khai 20/10/2026:** đã có mốc an toàn, schema nháp, API snapshot tạm và kiểm tra native. **Gate renderer còn mở**: render trên main thread gây long task và ngắt phiên BPM ở phép thử CPU 4×. Xem [báo cáo Q0 và phần việc còn lại](Q0.md); chưa đánh dấu Q0 hoàn tất hoặc chuyển sang triển khai quiz liên tục.

**Công việc**

- Tạo nhánh `codex/sight-reading`, lưu mốc an toàn cho code đang hoạt động; chọn file để commit rõ ràng, không đưa archive nghiên cứu vào Git.
- Ghi baseline build, bộ test hiện có, phiên bản WASM và checksum các tệp chấm trong `packages/practice-engine-v2/upstream/`.
- Chốt schema `Source`, `Fragment`, `GradeProfile`, `Exercise`, `ExerciseSession` và quy ước tính N.
- Làm prototype với vài MXL nhỏ: tạo snapshot câu kế trong khi câu hiện tại vẫn hiển thị và MIDI vẫn được nhận.

**Điểm cần đối chiếu code**

`EngineBridge.snapshot()` hiện lấy tài liệu đang mở. Nhưng `WebApi::prepareProject()` đã có đường tạo project tạm, không công bố vào global context; nó hiện chỉ trả MSCZ hoặc semantics không có drawings. Hướng ưu tiên là mở rộng đường project tạm để trả snapshot có SVG và anchor, giữ tài liệu editor nguyên vẹn.

Lời gọi native hiện đồng bộ. “Project tạm” chưa đồng nghĩa chạy nền; cần đo độ chặn main thread. Nếu vượt ngân sách, khảo sát engine khắc nhạc tách worker phù hợp bản build. Cache snapshot được chuẩn bị trước là phương án dự phòng cho một số biến thể đã biết, nhưng không được gọi là đã đạt yêu cầu tạo biến thể bất kỳ khi đang chơi.

**Đầu ra:** schema nháp, mẫu native, baseline và báo cáo quyết định renderer.

**Xong khi:** snapshot/anchor khớp MIDI; editor không đổi bytes/revision/undo; đường tạo câu được chọn có bằng chứng đủ khả năng phục vụ queue. Nếu renderer chưa đạt, xử lý ở mốc này trước khi cam kết trải nghiệm BPM liên tục.

## Q1 Tải kho và lập danh mục nguồn

**Công việc**

- Chuyển logic tải OpenScore từ script nghiên cứu sang công cụ có manifest, resume và báo cáo lỗi; tái dùng file có hash đúng.
- Tải hai archive PDMX nêu trên; chọn ứng viên theo CSV; giữ đường dẫn gốc và trạng thái tải/giải nén/parse riêng.
- Đếm trùng theo hash file trước, rồi nhóm trùng tác phẩm/bản chuyển soạn ở bước phân tích; gắn trạng thái công khai/cá nhân/chờ xác minh.
- Ưu tiên ứng viên đơn giản bằng thông tin thật sau parse. Tên “easy” chỉ là gợi ý hàng đợi, không quyết định grade.

**Đầu ra dự kiến**

```text
scores/curriculum/sources.lock.json          # manifest nhỏ được commit
artifacts/curriculum-corpus/raw/             # archive và MXL gốc, không commit
artifacts/curriculum-corpus/catalog.sqlite   # trạng thái, hash, nguồn
artifacts/curriculum-corpus/download-report.json
```

**Xong khi:** mọi mục trong danh sách cần xử lý có file hợp lệ hoặc lý do thiếu cụ thể; chạy lại không tải trùng; checksum archive khớp; báo cáo phân biệt số mục, số file độc lập và số ứng viên piano. Không yêu cầu mọi ứng viên đều được chấp nhận.

## Q2 Chuẩn hóa nốt và đối chiếu MuseScore

**Công việc**

- Cài music21 vào môi trường build riêng, khóa phiên bản; trình duyệt không tải thư viện Python này.
- Giữ nguyên tên bậc, alter, octave, khóa, hóa biểu, nhịp, part/staff/voice, tie, rest, pedal và thứ tự thời gian; dùng phân số cho nhịp, không làm tròn sớm.
- Tách thông tin đọc trên khuông, quan hệ giai điệu, hợp âm và thao tác tay. Dùng mẫu đã duyệt để mô tả thế tay, không đoán thế ngón chỉ từ tầm âm.
- Đối chiếu các đoạn định phát hành với native semantics: cao độ, onset, duration, bè, số target sau gộp tie/đồng âm.
- Những ký hiệu chưa hỗ trợ, file sai cấu trúc hoặc khác biệt ngữ nghĩa phải có mã lỗi và bị loại khỏi gói phát hành.

**Schema tối thiểu**

| Bản ghi | Trường cần có |
|---|---|
| Source | ID, URL, commit/record, hash, title/composer/arranger khi có, license, visibility, trạng thái |
| Fragment | sourceId, part/voice, ô và tick đầu/cuối, ngữ cảnh ký âm, nốt/rest, điểm cắt an toàn, targetCount, onsetCount |
| GradeProfile | grade, kỹ năng trọng tâm, điều kiện đã học, mẫu nhịp/giọng/vùng tay cho phép, giới hạn tốc độ/chuyển tay, phép biến đổi |
| Exercise | fragmentIds, seed, phiên bản profile/generator/corpus, phép biến đổi, hashes, snapshot/timeline tương ứng |
| Session | settings, thứ tự câu, trạng thái, kết quả/replay chấm hiện có, phiên bản corpus và engine |

**Xong khi:** các fixture E–F/C–C♯/C–D♭, dấu hóa qua ô, tie, hợp âm khác trường độ, backup/forward, đổi khóa, 8va và nhiều bè đều có đối chiếu phù hợp. Không đưa kết quả từ parser khảo sát cũ thẳng vào production.

## Q3 Tách đoạn và phân loại grade

**Công việc**

- Xét các điểm cắt hợp lệ thay vì cố định cửa sổ 4 ô; tìm nhiều độ dài trong 4–64 target.
- Bắt đầu với đoạn ở biên ô rõ ràng; loại tie/pedal/nốt giữ vượt biên chưa được xử lý. Bổ sung pickup hoặc cắt theo mô-típ sau khi có kiểm chứng.
- Chạy các điều kiện độc lập của từng profile; xuất `accept/reject` cùng lý do, không dùng một điểm trung bình che một yêu cầu vượt grade.
- Phân biệt câu luyện trọng tâm và câu ôn. Duyệt tính thành câu/tiểu câu, thế tay và các mẫu nối dự định dùng.
- Gộp cửa sổ chồng lấn/gần trùng, tạo nhóm motif sau chuẩn hóa chuyển vị, thống kê độ phủ theo tay, chiều quãng, nhịp, vùng phím và số nốt.

**Duyệt nội dung**

Kiểm tự động cho mọi đoạn; duyệt mẫu phân tầng tối thiểu 30 đoạn/grade và mọi họ mẫu mới. Mỗi trường hợp lỗi sư phạm phát hiện phải trở thành điều kiện loại hoặc fixture. Nhãn “giáo viên piano đã duyệt” chỉ được dùng nếu thực sự có người phù hợp duyệt; kiểm MIDI tự động không xác nhận cách đặt tay tốt.

**Đầu ra:** `grades.v1.json`, `fragments` có version, `coverage.json`, `rejected.jsonl`, danh sách cần bổ sung nguồn.

**Xong khi:** có pilot đủ để kiểm toàn hệ thống, mọi profile bật có ví dụ được duyệt, báo cáo cho biết chính xác mức đạt so với chỉ tiêu kho. Thiếu nguồn là công việc còn lại của Q3, không được che bằng đề tự soạn gắn nguồn thật.

## Q4 Viết bộ sinh câu có ràng buộc

**Thuật toán**

```text
generate(request, sessionHistory, seed):
  kiểm grade, profile, tay, BPM, x và y
  lấy các fragment phù hợp profile và khoảng targetCount
  loại nguồn/câu đang trong cửa sổ chống trùng
  chọn luân phiên nhóm tác phẩm, motif và vị trí được phép
  chọn nguyên bản hoặc phép chuyển vị đã được duyệt
  áp dụng phép biến đổi và kiểm lại toàn bộ điều kiện
  kiểm điểm nối với câu trước, trạng thái tay/phách
  dựng dữ liệu câu và xác nhận x <= targetCount <= y
  trả Exercise kèm provenance và seed
  nếu không có nghiệm: trả lý do và khoảng khả dụng
```

Chọn các nghiệm hợp lệ theo seed, không chọn N ngẫu nhiên rồi cắt cho đủ. `x=y` chỉ hoạt động nếu có câu đúng số đó. Cặp móc đơn, hợp âm và tie không bị bẻ để thỏa slider.

**Chuyển vị**

music21 tạo bảng biến đổi có cách viết nốt và hóa biểu đúng ở bước chuẩn bị; web dùng các biến đổi đã khai báo và kiểm lại grade. Native MuseScore là bước xác nhận trước khi xếp vào queue. Không transposition tùy ý theo MIDI rồi đoán dấu thăng/giáng.

**Chống lặp**

Lưu exact hash, hash đã chuẩn hóa chuyển vị, nhóm nguồn và vùng nguồn chồng lấn. Cấu hình ban đầu đề xuất: giữ 5.000 exact hash gần nhất theo grade; tránh lại cùng đoạn nguồn trong 100 câu và cùng cấu trúc chuẩn hóa trong 20 câu, khi kho đáp ứng được. Đây là thông số chống lặp của sản phẩm. Nếu thiếu tập ứng viên, trả `insufficient-variety`; không lặng lẽ bãi bỏ mọi giới hạn. User có thể chủ động bật dùng lại để tiếp tục.

**Câu tổ hợp**

Sau khi hai dạng đầu chạy đúng, bổ sung đồ thị nối mô-típ đã duyệt. Cạnh thể hiện điểm nối hợp lệ về giọng, nhịp, hòa âm khi có nhãn, vị trí tay và cách kết. Tìm đường có tổng N trong x–y bằng quy hoạch động/backtracking có giới hạn. Giữ nguyên nhịp của đơn vị nguồn; ghi provenance từng đoạn. Với motif chưa rõ hòa âm/điểm nối thì không tự tạo cạnh.

**Xong khi:** cùng đầu vào và seed tái tạo cùng câu; các ràng buộc grade và x–y luôn đúng; không ghi nhãn câu tổ hợp thành nguyên tác; chạy kiểm kê sinh 10.000 câu/grade theo cấu hình mặc định và báo số unique thực tế, thiếu hụt và tỷ lệ loại. Chỉ tiêu chưa đạt vẫn phải được ghi là chưa đạt.

## Q5 Ký âm và queue chuẩn bị trước

**Công việc**

- Tạo MusicXML chuẩn từ dữ liệu câu và ngữ cảnh đã duyệt; dùng snapshot có SVG và anchors theo phương án native đã chọn ở Q0.
- Tách công việc chọn/biến đổi dữ liệu vào worker. Lệnh native có hàng đợi, hủy bằng generation ID; không gọi đồng thời qua các file tạm chung.
- Queue có các trạng thái `selected → validated → rendered → ready → active → retired`; chỉ câu `ready` được đặt lịch.
- Chuẩn bị ít nhất câu hiện tại và hai câu kế; refill theo thời gian nhạc còn sẵn sàng và thời gian render đo được, không chỉ theo số lượng câu.
- Giới hạn cache SVG/native project; giải phóng câu đã qua nhưng giữ dữ liệu tối thiểu để lưu kết quả và tái hiện lỗi.

**Nghe mẫu**

Nút Nghe dùng native MuseScore với đúng câu được chọn. Khi nghe, ngừng chấm và khóa việc đổi project audio; dừng nghe rồi mới bắt đầu/tiếp tục chấm. Công việc render câu kế không được reset hoặc phát nhầm câu đang nghe. Không thay native audition bằng âm mô phỏng rồi gọi là playback MuseScore.

**Xong khi:** editor hiện có không thay đổi; 100 lần sinh/hủy/đổi grade không rò project hoặc callback; native snapshot và timeline trùng số nốt/cao độ; queue kịp phục vụ câu ngắn trên thiết bị kiểm thử.

## Q6 Nối câu với đồng hồ và bộ chấm hiện có

**Ràng buộc hiện tại**

`PracticeEngine` và `ManiaKernel` nhận danh sách target cố định khi tạo. `PracticeController` kết thúc khi engine báo done; `AudioClock.start()` thiết lập lại origin. Vì vậy chỉ mở một controller cho mỗi câu sẽ không đáp ứng BPM liên tục.

**Hướng triển khai ưu tiên**

- Một session giữ mốc Web Audio/performance chung. Các câu có ID riêng và thời điểm tuyệt đối trong cùng dòng nhạc.
- Đưa nhiều câu đã sẵn sàng thành timeline phía trước. UI đổi câu theo mốc/group, độc lập thời điểm hoàn tất cửa sổ chấm nốt cuối.
- Thêm lớp host cho timeline theo khối, giữ nguyên các kernel upstream. Hướng thử nghiệm là tạo engine với timeline được mở rộng trong worker, replay nhật ký đầu vào/clock và chuyển giao khi kết quả cũ khớp; phần được thêm phải còn ngoài khoảng thời gian có thể ảnh hưởng chấm hiện tại.
- Khóa mốc cắt nhật ký, bổ sung các sự kiện đến trong lúc rebuild rồi mới chuyển generation. Kiểm không mất, nhân đôi hay phân lại target đã chấm.
- Đối chiếu mỗi tình huống với một timeline hoàn chỉnh chạy từ đầu bằng engine hiện có. Nếu không đạt parity hoặc không đạt chi phí thời gian/bộ nhớ, tiếp tục xử lý host trước khi phát hành; không sửa thuật toán chọn nốt để làm test qua.
- Thu gọn lịch sử ở điểm nghỉ và trạng thái trung tính đã xác nhận; các sự kiện nhả/pedal còn liên quan phải được giữ. Giới hạn phiên dài phải được hiển thị đúng, không để bộ đếm sự kiện chạm giới hạn rồi hỏng âm thầm.

**Hành vi**

Đúng nốt chuyển theo nhóm nốt đã hoàn tất, không đánh lại phím còn giữ như sự kiện mới. BPM chuyển theo lịch dù có sai/miss; không chờ “pass câu”. Tie và tham chiếu pedal không được cắt ở biên câu. Chuyển vùng xa có khoảng chuẩn bị được ký âm, không phải độ trễ tải trang.

Khi tab ẩn, MIDI ngắt, audio suspend hoặc queue cạn: xử lý gián đoạn rõ ràng, ngừng âm treo, chuẩn bị lại và đếm vào khi tiếp tục. Khoảng bị gián đoạn không được ghi thành lỗi BPM của người học.

**Xong khi:** replay theo khối và replay timeline hoàn chỉnh cho cùng judgements/extras/release/pedal trong các trường hợp kiểm; nguồn upstream giữ nguyên checksum; không gọi start/reset clock ở mỗi câu. Đây là một mốc bắt buộc, không được coi là chi tiết UI.

## Q7 Tích hợp vào web và lưu dữ liệu

**Màn chọn**

Trong Tập piano có hai lối vào: bài trong thư viện và Bài tập theo grade. Route mới hỗ trợ mở trực tiếp, refresh và Back. Hiển thị grade, mục tiêu ngắn, khoảng số nốt, mode, BPM, tay phù hợp và nút Bắt đầu. Những cấu hình chưa có nguồn hiện thông tin rõ ràng thay vì lỗi tải.

**Màn chơi**

Tái dùng `Sheet`, `NoteInk`, `score-viewport` và các thành phần luyện tập; sheet hiện tại và câu tiếp theo đọc được trước. Full sheet giữ thanh nhỏ gồm tạm dừng, nghe, pedal và thoát. Cấu hình ảnh hưởng chấm như pedal vẫn theo quy tắc khóa khi lượt đang chạy. Không mở editor trong luồng quiz.

Nguồn tác phẩm, số nốt/ô và loại câu nằm ở thông tin phụ. Kết quả ngắn hiện tại câu; không chèn popup mỗi câu. Tổng kết khi user dừng. Tách lịch sử quiz khỏi danh sách bản nhạc; chỉ lưu câu thành bài thư viện khi user chọn thao tác đó.

**Lưu và cache**

DB riêng `pianist-exercises` lưu cấu hình, lịch sử chống trùng, session và seed; không dùng migration này để thay đổi thư viện hiện tại. Gói corpus lưu theo version/hash, chỉ tải grade đang dùng, có quản lý dung lượng. Không đưa toàn bộ corpus vào service worker precache hiện đang cài nguyên release.

**Xong khi:** route, dữ liệu lưu, nguồn, full sheet, nghe và pedal hoạt động trên desktop/mobile; vào/ra quiz không làm mất bản đang chỉnh; dữ liệu cá nhân không bị đẩy lên GitHub.

## Q8 Kiểm nội dung và nghiệm thu kỹ thuật

| Nhóm kiểm | Tình huống bắt buộc |
|---|---|
| Nhạc | Quãng theo cách viết; dấu hóa; khóa/8va; tie vào/ra biên; bè; hợp âm; nốt giữ qua phách; 3/4, 4/4, 6/8 |
| Bộ sinh | x=y, không có nghiệm, 4 và 64 nốt, nhiều tay, nguồn thiếu, seed tái lập, hết độ đa dạng, chồng lấn nguồn, đổi quãng tám |
| BPM | Nốt cùng cao độ sát biên; đánh sớm/muộn tại hit window; sai/thừa/miss; MIDI giao trễ hợp lệ; nhả và pedal qua biên; nối khối |
| UI | Highlight trên đúng glyph; camera qua câu; thao tác cuộn tay; full sheet; nghe/đổi câu; đổi hướng màn hình |
| Sự cố | Mạng mất, gói sai hash, render chậm, hủy công việc, native failure, audio suspend, tab ẩn, cache hết dung lượng |
| Hồi quy | Editor mobile, import/export MXL/ABC, thư viện/backup, playback MuseScore, A–B và các test chấm đối chiếu upstream |

Chạy các lệnh test/build hiện có từ `apps/pianist-web`; thêm test generator/stream và kịch bản browser riêng. Browser kiểm ở desktop, 360×800, 390×844 và landscape; giả lập kích thước không được ghi là đã kiểm đàn thật hay mọi trình duyệt mobile.

Ngân sách kỹ thuật ban đầu: chọn/biến đổi dữ liệu p95 ≤ 50 ms trong worker; chuyển câu đã render ≤ 1 frame trong điều kiện đo; không có công việc khắc nhạc gây main-thread stall từ 50 ms khi đang chơi. Số này là tiêu chí kỹ thuật cần đo và công bố thiết bị, không phải mức dung sai chấm.

Soak test tối thiểu 30 phút và 1.000 biên câu trong nhiều tốc độ bằng MIDI mô phỏng; các kịch bản có audio thực phải chạy thêm theo thời gian thật. Bộ nhớ sau warm-up và thu hồi cache phải ổn định trong giới hạn đo, không tăng theo tổng số câu. Khoảng nhìn trước đủ để người học chuẩn bị được duyệt qua UI; tốc độ render tốt không tự chứng minh giá trị sư phạm.

**Xong khi:** test hiện có và test mới đều đạt; báo cáo giữ riêng kiểm tự động, kiểm nhìn/nghe thủ công và phần chưa kiểm MIDI thật. Không có lỗi grade, mất nguồn hay lệch clock còn biết mà vẫn đánh dấu hoàn thành.

## Q9 Đóng gói và cập nhật bản online

**Công việc**

- Xuất `curriculum/manifest.json` và các shard có version/hash; gói khởi đầu nhỏ, nguồn MXL nghiên cứu giữ ở máy phát triển.
- Ngân sách khởi đầu cho corpus phát hành: tối đa 128 MiB toàn bộ gói; mỗi shard nén khoảng 0,25–1 MiB và chỉ mục đầu vào không quá 256 KiB. Đo thật trước khi chốt.
- Manifest release hiện tại của bản `2026-10-20-mobile` ghi 157.129.225 byte tài nguyên. Script deploy hiện giới hạn archive 250 MiB và giải nén 512 MiB; gói mới phải qua chính các kiểm này, không bỏ kiểm để phát hành.
- GitHub Pages giới hạn site công bố 1 GB theo [tài liệu GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). Nếu kho tuyển vượt ngân sách, phát hành gói thiết yếu trước; mở rộng hosting gói dữ liệu là bước triển khai riêng.
- Ghim một bộ app/corpus/rules/native version trong phiên; không trộn shard của bản mới khi user đang chơi.
- Build release có nguồn, thông báo giấy phép và báo cáo coverage; chạy `verify-release.py`, chuẩn bị Pages bằng đường release đã có, rồi smoke test URL online.
- Giữ release/manifest trước để rollback app và corpus cùng lúc. Không xóa project hay lịch sử người dùng khi rollback.

**Xong khi:** mở link trực tiếp tới `#/exercises`, chọn grade/x–y, chơi đúng nốt/BPM, nghe và full sheet đều đạt trên bản online; các grade công bố đạt đúng chỉ tiêu ghi trong coverage. Chỉ báo hoàn tất bản đầy đủ khi cả G1–G8 đủ điều kiện.

## File dự kiến thêm và phần code dùng lại

Các đường dẫn chưa tồn tại dưới đây là đề xuất, không phải file đã được tạo:

```text
buildscripts/pianist/curriculum/
  download.py       normalize.py       extract.py
  classify.py       audit_native.py    package.py
  requirements.lock
scores/curriculum/
  sources.lock.json grades.v1.json
packages/exercise-generator/
  model.ts          selector.ts        transforms.ts
  constraints.ts    dedup.ts           musicxml.ts
packages/exercise-worker/worker.ts
packages/practice-stream-v2/
  host.ts           replay-handoff.ts  model.ts
apps/pianist-web/src/exercises/
  ExerciseHome.tsx   ExerciseSession.tsx
  controller.ts     queue.ts          storage.ts
apps/pianist-web/tests/
  exercise-generator.test.ts
  exercise-stream.test.ts
  exercise-storage.test.ts
tests/browser/pianist/
  exercise-flow.cjs  exercise-mobile.cjs
```

| Code đã có | Vai trò và thay đổi dự kiến |
|---|---|
| [main.tsx](../../apps/pianist-web/src/main.tsx), [workspace.ts](../../apps/pianist-web/src/workspace.ts) | Route/lối vào, vòng đời session, bảo toàn editor và MIDI routing |
| [engine-bridge](../../packages/engine-bridge/index.ts), [webapi.cpp](../../src/web/appjs/webapi.cpp), [practicesnapshot.cpp](../../src/web/appjs/practicesnapshot.cpp) | Mở rộng snapshot project tạm theo kết quả Q0 |
| [practice](../../apps/pianist-web/src/practice/PracticeScreen.tsx), [Sheet](../../apps/pianist-web/src/practice/Sheet.tsx), [NoteInk](../../apps/pianist-web/src/practice/NoteInk.tsx) | Tái dùng sheet, glyph highlight, camera; thêm biên câu và preview |
| [score-adapter](../../packages/practice-engine-v2/score-adapter.ts), [engine](../../packages/practice-engine-v2/engine.ts) | Tái dùng tạo target và bộ chấm; host nối timeline phải chứng minh parity |
| [controller](../../apps/pianist-web/src/practice/controller-v2.ts), [audio-clock](../../apps/pianist-web/src/platform/audio-clock-v2.ts) | Tách chức năng vòng đời để session quiz giữ một mốc đồng hồ |
| [native-audition](../../apps/pianist-web/src/practice/native-audition.ts) | Nghe đúng câu MuseScore; kiểm quyền dùng native project |
| [offline](../../apps/pianist-web/src/platform/offline.ts) và [deploy-pages](../../buildscripts/pianist/deploy-pages.py) | Thêm tải gói có lựa chọn, version/hash và kiểm release; giữ giới hạn hiện có |

## Thứ tự thực hiện và mốc bàn giao

`Q0 → Q1 → Q2 → Q3 → Q4 → Q5 → Q6 → Q7 → Q8 → Q9`.

- **Bàn giao kho:** Q1–Q3 có MXL cục bộ, hash/nguồn, phân grade và báo cáo phần thiếu.
- **Bàn giao bộ sinh:** Q4–Q5 có câu tái lập theo seed, đúng x–y, ký âm và hàng đợi.
- **Bàn giao trải nghiệm tập:** Q6–Q7 có luồng liên tục và UI trên web.
- **Bàn giao bản online:** Q8–Q9 có báo cáo kiểm, coverage công bố đúng và rollback.

Sau mỗi mốc lưu commit riêng và cập nhật bảng done/pending bằng bằng chứng thực tế. Thời gian tải phụ thuộc mạng; thời gian tuyển đủ G1–G3 phụ thuộc tỷ lệ đoạn đạt sau lọc; thời gian nối native và timeline chỉ được ước lượng đáng tin sau Q0. Không đặt ngày hoàn thành trước khi đo các phần này.
