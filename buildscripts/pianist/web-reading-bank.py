"""Adapt the verified K5 bank to lazy web indexes, without changing any MXL.

Local mode includes the complete bank. Public mode includes only the reviewed
OpenScore CC0 source collection, never the pending-review PDMX/personal pool.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OPEN_SCORE = 'https://raw.githubusercontent.com/OpenScore/Lieder/38c5db510224d9facdc4b08d741fc788cfb58ea8/'


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')


def asset(path, data):
    return {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def build(source, destination, public=False):
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))

    def read(name):
        data = (source / name).read_bytes()
        expected = manifest['files'][name]
        if len(data) != expected['bytes'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
            raise ValueError('K5 integrity failed: ' + name)
        return data

    catalog = json.loads(read('catalog.json'))
    sources = {s['id']: s for s in json.loads(read('attribution.json'))['sources']}
    rows = []
    lengths = {e['id']: e['lengthBucket'] for e in catalog['entries']}
    for e in catalog['entries']:
        origins = [sources[s] for s in e['provenance'] if s in sources]
        if public:
            origins = [s for s in origins if s['license_id'] == 'CC0-1.0'
                       and s['source_url'].startswith(OPEN_SCORE)]
            if not origins:
                continue
        row = {k: e[k] for k in ['id', 'path', 'sha256', 'bytes', 'hand', 'targetCount', 'motifGroupId',
                                'title', 'grades', 'profiles', 'sourceMeasures', 'beatQuarter']}
        row['sourceId'] = e['originalSourceSha256']
        row['sources'] = [{k: s.get(k, '') for k in ['title', 'composer', 'source_url', 'license_id', 'license_url']} for s in origins]
        rows.append(row)
    visibility = 'public' if public else 'local-only'
    release = 'web-' + hashlib.sha256(encode({'source': manifest['releaseId'], 'entries': rows,
                                              'visibility': visibility, 'schema': 1})).hexdigest()[:20]
    base = destination / release
    base.mkdir(parents=True, exist_ok=True)
    (base / 'exercises').mkdir(exist_ok=True)
    for e in rows:
        data = read(e['path'])
        if asset(e['path'], data)['sha256'] != e['sha256']:
            raise ValueError('Catalog/file disagreement')
        (base / e['path']).write_bytes(data)
    options = []
    for option in catalog['options']:
        entries = [e for e in rows if option['grade'] in e['grades'] and lengths[e['id']] == option['lengthBucket']]
        path = option['path']
        data = encode({'schemaVersion': 1, 'releaseId': release, 'grade': option['grade'],
                       'lengthBucket': option['lengthBucket'], 'entries': entries})
        (base / path).parent.mkdir(parents=True, exist_ok=True)
        (base / path).write_bytes(data)
        options.append({**asset(path, data), 'grade': option['grade'], 'lengthBucket': option['lengthBucket'],
                        'count': len(entries), 'byHand': {hand: sum(e['hand'] == hand for e in entries)
                                                       for hand in ['left', 'right', 'both']}})
    index = {'schemaVersion': 1, 'releaseId': release, 'sourceRelease': manifest['releaseId'],
             'visibility': visibility, 'total': len(rows), 'minimum': 300,
             'lengthBuckets': catalog['lengthBuckets'], 'options': options}
    data = encode(index)
    (base / 'index.json').write_bytes(data)
    pointer = {'schemaVersion': 1, 'releaseId': release, 'index': asset(release + '/index.json', data)}
    (destination / 'manifest.json').write_bytes(encode(pointer))
    return {'releaseId': release, 'exercises': len(rows), 'visibility': visibility, 'root': str(destination)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='K5 release directory; defaults to latest.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'build.artifacts/curriculum')
    parser.add_argument('--public', action='store_true')
    args = parser.parse_args()
    source = args.source
    if source is None:
        latest = json.loads((ROOT / 'artifacts/curriculum-bank/latest.json').read_text(encoding='utf-8'))
        source = ROOT / 'artifacts/curriculum-bank/releases' / latest['releaseId']
        if source.parent.resolve() != (ROOT / 'artifacts/curriculum-bank/releases').resolve():
            raise ValueError('Unsafe latest release ID')
    print(json.dumps(build(source.resolve(), args.output.resolve(), args.public)))
