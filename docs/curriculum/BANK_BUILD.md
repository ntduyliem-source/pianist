# Chạy và mở rộng kho bài tập K

> **Hướng dẫn build kho cũ, đã bị thay thế về yêu cầu nội dung.** Đọc [kế hoạch xây lại hai khuông](GRAND_STAFF_BANK_PLAN.md) trước khi triển khai. Các lệnh bên dưới vẫn tạo/đóng gói bank v1 có bài một tay; không chạy chúng rồi coi đó là kho mới. Script/schema thay thế chưa được triển khai trong lượt lập kế hoạch ngày 21/10/2026.

Lệnh chạy từ thư mục gốc repository. Đây là phần xây kho offline K1–K5; không thay đổi editor, màn tập hoặc bộ chấm khi chơi.

## Chạy tiếp và đóng gói

```powershell
.tools/curriculum-python/Scripts/python.exe -X utf8 buildscripts/pianist/complete-curriculum-bank.py --workers 4
```

Lệnh lần lượt kiểm nhận diện piano cho nguồn chưa đọc được, đọc bằng music21 hiện có, kiểm cache, quét/xuất MXL bằng bộ grade hiện có, đối chiếu MuseScore/renderer, rồi tổng kiểm và đóng gói. Nguồn lỗi có lý do riêng. Mọi file nguồn đang giữ phải có kết quả trước khi tạo gói; một lần gọi hoàn tất không có nghĩa mọi ô đã đạt quota.

Kho chính `artifacts/curriculum-prepared/releases/reading-options-v1/` được dùng ở chế độ chỉ đọc. Kết quả bổ sung nằm ở `artifacts/curriculum-prepared/releases/reading-supplement-v1/`. Bài cũ, kể cả một tay/một khuông hoặc có nguồn đã được người dùng xóa, vẫn giữ nguyên byte và hồ sơ kiểm trước đó.

Theo dõi số bài **đã được ghi vào SQLite**, gộp theo ID nội dung và bỏ trùng giữa hai lô:

```powershell
.tools/curriculum-python/Scripts/python.exe -X utf8 buildscripts/pianist/reading-bank-progress.py --markdown
```

Nhật ký từng bước ở `artifacts/curriculum-k-completion/`; kết quả cuối của lệnh ở `result.json`. Bước quét có retry hữu hạn cho lỗi worker; checkpoint thiếu vẫn làm bước đóng gói thất bại. Một checkpoint `normalization-unavailable` được mở lại khi đã có kết quả phân tích hợp lệ, không phải trạng thái bỏ qua vĩnh viễn.

Chạy lại mặc định tái sử dụng cả những kết quả lỗi importer/giới hạn đã ghi, không lặp vòng timeout trên cùng file. Dùng `--retry-parser-failures` nếu chủ động muốn thử lại các trường hợp đó một lượt. Đầu vào mới hoặc cache sai hash vẫn tự được đọc lại.

## Bài tập và chỉ mục nằm ở đâu

Đọc `artifacts/curriculum-bank/latest.json` để lấy đường dẫn bản đóng gói hiện tại. Mỗi bản có ID `reading-mxl-v1-<hash>` và thư mục riêng:

```text
artifacts/curriculum-bank/
  latest.json
  reading-mxl-v1-<hash>.zip
  releases/reading-mxl-v1-<hash>/
    index.json                       # Danh sách 56 lựa chọn; điểm vào nhỏ cho web sau này
    indexes/g1/n4.json               # ID, tay và metadata bài của lựa chọn G1/~4
    indexes/g1/n6.json               # ... đủ 8 grade × 7 độ dài
    exercises/<id>.mxl              # Mỗi bài một MXL
    catalog.json                    # Catalog đầy đủ để tra cứu/đối soát offline
    coverage.json                   # Số thực, ô thiếu, profile × tay × độ dài
    attribution.json                # Nguồn, tác giả, license được ghi trong catalog nguồn
    reading-bank.v1.json            # Chính sách nội dung đã dùng
    grades.v3.json
    length-buckets.v2.json
    manifest.json                   # Hash và kích thước từng tài nguyên
  audits/reading-mxl-v1-<hash>/
    verification.json
    source-outcomes.json
    duplicates.json
    bank-audits.json
    proofs/<id>.json.gz
```

Gói dành cho web không cần chứa SQLite, staging, nguồn MXL nguyên bài, ảnh render hoặc hồ sơ kiểm nặng. Web sau này có thể đọc `index.json`, tải chỉ mục đúng grade/độ dài, lọc tay, chọn ID rồi tải một MXL. `catalog.json` đầy đủ phục vụ kiểm kê, không bắt buộc tải toàn bộ khi mở màn luyện.

Gói K5 gốc giữ nguyên `requiresAppIntegration: true` và `local-only` như tại thời điểm bàn giao; không sửa gói đã kiểm. Bản tích hợp web được tạo riêng bởi `web-reading-bank.py`, dùng nguyên byte MXL và bổ sung chỉ mục có hash, tay, nguồn, vị trí ô nhịp. Web local dùng đủ 5.460 bài tại `pianist.html#/exercises`. Chọn grade → tay → độ dài → chế độ → Mở bài tập → Tập. Tự chuyển có thể tắt; mỗi bài đếm vào riêng.

```powershell
python buildscripts/pianist/web-reading-bank.py
```

Lệnh mặc định đọc `artifacts/curriculum-bank/latest.json`, ghi `build.artifacts/curriculum/manifest.json` và thư mục `web-<hash>/indexes`, `exercises`. Chỉ manifest của bản kho mới thay đổi; phiên đang mở ghim bản đã tải. Thêm nguồn rồi chạy lại K và lệnh này để cập nhật web; không sửa luật grade để lấp ô thiếu.

Trình duyệt chỉ tải chỉ mục cần dùng và chuẩn bị trước tối đa ba bài kế qua `ExerciseRenderer` Worker. Chống lặp ưu tiên ID chưa gặp, tránh nhóm mẫu/nguồn vừa gặp khi còn lựa chọn; hết một vòng thì dừng, không âm thầm lặp. IndexedDB `pianist-exercises-v1` tách biệt thư viện: lưu lựa chọn, tối đa 10.000 ID đã gặp và kết quả chi tiết gần nhất. Đổi màn/nhóm hủy tác vụ cũ; phím MIDI còn giữ đi vào lượt mới dưới dạng state-only theo router hiện hữu.

Nút **Nhập gói K5 ZIP** nhận ZIP gốc, giới hạn giải nén, kiểm SHA-256 toàn bộ file rồi lưu trong một transaction. Không gửi file lên server. Kho cũ vẫn được giữ nếu import lỗi. Gói công khai chỉ gồm 42 bài từ 12 nguồn OpenScore/Lieder tại commit `38c5db510224d9facdc4b08d741fc788cfb58ea8`, đối chiếu [LICENSE CC0](https://github.com/OpenScore/Lieder/blob/38c5db510224d9facdc4b08d741fc788cfb58ea8/LICENSE.txt); không tự đổi trạng thái 685 nguồn PDMX đang pending-review hay 1 nguồn cá nhân. Khi dùng online, nhập ZIP K5 để có đủ 5.460 bài riêng trên thiết bị. `stage-release.py` luôn tạo lại tập công khai, loại kho local khỏi bundle; `verify-release.py --public` kiểm lại điều kiện nguồn. Service worker tải bài theo nhu cầu, cache tối đa 32 tài nguyên kho, không tải toàn kho lúc cài offline.

Nghe mẫu dùng engine MuseScore khi bộ chấm đã dừng. Editor được tự lưu và giữ bản MSCZ để phục hồi nguyên nội dung sau khi nghe bài tập; thao tác tải lại native document **không giữ undo/selection cũ của editor**. Chấm thường dùng renderer riêng, không thay document editor. Chưa triển khai nghe đồng thời với chấm hoặc timeline liên tục xuyên nhiều bài.

Kiểm tích hợp: `node tests/browser/pianist/exercises-web.cjs`; bằng chứng tại `artifacts/exercises-web/`. Test gồm route, ô rỗng, MIDI BPM và Đúng nốt, highlight, full sheet, pedal, audio native, phục hồi nội dung editor, nhập ZIP, refresh và viewport mobile. Đây là trình duyệt giả lập kích thước màn hình, chưa thay kiểm đàn MIDI/điện thoại thật.

Kiểm lại một thư mục release cụ thể:

```powershell
.tools/curriculum-python/Scripts/python.exe -X utf8 buildscripts/pianist/package-reading-bank.py --verify artifacts/curriculum-bank/releases/<release-id>
```

Lệnh kiểm hash từng file, danh sách file, liên kết catalog–MXL, đủ 56 chỉ mục và phân nhóm tay. Khi build ZIP, từng mục ZIP được đọc lại và kiểm hash so với manifest. Không lấy số ứng viên/staging làm số bài đạt.

## Bổ sung MXL về sau

1. Đặt MXL mới vào một thư mục riêng, ví dụ `D:/piano-inbox`. Công cụ đọc các file `.mxl` trực tiếp trong thư mục đó; không xóa hoặc sửa file người dùng.
2. Nhập nguồn:

   ```powershell
   .tools/curriculum-python/Scripts/python.exe -X utf8 buildscripts/pianist/import-piano-sources.py --inbox D:/piano-inbox
   ```

3. Đọc kết quả `artifacts/curriculum-corpus/inbox-import.json`. Chỉ nguồn hai khuông có căn cứ piano và container hợp lệ được nhập. File một khuông, nhạc cụ khác, tên còn mơ hồ hoặc hash đã bị người dùng loại đều có lý do riêng. File trùng hash không trở thành nguồn nhạc mới.
4. Chạy lại `complete-curriculum-bank.py`. Kiểm hash các đầu vào đã có; cache chuẩn hóa, quét và native được tái sử dụng. Nội dung mới/thay đổi mới cần phân tích/quét/xuất lại. Catalog gói được tạo thành một phiên bản mới khi đầu vào hoặc kết quả thay đổi.

Nguồn nhập riêng mặc định mang quyền sử dụng `personal` và license `unknown`; công cụ không tự đoán URL, tác giả hoặc quyền phát hành. Các trường này có thể được bổ sung có căn cứ trong catalog nguồn trước khi xuất bản. Không bật lại lệnh tải bulk cũ trên kho đã dọn.

## Nhận diện nhạc cụ mà không sửa nhạc

Đối với các nguồn bị bộ đọc cũ từ chối vì tên piano, `curriculum_source_adapter.py` dùng tên/bản dịch từ taxonomy MuseScore đang có trong repo. Nguồn không ghi tên cần metadata đã kiểm hash cùng cấu trúc hai khuông Sol/Fa phù hợp và không có khai báo nhạc cụ mâu thuẫn. Nhãn còn mơ hồ ở trạng thái `identity-review`.

Bản dùng cho importer có thể đổi **chỉ text của `part-name` và `instrument-name` thành `Piano`**. Bản gốc không thay đổi. Hash của toàn bộ cây XML sau khi bỏ hai loại text này phải giống nhau trước/sau: nốt, cao độ, trường độ, bè, backup/forward, nhịp, tempo, slur, pedal, MIDI và ghi công được giữ. Hồ sơ lưu hash bản gốc, bản dành cho importer, metadata và danh sách text đã đổi. K5 đọc lại cả hai để kiểm độc lập trước khi đóng gói.

Không sửa parser music21, bộ phân đoạn upstream, tiêu chí grade, tìm ngón hoặc thuật toán chấm BPM. Mọi bài mới vẫn phải đi qua phép chiếu từ nguồn, đọc lại MXL và kiểm native MuseScore/timeline/glyph như lô trước.

## Điều kiện hoàn thành và phần còn thiếu

- **Quét/đóng gói hoàn tất:** mọi nguồn hiện tại có kết quả, mọi checkpoint hoàn tất giải thích được toàn bộ ứng viên, file/catalog/proof nhất quán, MXL được kiểm, ZIP được kiểm.
- **Quota hoàn tất:** cả 56 ô grade × độ dài có ít nhất 300 nội dung khác nhau. Ô vượt không bù ô thiếu. Trạng thái `quotaComplete` tách riêng khỏi `packagingComplete`.
- Hai bản của cùng nội dung không tăng số bài. Bản được chọn giữ file và bộ grade trong chính hồ sơ của nó; phiên bản khác lưu ở báo cáo trùng. Không cộng một nhãn grade từ bản khác vào file được chọn khi chưa có hồ sơ gắn với file đó.
- Quota 300 và các nhóm độ dài là yêu cầu sản phẩm. Công cụ không tự nới grade, lặp nốt, đổi nhãn bài hoặc gọi các biến thể trùng là ý nhạc mới để bù kho thiếu.
