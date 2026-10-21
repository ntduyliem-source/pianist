"""Source-bound instrument-label repair for the unchanged music21 importer.

Only part-name/instrument-name text can change. All musical XML, MIDI settings,
credits and original files are preserved. This is not a musical simplifier.
"""
from collections import Counter
from contextlib import closing
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET
import json
import re
import sqlite3

from curriculum_bank import mxl_bytes, q2
from curriculum_catalog import open_catalog, blob, register_file, save_origin
from curriculum_io import CorpusError, within, write_json
from curriculum_normalize import digest, encoded, source_tree, piano_xml, LIMITS
from curriculum_source_cleanup import instrument_names, label_kind, name

VERSION = 'piano-label-adapter-v1'
ROOT = Path(__file__).resolve().parents[2]
LABELS = ('part-name', './score-instrument/instrument-name')


def identity():
    return digest(encoded({'version': VERSION,
        'module': digest(Path(__file__).read_bytes()),
        'taxonomy': {k: sorted(v) for k, v in instrument_names().items()},
        'normalizer': q2.identity()}).encode())


def without_labels(tree):
    copy = deepcopy(tree)
    for part in copy.findall('./part-list/score-part'):
        for query in LABELS:
            for node in part.findall(query):
                node.text = ''
    return ET.tostring(copy, encoding='utf-8')


def adapt(data, metadata_names=()):
    tree = source_tree(data)
    definitions = tree.findall('./part-list/score-part')
    parts = tree.findall('part')
    if len(definitions) != 1 or len(parts) != 1 or definitions[0].get('id') != parts[0].get('id'):
        raise CorpusError('identity-review: expected one piano part')
    definition, part = definitions[0], parts[0]
    staff_ids = {int(n.text) for n in part.findall('./measure/note/staff') if n.text}
    declared = {int(n.text) for n in part.findall('./measure/attributes/staves') if n.text}
    if max({1, *staff_ids, *declared}) != 2 or staff_ids - {1, 2}:
        raise CorpusError('identity-review: not a two-staff source')
    if part.findall('./measure/note/unpitched'):
        raise CorpusError('identity-review: unpitched notes')
    labels = [e.text or '' for query in LABELS for e in definition.findall(query)]
    kinds = [label_kind(s) for s in labels]
    conflict = any(re.search(r'\b(choir|chorus|voice|vocal|vocals|soprano|tenor|drums?|percussion)\b', name(s)) for s in labels)
    if 'other' in kinds or conflict:
        raise CorpusError('identity-review: conflicting instrument declaration')
    try:
        piano_xml(data)
        return data, {'kind': 'unchanged-explicit-piano', 'labelChanges': [],
                      'musicalXmlSha256': digest(without_labels(tree))}
    except CorpusError as error:
        if str(error) != 'piano-not-explicit':
            raise
    if 'piano' in kinds:
        reason = 'musescore-piano-translation'
    else:
        neutral = all(not name(s) or re.fullmatch(r'(p\d+|part[ _-]*\d+)', name(s)) for s in labels)
        if not neutral:
            raise CorpusError('identity-review: unknown nonempty instrument name')
        clefs = {(int(c.get('number', '1')), c.findtext('sign'), c.findtext('line'), c.findtext('clef-octave-change', '0'))
                 for c in part.findall('./measure/attributes/clef')}
        keyboard = (any(c[0] == 1 and c[1:3] == ('G', '2') for c in clefs)
                    and any(c[0] == 2 and c[1:3] == ('F', '4') for c in clefs)
                    and all(c[1:] in (('G', '2', '0'), ('F', '4', '0')) for c in clefs))
        channels = {e.text for e in definition.findall('./midi-instrument/midi-channel')}
        programs = {e.text for e in definition.findall('./midi-instrument/midi-program')}
        if not keyboard or '10' in channels or (programs and not programs <= {'1', '2', '3', '4'}):
            raise CorpusError('identity-review: anonymous source lacks piano staff evidence')
        meta = [label_kind(s) for s in metadata_names if name(s)]
        if meta and set(meta) == {'piano'}:
            reason = 'verified-source-metadata-and-grand-staff'
        else:
            raise CorpusError('identity-review: anonymous source lacks verified piano metadata')
    changes = []
    for query in LABELS:
        for i, node in enumerate(definition.findall(query)):
            changes.append({'query': query, 'index': i, 'before': node.text, 'after': 'Piano'})
            node.text = 'Piano'
    if definition.find('part-name') is None:
        raise CorpusError('identity-review: missing required part-name element')
    before = without_labels(source_tree(data))
    if without_labels(tree) != before:
        raise CorpusError('adapter-changed-musical-xml')
    result = mxl_bytes(ET.tostring(tree, encoding='utf-8', xml_declaration=True))
    if without_labels(source_tree(result)) != before:
        raise CorpusError('adapter-roundtrip-changed-musical-xml')
    piano_xml(result)  # The existing reader must accept the derived input.
    return result, {'kind': reason, 'labelChanges': changes, 'musicalXmlSha256': digest(before)}


def metadata_evidence(corpus, origins):
    entries = []
    names = []
    for origin in origins:
        path, expected = origin['metadata_path'], origin['metadata_sha256']
        if not path:
            continue
        data = within(corpus, path).read_bytes()
        if digest(data) != expected:
            raise CorpusError('adapter-metadata-hash-mismatch')
        score = json.loads(data).get('data', {}).get('score', {})
        labels = [i.get('name', '') for i in score.get('instruments', [])]
        names.extend(labels)
        entries.append({'path': path, 'sha256': expected, 'instruments': labels})
    return sorted(set(names)), entries


def prepare(corpus, normalized, output):
    """Build an isolated supplemental catalog. Never rewrite the source pool."""
    corpus, normalized, output = map(lambda p: p.resolve(), (corpus, normalized, output))
    if output == corpus or corpus in output.parents:
        raise CorpusError('adapter-output-must-be-separate')
    adapter = identity()
    manifest_path = output/'adapter-manifest.json'
    if manifest_path.exists() and json.loads(manifest_path.read_text(encoding='utf8'))['adapter'] != adapter:
        raise CorpusError('adapter-changed-use-new-output-directory')
    with closing(sqlite3.connect((corpus/'catalog.sqlite').as_uri()+'?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        jobs = {r['file_sha256']: dict(r) for r in db.execute('SELECT * FROM review_queue ORDER BY id')}
        origins = {}
        for row in db.execute('SELECT * FROM origins ORDER BY id'):
            origins.setdefault(row['file_sha256'], []).append(dict(row))
    expected_pipeline = digest(f'{q2.identity()}:20000:45'.encode())
    with closing(sqlite3.connect((normalized/'normalization.sqlite').as_uri()+'?mode=ro', uri=True)) as db:
        prior = {s: {'status': status, 'blockers': json.loads(codes)} for s, status, codes in db.execute(
            'SELECT source_sha,status,blockers FROM analyses WHERE pipeline=?', (expected_pipeline,))}
    selected = [s for s in sorted(jobs) if prior.get(s, {}).get('status') != 'normalized']
    output.mkdir(parents=True, exist_ok=True)
    records = []; checked = set()
    with closing(open_catalog(output/'catalog.sqlite')) as db:
        for i, sha in enumerate(selected, 1):
            job = jobs[sha]
            original = within(corpus, job['mxl_path']).read_bytes()
            if digest(original) != sha:
                raise CorpusError('adapter-source-hash-mismatch')
            labels, metadata = metadata_evidence(corpus, origins[sha])
            row = {'originalSourceSha256': sha, 'originalPath': job['mxl_path'],
                   'previous': prior.get(sha), 'metadata': metadata}
            try:
                data, proof = adapt(original, labels)
            except CorpusError as error:
                if not str(error).startswith('identity-review:'):
                    raise
                records.append({**row, 'status': 'identity-review', 'reason': str(error)})
                continue
            item = blob(output, data, 'mxl')
            proof.update(adapter=adapter, originalSourceSha256=sha,
                         derivedSourceSha256=item['sha256'], originalPath=job['mxl_path'], metadata=metadata)
            proof_path = 'adapters/'+sha+'.json'
            write_json(output/proof_path, proof)
            register_file(db, output, item, LIMITS, checked)
            for origin in origins[sha]:
                copy = dict(origin)
                if origin['metadata_path']:
                    meta = blob(output, within(corpus, origin['metadata_path']).read_bytes(), 'json')
                    copy['metadata_path'] = meta['path']
                extra = json.loads(copy['csv_json'])
                extra['pianoLabelAdapter'] = {'originalSourceSha256': sha,
                    'derivedSourceSha256': item['sha256'], 'proof': proof_path,
                    'proofSha256': digest((output/proof_path).read_bytes()), 'adapter': adapter}
                copy.update(file_sha256=item['sha256'], csv_json=encoded(extra),
                            parse_status='pending-q2', rejection_json='[]', extraction_status='stored')
                save_origin(db, copy)
            db.commit()
            records.append({**row, 'status': 'prepared', 'derivedSourceSha256': item['sha256'],
                            'kind': proof['kind'], 'proof': proof_path, 'proofSha256': digest((output/proof_path).read_bytes())})
            if i % 50 == 0:
                print(f'Instrument adapter: {i}/{len(selected)} inspected', flush=True)
    result = {'schemaVersion': 1, 'adapter': adapter, 'sourceCorpus': str(corpus),
        'sourceNormalizationPipeline': expected_pipeline, 'scope': 'instrument-labels-only',
        'originalFilesModified': False, 'selected': len(selected),
        'outcomes': dict(Counter(r['status'] for r in records)), 'records': records}
    write_json(manifest_path, result)
    return result
