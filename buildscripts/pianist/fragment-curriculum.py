"""Q3 resumable offline scan -> project -> native jobs -> coverage/review queue.

No app deployment or performance-scoring mutation. Q1/Q2 databases are read-only.
All filesystem output and all native receipts are bound to inputs and rule hashes.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import gzip
import importlib.util
import json
import multiprocessing as mp
from pathlib import Path
import re
import sqlite3
import zlib

from curriculum_fragments import (VERSION, SourceIndex, evaluate, content_hashes,
                                  group_candidates, project_xml, verify_projection, ticks)
from curriculum_normalize import digest, encoded, normalize, piano_xml, as_fraction as q
from curriculum_io import within, write_json, RunLock, CorpusError

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('q2pipeline', Path(__file__).with_name('normalize-curriculum.py'))
q2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q2)


def identity(config):
    files = ['buildscripts/pianist/curriculum_fragments.py', 'buildscripts/pianist/fragment-curriculum.py']
    return digest(encoded({'q2': q2.identity(), 'files': {f: digest((ROOT/f).read_bytes()) for f in files},
                           'config': config}).encode())


def read_db(path):
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def load_sources(args):
    # Match the pinned Q2 settings. Alternative Q2 runs require an explicit CLI
    # parameter; a historical analysis is never silently relabelled current.
    pipeline = digest(f'{q2.identity()}:{args.q2_max_notes}:{args.q2_timeout}'.encode())
    with read_db(args.normalized/'normalization.sqlite') as db:
        rows = db.execute("SELECT * FROM analyses WHERE status='normalized' AND pipeline=? ORDER BY source_sha", (pipeline,)).fetchall()
    if not rows:
        raise CorpusError('no-current-q2-analyses')
    if args.limit:
        rows = rows[:args.limit]
    result = []
    with read_db(args.corpus/'catalog.sqlite') as db:
        for row in rows:
            raw = zlib.decompress(row['blob'])
            if digest(raw) != row['analysis_sha']:
                raise CorpusError('q2-analysis-checksum-mismatch')
            source = db.execute('SELECT * FROM files WHERE sha256=?', (row['source_sha'],)).fetchone()
            if source is None or source['container_status'] != 'valid':
                raise CorpusError('missing-valid-q1-source')
            data = within(args.corpus, source['path']).read_bytes()
            if digest(data) != row['source_sha']:
                raise CorpusError('source-checksum-mismatch')
            origins = [dict(r) for r in db.execute('''SELECT id,collection,revision,source_path,source_url,
                       title,composer,license_id,license_url,visibility FROM origins WHERE file_sha256=? ORDER BY id''', (row['source_sha'],))]
            result.append({'id': row['source_sha'], 'analysis': json.loads(raw), 'analysisSha256': row['analysis_sha'],
                           'path': source['path'], 'bytes': source['bytes'], 'origins': origins})
    return result


def source_index(args, source):
    return SourceIndex(source['analysis'], within(args.corpus, source['path']).read_bytes())


def scan_job(job):
    return scan_source(*job)


def scan_source(args, source, config, pipeline):
    cache = args.output/'scans'/(source['id']+'.json.gz')
    key = digest(encoded([pipeline, source['id'], source['analysisSha256']]).encode())
    if cache.exists():
        try:
            result = json.loads(gzip.decompress(cache.read_bytes()))
            if result['key'] == key and result['payloadSha256'] == digest(encoded(result['payload']).encode()):
                return result['payload'], True
        except (ValueError, OSError, KeyError):
            pass
    index = source_index(args, source)
    candidates, rejected = [], []
    for lids, start, end, preliminary in index.windows():
        matches, reasons, features = evaluate(index, lids, start, end, config)
        location = {'sourceId': source['id'], 'lineIds': list(lids), 'startMeasure': start, 'endMeasure': end}
        if reasons:
            rejected.append({**location, 'rejections': reasons})
        if not matches:
            continue
        lo, hi = index.boundaries(lids, start, end)
        events = index.selected(lids, start, end)
        id_ = digest(encoded([VERSION, source['id'], lids, start, end]).encode())
        candidates.append({'schemaVersion': 1, 'id': id_, 'sourceId': source['id'], 'corpusVersion': pipeline,
            'sourceAnalysisSha256': source['analysisSha256'], 'selection': {'lineIds': list(lids), 'kind': 'original-piano-line-selection'},
            'span': {'startMeasure': start, 'endMeasure': end, 'startTick': ticks(lo), 'endTick': ticks(hi), 'ticksPerQuarter': 480},
            'sourceMeasureLabels': [m['label'] for m in index.measures[index.a['lines'][lids[0]]['partId']][start:end]],
            'preliminaryAttackBound': preliminary, 'counts': None, 'matches': matches, 'features': features,
            **content_hashes(events, list(lids), lo, hi-lo),
            'review': {'status': 'pending', 'method': None, 'evidence': [], 'teacherReviewed': False},
            'acceptedForPractice': False, 'sourceGroupId': source['id'],
            'workGroupId': None, 'workIdentityStatus': 'unreviewed',
            'keyModeStatus': 'unconfirmed' if not features['keyModeConfirmed'] else 'explicit',
            'visibility': 'personal' if all(o['visibility'] == 'personal' for o in source['origins']) else 'pending-review'})
    payload = {'sourceId': source['id'], 'candidates': candidates, 'rejected': rejected}
    cache.parent.mkdir(parents=True, exist_ok=True)
    temp = cache.with_suffix('.tmp')
    temp.write_bytes(gzip.compress(encoded({'key': key, 'payloadSha256': digest(encoded(payload).encode()), 'payload': payload}).encode(), mtime=0))
    temp.replace(cache)
    return payload, False


def choose_pilot(candidates, config, per_grade):
    selected = {}
    # Round-robin source groups, then native-length proximity; near-duplicate
    # groups cannot occupy multiple pilot slots in the same grade.
    defaults = {1: 12, 2: 14, 3: 18, 4: 18, 5: 24, 6: 18, 7: 24, 8: 36}
    for grade in range(1, 9):
        groups = defaultdict(list)
        for c in candidates:
            if any(m['grade'] == grade for m in c['matches']):
                groups[c['sourceGroupId']].append(c)
        for values in groups.values():
            values.sort(key=lambda c: (abs(c['preliminaryAttackBound'] - defaults[grade]), c['span']['startMeasure'], c['id']))
        seen, n = set(), 0
        while groups and n < per_grade:
            for source_id in sorted(list(groups)):
                values = groups[source_id]
                while values and values[0]['nearDuplicateGroupId'] in seen:
                    values.pop(0)
                if not values:
                    del groups[source_id]; continue
                c = values.pop(0)
                seen.add(c['nearDuplicateGroupId']); selected[c['id']] = c; n += 1
                if n == per_grade:
                    break
    return sorted(selected.values(), key=lambda c: c['id'])


def prepare(args, source_map, selected, config, pipeline):
    entries, failures = [], []
    last_id, index = None, None
    for c in sorted(selected, key=lambda c: (c['sourceId'], c['id'])):
        if last_id != c['sourceId']:
            last_id = c['sourceId']; index = source_index(args, source_map[last_id])
        location = args.output/'fragments'/c['id']
        location.mkdir(parents=True, exist_ok=True)
        try:
            xml = project_xml(index, c['selection']['lineIds'], c['span']['startMeasure'], c['span']['endMeasure'])
            analysis = normalize(xml)
            proof = verify_projection(index, c['selection']['lineIds'], c['span']['startMeasure'], c['span']['endMeasure'], analysis)
            if not proof['passed']:
                raise CorpusError(','.join(proof['rejectionCodes']))
            if analysis['releaseBlockers']:
                raise CorpusError('excerpt-q2-blocked:' + ','.join(analysis['releaseBlockers']))
            # Canonical piano XML is exactly what the native harness hashes.
            canonical, _ = piano_xml(xml)
            raw = encoded(analysis).encode()
            (location/'excerpt.musicxml').write_bytes(canonical)
            (location/'analysis.json').write_bytes(raw)
            c['projectionVerification'] = proof
            c['notation'] = {'musicXmlAsset': f'fragments/{c["id"]}/excerpt.musicxml', 'sha256': digest(canonical)}
            c['projectedAnalysisSha256'] = digest(raw)
            c['analysis'] = {'asset':f'fragments/{c["id"]}/analysis.json','sha256':digest(raw)}
            c['nativeVerification'] = {'status': 'pending'}
            write_json(location/'fragment.json', c)
            entries.append({'id': c['id'], 'xml': str((location/'excerpt.musicxml').resolve()),
                            'analysis': str((location/'analysis.json').resolve()), 'analysisSha256': digest(raw)})
        except Exception as e:
            failures.append({'id': c['id'], 'sourceId': c['sourceId'], 'rejectionCodes': [str(e)]})
    write_json(args.output/'jobs.json', {'pipeline': pipeline, 'entries': entries})
    write_json(args.output/'projection-rejected.json', failures)
    return entries, failures


def finalize(args, config, pipeline, sources):
    manifest = json.loads((args.output/'scan.json').read_text(encoding='utf8'))
    if manifest['pipeline'] != pipeline:
        raise CorpusError('stale-q3-scan')
    source_map = {s['id']:s for s in sources}
    if {(s['id'],s['analysisSha256']) for s in manifest['sources']} != {(s['id'],s['analysisSha256']) for s in sources}:
        raise CorpusError('scan-source-set-changed')
    jobs = json.loads((args.output/'jobs.json').read_text(encoding='utf8'))
    report = json.loads(args.report.read_text(encoding='utf8'))
    if jobs['pipeline'] != pipeline or report['pipeline'] != pipeline:
        raise CorpusError('stale-native-pipeline')
    if report['engineBuild'] != q2.native_identity() or report['verifierBuild'] != q2.verifier_identity():
        raise CorpusError('stale-native-engine-or-verifier')
    if report.get('verifierHashes') != {f: digest((ROOT/f).read_bytes()) for f in q2.VERIFIER_FILES}:
        raise CorpusError('native-verifier-hash-mismatch')
    if not report.get('passed'):
        raise CorpusError('incomplete-native-run')
    receipts = {r['id']: r for r in report['entries']}
    if len(receipts) != len(report['entries']) or len({j['id'] for j in jobs['entries']})!=len(jobs['entries']) or set(receipts) != {j['id'] for j in jobs['entries']}:
        raise CorpusError('native-job-set-mismatch')
    fragments, blocked = [], []
    original_index, previous_source = None,None
    expected_selected = {c['id']:c for c in manifest['selected']}
    if len(expected_selected)!=len(manifest['selected']):
        raise CorpusError('duplicate-fragment-id')
    for job in jobs['entries']:
        id_ = job['id']; row = receipts[id_]
        if not re.fullmatch('[a-f0-9]{64}',id_) or id_ not in expected_selected:
            raise CorpusError('invalid-fragment-id')
        directory = args.output/'fragments'/id_
        c = json.loads((directory/'fragment.json').read_text(encoding='utf8'))
        # Bind mutable artifact JSON back to the hashed scan record.
        planned = expected_selected[id_]
        for field in ('sourceId', 'sourceAnalysisSha256', 'selection', 'span', 'matches', 'features', 'exactHash', 'motifGroupId', 'nearDuplicateGroupId'):
            if c[field] != planned[field]:
                raise CorpusError('fragment-manifest-mismatch:' + field)
        source = source_map.get(c['sourceId'])
        if not source or c['sourceAnalysisSha256']!=source['analysisSha256']:
            raise CorpusError('fragment-source-binding')
        if previous_source!=source['id']:
            original_index=source_index(args,source);previous_source=source['id']
        lids=tuple(c['selection']['lineIds']); start=c['span']['startMeasure'];end=c['span']['endMeasure']
        if start<0 or end<=start or any(lid not in original_index.a['lines'] for lid in lids):
            raise CorpusError('invalid-fragment-selection')
        rebuilt_matches,_,_=evaluate(original_index,lids,start,end,config)
        if rebuilt_matches!=c['matches']:
            raise CorpusError('profile-verdict-changed')
        raw = (directory/'analysis.json').read_bytes()
        if digest(raw) != job['analysisSha256'] or row['analysisSha256'] != job['analysisSha256']:
            raise CorpusError('native-analysis-checksum-mismatch')
        xml = (directory/'excerpt.musicxml').read_bytes()
        if digest(xml) != c['notation']['sha256'] or digest(xml) != row['pianoXmlSha256'] or not row.get('inputHashVerified'):
            raise CorpusError('native-xml-checksum-mismatch')
        reconstructed,_=piano_xml(project_xml(original_index,lids,start,end))
        if digest(reconstructed)!=digest(xml):
            raise CorpusError('projection-source-binding')
        if not verify_projection(original_index,lids,start,end,json.loads(raw))['passed']:
            raise CorpusError('projection-proof-changed')
        if row.get('snapshotSha256'):
            snapshot = gzip.decompress((args.report.parent/'snapshots'/(id_+'.json.gz')).read_bytes())
            if digest(snapshot) != row['snapshotSha256']:
                raise CorpusError('native-snapshot-checksum-mismatch')
        verification = row['verification']
        reasons = list(verification.get('rejectionCodes', [])) + list(verification.get('releaseBlockers', []))
        count = verification.get('counts', {}).get('targets')
        if not verification.get('eligibleForFragmentReview') or not row.get('snapshotSha256'):
            reasons.append('native-fragment-not-eligible')
        if count is None or not 4 <= count <= 64:
            reasons.append('native-target-count-outside-4-64')
        if reasons:
            blocked.append({'id': id_, 'rejectionCodes': sorted(set(reasons))}); continue
        c['counts'] = verification['counts']
        c['nativeVerification'] = {'status': 'matched', 'engineBuild': report['engineBuild'],
                                   'verifierBuild': report['verifierBuild'], 'semanticHash': row['snapshotSha256'],
                                   'verifiedAt': report['at'], 'voiceMap': verification['voiceMap']}
        c['profileIds'] = [m['profileId'] for m in c['matches']]
        # Technical matching cannot approve a musical phrase, hand movement,
        # source mode/attribution or publication rights.
        c['review'] = {'status': 'pending', 'method': None, 'evidence': [], 'teacherReviewed': False}
        c['acceptedForPractice'] = False
        write_json(directory/'fragment.json', c)
        fragments.append(c)
    write_json(args.output/'native-rejected.json', blocked)
    write_json(args.output/'fragments.v1.json', {'schemaVersion': 1, 'pipeline': pipeline, 'fragments': fragments})
    coverage = coverage_report(manifest, fragments, blocked, config)
    write_json(args.output/'coverage.json', coverage)
    write_json(args.output/'source-gaps.json', coverage['gaps'])
    # Deterministic stratification for review, including rare profiles first.
    review = []
    for grade in range(1, 9):
        rows = [c for c in fragments if any(m['grade'] == grade for m in c['matches'])]
        taken, strata = [], set()
        while rows and len(taken) < 30:
            def novelty(c):
                labels = {m['profileId'] for m in c['matches'] if m['grade'] == grade}
                labels.update(w['templateId'] for m in c['matches'] if m['grade'] == grade for w in m['handWitnesses'].values())
                labels.add(c['sourceId']); labels.add('N'+str(c['counts']['targets']))
                return labels
            c = min(rows, key=lambda c: (-len(novelty(c)-strata), c['id']))
            rows.remove(c); taken.append(c['id']); strata.update(novelty(c))
        review.append({'grade': grade, 'requiredSamples': 30, 'availableSamples': len(taken),
                       'fragmentIds': taken, 'status': 'pending', 'teacherReviewed': False})
    write_json(args.output/'review-queue.json', {'pipeline': pipeline, 'grades': review,
               'checks': ['source labels and exact line selection', 'musically sensible start/end',
                          'hand/finger template for actual phrase', 'notation and tonal mode',
                          'original versus altered content', 'license/work attribution'],
               'allNewTemplateFamiliesRequired': True})
    print(encoded(coverage))


def coverage_report(manifest, fragments, blocked, config):
    grades, gaps = [], []
    for grade in range(1, 9):
        rows = [c for c in fragments if any(m['grade'] == grade for m in c['matches'])]
        raw = manifest['candidateCoverage'][str(grade)]
        intervals, hands, rhythms, regions, lengths, profiles, templates = (Counter() for _ in range(7))
        for c in rows:
            lengths[str(c['counts']['targets'])] += 1
            for i in c['features']['intervals']:
                intervals[str(i['diatonic'])] += 1
            low, high = c['features']['minMidi'], c['features']['maxMidi']
            regions['low' if high < 48 else 'high' if low > 84 else 'middle-or-crossing'] += 1
            for m in c['matches']:
                if m['grade'] != grade:
                    continue
                profiles[m['profileId']] += 1
                for families in m['rhythms'].values():
                    rhythms.update(families)
                for w in m['handWitnesses'].values():
                    hands[w['hand']] += 1; templates[w['templateId']] += 1
        distinct = len({c['nearDuplicateGroupId'] for c in rows})
        motifs = len({c['motifGroupId'] for c in rows})
        row = {'grade': grade, 'rawCandidateWindows': raw['windows'], 'rawNearDuplicateGroups': raw['groups'],
               'nativeVerifiedFragments': len(rows), 'nativeNearDuplicateGroups': distinct,
               'sourceFiles': len({c['sourceId'] for c in rows}), 'verifiedWorkGroups': 0,
               'motifs': motifs, 'approvedPracticeFragments': 0, 'publicApproved': 0,
               'pilotShortfall': max(0, config['targets']['pilotPerGrade']-distinct),
               'fullShortfall': max(0, config['targets']['fullNearDuplicateGroups']-distinct),
               'reviewSampleShortfall': max(0, 30-len(rows)),
               'intervalDirections': dict(intervals), 'assignedPracticeHands': dict(hands),
               'rhythms': dict(rhythms), 'registers': dict(regions), 'targetCounts': dict(lengths),
               'profiles': dict(profiles), 'templates': dict(templates)}
        grades.append(row)
        missing_profiles = [p['id'] for p in config['profiles'] if p['grade'] == grade and not profiles[p['id']]]
        focus_intervals = {1:[2],2:[3],3:[4,5],4:[2,3,4,5],5:[2,3],6:[6,7,8],7:[2,3],8:[2,3,4,5]}[grade]
        gaps.append({'grade': grade, 'missingProfiles': missing_profiles,
                     'missingIntervalDirections':[i*sign for i in focus_intervals for sign in (1,-1) if not intervals[str(i*sign)]],
                     'missingHands': [h for h in ('left','right') if not hands[h]],
                     'missingRegisters': [r for r in ('low','middle-or-crossing','high') if not regions[r]],
                     'neededForPilot': row['pilotShortfall'], 'neededForFullDistinct': row['fullShortfall'],
                     'workIdentityReviewsNeeded': 50,
                     'nextSourceSearch': 'Simple original piano method/folk excerpts with explicit piano identity, matching the missing profile. Inspect actual notes; composer/title is not a grade.'})
    return {'schemaVersion': 1, 'stage': 'Q3', 'status': 'offline-candidate-pilot-review-pending',
            'pipeline': manifest['pipeline'], 'sourcesScanned': manifest['sourcesScanned'],
            'candidateWindows': manifest['candidateWindows'], 'nativeChecked': len(fragments)+len(blocked),
            'nativeVerified': len(fragments), 'nativeBlocked': len(blocked), 'enabledProfiles': 0,
            'publicApproved': 0, 'teacherReviewed': 0, 'grades': grades, 'gaps': gaps,
            'limitations': ['Not all Q1 sources normalized/scanned', 'Overlapping grade totals are not additive',
                           'Position matches are proposals, not original fingerings or ergonomic approval',
                           'Source files are not verified distinct works', 'All publication rights still gated']}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['scan', 'finalize'])
    p.add_argument('--corpus', type=Path, default=ROOT/'artifacts/curriculum-corpus')
    p.add_argument('--normalized', type=Path, default=ROOT/'artifacts/curriculum-normalized')
    p.add_argument('--output', type=Path, default=ROOT/'artifacts/curriculum-fragments')
    p.add_argument('--profiles', type=Path, default=ROOT/'scores/curriculum/grades.v1.json')
    p.add_argument('--report', type=Path, default=ROOT/'artifacts/q3-native/report.json')
    p.add_argument('--limit', type=int, default=0)
    p.add_argument('--per-grade', type=int, default=100)
    p.add_argument('--workers', type=int, choices=range(1,5), default=4)
    p.add_argument('--q2-max-notes', type=int, default=20000)
    p.add_argument('--q2-timeout', type=int, default=45)
    args = p.parse_args()
    if args.limit < 0 or args.per_grade < 1:
        p.error('limit >= 0 and per-grade > 0')
    config = json.loads(args.profiles.read_text(encoding='utf8'))
    pipeline = identity(config)
    args.output.mkdir(parents=True, exist_ok=True)
    with RunLock(args.output/'.run.lock'):
        sources = load_sources(args)  # Rehash original/Q2 inputs on every command.
        if args.command == 'finalize':
            finalize(args, config, pipeline, sources); return
        candidates, rejected_counts, scanned = [], Counter(), []
        rejected_path = args.output/'rejected.jsonl'
        with rejected_path.open('w', encoding='utf8', newline='\n') as rejection_file, \
                ProcessPoolExecutor(max_workers=args.workers,mp_context=mp.get_context('spawn')) as pool:
            results=pool.map(scan_job,((args,s,config,pipeline) for s in sources),chunksize=1)
            for i, (source,(result,cached)) in enumerate(zip(sources,results), 1):
                candidates.extend(result['candidates'])
                scanned.append({'id': source['id'], 'analysisSha256': source['analysisSha256'], 'origins': source['origins']})
                for row in result['rejected']:
                    rejection_file.write(encoded(row)+'\n')
                    for codes in row['rejections'].values():
                        rejected_counts.update(codes)
                print(f'Q3 {i}/{len(sources)} {source["id"][:12]} {len(result["candidates"])} candidates {"cached" if cached else "scanned"}', flush=True)
        group_candidates(candidates)
        selected = choose_pilot(candidates, config, args.per_grade)
        coverage = {}
        for grade in range(1, 9):
            cc = [c for c in candidates if any(m['grade'] == grade for m in c['matches'])]
            coverage[str(grade)] = {'windows': len(cc), 'groups': len({c['nearDuplicateGroupId'] for c in cc})}
        manifest = {'pipeline': pipeline, 'sourcesScanned': len(sources), 'sources': scanned,
                    'candidateWindows': len(candidates), 'candidateCoverage': coverage, 'selected': selected,
                    'rejectionCounts': dict(rejected_counts), 'perGradeRequested': args.per_grade}
        # Bind finalization to the canonical record, not a mutable unbound list.
        write_json(args.output/'scan.json', manifest)
        write_json(args.output/'grades.v1.json', config)
        write_json(args.output/'candidates.v1.json', {'pipeline': pipeline, 'candidates': candidates})
        entries, failures = prepare(args, {s['id']: s for s in sources}, selected, config, pipeline)
        print(encoded({'candidateCoverage': coverage, 'selected': len(selected), 'nativeJobs': len(entries), 'projectionRejected': len(failures)}))


if __name__ == '__main__':
    main()
