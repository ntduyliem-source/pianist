# Đóng gói và phát hành

Trang này là bản đồ đường đi release. Lệnh và yêu cầu GitHub Pages chi tiết nằm ở [deploy/PAGES.md](../../deploy/PAGES.md). Dùng [development.md](development.md) để build/kiểm, [content-pipeline.md](content-pipeline.md) để xác định nguồn bài.

## Nguồn nào đi vào gói

- Shell React từ `apps/pianist-web/`; native app/audio/renderer từ các target trong `buildscripts/pianist/`.
- Thư viện gồm catalog được duyệt, đúng các MXL catalog tham chiếu và ảnh xem trước có hash/provenance trong `scores/library/previews/`.
- Giáo trình lấy từ `scores/methods/catalog.json`, giữ số bài và chỉ sao chép MXL được catalog tham chiếu. `methods_release.py` kiểm hash/bytes, đủ hai khuông, số ngón ghi trên bản nguồn, thứ tự bài và thông tin quyền sử dụng. Cache tải nguồn/giấy phép đang chờ ngoài catalog không được đưa vào web. MXL tải khi mở bài; catalog được giữ offline cùng shell.
- Grade chỉ gồm release được `build.artifacts/curriculum/manifest.json` trỏ tới, các index và MXL có hash khớp. Nguồn ABC được giữ trong source archive; browser tập bằng MXL đã kiểm.
- Converter, nguồn tham khảo, giấy phép và toolchain pins theo scripts chuẩn bị và verifier.
- `warehouse/`, corpus Q/K, ví dụ local, logs và cache không tự động được đưa vào web ZIP.

## Các cổng kiểm

| Bước | Điều cần được xác nhận |
|---|---|
| Build và test | Source và binary tương ứng; hành vi bị sửa có kiểm; native app/renderer tối ưu |
| Commit source | Source sạch; kho grade giữ ID/hash/order nếu chỉ refactor; thay catalog có receipt |
| `package-web.py` | Native app/audio/renderer và frontend có proof từ build thành công, hash input hiện tại và hash output đều khớp; installed glue/HTML khớp source; manifest khớp toàn bộ bytes |
| `stage-release.py --prepare-only` | Tạo candidate public trong thư mục mới; chưa tạo ZIP/source archive |
| `check-pianist.py native --site ... --public` | Source sạch đúng commit; mọi suite quan trọng chạy trên chính candidate, kể cả hash service worker và validation scripts |
| `stage-release.py --finalize` | Bắt buộc receipt full-native khớp candidate; không file ngoài manifest/link; mới tạo ZIP và source archive đúng commit |
| `verify-release.py --public` | Gói public hợp lệ, nguồn/pins/notices/catalog/bank/hash đầy đủ; số giáo trình/bài khớp `release.methodBooks` |
| GitHub Release | Tag trỏ source commit đã kiểm; web ZIP và source archive đúng bản |
| `deploy/pages-release.json` | `tag`, `sha256`, `sourceCommit`, `version` lấy từ gói, không gõ ước lượng |
| Workflow và kiểm online | Workflow thành công; bytes/version trên host khớp; smoke đường dùng thật |

Lệnh kiểm và phạm vi CI được mô tả ở [validation.md](validation.md). `fast` xác minh source; `native` cần gói đã build đúng source. Cả hai phải báo kết quả theo phạm vi thật đã chạy.

Không dùng việc `npm run build` thành công để kết luận đã kiểm native hoặc đã phát hành. Không dùng gói local có source dirty làm source release tương ứng.

Mỗi wrapper native chụp fingerprint trước build và kiểm lại sau build. `native/app.json`, `native/audio.json`, `native/renderer.json` gắn cấu hình, source input và output bytes của lần build thành công. Commit mới hoặc chạy package không thể hợp thức hóa WASM cũ. Chỉ sửa React/CSS/content có thể dùng lại binary khi input native thực sự không đổi. Thay native cần chạy wrapper incremental; không tự tạo proof. Root CMake/version/local override, build rules, source, fonts và resources được tính theo target. Stage từ chối native input không tracked, vì file đó không có trong source archive.

`npm run build` cũng chụp input/output frontend vào `web/frontend.json`. Sửa React, packages, dependency lock hoặc build config phải build lại frontend; không thể dùng JS cũ chỉ vì native còn đúng. `web_provenance.cjs verify` còn đối chiếu installed glue, HTML/icon/manifest với source và cấu hình production. Metadata `release.webBuild` ghi cả fingerprint frontend và các source đã cài; verifier online đối chiếu output proof với inventory, không yêu cầu host đang chạy trùng local HEAD.

Sau khi commit source và package, tạo candidate rồi nghiệm thu đúng candidate:

```powershell
python buildscripts/pianist/stage-release.py --output artifacts/releases/candidate --prepare-only
python buildscripts/pianist/check-pianist.py native --site artifacts/releases/candidate/site --public
python buildscripts/pianist/stage-release.py --output artifacts/releases/candidate --finalize
```

Receipt ghi trong `SOURCE.json` gồm hash report, release, service worker và bộ validation. Sửa source, candidate hoặc scripts kiểm sau gate sẽ làm finalize từ chối. Kiểm vài suite bằng `browser` không thay thế receipt full-native. `native_provenance.py` thuộc nhóm tooling `build`; `release_gate.py` thuộc nhóm `checks` trong tooling-index.

## Theo dõi bản đang công bố

[deploy/pages-release.json](../../deploy/pages-release.json) là con trỏ phiên bản được repository yêu cầu triển khai. Kết quả workflow và `release.json` trên website mới xác nhận website thực sự đang phục vụ phiên bản đó.

```powershell
python buildscripts/pianist/verify-release.py --url https://ntduyliem-source.github.io/pianist/ --public --github-pages
```

GitHub Pages không cấu hình header như Caddy; dùng đúng chế độ verifier cho host. Kiểm browser gồm mở thư viện, editor, nghe/Stop, free play, grade và một viewport mobile tương ứng phạm vi thay đổi. Đàn thật/điện thoại thật phải được báo riêng với MIDI/viewport mô phỏng.

## Sự cố và quay lại phiên bản cũ

Giữ nguyên release artifacts đã công bố. Nếu cần rollback, chọn một release đã xác minh, cập nhật manifest deploy bằng metadata của chính release đó rồi chạy lại workflow. Không pha một file WASM cũ với JS mới hoặc sửa ZIP đã ký hash. Dữ liệu IndexedDB của người dùng cần tương thích với phiên bản đích; một thay đổi schema dữ liệu phải có kế hoạch migration/rollback riêng.
