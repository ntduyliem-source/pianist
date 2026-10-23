"""Prepare only deterministic browser input fixtures, without changing a build."""
from pathlib import Path
import sys
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'packages/score-formats/python'))
from converter import convert


if __name__ == '__main__':
    fixture = ROOT / 'tests/fixtures/pianist/m0'
    container = b'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'
    # Preserve the committed fixture. Only fill a missing generated input.
    if not (fixture / 'piano.mxl').exists():
        with ZipFile(fixture / 'piano.mxl', 'w') as archive:
            for name, data in [('META-INF/container.xml', container), ('score.musicxml', (fixture / 'piano.musicxml').read_bytes())]:
                info = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
                info.compress_type = ZIP_DEFLATED
                archive.writestr(info, data)
    answer = convert({'operation': 'abc-to-xml', 'text': (ROOT / 'tests/fixtures/pianist/practice/abc-loops.abc').read_text(encoding='utf-8'), 'tuneIndex': 0})
    if not answer['ok']:
        raise ValueError(answer)
    output = ROOT / 'artifacts/abc/a5'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'abc-loops.musicxml').write_text(answer['text'], encoding='utf-8')
    print('Prepared piano.mxl and abc-loops.musicxml browser inputs with the pinned converter.')
