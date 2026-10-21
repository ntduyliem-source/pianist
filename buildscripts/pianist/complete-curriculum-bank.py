"""Resume the remaining K stages and build an audited local MXL release.

Reuses the original grade, segmentation, projection and MuseScore checks. Every
command writes to its own supplemental output; the earlier bank is read-only.
"""
import argparse
from contextlib import closing
from pathlib import Path
import json
import sqlite3
import subprocess
import sys
import zlib

from curriculum_bank import ROOT, q2
from curriculum_io import CorpusError, RunLock, write_json
from curriculum_normalize import digest, encoded


def reopen_available(bank, normalized):
    """An unavailable checkpoint is not permanent when a parser result arrives."""
    if not (bank/'bank.sqlite').exists():
        return 0
    pipeline = digest(f'{q2.identity()}:20000:45'.encode())
    with closing(sqlite3.connect((normalized/'normalization.sqlite').as_uri()+'?mode=ro', uri=True)) as db:
        available = {s for s, in db.execute('SELECT source_sha FROM analyses WHERE pipeline=? AND status=?', (pipeline, 'normalized'))}
    changed = 0
    with closing(sqlite3.connect(bank/'bank.sqlite')) as db, db:
        rows = db.execute("SELECT sha,report FROM sources WHERE status='normalization-unavailable'").fetchall()
        for sha, previous in rows:
            if sha in available:
                db.execute('UPDATE sources SET status=?,report=? WHERE sha=?',
                           ('retry-needed', encoded({'reason': 'K1-analysis-now-available', 'previous': json.loads(previous)}), sha))
                changed += 1
    return changed


def pending_normalization(corpus, normalized, retry_rejected=False):
    """Known parser limits are recorded outcomes, not an infinite retry loop."""
    jobs = q2.jobs(corpus)
    if not (normalized/'normalization.sqlite').exists():
        return [j['sha'] for j in jobs]
    pipeline = digest(f'{q2.identity()}:20000:45'.encode())
    with closing(sqlite3.connect((normalized/'normalization.sqlite').as_uri()+'?mode=ro', uri=True)) as db:
        rows = {s: (status, blob, sha) for s, status, blob, sha in db.execute(
            'SELECT source_sha,status,blob,analysis_sha FROM analyses WHERE pipeline=?', (pipeline,))}
    pending = []
    for job in jobs:
        cached = rows.get(job['sha'])
        try:
            if not cached or cached[0] not in ('normalized', 'rejected'):
                raise ValueError('missing')
            if cached[0] == 'rejected':
                if retry_rejected:
                    raise ValueError('explicit retry')
            else:
                raw = zlib.decompress(cached[1])
                if digest(raw) != cached[2] or json.loads(raw)['sourceSha256'] != job['sha']:
                    raise ValueError('cache hash')
        except (ValueError, TypeError, KeyError, zlib.error):
            pending.append(job['sha'])
    return pending


def main(args):
    state = ROOT/'artifacts/curriculum-k-completion'
    state.mkdir(parents=True, exist_ok=True)
    supplemental = ROOT/'artifacts/curriculum-supplemental-sources'
    normalized = ROOT/'artifacts/curriculum-supplemental-normalized'
    bank = ROOT/'artifacts/curriculum-prepared/releases/reading-supplement-v1'
    stages = []

    def run(label, script, *options):
        command = [sys.executable, '-X', 'utf8', str(ROOT/'buildscripts/pianist'/script), *map(str, options)]
        print(label, flush=True)
        log = state/(label+'.log')
        write_json(state/'progress.json', {'stages': stages, 'running': True, 'currentStage': label})
        with log.open('w', encoding='utf8') as stream:
            result = subprocess.run(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        stages.append({'stage': label, 'exitCode': result.returncode, 'log': str(log), 'sha256': digest(log.read_bytes())})
        write_json(state/'progress.json', {'stages': stages, 'running': False, 'currentStage': None})
        if result.returncode:
            raise CorpusError(label+' failed; see '+str(log))

    run('K1-source-identities', 'prepare-supplemental-sources.py')
    pending = pending_normalization(supplemental, normalized, args.retry_parser_failures)
    if pending:
        write_json(state/'pending-normalization.json', {'sourceHashes': pending})
        options = ['--retry-rejected'] if args.retry_parser_failures else []
        run('K1-read-supplement', 'normalize-curriculum.py', 'normalize', '--corpus', supplemental,
            '--output', normalized, '--workers', args.workers, '--source-list', state/'pending-normalization.json', *options)
    else:
        print('K1: all current source outcomes cached; audit them without repeating failed imports.', flush=True)
    run('K1-cache-audit', 'normalize-curriculum.py', 'audit', '--corpus', supplemental, '--output', normalized)
    reopened = reopen_available(bank, normalized)
    print(f'Reopened {reopened} checkpoints with newly available analyses.', flush=True)
    run('K3-K4-export', 'prepare-reading-bank.py', '--corpus', supplemental, '--normalized', normalized,
        '--output', bank, '--workers', args.workers, '--timeout', 180)
    progress = json.loads((bank/'progress.json').read_text(encoding='utf8'))
    if progress['status'] == 'retry-needed':
        run('K3-K4-bounded-retry', 'prepare-reading-bank.py', '--corpus', supplemental, '--normalized', normalized,
            '--output', bank, '--workers', min(args.workers, 4), '--timeout', 360)
    run('K5-package', 'package-reading-bank.py')
    report = json.loads((ROOT/'artifacts/curriculum-bank/latest.json').read_text(encoding='utf8'))
    write_json(state/'result.json', {'stages': stages, 'releaseId': report['releaseId'],
               'packagingComplete': report['packagingComplete'], 'quotaComplete': report['quotaComplete']})
    print(json.dumps({'releaseId': report['releaseId'], 'exercises': report['coverage']['uniqueMxlFiles'],
                      'optionsAtMinimum': report['coverage']['optionsAtMinimum'], 'quotaComplete': report['quotaComplete']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, choices=range(1, 17), default=8)
    parser.add_argument('--retry-parser-failures', action='store_true',
                        help='Explicitly retry previously recorded importer limits/errors once')
    arguments = parser.parse_args()
    with RunLock(ROOT/'artifacts/curriculum-k-completion/.run.lock'):
        main(arguments)
