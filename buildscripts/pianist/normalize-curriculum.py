"""Q2 resumable local normalization, native-job export and verification receipts.

Q1 catalog is opened read-only. Nothing in this tool publishes a score or grade.
"""
from __future__ import annotations
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import gzip
import json
import multiprocessing as mp
from pathlib import Path
import re
import sqlite3
import time
import zlib

from curriculum_io import within, write_json, CorpusError, RunLock

ROOT = Path(__file__).resolve().parents[2]
VERIFIER_FILES = ['packages/exercise-generator/source-verification.ts',
                  'packages/practice-engine-v2/score-adapter.ts',
                  'packages/practice-engine-v2/reference-adapter-r4.ts',
                  'tests/browser/pianist/q2-lab.ts', 'tests/browser/pianist/q2-native.cjs']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def identity():
    files = ['buildscripts/pianist/curriculum_normalize.py',
             'buildscripts/pianist/curriculum_catalog.py', 'buildscripts/pianist/curriculum_io.py',
             'buildscripts/pianist/curriculum-normalize-win-py311.lock', 'scores/curriculum/sources.lock.json']
    return sha(json.dumps({name: sha((ROOT / name).read_bytes()) for name in files}, sort_keys=True).encode())


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


def child(connection, job, max_notes):
    try:
        from curriculum_normalize import normalize, encoded
        data = Path(job['absolute']).read_bytes()
        if sha(data) != job['sha']:
            raise CorpusError('source-checksum-mismatch')
        result = normalize(data, max_notes=max_notes)
        raw = encoded(result).encode()
        connection.send({'status': 'normalized', 'blob': zlib.compress(raw), 'analysis_sha': sha(raw),
                         'blockers': result['releaseBlockers'], 'error': None})
    except Exception as error:
        connection.send({'status': 'rejected', 'blob': None, 'analysis_sha': None,
                         'blockers': [str(error) if isinstance(error, CorpusError) else 'music21-parse-error'],
                         'error': f'{type(error).__name__}: {error}'[:1500]})
    finally:
        connection.close()


def run_one(job, timeout, max_notes):
    # A killed/hung importer cannot poison the next score or leave a giant
    # music21 object cache alive. Max four isolated processes on this machine.
    started = time.monotonic()
    ctx = mp.get_context('spawn')
    parent, worker = ctx.Pipe(duplex=False)
    process = ctx.Process(target=child, args=(worker, job, max_notes))
    process.start()
    worker.close()
    try:
        if parent.poll(timeout):
            try:
                result = parent.recv()
            except EOFError:
                result = {'status': 'rejected', 'blob': None, 'analysis_sha': None,
                          'blockers': ['normalizer-crashed'], 'error': 'Worker closed without a result'}
        else:
            result = {'status': 'rejected', 'blob': None, 'analysis_sha': None,
                      'blockers': ['normalizer-timeout'], 'error': f'exceeded {timeout} seconds'}
    finally:
        parent.close()
        process.join(1)
        if process.is_alive():
            process.terminate()
            process.join()
    return job, result, time.monotonic() - started


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['normalize', 'export-native', 'import-native', 'report'])
    p.add_argument('--corpus', type=Path, default=ROOT / 'artifacts/curriculum-corpus')
    p.add_argument('--output', type=Path, default=ROOT / 'artifacts/curriculum-normalized')
    p.add_argument('--limit', type=int, default=0, help='0 = all matching files; deterministic hash order')
    p.add_argument('--collection', default='', help='Substring of collection ID; empty = all')
    p.add_argument('--source-list', type=Path, help='JSON {sourceHashes:[sha256,...]} selected from the current Q1 queue')
    p.add_argument('--workers', type=int, choices=range(1,5), default=4)
    p.add_argument('--timeout', type=int, default=45)
    p.add_argument('--max-notes', type=int, default=20000)
    p.add_argument('--jobs', type=Path, default=ROOT / 'artifacts/q2-native/jobs.json')
    p.add_argument('--report', type=Path, default=ROOT / 'artifacts/q2-native/report.json')
    p.add_argument('--refresh-native', action='store_true', help='Export even current native receipts again')
    args = p.parse_args()
    if args.limit < 0 or args.timeout < 1 or args.max_notes < 1:
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
    if args.command == 'normalize':
        cached = set()
        for row in db.execute('SELECT source_sha,status,blob,analysis_sha FROM analyses WHERE pipeline=?', (pipeline,)):
            try:
                if row['status']=='rejected' or sha(zlib.decompress(row['blob']))==row['analysis_sha']:
                    cached.add(row['source_sha'])
            except (TypeError,zlib.error):
                pass  # Corrupt local result is rebuilt, never admitted on trust.
        todo = []
        for item in queue:
            path = within(args.corpus, item['path'])
            # Rehash input even on a cache hit; a stale catalog isn't proof.
            if sha(path.read_bytes()) != item['sha']:
                raise CorpusError('source-checksum-mismatch:' + item['sha'])
            if item['sha'] not in cached:
                todo.append({**item, 'absolute': str(path)})
        print(f'Q2: {len(queue)} selected, {len(queue)-len(todo)} cached, {len(todo)} to normalize', flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for i, (item, result, elapsed) in enumerate(pool.map(lambda j: run_one(j,args.timeout,args.max_notes), todo),1):
                db.execute('INSERT OR REPLACE INTO analyses VALUES(?,?,?,?,?,?,?,?)',
                    (item['sha'], pipeline, result['status'], result['blob'], result['analysis_sha'],
                     json.dumps(result['blockers']), result['error'], elapsed))
                db.commit()
                if i % 20 == 0 or i == len(todo):
                    print(f'Q2: {i}/{len(todo)} saved ({result["status"]})', flush=True)
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
    rows = db.execute('SELECT source_sha,status,blockers,elapsed FROM analyses WHERE pipeline=?', (pipeline,)).fetchall()
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
    print(json.dumps(report, ensure_ascii=True))
    db.close()


if __name__ == '__main__':
    main()
