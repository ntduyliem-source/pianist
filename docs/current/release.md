# Đóng gói và phát hành

Trang này là bản đồ đường đi release. Lệnh và yêu cầu GitHub Pages chi tiết nằm ở [deploy/PAGES.md](../../deploy/PAGES.md). Dùng [development.md](development.md) để build/kiểm, [content-pipeline.md](content-pipeline.md) để xác định nguồn bài.

## Nguồn nào đi vào gói

- Shell React từ `apps/pianist-web/`; native app/audio/renderer từ các target trong `buildscripts/pianist/`.
- Thư viện gồm catalog được duyệt, đúng các MXL catalog tham chiếu và ảnh xem trước có hash/provenance trong `scores/library/previews/`.
- Grade chỉ gồm release được `build.artifacts/curriculum/manifest.json` trỏ tới, các index và MXL có hash khớp. Nguồn ABC được giữ trong source archive; browser tập bằng MXL đã kiểm.
- Converter, nguồn tham khảo, giấy phép và toolchain pins theo scripts chuẩn bị và verifier.
- `warehouse/`, corpus Q/K, ví dụ local, logs và cache không tự động được đưa vào web ZIP.

## Các cổng kiểm

| Bước | Điều cần được xác nhận |
|---|---|
| Build và test | Source và binary tương ứng; hành vi bị sửa có kiểm; native app/renderer tối ưu |
| Commit source | Source sạch; kho grade giữ ID/hash/order nếu chỉ refactor; thay catalog có receipt |
| `package-web.py` | Manifest integrity khớp toàn bộ bytes sẽ được dùng |
| `stage-release.py` | Thư mục staging mới, source archive đúng commit, không kèm asset ngoài manifest |
| `verify-release.py --public` | Gói public hợp lệ, nguồn/pins/notices/catalog/bank/hash đầy đủ |
| GitHub Release | Tag trỏ source commit đã kiểm; web ZIP và source archive đúng bản |
| `deploy/pages-release.json` | `tag`, `sha256`, `sourceCommit`, `version` lấy từ gói, không gõ ước lượng |
| Workflow và kiểm online | Workflow thành công; bytes/version trên host khớp; smoke đường dùng thật |

Lệnh kiểm và phạm vi CI được mô tả ở [validation.md](validation.md). `fast` xác minh source; `native` cần gói đã build đúng source. Cả hai phải báo kết quả theo phạm vi thật đã chạy.

Không dùng việc `npm run build` thành công để kết luận đã kiểm native hoặc đã phát hành. Không dùng gói local có source dirty làm source release tương ứng.

## Theo dõi bản đang công bố

[deploy/pages-release.json](../../deploy/pages-release.json) là con trỏ phiên bản được repository yêu cầu triển khai. Kết quả workflow và `release.json` trên website mới xác nhận website thực sự đang phục vụ phiên bản đó.

```powershell
python buildscripts/pianist/verify-release.py --url https://ntduyliem-source.github.io/pianist/ --public --github-pages
```

GitHub Pages không cấu hình header như Caddy; dùng đúng chế độ verifier cho host. Kiểm browser gồm mở thư viện, editor, nghe/Stop, free play, grade và một viewport mobile tương ứng phạm vi thay đổi. Đàn thật/điện thoại thật phải được báo riêng với MIDI/viewport mô phỏng.

## Sự cố và quay lại phiên bản cũ

Giữ nguyên release artifacts đã công bố. Nếu cần rollback, chọn một release đã xác minh, cập nhật manifest deploy bằng metadata của chính release đó rồi chạy lại workflow. Không pha một file WASM cũ với JS mới hoặc sửa ZIP đã ký hash. Dữ liệu IndexedDB của người dùng cần tương thích với phiên bản đích; một thay đổi schema dữ liệu phải có kế hoạch migration/rollback riêng.
