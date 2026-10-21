"""Compare recycled workers to historical native-linked analyses of real scores."""
import json
from pathlib import Path
import sqlite3
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'buildscripts/pianist'))
from curriculum_workers import results
from curriculum_io import write_json


def main():
    base=ROOT/'artifacts/curriculum-normalized'
    corpus=ROOT/'artifacts/curriculum-corpus'
    db=sqlite3.connect((base/'normalization.sqlite').as_uri()+'?mode=ro',uri=True)
    rows=db.execute('''SELECT DISTINCT a.source_sha,a.analysis_sha FROM analyses a JOIN native n
        ON a.source_sha=n.source_sha AND a.analysis_sha=n.analysis_sha
        WHERE a.status='normalized' ORDER BY a.source_sha LIMIT 12''').fetchall()
    cat=sqlite3.connect((corpus/'catalog.sqlite').as_uri()+'?mode=ro',uri=True)
    jobs=[];expected=dict(rows)
    for sha,_ in rows:
        path=cat.execute('SELECT MIN(mxl_path) FROM review_queue WHERE file_sha256=?',(sha,)).fetchone()[0]
        jobs.append({'sha':sha,'path':path,'corpus':str(corpus),'absolute':str(corpus/path)})
    db.close();cat.close()
    checks=[]
    for job,result,elapsed in results(jobs,3,45,20000,recycle=4):
        checks.append({'sourceSha256':job['sha'],'expectedAnalysisSha256':expected[job['sha']],
            'actualAnalysisSha256':result.get('analysis_sha'),'passed':result.get('analysis_sha')==expected[job['sha']],
            'elapsed':elapsed,'error':result.get('error')})
    report={'scope':'12 real scores with historical native-linked analysis hashes; unchanged parser, recycled workers',
            'passed':len(checks)==12 and all(x['passed'] for x in checks),'entries':checks}
    write_json(base/'k1-worker-parity.json',report)
    print(json.dumps({'passed':report['passed'],'scores':len(checks)}))
    if not report['passed']:raise RuntimeError('real-score worker parity failed')


if __name__=='__main__':main()
