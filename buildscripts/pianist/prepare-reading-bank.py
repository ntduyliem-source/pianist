"""Export/verify MXL as sources finish; stop at 300 per grade x length or EOF."""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
import queue
import shutil
import sqlite3
import subprocess
import threading
import time

from curriculum_bank import (ROOT,q2,identity,bank_db,counts,option_counts,target_met,missing_options,accept,atomic_bytes)
from curriculum_prepared import length_bucket
from curriculum_io import CorpusError,RunLock,write_json
from curriculum_normalize import digest,encoded
from curriculum_workers import results


class Native:
    def __init__(self,out):
        self.log=(out/'native.log').open('a',encoding='utf8')
        node=shutil.which('node') or r'C:\Program Files\nodejs\node.exe'
        self.process=subprocess.Popen([node,str(ROOT/'tests/browser/pianist/reading-bank-native.cjs')],
            cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,text=True,encoding='utf8',
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        self.queue=queue.Queue()
        def read():
            for line in self.process.stdout:
                try:self.queue.put(json.loads(line))
                except ValueError:self.queue.put({'fatal':'non-json-native-output:'+line[:200]})
            self.queue.put({'fatal':'native-process-closed'})
        threading.Thread(target=read,daemon=True).start()
        ready=self.receive(240)
        if not ready.get('ready'):raise CorpusError('native-boot:'+encoded(ready))
        self.engines=ready['engines']

    def receive(self,timeout):
        try:row=self.queue.get(timeout=timeout)
        except queue.Empty:raise CorpusError('native-process-timeout')
        if 'fatal' in row:raise CorpusError(row['fatal'])
        return row

    def inspect(self,row):
        self.process.stdin.write(encoded(row)+'\n');self.process.stdin.flush()
        result=self.receive(90)
        if result.get('id')!=row['id']:raise CorpusError('native-response-id')
        return result

    def close(self):
        try:
            if self.process.poll() is None:
                self.process.stdin.write('{"close":true}\n');self.process.stdin.flush()
                self.process.wait(timeout=20)
        except (subprocess.TimeoutExpired,BrokenPipeError):
            self.log.write('Native shutdown timeout; closing this oracle process.\n')
        finally:
            if self.process.poll() is None:self.process.kill()
            self.log.close()


def checkpoint(db,out,pipeline,target,total,status,elapsed):
    entries=[json.loads(r[0]) for r in db.execute('SELECT entry FROM exercises ORDER BY id')]
    by_grade=counts(db);by_option=option_counts(db)
    by_status=dict(db.execute('SELECT status,COUNT(*) FROM sources GROUP BY status'))
    report={'at':datetime.now(timezone.utc).isoformat(),'pipeline':pipeline,'status':status,
            'minimumPerOption':target,'quotaDimensions':['grade','lengthBucket'],
            'targetMet':target_met(by_option,target),
            'verifiedUniqueByOption':by_option,
            'optionsAtMinimum':sum(n>=target for row in by_option.values() for n in row.values()),'optionCount':56,
            'verifiedUniqueByGrade':by_grade,'uniqueMxlFiles':len(entries),
            'distinctMotifGroups':len({e['motifGroupId'] for e in entries}),
            'sourceQueueTotal':total,'sourcesProcessed':sum(by_status.values()),
            'normalizedSourcesProcessed':by_status.get('complete',0),'sourceOutcomes':by_status,
            'remainingByOption':{g:{b:max(0,target-n) for b,n in row.items()} for g,row in by_option.items()},
            'elapsedSecondsThisRun':round(elapsed,1),'fingeringGenerated':False,'visibility':'local-only'}
    write_json(out/'catalog.json',{'schemaVersion':1,'type':'offline-reading-bank',
        'pipeline':pipeline,'entries':entries,'requiresAppIntegration':True})
    write_json(out/'progress.json',report)
    print(encoded({k:report[k] for k in ('status','normalizedSourcesProcessed','sourceQueueTotal','optionsAtMinimum','verifiedUniqueByGrade','uniqueMxlFiles')}),flush=True)
    return report


def run(args):
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    pipeline=identity();started=time.monotonic();native=None
    buckets=json.loads((ROOT/'scores/curriculum/length-buckets.v2.json').read_text())
    normal_pipeline=digest(f'{q2.identity()}:20000:45'.encode())
    source_jobs=q2.jobs(args.corpus.resolve())
    # Teaching titles first is scheduling only, never a grade predicate.
    with closing(sqlite3.connect((args.corpus.resolve()/'catalog.sqlite').as_uri()+'?mode=ro',uri=True)) as catalog:
        catalog.row_factory=sqlite3.Row
        origins={}
        for r in catalog.execute('SELECT * FROM origins ORDER BY id'):
            origins.setdefault(r['file_sha256'],[]).append(dict(r))
    priority=('czerny','beginner','easy','beyer','primer','five finger','five-finger','mary had','frère','frere','exercise','etude','étude')
    source_jobs.sort(key=lambda j:(not any(w in ' '.join(str(o.get('title','')) for o in origins.get(j['sha'],[])).lower() for w in priority),j['sha']))
    with closing(sqlite3.connect((args.normalized.resolve()/'normalization.sqlite').as_uri()+'?mode=ro',uri=True)) as normalized:
        available={r[0] for r in normalized.execute('SELECT source_sha FROM analyses WHERE pipeline=? AND status=?',(normal_pipeline,'normalized'))}
    with closing(bank_db(out/'bank.sqlite',pipeline)) as db:
        # Audit deliverables before trusting any resumed counts.
        for id_,sha,entry in db.execute('SELECT * FROM exercises'):
            value=json.loads(entry);path=out/value['path']
            if not path.is_file() or digest(path.read_bytes())!=sha:raise CorpusError('resume-output-missing-or-changed:'+id_)
            proof=out/value['proof']
            if not proof.is_file() or digest(proof.read_bytes())!=value['proofSha256']:
                raise CorpusError('resume-proof-missing-or-changed:'+id_)
            receipt=json.loads(gzip.decompress(proof.read_bytes()))
            if receipt['mxlSha256']!=sha or not receipt['native']['passed']:
                raise CorpusError('resume-proof-binding:'+id_)
            if set(value['grades'])!={r[0] for r in db.execute('SELECT grade FROM memberships WHERE id=?',(id_,))}:
                raise CorpusError('resume-membership-mismatch:'+id_)
        done={r[0] for r in db.execute("SELECT sha FROM sources WHERE status IN ('complete','normalization-unavailable')")}
        # Record all pre-existing K1 unavailable outcomes once, no reparsing loop.
        with db:
            for job in source_jobs:
                if job['sha'] not in available and job['sha'] not in done:
                    db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?)',
                               (job['sha'],'normalization-unavailable',encoded({'reason':'no-current-K1-analysis'})))
                    done.add(job['sha'])
        pending=[j for j in source_jobs if j['sha'] not in done and j['sha'] in available]
        if args.limit:pending=pending[:args.limit]
        attempted=0;last=0;status='running'
        try:
            def jobs():
                for job in pending:
                    current=option_counts(db)
                    if target_met(current,args.target):return
                    if (out/'STOP_AFTER_SOURCE').exists():return
                    options=missing_options(current,args.target)
                    yield {**job,'corpus':str(args.corpus.resolve()),'normalized':str(args.normalized.resolve()),
                        'normalizationPipeline':normal_pipeline,'pipeline':pipeline,'out':str(out),
                        'activeGrades':[int(g) for g,buckets in options.items() if buckets], 'activeOptions':options}
            stream=results(jobs(),args.workers,args.timeout,20000,recycle=32,handler='curriculum_bank:source_job')
            try:
                for job,result,elapsed in stream:
                    attempted+=1
                    if result.get('status')!='extracted':
                        with db:db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?)',(job['sha'],'retry-needed',encoded(result)))
                    else:
                        payload=result['payload'];tally=Counter();active=missing_options(option_counts(db),args.target)
                        # Keep the entire source's matches, including option overflow.
                        for row in payload['candidates']:
                            bucket=length_bucket(row['sourceAttackCount'],buckets)
                            if not any(bucket in active[str(g)] for g in row['grades']):
                                tally['alreadyFilledOption']+=1;continue
                            existing=db.execute('SELECT entry FROM exercises WHERE id=?',(row['id'],)).fetchone()
                            if existing:
                                previous=json.loads(existing[0])
                                if not set(row['grades'])<=set(previous['grades']):raise CorpusError('duplicate-has-new-grade-requires-review')
                                with db:db.execute('INSERT OR IGNORE INTO origins VALUES(?,?,?)',
                                    (row['id'],job['sha'],encoded(row['selection'])))
                                tally['exactDuplicates']+=1;continue
                            receipt=out/'native-receipts'/(row['id']+'-'+row['mxlSha256']+'.json')
                            if receipt.exists():verified=json.loads(receipt.read_text(encoding='utf8'))
                            else:
                                if native is None:
                                    print('Booting persistent MuseScore verification for MXL exports...',flush=True)
                                    native=Native(out)
                                verified=native.inspect(row)
                                if verified.get('error'):raise CorpusError('native-oracle-error:'+verified['error'][:1200])
                                write_json(receipt,verified)
                            if accept(db,out,row,verified,origins.get(job['sha'],[]),buckets):tally['accepted']+=1
                            else:tally['nativeRejected']+=1
                            if time.monotonic()-last>=15:
                                checkpoint(db,out,pipeline,args.target,len(source_jobs),'running',time.monotonic()-started);last=time.monotonic()
                        with db:db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?)',
                            (job['sha'],'complete',encoded({'scanKey':payload['key'],'scanStats':payload['stats'],'exports':dict(tally),'elapsed':elapsed})))
                    if target_met(option_counts(db),args.target):status='target-reached';break
                    if (out/'STOP_AFTER_SOURCE').exists():status='operator-checkpoint';break
                    if time.monotonic()-last>=15:
                        checkpoint(db,out,pipeline,args.target,len(source_jobs),'running',time.monotonic()-started);last=time.monotonic()
            finally:stream.close()
            if target_met(option_counts(db),args.target):status='target-reached'
            elif (out/'STOP_AFTER_SOURCE').exists():status='operator-checkpoint'
            if status not in ('target-reached','operator-checkpoint'):
                retry=db.execute("SELECT COUNT(*) FROM sources WHERE status='retry-needed'").fetchone()[0]
                status='retry-needed' if retry else 'batch-limit' if args.limit and attempted>=args.limit else 'source-queue-exhausted'
        except KeyboardInterrupt:
            status='interrupted';raise
        except Exception:
            status='error';raise
        finally:
            try:
                if native:native.close()
            finally:checkpoint(db,out,pipeline,args.target,len(source_jobs),status,time.monotonic()-started)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corpus',type=Path,default=ROOT/'artifacts/curriculum-corpus')
    p.add_argument('--normalized',type=Path,default=ROOT/'artifacts/curriculum-normalized')
    p.add_argument('--output',type=Path,default=ROOT/'artifacts/curriculum-prepared/releases/reading-options-v1')
    p.add_argument('--min-per-option','--target',dest='target',type=int,default=300)
    p.add_argument('--workers',type=int,default=4,choices=range(1,17))
    p.add_argument('--timeout',type=int,default=120)
    p.add_argument('--limit',type=int,default=0,help='Explicit smoke batch only; 0 scans until quota or finite queue end.')
    args=p.parse_args()
    if args.target<1 or args.limit<0 or args.timeout<1:p.error('invalid-positive-limit')
    args.output.mkdir(parents=True,exist_ok=True)
    with RunLock(args.output/'.bank.lock'):run(args)
