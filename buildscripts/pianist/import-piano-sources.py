"""Add an explicit inbox of two-staff piano MXL to the existing source catalog.

Input files are read-only. User-removed hashes cannot be reimported. New scores
remain personal/local until their attribution and publication rights are reviewed.
"""
import argparse
from collections import Counter
from contextlib import closing
from pathlib import Path
import json

from curriculum_bank import ROOT
from curriculum_catalog import open_catalog, blob, register_file, base_origin, save_origin, inspect_mxl
from curriculum_io import CorpusError, RunLock, write_json
from curriculum_normalize import digest, LIMITS
from curriculum_source_adapter import adapt


def ingest(inbox, corpus):
    inbox, corpus = inbox.resolve(), corpus.resolve()
    if not inbox.is_dir():
        raise CorpusError('source-inbox-not-a-directory')
    if inbox == corpus or corpus in inbox.parents or inbox in corpus.parents:
        raise CorpusError('source-inbox-must-be-separate-from-corpus')
    records = []; checked = set()
    with closing(open_catalog(corpus/'catalog.sqlite')) as db:
        excluded = set()
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_removed_sources'").fetchone():
            excluded = {r[0] for r in db.execute('SELECT sha256 FROM user_removed_sources')}
        for path in sorted(inbox.glob('*.mxl')):
            if path.is_symlink() or not path.resolve().is_relative_to(inbox):
                raise CorpusError('source-inbox-link-outside-root')
            data = path.read_bytes(); sha = digest(data)
            record = {'filename': path.name, 'sourceSha256': sha}
            if sha in excluded:
                records.append({**record, 'status': 'excluded-by-user'})
                continue
            try:
                inspect_mxl(data, LIMITS)
                _, evidence = adapt(data)
            except Exception as error:
                records.append({**record, 'status': 'not-admitted', 'reason': str(error)[:500]})
                continue
            existed = db.execute('SELECT 1 FROM files WHERE sha256=?', (sha,)).fetchone() is not None
            item = blob(corpus, data, 'mxl')
            info = register_file(db, corpus, item, LIMITS, checked)
            if info['container_status'] != 'valid':
                records.append({**record, 'status': 'invalid-container', 'reason': info['error']})
                continue
            row = base_origin('personal-added-piano', 'local-inbox-v1', sha,
                title=path.stem, visibility='personal', file_sha256=sha,
                download_status='local-file', extraction_status='stored',
                csv_json=json.dumps({'inputFilename': path.name, 'pianoIdentity': evidence['kind']}))
            save_origin(db, row); db.commit()
            records.append({**record, 'status': 'reused' if existed else 'added'})
    report = {'scope': 'local two-staff piano sources only; no exercises or user files modified',
              'inbox': str(inbox), 'outcomes': dict(Counter(r['status'] for r in records)), 'records': records}
    write_json(corpus/'inbox-import.json', report)
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inbox', type=Path, required=True)
    p.add_argument('--corpus', type=Path, default=ROOT/'artifacts/curriculum-corpus')
    args = p.parse_args()
    with RunLock(args.corpus/'.run.lock'):
        report = ingest(args.inbox, args.corpus)
    print(json.dumps(report['outcomes']))
