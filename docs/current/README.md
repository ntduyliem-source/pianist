# Tài liệu Pianist hiện hành

Cập nhật ngày 23/10/2026. Đây là điểm vào cho phần Pianist của repository MuseScore fork. `docs/README.md`, `docs/index.html` và `docs/apidocs_static/` vẫn là tài liệu API upstream, không phải hướng dẫn vận hành Pianist.

## Bắt đầu ở đâu

| Cần làm | Đọc |
|---|---|
| Dùng thư viện, editor, free play hoặc grade | [Hướng dẫn ứng dụng](../PIANIST_WEB.md) |
| Hiểu trách nhiệm module và đường dữ liệu | [Kiến trúc hiện tại](architecture.md) |
| Tìm nguồn bài, bản MXL đóng gói, catalog hoặc kho local | [Bản đồ nội dung](content-pipeline.md) |
| Build, chạy local, chọn kiểm thử phù hợp | [Hướng dẫn phát triển](development.md) |
| Chạy cổng kiểm thống nhất và đọc bằng chứng | [Validation và CI](validation.md) |
| Theo dõi việc tổ chức lại code | [Kế hoạch refactor năm giai đoạn](../REFACTOR_PLAN.md) |
| Đóng gói và cập nhật online | [Release và GitHub Pages](release.md) |
| Xem thuật toán chấm được lấy từ đâu | [Provenance](../../third_party/practice-sources/PROVENANCE.md) |
| Xem chính xác quy tắc duyệt cao độ tám grade | [Grade pitch validation](../curriculum/GRADE_PITCH_VALIDATION.md) |
| Xem nội dung thực tế của kho grade | [G1–G8 và hướng dẫn từng bộ](../../scores/grades/generated/G1_G8_ABC_GUIDE.md) |

Catalog và manifest là nguồn quyết định nội dung đóng gói; số liệu trong báo cáo cũ chỉ mô tả thời điểm báo cáo. Không dùng một kế hoạch lịch sử để thay cho schema hoặc hành vi đang chạy.

## Tài liệu kết quả và lịch sử

Các tài liệu dưới đây được giữ để truy vết quyết định, không dùng làm checklist build/deploy hiện tại:

- `M0_*`, `M1_M6_RESULTS.md`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_AUDIT.md`: các mốc xây ứng dụng ban đầu.
- `R0_R7_RESULTS.md`, `R4_RESULTS.md`, `BUG_AUDIT_2026-10-18.md`: quá trình thay bộ chấm và kiểm nhả phím/pedal.
- `ABC_MUSICXML_PLAN.md`, `ABC_MUSICXML_RESULTS.md`, `ABC_CONVERTER_RESULTS.md`: thiết kế, profile và bằng chứng chuyển đổi ABC; phiên bản converter hiện dùng được ghim trong source.
- `EDITOR_PLAYBACK_LIBRARY.md`, `WEB-MOBILE-PLAYBACK.md`: các lượt nghiệm thu playback/thư viện/mobile tại thời điểm viết.
- [Audit fixes 23/10/2026](../AUDIT_FIXES_2026-10-23.txt): kết quả sửa D01–D10 và kiểm browser; đây là báo cáo một phiên bản, không phải số test cố định cho mọi phiên bản sau.
- `curriculum/Q*`, `K*`, `BANK_BUILD.md`, `GRADED_BANK_PLAN.md`, `GRAND_STAFF_BANK_PLAN.md`, `REAL_EXCERPTS.md`, `AUTO_SCRIPT.md` và các thư mục bằng chứng đi kèm: các phương án trích đoạn/kho cũ. Chúng không phải nguồn của luồng grade hiện tại.
- `curriculum/G1_ABC_*` đến `G5_G8_ABC_*`: kế hoạch/kết quả biên soạn tám bộ đang dùng; đọc cùng hướng dẫn thực tế trong `scores/grades/generated/` và quy tắc duyệt hiện tại.

Trong giai đoạn đầu chỉ phân loại và liên kết lại, chưa di chuyển hàng loạt tài liệu hay scripts lịch sử. Việc giữ một file không có nghĩa pipeline phát hành còn gọi file đó.
