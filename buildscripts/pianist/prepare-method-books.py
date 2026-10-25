#!/usr/bin/env python3
"""Acquire pinned method-book sources and package their unchanged MusicXML.

This is a content importer, not a score generator. Original MXL bytes are copied;
raw XML is only wrapped in a deterministic MXL archive. No notes, staves,
fingerings, tempos, repeats, fonts or source rights notices are rewritten.
"""
from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
import hashlib
import json
import re
import urllib.request
import zipfile

from library_staff_policy import MAX_SCORE_BYTES, read_musicxml, require_two_staff_piano

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCES = ROOT / 'scores/methods/sources.json'
ID = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def compressed_musicxml(data):
    """Preserve source MXL or wrap source XML byte-for-byte, reproducibly."""
    xml, _ = read_musicxml(data)
    if zipfile.is_zipfile(BytesIO(data)):
        return data
    container = (b'<?xml version="1.0" encoding="UTF-8"?>\n'
                 b'<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                 b'<rootfiles><rootfile full-path="score.musicxml" '
                 b'media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>')
    output = BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, contents in [('META-INF/container.xml', container), ('score.musicxml', xml)]:
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, contents, compresslevel=9)
    result = output.getvalue()
    assert read_musicxml(result)[0] == xml
    return result


def fetch_source(source, cache, download, root=ROOT, committed=None):
    """A source changing on the web requires an explicit manifest review."""
    pin = source['sourceSha256']
    if not re.fullmatch('[a-f0-9]{64}', pin):
        raise ValueError('Invalid source SHA-256')
    cached = cache / pin
    if cached.exists():
        data = cached.read_bytes()
    elif source.get('localFile') and (root / source['localFile']).is_file():
        local = (root / source['localFile']).resolve()
        if not local.is_relative_to(root.resolve()):
            raise ValueError('Local source escapes workspace')
        data = local.read_bytes()
    elif committed is not None and committed.is_file() and digest(committed.read_bytes()) == pin:
        # PDMX lessons ship as original MXL bytes. A fresh clone can recover
        # those exact source bytes without fetching the 1.9 GB source corpus.
        data = committed.read_bytes()
    elif download:
        url = source.get('downloadUrl')
        if not url:
            raise FileNotFoundError('Pinned local source is unavailable: ' + source['sourceUrl'])
        if not url.startswith('https://'):
            raise ValueError('Sources require HTTPS')
        request = urllib.request.Request(url, headers={'User-Agent': 'Pianist-method-books/1.0'})
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read(MAX_SCORE_BYTES + 1)
    else:
        raise FileNotFoundError('Source cache missing; use --download: ' + source['sourceUrl'])
    if not 0 < len(data) <= MAX_SCORE_BYTES or digest(data) != pin:
        raise ValueError('Source size/hash changed: ' + source['sourceUrl'])
    cache.mkdir(parents=True, exist_ok=True)
    if not cached.exists():
        cached.write_bytes(data)
    if source.get('archiveMember'):
        # Read one named entry in memory; never extract untrusted ZIP paths.
        name = source['archiveMember']
        with zipfile.ZipFile(BytesIO(data)) as archive:
            entries = [entry for entry in archive.infolist() if entry.filename == name]
            if len(entries) != 1 or not 0 < entries[0].file_size <= MAX_SCORE_BYTES:
                raise ValueError('Missing, duplicate or oversized archive member')
            data = archive.read(entries[0])
    return data


def build(sources, output, cache, download=False):
    if sources.get('schemaVersion') != 1:
        raise ValueError('Unsupported method source manifest')
    catalog = {'schemaVersion': 1, 'books': []}
    assets, book_ids, lesson_ids = [], set(), set()
    for book in sources['books']:
        book_id = book['id']
        if not ID.fullmatch(book_id) or book_id in book_ids:
            raise ValueError('Invalid or duplicate book ID')
        book_ids.add(book_id)
        record = {key: book[key] for key in ('id', 'title', 'composer', 'opus', 'description', 'expectedLessons')}
        record.update({key: book[key] for key in ('sourceUrl', 'sourceRights', 'editionRights') if key in book})
        record['lessons'] = []
        numbers = set()
        for source in sorted(book['lessons'], key=lambda item: item['number']):
            number, ident = source['number'], source['id']
            if type(number) is not int or not 1 <= number <= book['expectedLessons'] or number in numbers:
                raise ValueError('Invalid or duplicate lesson number: ' + book_id)
            if not ID.fullmatch(ident) or ident in lesson_ids:
                raise ValueError('Invalid or duplicate lesson ID')
            numbers.add(number)
            lesson_ids.add(ident)
            asset_path = output / book_id / (ident + '.mxl')
            original = fetch_source(source, cache, download, committed=asset_path)
            proof = require_two_staff_piano(original)
            xml, score = read_musicxml(original)
            notes = len(score.findall('.//note/pitch'))
            if not notes:
                raise ValueError('Method lesson contains no pitched notes')
            data = compressed_musicxml(original)
            lesson = {key: source[key] for key in ('id', 'number', 'title', 'sourceUrl', 'license')}
            lesson.update({key: source[key] for key in ('sourceRights', 'editionRights', 'licenseUrl', 'attribution') if key in source})
            lesson.update(file=f'methods/{book_id}/{ident}.mxl', sha256=digest(data), bytes=len(data),
                          fingeringCount=len(score.findall('.//fingering')), writtenNotes=notes,
                          sourceXmlSha256=digest(xml), sourceSha256=source['sourceSha256'], totalStaves=proof['totalStaves'])
            record['lessons'].append(lesson)
            assets.append((asset_path, data))
        if not numbers:
            raise ValueError('Empty method books are not published')
        record['missingLessons'] = sorted(set(range(1, book['expectedLessons'] + 1)) - numbers)
        catalog['books'].append(record)
    # No output changes until every input has passed admission and pin checks.
    for path, data in assets:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return catalog


def verify(output):
    catalog = json.loads((output / 'catalog.json').read_text(encoding='utf-8'))
    files = set()
    for book in catalog['books']:
        for lesson in book['lessons']:
            path = (output.parent / lesson['file']).resolve()
            if not path.is_relative_to(output.resolve()) or path in files:
                raise ValueError('Unsafe or duplicate lesson path')
            files.add(path)
            data = path.read_bytes()
            xml, score = read_musicxml(data)
            require_two_staff_piano(data)
            actual = (digest(data), len(data), digest(xml), len(score.findall('.//fingering')), len(score.findall('.//note/pitch')))
            expected = tuple(lesson[key] for key in ('sha256', 'bytes', 'sourceXmlSha256', 'fingeringCount', 'writtenNotes'))
            if actual != expected:
                raise ValueError('Method lesson integrity failed: ' + lesson['id'])
    return catalog


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, default=DEFAULT_SOURCES)
    parser.add_argument('--output', type=Path, default=ROOT / 'scores/methods')
    parser.add_argument('--cache', type=Path, default=ROOT / 'artifacts/method-books/cache')
    parser.add_argument('--download', action='store_true', help='Fetch missing pinned source archives; never update source hashes')
    parser.add_argument('--verify', action='store_true', help='Check committed assets offline without rebuilding')
    args = parser.parse_args()
    if args.verify:
        result = verify(args.output)
    else:
        result = build(json.loads(args.sources.read_text(encoding='utf-8')), args.output, args.cache, args.download)
        verify(args.output)
    print(json.dumps({'books': len(result['books']), 'lessons': sum(len(b['lessons']) for b in result['books']),
                      'coverage': {b['id']: len(b['lessons']) for b in result['books']}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
