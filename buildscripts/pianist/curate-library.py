"""Copy only scores accepted by the real native import/playback/mapping audit."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
TITLES = {
    'tinh-dau-qua-chen-erik-quang-hung-masterd-negav-phap-kieu.mxl': 'Tình đầu quá chén',
    'em-oi-ha-noi-pho (1).mxl': 'Em ơi Hà Nội phố',
    'chi-la-trang-phap.mxl': 'Chỉ là',
    'sao-minh-chua-nam-tay-nhau-yan-nguyen.mxl': 'Sao mình chưa nắm tay nhau',
    'tinh-em-la-dai-duong.mxl': 'Tình em là đại dương — bản ngắn',
    'tinh-em-la-dai-duong-duy-manh.mxl': 'Tình em là đại dương — Duy Mạnh',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    args = parser.parse_args()
    inputs = {r['filename']: r for r in json.loads(args.inputs.read_text(encoding='utf-8'))}
    audit = json.loads(args.audit.read_text(encoding='utf-8'))
    if audit['errors']: raise ValueError('Native engine errors must be resolved first')
    output = ROOT / 'scores/library'; output.mkdir(parents=True, exist_ok=True)
    (output / 'songs').mkdir(exist_ok=True)
    songs = []
    for row in audit['results']:
        if row['status'] != 'accepted': continue
        original = inputs[row['filename']]
        data = Path(original['path']).read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        if sha != original['sha256'] or sha != row['sha256']: raise ValueError('Source changed after validation')
        if not row['nativePlayback'] or row['missingGlyphs'] or row['nativeNotes'] != original['writtenNotes']:
            raise ValueError('Incomplete native validation')
        slug = Path(row['filename'].replace(' (1)', '')).stem.lower()
        if not re.fullmatch('[a-z0-9-]+', slug): raise ValueError('Unsafe library slug')
        name = slug + '.mxl'
        shutil.copyfile(original['path'], output / 'songs' / name)
        title = unicodedata.normalize('NFC', TITLES.get(row['filename'], original['title'])).strip()
        if title.isupper(): title = title[0] + title[1:].lower()
        song = {'id': sha, 'title': title, 'filename': title + '.mxl', 'url': 'library/songs/' + name,
                'bytes': len(data), 'sha256': sha}
        composer = original.get('composer', '').strip()
        if composer and composer.lower() not in {'composer', 'tác giả', 'unknown', 'none'}:
            song['composer'] = composer[:180]
        songs.append(song)
    (output / 'catalog.json').write_text(json.dumps({'schemaVersion': 1, 'songs': songs}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # No local absolute paths, raw console logs or user browser data are published.
    report = ['# Kiểm bộ bài hát nhập ngày 19/10/2026', '',
              'Các file do người dùng chỉ định để đưa vào thư viện và xuất bản. Giữ nguyên bytes MXL; chỉ đặt tên hiển thị trong catalog.', '',
              f"Đã nhận {len(inputs)} file; đưa vào thư viện {len(songs)} bản. Kiểm bằng MuseScore native, playback thật và mapping SVG của từng lần nhập.", '',
              '| File nguồn | Kết quả | Chi tiết |', '| --- | --- | --- |']
    for row in audit['results']:
        detail = f"{row['nativeNotes']} nốt; {row['pages']} trang; playback/mapping đạt" if row['status'] == 'accepted' else row.get('reason', '')
        detail = str(detail).replace('|', '/').replace('\n', ' ')
        report.append(f"| {row['filename']} | {'Nhận' if row['status'] == 'accepted' else 'Bỏ'} | {detail} |")
    report += ['', 'Các bản có nốt hoa mỹ bị loại vì bản tập chưa theo dõi đủ nốt nguồn. Đây là giới hạn chấm của phiên bản hiện tại; giữ file gốc tại Downloads để có thể kiểm lại sau.',
               'PDF không có MusicXML đính kèm được bỏ khỏi luồng editor/tập. Hai file Merry Go Round có cùng nội dung XML; chỉ giữ một bản.', '']
    (output / 'IMPORT_REPORT.md').write_text('\n'.join(report), encoding='utf-8')
    print(json.dumps({'scores': len(songs), 'bytes': sum(s['bytes'] for s in songs)}, ensure_ascii=False))


if __name__ == '__main__': main()
