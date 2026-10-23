# Quy tắc duyệt cao độ cho tám grade

Thay đổi ngày 23/10/2026 chỉ sửa **logic duyệt**, theo yêu cầu người dùng. Không sinh bài, không chuyển giọng bài cũ, không đổi manifest hay thay 5.600 MXL đang dùng. Kho hiện có vẫn sử dụng 29 phím trắng; khả năng duyệt đủ 88 phím không đồng nghĩa kho đã phủ đủ 88 phím.

Các bộ duyệt `package-g1-abc.py` đến `package-g4-abc.py` và `package-advanced-abc.py` dùng chung `abc_grade_pitches.py`. Cao độ hợp lệ nằm trong A0–C8, gồm phím trắng và đen. Tham số `key` nhận giọng trưởng/thứ đến bảy dấu hóa; mặc định C để giữ nguyên nguồn cũ. Ký hiệu thăng, giáng, bình được đọc theo từng cao độ và octave, hết ô nhịp thì trở về hóa biểu; tie giữ cao độ qua vạch nhịp theo `MusicXml.mkPitch` của abc2xml 2.68 đã ghim trong repo.

Quãng được kiểm bằng **cặp bậc viết và số bán cung chính xác**, không chỉ kiểm hai giới hạn riêng. Các bước nhỏ được phép là P1, m2/M2, m3/M3, P4, P5, có cùng chiều trên khuông và trên bàn phím. Ví dụ F–G♯ không được nhận như một bước đi dễ; C–E♯ không được tính là quãng bốn dù cách nhau 5 bán cung; C♯–E♭ không được tính là quãng ba trưởng/thứ. Các bài hợp âm rải G3 có thể dùng một hợp âm trưởng hoặc thứ ở gốc khác C, nhưng bằng chứng quãng năm phải đúng cả cách viết lẫn 7 bán cung. Không suy ngón tay từ số bán cung.

Tie phải giữ đúng cặp tên nốt/octave mà abc2xml dùng, không chỉ bằng số MIDI. C♯→D♭ không được duyệt như tie. Validator cũng giữ quy tắc nhận diện ký hiệu octave của converter; không tự gộp hai cách viết mà converter xem là khác nhau rồi đổi tie thành slur.

| Grade | Trọng tâm và giới hạn giữ lại | Trần dòng kẻ phụ mỗi nốt |
|---|---|---:|
| G1 | Đơn âm, đi liền bậc tối đa 2 bán cung; nhịp cơ bản; mỗi tay trong phạm vi 7 bán cung | 1 |
| G2 | Nhánh quãng ba: tối đa 2 bậc/4 bán cung, phải có quãng ba và bước đi; hoặc nhánh cặp móc đơn, tay phụ giữ nhịp quen | 1 |
| G3 | Quãng bốn đúng, quãng năm đúng hoặc hợp âm rải trưởng/thứ có bằng chứng liên tiếp; không thêm tiết tấu mới | 2 |
| G4 | Chuyển lên/xuống vùng đã khai báo, hoặc đi qua phạm vi octave bằng các quãng nhỏ; bước nhảy tối đa P5 | 2 |
| G5 | Hai tay lệch điểm vào và có chồng âm, hoặc hợp âm hai nốt; mỗi tay trong phạm vi 7 bán cung; giữ nhịp cơ bản | 3 |
| G6 | m6/M6/m7/M7/P8 đúng chiều, có bước tiếp cận và rời quãng; tay dẫn trong phạm vi 16 bán cung, tay phụ 7; không thêm hợp âm/tiết tấu | 4 |
| G7 | Tách riêng chấm dôi, tie, đảo phách, 6/8; tay phụ vào đầu ô; không trộn các họ nhịp | 5 |
| G8 | Nhánh dòng kẻ phụ cao/thấp, hoặc hợp âm hai nốt kết hợp chấm dôi/tie; chấp nhận đến A0/C8; nhánh dòng phụ phải có bằng chứng ít nhất hai dòng phụ | 9 |

Phạm vi trong bảng là phạm vi toàn câu của một tay, **không phải độ giãn ngón bắt buộc giữ cùng lúc**. Các giới hạn hợp âm, giữ tie, trường độ, nhịp, số lần đánh, hai tay có nốt thật, tay trái thấp hơn tay phải và không tạo một vòng lặp quá ngắn vẫn được kiểm. Dấu hóa kép chỉ được duyệt ở G8. G4 nhận thêm `home_range` để kiểm chuyển vùng so với vị trí xuất phát được khai báo; mặc định giữ vị trí C của giáo trình cũ, không dùng làm danh sách giọng được phép.

Đây là quy tắc kỹ thuật của giáo trình nội bộ. Các con số dòng kẻ phụ và ánh xạ tám grade chưa được thử nghiệm hiệu quả học tập, không phải chuẩn thi hay ngưỡng khoa học đã được xác nhận. Không tự nâng/hạ grade chỉ bằng chuyển giọng hoặc chuyển octave: bản viết mới phải vượt qua toàn bộ điều kiện quãng, nhịp, phạm vi và cách phối hợp tay.

Kiểm chứng: `tests/library/test_composed_grade_pitches.py` đối chiếu sự kiện với converter gốc cho các hóa biểu trưởng/thứ, dấu hóa theo octave/ô nhịp, tie qua vạch nhịp, và đầu vào kiểm thử chứa đủ MIDI 21–108. Đây chỉ là dữ liệu kiểm thử trong bộ nhớ, không được xuất thành bài tập. `composed-reading-bank.py` vẫn so từng nốt/nghỉ/onset/duration/staff/tie với nguồn; mã kiểm tra pipeline bao gồm cả bộ duyệt chung để không tái dùng cache của quy tắc cũ.
