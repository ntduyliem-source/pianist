# Thư viện piano được phát hành

`songs/` giữ nguyên MXL nguồn. `catalog.json` là danh mục đang dùng; tên hiển thị,
tác phẩm, phiên bản và hash nằm ở đây. Không sửa trực tiếp MXL để ép qua bộ nhận.
Các báo cáo `IMPORT_REPORT*.md` là lịch sử từng đợt nhập, không phải số lượng hiện tại.

## Điều kiện nhận bài

Từ 23/10/2026, thư viện chỉ nhận **đúng hai khuông piano về cấu trúc trên toàn bài**:

- Một part piano có hai khuông, hoặc hai part piano mỗi part một khuông đều hợp lệ.
- Đọc `<staves>` theo trạng thái MusicXML; không khai báo thì mặc định một khuông.
  Số khuông không được đổi giữa bài; mọi tham chiếu khuông phải thuộc cấu trúc đã khai báo.
- Không dùng số dòng khóa Sol/Fa hoặc số khuông nhìn thấy trên ảnh để suy số khuông.
  Hai khóa Sol, đổi khóa, ẩn khuông trống, ô nghỉ và chỉ một tay có nốt đều được giữ.
- Tổng hai khuông chưa đủ để nhận dàn nhạc: mỗi part phải có bằng chứng piano từ
  chương trình General MIDI 1–6, `keyboard.piano`, hoặc nhãn piano rõ ràng.
  Chương trình/âm sắc/nhãn nhạc cụ khác mâu thuẫn sẽ bị loại; thiếu bằng chứng phải kiểm lại.
- Bộ kiểm này không thay kiểm nhập, playback, ánh xạ nốt và độ trung thực MuseScore.
  File qua cấu trúc vẫn phải qua các bước kiểm native trước khi phát hành.

Chính sách dùng chung tại `buildscripts/pianist/library_staff_policy.py`.
Nhập nối bằng `curate-library.py` mặc định giữ các bài cũ, bỏ bản trùng và thêm
phiên bản N+1 khi xác định được cùng tác phẩm. Mọi bản mới sai chính sách được ghi
`excluded`; đóng gói release kiểm lại chính sách để không lọt file chỉ vì hash hợp lệ.

## Đối soát ngày 23/10/2026

Đã đọc toàn bộ 65 MXL; giữ **60 phiên bản thuộc 58 tác phẩm**. Các MXL còn lại,
ID, `workId`, số phiên bản và thứ tự giữ nguyên. Hai nhóm có nhiều phiên bản vẫn giữ đủ.

| Bản bỏ khỏi thư viện phát hành | Cấu trúc nguồn |
| --- | --- |
| Và thế là hết | Một khuông piano |
| Tình em là đại dương — bản ngắn | Một khuông piano |
| Mojito | Ba khuông: một part piano trống một khuông và một part piano hai khuông |
| Chính Chúa chọn con | Ba khuông: giọng hát một khuông và piano hai khuông |
| Cho em một lần yêu | Ba khuông: một part piano trống một khuông và một part piano hai khuông |

[Hồ sơ từng file và lý do](STAFF_POLICY_REPORT.json). Bản gốc của năm file và catalog
trước thay đổi được lưu ở `artifacts/library-two-staff-2026-10-23/originals/` trên máy
phát triển; Git cũng giữ lịch sử. Không đụng file Downloads, kho grade hoặc `warehouse`.

Kiểm chính sách và luồng nhập:

```powershell
python -m unittest discover -s tests/library -p 'test_library_*.py'
```
