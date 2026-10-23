# Tổ chức lại Pianist — năm giai đoạn

Kế hoạch thực hiện được chấp thuận ngày 23/10/2026. Làm lần lượt từng giai đoạn, kiểm trước khi chốt mốc; không viết lại toàn bộ ứng dụng. [Tài liệu hiện hành](current/README.md) là điểm vào; báo cáo Q/K/M/R cũ giữ vai trò lịch sử.

## Điều kiện phải giữ

- Không đổi thuật toán chấm, cửa sổ timing, chính sách upstream, phép đánh giá nhả/pedal hay engine ID chỉ vì refactor.
- Không đổi nội dung/ID/hash/thứ tự của 5.600 bài grade. Chỉ các thay đổi validator đã được yêu cầu mới thuộc scope; validator nhận 88 phím không tự mở rộng nội dung.
- Giữ snapshot native, full-page SVG, clock/repeat/tie, highlight và âm MuseScore làm nguồn sự thật. Không bổ sung heuristic diễn giải nhạc trong UI.
- Giữ route người dùng, IndexedDB, replay, project editor chưa lưu, hành vi Stop/pause/resume và lựa chọn version.
- Loại bài thư viện không phù hợp theo yêu cầu người dùng là **ngoại lệ nội dung có chủ đích**: catalog/file/receipt phải khớp. Không áp dụng ngoại lệ này để xóa grade hoặc chỉnh nhạc.
- Phân biệt tài nguyên phát sinh với source, code Pianist với MuseScore upstream, tài liệu hiện hành với lịch sử. Không mass move upstream hoặc lịch sử chỉ để làm đẹp cây thư mục.

## Tiến độ

| Giai đoạn | Sản phẩm cụ thể | Cổng hoàn thành | Trạng thái |
|---|---|---|---|
| 1. Tài liệu, inventory, kiểm thống nhất/CI | Điểm vào docs; kiến trúc/source content/release; kiểm source và dữ liệu có lệnh rõ | Link/path và inventory đúng; suite/check CI đúng phạm vi; mốc commit | Hoàn thành · `165ca9` |
| 2. Format và chia UI/CSS | Source đọc được; tách shell/library/editor/results, các phần UI practice; style thuộc đúng feature | Commit format tách khỏi hành vi; unit/build và browser/mobile cần thiết đạt; style piano/sheet còn đủ | Đang thực hiện · format `2061aaaa12` |
| 3. Một nơi sở hữu session, chia trách nhiệm workspace | Coordinator duy nhất cho lifecycle; UI/grade dùng lệnh; workspace tách trách nhiệm engine/document/navigation | Start/Stop khi tải, pause/resume, auto-next, A–B, giữ editor và persist không đổi | Chưa bắt đầu |
| 4. Nguồn grade, manifest và tooling đang dùng/lịch sử | Nguồn + index + schema có điểm vào rõ; phân loại tools active/legacy; đường truy từ score ID tới MXL | 5.600 nội dung/hash/order giữ nguyên; catalog/manifest/hash kiểm; không chạy pipeline lịch sử ngoài ý muốn | Chưa bắt đầu |
| 5. API package công khai, kiểu native và guard | Import qua entrypoint ổn định; typed native boundary; kiểm hướng phụ thuộc và dữ liệu | Typecheck/test/build/guard đạt; release verifier + smoke gói cuối; tài liệu phản ánh cấu trúc thực tế | Chưa bắt đầu |

Trạng thái chỉ chuyển thành hoàn thành khi đã có bằng chứng tương ứng. Kế hoạch không tự xác nhận binary hoặc website đã được cập nhật.

Mốc 1: cổng source đạt 194 test TypeScript, 45 test Python và duyệt đủ 5.600 nguồn grade, kể cả kiểm từ bản sao chỉ có source. Mốc định dạng `2061aaaa12` giữ hành vi và đạt unit/build. Các số này là kết quả tại mốc, không phải tổng cố định cho các bước sau.

## Cách chia thay đổi

Giai đoạn 1 chốt bản đồ và baseline trước khi di chuyển. Giai đoạn 2 bắt đầu bằng commit chỉ định dạng; sau đó tách view/style theo trách nhiệm. Không tạo các wrapper chỉ chuyển tiếp mọi prop mà không làm rõ ranh giới.

Giai đoạn 3 giữ engine/controller hiện có, chuyển quyền sở hữu và điều phối sang một nơi. Tách `workspace` bằng façade tương thích trước để từng call site chuyển an toàn. Sự kiện session có subscription riêng; trạng thái app không cần phát lại toàn bộ chỉ để vẽ mỗi frame.

Giai đoạn 4 ưu tiên khả năng tìm và xác minh nội dung: tên score ID dễ đọc, hash MXL giữ nguyên, manifest quyết định release. Các giới hạn grade/option được version hóa khi thật sự thay schema; không nới validator chỉ để đủ số lượng.

Giai đoạn 5 khóa ranh giới đã ổn định: UI không import sâu implementation upstream; native API có type và kiểm dữ liệu ở boundary. Không thay mọi `any` bằng ép kiểu giả làm tăng độ an toàn; phần chưa mô hình hóa phải được ghi rõ hoặc kiểm ở runtime.

Mỗi mốc ghi phạm vi, test và hạn chế vào commit/report. Báo cáo cuối phải phân biệt refactor đã kiểm local với bản đã phát hành online, MIDI mô phỏng với đàn thật.
