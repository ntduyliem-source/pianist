"""Build a deterministic compressed MusicXML fixture and copy it to the preview."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import shutil

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'tests/fixtures/pianist/m0'
CONTAINER = b'''<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'''

with ZipFile(FIXTURES / 'piano.mxl', 'w') as archive:
    for name, data in [('META-INF/container.xml', CONTAINER), ('score.musicxml', (FIXTURES / 'piano.musicxml').read_bytes())]:
        info = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        archive.writestr(info, data)
dest = ROOT / 'build.artifacts/fixtures'
dest.mkdir(parents=True, exist_ok=True)
for suffix in ('mxl', 'musicxml'):
    shutil.copy2(FIXTURES / f'piano.{suffix}', dest)
print(f'Prepared original CC0 fixtures in {dest}')
