# Quy tắc xây kho bài tập sinh sẵn từ nhạc thật

Cập nhật **21/10/2026, v2**. Thay thiết kế tạo/biến đổi câu trong phiên bằng **tạo và duyệt bài offline; web chỉ chọn bài có sẵn**. Đã triển khai nhánh build các đơn vị có hồ sơ xét nguồn cho lô G1–G2; phần chọn/nối bài trong web vẫn là đặc tả. Xem [kết quả pilot](Q4_PREPARED_PILOT.md), [kế hoạch Q](IMPLEMENTATION_PLAN.md) và [grade/căn cứ](GRADE_DESIGN.md).

Nội dung nhạc của một bài phát hành là cố định. Layout có thể thay đổi theo màn hình; BPM luyện có thể chọn trong phạm vi đã kiểm. Cả hai không tạo ra bài nhạc mới và không làm tăng số lượng kho.

## 1. Phạm vi và định nghĩa

| Khái niệm | Nghĩa trong kho v2 |
|---|---|
| Source | MXL gốc bất biến, hash và provenance; chưa đồng nghĩa bài đủ level. |
| MusicalUnit | Đơn vị liên tục trong nguồn có bằng chứng đầu/cuối: mô-típ, câu/tiểu câu, cụm câu liên tiếp hoặc tác phẩm ngắn trọn vẹn. |
| Candidate | Đoạn đang xét; có thể đúng XML/native nhưng chưa duyệt biên, grade hoặc tay. |
| PreparedExercise | Nội dung đã được kiểm/duyệt cho một cấu hình tay và profile cụ thể; có N, timeline, MusicXML, nguồn và phiên bản. |
| CatalogEntry | Bài đủ điều kiện xuất vào một bản kho, có nhóm độ dài và tài nguyên tải được. |
| RuntimeSelector | Chọn entry phù hợp và thứ tự chơi, không cắt/chuyển giọng/ghép nội dung. |

Bản đầu chỉ dùng đoạn nguyên bản liên tục từ một nguồn. Được chọn nguyên dòng/tay đã định danh và ghi rõ phần trích; không xóa nốt khó, thay tiết tấu hoặc chọn luân phiên nốt từ nhiều voice để tạo dòng dễ hơn.

Chuyển vị là phần mở rộng offline, phải kiểm lại toàn bộ và ghi “biến thể từ…”. Ghép các nguồn, đảo giai điệu, tự đơn giản hóa đệm hoặc tạo nốt mới chưa thuộc bản đầu.

<a id="boundaries"></a>
## 2. Xác định đơn vị nhạc trước độ dài

### 2.1. Bằng chứng không được đánh tráo

| Tín hiệu/nguồn | Dùng để làm gì | Không đủ để kết luận |
|---|---|---|
| Đầu/cuối tác phẩm ngắn trọn vẹn | Đề xuất nguyên tác làm một đơn vị; vẫn kiểm lấy đà, repeat, âm/pedal kết | Không tự nói bài đủ grade hoặc nằm trong 3–120 nốt. |
| Phân tích câu có nguồn và tọa độ rõ | Đề xuất đơn vị theo annotation; kiểm chính xác phiên bản và ý nghĩa annotation | Không coi mọi nhãn trong file là phân tích đúng. |
| Rest, nốt dài, điểm kết hòa âm, kết mô-típ, kết section | Tìm ứng viên biên và xem ngữ cảnh nguồn | Một rest/nốt chủ/fermata riêng lẻ không chứng minh hết câu. |
| Vạch ô | Mốc thời gian để kiểm toàn vẹn và đối chiếu | Không có nghĩa cứ 2/4 ô là một câu. |
| Slur | Ký hiệu phải bảo toàn; tín hiệu ngữ cảnh | Không tự là annotation phrase. |
| Đạt số nốt mong muốn | Xếp nhóm sau cùng | Không là lý do chọn một biên. |

MusicXML [grouping](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/grouping/) là trường phân tích linh hoạt, không một chuẩn nhãn phrase phổ quát. [Slur](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/slur/) và [tie](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tie/) có vai trò ký âm/âm thanh khác nhau. Việc format cho phép biểu diễn nhóm không tự chứng minh annotation âm nhạc đúng.

### 2.2. Thuật toán nền được phép dùng

Bản đầu dùng công cụ sẵn có **đúng phạm vi**, rồi kiểm chứng quyết định biên:

- music21 10.5.0 đã có trong môi trường khóa dependency. [Segmenter.getSegmentsList](https://music21.org/music21docs/moduleReference/moduleAnalysisSegmentByRests.html) phân đoạn theo rest và clef; đã đối chiếu source tại .tools/curriculum-python/Lib/site-packages/music21/analysis/segmentByRests.py ngày 21/10/2026.
- Source phương thức duyệt Note, Rest, Clef; nó không xử lý toàn bộ Chord hay quan hệ nhiều voice như một bộ nhận câu piano. Chỉ áp dụng trên từng dòng đơn âm đã định danh, giữ mapping về event nguồn.
- Rest/clef trả về vị trí ứng viên, chưa có nhãn “nguyên câu”. Không phân tách bằng rest rồi bỏ hết rest khỏi bài xuất.
- Với hai tay, xác định đơn vị trong ngữ cảnh cả part; cả hai tay phải cùng biên thời gian hợp lệ. Không lấy biên riêng từng tay rồi kéo giãn/ghép cho khớp.
- Nguồn không có biên rõ được đưa vào hàng duyệt ngữ cảnh. Không cần tự viết một “điểm câu nhạc” cộng trọng số không có căn cứ.
- Nếu bổ sung bộ phân đoạn khác: ghi paper/repo gốc, phiên bản/hash, phạm vi đơn âm/đa âm và cách đối chiếu; kiểm trên nguồn có biên tham chiếu trước khi dùng. Không gọi một thuật toán dự đoán boundary là bằng chứng chắc chắn về phrase.

**Đã bổ sung đề xuất tự động LBDM:** [script theo lô](AUTO_SCRIPT.md) gọi chín hàm giữ nguyên từ MTCExtractFeatures, MIT, commit `faf310528ee27cfc1f60aaacb10c9545eaa0b301`. Ghi độ mạnh biên sau từng nốt và các cực đại; hai tay chỉ dùng biên thời gian chung, không làm tròn biên trong ô. Đây là `model-proposal-only`, chưa thay bằng chứng duyệt câu/ngón của K2. Lượt thử kỹ thuật trên bảy nguồn chưa phải benchmark độ chính xác phân câu piano.

### 2.3. Hồ sơ và quyết định duyệt

Mỗi ứng viên lưu **cả startBoundary và endBoundary** gồm:

- Source hash, part/staff/voice được chọn, source note IDs, ô nguồn và tick chính xác.
- Tín hiệu/annotation đã thấy, đơn vị đề xuất và lý do giữ hay mở rộng biên.
- Ngữ cảnh trước/sau: tối thiểu một ô khi có, mở rộng đến đủ đơn vị lân cận để hiểu quyết định; ở đầu/cuối tác phẩm ghi rõ đã chạm mép nguồn.
- Sheet gốc và khả năng nghe vùng nguồn; đoạn xuất và đối chiếu event mapping.
- Cách duyệt: annotation đã xác minh hoặc review nội dung; người/công cụ, bằng chứng, thời điểm, phiên bản rule và verdict.

“Đã xác minh” phải có artifact/nguồn truy được, không chỉ một boolean do chương trình tự đặt. Người/công cụ duyệt phải được ghi đúng; kiểm tự động không được giả thành giáo viên đã duyệt. Chưa chắc thì pending. Nếu không có người chuyên môn, không gắn nhãn chuyên môn; việc này không ngăn tiếp tục xử lý các đơn vị có bằng chứng rõ.

Một mô-típ nguyên vẹn có thể là bài ngắn hợp lệ dù chưa có cadence của cả câu; nó cần chứng cứ về cấu trúc và hai biên trong ngữ cảnh, được ghi là **mô-típ**, không quảng cáo “trọn câu”. Một khúc tùy ý vừa đủ N không được nhận dưới nhãn mô-típ để vượt kiểm.

### 2.4. Các điều kiện toàn vẹn bắt buộc

- Không mất phần lấy đà gắn với đơn vị, nốt kết, nốt nối bắt đầu/kết bên ngoài, âm giữ hoặc pedal qua biên.
- Giữ effective clef/key/meter/8va, tempo và cách viết dấu hóa dù khai báo ở ô trước. Nếu chưa hỗ trợ ký hiệu, cách ly kèm lý do; không xóa nó.
- Không cắt ngang slur hoặc nhóm nhịp có vai trò trong đơn vị. Biểu cảm được giữ; nội dung không được chấm tự động phải được nói rõ, không đồng nhất không chấm với được xóa.
- Với pickup hoặc biên trong ô: phải có profile/parser/layout/clock hỗ trợ và kiểm native. Nếu chưa hỗ trợ thì giữ pending; không đệm rest vào nguyên tác cho đủ ô.
- Với repeat/volta/jump: bản đầu chỉ nhận đoạn không phụ thuộc điều hướng ở ngoài biên; tuyến tính hóa cần đối chiếu diễn tiến gốc. Không tự bỏ lần lặp đang có chức năng âm nhạc.
- Trích hai tay dùng cùng nguồn thời gian; tay trái còn giữ làm điểm kết không hợp lệ thì mở rộng hoặc bỏ ứng viên.
- Mở rộng đơn vị để trọn vẹn được phép; sau đó phân nhóm đúng số thật. Nếu >120, tìm đơn vị con có biên đã xác minh hoặc giữ ngoài bản đầu.
- Bài dài chỉ lấy các câu vốn liên tục trong nguồn, giữ nhịp/rest giữa chúng. Không nối hai mẩu ở xa hoặc lặp mẩu để đạt n100.

Đây là điều kiện chất lượng sản phẩm có thể kiểm, không tuyên bố đã có máy tự nhận phrase hoàn hảo.

## 3. Grade là các phép kiểm độc lập

Áp dụng [các profile G1–G8](GRADE_DESIGN.md#rules) cho toàn đơn vị. Thứ tự:

1. Kiểm nguồn piano, bè/tay, ngữ cảnh, biên và ký hiệu hỗ trợ.
2. Trích đặc điểm bằng music21: quãng có cách viết, cấu trúc tiết tấu, onset/duration chính xác, cao độ đồng thời/đang giữ, vị trí và vai trò tay.
3. So từng điều kiện của profile; lưu verdict và event ID chứng minh. Không dùng điểm trung bình “độ khó”.
4. Xác định trọng tâm mới có thực trong đơn vị; phân biệt bài ôn.
5. Kiểm đường tay và BPM theo hồ sơ đã duyệt; không dùng 21 mẫu tay v1 như chứng nhận tổng quát.
6. Đối chiếu native và đánh giá nội dung trước khi cho vào catalog.

Nhạc dễ về quãng không bù cho đảo phách ngoài profile. Tên “easy”, tên tác giả hoặc phong cách không quyết định grade. Chuyển sang giọng mới không mặc định giữ nguyên mức vận động. Nguồn Việt và classical cùng qua các kiểm kỹ năng.

Điều kiện không đạt không làm hỏng MXL gốc. Lưu rejected-for-profile, unsupported, needs-review, hoặc invalid-source riêng. Đánh giá cả false positive và false negative trước khi sửa rule.

## 4. Cách đếm nốt và xếp nhóm

N = timeline.targets.length sau native import và score-adapter hiện có, trên đúng các tay/bè được chấm.

- Nốt đánh mới tính 1; đánh lại cùng cao độ ở thời điểm khác tính thêm.
- Hợp âm ba phím tính 3 target, nhưng một onset nếu cùng lúc. N không thay phép kiểm mật độ/hợp âm.
- Tie giữ cùng cao độ tính một lần đánh; rest, pedal và đệm không chấm không cộng.
- Unison vật lý có thể được engine gộp. Bản đầu loại hai tay đòi cùng phím, không giả định có thể chấm độc lập hai tay từ một MIDI note-on.
- Mỗi cấu hình tay là một bản bài đã kiểm riêng với N/group riêng; không đổi lựa chọn tay rồi giữ nhãn độ dài cũ.
- Lưu tổng N, theo tay, onsetCount, bar span, durationBeats, meter, beatUnit, phạm vi BPM và loại đơn vị.

| lengthBucket | Nhãn | N |
|---|---|---:|
| n4 | Khoảng 4 nốt | 3–5 |
| n6 | Khoảng 6 nốt | 6–8 |
| n10 | Khoảng 10 nốt | 9–14 |
| n20 | Khoảng 20 nốt | 15–24 |
| n30 | Khoảng 30 nốt | 25–39 |
| n50 | Khoảng 50 nốt | 40–69 |
| n100 | Khoảng 100 nốt | 70–120 |

Các khoảng bao gồm hai đầu, không chồng lấn, là lựa chọn sản phẩm. Bài ngoài khoảng không bị cắt cho đủ; giữ để bổ sung phân nhóm sau. Số nốt không phụ thuộc số dòng sheet. Hai khuông không có nghĩa mỗi khuông phải cùng N.

## 5. Quy trình build offline có thể tái lập

Luồng tổng thể dự kiến bên dưới. CLI pilot đã thực hiện nhánh đơn vị có hồ sơ xét nguồn qua `inspect → prepare → finalize`; đề xuất từ segmentByRests không tự trở thành bài được nhận:

    for source in selected_catalog_sources:
        analysis = normalize_with_cache(source_hash, parser_version, options)
        units = propose_units_from_annotations_and_upstream_segments(analysis)
        for unit in units:
            collect_start_end_context_and_review(unit)
            if not unit.boundaries_accepted: keep_pending(); continue
            check_integrity_and_source_mapping(unit)
            matches = evaluate_each_grade_profile(unit)
            if not matches: keep_rejection_reasons(); continue
            excerpt = project_original_contiguous_unit(unit)
            native = import_with_pinned_musescore(excerpt)
            verify_source_to_excerpt_to_native(native)
            N = existing_score_adapter(native).targets.length
            bucket = classify_length(N)
            if bucket is None: keep_outside_initial_catalog(); continue
            finalize_hand_phrase_grade_review(unit, matches, native)
            if review_accepted: emit_prepared_exercise_with_provenance()
    rebuild_duplicate_indexes_and_coverage()
    package_only_approved_entries_for_release_scope()
    verify_package_and_publish_manifest_last()

Thực hiện kiểm nguồn/native tự động trên mọi bài. Review trước/sau có thể dùng lại bằng chứng của cùng đơn vị và phiên bản, nhưng không kế thừa review sau thay nốt/biên/đường tay. Build có checkpoint, định danh phụ thuộc, atomic file writes và log; không thử vô hạn hoặc im lặng bỏ lỗi.

Nguyên tắc chọn đơn vị trước N không ngăn dùng giới hạn tài nguyên để dừng xét một nguồn quá lớn; trường hợp đó phải ghi resource-limit và có đường xử lý lại, không gọi nguồn sai nhạc.

## 6. Nội dung và phiên bản của một bài phát hành

Các trường tối thiểu cần thêm vào hợp đồng Q0:

| Nhóm | Trường |
|---|---|
| Nhận dạng | exerciseId, contentHash, sourceHash, source span/event IDs, part/voice/hand mapping |
| Nguồn | Tên, tác giả/chuyển soạn khi có, URL/record, quyền/phạm vi dùng; workGroupId có trạng thái xác minh |
| Đơn vị | motif / phrase / phrase-sequence / complete-piece; boundary evidence start/end, context assets, review |
| Phân cấp | primaryProfile, reviewProfiles, profileVersion, focus witnesses, từng rule verdict |
| Độ dài | targets, onsets, số từng tay, lengthBucket, ô/phách, meter/beatUnit |
| Thực hành | Khoảng BPM kiểm được, trạng thái đầu/cuối tay/pedal, cấu hình tay, nội dung không được chấm |
| Kỹ thuật | MusicXML/hash; native semantics/timeline theo phách; layout/glyph anchors và renderer version |
| Tái lập | parserVersion, boundaryRuleVersion, profileVersion, notationVersion, corpusVersion, transformation nếu có |
| Kiểm | Source projection, native parity, boundary/hand/grade review, release eligibility |

ID nhạc dựa trên nội dung/vị trí nguồn/cấu hình tay/phép biến đổi có version, không dựa vào vị trí trong mảng. Cùng nội dung được dùng ở nhiều grade là một exercise với nhiều nhãn phù hợp, không nhiều bài độc lập. Nếu thay nội dung hoặc biên, tạo revision/ID tương ứng và giữ quan hệ với bản cũ.

Pilot đã tạo artifacts/curriculum-prepared/manifest.json và releases/<version>/catalog.json kèm tài nguyên từng bài. Catalog công khai curriculum/manifest.json và shard tải theo nhu cầu chưa triển khai. Giữ MXL gốc ngoài gói tải mặc định. Chỉ đóng gói các tài nguyên phục vụ tập và provenance cần thiết.

## 7. Trùng bài, đa dạng và số lượng

Kiểm ba lớp trước khi tính số lượng:

1. Exact content: cao độ có cách viết, onset/duration, rest/tie, voice và độ dài.
2. Motif normalized: mẫu quan hệ/tiết tấu sau chuẩn hóa chuyển vị; lưu riêng biến thể giọng/quãng tám.
3. Source overlap/work identity: đoạn nguồn chồng lấn và cùng tác phẩm/bản chuyển soạn khi xác minh được.

Ngưỡng overlap 50% và gom bắc cầu của v1 là chính sách sản phẩm bảo thủ, không ngưỡng khoa học. Phải audit các cụm quá lớn/nhầm gộp trước khi dùng v2; thêm nguồn có thể đổi ID cụm. Không chỉ lưu ID cụm trong lịch sử. Giữ exact/motif hash, sourceHash + span, exerciseId và mapping cụm theo release.

Coverage đếm theo grade/profile/tay/meter/lengthBucket/unitKind, tách candidate, native-verified, boundary-approved, hand-reviewed, practice-approved và public-approved. Báo cả số exercise, nhóm gần trùng, motif, file nguồn và tác phẩm đã xác minh; không gọi file là tác phẩm.

Chỉ tiêu kho lớn trong kế hoạch là mục tiêu sản phẩm, không liều học. Thêm một bài 100 nốt và các đoạn con của nó không tạo ra bấy nhiêu trải nghiệm độc lập; phải thể hiện nhóm chồng lấn. Đổi BPM/layout không tạo thêm bài.

## 8. Trong phiên chỉ chọn và tải

    request = grade + profile + hands + lengthBucket + mode + meter + BPM
    eligible = release.approved_entries_matching(request)
    unseen = remove_recent_exact_motif_and_source_overlap(eligible, history)
    select_next_from_available_sources(unseen, selection_seed)
    prepare_layout_timeline_audio_assets()
    verify_ready_and_schedule_on_session_clock()

Seed tái lập thứ tự chỉ khi request, lịch sử, selectorVersion và corpusVersion cùng nhau. Kho hữu hạn không bảo đảm vô hạn không lặp; nếu hết bài chưa gặp, báo rõ và để user chủ động dùng lại/đổi lựa chọn. Không âm thầm nới grade/độ dài hay tự tạo biến thể.

Không đổi octave/hand/note content lúc chơi. Chọn BPM và reflow sheet chỉ sử dụng nội dung đã duyệt; kiểm anchors/timeline, nghe đúng native document. Việc đệm máy nghe mẫu không tính là bài người dùng đã sight-read.

Chuẩn bị bài hiện tại và ít nhất hai bài kế, tính thêm thời lượng sẵn sàng. Cache layout có giới hạn, key gồm exercise/revision/renderer/layout; audio hoặc lịch thời gian phụ thuộc BPM phải có key tương ứng. Hủy bằng generation ID để callback cũ không thay bài mới.

## 9. Nhịp qua các bài độc lập

Bài đã sinh sẵn vẫn có thể nối khó: nốt cuối và đầu xa nhau, pedal chưa nhả, hai meter khác hoặc không đủ đọc trước. Session chỉ đặt bài ready và thỏa điều kiện nối.

- Khối giữ cùng BPM/meter/beatUnit. Đổi khối có báo trước.
- Khoảng chuẩn bị giữa bài là phần của session có hiển thị và định lịch; không chèn rest vào MusicXML rồi gọi đó là nguyên tác.
- Đúng nốt: hoàn thành nhóm mới sang; note-on cũ không được dùng lại.
- BPM: lịch chuyển độc lập việc pass; chờ đúng cửa sổ nốt cuối khi ghi kết quả. Giữ một origin; không restart mỗi câu.
- Chỉ vào bài tiếp khi trạng thái tay/pedal hợp lệ. Nếu người học giữ phím/pedal trái yêu cầu, kết quả và xử lý theo engine hiện có; không giải quyết bằng đổi thuật toán chấm.
- Gián đoạn tải/audio/MIDI có thông báo và recovery; không phạt người tập cho đoạn chưa hiển thị.

Đối chiếu host nối bài với timeline toàn phiên bằng replay MIDI trước khi phát hành. Các phần này chưa có trong app ở mốc tài liệu v2.

## 10. Bổ sung kho sau này

| Thay đổi | Làm lại | Có thể dùng lại nếu hash còn đúng |
|---|---|---|
| Thêm MXL mới | Parse file mới, phân đoạn/grade, native, review, dedup toàn chỉ mục, coverage và gói | Parse/artifact bài cũ không đổi; phải kiểm tương thích catalog mới. |
| Metadata/nguồn/quyền đổi | Provenance, nhóm tác phẩm, quyết định phát hành phụ thuộc metadata | Dữ liệu nốt nếu bytes và quyết định nhạc cụ không đổi. |
| File nguồn đổi | Parse và mọi quyết định/artifact phụ thuộc nội dung đó | Nội dung nguồn khác không đổi. |
| Parser/dependency/options đổi | Phân tích lại và đối chiếu các phần bị ảnh hưởng | Chỉ bằng chứng chứng minh không phụ thuộc thay đổi; không đoán dùng lại. |
| Rule biên hoặc grade đổi | Xét lại các verdict/review phụ thuộc rule; đóng catalog mới | Parse nốt cùng phiên bản; bài không bị ảnh hưởng khi có bằng chứng. |
| Renderer/layout đổi | Snapshot/glyph và kiểm parity/layout | Nguồn/đơn vị/grade nếu không thay nội dung. |

Sửa lỗi định danh hiện có: Q2 không được gắn parserVersion với hash toàn manifest nguồn. Cache là bộ phụ thuộc có version; corpusVersion chỉ định tập bài đóng gói. Cache hỏng phải rebuild; file nguồn luôn kiểm hash, không tin đường dẫn.

Mỗi batch nhập có report mới/trùng/reject/pending/approved, không mất nguồn cũ. Manifest xuất sau khi mọi shard cần thiết sẵn sàng. Phiên đang chơi ghim release cũ; phiên sau mới dùng release mới. Có rollback và giữ lịch sử theo ID nội dung ổn định.

Người dùng chỉ cần thêm MXL và nguồn/metadata khi biết; chưa có giao diện nhập kho này trong app. Import thư viện hiện tại không tự thực hiện pipeline duyệt kho.

## 11. Ví dụ nghiệm thu chống cắt và phân cấp sai

Các ví dụ sau là **tình huống kiểm thiết kế**, không phải trích đoạn thật đã duyệt:

| Tình huống | Kết quả bắt buộc |
|---|---|
| Nốt thứ 20 nằm trước nốt kết ở vị trí 23 | Giữ 23 và xếp n20; không cắt ở 20. |
| Đơn vị kết ở 29 nốt | Xếp n30; không cắt mất chín nốt. |
| Câu 7 nốt | Xếp n6; số dòng sheet không ảnh hưởng. |
| Tie từ trước điểm đầu hoặc tay kia còn giữ ở điểm cuối | Mở rộng tới biên hợp lệ rồi xét lại; không khả thi thì pending/reject. |
| Rest giữa một mô-típ có chức năng nối tiếp | Rest segmenter chỉ đề xuất; không tự chấp nhận hai mẩu. |
| Vạch ô ở giữa phrase, hoặc slur nhỏ trong phrase lớn | Không coi riêng dấu đó là biên phrase. |
| Đoạn có một triad tình cờ nhưng không là mẫu đang luyện | Không tự gán G3-arpeggio. |
| Hai tay 30 target, riêng tay phải 22 | Bản hai tay n30; bản tay phải nếu được trích/duyệt riêng thuộc n20. |
| Trích 121 nốt không có biên bên trong đã xác nhận | Giữ ngoài nhóm bản đầu, không bỏ nốt cuối. |
| “Bài 100 nốt” được tạo bằng lặp một mẩu 10 nốt | Không nhận là đoạn nguyên bản dài. |
| Thêm nguồn làm nhóm gần trùng đổi ID | Bài cũ vẫn được nhận là đã gặp từ content/source identity. |
| Cùng bài chuyển từ desktop nhiều dòng sang mobile | N, grade, clock và kết quả chấm không đổi vì layout. |

## 12. Tiêu chuẩn hoàn thành

Một ô lựa chọn có thể phát hành khi bài trong đó qua kiểm nguồn, biên, grade/tay, native và quyền phát hành tương ứng; số bài thật được hiển thị. Không đợi đủ quota kho lớn mới làm demo có chất lượng.

Q3 v1 không đạt các điều kiện v2 chỉ nhờ 177/177 native match. Cần xét lại các đoạn và bổ sung biên/grade review. Kết quả cuối phải là catalog bài đã chuẩn bị và màn tập hoạt động, không chỉ trang HTML xem SVG.
