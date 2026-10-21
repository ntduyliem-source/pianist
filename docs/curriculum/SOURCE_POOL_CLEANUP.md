# Dọn sheet nguồn, giữ nguyên bài tập

Ngày 21/10/2026. Phạm vi theo chỉ dẫn của người dùng: **chỉ dọn các sheet nguồn đã tải; giữ sheet đủ hai staff piano. Không xóa hoặc sửa bài tập.**

| Kết quả | Số lượng |
|---|---:|
| Sheet nguồn đã kiểm XML và hash | 37.630 |
| Đã xóa khỏi kho nguồn | 22.670 |
| Trong đó không đúng hai staff | 22.648 |
| Trong đó hai staff nhưng nhạc cụ khác | 22 |
| Sheet nguồn còn lại | **14.960** |
| Bản sao nguồn đã xóa thêm ở cache thu thập/nghiên cứu | 2.916 |
| Bài tập trong kho chính sau dọn | **5.284 — giữ nguyên** |

Số staff là số khuông độc lập trong cấu trúc score, không phải số dòng hệ thống trên trang. Piano và tên dịch được đối chiếu với `share/instruments/instruments.xml` và các bản dịch `share/locale/instruments_*.ts` của MuseScore.

Quyết định dựa trên bản MXL cụ thể: part/instrument không phải piano hoặc nốt gõ bị loại. Metadata của bản đăng gốc có thể chứa nhạc cụ khác trong khi MXL PDMX chỉ còn part piano; không dùng nhãn đó để xóa một MXL thực tế có hai staff piano. Tám bản không ghi tên có đủ hai staff G/F với nốt cao độ, patch acoustic piano và channel không phải percussion được giữ theo ký âm thực tế.

## Xác minh phạm vi

- Kho nguồn: `artifacts/curriculum-corpus/raw/objects/`; xóa thêm các bản sao đúng hash trong `raw/openscore/` và `artifacts/curriculum-research/openscore-lieder/`.
- **Không thay đổi file bài tập, staging bài tập, catalog, progress hoặc database của các kho bài tập.** Snapshot trước/sau gồm 11.956 file MXL và file chỉ mục/database liên quan; hash tổng hợp giống hệt nhau: `d6dbf0d92b0f27b295875d732634bff05c2fd39cfe96cf57a5f02fe25094ec1e`.
- Đối soát độc lập xác nhận mọi MXL nguồn đã chọn xóa đều vắng mặt và tập file nguồn còn lại khớp đúng 14.960 bản được giữ.
- Catalog nguồn giữ tombstone và nguyên nhân xóa để truy vết; các bản này bị loại khỏi `review_queue`. Hàng xử lý hiện có 14.959 nguồn; một nguồn hai staff vẫn vượt giới hạn XML 32 MiB của normalizer, nên được giữ trên đĩa nhưng chưa vào hàng phân tích.
- Archive tải gốc không phải kho nguồn hoạt động. Lệnh thu thập hàng loạt cũ bị chặn trên kho đã dọn để không tự giải nén/tải lại những MXL người dùng đã xóa.
- 6 kiểm thử dọn nguồn và 26 kiểm thử tooling corpus đạt. Có kiểm tra chặn đường dẫn thoát thư mục, sai hash, sai chính sách và giữ nguyên một bài tập có byte giống hệt nguồn bị xóa.

[Receipt kết quả](source-cleanup/verification.json). Kế hoạch chi tiết theo từng SHA nằm tại `artifacts/curriculum-source-two-staff-plan.json`; nhật ký thao tác và danh sách loại trừ nằm tại `artifacts/curriculum-corpus/source-cleanup.json`.

## Công cụ

`buildscripts/pianist/prune-curriculum-sources.py` tách `plan` và `apply`. Apply kiểm lại chính sách, danh mục, đường dẫn và hash trước khi xóa từng file trong các thư mục nguồn được chỉ định. Nó không có thao tác ghi/xóa vào kho bài tập. Snapshot SQLite trước dọn chỉ lưu metadata catalog nguồn, không sao lưu lại các file MXL đã yêu cầu xóa.
