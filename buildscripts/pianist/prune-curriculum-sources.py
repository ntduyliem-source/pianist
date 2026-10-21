"""Plan/apply the user's deletion of single-staff/non-piano source MXL."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import hashlib
import json
import sqlite3
import zipfile

from defusedxml import ElementTree as SafeET
from curriculum_io import CorpusError, RunLock, within, write_json
from curriculum_source_cleanup import (ROOT, classify, instrument_names,
    checked_target, delete_checked, tombstone_sources)


def sha(data): return hashlib.sha256(data).hexdigest()


def read_tree(data):
    with zipfile.ZipFile(BytesIO(data)) as archive:
        container=SafeET.fromstring(archive.read('META-INF/container.xml'),forbid_entities=True,forbid_external=True)
        roots=[e.get('full-path') for e in container.iter() if e.tag.rsplit('}',1)[-1]=='rootfile']
        if not roots: raise CorpusError('cleanup-no-rootfile')
        info=archive.getinfo(roots[0])
        # One known source is 36 MB of XML, above the normalizer's 32 MB limit.
        # This bounded read only counts staff/instrument declarations, not notes.
        if info.file_size>64*1024*1024: raise CorpusError('cleanup-xml-size-limit')
        tree=SafeET.fromstring(archive.read(info),forbid_entities=True,forbid_external=True)
    for e in tree.iter(): e.tag=e.tag.rsplit('}',1)[-1]
    if tree.tag!='score-partwise': raise CorpusError('cleanup-unsupported-root')
    return tree


def inspect(job,corpus):
    path=checked_target(corpus,job['path']);data=path.read_bytes()
    if sha(data)!=job['sha']:raise CorpusError('cleanup-source-changed:'+job['sha'])
    tree=read_tree(data);parts=[];staves=[];clefs=[];pitched=unpitched=0
    for item in tree.findall('./part-list/score-part'):
        parts.append({'id':item.get('id'),'name':item.findtext('part-name',''),
                      'instruments':[n.text or '' for n in item.findall('./score-instrument/instrument-name')],
                      'midiPrograms':[n.text or '' for n in item.findall('./midi-instrument/midi-program')],
                      'midiChannels':[n.text or '' for n in item.findall('./midi-instrument/midi-channel')]})
    for part in tree.findall('part'):
        nums=[int(e.text) for e in part.findall('./measure/attributes/staves') if e.text]
        nums += [int(e.text) for e in part.findall('./measure/note/staff') if e.text]
        staves.append(max([1,*nums]))
        for c in part.findall('./measure/attributes/clef'):
            clefs.append({'staff':int(c.get('number','1')),'sign':c.findtext('sign',''),
                'line':int(c.findtext('line','0')),'octaveChange':int(c.findtext('clef-octave-change','0'))})
        pitched+=len(part.findall('./measure/note/pitch'))
        unpitched+=len(part.findall('./measure/note/unpitched'))
    metadata_names=[]
    for meta in job['metadata']:
        blob=checked_target(corpus,meta['path']).read_bytes()
        if sha(blob)!=meta['sha']:raise CorpusError('cleanup-metadata-changed')
        score=json.loads(blob).get('data',{}).get('score',{})
        metadata_names.extend(i.get('name','') for i in score.get('instruments',[]))
    layout={'parts':len(staves),'stavesPerPart':staves,'clefs':clefs,'pitchedNotes':pitched,'unpitchedNotes':unpitched}
    return {**{k:job[k] for k in ('sha','path')},'bytes':len(data),'parts':parts,'layout':layout,
            'metadataInstruments':sorted(set(metadata_names)),**classify(parts,layout,metadata_names)}


def classifier_identity():
    aliases={key:sorted(value) for key,value in instrument_names().items()}
    return sha(json.dumps({'script':sha(Path(__file__).read_bytes()),
        'module':sha((ROOT/'buildscripts/pianist/curriculum_source_cleanup.py').read_bytes()),
        'musescoreNames':aliases},sort_keys=True).encode())


def jobs(corpus):
    with closing(sqlite3.connect((corpus/'catalog.sqlite').as_uri()+'?mode=ro',uri=True)) as db:
        files=[{'sha':s,'path':p,'metadata':[]} for s,p in db.execute(
            "SELECT sha256,path FROM files WHERE container_status!='removed-by-user' ORDER BY sha256")]
        by={j['sha']:j for j in files}
        for source,path,hash_ in db.execute('SELECT file_sha256,metadata_path,metadata_sha256 FROM origins WHERE metadata_path IS NOT NULL'):
            if source in by and {'path':path,'sha':hash_} not in by[source]['metadata']:
                by[source]['metadata'].append({'path':path,'sha':hash_})
    return files


def plan(args):
    queue=jobs(args.corpus);rows=[];instrument_names()
    inspection_sha=None
    if args.inspection:
        raw=args.inspection.read_bytes();cached=json.loads(raw)
        if {r['sha']:r['path'] for r in cached['records']}!={r['sha']:r['path'] for r in queue}:
            raise CorpusError('cleanup-inspection-inventory-mismatch')
        inspection_sha=sha(raw)
        by_sha={j['sha']:j for j in queue}
        for row in cached['records']:
            verdict=classify(row['parts'],row['layout'],row['metadataInstruments'])
            if verdict['action']=='review':
                row=inspect(by_sha[row['sha']],args.corpus)
            rows.append({**row,**classify(row['parts'],row['layout'],row['metadataInstruments'])})
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for i,row in enumerate(pool.map(lambda j:inspect(j,args.corpus),queue),1):
                rows.append(row)
                if i%3000==0:print(json.dumps({'inspected':i,'total':len(queue),
                    'actions':dict(Counter(r['action'] for r in rows))}),flush=True)
    result={'at':datetime.now(timezone.utc).isoformat(),'corpus':str(args.corpus),
        'classifier':classifier_identity(),'scope':'Downloaded source sheets only: retain two-staff piano sheets. Exercise files, catalogs, proofs and databases are protected.',
        'inspectionSha256':inspection_sha,
        'sourceCount':len(rows),'actions':dict(Counter(r['action'] for r in rows)),
        'reasons':dict(Counter(r['reason'] for r in rows)),'records':rows}
    write_json(args.plan,result)
    print(json.dumps({k:v for k,v in result.items() if k!='records'},ensure_ascii=False),flush=True)


def backup_db(path,out):
    if not path.is_file():return
    out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():raise CorpusError('cleanup-backup-already-exists:'+str(out))
    with closing(sqlite3.connect(path)) as source,closing(sqlite3.connect(out)) as target:source.backup(target)


def exercise_snapshot():
    root=ROOT/'artifacts/curriculum-prepared'
    paths=set(root.rglob('*.mxl'))
    for filename in ('bank.sqlite','catalog.json','progress.json'):
        paths.update(root.rglob(filename))
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows=list(pool.map(lambda path:(path.relative_to(root).as_posix(),sha(path.read_bytes())),sorted(paths)))
    return {'files':len(rows),'sha256':sha(json.dumps(rows,separators=(',',':')).encode())}


def apply(args):
    result=json.loads(args.plan.read_text(encoding='utf8'))
    if Path(result['corpus']).resolve()!=args.corpus:raise CorpusError('cleanup-corpus-mismatch')
    if result['classifier']!=classifier_identity():raise CorpusError('cleanup-classifier-changed')
    for row in result['records']:
        verdict=classify(row['parts'],row['layout'],row['metadataInstruments'])
        if any(verdict[k]!=row[k] for k in ('action','reason')):
            raise CorpusError('cleanup-plan-policy-mismatch')
    current={j['sha']:j['path'] for j in jobs(args.corpus)}
    expected={r['sha']:r['path'] for r in result['records']}
    if current!=expected:raise CorpusError('cleanup-source-inventory-changed')
    removed=[r for r in result['records'] if r['action']=='delete'];removed_set={r['sha'] for r in removed}
    if not removed:raise CorpusError('cleanup-empty-deletion-set')
    # Validate every current source file before any mutation or deletion.
    def validate(row):
        path=checked_target(args.corpus,row['path'])
        if sha(path.read_bytes())!=row['sha']:raise CorpusError('cleanup-source-changed')
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for _ in pool.map(validate,result['records']):pass
    exercises_before=exercise_snapshot()
    with closing(sqlite3.connect(args.corpus/'catalog.sqlite')):
        backup=args.corpus/'cleanup-metadata-before'
        backup_db(args.corpus/'catalog.sqlite',backup/'catalog.sqlite')
        # This marker also disables the old bulk downloader before deleting any
        # file, so a later command cannot restore the user-deleted sources.
        receipt={'at':datetime.now(timezone.utc).isoformat(),'status':'applying',
            'planSha256':sha(args.plan.read_bytes()),'removedSources':len(removed),
            'remainingSources':len(result['records'])-len(removed),
            'scope':'downloaded-source-sheets-only','exercisesBefore':exercises_before,
            'reasons':dict(Counter(r['reason'] for r in removed)),
            'exclusions':[{'sha':r['sha'],'reason':r['reason']} for r in removed]}
        write_json(args.corpus/'source-cleanup.json',receipt)
        db=sqlite3.connect(args.corpus/'catalog.sqlite')
        tombstone_sources(db,removed);db.close()
        deleted_bytes=0
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for i,size in enumerate(pool.map(lambda row:delete_checked(args.corpus,row['path'],row['sha']),removed),1):
                deleted_bytes+=size
                if i%3000==0:print(json.dumps({'deletedSources':i,'total':len(removed)}),flush=True)
        # Delete duplicate source copies in acquisition/research caches by exact
        # content hash. Never inspect Downloads, the personal library or tests.
        copies=0
        for owned in (args.corpus/'raw/openscore',ROOT/'artifacts/curriculum-research/openscore-lieder'):
            if not owned.is_dir():continue
            for path in sorted(owned.glob('*.mxl')):
                digest=sha(path.read_bytes())
                if digest in removed_set:
                    deleted_bytes+=delete_checked(owned,path.name,digest);copies+=1
        exercises_after=exercise_snapshot()
        if exercises_after!=exercises_before:
            raise CorpusError('protected-exercise-snapshot-changed')
        receipt.update(status='complete',deletedSourceCopies=copies,
            exerciseBankTouched=False,exercisesAfter=exercises_after,deletedBytes=deleted_bytes)
        write_json(args.corpus/'source-cleanup.json',receipt)
        print(json.dumps({k:v for k,v in receipt.items() if k!='exclusions'},ensure_ascii=False),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['plan','apply'])
    parser.add_argument('--corpus',type=Path,default=ROOT/'artifacts/curriculum-corpus')
    parser.add_argument('--plan',type=Path,default=ROOT/'artifacts/curriculum-source-cleanup-plan.json')
    parser.add_argument('--workers',type=int,default=8,choices=range(1,17))
    parser.add_argument('--inspection',type=Path,help='Reclassify a prior complete XML inspection without parsing notes or changing source bytes.')
    args=parser.parse_args();args.corpus=args.corpus.resolve()
    with RunLock(args.corpus/'.run.lock'):
        plan(args) if args.command=='plan' else apply(args)
