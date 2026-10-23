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
| 2. Format và chia UI/CSS | Source đọc được; tách shell/library/editor/results, các phần UI practice; style thuộc đúng feature | Commit format tách khỏi hành vi; unit/build và browser/mobile cần thiết đạt; style piano/sheet còn đủ | Hoàn thành · `5744bc4166`, `20578f2c2f` |
| 3. Một nơi sở hữu session, chia trách nhiệm workspace | Coordinator duy nhất cho lifecycle; UI/grade dùng lệnh; workspace tách trách nhiệm engine/document/navigation | Start/Stop khi tải, pause/resume, auto-next, A–B, giữ editor và persist không đổi | Hoàn thành · `fa690bf68e` |
| 4. Nguồn grade, manifest và tooling đang dùng/lịch sử | Nguồn + index + schema có điểm vào rõ; phân loại tools active/legacy; đường truy từ score ID tới MXL | 5.600 nội dung/hash/order giữ nguyên; catalog/manifest/hash kiểm; không chạy pipeline lịch sử ngoài ý muốn | Hoàn thành · `85a46666df` |
| 5. API package công khai, kiểu native và guard | Import qua entrypoint ổn định; typed native boundary; kiểm hướng phụ thuộc và dữ liệu | Typecheck/test/build/guard đạt; release verifier + smoke gói cuối; tài liệu phản ánh cấu trúc thực tế | Code và kiểm local hoàn tất · chờ gói source sạch |

Trạng thái chỉ chuyển thành hoàn thành khi đã có bằng chứng tương ứng. Kế hoạch không tự xác nhận binary hoặc website đã được cập nhật.

Mốc 1: cổng source đạt 194 test TypeScript, 45 test Python và duyệt đủ 5.600 nguồn grade, kể cả kiểm từ bản sao chỉ có source. Mốc định dạng `2061aaaa12` giữ hành vi và đạt unit/build. Các số này là kết quả tại mốc, không phải tổng cố định cho các bước sau.

Mốc 2: 195 test TypeScript, format và build đạt. Đối chiếu CSS giữ nguyên 438 node theo thứ tự; mobile/native 4 nhóm, policy 4 nhóm và grade-practice 9 nhóm đều đạt. Bằng chứng CSS/mobile ở `artifacts/refactor-phase2/`; kiểm mobile là mô phỏng viewport/touch, chưa phải điện thoại vật lý.

Mốc 3: đã tách `application/session-lifecycle`, `practice-repository`, `grade-audio-loan`, `workspace-state` và `platform/engine-host`; UI không tạo controller trực tiếp. Typecheck/build và 209 test TypeScript đạt. Test bổ sung kiểm tách frame/status, callback/cleanup cũ, cleanup tái nhập hoặc ném lỗi, lỗi startup tự dọn controller, kết quả lưu chậm sau khi rời màn tập, chờ native bị thay thế, giữ undo editor và calibration theo thiết bị. Cổng source đạt ở `artifacts/checks/20261023T075453.100532Z-fast/report.json`. Năm suite browser đầu đạt ở `20261023T075017.279406Z-browser`; sau sửa các race đã chạy lại Stop, grade-practice và route-guard trên gói `080cb6778055131d7a2f`, đều đạt ở `artifacts/checks/20261023T075507.986289Z-browser/report.json`.

Mốc 4: [receipt](../scores/grades/RELOCATION_REPORT.json) ghi 5.751 file chuyển nguyên byte/Git blob, 5.600 chuyển đổi mới và so sự kiện, toàn bộ 5.658 file release trùng byte với kho đang dùng. `scores/grades/definition.json` là nguồn metadata chung Python/TypeScript; chặn thiếu quota, sai khoảng/ID và trùng score ID. Inventory phân loại 85 script hiện hành/tham khảo/lịch sử. Cổng source đạt 211 test TypeScript, 51 test Python và 5.600 nguồn; advanced delivery đạt 27 test. Grade browser đạt 9 nhóm trên gói `3c515e4cf04c004b3852`; báo cáo ở `artifacts/checks/20261023T080950.672683Z-browser/report.json`.

Mốc 5: các consumer dùng public API, Worker tạo qua factory, app không import kernel upstream. Native snapshot/semantics/audio có type và decoder chung, kiểm dữ kiện sau cleanup C++; callbacks cũ được phục hồi cả khi lỗi. Guard AST kiểm 93 module/259 phụ thuộc, kể cả import type, re-export, Worker URL và destructuring global I/O. Cổng source đạt 222 test TypeScript, 51 test Python, 5.600 nguồn và 39 source pins ở `artifacts/checks/20261023T084232.670330Z-fast/report.json`. Sau siết enum không ép chuỗi, toàn bộ 222 test và build được chạy lại, đạt.

Toàn bộ 11 suite native, release integrity và cutover đạt trên gói `f6662a3ada5157c0cae0`: `artifacts/checks/20261023T083514.817460Z-native/report.json`. Sau bỏ kiểm semantics trùng và siết enum, đã build/package lại gói `582df813e4fd6a127e9c`, chạy lại format-integrity, toàn bộ 60 bài library-policy, native-preview-grade và ABC/MXL UI; đều đạt ở `artifacts/checks/20261023T084616.242390Z-browser/report.json`. Mobile editor/full-sheet đạt sáu viewport, có âm MS Basic, pause/tua/A–B/Stop và MIDI BPM mô phỏng; touch sửa nốt/Undo native đạt. Bằng chứng ở `artifacts/refactor-phase5/mobile-native/` và `editor-touch/`. Chỉ kiểm mobile mô phỏng, chưa điện thoại/đàn MIDI vật lý. Bản đồ nâng upstream nằm ở [native-patches.md](current/native-patches.md).

## Cách chia thay đổi

Giai đoạn 1 chốt bản đồ và baseline trước khi di chuyển. Giai đoạn 2 bắt đầu bằng commit chỉ định dạng; sau đó tách view/style theo trách nhiệm. Không tạo các wrapper chỉ chuyển tiếp mọi prop mà không làm rõ ranh giới.

Giai đoạn 3 giữ engine/controller hiện có, chuyển quyền sở hữu và điều phối sang một nơi. Tách `workspace` bằng façade tương thích trước để từng call site chuyển an toàn. Sự kiện session có subscription riêng; trạng thái app không cần phát lại toàn bộ chỉ để vẽ mỗi frame.

Giai đoạn 4 ưu tiên khả năng tìm và xác minh nội dung: tên score ID dễ đọc, hash MXL giữ nguyên, manifest quyết định release. Các giới hạn grade/option được version hóa khi thật sự thay schema; không nới validator chỉ để đủ số lượng.

Giai đoạn 5 khóa ranh giới đã ổn định: UI không import sâu implementation upstream; native API có type và kiểm dữ liệu ở boundary. Không thay mọi `any` bằng ép kiểu giả làm tăng độ an toàn; phần chưa mô hình hóa phải được ghi rõ hoặc kiểm ở runtime.

Mỗi mốc ghi phạm vi, test và hạn chế vào commit/report. Báo cáo cuối phải phân biệt refactor đã kiểm local với bản đã phát hành online, MIDI mô phỏng với đàn thật.
