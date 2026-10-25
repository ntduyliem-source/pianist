# Dấu vết bản build web

`npm run build` trong `apps/pianist-web` chạy `buildscripts/pianist/web_provenance.cjs`: chụp hash inputs, chạy TypeScript và Vite, kiểm lại inputs rồi mới ghi `build.artifacts/web/frontend.json`. Build lỗi hoặc source thay đổi trong lúc build không tạo bằng chứng thành công.

Inputs bao gồm source app, cấu hình Vite/TypeScript, package manifest/lock, bản vá dependency, các package runtime, định nghĩa grade/curriculum được import và manifest converter ABC. Stamp chỉ lưu hash tổng và số inputs; không ghi giá trị biến môi trường hay nội dung dotenv. Dotenv/local source có trên máy được tính vào hash; public gate từ chối input không có trong Git archive. Chỉ đổi native C++ không bắt dựng lại Vite.

Stamp ghi hash/bytes của tất cả JS/CSS Vite phát hành, kể cả Worker/chunk, và đòi đủ các entry. Trước khi ghi stamp, build kiểm module nguồn trong sourcemap: nếu Vite bundle thêm file repo ngoài phạm vi fingerprint thì phải khai báo input đó trước. Sourcemap không thuộc bản public. Package/native gate/stage đối chiếu source lẫn output, vì vậy commit frontend mới rồi chỉ chạy package không thể gắn nhãn mới lên bundle cũ.

Glue MuseScore `distr/*.js`, `config.js` cấu hình audio worker OFF, `pianist.html`/`index.html`, icon và manifest được kiểm trực tiếp với source mà installer sao chép. Thay glue rồi quên chạy `node src/web/appjs/install.js build.artifacts` sẽ bị chặn; không cần build lại Vite hoặc native chỉ để sao chép các file này.

Kiểm riêng:

```powershell
node buildscripts/pianist/web_provenance.cjs verify --directory build.artifacts
```

Thêm `--public` để xác nhận inputs tồn tại trong source archive. Kiểm này bảo vệ pipeline khỏi output cũ hoặc build bị thay đổi; nó không thay việc cài dependency đúng lockfile, kiểm SDK/toolchain hay kiểm hành vi bằng browser gate.
