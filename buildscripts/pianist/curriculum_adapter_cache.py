"""Cheap checksum/provenance preflight for an unchanged instrument-adapter run."""
from contextlib import closing
import json
import sqlite3
from curriculum_io import within
from curriculum_normalize import digest
from curriculum_source_adapter import identity, q2


def reusable(corpus, normalized, output):
    corpus, normalized, output = map(lambda p: p.resolve(), (corpus, normalized, output))
    manifest_path = output/'adapter-manifest.json'
    if not manifest_path.is_file() or not (output/'catalog.sqlite').is_file():
        return None
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    if manifest['adapter'] != identity() or manifest['sourceCorpus'] != str(corpus):
        return None
    pipeline = digest(f'{q2.identity()}:20000:45'.encode())
    with closing(sqlite3.connect((normalized/'normalization.sqlite').as_uri()+'?mode=ro', uri=True)) as db:
        read = {r[0] for r in db.execute('SELECT source_sha FROM analyses WHERE pipeline=? AND status=?', (pipeline, 'normalized'))}
    with closing(sqlite3.connect((corpus/'catalog.sqlite').as_uri()+'?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        current = {r['file_sha256']: dict(r) for r in db.execute('SELECT * FROM review_queue') if r['file_sha256'] not in read}
        origins = {r['id']: dict(r) for r in db.execute('SELECT * FROM origins') if r['file_sha256'] in current}
    if set(current) != {r['originalSourceSha256'] for r in manifest['records']}:
        return None
    with closing(sqlite3.connect((output/'catalog.sqlite').as_uri()+'?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        derived_origins = {r['id']: dict(r) for r in db.execute('SELECT * FROM origins')}
    for record in manifest['records']:
        sha = record['originalSourceSha256']
        if digest(within(corpus, current[sha]['mxl_path']).read_bytes()) != sha:
            return None
        expected_meta = {(r['metadata_path'], r['metadata_sha256']) for r in origins.values()
                         if r['file_sha256'] == sha and r['metadata_path']}
        if expected_meta != {(r['path'], r['sha256']) for r in record['metadata']}:
            return None
        if any(digest(within(corpus, p).read_bytes()) != h for p, h in expected_meta):
            return None
        if record['status'] != 'prepared':
            continue
        derived_sha = record['derivedSourceSha256']
        if digest(within(output, record['proof']).read_bytes()) != record['proofSha256']:
            return None
        if digest(within(output, f'raw/objects/{derived_sha[:2]}/{derived_sha}.mxl').read_bytes()) != derived_sha:
            return None
        for id_, origin in origins.items():
            if origin['file_sha256'] != sha:
                continue
            derived = derived_origins.get(id_)
            if not derived or derived['file_sha256'] != derived_sha:
                return None
            fields = ('collection', 'revision', 'source_path', 'source_url', 'title', 'composer',
                      'license_id', 'license_url', 'visibility', 'metadata_sha256', 'metadata_status')
            if any(origin[k] != derived[k] for k in fields):
                return None
            csv = json.loads(derived['csv_json']); csv.pop('pianoLabelAdapter', None)
            if csv != json.loads(origin['csv_json']):
                return None
    return manifest
