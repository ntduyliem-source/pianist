"""Append audited MXL without overwriting songs; alternate arrangements get N+1.

Same compressed bytes or canonical MusicXML are duplicates. Matching work names
and known composers group arrangements; uncertain identity needs an explicit
workId or newWork decision instead of silently merging unrelated songs.
Every valid two-staff edition is admitted. Notation diagnostics never blacklist it.
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
from library_staff_policy import read_musicxml, require_two_staff_piano, inspect_two_staff_piano


def sha(data):
    return hashlib.sha256(data).hexdigest()


def name_key(title):
    title = unicodedata.normalize('NFC', title).casefold()
    return ''.join(character for character in title if character.isalnum())


def composer_name(value):
    value = unicodedata.normalize('NFC', value or '').strip()
    if value.casefold() in {'composer', 'composer / arranger', 'compositeur / arrangeur', 'unknown', 'none', 'tác giả'}:
        return ''
    return value[:180]


def choose_work(source, title, composer, ident, names, groups):
    if 'newWork' in source and type(source['newWork']) is not bool:
        raise ValueError('newWork must be a boolean')
    if source.get('newWork') and source.get('workId'):
        raise ValueError('Choose either explicit workId or newWork')
    if source.get('workId'):
        if source['workId'] not in groups:
            raise ValueError('Unknown explicit workId')
        return source['workId']
    if source.get('newWork'):
        return ident
    matches = names.get(name_key(title), set())
    if not matches:
        return ident
    # A title alone cannot distinguish unrelated works, and an absent author
    # cannot establish that a new arrangement belongs to an existing work.
    author = name_key(composer)
    composers = {work: {name_key(composer_name(song.get('composer'))) for song in groups[work].values()
                        if composer_name(song.get('composer'))} for work in matches}
    exact = {work for work, authors in composers.items() if authors == {author} and author}
    if len(exact) == 1:
        return next(iter(exact))
    if len(exact) > 1 or not author or any(not authors or len(authors) > 1 for authors in composers.values()):
        raise ValueError('Ambiguous work title/composer: provide workId or newWork')
    # Every existing matching-title work has a different, known composer.
    return ident


def musicxml(data):
    if not zipfile.is_zipfile(BytesIO(data)):
        raise ValueError('Curated .mxl assets must be compressed MusicXML')
    xml, score = read_musicxml(data)
    notes = [n for n in score.findall('.//note') if n.find('pitch') is not None]
    canonical = ET.canonicalize(xml_data=xml.decode('utf-8-sig'), strip_text=True).encode()
    return sha(canonical), len(notes), sum(n.find('grace') is not None for n in notes)


def append_library(inputs, audit, output, allow_editor_only=False):
    from library_content_policy import content_issues
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
        require_two_staff_piano(data)
        by_id[song['id']] = song
        if song.get('sourceSha256'):
            by_id[song['sourceSha256']] = song
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
        if Path(source['filename']).suffix.lower() != '.mxl':
            row.update(status='excluded', reason='Không phải MXL; không đọc hoặc nhập tệp này.')
            decisions.append(row)
            continue
        data = Path(source['path']).read_bytes()
        ident = sha(data)
        if ident != source['sha256'] or result.get('sha256', ident) != ident:
            raise ValueError('Source changed after native validation')
        try:
            staff_policy = inspect_two_staff_piano(data)
        except (ValueError, ET.ParseError, zipfile.BadZipFile, KeyError) as error:
            row.update(status='excluded', reason='Không đọc được cấu trúc MXL: ' + str(error))
            decisions.append(row)
            continue
        if not staff_policy['accepted']:
            row.update(status='excluded', reason='Chỉ nhận đúng hai khuông piano: ' + '; '.join(v['message'] for v in staff_policy['violations']),
                       staffPolicy=staff_policy)
            decisions.append(row)
            continue
        issues = content_issues(data)
        if issues:
            row['diagnostics'] = issues
        xml_hash, count, grace = musicxml(data)
        if count != source['writtenNotes'] or result.get('sourceNotes', count) != count:
            raise ValueError('Source note count differs from native audit')
        # Keep the engine audit as evidence, independent from admission. Source
        # repeats/ties may be interpreted/repaired by MuseScore; don't rewrite
        # the source or discard it because a prior grader omitted grace notes.
        row['nativeAudit'] = {k: result[k] for k in ('nativeNotes', 'sourceNotes', 'missingGlyphs', 'nativePlayback') if k in result}
        existing = by_id.get(ident) or by_xml.get(xml_hash)
        if existing:
            row.update(status='duplicate', reason='Trùng nội dung: ' + existing['title'])
            decisions.append(row)
            continue
        title = unicodedata.normalize('NFC', source['title']).strip()
        if not title or len(title) > 180:
            raise ValueError('Invalid display title')
        composer = composer_name(source.get('composer'))
        work = choose_work(source, title, composer, ident, names, groups)
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
        if composer:
            song['composer'] = composer
        song['practiceReady'] = True
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
                   id=ident, practiceReady=True,
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
