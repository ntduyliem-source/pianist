# Phát hành Pianist Web qua GitHub Pages

Địa chỉ: https://ntduyliem-source.github.io/pianist/

Source ứng dụng ở nhánh `pianist/m0-web`. Native WASM được build tối ưu trên
Windows bằng toolchain đã ghim; GitHub Actions nhận gói release đúng hash,
xác minh toàn bộ tài nguyên rồi xuất bản. Không đưa binary WASM vào lịch sử Git.

## Chuẩn bị một phiên bản

1. Chạy test, build native/web và kiểm browser. Commit source sạch.
2. Chạy `composed-reading-bank.py` để đóng gói kho ABC G1–G8, rồi
   `package-web.py`. Native phải có proof từ các build wrapper; package từ chối
   WASM có input hoặc output không khớp dù HEAD đã đổi.
   Tạo candidate với `stage-release.py --output artifacts/releases/candidate --prepare-only`;
   chạy `check-pianist.py native --site artifacts/releases/candidate/site --public`;
   cuối cùng `stage-release.py --output artifacts/releases/candidate --finalize`.
   Finalize chỉ tạo ZIP/source archive khi receipt full-native khớp chính candidate.
3. Push source commit lên `origin/pianist/m0-web`.
4. Tạo GitHub Release trỏ đúng source commit; upload `pianist-web.zip`, source
   archive, `SOURCE.json`, `SHA256SUMS.json` và các file cấu hình triển khai.
5. Cập nhật `deploy/pages-release.json` với `tag`, SHA-256 của web ZIP,
   `sourceCommit` và `version` lấy từ release đã xác minh. Commit/push file này.

Workflow `Publish Pianist Web` chỉ tự chạy khi manifest triển khai thay đổi.
Nó dùng các action Pages chính thức, quyền `pages:write`/`id-token:write` và
environment `github-pages`. Source commit trong ZIP phải khớp manifest;
archive sai hash, path không an toàn hoặc tài nguyên sai byte đều dừng triển khai.

## Xác minh online

```powershell
python buildscripts/pianist/verify-release.py --url https://ntduyliem-source.github.io/pianist/ --public --github-pages
```

GitHub Pages phục vụ static và không cho đặt các header tùy ý như Caddy.
`--github-pages` giữ kiểm HTTPS, WASM MIME, hash, source/pins, thư viện và
inventory; không yêu cầu header riêng. Build này dùng Qt/WASM single-thread,
đã được kiểm chạy thực tế trên host không có COOP/COEP. Với hosting Caddy,
tiếp tục dùng chế độ kiểm header mặc định.

Kiểm thêm trên browser thật: mở thư viện, nghe piano nhẹ ở lần đầu,
tạm dừng/tua/dừng, bật “Tiếng MuseScore” rồi nghe MS Basic. Đổi sang tập và thử ABC. Đàn MIDI thật cần người dùng cấp
quyền trên origin HTTPS; các lượt nghiệm thu tự động dùng MIDI mô phỏng.

Các bài đóng gói chỉ lấy từ `scores/library/catalog.json`; report ghi rõ bản
được nhận/bỏ. Phố Xa và file trong `examples/local/` vẫn thuộc ví dụ local.

Tab Tập piano dùng kho `scores/grades/generated/g1-abc` đến `g8-abc`: 5.600 bài,
100 bài mỗi grade × khoảng nốt. IDs/chủ đề/7 khoảng/quota100 dùng chung từ
`scores/grades/definition.json`; nguồn biên soạn ở `scores/grades/authored/`. Gói phát hành lấy đúng manifest kho đã kiểm;
không chạy lại bộ trích K5 cũ khi staging. ABC là nguồn, MXL là tài nguyên
được chuyển đổi và kiểm trước khi phát hành. Các file kho cũ trên đĩa không
thuộc manifest mới và không được đưa vào web ZIP.
