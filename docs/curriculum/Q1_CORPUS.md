# Q1 — Kho nguồn cho bộ sinh bài tập

Q1 thu thập bản gốc và lập danh mục có thể tái tạo. Một file qua kiểm tra ZIP/XML vẫn chờ Q2 phân tích nội dung nhạc, kiểm part/staff, ký âm và khả năng cắt đoạn. Tên bài, mã nhạc cụ mặc định và số lượng file không quyết định grade.

## Kết quả trên kho thật — 20/10/2026

| Nguồn | Mục nguồn | Nội dung MXL riêng theo SHA256 | Nội dung qua kiểm ZIP/XML |
|---|---:|---:|---:|
| OpenScore Lieder | 1.462 | 1.461 | 1.461 |
| PDMX đã lọc metadata | 36.150 | 36.150 | 36.149 |
| Thư viện 18 bài và Phố Xa | 19 | 19 | 19 |
| **Tổng** | **37.631** | **37.630** | **37.629** |

Tất cả mục yêu cầu đã có file và trạng thái cụ thể. 37.630 nội dung MXL chiếm 248.653.303 byte; hai archive PDMX vẫn được giữ riêng để tái tạo. 36.150 metadata PDMX đều đọc được, khớp mã score và URL nguồn. Số nội dung MXL riêng không phải số tác phẩm riêng hoặc số đoạn đạt grade.

Một MXL PDMX, `QmR9rTNRXwFHHbSTksRpk9WHUngBXNcJgP88QeRdoYzRd4`, có XML bung ra **36.359.515 byte**, vượt ngưỡng **33.554.432 byte (32 MiB)** trong manifest. Công cụ ghi `xml-size-limit`, giữ bản gốc và chặn khỏi `review_queue`. Đây là giới hạn tài nguyên của lượt nhập; chưa kết luận bản nhạc sai nhạc hoặc hỏng. [Bản nguồn được metadata dẫn tới](https://musescore.com/user/11764431/scores/3705181).

Một nhóm trùng OpenScore có hai đường dẫn ghi tác giả khác nhau: `Obradors / 1 La mi sola, Laureola` và `Zemlinsky / 1 Liebe Schwalbe`. Cả hai origin được giữ ở trạng thái chờ duyệt, nội dung chỉ tính một lần. Cần đối chiếu xuất xứ trước khi chọn vào bài tập.

Trong PDMX qua kiểm XML, **16.565 mục có tên piano/klavier/pianoforte được ghi trong part hoặc instrument**. Các mục còn lại cần phân loại ở Q2; mã track `0` trong CSV không xác nhận đó là bản piano solo. Chưa gán grade và chưa có fragment được nghiệm thu.

26 kiểm thử tooling đã qua, gồm kiểm độc lập dữ liệu XML bằng chế độ một tiến trình và hai tiến trình. Lượt thật chạy bốn tiến trình kiểm file, một luồng ghi SQLite; đã tiếp tục thành công từ checkpoint 3.000 MXL PDMX. Bằng chứng và đối chiếu lượt offline cuối nằm trong [verification.json](q1/verification.json).

## Chạy tại máy phát triển

Python 3.11 trở lên:

```powershell
python -m pip install -r buildscripts/pianist/curriculum-requirements.txt
python buildscripts/pianist/collect-curriculum.py
python buildscripts/pianist/collect-curriculum.py --offline
python -m unittest discover -s tests/curriculum -p "test_*.py" -v
```

Lệnh đầu thu thập và lập catalog; lệnh `--offline` kiểm lại toàn bộ checksum và tái dùng dữ liệu mà không truy cập mạng. `--download-only` chỉ lấy các archive và tài liệu nguồn. Có thể dùng `--output D:\...\corpus` và `--seed D:\...\curriculum-research`; mặc định đều nằm trong `artifacts/` của repo. `.run.lock` dùng khóa của hệ điều hành để chặn hai tiến trình cùng sửa một kho, tự nhả khi tiến trình kết thúc hoặc bị ngắt.

OpenScore và CSV đã tải trong đợt nghiên cứu được kiểm hash rồi sao chép sang kho mới. Không sửa các bản nghiên cứu. File Phố Xa nằm trong thư mục cá nhân bị Git bỏ qua: trên máy chưa có file này, catalog ghi rõ lỗi thiếu nguồn và tiếp tục các mục khác.

## Nguồn được khóa phiên bản

- [Manifest](../../scores/curriculum/sources.lock.json) pin URL, dung lượng và checksum từng asset. MD5 PDMX được đối chiếu với [Zenodo record 15571083, v9](https://zenodo.org/records/15571083). Công cụ tính thêm SHA256 để định danh nội dung.
- [Chỉ mục OpenScore](../../scores/curriculum/openscore.index.json) giữ đường dẫn và Git blob SHA1 của từng MXL tại [commit 38c5db510224d9facdc4b08d741fc788cfb58ea8](https://github.com/OpenScore/Lieder/tree/38c5db510224d9facdc4b08d741fc788cfb58ea8). Toàn bộ chỉ mục đã được so lại với GitHub API của commit đó.
- Bộ lọc PDMX là `no_license_conflict ∩ all_valid ∩ deduplicated ∩ n_tracks=1 ∩ tracks=0`, đúng các cột CSV. Công cụ kiểm cả 254.077 dòng đầu vào và 36.150 dòng kết quả; sai số đếm sẽ dừng, không tự đổi điều kiện.
- Giấy phép công bố của OpenScore là CC0; PDMX giữ nguyên trường giấy phép và link từ CSV. Khuyến nghị lọc xung đột giấy phép xuất phát từ [thông báo của tác giả PDMX](https://github.com/pnlong/PDMX#updates-). Đây là dữ liệu nguồn để duyệt, không phải quyết định cho phép phát hành mọi bản nhạc.
- 18 bài trong thư viện hiện tại và Phố Xa được khóa SHA256, đánh dấu `personal` trong kho curriculum. Các nguồn tải về mang trạng thái `pending-review`. Q1 không tự tạo `public-approved`.

## Tải, giải nén và kiểm tra

Downloader dùng tối đa hai kết nối archive, bốn kết nối file OpenScore. Các file `.part` đi cùng danh tính URL/kích thước/checksum; chỉ tiếp tục nếu danh tính khớp. HTTP 206 phải có Content-Range đúng; HTTP 200 sau yêu cầu Range sẽ ghi lại từ đầu. Chỉ đổi tên thành file hoàn chỉnh sau khi hash khớp. Có retry giới hạn, timeout và trạng thái lỗi riêng. Bản cache hỏng được giữ dưới hậu tố `.invalid`.

Kiểm các file MXL/metadata PDMX dùng tối đa bốn tiến trình, còn SQLite có một luồng ghi. Có thể giảm bằng `--workers 1`. Kiểm hash cache dùng tối đa tám luồng đọc. Trình tự kết quả cố định theo CSV; bản chạy một tiến trình và nhiều tiến trình phải cho cùng hash catalog. Checkpoint SQLite giữ các lô đã kiểm xong khi lượt xử lý bị ngắt.

Hai archive PDMX được giữ nguyên để tái tạo và chỉ trích các thành viên được chọn bởi CSV. Tar chỉ nhận file thường, kiểm đường dẫn, liên kết, số thành viên và giới hạn dung lượng. MXL kiểm đường dẫn trong ZIP, rootfile, CRC, giới hạn bung nén và XML bằng `defusedxml==0.7.1`; entity và tham chiếu ngoài bị chặn. DTD MusicXML khai báo thông thường vẫn đọc được, không tải DTD qua mạng.

Receipt giải nén khóa hash archive, tập đường dẫn cần lấy, phiên bản validator và giới hạn. Chạy lại sẽ hash từng file đã lấy; cache thiếu hoặc sai sẽ quét lại archive để phục hồi. Cache kiểm XML khóa cả hash nội dung lẫn phiên bản/giới hạn validator.

Metadata PDMX được đọc JSON, đối chiếu mã score trong nội dung với tên file và URL nguồn. Bản nhạc không qua kiểm tra vẫn có mục nguồn và mã lỗi cụ thể. Không “bỏ qua cho đủ số”.

## Đầu ra

Các dữ liệu lớn nằm ở `artifacts/curriculum-corpus/`, được Git bỏ qua:

| Đường dẫn | Nội dung |
|---|---|
| `raw/pdmx/` | CSV và hai archive đã kiểm checksum |
| `raw/openscore/` | MXL theo Git blob cùng README, giấy phép đã pin |
| `raw/objects/<prefix>/<sha256>.mxl` | Bản gốc dùng cho Q2, một file cho mỗi nội dung |
| `raw/objects/<prefix>/<sha256>.json` | Metadata gốc của các dòng được chọn |
| `catalog.sqlite` | Bảng nội dung, nguồn gốc, trạng thái và lịch sử chạy |
| `archive-report.json` | Dung lượng/hash, số byte tải và trạng thái tái dùng từng asset |
| `mxl-extraction.json`, `metadata-extraction.json` | Receipt giải nén, có lỗi thiếu từng thành viên |
| `download-report.json` | Tổng hợp số dòng, số nội dung riêng, trùng nguồn và lỗi |
| `run-state.json` | Đang tải/lập catalog, hoàn tất hoặc lỗi của lượt chạy hiện hành |

`files` định danh theo SHA256, lưu trạng thái container và các part/instrument thực sự ghi trong XML. `origins` giữ từng đường dẫn gốc, collection/revision, liên kết, tên/tác giả, giấy phép, trạng thái dùng riêng/công khai, CSV nguyên bản và đường dẫn metadata. Hai dòng cùng MXL vẫn có hai origin, kể cả khi tác giả hoặc trạng thái phân phối khác nhau. Danh tính dòng PDMX là `path` của CSV, không phải hash nội dung hay tên bài.

`download_status`, `extraction_status`, `metadata_status`, `parse_status` được lưu riêng. `parse_status=pending-q2` không có nghĩa file đã được music21/native MuseScore duyệt. View `review_queue` là đầu vào Q2 gồm các nguồn đọc được container/XML và metadata. Bản cá nhân vẫn là cá nhân khi dùng chung hash với nguồn khác; quyền phân phối phải xét origin được chọn, không lan truyền theo hash.

`catalogContentSha256` băm dữ liệu nội dung và provenance theo thứ tự ổn định, bỏ qua thời điểm chạy và nhãn tải mới/tái dùng. Hai lượt nhập phải có hash này giống nhau. `download_status=archive-verified` của PDMX chỉ nói archive đã kiểm checksum; xem thêm `file_sha256`, trạng thái giải nén và container để biết từng file thành viên.

`download-report.json` chỉ được thay thế khi hoàn thành lượt lập danh mục. Khi xử lý bị ngắt, xem `run-state.json` để tránh hiểu báo cáo cũ là kết quả của lượt mới. Không nối `raw/` hoặc SQLite vào asset của web; gói bài tập theo grade là đầu ra của các mốc sau.

## Nghiệm thu

Kiểm thử tự động dùng HTTP server, tar/ZIP/XML và CSV fixture cục bộ. Bao gồm resume 206, server trả 200, mất kết nối, sai Content-Range/checksum, khóa tiến trình, đường dẫn thoát thư mục, symlink, entity XML, giới hạn bung nén, metadata sai mã, trùng nội dung/nguồn, file cá nhân thiếu và chạy lại không đọc archive. Sau khi chạy trên kho thật, lưu số đếm và bằng chứng tái dùng ở `q1/verification.json`.

Nhóm trùng tác phẩm/bản chuyển soạn, giới hạn quãng, số nốt, nhịp, pedal, tính trọn vẹn câu nhạc và grade đều thuộc Q2 trở đi.
