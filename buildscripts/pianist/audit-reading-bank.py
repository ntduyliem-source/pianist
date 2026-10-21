"""Read-only inventory audit of a committed SQLite snapshot of verified MXL.

May run during extraction: only committed entries are audited; in-flight files
are not counted. Does not rerun or replace source/native musical validation.
"""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
import sqlite3

from curriculum_bank import ROOT,BUCKET_IDS,LENGTHS,identity
from curriculum_io import CorpusError,within,write_json
from curriculum_normalize import digest,source_tree
from curriculum_prepared import length_bucket


def audit(directory):
    directory=directory.resolve()
    with closing(sqlite3.connect((directory/'bank.sqlite').as_uri()+'?mode=ro',uri=True)) as db:
        db.execute('BEGIN')
        pipeline=db.execute("SELECT value FROM metadata WHERE key='pipeline'").fetchone()[0]
        rows=db.execute('SELECT id,mxl_sha,entry FROM exercises ORDER BY id').fetchall()
        memberships=db.execute('SELECT grade,id,bucket FROM memberships').fetchall()
        sources=db.execute('SELECT status,COUNT(*) FROM sources GROUP BY status').fetchall()
        db.commit()
    errors=[];by_option={g:{b:0 for b in BUCKET_IDS} for g in range(1,9)}
    if pipeline!=identity():errors.append('bank-code-or-rules-changed')
    release=json.loads((ROOT/'build.artifacts/release.json').read_text(encoding='utf8'))
    names=('MuseScoreStudio.js','MuseScoreStudio.wasm','renderer/PianistRenderer.mjs','renderer/PianistRenderer.wasm')
    engines={n:next(f['sha256'] for f in release['files'] if f['path']==n) for n in names}
    for name,expected in engines.items():
        if digest((ROOT/'build.artifacts'/name).read_bytes())!=expected:errors.append('native-build-changed:'+name)
    expected_memberships=set();motifs=set();total_bytes=0
    for id_,mxl_sha,raw in rows:
        try:
            entry=json.loads(raw)
            if id_!=entry['id'] or entry['path']!='exercises/'+id_+'.mxl':raise CorpusError('entry-identity')
            blob=within(directory,entry['path']).read_bytes()
            if digest(blob)!=mxl_sha or mxl_sha!=entry['sha256'] or len(blob)!=entry['bytes']:
                raise CorpusError('mxl-file-hash')
            tree=source_tree(blob)
            if tree.tag!='score-partwise':raise CorpusError('mxl-root')
            proof_bytes=within(directory,entry['proof']).read_bytes()
            if digest(proof_bytes)!=entry['proofSha256']:raise CorpusError('proof-file-hash')
            proof=json.loads(gzip.decompress(proof_bytes));native=proof['native']
            if proof['id']!=id_ or proof['mxlSha256']!=mxl_sha or native['mxlSha256']!=mxl_sha:
                raise CorpusError('proof-mxl-binding')
            if proof['analysisSha256']!=native['analysisSha256'] or native['engines']!=engines:
                raise CorpusError('native-analysis-or-engine-binding')
            v=native['verification'];render=native['render'];count=entry['targetCount']
            if not native['passed'] or not v['eligibleForFragmentReview'] or v['releaseBlockers']:
                raise CorpusError('native-did-not-pass')
            if not render['glyphsComplete'] or not render['editorUnchanged'] or render['sourceHash']!=mxl_sha:
                raise CorpusError('render-did-not-pass')
            if {count,proof['sourceAttackCount'],v['counts']['targets'],render['counts']['targets']}!={count}:
                raise CorpusError('native-count-disagreement')
            bucket=length_bucket(count,LENGTHS)
            if bucket!=entry['lengthBucket']:raise CorpusError('wrong-length-option')
            if not proof['projection']['passed'] or proof['projection']['rejectionCodes']:
                raise CorpusError('source-projection-did-not-pass')
            if proof['fingeringGenerated'] or any(p['fingeringGenerated'] for p in proof['profiles']):
                raise CorpusError('fingers-generated')
            if any(p['status']!='pass' or any(c['status']!='pass' for c in p['checks']) for p in proof['profiles']):
                raise CorpusError('grade-check-did-not-pass')
            if set(entry['grades'])!={p['grade'] for p in proof['profiles']}:
                raise CorpusError('grade-membership-disagreement')
            for grade in entry['grades']:
                expected_memberships.add((grade,id_,bucket));by_option[grade][bucket]+=1
            motifs.add(entry['motifGroupId']);total_bytes+=len(blob)
        except Exception as error:errors.append(id_+': '+str(error))
    if len(memberships)!=len(set(memberships)) or set(memberships)!=expected_memberships:
        errors.append('database-option-count-disagreement')
    return {'at':datetime.now(timezone.utc).isoformat(),'pipeline':pipeline,
            'auditScriptSha256':digest(Path(__file__).read_bytes()),'snapshotEntries':len(rows),
            'verifiedUniqueByOption':by_option,'verifiedUniqueByGrade':{g:sum(v.values()) for g,v in by_option.items()},
            'distinctMotifGroups':len(motifs),'mxlBytes':total_bytes,'sourceOutcomes':dict(sources),
            'passed':not errors,'errors':errors,
            'scope':'Read-only snapshot of committed files, proof hashes, actual native engines and 56-option accounting. Source/native musical verification is checked through its bound receipts, not rerun.'}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bank',type=Path,default=ROOT/'artifacts/curriculum-prepared/releases/reading-options-v1')
    p.add_argument('--report',type=Path,default=ROOT/'artifacts/reading-bank-audit.json')
    args=p.parse_args();report=audit(args.bank);write_json(args.report,report)
    print(json.dumps({k:report[k] for k in ('snapshotEntries','mxlBytes','passed','errors')},ensure_ascii=False))
    raise SystemExit(0 if report['passed'] else 1)
