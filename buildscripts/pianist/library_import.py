"""Append audited MXL without overwriting songs; alternate arrangements get N+1.

Same compressed bytes or canonical MusicXML are duplicates. Matching work names
group arrangements; an explicit workId resolves genuinely ambiguous names.
Editor-only admission requires native round-trip and exact grace-note evidence.
"""
from collections import Counter
from io import BytesIO
from pathlib import Path
import hashlib
import json
import re
import unicodedata
from xml.etree import ElementTree as ET
import zipfile

from library_release import validate_versions


def sha(data):
    return hashlib.sha256(data).hexdigest()


def name_key(title):
    title = unicodedata.normalize('NFC', title).casefold()
    return ''.join(character for character in title if character.isalnum())


def musicxml(data):
    if not 0 < len(data) <= 32 * 1024**2:
        raise ValueError('Invalid MXL size')
    with zipfile.ZipFile(BytesIO(data)) as archive:
        if archive.getinfo('META-INF/container.xml').file_size > 64 * 1024:
            raise ValueError('MusicXML container too large')
        container = ET.fromstring(archive.read('META-INF/container.xml'))
        name = next(e.attrib['full-path'] for e in container.iter() if e.tag.endswith('rootfile'))
        if archive.getinfo(name).file_size > 32 * 1024**2:
            raise ValueError('MusicXML score too large')
        xml = archive.read(name)
    score = ET.fromstring(xml)
    if score.tag != 'score-partwise':
        raise ValueError('MusicXML score must be partwise')
    notes = [n for n in score.findall('.//note') if n.find('pitch') is not None]
    if not notes:
        raise ValueError('MusicXML has no pitched notes')
    canonical = ET.canonicalize(xml_data=xml.decode('utf-8-sig'), strip_text=True).encode()
    return sha(canonical), len(notes), sum(n.find('grace') is not None for n in notes)


def append_library(inputs, audit, output, allow_editor_only=False):
    output = Path(output)
    path = output / 'catalog.json'
    original = path.read_bytes()
    catalog = json.loads(original)
    if catalog.get('schemaVersion') != 1 or not isinstance(catalog.get('songs'), list):
        raise ValueError('Invalid library catalog')
    songs = list(catalog['songs'])
    groups = validate_versions(songs)
    by_id, by_xml, names = {}, {}, {}
    for song in songs:
        relative = song['url'].removeprefix('library/')
        if not re.fullmatch(r'songs/[a-z0-9-]+\.mxl', relative):
            raise ValueError('Unsafe existing library path')
        data = (output / relative).read_bytes()
        if sha(data) != song['sha256'] or song['id'] != song['sha256'] or song['id'] in by_id or len(data) != song['bytes']:
            raise ValueError('Existing library integrity failed')
        by_id[song['id']] = song
        by_xml[musicxml(data)[0]] = song
        names.setdefault(name_key(song['title']), set()).add(song.get('workId', song['id']))
    if audit.get('errors'):
        raise ValueError('Resolve native engine errors before import')
    records = {r['filename']: r for r in inputs}
    results = audit.get('results', [])
    if len(records) != len(inputs) or len(results) != len(records) or {r['filename'] for r in results} != set(records):
        raise ValueError('Native audit must cover every input exactly once')
    additions, decisions = [], []
    for result in results:
        if result['status'] not in ('accepted', 'editor-only', 'duplicate', 'excluded'):
            raise ValueError('Native audit is unfinished or has an unknown status')
        source = records[result['filename']]
        row = {k: source.get(k, '') for k in ('filename', 'title')}
        row.update(status=result['status'], reason=result.get('reason', ''))
        if result['status'] not in ('accepted', 'editor-only'):
            decisions.append(row)
            continue
        data = Path(source['path']).read_bytes()
        ident = sha(data)
        if ident != source['sha256'] or ident != result['sha256']:
            raise ValueError('Source changed after native validation')
        xml_hash, count, grace = musicxml(data)
        if count != source['writtenNotes'] or result['sourceNotes'] != count:
            raise ValueError('Source note count differs from native audit')
        if not result.get('nativePlayback') or result.get('missingGlyphs') != 0 or not result.get('nativeNotes'):
            raise ValueError('Incomplete native import/playback/mapping audit')
        editor_only = result['status'] == 'editor-only'
        if editor_only:
            if not allow_editor_only or not grace or result.get('editorNotes') != count or result.get('editorGraceNotes') != grace or count - result['nativeNotes'] != grace:
                raise ValueError('Editor-only admission requires exact native grace-note evidence')
        elif result['nativeNotes'] != count:
            raise ValueError('Practice import must preserve every source note')
        existing = by_id.get(ident) or by_xml.get(xml_hash)
        if existing:
            row.update(status='duplicate', reason='Trùng nội dung: ' + existing['title'])
            decisions.append(row)
            continue
        title = unicodedata.normalize('NFC', source['title']).strip()
        if not title or len(title) > 180:
            raise ValueError('Invalid display title')
        matches = names.get(name_key(title), set())
        if source.get('workId'):
            work = source['workId']
            if work not in groups:
                raise ValueError('Unknown explicit workId')
        elif len(matches) > 1:
            raise ValueError('Ambiguous work title: provide workId')
        else:
            work = next(iter(matches), ident)
        versions = groups.get(work, {})
        number = max(versions, default=0) + 1
        slug = re.sub(r'\s*\(\d+\)$', '', Path(source['filename']).stem).lower()
        if not re.fullmatch(r'[a-z0-9-]+', slug):
            raise ValueError('Unsafe library slug')
        if number > 1:
            slug += '-v' + str(number)
        filename = title + (f' — v{number}' if number > 1 else '') + '.mxl'
        song = dict(id=ident, sha256=ident, title=title, filename=filename,
                    url='library/songs/' + slug + '.mxl', bytes=len(data), workId=work, version=number)
        if source.get('versionLabel'):
            song['versionLabel'] = source['versionLabel']
        composer = unicodedata.normalize('NFC', source.get('composer', '')).strip()
        if composer and composer.casefold() not in {'composer', 'composer / arranger', 'compositeur / arrangeur', 'unknown', 'none', 'tác giả'}:
            song['composer'] = composer[:180]
        if editor_only:
            song.update(practiceReady=False, practiceNotice=f'Nghe và chỉnh sửa được. Chưa hỗ trợ tập {grace} nốt hoa mỹ của bản này.')
        destination = output / song['url'].removeprefix('library/')
        if destination.exists() and destination.read_bytes() != data:
            raise ValueError('Refusing to overwrite an existing library score')
        if any(previous['url'] == song['url'] for previous in songs):
            raise ValueError('Library path collision')
        songs.append(song)
        groups.setdefault(work, {})[number] = song
        names.setdefault(name_key(title), set()).add(work)
        by_id[ident] = song
        by_xml[xml_hash] = song
        additions.append((destination, data))
        row.update(status='version-added' if number > 1 else 'added', version=number, workId=work,
                   id=ident, practiceReady=not editor_only,
                   reason=result.get('reason') or f"{count} nốt; {result.get('pages', 0)} trang; MuseScore playback/mapping đạt")
        decisions.append(row)
    if len(songs) > 500:
        raise ValueError('Library has more than 500 versions')
    validate_versions(songs)
    if path.read_bytes() != original:
        raise ValueError('Catalog changed during import: retry with the latest library')
    for destination, data in additions:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    if additions:
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps({**catalog, 'songs': songs}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(path)
    counts = Counter(row['status'] for row in decisions)
    return {'summary': {'inputs': len(inputs), 'newWorks': counts['added'], 'newVersions': counts['version-added'],
                        'duplicates': counts['duplicate'], 'excluded': counts['excluded'],
                        'editorOnly': sum(row.get('practiceReady') is False for row in decisions),
                        'totalWorks': len(groups), 'totalVersions': len(songs)}, 'results': decisions}
