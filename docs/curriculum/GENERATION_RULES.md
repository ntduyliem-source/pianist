# Quy tắc sinh quiz từ kho nhạc thật

Thiết kế cho Pianist, cập nhật ngày 20 tháng 10 năm 2026. Người dùng chọn grade, chế độ đúng nốt/BPM và khoảng số nốt mỗi câu. **Phân tích nguồn một lần trước khi phát hành; chọn và tạo biến thể lúc tập; luôn chuẩn bị trước các câu tiếp theo.** Không cần lưu hàng triệu MXL được sinh sẵn.

Đây là đặc tả sản phẩm, chưa phải generator đã triển khai. Căn cứ và giới hạn của hệ grade nằm trong [GRADE_DESIGN.md](GRADE_DESIGN.md). Các giới hạn số nốt dưới đây phục vụ câu ngắn và giao diện; chúng không phải liều luyện tập đã được khoa học xác nhận.

Thực hiện theo [kế hoạch Q0–Q9](IMPLEMENTATION_PLAN.md), từ tải kho và chuẩn hóa tới bộ sinh, UI và cập nhật bản online.

## Kết quả review

1. Nhịp cơ bản phải xuất hiện từ G1: giữ phách qua nốt dài và dấu lặng cũng là nhiệm vụ đọc. G7 dành cho các cấu trúc nhịp phức tạp hơn. [Hướng dẫn Faber Primer](https://pianoadventures.com/piano-books/basic-piano-adventures/primer/q-and-a/) đặt việc giữ phách và đọc đúng trường độ ngay ở cấp nhập môn.
2. Một grade chứa các họ bài có trọng tâm riêng. Khi thêm quãng 3, giữ nhịp cũ; khi thêm cặp móc đơn, dùng cao độ đã quen. Không lấy mọi giá trị tối đa của một grade rồi trộn cùng lúc.
3. Số nốt là độ dài, không phải nhãn độ khó. Cần kiểm cả số điểm vào, hợp âm, mật độ, tầm âm, thế tay và thời gian chuyển tay ở BPM đã chọn.
4. Grade sớm có thể thiếu trích đoạn phù hợp trong kho hiện có. Kho hữu hạn không tạo ra vô hạn câu nguyên bản; biến thể và câu tổ hợp phải được nhận diện đúng loại.

## Điều kiện lấy bài cho từng grade

Quãng giai điệu tính giữa các lần đánh liên tiếp **trong cùng một dòng giai điệu/bè**, dùng cả cách viết trên khuông và cao độ. Hợp âm, âm đang giữ và quãng giữa hai tay được kiểm riêng. Một staff không mặc nhiên là một tay hoặc một bè.

“Câu trọng tâm” phải có quan hệ mới đang luyện; câu ôn được lấy từ các họ đã học. Ví dụ, một câu chỉ lặp một cao độ không được gắn là câu luyện quãng 3 dù đáp ứng giới hạn quãng tối đa.

| Grade | Lấy gì từ nhạc thật | Điều kiện loại hoặc giới hạn | Khoảng nốt gợi ý mỗi câu |
|---|---|---|---:|
| G1 | Một dòng piano đơn âm có nốt lặp, bước liền và đổi hướng. Chọn theo từng họ nhịp: đen đều; đen/trắng/tròn; nốt và lặng đen ở lưới phách. | Trong một vị trí 3–5 bậc đã duyệt; quãng tối đa 2; một nốt mới mỗi điểm vào; không đổi thế tay trong câu. Bản đầu dùng khuông/giọng C đã duyệt, chưa có dấu hóa bất thường, lấy đà, nối qua phách hoặc đảo phách. | 8–16 |
| G2 | Đoạn có quãng 3 xen với bước liền/nốt lặp; giữ một vị trí. Họ luyện cặp móc đơn trong một phách dùng mẫu cao độ G1. | Quãng tối đa 3; đơn âm; chưa đồng thời đưa quãng mới và họ nhịp mới vào câu giới thiệu. Không lấy mọi chuỗi móc đơn chỉ vì thời lượng nốt đủ dài. | 8–20 |
| G3 | Đường nét hợp âm rải và cụm giai điệu có quãng 4–5, nối bằng quãng nhỏ. | Trước hết một tay, đơn âm, trong một vị trí năm bậc đã duyệt; dùng các họ nhịp G1–G2. Nhãn hợp âm và tính vừa tay cần hồ sơ mẫu đã duyệt, không suy ra chỉ từ vài MIDI pitch. | 12–24 |
| G4 | Các họ G1–G3 trong vị trí mới; đoạn có chuyển thế tay được chuẩn bị. Chuyển giọng toàn đoạn tới danh sách giọng cho phép. | Ban đầu C, G, F và các vùng bàn phím đã duyệt; quãng giai điệu tối đa 5. Mỗi điểm chuyển tay phải có thời gian theo hồ sơ mẫu và BPM. Giọng thứ có hồ sơ riêng; không chấp nhận chỉ vì ít dấu hóa. | 12–24 |
| G5 | Đúng hai dòng piano: giai điệu đơn âm và bass đơn âm thưa/giữ; về sau đổi vai dòng chuyển động. | Giữ nguyên đồng bộ hai dòng; tối đa một nốt mới mỗi tay tại một thời điểm trong cấu hình đầu. Không đa bè độc lập trong một tay, không chéo tay, không hai tay đòi cùng phím cùng lúc. Nhịp và cao độ lấy từ họ đã biết. | 16–32 |
| G6 | Câu có quãng 6, 7 hoặc 8 giai điệu, đi tới vùng mới rồi tiếp tục bằng mẫu quen. | Bắt đầu một tay, nhịp quen, có nốt dài/lặng để chuẩn bị. Kiểm khoảng di chuyển và thời gian thực tại BPM. Quãng giai điệu rộng không được biến thành hợp âm phải với tay giữ đồng thời. | 12–24 |
| G7 | Đoạn thuộc từng họ: chấm dôi; nối qua phách; đảo phách; nhịp 6/8. | Dùng cao độ/chuyển tay quen, giảm tải tay đệm. Mỗi họ có mẫu nhịp cho phép; không trộn mọi loại khó. Giữ nguyên tỷ lệ trường độ và phách; 6/8 dùng phách đen chấm dôi. Tuplet và đổi nhịp giữa câu cần hồ sơ riêng, không mặc nhiên được nhận. | 16–32 |
| G8 | Cụm nhạc thật phối hợp các họ đã học tại nhiều vùng bàn phím, tối đa A0–C8. | Phải có hồ sơ phù hợp về quãng, nhịp, số bè, hợp âm và thao tác tay. Đổi sang vùng xa không đồng thời tăng mật độ. Không mặc nhiên nhận mọi đoạn chỉ vì đây là grade cao nhất. | 24–48 |

Các giới hạn là cấu hình thiết kế để triển khai và duyệt bài, không phải chuẩn cấp độ của nguồn. Bài ngoài cấu hình được giữ trong kho để bổ sung một họ bài thích hợp sau này; không ép xuống grade bằng cách xóa các nốt khó.

Việc tay giữ nốt lâu còn tay kia chơi vẫn tạo nhiều nốt đang vang. Điều kiện “một nốt mới mỗi tay” không thay kiểm tra âm đang giữ, số bè và cách nhả. Cụm có ba phím đánh đồng thời chưa được nhận tự động trong các profile đầu ở bảng trên.

## Ba loại nội dung có thể tạo

| Loại | Biến đổi được phép | Cách ghi nguồn |
|---|---|---|
| Trích đoạn nguyên bản | Chọn một bè/tay hoặc phần piano đã định danh; lấy trọn đơn vị đã duyệt. Giữ thứ tự cao độ, trường độ và quan hệ các bè. Tempo luyện được ghi riêng. | Tác phẩm, người soạn/chuyển soạn, part/bè, ô nguồn; ghi rõ nếu chỉ tập một tay. |
| Biến thể chuyển vị | Dịch toàn đoạn sang giọng/quãng tám cho phép, giữ quan hệ nhạc; kiểm lại cách viết dấu hóa, tầm âm, hình phím đen/trắng và cách chơi. | “Biến thể từ…” cùng phép chuyển vị. Chuyển giọng không bảo đảm độ khó vận động giữ nguyên. |
| Câu tổ hợp từ mẫu thật | Ghép các đơn vị đã duyệt theo những chuyển tiếp được phép: tương thích giọng, nhịp, vai trò hòa âm, điểm kết/nối và vị trí tay. Duyệt lại cả ranh giới ghép. | Ghi là câu do bộ sinh tạo, kèm nguồn từng thành phần; không gọi là nguyên câu của tác giả. |

Giai đoạn triển khai đầu ưu tiên hai loại đầu vì dễ giữ đúng nhạc gốc. Câu tổ hợp chỉ bật khi có thư viện mẫu và quan hệ nối đã duyệt; không ghép ngẫu nhiên vài đoạn bất kỳ rồi coi đó là câu có nghĩa. Đảo ngược giai điệu, thay nốt, đổi nhịp hoặc đơn giản hóa đệm là biến đổi riêng cần duyệt, chưa thuộc phép chuyển vị.

## Chọn số nốt từ x đến y

Điều khiển: **Số nốt mỗi câu: từ [x] đến [y]**. Bản đầu cho đặt khoảng trong **4–64 nốt**, với giá trị gợi ý ở bảng grade. Đây là giới hạn giao diện đề xuất. Chọn câu dài hơn vẫn giữ mọi ràng buộc grade.

`N` là số lần nhấn phím tham chiếu của các tay/bè đang tập, tương ứng `timeline.targets.length` sau khi hoàn tất chuyển đổi:

- Một nốt đánh mới tính 1; đánh lại cùng cao độ vào lúc khác vẫn tính thêm 1.
- Hợp âm ba cao độ tính 3 nốt nhưng chỉ 1 điểm vào nếu cùng lúc.
- Chuỗi nốt nối cùng cao độ tính một lần đánh; dấu lặng, pedal và phần đệm không chấm không cộng vào N.
- Hai bè cùng cao độ cùng thời điểm có thể được engine gộp thành một target vật lý. Profile hai tay ở bản đầu loại trường hợp này để tránh hiểu sai là đã chấm được hai tay.

MusicXML biểu diễn nốt trong hợp âm cùng vị trí thời gian qua [chord](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/chord/), và diễn đạt nối âm qua [tie](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tie/). Vì vậy không dùng số phần tử `<note>` trong XML làm số nốt phải nhấn.

Khoảng x–y được áp dụng **bao gồm cả hai đầu**. App chọn trong những đoạn hợp lệ có `x ≤ N ≤ y`, không bốc một con số rồi cắt đủ bằng mọi giá. Ví dụ chọn 12–20 có thể nhận câu 14, 18 hoặc 20 nốt; những số không có điểm kết phù hợp không cần xuất hiện.

Giao diện hiển thị thêm độ dài thực: “18 nốt · 12 điểm vào · 4 ô · 16 giây ở BPM đã chọn”. Đây chỉ là ví dụ minh họa các thông tin, không phải đoạn nguồn đã xác minh. Thời gian tính từ timeline, bao gồm khoảng lặng và nốt dài, không suy ra từ N.

Nếu không có đoạn hợp lệ trong khoảng đã chọn, báo khoảng này chưa có nội dung và gợi ý các khoảng khả dụng. Không tự nới x–y, tăng grade hoặc chặt giữa nhóm nốt. `x = y` được phép khi có câu đúng số đó. User có thể chọn một câu dài để luyện liền mạch mà không phải nâng grade.

## Chuẩn bị kho trước

Đối với mỗi MXL được nhận:

1. Lưu nguồn, giấy phép, hash và phiên bản chuyển đổi. Chỉ đưa nội dung đủ quyền vào kho công khai; file cá nhân có thể xử lý cục bộ.
2. Đọc phần piano và nhận diện bè, cách viết nốt, hóa biểu, khóa, nhịp, dấu chuyển quãng tám, vị trí tuyệt đối theo phách, trường độ, nốt nối và các dấu trình diễn liên quan.
3. Tạo các điểm đầu/cuối ứng viên theo đơn vị nhạc: mô-típ, tiểu câu hoặc cụm ô. Dấu lặng, kết câu, slur và ranh giới ô là tín hiệu hỗ trợ; riêng vạch ô hoặc slur không chứng minh đó là ranh giới một câu hoàn chỉnh.
4. Loại điểm cắt làm mất đầu/cuối nốt nối, nốt đang giữ, pedal hay ngữ cảnh ký âm. Có thể mở rộng tới ranh giới hợp lệ nếu vẫn đáp ứng x–y; nếu không thì loại ứng viên.
5. Kiểm từng profile grade, ghi mọi profile phù hợp và chủ đề trọng tâm. Nhận diện mẫu thế tay cần duyệt; không giả định phạm vi năm bậc tự động bảo đảm thế ngón tốt.
6. Lưu chỉ mục theo grade/profile, N, số điểm vào, nhịp, giọng, tay, vùng phím và điểm cắt; đóng gói dữ liệu nốt/nguồn thành các gói nhỏ.

Khóa, hóa biểu, nhịp và dấu chuyển quãng tám đang có hiệu lực phải đi theo trích đoạn dù bắt đầu trước ô được lấy. Bản đầu bỏ dấu lặp/volta và nhảy điều hướng khỏi đường sinh liên tục, trừ trường hợp đã chuyển thành diễn tiến tuyến tính có kiểm chứng. Không âm thầm đánh lại đầu tie bị cắt.

Bộ khảo sát hiện tại trong [inspect_sources.py](../../artifacts/curriculum-research/inspect_sources.py) chưa đủ cho bước này: nó chọn cửa sổ 4 ô, lưu tối đa 8 cửa sổ mỗi file, tái tạo tên nốt từ MIDI nên mất cách viết enharmonic gốc, và đo quãng bằng bán âm. Nó cũng chưa xác nhận câu nhạc hay thế tay. Các con số trong [SOURCES.md](SOURCES.md) là kiểm kê ứng viên, không phải số câu đã phân grade.

## Tạo câu trong phiên tập

Luồng xử lý đề xuất:

`grade + profile đang luyện + x–y + tay + BPM`
→ chọn đơn vị nguồn chưa gặp gần đây
→ chọn phép biến đổi được phép
→ kiểm toàn bộ ràng buộc
→ loại trùng
→ dựng sheet và timeline bằng đường MuseScore hiện có
→ đối chiếu N, cao độ, phách và neo highlight
→ đưa vào hàng đợi sẵn sàng.

Phân tích/biến đổi dữ liệu có thể chạy trong [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Khắc nhạc/native MuseScore cần dùng bộ lập lịch và giới hạn bộ nhớ phù hợp với runtime hiện tại; không giả định mọi lệnh native đều chạy song song an toàn.

- Khởi đầu chuẩn bị câu hiện tại và ít nhất hai câu kế; độ sâu thực tế còn phải dựa vào tổng thời gian câu và thời gian sinh/render đo trên thiết bị.
- Khi người dùng đang chơi, nạp và tạo thêm câu ở phía trước. Không đợi nốt cuối rồi mới tải MXL, chọn đề và khắc nhạc.
- Chỉ tải các gói cần cho grade/profile; dùng cache cục bộ. Chạy offline sau khi tải đủ gói đang dùng là mục tiêu triển khai, chưa được xác nhận trong app.
- Mỗi câu có seed, phiên bản quy tắc, hash nguồn và các phép biến đổi để tái hiện lỗi.
- Giới hạn số lần thử sinh một câu. Nếu thất bại, chọn lại trong tập ứng viên hợp lệ; không thử vô hạn trong luồng giao diện.

## Tránh lặp và giữ ý nghĩa luyện tập

Lưu ba mức nhận dạng: nội dung thực, cấu trúc sau khi chuẩn hóa chuyển vị, và đoạn nguồn. Nhờ đó một câu vừa chuyển lên một quãng tám không bị coi như một trải nghiệm hoàn toàn khác.

Luân phiên tác phẩm, họ mô-típ, hướng đi, tay và vị trí trong phạm vi profile. Các cửa sổ nguồn chồng lấn nhiều cần cùng nhóm gần trùng để không xuất hiện sát nhau. Bản phát hành đầu phải có cấu hình rõ về thời gian/độ dài hàng đợi chống trùng; không tự nhận tỷ lệ phân bổ là tối ưu sư phạm.

Khi nâng vùng phím hoặc đổi giọng, vẫn cho gặp mẫu cũ có chủ đích; đổi cấu trúc câu không có nghĩa cấm lặp quan hệ đã học. Đếm riêng số đoạn nguyên bản, số câu tổ hợp và số biến thể chuyển vị. Số lượng hữu dụng từng grade chỉ công bố sau khi lọc và loại trùng; hiện chưa có kiểm đếm này.

## Biên câu và BPM liên tục

Trong một khối đang chạy, giữ cùng BPM, cách tính phách và nhịp. Các nội dung 3/4, 4/4, 6/8 được tổ chức thành khối tương ứng; đổi sang khối khác phải được báo trước. Bản đầu dùng câu đầu/cuối ở biên ô rõ ràng. Đoạn lấy đà chỉ được dùng khi có cách đặt vào lưới phách và ngữ cảnh mở đầu đã duyệt.

Hai câu riêng lẻ đạt grade vẫn có thể tạo một bước nhảy khó tại chỗ nối. Phải kiểm từ nốt cuối câu trước tới nốt đầu câu sau, vị trí tay, các phím đang giữ và thời gian đọc trước. Dùng nốt lặng chuyển tiếp có ký âm nếu cần chuẩn bị; không tự kéo dài thời gian vì máy chưa render kịp.

- **Đúng nốt:** hoàn tất các nhóm nốt thì sang câu tiếp theo đã sẵn sàng; phím còn giữ không trở thành lần đánh mới. Chế độ này dùng semantics hiện có, không chứng nhận nhịp.
- **BPM:** thời điểm chuyển câu đã có trong timeline. Câu sau bắt đầu đúng mốc ngay cả khi câu trước có miss; kết quả nốt cuối có thể hoàn tất sau đó theo hit window hiện tại.
- Render/hàng đợi hết bất ngờ phải làm phiên chuyển sang trạng thái gián đoạn có thông báo, tắt các âm đang treo và chuẩn bị lại. Không đánh miss người học vì đoạn chưa tải, cũng không coi lần gián đoạn là một lượt liên tục thành công.
- Thay grade, tay, x–y hoặc BPM áp dụng ở ranh giới khối đã thông báo; không đổi dữ liệu của câu đang được chấm.

Engine hiện có [score-adapter.ts](../../packages/practice-engine-v2/score-adapter.ts) tạo timeline hữu hạn, gộp tie và các nốt đồng âm; [audio-clock-v2.ts](../../apps/pianist-web/src/platform/audio-clock-v2.ts) thiết lập mốc đồng hồ khi start. Vòng quiz mới phải có lớp điều phối timeline/batch bảo toàn cùng mốc thời gian, quyền sở hữu target tại biên và trạng thái nhả/pedal. Không gọi start lại cho mỗi câu hoặc chờ engine báo done mới đặt lịch câu kế.

Thiết kế này giữ thuật toán ghép nốt và chấm hiện tại. Khả năng nối batch mà không đổi hit window, mất sự kiện hoặc chấm hai lần cần được chứng minh bằng replay MIDI mô phỏng, đặc biệt ở nốt trùng cao độ sát biên, nốt nhả muộn, pedal và câu rất ngắn.

## Điều kiện trước khi gọi là sẵn sàng

- Có số đoạn/profile đã lọc thực tế; công bố rõ grade nào thiếu nguồn.
- Có ví dụ duyệt được cho mọi họ quãng, nhịp, chuyển tay đã bật.
- N nằm trong x–y sau khi native import và lập timeline; sheet và âm thanh tương ứng đúng dữ liệu.
- Các phép chuyển vị giữ ký âm và không đưa nội dung ra ngoài grade.
- Không cắt hợp âm/nối âm, không mất dấu hóa hoặc ngữ cảnh nhịp khi lấy đoạn.
- Chạy được luồng liên tục trên mobile trong các trường hợp render chậm và câu ngắn; xử lý gián đoạn đúng.
- Giữ logic chấm upstream, xác nhận highlight và đồng hồ qua biên câu bằng MIDI mô phỏng. MIDI thật vẫn là bước kiểm sau.
