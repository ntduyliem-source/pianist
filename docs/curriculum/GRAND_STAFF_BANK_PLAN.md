# Xây lại kho bài tập: mỗi MXL luôn đủ hai khuông piano

Quyết định ngày **21/10/2026**. Đây là **kế hoạch thay thế**, chưa phải báo cáo đã tạo kho mới. Tài liệu này thay quy tắc xây kho trong kế hoạch K/Q trước đó khi có mâu thuẫn. K1–K6 bên dưới là các bước của **lần xây lại**, không kế thừa trạng thái hoàn thành của K cũ.

**Yêu cầu bắt buộc:** mỗi bài là một đoạn nhạc thật giữ nguyên cả hai khuông piano. Người dùng chọn **hai tay / tay phải / tay trái lúc tập**, trên cùng một MXL. Mặc định mở bài là hai tay.

**Điều kiện nguồn chưa được chứng minh:** kiểm trực tiếp trên đĩa ngày 21/10/2026 có **14.960 MXL nguồn** trong `artifacts/curriculum-corpus/raw/objects/`, tổng 152.224.542 byte. Đối chiếu catalog theo hash đang còn: 14.940 PDMX, 3 OpenScore/Lieder và 17 thư viện người dùng. Đây là nguồn hai khuông đã giữ lại, **chưa phải 14.960 bài hoặc bộ giáo trình đã xác nhận phù hợp các grade mới**. Chưa có ma trận số đoạn hai tay đạt từng grade × độ dài; không được hứa từ nguồn này sẽ tạo đủ 300 cho mọi ô. Con số 16.800 bên dưới là mục tiêu thu thập, chưa phải sản lượng đã chứng minh khả thi. K1–K2 phải đánh giá khả năng tuyển đoạn và ghi rõ dữ liệu thiếu trước khi quyết định khối lượng batch. Nếu cần thêm nguồn, phải xác định loại nội dung thiếu rồi khảo sát nguồn bổ sung; chưa có danh sách nguồn mới được xác minh/tải trong lượt này.

## 1. Sai ở đâu và thay thế những gì

Kiểm chỉ mục local ngày 21/10: 5.460 bài gồm **5.455 bài một tay và 5 bài hai tay**. Nguồn hai khuông đã bị phép trích chọn tay biến thành bài một khuông. `curriculum_auto.py::configurations` có lựa chọn một dòng; `curriculum_bank.py::extract` xét profile theo số dòng rồi gọi `project_xml` với những dòng đã chọn. Kiểm cũ chỉ chứng minh giữ đủ nốt của **tay đã chọn**, không chứng minh giữ đủ phần piano. Web tiếp tục khóa tay theo `entry.hand` trong `exercises/settings.ts`.

Kho `reading-mxl-v1-be09d10ff801b28a` bị **loại khỏi chuẩn kho mới**. Toàn bộ số đếm, nhãn grade và chứng cứ của nó không được chuyển thành kết quả đạt của lần xây lại, kể cả 5 bài hai tay. Có thể giữ artifact cũ để đối chiếu lỗi; không trộn vào kho mới hoặc tự dùng làm kho dự phòng.

Tái sử dụng MXL nguồn còn giữ, cache đọc nguồn đúng hash và các thư viện phân tích/render đã kiểm. **Xuất lại và kiểm lại 100% bài tập từ nguồn**, không bổ sung khuông trống vào bài cũ. Không lấy lại nguồn người dùng đã xóa. Trong lượt lập kế hoạch này chưa xóa file, đổi kho đang phục vụ hay triển khai web.

## 2. Hợp đồng của một bài tập

- Một đoạn liên tục từ **một phần piano có đúng hai khuông** của nguồn. Hai khuông có cùng mốc bắt đầu/kết thúc và giữ nguyên tương quan thời gian.
- **Cả hai tay phải có nốt thực trong đoạn.** Được có ô nghỉ hoặc hai tay luân phiên theo nguyên tác; không nhận đoạn có một tay nghỉ toàn bộ rồi gọi đó là bài hai tay.
- Giữ toàn bộ nốt, hợp âm, bè, rest, tie, slur, trường độ, dấu hóa, khóa, nhịp, tempo, pedal và số ngón có sẵn thuộc đoạn. Không bỏ bè khó, chuyển quãng tám, thêm đệm, tìm ngón hay đơn giản hóa nhạc để lọt grade.
- Khuông không tự đồng nghĩa với tay. Phải có ánh xạ hai khuông sang tay được kiểm từ nguồn. Cross-staff, chéo tay, phân tay mơ hồ hoặc ký hiệu chưa được importer/exporter hỗ trợ: ghi lý do và chờ xử lý; không đoán hoặc xóa ký hiệu.
- Điểm cắt phải an toàn cho **cả hai khuông và mọi bè**. Một dấu nghỉ/kết câu ở tay phải không đủ nếu tay trái còn tie, slur, nốt giữ hoặc pedal xuyên biên. Nếu mở rộng được đến biên hợp lệ thì xét lại toàn đoạn; không cắt để vừa số nốt.
- Mỗi hệ nhạc được render thành cặp hai khuông, kể cả khi một khuông nghỉ trong hệ đó. Số hệ trên màn hình phụ thuộc chiều dài và viewport; không ép cả bài thành đúng một hệ.

## 3. Grade, độ dài và lựa chọn tay

**Grade mô tả độ khó của đoạn đầy đủ khi chơi hai tay.** Phân tích riêng từng tay, sau đó kiểm phối hợp, mật độ, nốt giữ và nhịp của cả hai. Không lấy grade của giai điệu tay phải gán cho đoạn có tay trái khó hơn; không lấy trung bình để che một tay vượt giới hạn.

Chọn tập một tay chỉ giảm phần phải chơi, không đổi nội dung hoặc nhãn grade của bài. UI ghi rõ “G3 · đoạn hai tay; đang tập tay trái”. Bài đó không được quảng cáo là đã đạt G3 hai tay khi người dùng mới hoàn thành một tay.

Giữ **56 lựa chọn grade × độ dài**, mỗi lựa chọn tối thiểu **300 MXL hai khuông khác nhau**. Tay là chế độ tập của cùng bài, không phải ba kho riêng và không nhân một bài thành ba bài để tính quota.

| Lựa chọn độ dài của cả bài | Số nốt cần đánh khi chơi hai tay |
|---|---:|
| Khoảng 4 | 3–5 |
| Khoảng 6 | 6–8 |
| Khoảng 10 | 9–14 |
| Khoảng 20 | 15–24 |
| Khoảng 30 | 25–39 |
| Khoảng 50 | 40–69 |
| Khoảng 100 | 70–120 |

Đếm bằng `createTimeline(..., hand: 'both').targets.length` sau khi MuseScore mở chính MXL đã xuất. Mỗi phím trong hợp âm là một target; phần nối tie không thêm lần đánh; các ký âm cùng cao độ/cùng thời điểm được hợp nhất theo adapter hiện có. Lưu thêm số target tay trái/phải và số nốt ký âm từng khuông. Không mặc định tổng target hai tay luôn bằng cộng hai số riêng.

**Nhãn độ dài luôn là của đoạn đầy đủ.** Ví dụ minh họa: bài có 20 target, gồm 12 phải và 8 trái, vẫn thuộc “khoảng 20”; chọn trái thì UI ghi “8 nốt cần chơi / 20 nốt cả bài”. Không lén chuyển sang bài khác khi đổi tay. Quota 300 và các khoảng nốt là yêu cầu sản phẩm, không phải liều tập được khoa học chứng minh.

## 4. Viết lại tiêu chí G1–G8 cho nội dung hai tay

Giữ định hướng học quãng trong ngữ cảnh, nhưng **bỏ điều kiện một dòng/một tay của profile cũ**. Mọi hàng dưới đây đều giữ hai khuông và có nốt ở cả hai tay. Đây là đặc tả thiết kế để chuyển thành các profile có phiên bản ở K1, không phải tuyên bố bộ lọc mới đã tồn tại.

| Grade | Trọng tâm phải xuất hiện trong đoạn | Ràng buộc phần còn lại |
|---|---|---|
| G1 | Nốt lặp và bước liền; có ít nhất một bước liền thật. | Mỗi tay đơn âm, vùng năm bậc quen quanh C3/C4, giọng C; nhịp cơ bản R0–R2. Các profile phối hợp tách riêng: luân phiên, cùng thời điểm đánh, hoặc một tay giữ nốt dài trong lúc tay kia đi bước. Chưa có hai chuỗi tiết tấu độc lập. |
| G2 | Quãng ba xen bước liền; hoặc cặp móc đơn đúng pha với cao độ G1. | Hai trọng tâm là hai profile riêng. Tay còn lại giữ yêu cầu G1; không đồng thời đưa vào quãng mới và phối hợp nhịp mới. |
| G3 | Quãng bốn/năm trong giai điệu hoặc mẫu rải có bằng chứng nốt cụ thể. | Mỗi tay không vượt quãng năm giữa lần đánh liên tiếp; R0–R3. Đệm đơn âm quen; mẫu hợp âm rải không được tự coi là hợp âm đánh đồng thời. |
| G4 | Vị trí ký âm mới hoặc đoạn có span mở rộng đến quãng tám với chuyển động tối đa quãng năm. | Giữ nhịp/phối hợp đã có ở G1–G3; kiểm từng tay và hóa biểu. Nhãn vị trí chỉ nói về nốt viết, không chứng nhận ngón hoặc thế tay tối ưu. |
| G5 | Hai tay có thời điểm đánh khác nhau trong mẫu nhịp đã biết; hoặc hợp âm hai nốt với giai điệu quen. | Có profile riêng cho từng mẫu phối hợp/hợp âm. Nhịp R0–R3, chuyển động giai điệu tối đa quãng năm; không gán mọi đoạn hai tay vào G5. |
| G6 | Nhảy quãng sáu, bảy hoặc tám, có đoạn trước/sau để xác định điểm đến. | Tách họ quãng/hướng; tay còn lại giữ mẫu quen. Không đưa thêm tiết tấu mới hoặc suy tốc độ chơi an toàn từ khoảng cách nốt. |
| G7 | Chấm dôi, tie qua phách, đảo phách hoặc 6/8. | Mỗi họ là profile riêng, cao độ/phối hợp đã biết; kiểm lưới phách và beat unit. Không trộn toàn bộ nhịp khó chỉ vì cùng tổng trường độ. |
| G8 | Đọc vùng dòng kẻ phụ xa hoặc phối hợp nhiều yêu cầu đã có. | Chỉ nhận tổ hợp được liệt kê rõ trong profile; mỗi tay và mọi bè phải đạt giới hạn. Không dùng G8 làm nơi chứa mọi đoạn chưa phân loại. |

R0–R7 dùng các định nghĩa tiết tấu đã ghi ở [GRADE_DESIGN.md](GRADE_DESIGN.md): cơ bản, nốt dài, rest, cặp móc đơn, chấm dôi, tie, đảo phách và 6/8. Các mô tả một tay/ngón bắt buộc trong tài liệu cũ không còn là điều kiện tuyển bài mới.

K1 phải ghi tường minh trong từng profile: quãng có cách viết, âm vực, hóa biểu, loại nhịp, mẫu onset của hai tay, số nốt đồng thời/đang giữ, số bè, ký hiệu được hỗ trợ và bằng chứng trọng tâm. Phải có ca đạt/không đạt. Không chỉ đổi `lines: 1` thành `lines: 2` rồi chạy lại bộ cũ. Khi một đoạn đạt nhiều profile, lưu các profile nhưng chỉ xếp một grade theo thứ tự/ưu tiên được chốt trong policy; mỗi nội dung chỉ thuộc một ô grade × độ dài của kho chính. Grade phải xác định bằng toàn bộ policy, độc lập với ô nào còn thiếu quota; không nâng grade chỉ vì ô dễ đã đủ 300.

**Căn cứ và giới hạn:** Faber dạy đọc bước liền, bước bỏ qua và mẫu nhạc; đây là tham chiếu sư phạm cho cách chọn trọng tâm, không phải bằng chứng xác nhận tám grade của app. [Primer Things To Know](https://pianoadventures.com/piano-books/basic-piano-adventures/primer/things-to-know/). Nghiên cứu trên 39 pianist/người học hướng chuyên nghiệp ghi nhận khoảng đọc trước lớn hơn ở bản dễ; từ đó thiết kế suy luận rằng nên giữ các yêu cầu khác quen khi giới thiệu một yêu cầu mới. Nghiên cứu không xác nhận ngưỡng grade, số nốt hay số bài tối ưu cho người mới. [Imai-Matsumura & Mutou, 2023](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0285043). Yêu cầu giữ hai khuông và cho người dùng chọn tay là quyết định sản phẩm của người dùng, không gắn nhãn “khoa học chứng minh”.

## 5. Cách quét và xuất kho

Một script xử lý hàng nguồn hữu hạn, không ngồi mở thủ công từng bài:

1. Đọc từng MXL nguồn đang giữ; kiểm hash, xác định phần piano hai khuông và đọc **tất cả bè**. Dùng cache phân tích chỉ khi hash nguồn/parser khớp. Số nguồn giữ trước lần xây lại là 14.960, phải kiểm kê lại số thực.
2. Tìm biên có bằng chứng từ nhạc gốc; các gợi ý music21 Segmenter/LBDM chỉ là ứng viên, không chứng nhận câu nhạc. Ghép mọi cặp biên hợp lệ trong khoảng độ dài hỗ trợ, kiểm an toàn trên cả hai khuông. Không chỉ lấy đoạn đầu tiên của mỗi bài, không trượt cửa sổ đúng 4/6/10 nốt rồi chặt nhạc.
3. Với từng đoạn, đọc nguyên hai tay, xét các profile theo policy và gán grade/độ dài ổn định, rồi kiểm ô đó còn cần xuất thêm hay không. Nếu có bè vượt mức, từ chối đoạn cho profile đó; không bỏ bè để làm nó đạt.
4. Xuất **ngay** MXL nguyên hai khuông. Đọc lại và so từng sự kiện với toàn bộ phần piano gốc trong khoảng đã chọn. Mở bằng MuseScore, kiểm hai khuông/render, timing, pedal và cả ba chế độ tay. Chỉ qua hết mới đưa vào catalog và tăng số.
5. Giữ mọi đoạn đạt của nguồn đang xử lý cho các ô còn thiếu ở lúc bắt đầu nguồn, kể cả vượt 300. Chống trùng nội dung; đoạn chồng lấn/motif giống nhau có nhóm để tránh gặp liên tục. Tên bài, tay được chọn hay đổi ID không làm tăng số bài.
6. Checkpoint sau từng nguồn; cập nhật ma trận 8 × 7 số **đã xuất và kiểm thành công**. Dừng sạch khi cả 56 ô đạt 300, hoặc hết hàng nguồn. Nếu hết nguồn vẫn thiếu, báo ô thiếu và các lý do chính để bổ sung đúng loại nguồn; không nới rule, nhân bản hay chạy vòng lại vô hạn.

Đích là tối thiểu **16.800 bài khác nhau** trong 56 ô theo quy tắc một bài/một grade/một nhóm độ dài. Chưa có bằng chứng kho nguồn hiện tại sẽ đủ, đặc biệt các đoạn rất ngắn nhưng đủ hai tay hoặc G1 dài 100 nốt. `quotaComplete` chỉ được bật từ số kiểm thực tế.

## 6. Các bước triển khai và tiêu chí bàn giao

| Bước mới | Việc làm | Bàn giao đủ để kiểm |
|---|---|---|
| K1 — Đổi hợp đồng và bộ rule | Tạo schema kho hai khuông và profile grade mới; quy định cách đếm, trùng, biên và phân tay; thêm ca hồi quy chứng minh exporter không bỏ tay/bè. | Policy có phiên bản; test từ chối bài một khuông, khuông thêm giả, một tay nghỉ toàn bài và tay đệm vượt grade. Chặn đưa bank v1 vào luồng phát hành mới; không sửa manifest của release lịch sử. |
| K2 — Kiểm lại đầu vào | Kiểm kê nguồn còn trên đĩa; đọc/cache theo hash; lưu đủ hai khuông/bè và thông tin nguồn. | Mỗi nguồn có kết quả đọc hoặc lý do lỗi rõ ràng; không coi các bài tập cũ là nguồn. |
| K3 — Trích toàn bộ đoạn phù hợp | Viết selection/export luôn lấy cả phần piano; xét cả hai tay theo policy mới. Chạy theo từng nguồn với checkpoint mới. | Mỗi ứng viên chỉ tới nguồn/biên/rule cụ thể. Kiểm một lô hồi quy nhỏ rồi tiếp tục batch; lô nhỏ không được gọi là kho hoàn thành. |
| K4 — Xuất và kiểm nối ngay sau K3 | Đọc lại MXL, đối chiếu toàn phần piano và mở native MuseScore/renderer. K3–K4 chạy nối nhau cho từng nguồn. | MXL hai khuông thật, toàn bộ bè giữ nguyên, timeline ba chế độ đúng. Báo số theo grade/độ dài định kỳ trong lúc chạy. |
| K5 — Đóng gói kho mới | Loại trùng, kiểm 56 chỉ mục, nguồn/license, hash, ZIP và quota; tạo release mới chỉ chứa bài đạt chuẩn mới. | Catalog, ma trận số lượng/thiếu, proof và ZIP kiểm được. Không nhập lại 5.460 bài cũ để bù số. |
| K6 — Thay kho trên web | Dùng MXL hai khuông; mở khóa chọn tay trong cấu hình tập, mặc định hai tay; migration ngân hàng đã nhập/cache và manifest. | Cùng một bài đổi trái/phải/hai tay được, sheet luôn đủ hai khuông. Test Wait/BPM, highlight, nghe, full sheet, pedal, tự chuyển, desktop/mobile; sau đó mới cập nhật online. |

**Việc tiếp theo khi triển khai:** K1–K2 của bản này. Chưa chạy batch tạo hàng nghìn bài trước khi ca kiểm “nguồn hai khuông → MXL hai khuông → chuyển đủ ba chế độ tay” qua được.

## 7. File trong repository và đầu ra dự kiến

Các tên mới dưới đây là đường dẫn **dự kiến**, chưa phải file/script đã triển khai:

```text
scores/curriculum/
  grand-staff-bank.v1.json             # Chính sách mới, không dùng lại rule tuyển một tay
  grand-staff-grades.v1.json           # Profile hai tay, giới hạn và ưu tiên grade

artifacts/curriculum-bank/
  grand-staff-latest.json              # Điểm vào mới, đổi sau khi release qua kiểm
  releases/grand-staff-v1-<hash>/
    exercises/<content-id>.mxl        # Mỗi bài đúng một MXL đủ hai khuông
    index.json
    indexes/g1/n4.json                # ... đủ 56 ô grade × độ dài
    catalog.json                     # Grade của đoạn hai tay; số nốt cả bài/trái/phải
    coverage.json                    # Chỉ tính bài đã kiểm; số còn thiếu từng ô
    attribution.json
    manifest.json
  audits/grand-staff-v1-<hash>/
    proofs/<content-id>.json.gz       # Đối chiếu toàn phần piano, native, render

artifacts/curriculum-prepared/releases/grand-staff-v1/
  bank.sqlite                        # Checkpoint mới, không tái dùng kết quả tuyển v1
  staging/                           # Chưa được tính vào quota
  scans/
  progress.json
```

Catalog cần `schemaVersion`, `gradeBasis: both`, `contentHands: both`, `staffCount: 2`, ánh xạ staff/tay và bè, số target `both/right/left`, độ dài, nguồn/ô nhịp, phiên bản rule, hash nội dung và proof. ID phản ánh đoạn đầy đủ; thay mode tay/BPM không tạo ID MXL mới.

Những nơi phải sửa: `curriculum_auto.py`, `curriculum_bank.py`, `curriculum_reading.py`, `curriculum_grades.py`, `curriculum_fast_checks.py`, `curriculum_fragments.py` và các lệnh prepare/audit/package/web bank. Đặc biệt không dùng nguyên phép export đang gom voice của cùng staff hoặc chỉ so sánh selected lines: proof mới phải so với **mọi sự kiện piano gốc trong đoạn**.

## 8. Web dùng cùng bài cho ba lựa chọn tay

`apps/pianist-web/src/exercises/bank.ts` nhận schema mới và kiểm `staffCount`/nội dung; `settings.ts` nhận lựa chọn tay từ người dùng thay vì khóa theo `entry.hand`. `Exercises.tsx` tách “nội dung luôn hai tay” khỏi “tay đang tập”. Grade/độ dài lấy theo toàn đoạn; số target đang chấm lấy theo lựa chọn thực.

Dùng chung `createTimeline`, `PracticeController` và bộ chấm của tab Tập piano. Timeline chỉ lấy target của tay chọn, giữ thời điểm gốc và các khoảng nghỉ; nốt tay không chọn không trở thành nốt bị bỏ lỡ. MIDI không biết tay nào bấm phím: app chấm theo pitch/thời gian/target, không hứa nhận diện tay vật lý. Trường độ, pedal và ngưỡng BPM giữ logic hiện có.

Đổi tay khi lượt đã dừng, dựng lại timeline và bắt đầu lượt mới, không sửa kết quả giữa chừng. Sheet vẫn hiển thị cả hai khuông, đánh dấu rõ phần đang tập. Kết quả/đã gặp lưu kèm chế độ tay; hoàn thành tay trái không được tính hoàn thành hai tay. Nghe mẫu MuseScore giữ nguyên đoạn đầy đủ; không tự thêm chức năng đệm giả vào bộ chấm.

K6 phải xử lý cả manifest được host, gói ZIP người dùng đã nhập và service worker/IndexedDB. Bank v1 trong trình duyệt không được âm thầm lấn bank mới; yêu cầu thay gói khi không đúng schema. Chỉ đổi con trỏ kho sau khi kiểm trọn gói mới. Không tự xóa thư viện bài hát hoặc lịch sử tập cá nhân.

Nghiệm thu trên **cùng MXL**: nhìn đủ hai khuông; chọn phải/trái/hai tay cho ra đúng target và thời gian; nhấn đúng MIDI mô phỏng highlight đúng nốt; tay không chọn không tạo miss; tie/rest/hợp âm/beat unit/pedal đúng; tự chuyển không đổi lựa chọn tay; mobile/full sheet vẫn đủ cặp khuông. MIDI thật tiếp tục để sau theo yêu cầu trước.
