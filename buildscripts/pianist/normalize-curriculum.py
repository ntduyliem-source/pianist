"""Q2 resumable local normalization, native-job export and verification receipts.

Q1 catalog is opened read-only. Nothing in this tool publishes a score or grade.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import gzip
import json
from pathlib import Path
import re
import sqlite3
import time
import zlib

from curriculum_io import within, relative_name, write_json, CorpusError, RunLock

ROOT = Path(__file__).resolve().parents[2]
PARSER_FILES = ['buildscripts/pianist/curriculum_normalize.py',
                'buildscripts/pianist/curriculum_catalog.py', 'buildscripts/pianist/curriculum_io.py',
                'buildscripts/pianist/curriculum-normalize-win-py311.lock']
VERIFIER_FILES = ['packages/exercise-generator/source-verification.ts',
                  'packages/practice-engine-v2/score-adapter.ts',
                  'packages/practice-engine-v2/reference-adapter-r4.ts',
                  'tests/browser/pianist/q2-lab.ts', 'tests/browser/pianist/q2-native.cjs']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def identity():
    # Collection membership, download locations and attribution do not parse
    # notes. Import limits DO affect parsing and must remain in this identity.
    limits = json.loads((ROOT/'scores/curriculum/sources.lock.json').read_text(encoding='utf8'))['limits']
    return sha(json.dumps({'cacheSchema': 2, 'limits': limits,
        'components': {name: sha((ROOT/name).read_bytes()) for name in PARSER_FILES}}, sort_keys=True).encode())


def migrate_cache(db, corpus, max_notes, timeout):
    """One audited migration; never bless an arbitrary stale parser result."""
    receipt = json.loads((ROOT/'scores/curriculum/parser-cache-migration.v2.json').read_text(encoding='utf8'))
    components = {name: sha((ROOT/name).read_bytes()) for name in PARSER_FILES}
    limits = json.loads((ROOT/'scores/curriculum/sources.lock.json').read_text(encoding='utf8'))['limits']
    if components != receipt['componentHashes'] or limits != receipt['limits']:
        raise CorpusError('migration-parser-changed-reparse-required')
    if (max_notes, timeout) != (receipt['maxNotes'], receipt['timeout']):
        raise CorpusError('migration-options-mismatch')
    old_parts = {**components, 'scores/curriculum/sources.lock.json': receipt['legacySourcesLockSha256']}
    old_identity = sha(json.dumps(old_parts, sort_keys=True).encode())
    if sha(f'{old_identity}:{max_notes}:{timeout}'.encode()) != receipt['legacyPipeline']:
        raise CorpusError('migration-receipt-unbound')
    queue = {r['sha']: r for r in jobs(corpus)}
    rows = db.execute('SELECT * FROM analyses WHERE pipeline=?', (receipt['legacyPipeline'],)).fetchall()
    pipeline = sha(f'{identity()}:{max_notes}:{timeout}'.encode())
    valid, corrupt = [], []
    for row in rows:
        item = queue.get(row['source_sha'])
        if item is None or sha(within(corpus, item['path']).read_bytes()) != row['source_sha']:
            raise CorpusError('migration-source-checksum-mismatch')
        try:
            if row['status'] == 'normalized':
                raw = zlib.decompress(row['blob'])
                if sha(raw) != row['analysis_sha'] or json.loads(raw)['sourceSha256'] != row['source_sha']:
                    raise ValueError('analysis binding')
            elif row['status'] != 'rejected':
                raise ValueError('unknown status')
            valid.append(row['source_sha'])
        except (ValueError, TypeError, KeyError, zlib.error):
            corrupt.append(row['source_sha'])
    # Validate the complete migration before making any changes. Native rows
    # still key on analysis hash + native/verifier build, and are not relabelled.
    with db:
        db.executemany('UPDATE analyses SET pipeline=? WHERE source_sha=? AND pipeline=?',
                       [(pipeline, s, receipt['legacyPipeline']) for s in valid])
    return {'from': receipt['legacyPipeline'], 'to': pipeline, 'migrated': len(valid),
            'corruptRequireReparse': corrupt}


def verifier_identity():
    return sha(json.dumps({name:sha((ROOT/name).read_bytes()) for name in VERIFIER_FILES},separators=(',',':')).encode())


def native_identity():
    manifest=ROOT/'build.artifacts/release.json'
    if not manifest.is_file():
        return None  # Normalization itself doesn't require a native build.
    release=json.loads(manifest.read_text(encoding='utf-8'))
    files={f['path']:f['sha256'] for f in release['files']}
    return sha(json.dumps({n:files[n] for n in ('MuseScoreStudio.js','MuseScoreStudio.wasm')},separators=(',',':')).encode())


def open_db(directory):
    directory.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(directory / 'normalization.sqlite')
    db.row_factory = sqlite3.Row
    db.executescript('''
      CREATE TABLE IF NOT EXISTS analyses (
        source_sha TEXT PRIMARY KEY, pipeline TEXT NOT NULL, status TEXT NOT NULL,
        blob BLOB, analysis_sha TEXT, blockers TEXT NOT NULL, error TEXT, elapsed REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS native (
        source_sha TEXT NOT NULL, analysis_sha TEXT NOT NULL, engine_build TEXT NOT NULL,
        report TEXT NOT NULL, PRIMARY KEY(source_sha,analysis_sha,engine_build));
    ''')
    return db


def jobs(corpus):
    db = sqlite3.connect((corpus / 'catalog.sqlite').resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    result = []
    # Keep all provenance in Q1. This independent queue deduplicates by bytes.
    for r in db.execute('''SELECT file_sha256 AS sha, MIN(mxl_path) AS path,
             GROUP_CONCAT(DISTINCT collection) AS collections
             FROM review_queue GROUP BY file_sha256 ORDER BY file_sha256'''):
        result.append(dict(r))
    db.close()
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['normalize', 'migrate-cache', 'export-native', 'import-native', 'report', 'audit'])
    p.add_argument('--corpus', type=Path, default=ROOT / 'artifacts/curriculum-corpus')
    p.add_argument('--output', type=Path, default=ROOT / 'artifacts/curriculum-normalized')
    p.add_argument('--limit', type=int, default=0, help='0 = all matching files; deterministic hash order')
    p.add_argument('--collection', default='', help='Substring of collection ID; empty = all')
    p.add_argument('--source-list', type=Path, help='JSON {sourceHashes:[sha256,...]} selected from the current Q1 queue')
    p.add_argument('--workers', type=int, choices=range(1,17), default=4)
    p.add_argument('--retry-rejected', action='store_true', help='Re-audit rejected rows; preserve previous outcomes in retry-audit.json')
    p.add_argument('--recycle', type=int, default=32, help='Restart each isolated importer after this many scores')
    p.add_argument('--timeout', type=int, default=45)
    p.add_argument('--max-notes', type=int, default=20000)
    p.add_argument('--jobs', type=Path, default=ROOT / 'artifacts/q2-native/jobs.json')
    p.add_argument('--report', type=Path, default=ROOT / 'artifacts/q2-native/report.json')
    p.add_argument('--refresh-native', action='store_true', help='Export even current native receipts again')
    args = p.parse_args()
    if args.limit < 0 or args.timeout < 1 or args.max_notes < 1 or args.recycle < 1:
        p.error('limit >= 0; timeout/max-notes > 0')
    with RunLock(args.output / '.run.lock'):
        execute(args)


def execute(args):
    pipeline = sha(f'{identity()}:{args.max_notes}:{args.timeout}'.encode())
    queue = [r for r in jobs(args.corpus) if args.collection in r['collections']]
    if args.source_list:
        selected=json.loads(args.source_list.read_text(encoding='utf-8'))['sourceHashes']
        if not selected or len(set(selected))!=len(selected) or any(not isinstance(s,str) or not re.fullmatch('[a-f0-9]{64}',s) for s in selected):
            raise CorpusError('invalid-source-list')
        if set(selected)-{r['sha'] for r in queue}:
            raise CorpusError('source-list-outside-review-queue')
        queue=[r for r in queue if r['sha'] in set(selected)]
    if args.limit:
        queue = queue[:args.limit]
    db = open_db(args.output)
    if args.command == 'migrate-cache':
        migration = migrate_cache(db, args.corpus, args.max_notes, args.timeout)
        write_json(args.output/'cache-migration.v2.json', migration)
        print(json.dumps(migration), flush=True)
    elif args.command == 'normalize':
        from curriculum_workers import results
        cached = set()
        retry_rows = []
        selected_shas={item['sha'] for item in queue}
        for row in db.execute('SELECT source_sha,status,blob,analysis_sha,blockers FROM analyses WHERE pipeline=?', (pipeline,)):
            if row['source_sha'] not in selected_shas:continue
            try:
                if row['status']=='rejected' and args.retry_rejected:
                    retry_rows.append(row['source_sha'])
                    continue
                if set(json.loads(row['blockers'])) & {'source-checksum-mismatch','source-io-error','normalizer-crashed','normalizer-timeout'}:
                    continue  # Infrastructure/input failures are never a reusable musical verdict.
                if row['status']=='rejected':
                    cached.add(row['source_sha'])
                elif row['status']=='normalized':
                    raw=zlib.decompress(row['blob'])
                    if sha(raw)==row['analysis_sha'] and json.loads(raw).get('sourceSha256')==row['source_sha']:
                        cached.add(row['source_sha'])
            except (ValueError,TypeError,zlib.error):
                pass  # Corrupt local result is rebuilt, never admitted on trust.
        todo = []
        for item in queue:
            if item['sha'] in cached:
                # Rehash reused results; fresh sources are validated inside
                # bounded workers instead of a serial whole-corpus preflight.
                if sha(within(args.corpus,item['path']).read_bytes()) != item['sha']:
                    raise CorpusError('source-checksum-mismatch:' + item['sha'])
            else:
                path=args.corpus.joinpath(*relative_name(item['path']).split('/'))
                todo.append({**item,'absolute':str(path),'corpus':str(args.corpus)})
        print(f'Q2: {len(queue)} selected, {len(queue)-len(todo)} cached, {len(todo)} to normalize', flush=True)
        retry_set=set(retry_rows)&{j['sha'] for j in todo}
        retry_audit = {r['source_sha']:dict(r) for r in db.execute(
            'SELECT source_sha,status,blockers,error,elapsed FROM analyses WHERE pipeline=?', (pipeline,)) if r['source_sha'] in retry_set}
        if retry_audit:
            write_json(args.output/'retry-audit.json', {'pipeline':pipeline,'before':retry_audit,'after':{}})
        retried = {}
        started = time.monotonic()
        stride=min(100,max(1,len(todo)//10))
        write_json(args.output/'progress.json', {'at':datetime.now(timezone.utc).isoformat(),
            'pipeline':pipeline,'selected':len(queue),'cached':len(queue)-len(todo),
            'savedThisRun':0,'remainingThisRun':len(todo),'elapsedSeconds':0,
            'workers':args.workers,'recycle':args.recycle})
        for i, (item, result, elapsed) in enumerate(results(todo,args.workers,args.timeout,args.max_notes,args.recycle),1):
            db.execute('INSERT OR REPLACE INTO analyses VALUES(?,?,?,?,?,?,?,?)',
                (item['sha'], pipeline, result['status'], result['blob'], result['analysis_sha'],
                 json.dumps(result['blockers']), result['error'], elapsed))
            db.commit()
            if item['sha'] in retry_audit:
                retried[item['sha']]={k:result[k] for k in ('status','blockers','error')}
                write_json(args.output/'retry-audit.json', {'pipeline':pipeline,'before':retry_audit,'after':retried})
            if i % stride == 0 or i == len(todo):
                print(f'Q2: {i}/{len(todo)} saved ({result["status"]})', flush=True)
                write_json(args.output/'progress.json', {'at':datetime.now(timezone.utc).isoformat(),
                    'pipeline':pipeline,'selected':len(queue),'cached':len(queue)-len(todo),
                    'savedThisRun':i,'remainingThisRun':len(todo)-i,'elapsedSeconds':round(time.monotonic()-started,2),
                    'workers':args.workers,'recycle':args.recycle})
    elif args.command == 'export-native':
        from curriculum_normalize import piano_xml
        out = args.jobs.parent
        out.mkdir(parents=True, exist_ok=True)
        exported = []
        native_cached = 0
        native_key=(native_identity() or 'unavailable')+':'+verifier_identity()
        for item in queue:
            row = db.execute('SELECT * FROM analyses WHERE source_sha=? AND pipeline=? AND status=?',
                             (item['sha'], pipeline, 'normalized')).fetchone()
            if not row:
                continue
            raw = zlib.decompress(row['blob'])
            if sha(raw) != row['analysis_sha']:
                raise CorpusError('analysis-checksum-mismatch')
            analysis = json.loads(raw)
            data = within(args.corpus,item['path']).read_bytes()
            if sha(data) != item['sha']:
                raise CorpusError('source-checksum-mismatch')
            xml, _ = piano_xml(data)
            if sha(xml) != analysis['pianoXmlSha256']:
                raise CorpusError('piano-projection-checksum-mismatch')
            if not args.refresh_native and db.execute('SELECT 1 FROM native WHERE source_sha=? AND analysis_sha=? AND engine_build=?',
                    (item['sha'],row['analysis_sha'],native_key)).fetchone():
                native_cached += 1
                continue
            name = item['sha']
            xml_path, json_path = out / (name+'.musicxml'), out / (name+'.json')
            xml_path.write_bytes(xml)
            json_path.write_bytes(raw)
            exported.append({'id': name, 'xml': str(xml_path.resolve()), 'analysis': str(json_path.resolve()),
                             'analysisSha256': row['analysis_sha'], 'source': item})
        write_json(args.jobs, {'pipeline': pipeline, 'nativeCached':native_cached, 'entries': exported})
        print(f'Exported {len(exported)} native comparison jobs ({native_cached} cached) to {args.jobs}')
    elif args.command == 'import-native':
        report = json.loads(args.report.read_text(encoding='utf-8'))
        if set(report.get('verifierHashes',{})) != set(VERIFIER_FILES) or any(sha((ROOT / name).read_bytes()) != value
                for name,value in report['verifierHashes'].items()):
            raise CorpusError('native-receipt-stale-verifier')
        if not native_identity() or report.get('verifierBuild') != verifier_identity() or report.get('engineBuild') != native_identity():
            raise CorpusError('native-receipt-stale-engine')
        if report.get('pipeline') != pipeline:
            raise CorpusError('native-receipt-stale-pipeline')
        for item in report['entries']:
            row = db.execute('SELECT analysis_sha,blob FROM analyses WHERE source_sha=? AND pipeline=?', (item['id'], pipeline)).fetchone()
            if row is None or row['analysis_sha'] != item['analysisSha256']:
                raise CorpusError('native-receipt-stale-analysis')
            raw = zlib.decompress(row['blob'])
            if sha(raw)!=row['analysis_sha'] or item.get('pianoXmlSha256') != json.loads(raw)['pianoXmlSha256']:
                raise CorpusError('native-receipt-input-mismatch')
            if not report.get('engineBuild') or not item.get('inputHashVerified'):
                raise CorpusError('native-receipt-unbound')
            if item.get('snapshotSha256'):
                snapshot=gzip.decompress((args.report.parent/'snapshots'/(item['id']+'.json.gz')).read_bytes())
                if sha(snapshot)!=item['snapshotSha256']:
                    raise CorpusError('native-snapshot-checksum-mismatch')
            elif item.get('verification',{}).get('passed'):
                raise CorpusError('native-receipt-missing-snapshot')
            db.execute('INSERT OR REPLACE INTO native VALUES(?,?,?,?)',
                       (item['id'],row['analysis_sha'],report['engineBuild']+':'+report['verifierBuild'],json.dumps(item)))
        db.commit()
    catalog_jobs = {r['sha']:r for r in jobs(args.corpus)}
    rows = [r for r in db.execute('SELECT source_sha,status,blockers,error,elapsed FROM analyses WHERE pipeline=?', (pipeline,))
            if r['source_sha'] in catalog_jobs]
    audit_failures=[]
    if args.command=='audit':
        checked=0;logical=hashlib.sha256()
        for row in db.execute('SELECT * FROM analyses WHERE pipeline=? ORDER BY source_sha',(pipeline,)):
            if row['source_sha'] not in catalog_jobs:continue
            try:
                codes=json.loads(row['blockers'])
                if not isinstance(codes,list) or not all(isinstance(c,str) for c in codes):raise ValueError('invalid reason codes')
                if row['status']=='normalized':
                    raw=zlib.decompress(row['blob']);data=json.loads(raw)
                    if sha(raw)!=row['analysis_sha'] or data.get('sourceSha256')!=row['source_sha']:
                        raise ValueError('analysis hash/source binding')
                elif row['status']!='rejected' or not codes or not row['error']:
                    raise ValueError('missing source outcome')
                logical.update(json.dumps([row['source_sha'],row['status'],row['analysis_sha'],codes],separators=(',',':')).encode())
                checked+=1
            except (ValueError,TypeError,zlib.error) as error:
                audit_failures.append({'sourceSha256':row['source_sha'],'error':str(error)})
        write_json(args.output/'cache-audit.json',{'pipeline':pipeline,'scope':'Current catalog coverage + cached payload hashes/source bindings; not native/grade approval',
            'catalogFiles':len(catalog_jobs),'checked':checked,'missing':sorted(set(catalog_jobs)-{r['source_sha'] for r in rows}),
            'failures':audit_failures,'logicalSha256':logical.hexdigest(),
            'passed':not audit_failures and checked==len(catalog_jobs)})
    counts = Counter(code for r in rows for code in json.loads(r['blockers']))
    current_native=(native_identity() or 'unavailable')+':'+verifier_identity()
    receipts = [json.loads(r[0]) for r in db.execute('''SELECT n.report FROM native n JOIN analyses a
      ON a.source_sha=n.source_sha AND a.analysis_sha=n.analysis_sha WHERE a.pipeline=? AND n.engine_build=?''', (pipeline,current_native))]
    total_files=len(jobs(args.corpus))
    report = {'at': datetime.now(timezone.utc).isoformat(), 'pipeline': pipeline,
              'catalogFiles': total_files, 'processedFiles': len(rows), 'remainingFiles': total_files-len(rows),
              'allCatalogFilesProcessed': len(rows)==total_files,
              'normalized': sum(r['status']=='normalized' for r in rows),
              'parseRejected': sum(r['status']=='rejected' for r in rows),
              'withoutParserBlockers': sum(r['status']=='normalized' and r['blockers']=='[]' for r in rows),
              'rejectionCounts': dict(sorted(counts.items())),
              'nativeReceipts': len(receipts), 'nativePassed': sum(r.get('verification',{}).get('passed',False) for r in receipts),
              'fragmentReviewEligible': sum(r.get('verification',{}).get('eligibleForFragmentReview',False) for r in receipts),
              'publicApproved': 0, 'gradeAccepted': 0}
    write_json(args.output / 'report.json',report)
    # One deterministic row per current source; pending is explicit too. Musical
    # blockers are not file corruption, and absence of a piano name is reviewable.
    by_sha = {r['source_sha']:r for r in rows}
    outcomes = args.output/'source-outcomes.jsonl'
    temp = outcomes.with_suffix('.jsonl.tmp')
    with temp.open('w',encoding='utf8') as stream:
        for source, job in sorted(catalog_jobs.items()):
            row = by_sha.get(source)
            codes = json.loads(row['blockers']) if row else []
            status = 'pending' if row is None else 'read' if row['status']=='normalized' else (
                'needs-instrument-review' if 'piano-not-explicit' in codes else
                'invalid-file' if 'source-checksum-mismatch' in codes else 'unsupported-or-parse-error')
            stream.write(json.dumps({'sourceSha256':source,'path':job['path'],'collections':job['collections'],
                'pipeline':pipeline,'status':status,'reasonCodes':codes,'error':row['error'] if row else None},ensure_ascii=False)+'\n')
    temp.replace(outcomes)
    print(json.dumps(report, ensure_ascii=True))
    db.close()
    if audit_failures or (args.command=='audit' and len(rows)!=len(catalog_jobs)):
        raise CorpusError('normalization-cache-audit-failed: see cache-audit.json')
    if args.command=='normalize' and any('source-checksum-mismatch' in json.loads(r['blockers']) for r in rows):
        raise CorpusError('source-checksum-mismatch: see source-outcomes.jsonl; other sources were checkpointed')


if __name__ == '__main__':
    main()
