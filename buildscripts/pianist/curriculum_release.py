"""K5: reconcile source/scan outcomes and package audited MXL banks.

No score generation or performance scoring lives here. Build receipts stay
separate from the compact, indexed MXL package intended for later web loading.
"""
from collections import Counter
from contextlib import closing
from pathlib import Path
import gzip
import importlib.util
import json
import shutil
import sqlite3
import zipfile

from curriculum_bank import ROOT, BUCKET_IDS, q2, identity as bank_identity
from curriculum_io import CorpusError, within, write_json
from curriculum_normalize import digest, encoded
from curriculum_source_adapter import identity as adapter_identity

spec = importlib.util.spec_from_file_location('k5_audit', ROOT/'buildscripts/pianist/audit-reading-bank.py')
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)


def read_json(path):
    return json.loads(path.read_text(encoding='utf8'))


def reader(path):
    return sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True)


def read_bank(path):
    audit = auditor.audit(path)
    if not audit['passed']:
        raise CorpusError('bank-audit-failed:'+encoded(audit['errors'][:10]))
    with closing(reader(path/'bank.sqlite')) as db:
        entries = [json.loads(r[0]) for r in db.execute('SELECT entry FROM exercises ORDER BY id')]
        sources = {s: {'status': status, 'report': json.loads(report)}
                   for s, status, report in db.execute('SELECT sha,status,report FROM sources')}
        origins = db.execute('SELECT id,source_sha,selection FROM origins ORDER BY id,source_sha,selection').fetchall()
    catalog = read_json(path/'catalog.json')
    if catalog['pipeline'] != audit['pipeline'] or encoded(sorted(catalog['entries'], key=lambda e:e['id'])) != encoded(entries):
        raise CorpusError('catalog-database-mismatch:'+str(path))
    expected = {e['path'] for e in entries}
    if {p.relative_to(path).as_posix() for p in (path/'exercises').glob('*.mxl')} != expected:
        raise CorpusError('unindexed-or-missing-exercise:'+str(path))
    # One source checkpoint must account for every extracted candidate. A file
    # in staging alone is never an accepted exercise.
    by_id = {e['id']: e for e in entries}
    scan_counts = Counter(); rule_counts = Counter()
    for source_number, (sha, source) in enumerate(sources.items(), 1):
        if source['status'] != 'complete':
            continue
        report = source['report']; key = report['scanKey']
        saved = json.loads(gzip.decompress(within(path, 'scans/'+key+'.json.gz').read_bytes()))
        payload = saved['payload']
        if saved['sha256'] != digest(encoded(payload).encode()) or payload['key'] != key or payload['sourceSha256'] != sha:
            raise CorpusError('scan-hash-or-source-binding:'+sha)
        if payload['stats'] != report['scanStats'] or sum(report['exports'].values()) != len(payload['candidates']):
            raise CorpusError('unaccounted-source-candidates:'+sha)
        accepted_or_duplicate = 0
        for row in payload['candidates']:
            if row['selection']['sourceSha256'] != sha or row['selection']['analysisSha256'] != payload['analysisSha256']:
                raise CorpusError('candidate-source-binding:'+sha)
            if row['id'] in by_id:
                accepted_or_duplicate += 1
        required = report['exports'].get('accepted', 0)+report['exports'].get('exactDuplicates', 0)
        if accepted_or_duplicate < required:
            raise CorpusError('accepted-candidate-missing-from-bank:'+sha)
        scan_counts.update(report['exports'])
        rule_counts.update(report['scanStats'])
        scan_counts['completeSources'] += 1
        scan_counts['candidates'] += len(payload['candidates'])
        if source_number % 2000 == 0:
            print(f"K5 {path.name}: checked {source_number}/{len(sources)} source checkpoints", flush=True)
    audit['sourceScanAccounting'] = dict(scan_counts)
    audit['scanRuleCounts'] = dict(rule_counts)
    return {'path': path, 'entries': entries, 'sources': sources, 'origins': origins, 'audit': audit,
            'catalogSha256': digest((path/'catalog.json').read_bytes())}


def combine(banks, target=300):
    """Deduplicate content IDs, retaining the first verified file and proof.

    Alternate source versions remain in the audit trail. They do not increase
    the exercise count or silently add grades absent from the selected proof.
    """
    chosen = {}; duplicates = []; byte_ids = {}
    for bank in banks:
        for entry in bank['entries']:
            id_ = entry['id']
            if id_ in chosen:
                previous = chosen[id_]['entry']
                if (entry['targetCount'], entry['lengthBucket'], entry['hand'], entry['motifGroupId']) != (
                        previous['targetCount'], previous['lengthBucket'], previous['hand'], previous['motifGroupId']):
                    raise CorpusError('inconsistent-content-id:'+id_)
                duplicates.append({'id': id_, 'bank': bank['path'].name, 'sha256': entry['sha256'],
                    'selectedSha256': previous['sha256'], 'sameBytes': entry['sha256'] == previous['sha256'],
                    'alternateGrades': entry['grades'], 'alternateProfiles': entry['profiles']})
                continue
            if entry['sha256'] in byte_ids:
                raise CorpusError('same-mxl-with-conflicting-content-ids:'+id_)
            byte_ids[entry['sha256']] = id_
            chosen[id_] = {'entry': entry, 'bank': bank}
    counts = {str(g): {b: 0 for b in BUCKET_IDS} for g in range(1, 9)}
    dimensions = Counter()
    profiles = {p['id']: p['grade'] for p in read_json(ROOT/'scores/curriculum/grades.v3.json')['profiles']}
    for item in chosen.values():
        e = item['entry']
        for grade in e['grades']:
            counts[str(grade)][e['lengthBucket']] += 1
        for profile in e['profiles']:
            if profile not in profiles or profiles[profile] not in e['grades']:
                raise CorpusError('profile-grade-mismatch:'+e['id'])
            dimensions[(profiles[profile], profile, e['hand'], e['lengthBucket'])] += 1
    coverage = {'minimumPerOption': target, 'uniqueMxlFiles': len(chosen),
        'verifiedUniqueByOption': counts,
        'verifiedUniqueByGrade': {g: sum(row.values()) for g, row in counts.items()},
        'remainingByOption': {g: {b: max(0, target-n) for b, n in row.items()} for g, row in counts.items()},
        'optionsAtMinimum': sum(n >= target for row in counts.values() for n in row.values()),
        'optionCount': 56, 'targetMet': all(n >= target for row in counts.values() for n in row.values()),
        'distinctMotifGroups': len({r['entry']['motifGroupId'] for r in chosen.values()}),
        'gradeProfileHandLength': [dict(grade=g, profile=p, hand=h, lengthBucket=b, count=n)
                                 for (g, p, h, b), n in sorted(dimensions.items())],
        'duplicateContentVariants': len(duplicates)}
    return chosen, coverage, duplicates


def reconcile_sources(corpus, normalized, banks, supplemental=None, supplemental_normalized=None):
    with closing(reader(corpus/'catalog.sqlite')) as db:
        files = {s: {'path': p, 'containerStatus': status, 'error': error}
                 for s, p, status, error in db.execute(
                     "SELECT sha256,path,container_status,error FROM files WHERE container_status!='removed-by-user'")}
    pipeline = digest(f'{q2.identity()}:20000:45'.encode())
    with closing(reader(normalized/'normalization.sqlite')) as db:
        normalized_rows = {s: {'status': status, 'reasons': json.loads(codes), 'error': error}
                           for s, status, codes, error in db.execute(
                               'SELECT source_sha,status,blockers,error FROM analyses WHERE pipeline=?', (pipeline,))}
    prepared = {}; supplements = {}; manifest_hash = None
    if supplemental:
        manifest = read_json(supplemental/'adapter-manifest.json')
        if manifest['adapter'] != adapter_identity():
            raise CorpusError('source-adapter-code-changed')
        manifest_hash = digest((supplemental/'adapter-manifest.json').read_bytes())
        prepared = {r['originalSourceSha256']: r for r in manifest['records']}
        for row in prepared.values():
            if row['status'] != 'prepared':
                continue
            proof_bytes = within(supplemental, row['proof']).read_bytes()
            if digest(proof_bytes) != row['proofSha256']:
                raise CorpusError('adapter-proof-changed')
            proof = json.loads(proof_bytes)
            if proof['adapter'] != manifest['adapter'] or proof['originalSourceSha256'] != row['originalSourceSha256'] or proof['derivedSourceSha256'] != row['derivedSourceSha256']:
                raise CorpusError('adapter-proof-binding')
            # Independent comparison of all non-label XML, including dynamics,
            # ties, pedal, MIDI settings and credits, not just note counts.
            from curriculum_source_adapter import without_labels, metadata_evidence
            from curriculum_normalize import source_tree
            source = within(corpus, row['originalPath']).read_bytes()
            sha = row['derivedSourceSha256']
            derived = within(supplemental, f'raw/objects/{sha[:2]}/{sha}.mxl').read_bytes()
            if digest(source) != row['originalSourceSha256'] or digest(derived) != sha:
                raise CorpusError('adapter-source-bytes-changed')
            a, b = without_labels(source_tree(source)), without_labels(source_tree(derived))
            if a != b or digest(a) != proof['musicalXmlSha256']:
                raise CorpusError('adapter-musical-data-changed')
            for meta in proof['metadata']:
                if digest(within(corpus, meta['path']).read_bytes()) != meta['sha256']:
                    raise CorpusError('adapter-metadata-changed')
        if supplemental_normalized:
            with closing(reader(supplemental_normalized/'normalization.sqlite')) as db:
                supplements = {s: {'status': status, 'reasons': json.loads(codes), 'error': error}
                               for s, status, codes, error in db.execute(
                                   'SELECT source_sha,status,blockers,error FROM analyses WHERE pipeline=?', (pipeline,))}
    outcomes = []
    for sha, file in sorted(files.items()):
        row = {'sourceSha256': sha, **file}
        if digest(within(corpus, file['path']).read_bytes()) != sha:
            raise CorpusError('active-source-changed:'+sha)
        if file['containerStatus'] != 'valid':
            outcomes.append({**row, 'status': 'container-unsupported', 'reason': file['error']})
            continue
        candidate = prepared.get(sha)
        effective_sha = candidate['derivedSourceSha256'] if candidate and candidate['status'] == 'prepared' else sha
        analysis = supplements.get(effective_sha) if candidate and candidate['status'] == 'prepared' else normalized_rows.get(sha)
        scans = [(b['path'].name, b['sources'][effective_sha]) for b in banks if effective_sha in b['sources']]
        complete = next(((label, result) for label, result in scans if result['status'] == 'complete'), None)
        if complete:
            row.update(status='scanned', bank=complete[0], effectiveSourceSha256=effective_sha,
                       exports=complete[1]['report']['exports'])
        elif candidate and candidate['status'] == 'identity-review':
            row.update(status='identity-review', reason=candidate['reason'])
        elif analysis and analysis['status'] == 'rejected':
            row.update(status='parser-unsupported', reasons=analysis['reasons'], error=analysis['error'])
        else:
            row.update(status='pending', effectiveSourceSha256=effective_sha,
                       analysis=analysis, scans=[{'bank': label, 'status': r['status']} for label, r in scans])
        outcomes.append(row)
    counts = dict(Counter(r['status'] for r in outcomes))
    return {'sourceFiles': len(files), 'outcomes': counts, 'pending': counts.get('pending', 0),
            'processingComplete': not counts.get('pending', 0), 'adapterManifestSha256': manifest_hash,
            'records': outcomes}


def copy_verified(source, destination, expected):
    data = source.read_bytes()
    if digest(data) != expected:
        raise CorpusError('package-input-changed:'+str(source))
    if destination.exists():
        if digest(destination.read_bytes()) != expected:
            raise CorpusError('immutable-package-file-changed:'+str(destination))
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(destination.suffix+'.tmp')
    temp.write_bytes(data); temp.replace(destination)


def verify_package(directory):
    manifest = read_json(directory/'manifest.json')
    for path, expected in manifest['files'].items():
        data = within(directory, path).read_bytes()
        if digest(data) != expected['sha256'] or len(data) != expected['bytes']:
            raise CorpusError('package-file-hash:'+path)
    actual = {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
    if actual != {*manifest['files'], 'manifest.json'}:
        raise CorpusError('package-inventory-mismatch')
    catalog = read_json(directory/'catalog.json')
    by_id = {e['id']: e for e in catalog['entries']}
    if len(by_id) != len(catalog['entries']):
        raise CorpusError('package-duplicate-id')
    expected_options = {(g, b) for g in range(1, 9) for b in BUCKET_IDS}
    if len(catalog['options']) != 56 or {(o['grade'], o['lengthBucket']) for o in catalog['options']} != expected_options:
        raise CorpusError('package-missing-length-options')
    for e in by_id.values():
        if e['path'] != 'exercises/'+e['id']+'.mxl' or manifest['files'].get(e['path']) != {'sha256': e['sha256'], 'bytes': e['bytes']}:
            raise CorpusError('package-entry-file-binding')
    if {p for p in manifest['files'] if p.startswith('exercises/')} != {e['path'] for e in by_id.values()}:
        raise CorpusError('package-exercise-inventory')
    for option in catalog['options']:
        rows = read_json(within(directory, option['path']))
        expected = sorted(e['id'] for e in by_id.values() if option['grade'] in e['grades'] and option['lengthBucket'] == e['lengthBucket'])
        if rows['ids'] != expected or option['count'] != len(expected):
            raise CorpusError('package-option-index-mismatch')
        hands = {hand: [id_ for id_ in expected if by_id[id_]['hand'] == hand] for hand in ('left', 'right', 'both')}
        if rows.get('byHand') != hands:
            raise CorpusError('package-hand-index-mismatch')
    return {'passed': True, 'files': len(manifest['files']), 'exercises': len(by_id),
            'manifestSha256': digest((directory/'manifest.json').read_bytes())}


def package(bank_paths, output, corpus, normalized, supplemental=None, supplemental_normalized=None, target=300):
    banks = [read_bank(p.resolve()) for p in bank_paths]
    chosen, coverage, duplicates = combine(banks, target)
    sources = reconcile_sources(corpus.resolve(), normalized.resolve(), banks, supplemental, supplemental_normalized)
    if not sources['processingComplete']:
        write_json(output/'pending-sources.json', sources)
        raise CorpusError('source-processing-incomplete:'+str(sources['pending']))
    identity = {'schema': 1, 'moduleSha256': digest(Path(__file__).read_bytes()), 'bankPipeline': bank_identity(),
                'bankCatalogs': [b['catalogSha256'] for b in banks],
                'sourceOutcomesSha256': digest(encoded(sources).encode()), 'target': target}
    release_id = 'reading-mxl-v1-'+digest(encoded(identity).encode())[:16]
    destination = output/'releases'/release_id
    entries = []; options = []; attribution = {}
    active_sources = {r['sourceSha256'] for r in sources['records']}
    for id_, item in sorted(chosen.items()):
        e, bank = item['entry'], item['bank']
        proof = json.loads(gzip.decompress(within(bank['path'], e['proof']).read_bytes()))
        original_sha = e['sourceSha256']
        provenance = []
        for origin in proof['origins']:
            fields = {k: origin[k] for k in ('id', 'source_url', 'title', 'composer', 'license_id', 'license_url', 'visibility')}
            adapter = json.loads(origin['csv_json']).get('pianoLabelAdapter')
            if adapter:
                original_sha = adapter['originalSourceSha256']
                fields['instrumentLabelAdapter'] = adapter
            fields['sourceSha256'] = original_sha
            attribution[fields['id']] = fields
            provenance.append(fields['id'])
        result = {k: v for k, v in e.items() if k not in ('proof', 'proofSha256')}
        result.update(originalSourceSha256=original_sha, provenance=provenance,
                      originalSourceRetained=original_sha in active_sources,
                      verification={'bank': bank['path'].name, 'pipeline': bank['audit']['pipeline'],
                                    'proof': e['proof'], 'proofSha256': e['proofSha256']})
        entries.append(result)
        copy_verified(within(bank['path'], e['path']), destination/e['path'], e['sha256'])
    for grade in range(1, 9):
        for bucket in BUCKET_IDS:
            ids = sorted(e['id'] for e in entries if grade in e['grades'] and e['lengthBucket'] == bucket)
            path = f'indexes/g{grade}/{bucket}.json'
            write_json(destination/path, {'grade': grade, 'lengthBucket': bucket, 'ids': ids,
                'byHand': {hand: [id_ for id_ in ids if chosen[id_]['entry']['hand'] == hand] for hand in ('left', 'right', 'both')},
                'entries': [{k: chosen[id_]['entry'][k] for k in ('id', 'path', 'sha256', 'bytes', 'hand', 'targetCount',
                             'motifGroupId', 'title', 'grades', 'profiles')} for id_ in ids]})
            options.append({'grade': grade, 'lengthBucket': bucket, 'path': path, 'count': len(ids),
                            'minimum': target, 'atMinimum': len(ids) >= target})
    catalog = {'schemaVersion': 1, 'releaseId': release_id, 'format': 'mxl', 'visibility': 'local-only',
        'requiresAppIntegration': True, 'entries': entries, 'options': options,
        'lengthBuckets': read_json(ROOT/'scores/curriculum/length-buckets.v2.json')['buckets'],
        'gradePolicy': 'reading-bank.v1.json', 'targetMet': coverage['targetMet']}
    write_json(destination/'catalog.json', catalog)
    write_json(destination/'index.json', {k: v for k, v in catalog.items() if k != 'entries'})
    write_json(destination/'coverage.json', coverage)
    write_json(destination/'attribution.json', {'sources': list(attribution.values())})
    for name in ('reading-bank.v1.json', 'grades.v3.json', 'length-buckets.v2.json'):
        data = ROOT/'scores/curriculum'/name
        copy_verified(data, destination/name, digest(data.read_bytes()))
    files = {p.relative_to(destination).as_posix(): {'sha256': digest(p.read_bytes()), 'bytes': p.stat().st_size}
             for p in sorted(destination.rglob('*')) if p.is_file() and p.name != 'manifest.json'}
    manifest = {'schemaVersion': 1, 'releaseId': release_id, 'identity': identity,
                'files': files, 'mxlFiles': len(entries), 'mxlBytes': sum(e['bytes'] for e in entries)}
    write_json(destination/'manifest.json', manifest)
    verification = verify_package(destination)
    audits = output/'audits'/release_id
    write_json(audits/'source-outcomes.json', sources)
    write_json(audits/'duplicates.json', duplicates)
    write_json(audits/'bank-audits.json', {b['path'].name: b['audit'] for b in banks})
    for item in chosen.values():
        e, bank = item['entry'], item['bank']
        copy_verified(within(bank['path'], e['proof']), audits/'proofs'/(e['id']+'.json.gz'), e['proofSha256'])
    archive = output/(release_id+'.zip')
    temp = archive.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in sorted([*files, 'manifest.json']):
            info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, within(destination, path).read_bytes())
    with zipfile.ZipFile(temp) as z:
        if z.testzip() or set(z.namelist()) != {*files, 'manifest.json'}:
            raise CorpusError('package-archive-verification')
        for path, expected in files.items():
            if digest(z.read(path)) != expected['sha256']:
                raise CorpusError('package-archive-content:'+path)
    temp.replace(archive)
    report = {'schemaVersion': 1, 'releaseId': release_id, 'package': str(destination), 'archive': str(archive),
        'archiveSha256': digest(archive.read_bytes()), 'archiveBytes': archive.stat().st_size,
        'verification': verification, 'coverage': coverage,
        'sourceProcessing': {k: v for k, v in sources.items() if k != 'records'},
        'mxlBytes': manifest['mxlBytes'], 'banks': [b['path'].name for b in banks],
        'scope': 'K3/K4 completed finite source queue; K5 audited local MXL package. App integration is separate.',
        'quotaComplete': coverage['targetMet'], 'packagingComplete': True}
    write_json(audits/'verification.json', report)
    write_json(output/'latest.json', report)
    return report
