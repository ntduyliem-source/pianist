#!/usr/bin/env python3
"""Stage -> native audit -> apply. No edition is removed for a normalization failure.

python buildscripts/pianist/normalize-library.py prepare --work artifacts/library-standardization-2026-10-25
node buildscripts/pianist/audit-library-layout.cjs artifacts/library-standardization-2026-10-25
python buildscripts/pianist/normalize-library.py apply --work artifacts/library-standardization-2026-10-25
"""
import argparse
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
import json
import shutil
import zipfile
from lxml import etree as E
from library_metadata import extract, FIELDS
from library_normalize import normalize, parse, sha, music_signature, PROFILE
from library_staff_policy import require_two_staff_piano
from library_release import validate_versions

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / 'scores/library'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def schema():
    folder = ROOT / 'src/importexport/musicxml/schema'
    tree = E.parse(str(folder / 'musicxml.xsd'))
    for node in tree.findall('{http://www.w3.org/2001/XMLSchema}import'):
        node.set('schemaLocation', (folder / node.get('schemaLocation').rsplit('/', 1)[-1]).as_uri())
    return E.XMLSchema(tree)

def schema_errors(validator, data):
    validator.validate(parse(data))
    # Compare errors without line numbers, which change when layout is removed.
    return Counter(e.message for e in validator.error_log)

def prepare(work):
    baseline = work / 'originals'
    if not baseline.exists():
        shutil.copytree(LIBRARY, baseline)
    catalog = read(baseline / 'catalog.json')
    overrides = read(LIBRARY / 'metadata-overrides.json')['editions']
    layout_overrides = read(LIBRARY / 'layout-overrides.json')['editions']
    staged = work / 'candidate'
    staged.mkdir(parents=True, exist_ok=True)
    rows, groups = [], defaultdict(list)
    validator = schema()
    for song in catalog['songs']:
        relative = song['url'].removeprefix('library/')
        data = (baseline / relative).read_bytes()
        if sha(data) != song['sha256'] or len(data) != song['bytes']:
            raise ValueError('Immutable backup integrity failed: ' + relative)
        result = extract(parse(data), song)
        if song.get('layoutProfile') == PROFILE:
            # Generated credit blocks are display text, not new attribution
            # evidence. Keep the reviewed catalog metadata on subsequent runs.
            result['metadata'] = {k: deepcopy(song[k]) for k in ('title', *FIELDS, 'aliases') if k in song}
            result['metadata'].setdefault('aliases', [])
        override = overrides.get(Path(relative).name, {})
        result['corrections'] = override
        for field, value in override.get('fields', {}).items():
            if value is None:
                result['metadata'].pop(field, None)
            else:
                result['metadata'][field] = value
        if result['metadata']['title'] != song['title']:
            aliases = result['metadata']['aliases']
            if song['title'] not in aliases:
                aliases.append(song['title'])
        result.update(url=song['url'], originalSha256=sha(data), workId=song.get('workId', song['id']))
        groups[result['workId']].append(result)
        rows.append(result)
    # Only composition/lyrics belong to the work; arrangement stays edition-specific.
    for editions in groups.values():
        for role in ('composer', 'lyricist'):
            values = {r['metadata'][role] for r in editions if r['metadata'].get(role)}
            if len(values) != 1:
                continue
            value = next(iter(values))
            source = next(r['url'] for r in editions if r['metadata'].get(role) == value)
            for row in editions:
                # Explicitly withheld ambiguous credits stay withheld, except the
                # reviewed White Blossoms role correction documented in its override.
                fields = row['corrections'].get('fields', {})
                blocked = role in fields and fields[role] is None and 'white-blossoms-' not in row['url']
                if not row['metadata'].get(role) and not blocked:
                    row['metadata'][role] = value
                    row['evidence'].append(dict(field=role, value=value, source=source,
                                                confidence='same-work-source', text='Same explicit workId, not title matching'))
    new_catalog = deepcopy(catalog)
    new_catalog['presentationProfile'] = PROFILE
    for index, (song, row) in enumerate(zip(new_catalog['songs'], rows)):
        data = (baseline / song['url'].removeprefix('library/')).read_bytes()
        row['missing'] = [role for role in ('composer','arranger') if not row['metadata'].get(role)]
        try:
            layout = layout_overrides.get(Path(song['url']).name, {})
            recipe = sha(json.dumps({'profile':PROFILE, 'metadata':row['metadata'], 'layout':layout}, ensure_ascii=False, sort_keys=True).encode())
            if song.get('layoutProfile') == PROFILE and song.get('normalizationRecipe') == recipe:
                # A later import batch must not rewrite unchanged editions or
                # accumulate nested copies of already-normalized credits.
                normalized = data
                receipt = {'profile':PROFILE, 'musicalXmlSignature':music_signature(parse(data)),
                           'allMusicalXmlPreserved':True, 'alreadyNormalized':True}
            else:
                normalized, receipt = normalize(data, row['metadata'], preserve_breaks=layout.get('preservePrintedBreaks', False), word_layout=layout.get('words'))
            require_two_staff_piano(normalized)
            old_errors, new_errors = schema_errors(validator, data), schema_errors(validator, normalized)
            added_errors = new_errors - old_errors
            if added_errors:
                raise ValueError('Introduced MusicXML schema errors: ' + str(dict(added_errors)))
            row.update(receipt, status='staged', existingSchemaIssues=dict(new_errors))
            if sha(normalized) != song['sha256']:
                song['sourceHashes'] = list(dict.fromkeys([*song.get('sourceHashes', []),
                                                           *([song['sourceSha256']] if song.get('sourceSha256') else []), song['sha256']]))
            song.setdefault('sourceSha256', song['sha256'])
            for field in (*FIELDS, 'aliases'):
                if field not in row['metadata']:
                    song.pop(field, None)
            song.update(row['metadata'], id=sha(normalized), sha256=sha(normalized), bytes=len(normalized), layoutProfile=PROFILE, normalizationRecipe=recipe)
            song['filename'] = song['title'] + (f" — v{song['version']}" if song.get('version', 1) > 1 else '') + '.mxl'
            row['normalizedSha256'] = sha(normalized)
        except (ValueError, AssertionError, E.Error) as error:
            row.update(status='retained-original', error=str(error))
            normalized = data
        dest = staged / song['url'].removeprefix('library/')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(normalized)
        if (index + 1) % 25 == 0:
            print(f'XML checked {index + 1}/{len(rows)}', flush=True)
    validate_versions(new_catalog['songs'])
    write(staged / 'catalog.json', new_catalog)
    report = {'profile':PROFILE, 'originalCatalogSha256':sha((baseline/'catalog.json').read_bytes()),
              'candidateCatalogSha256':sha((staged/'catalog.json').read_bytes()),
              'counts':dict(Counter(row['status'] for row in rows)), 'editions':rows}
    write(work / 'normalization-audit.json', report)
    print(json.dumps({'counts':report['counts'], 'missingComposer':sum('composer' in r['missing'] for r in rows),
                      'missingArranger':sum('arranger' in r['missing'] for r in rows),
                      'failures':[{k:r[k] for k in ('url','error')} for r in rows if 'error' in r]}, ensure_ascii=False))

def apply(work):
    report = read(work / 'normalization-audit.json')
    native = read(work / 'native-audit.json')
    staged = work / 'candidate'
    candidate = read(staged / 'catalog.json')
    if not native.get('passed') or native.get('candidateCatalogSha256') != sha((staged/'catalog.json').read_bytes()):
        raise ValueError('A passing native audit of this exact candidate catalog is required')
    if native.get('boundsWarnings'):
        raise ValueError('Review and fix text outside page bounds before applying the presentation profile')
    verified = {r['url']: r for r in native.get('results', []) if r.get('passed')}
    if len(verified) != len(candidate['songs']) or any(verified.get(s['url'], {}).get('sha256') != s['sha256'] for s in candidate['songs']):
        raise ValueError('Native audit must cover each exact edition')
    renderer_hash = sha((ROOT/'build.artifacts/renderer/PianistRenderer.wasm').read_bytes())
    if any(row.get('rendererVersion') != renderer_hash for row in verified.values()):
        raise ValueError('Native renderer changed since the layout audit')
    if report['candidateCatalogSha256'] != sha((staged/'catalog.json').read_bytes()):
        raise ValueError('Candidate changed after XML validation')
    if sha((LIBRARY/'catalog.json').read_bytes()) != report['originalCatalogSha256']:
        raise ValueError('Current catalog changed since staging; do not overwrite newer library work')
    originals = read(work/'originals/catalog.json')
    if len(candidate['songs']) != len(originals['songs']):
        raise ValueError('No edition may be removed')
    for old, song in zip(originals['songs'], candidate['songs']):
        if (old['url'],old.get('workId'),old.get('version')) != (song['url'],song.get('workId'),song.get('version')):
            raise ValueError('Work/version identity changed')
        current = LIBRARY / old['url'].removeprefix('library/')
        new = staged / song['url'].removeprefix('library/')
        if sha(current.read_bytes()) != old['sha256'] or sha(new.read_bytes()) != song['sha256']:
            raise ValueError('Source or staged asset changed')
    # Versioned source archive is not a web asset. It travels with the repository.
    archive = LIBRARY/'originals'/f'{report["originalCatalogSha256"]}.zip'
    archive.parent.mkdir(exist_ok=True)
    if not archive.exists():
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
            z.write(work/'originals/catalog.json','catalog.json')
            for song in originals['songs']:
                relative = song['url'].removeprefix('library/')
                z.write(work/'originals'/relative,relative)
    with zipfile.ZipFile(archive) as z:
        if sha(z.read('catalog.json')) != report['originalCatalogSha256']:
            raise ValueError('Original catalog archive verification failed')
        for song in originals['songs']:
            if sha(z.read(song['url'].removeprefix('library/'))) != song['sha256']:
                raise ValueError('Original archive verification failed')
    for song in candidate['songs']:
        relative = song['url'].removeprefix('library/')
        shutil.copyfile(staged/relative,LIBRARY/relative)
    shutil.copyfile(staged/'catalog.json', LIBRARY/'catalog.json')
    write(LIBRARY/'NORMALIZATION_RECEIPT.json', {**report, 'nativeAudit':native,
                                               'originalArchive':archive.relative_to(LIBRARY).as_posix()})
    print(f'Applied {len(candidate["songs"])} editions; original bytes archived at {archive}')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['prepare','apply'])
    parser.add_argument('--work',type=Path,required=True)
    args=parser.parse_args()
    (prepare if args.command=='prepare' else apply)(args.work.resolve())
