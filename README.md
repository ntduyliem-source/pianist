# Pianist Web

Pianist là ứng dụng web chỉnh sửa và tập piano, fork từ MuseScore Studio 4.7.5.

**[Mở ứng dụng online](https://ntduyliem-source.github.io/pianist/)**

- Thư viện nhận MXL/MusicXML, MSCZ/MSCX và ABC; có bộ bài piano được kiểm trước khi đóng gói.
- Editor MuseScore chỉnh sửa, lưu, xuất và phát bản nhạc bằng tiếng MS Basic. Phát/tạm dừng bằng Space; có nút dừng và thanh tua.
- Màn tập riêng: Đúng nốt hoặc BPM, nhả phím/pedal, A–B, full sheet, highlight native và cuộn theo bài.
- Xử lý trong trình duyệt. Bản chỉnh sửa lưu bằng MSCZ trên thiết bị; hỗ trợ sao lưu/khôi phục và chuẩn bị offline.

## Hướng dẫn

- [Sử dụng và build](docs/PIANIST_WEB.md)
- [Bộ bài được nhận và các file bị loại](scores/library/IMPORT_REPORT.md)
- [Nguồn thuật toán chấm](third_party/practice-sources/PROVENANCE.md)
- [Profile ABC và giới hạn chuyển đổi](docs/ABC_CONVERTER_RESULTS.md)
- [Phát hành bằng GitHub Pages](deploy/PAGES.md)

## Build trên Windows

Checkout mới cần chạy `buildscripts/pianist/setup-web.ps1`, sau đó:

```powershell
.\buildscripts\pianist\build-pianist.ps1
python buildscripts/pianist/serve-web.py
```

Mở `http://127.0.0.1:8787/pianist.html`. Khi đã có native engine đúng phiên bản, dùng `-SkipEngine` để chỉ build lại web.

```powershell
cd apps/pianist-web
npm test
npm run build
```

## Mã nguồn và giấy phép

Native editor/playback dựa trên [MuseScore](https://github.com/musescore/MuseScore), base commit được ghim trong `buildscripts/pianist/toolchain.json`. README upstream được giữ tại [README-MuseScore.md](README-MuseScore.md).

Xem [GPL v3](LICENSE.txt), [third-party notices](docs/THIRD_PARTY_NOTICES.md) và giấy phép trong từng thư mục nguồn tham khảo. Release gồm mã nguồn đúng commit, pins, notices và hướng dẫn build.
