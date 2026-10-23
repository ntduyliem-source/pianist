# Kế hoạch hỗ trợ ABC và MusicXML trong Pianist Web

> **Tài liệu theo mốc:** giữ để truy vết quyết định và kết quả tại thời điểm viết. Hướng dẫn vận hành, kiến trúc và pipeline đang dùng nằm ở [tài liệu hiện hành](current/README.md); không dùng số lượng hoặc checklist cũ thay cho catalog/manifest hiện tại.

Cập nhật: 19/10/2026. Trạng thái: **A1 đạt profile giới hạn; A2–A3 hoàn thành; A4–A7 hoàn thành trong profile đã đối chiếu**. Bằng chứng và giới hạn: [ABC_CONVERTER_RESULTS.md](ABC_CONVERTER_RESULTS.md), [ABC_MUSICXML_RESULTS.md](ABC_MUSICXML_RESULTS.md). Commit A1: `fb526afc`; A3: `ac14354f`, nghiệm thu `80cd335a`; A4: `8ad8b2be`; A5: `83e07db1`; A6: `9834e38b`. Phố Xa ABC không đạt fidelity; MXL gốc vẫn dùng bình thường. MIDI thật và HTTPS tiếp tục để sau.

Mục tiêu: người dùng nhập ABC hoặc MXL/MusicXML vào cùng thư viện, mở bằng editor MuseScore, sửa và lưu, rồi tập bằng chế độ Đúng nốt hoặc BPM. Màn tập riêng, chỉ đọc. Dữ liệu sau chỉnh sửa là nội dung được dùng để tập và xuất file.

## 1. Mốc an toàn và trạng thái hiện tại

Commit trước thay đổi ABC: **`f87189eefc45b64e828ebf6d196016d5f20c3985`** trên nhánh `pianist/m0-web`.

Commit này giữ màn tập v2, full sheet, camera theo system, A–B, bàn phím/pedal, và highlight đúng nét nốt từ SVG MuseScore. Có 20 file thay đổi, gồm exporter SVG native và các kiểm thử liên quan.

Kiểm tra lại ngày 19/10/2026:

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` trong `apps/pianist-web` | 83/83 đạt, không bỏ qua test; có đối chiếu C#/Python upstream và MIDI mô phỏng qua Worker |
| `npm run build` trong `apps/pianist-web` | TypeScript và Vite đạt |
| `git diff --cached --check` trước commit | Đạt |
| Biên dịch lại native WASM, kiểm trình duyệt, đàn MIDI thật, HTTPS trong lượt lập kế hoạch này | Không chạy; bằng chứng trình duyệt trước đó nằm trong `PIANIST_WEB.md` |

Commit lưu mã nguồn và tài liệu được Git theo dõi. Các thư mục bị ignore như `build.artifacts`, `artifacts`, `examples/local` và dữ liệu thư viện IndexedDB không nằm trong commit. Phố Xa local vẫn được giữ ở máy, không đưa vào gói public.

Ở mốc A0, `platform/files.ts` và bộ chọn file chỉ nhận MXL/XML/MusicXML/MSCZ/MSCX. Sau A2, mọi điểm mở/kéo thả nhận thêm ABC một bài, chuyển qua Worker rồi lưu MSCZ và giữ nguyên bytes nguồn. A3 bổ sung chọn nhiều bài theo index, chuẩn bị native độc lập và commit cả lô nguyên tử. A4 xuất ABC từ revision đang sửa và chỉ cho tải khi nhập lại giữ đúng dữ liệu nhạc được đối chiếu. A5 đối chiếu tập qua bộ chấm production; A6 đưa runtime vào bộ offline được kiểm hash.

## 2. Phạm vi cần hoàn thành

| Khu vực | Hành vi sau triển khai |
| --- | --- |
| Nhập bài | Nút mở file và kéo thả nhận `.abc`, `.mxl`, `.musicxml`, `.xml`, `.mscz`, `.mscx`; đi chung một luồng kiểm tra và mở bài |
| Thư viện | Bài từ ABC hoặc MXL có thể mở lại, sửa, tập, đổi tên, lưu bản sao, sao lưu/khôi phục như nhau; giữ nguồn gốc từng bài |
| ABC nhiều bài | Hiển thị danh sách bài trong file để chọn một hoặc nhiều bài; mỗi bài thành một project; không âm thầm chỉ lấy bài đầu |
| Editor | Sửa nốt trên sheet MuseScore cho cả hai nguồn; autosave, recovery, undo/redo và lưu thư viện dùng bản dự án MSCZ |
| Xuất file | Tiếp tục xuất MXL/MusicXML/PDF/MSCZ; bổ sung ABC của **nội dung hiện tại**, kèm thông báo những chi tiết không giữ được |
| Tập piano | Cùng bộ chấm Đúng nốt/BPM, nhả phím, pedal, chọn tay/bè, A–B, repeat, full sheet, highlight và camera |
| Offline | Sau khi chuẩn bị offline đầy đủ, mở ABC, sửa, xuất ABC/MXL và tập được mà không gọi dịch vụ chuyển đổi bên ngoài |

Editor ở đây là editor ký âm MuseScore, không phải thêm một màn sửa văn bản ABC. Định dạng nguồn và định dạng dự án được phân biệt rõ: mở ABC rồi sửa không có nghĩa văn bản ABC gốc tự được ghi đè.

Giữ bộ chấm `pianist-v2.osu-676f3b0.pts-b40e412.mir-fe73b35.ns-3582550.2` và các oracle upstream hiện có. Không viết matcher riêng cho ABC, không thay cửa sổ BPM, không suy đoán thời điểm nhả/pedal để bù dữ liệu mất khi chuyển đổi.

MIDI thật và hosting HTTPS tiếp tục để sau. Thu thập kho bài tập, phân level, đổi renderer sheet và tối ưu bỏ MuseScore khỏi màn tập là những phạm vi khác.

## 3. Kiến trúc và công cụ

### Luồng chung

```text
ABC → kiểm tra → chọn bài trong tunebook → abc2xml → MusicXML ┐
                                                           ├→ MuseScore → MSCZ trong thư viện
MXL / MusicXML / MSCZ → kiểm tra → nhập native ──────────────┘          ├→ editor
                                                                      └→ snapshot → bộ chấm hiện có

Nội dung hiện tại trong editor → xuất MusicXML native → xml2abc → file ABC
```

ABC được chuyển một lần khi nhập. Những lần mở lại dùng MSCZ đã lưu; đổi màn editor/tập không chuyển ABC lại. MusicXML trung gian được giải phóng sau khi nhập, không lưu thêm một bản trùng trong thư viện.

### Nguồn upstream đã xác minh

| Thành phần | Nguồn và quyết định |
| --- | --- |
| ABC → MusicXML | [abc2xml Python 2.68 của Willem G. Vree](https://wim.vree.org/svgParse/abc2xml.html), [gói nguồn](https://wim.vree.org/svgParse/abc2xml.py-268.zip). Dùng parser/chuyển đổi của upstream. |
| MusicXML → ABC | [xml2abc Python 1.77](https://wim.vree.org/svgParse/xml2abc.html), [gói nguồn](https://wim.vree.org/svgParse/xml2abc.py-177.zip). Dùng cùng bản đã chuyển thử Phố Xa; không tự viết bộ chuyển notation. |
| Chạy Python trong web | Phương án ưu tiên: [Pyodide trong module Web Worker](https://pyodide.org/en/stable/usage/webworker.html), chỉ tải khi có thao tác ABC. Chốt phiên bản và hash sau thử nghiệm A1. |
| Đóng gói runtime | [Tự phục vụ Pyodide](https://pyodide.org/en/stable/usage/downloading-and-deploying.html); chỉ lấy core và dependency thực sự cần. Không đóng gói toàn bộ kho package Python. |
| Chuẩn đầu vào | [ABC 2.1](https://abcnotation.com/wiki/abc%3Astandard%3Av2.1/), cộng các extension được hai converter hỗ trợ và được kiểm trong A1. |

SHA-256 source đã đọc để làm điểm bắt đầu ghim phiên bản:

```text
abc2xml.py 2.68
76cd2c5c4fc44b28ab2ce923f196d23d09b93fcefa8cfa90a10754d38e15b56e

xml2abc.py 1.77
6957bd88cdeedafa7a7cc5e2eec3f3ffc6449ef84e5337c46f0aa673f83725b4
```

Trong `abc2xml.py` 2.68, `getXmlDocs()` nhận `skip/num` và giữ preamble chung cho từng bài; giá trị mặc định `num=1`. Wrapper cũ `getXmlScores()` không truyền tiếp đúng `skip/num`, nên adapter phải gọi `getXmlDocs()` trực tiếp. Các decoration `ped`/`ped-up` được đổi thành MusicXML pedal start/stop. Đây là bằng chứng có đường chuyển đổi, chưa phải nghiệm thu timing trong Pianist.

Tài liệu converter nêu các giới hạn: một số chỉ thị ABC chỉ được xử lý một phần; khi chuyển từ MusicXML, vị trí trình bày cụ thể và một số dấu luyến xuyên khuông có thể mất. Profile được nghiệm thu phải ghi rõ tại A1; không tuyên bố hỗ trợ mọi biến thể ABC hay round-trip giữ nguyên toàn bộ bản phổ.

### Worker và dữ liệu

- Tạo `packages/score-formats/` cho hợp đồng, adapter và facade chuyển đổi; `packages/score-format-worker/` cho Worker. Worker này độc lập với Worker chấm piano.
- Giao diện dự kiến: `inspectSource(bytes, filename, signal)`, `prepareImport(source, selectedTuneIds, signal)`, `exportAbc(currentMusicXml, signal)`. Kết quả có nội dung, danh sách bài, phiên bản converter và diagnostics có mức độ/lý do/vị trí khi upstream cung cấp được.
- Mỗi request có ID, hủy được, chỉ request còn hiệu lực được mở score hoặc ghi thư viện. Worker timeout/lỗi phải trả lỗi và giữ bài đang mở. Không chạy conversion trong lượt tập đang chạy/tạm dừng.
- Chỉ thực thi entrypoint Python cố định của sản phẩm; bytes ABC là dữ liệu. Không nối nội dung ABC vào mã Python/JavaScript để thực thi. Chặn `%%abc-include` và `I:abc-include` có tham chiếu ngoài, kể cả dạng inline; không cho đọc file khác, tải URL hay thực thi chỉ thị script từ score.
- Kiểm UTF-8, BOM, CRLF, phần mở rộng, nội dung thật và giới hạn trước khi parse. Hạn mức kế thừa: file 32 MiB, tổng dữ liệu XML giải nén/sinh ra của một request tối đa 64 MiB; thêm tối đa 100 bài được chọn mỗi lần nhập. Worker có timeout chuyển đổi 30 giây/request sau khi runtime sẵn sàng; Hủy phải dừng Worker và cho phép thử lại. Đây là giới hạn tài nguyên, không phải tiêu chí âm nhạc hay công thức chấm.
- Sau chuyển ABC, MusicXML sinh ra vẫn đi qua validator XML hiện có trước khi vào native. Diagnostics hiển thị bằng text; không chèn HTML do file cung cấp.
- Nguồn và kết quả không gửi lên server. Runtime/converter phục vụ cùng origin, có phiên bản/hash trong manifest; không dựa vào CDN `latest` ở thời điểm người dùng mở file.

### Lưu trữ và xuất bản hiện tại

Giữ `ProjectRecord.bytes/filename` là MSCZ hiện tại; `source/sourceName` giữ bytes nguồn. Bổ sung metadata tùy chọn: `sourceFormat`, `sourceHash`, `sourceTuneIndex`, `sourceTuneId`, `sourceTuneTitle`, `converterVersion`, `importDiagnostics`. Dùng index cùng hash file để phân biệt hai bài có cùng `X:` hoặc cùng tên. Metadata không phải căn cứ tự gộp project.

Nguồn tunebook ban đầu được giữ nguyên khi lưu bản sao/backup; bài được chọn phải mở lại đúng nội dung MSCZ. Trước mắt có thể lưu nguồn trong từng project theo schema hiện có, với kiểm tra quota và thông báo tổng dung lượng trước nhập nhiều bài. Không nhân thêm MusicXML trung gian. Thiết kế blob nguồn dùng chung chỉ cần đặt ra nếu phép đo A3 cho thấy đây là trở ngại thực tế.

Record cũ không có metadata vẫn đọc được. Chỉ tăng version IndexedDB khi thực sự đổi object store/index; không tăng version chỉ để thêm field tùy chọn. Manifest backup phải kiểm kiểu/giới hạn các field mới và vẫn đọc được backup v1 hiện có.

Xuất ABC phải lấy bytes MusicXML của revision hiện tại. `Workspace` hiện gắn `onXmlExported` trực tiếp vào download; cần API lấy bytes trong `packages/engine-bridge/index.ts`, tách với thao tác tải MusicXML. Callback được phục hồi trong `finally`, bytes được copy khỏi native và revision được kiểm lại sau conversion. Xuất ABC không được vô tình tải thêm file XML hay xuất lại ABC nguồn cũ sau khi người dùng đã sửa.

## 4. Các mốc triển khai và điều kiện hoàn thành

Mỗi mốc có một hoặc vài commit riêng, đạt kiểm tra liên quan mới chuyển tiếp. Các mục dưới giữ tiêu chí kế hoạch; trạng thái và báo cáo kết quả nêu phạm vi đã nghiệm thu.

### A0 — Chốt bản trước ABC · Đã xong

- Commit `f87189ee`, chạy 83 test và build web như mục 1.
- Lưu kế hoạch này trong commit tài liệu riêng, sau mốc an toàn.

### A1 — Chứng minh bộ chuyển đổi chạy đúng trong trình duyệt · Đã đạt profile giới hạn

**Làm:** ghim source/license/hash của hai converter tại `third_party/score-format-sources/`; thêm manifest/provenance và script chuẩn bị nguồn. Dựng mẫu Worker Pyodide tối thiểu, chạy cùng source Python trên CPython và trong trình duyệt. Gọi API upstream có tham số rõ, khởi tạo lại state parser cho từng request để file trước không ảnh hưởng file sau.

**Corpus bắt buộc:** 12 nhóm ở mục 5, bài piano fixture hiện có và Phố Xa local. Ghi bytes runtime bổ sung, lần tải đầu/lần mở lại, thời gian conversion, dung lượng trước/sau nén; số liệu này kiểm phần mềm, không thêm chức năng đo người tập.

**Đạt khi:** browser và CPython tạo dữ liệu nhạc tương đương trên profile đã chọn; nốt, bè, nhịp, tie/repeat và pedal đi qua được vào MuseScore; Hủy không treo UI; xử lý liên tiếp nhiều bài không lẫn state. Có bảng tính năng supported/lossy/unsupported và báo cáo phần tải thêm thực tế. Chưa tích hợp UI sản phẩm nếu mốc này chưa đạt. Nếu Pyodide không đáp ứng, ghi rõ nguyên nhân và đánh giá runtime upstream khác; không tự viết lại parser hay âm thầm chuyển sang API server.

**Đầu ra:** nguồn ghim, mẫu converter, fixture/oracle, `docs/ABC_CONVERTER_RESULTS.md` khi có kết quả thật. Mẫu thử được chuyển thành module sản phẩm hoặc bỏ sau A2, không để đường nhập thứ hai tồn tại song song.

### A2 — Tích hợp một luồng nhập cho ABC và MXL · Đã hoàn thành

**Làm:** hoàn thiện `packages/score-formats`, Worker, validator và trạng thái request; nối vào `platform/files.ts`, `Workspace.importFile()` và file picker/drag-drop trong `main.tsx`. MXL/MusicXML/MSCZ tiếp tục nhập native; đường này không khởi tạo Python.

**Đạt khi:** mở từng định dạng từ thư viện/editor/màn tập cho cùng hành vi; ABC lỗi/timeout/hủy không ghi project dở, không thay bài đang mở; hai lượt mở chồng nhau chỉ lượt hợp lệ cuối được công bố. Mọi điểm vào giữ khóa đổi bài của phiên tập đang hoạt động.

**Kiểm:** validator và worker timeout/cancel; integration nhập ABC và MXL; lỗi native load; file giả đuôi; giới hạn mở rộng; Unicode tiếng Việt; hồi quy các test workspace.

### A3 — Thư viện, tunebook và phục hồi · Đã hoàn thành

**Làm:** thêm chọn bài trong file ABC nhiều bài, metadata nguồn, lưu project từng bài, hiển thị nhãn định dạng nguồn; bổ sung lưu bản sao, recovery, backup/restore. Tên bài ưu tiên `T:`; thiếu tên dùng tên file kèm số bài. Không mặc định chọn mọi bài trong tunebook lớn.

**Ghi dữ liệu:** chuyển đổi và kiểm tất cả bài đã chọn trước; chuẩn bị MSCZ bằng project native tạm không thay score đang mở. Nếu bridge hiện tại chưa hỗ trợ, bổ sung API chuẩn bị project riêng tại mốc này, không gọi lặp `switchDocument()` lên score đang edit. Sau đó ghi cả lô trong một transaction; chỉ sau khi commit mới mở bài được chọn. Giới hạn cả tổng bytes dự án đã chuẩn bị, kiểm quota, giải phóng từng project native tạm để không giữ đồng thời nhiều score trong RAM.

Nếu một bài không hợp lệ, báo bài đó để người dùng bỏ chọn và thử lại. Không ghi đè project đang có chỉ vì trùng tên hoặc `X:`. Khi chọn nhiều bài từ màn tập, yêu cầu chọn bài sẽ mở để tập. Hủy hoặc lỗi trước transaction phải giữ nguyên score và undo history đang mở; lỗi khi mở bài sau transaction phải báo rõ các bài đã lưu thành công và cho mở lại từ thư viện.

**Đạt khi:** refresh/mở lại/offline giữ đúng bài đã chọn; backup/restore giữ nguồn và metadata; backup v1 và project cũ vẫn đọc được; lỗi quota/transaction không mất bài cũ hoặc tạo lô thiếu. Việc sửa một bản sao không sửa nguồn hay project khác.

### A4 — Chỉnh sửa, lưu và xuất cả hai định dạng · Đã hoàn thành trong profile giới hạn

**Làm:** thêm API lấy MusicXML hiện tại qua bridge và xuất ABC bằng upstream; bổ sung định dạng vào dialog Xuất. Giữ autosave, explicit save, undo/redo, recovery bằng MSCZ. Diagnostics xuất chỉ rõ mất trình bày hay mất nội dung âm nhạc.

**Chính sách xuất:** mất thông tin trình bày được thông báo trước khi người dùng chọn xuất; mất cao độ/thời điểm/trường độ/bè/repeat/pedal không được ghi nhãn tương đương bản gốc. Với đặc tính ngoài profile, giữ đường xuất MXL/MSCZ và nêu rõ nguyên nhân ABC không bảo toàn được. File ABC nhập từ ngoài không có MXL đối chiếu được đánh giá theo cú pháp/profile và diagnostics, không gắn nhãn “đã đối chiếu nguồn”.

**Đạt khi:** mở ABC/MXL → đổi cao độ, trường độ, thêm nốt, sửa pedal → lưu/reload → nội dung đúng; xuất ABC/MXL lấy revision mới nhất; xuất ABC rồi nhập lại khớp các thuộc tính được profile bảo toàn. Không xuất nguồn cũ, không tải XML phụ, không làm bẩn hoặc mất undo history chỉ vì xuất file.

### A5 — Tập cùng bộ chấm và highlight native · Đã hoàn thành trong profile

**Làm:** dùng `Workspace.practice()` tạo snapshot mới từ score đã nhập/chỉnh sửa. Đối chiếu hai nguồn bằng tập sự kiện âm nhạc, rồi đưa cùng MIDI mô phỏng qua router/controller/Worker hiện có. Không thêm thuật toán chấm vào adapter chuyển đổi.

**Đạt khi:** các cặp ABC/MXL cùng nội dung trong profile cho cùng target và kết quả BPM/Đúng nốt/R4; đúng/sai octave, hợp âm, nốt lặp, nhả phím, pedal on/off đều đúng theo engine hiện có. Kiểm A–B ba vòng, count-in, pause/resume, nghe đoạn, chọn tay/bè, full sheet, cuộn system và quay về A.

**Highlight:** nốt dùng `data-practice-notes` từ SVG native của chính lần import; không dùng tọa độ hay ID của file nguồn khác. Nốt cùng pitch ở tương lai không sáng theo phím đang giữ; giữ/nhả liên kết đúng lần Note On; đổi vòng xóa màu lượt cũ đúng lúc.

**Giới hạn có sẵn:** mốc native không cung cấp được vẫn là `unavailable`; Phố Xa trước đây có 33 target thiếu mốc nhả trong demo A4–B10. Không biến các target đó thành nhả đúng hoặc suy ra pedal từ âm thanh.

### A6 — Đóng gói và offline · Đã hoàn thành

**Làm:** đưa runtime/converter vào manifest bằng SHA-256; cập nhật `package-web.py`, `stage-release.py`, `verify-release.py`, `prepare-notices.py`, `platform/offline.ts` và service worker khi cần. Chỉ tải converter khi nhập/xuất ABC ở chế độ online; khi người dùng chuẩn bị offline thì tải đủ runtime được ghim. Tính dung lượng cần thiết theo manifest thay vì dựa vào ngưỡng 250 MiB cũ.

**Đạt khi:** mở thư viện hoặc MXL không tải runtime ABC; import/export ABC sau chuẩn bị offline không gọi CDN/API; Worker và Python data/WASM cùng release; hash sai/file thiếu không được thực thi; cập nhật app không xóa thư viện và không đổi engine giữa lượt.

**Gói phát hành:** gồm mã nguồn ứng với commit, converter source/license/notices, runtime đúng phiên bản, fixture CC0 và tài liệu build. Không thêm Phố Xa local vào gói public. Chưa deploy hosting/HTTPS.

### A7 — Nghiệm thu và chốt commit hỗ trợ ABC · Đã hoàn thành trong profile

**Làm:** chạy kiểm tra hiện có và bộ mới, browser Chrome/Edge, offline, export/reimport, backup/restore. Kiểm lại sơ đồ mất dữ liệu so với A1; ghi hạn chế cụ thể thay vì chỉ tổng số test.

**Đạt khi:** toàn bộ tiêu chí bắt buộc A1–A6 và bảng mục 5 đạt; có bằng chứng mẫu Phố Xa local ở cả hai định dạng, báo cáo `docs/ABC_MUSICXML_RESULTS.md`, hướng dẫn sử dụng cập nhật và gói triển khai kiểm hash được. Mỗi exception về khả năng chuyển đổi phải có fixture và thông báo người dùng tương ứng.

**Commit cuối:** chốt source sạch trước tạo release. Không ghi “hỗ trợ ABC hoàn tất” chỉ vì đã thêm `.abc` vào file picker hoặc converter trả XML không lỗi.

## 5. Ma trận kiểm thử và cách đối chiếu

Tạo fixture nhỏ CC0, có expected độc lập và cặp ABC/MusicXML được đọc kiểm từng ô nhịp. Đầu ra converter đang kiểm không được tự làm expected cho chính nó. Dùng CPython chạy cùng source để kiểm lớp tích hợp trình duyệt, còn expected âm nhạc và snapshot native dùng để phát hiện cả lỗi có sẵn trong converter.

| Nhóm | Ca cần có | Điều kiện chính |
| --- | --- | --- |
| 1. Nốt và khóa | Hai khuông piano; dấu hóa/hóa biểu; octave thấp/cao | Đúng pitch MIDI, khóa, tay/khuông và bè |
| 2. Bè/hợp âm | Hai tay đồng thời, hai bè một khuông, unison và hợp âm lệch trường độ | Không mất bè; target vật lý vẫn gộp theo engine hiện có |
| 3. Nhịp | Pickup, nghỉ, chấm dôi, 6/8, tuplet | Onset/duration/beat chính xác, không lượng tử hóa lại |
| 4. Tie/slur | Tie qua vạch nhịp, tie vào A, slur; ca luyến xuyên khuông ngoài profile | Tie không thành attack thừa; mất slur được phân loại đúng |
| 5. Tempo | `Q:` có đơn vị phách, đổi tempo giữa bài, đổi số chỉ nhịp | Cùng tempo map và các mốc BPM; không coi mọi giá trị Q là nốt đen/phút |
| 6. Lặp | Repeat, volta 1/2, D.C./D.S./Coda được converter hỗ trợ | Cùng thứ tự occurrence; ca ngoài profile phải báo rõ |
| 7. Nhả phím | Nốt dài, staccato, đánh lại cùng pitch, key-off khác sound-off | Mốc native và kết quả R4 khớp; không thay tỷ lệ trường độ |
| 8. Pedal | Start/stop, pedal qua ô nhịp/repeat/A–B, pedal tắt, thiếu chỉ dẫn | Cùng pedal span; thiếu nguồn không được suy đoán |
| 9. Nhiều bài | Preamble chung; trùng `X:`/tên; `T:` tiếng Việt; BOM/CRLF | Chọn đúng bài, đủ header và không bỏ âm thầm bài sau |
| 10. Dữ liệu lỗi | Cú pháp sai, phần mở rộng giả, external include, file quá lớn, timeout/cancel | Lỗi có vị trí khi có thể; không thực thi nội dung file; không ghi dở |
| 11. Vòng đời | Edit/save/reload/export/reimport, backup v1/v2 nếu có, quota, hai tab | Lấy đúng revision; dữ liệu cũ còn nguyên |
| 12. Màn tập | MIDI mô phỏng đúng và lệch sớm 120 ms; A–B 3 vòng; giữ/nhả; full sheet | Cùng judgement, highlight chính xác và camera về A |

So sánh ngữ nghĩa theo pitch, part/tay/bè, onset/duration theo đơn vị nhịp chính xác, ties, tempo map, thứ tự occurrence, beats, native key releases và pedal spans. Tick/phân số nhịp phải khớp; mốc millisecond chỉ cho sai số biểu diễn số thực tối đa `1e-6 ms`, không dùng dung sai chấm BPM/R4 để bỏ qua sai lệch chuyển đổi. Sai lệch lớn hơn được báo và xử lý nguyên nhân.

Không yêu cầu XML text, layout, page index hoặc anchor ID của hai lần import giống từng byte. Mỗi bản phải tự có mapping nốt→SVG hợp lệ; khi so kết quả, ánh xạ bằng danh tính sự kiện nhạc và lần diễn. Không sửa fingerprint production chỉ để làm test hai định dạng trông giống nhau; lịch sử khác project/revision vẫn giữ quy tắc hiện tại.

Fixture cao cấp chưa được converter bảo toàn phải được đánh dấu ngoài profile và có hành vi từ chối/cảnh báo có kiểm thử. Đối với những đặc tính bắt buộc của profile piano, khác ngữ nghĩa là lỗi chặn nghiệm thu, không chỉ là cảnh báo trong báo cáo.

## 6. File cần sửa và file dự kiến thêm

Các đường dẫn mới dưới đây là kế hoạch, chưa tồn tại ở mốc A0.

| Vị trí | Công việc |
| --- | --- |
| `packages/score-formats/` và `packages/score-format-worker/` | Hợp đồng, wrapper upstream, Worker, hủy/timeout, diagnostics |
| `third_party/score-format-sources/` | Source nguyên gốc, manifest hash, provenance, giấy phép |
| `buildscripts/pianist/prepare-score-format-sources.py` | Tải/kiểm nguồn và runtime ghim, cấu trúc build tái lập |
| `apps/pianist-web/src/platform/files.ts` | Phân loại/kiểm ABC và XML sinh ra, bảo toàn validator MXL |
| `apps/pianist-web/src/workspace.ts` | Import có conversion, tunebook, save/export đúng revision và transaction |
| `apps/pianist-web/src/main.tsx` và component chọn bài mới | File picker, dialog tunebook, nhãn nguồn, xuất ABC/diagnostics |
| `apps/pianist-web/src/platform/storage.ts`, `library-backup.ts` | Metadata, nhập nhiều project nguyên tử, tương thích backup/record cũ |
| `packages/engine-bridge/index.ts` và `src/web/appjs/webapi.cpp` nếu cần | Chuẩn bị project tạm cho tunebook; lấy MusicXML bytes hiện tại mà không tự download; bảo vệ callback/revision |
| `tests/fixtures/pianist/abc/`, `tests/reference-runners/abc/` | Cặp notation/expected, runner CPython gốc, giới hạn converter |
| `apps/pianist-web/tests/` và `tests/browser/pianist/` | Import/export/storage/parity/Worker/browser regression |
| `buildscripts/pianist/*release*.py`, `package-web.py`, `prepare-notices.py` | Runtime, hash, offline, source/license trong gói phát hành |
| `docs/PIANIST_WEB.md`, tài liệu kết quả ABC | Hướng dẫn đúng tính năng đã làm và bằng chứng nghiệm thu |

Không dự kiến thay scoring kernel, MIDI clock, thuật toán R4 hay renderer SVG. Nếu cần sửa bridge/native để chuẩn bị project tạm hoặc lấy bytes export thì tách commit, build lại WASM và chạy kiểm thử native tương ứng.

Ngoại lệ phát hiện lúc nghiệm thu A7: sửa bước khởi động Web Audio để đợi output
timestamp hợp lệ trước khi chốt mapping. Không đổi công thức mapping trong lượt,
offset, guard đồng hồ, cửa sổ BPM hoặc matcher. Lỗi cold-start trên Chrome và bằng
chứng đối chiếu đặc tả/kiểm thử được ghi trong `ABC_MUSICXML_RESULTS.md`.

## 7. Dung lượng và điều kiện dừng

Phép thử Phố Xa bằng `xml2abc` 1.77: MusicXML 593.425 byte; MXL 25.903 byte; ABC 7.837 byte; ABC gzip mức 9 là 2.844 byte. Đây là số liệu một file và chưa có nghiệm thu tương đương âm nhạc. Không suy rộng thành toàn bộ kho luôn giảm 89%.

Tổng dung lượng cần báo riêng: file nhạc truyền qua mạng; runtime tải lần đầu; bytes project/source trong IndexedDB; gói chuẩn bị offline. Giữ MSCZ cho edit có nghĩa dữ liệu thư viện không tự giảm cùng tỷ lệ với ABC. Pyodide bổ sung runtime, nên A1 phải báo khoản này rõ. Mở MXL không trả chi phí tải converter ABC.

Kho vài GB để tuyển bài không được đưa nguyên vào bundle/service worker. Ngân hàng bài tập tương lai có thể lưu nguồn ABC nén và chỉ tải bài được mở; triển khai kho và generator không thuộc kế hoạch hỗ trợ định dạng này.

Dừng tích hợp mốc tiếp theo nếu converter đổi nốt/nhịp/trường độ/pedal trong profile bắt buộc, xử lý tunebook làm mất bài, thao tác hủy phá score đang mở, hoặc code mới thay quy tắc chấm để che sai lệch conversion. Sửa adapter, chọn bản upstream có bằng chứng hoặc ghi rõ phần chưa đáp ứng; không tự chế thuật toán notation/chấm thay thế.

## 8. Kiểm tra cuối và quay về mốc an toàn

Các lệnh hiện có cần đạt ở A7:

```powershell
# Tại apps/pianist-web
npm test
npm run test:midi
npm run build

# Tại root repo, sau build
python buildscripts/pianist/audit-practice-cutover.py
git diff --check
```

Thêm lệnh kiểm corpus ABC và browser trong A1/A2 rồi ghi chính xác vào báo cáo kết quả; không ghi test dự kiến là đã chạy. Nếu native thay đổi, build lại WASM và tạo snapshot corpus từ bản mới trước khi nghiệm thu. Sau source sạch, tạo package/release theo quy trình hiện có và xác minh hash/offline trên chính gói đó.

Muốn đối chiếu hoặc khôi phục, tạo checkout/worktree riêng từ `f87189eefc45b64e828ebf6d196016d5f20c3985`; giữ nguyên thư mục đang làm. Khi bỏ một tính năng đã commit thì revert các commit ABC theo thứ tự ngược trên nhánh làm việc đã lưu, không `reset --hard` hoặc xóa thư viện. Checkout mã cũ cần runtime/build tương ứng; Git checkpoint không thay thế backup IndexedDB.

Thứ tự làm: **A1 chứng minh converter → A2 nhập chung → A3 thư viện → A4 sửa/lưu/xuất → A5 tập và parity → A6 offline/package → A7 nghiệm thu**.
