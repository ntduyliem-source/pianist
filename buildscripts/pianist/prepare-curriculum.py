"""Build a local, reviewed exercise bank. No publication or runtime generation.

inspect -> source-context review -> prepare -> native/render checks -> finalize.
Only manifest-reviewed units are projected; incomplete reviews stay pending.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import zlib

from curriculum_io import CorpusError, RunLock, within, write_json
from curriculum_normalize import digest, encoded, piano_xml
from curriculum_fragments import SourceIndex
from curriculum_prepared import (prepare_unit, assess_unit, context_evidence,
    upstream_rest_proposals, length_bucket, coverage)

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prepared_q2', Path(__file__).with_name('normalize-curriculum.py'))
q2 = importlib.util.module_from_spec(spec); spec.loader.exec_module(q2)
BUILD_FILES = ['buildscripts/pianist/prepare-curriculum.py', 'buildscripts/pianist/curriculum_prepared.py',
               'buildscripts/pianist/curriculum_fragments.py']
RENDER_FILES = ['tests/browser/pianist/q4-prepared.cjs','tests/browser/pianist/q4-lab.ts',
                'packages/exercise-renderer/index.ts','packages/exercise-renderer/worker.ts',
                'packages/exercise-generator/prepared-contract.ts','packages/exercise-generator/prepared-model.ts',
                'packages/practice-engine-v2/score-adapter.ts']


def read_json(path): return json.loads(path.read_text(encoding='utf8'))


def write_bytes(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.tmp');temp.write_bytes(data);temp.replace(path)


def identity(config, buckets, reviews):
    return digest(encoded({'parser':q2.identity(),'files':{p:digest((ROOT/p).read_bytes()) for p in BUILD_FILES},
        'profiles':config,'lengths':buckets,'reviews':reviews}).encode())


def load_source(args, source_hash):
    if not re.fullmatch('[a-f0-9]{64}',source_hash): raise CorpusError('invalid-source-hash')
    with sqlite3.connect((args.corpus/'catalog.sqlite').resolve().as_uri()+'?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        row = db.execute('SELECT * FROM files WHERE sha256=?',(source_hash,)).fetchone()
        if row is None or row['container_status'] != 'valid': raise CorpusError('missing-valid-source')
        data = within(args.corpus,row['path']).read_bytes()
        if digest(data) != source_hash: raise CorpusError('source-checksum-mismatch')
        origins = [dict(r) for r in db.execute('''SELECT id,collection,revision,source_path,source_url,
            title,composer,license_id,license_url,visibility FROM origins WHERE file_sha256=? ORDER BY id''',(source_hash,))]
    pipeline = digest(f'{q2.identity()}:20000:45'.encode())
    with sqlite3.connect((args.normalized/'normalization.sqlite').resolve().as_uri()+'?mode=ro',uri=True) as db:
        row = db.execute('SELECT blob,analysis_sha FROM analyses WHERE source_sha=? AND pipeline=? AND status=?',
                         (source_hash,pipeline,'normalized')).fetchone()
        if row is None: raise CorpusError('source-requires-current-normalization')
    raw = zlib.decompress(row[0])
    if digest(raw) != row[1]: raise CorpusError('source-analysis-checksum')
    return SourceIndex(json.loads(raw),data), {'sourceSha256':source_hash,'analysisSha256':row[1],'origins':origins}


def collect(args, reviews, config):
    sources = {}; prepared = []; rejected = []
    labels = [u['label'] for u in reviews['units']]
    if len(set(labels)) != len(labels): raise CorpusError('duplicate-review-label')
    for unit in reviews['units']:
        source_hash = unit['sourceSha256']
        if source_hash not in sources: sources[source_hash] = load_source(args,source_hash)
        index,source = sources[source_hash]
        if unit['analysisSha256'] != source['analysisSha256']: raise CorpusError('review-analysis-binding')
        try:
            p = prepare_unit(index,unit,config); p['source'] = source
            prepared.append(p)
        except CorpusError as error:
            rejected.append({'label':unit['label'],'sourceSha256':source_hash,'reasons':str(error).split(',')})
    if len({p['id'] for p in prepared}) != len(prepared): raise CorpusError('duplicate-source-unit')
    return prepared,rejected,sources


def inspect_sources(args, reviews, config):
    sources = {}; rows = []; entries = []
    out = args.output/'inspection'; out.mkdir(parents=True,exist_ok=True)
    for unit in reviews['units']:
        sha = unit['sourceSha256']
        if sha not in sources:
            index,source = load_source(args,sha); sources[sha]=(index,source)
            xml,_ = piano_xml(within(args.corpus, source_path(args,sha)).read_bytes())
            (out/(sha+'.musicxml')).write_bytes(xml)
            entries.append({'id':sha,'xml':str((out/(sha+'.musicxml')).resolve()),'xmlSha256':digest(xml)})
        index,source = sources[sha]
        rows.append({'label':unit['label'],'source':source,'context':context_evidence(index,unit),
            'verdict':assess_unit(index,unit,config),'restProposals':upstream_rest_proposals(index,unit['lineId'])})
    write_json(out/'contexts.json',{'entries':rows})
    write_json(out/'jobs.json',{'pipeline':'source-inspection-only','entries':entries})
    print(f'Inspection: {len(rows)} units / {len(entries)} sources. No approval inferred.')


def source_path(args, sha):
    with sqlite3.connect((args.corpus/'catalog.sqlite').resolve().as_uri()+'?mode=ro',uri=True) as db:
        return db.execute('SELECT path FROM files WHERE sha256=?',(sha,)).fetchone()[0]


def prepare(args, reviews, config, buckets, pipeline):
    prepared,rejected,_ = collect(args,reviews,config); entries=[]
    for item in prepared:
        folder=args.output/'prepared'/item['id'];folder.mkdir(parents=True,exist_ok=True)
        raw=encoded(item['analysis']).encode()
        (folder/'exercise.musicxml').write_bytes(item['xml']);(folder/'analysis.json').write_bytes(raw)
        write_json(folder/'context.json',item['context'])
        write_json(folder/'proof.json',{k:v for k,v in item.items() if k not in ('xml','analysis','context')})
        entries.append({'id':item['id'],'xml':str((folder/'exercise.musicxml').resolve()),
            'analysis':str((folder/'analysis.json').resolve()),'analysisSha256':digest(raw),
            'xmlSha256':digest(item['xml']),'hand':item['verdict']['hand'],'expectEligible':True})
    write_json(args.output/'rejected.json',rejected)
    write_json(args.output/'jobs.json',{'schemaVersion':2,'pipeline':pipeline,'entries':entries})
    print(json.dumps({'preparedForNative':len(entries),'pendingOrRejected':len(rejected),'reasons':rejected},ensure_ascii=True))


def finalize(args,reviews,config,buckets,pipeline):
    prepared,rejected,_=collect(args,reviews,config)
    planned={p['id']:p for p in prepared}
    jobs=read_json(args.output/'jobs.json'); native=read_json(args.native); render=read_json(args.render)
    if any(r.get('pipeline') != pipeline for r in (jobs,native,render)): raise CorpusError('stale-build-pipeline')
    if not native.get('passed') or not render.get('passed'): raise CorpusError('native-or-render-check-failed')
    if native.get('engineBuild') != q2.native_identity() or native.get('verifierBuild') != q2.verifier_identity():
        raise CorpusError('stale-native-build')
    if native.get('verifierHashes') != {p:digest((ROOT/p).read_bytes()) for p in q2.VERIFIER_FILES}:
        raise CorpusError('stale-native-verifier')
    if render.get('verifierHashes') != {p:digest((ROOT/p).read_bytes()) for p in RENDER_FILES}:
        raise CorpusError('stale-render-verifier')
    release=read_json(ROOT/'build.artifacts/release.json')
    renderer_hashes={n:next(f['sha256'] for f in release['files'] if f['path']==n)
        for n in ('renderer/PianistRenderer.mjs','renderer/PianistRenderer.wasm')}
    if render.get('rendererHashes') != renderer_hashes: raise CorpusError('stale-renderer-build')
    for result in (jobs,native,render):
        ids=[r['id'] for r in result['entries']]
        if len(ids)!=len(set(ids)) or set(ids)!=set(planned): raise CorpusError('native-render-job-set-mismatch')
    nmap={r['id']:r for r in native['entries']};rmap={r['id']:r for r in render['entries']}
    payloads=[];outside=[]
    for id_,p in sorted(planned.items()):
        n,r=nmap[id_],rmap[id_]; xml_sha=digest(p['xml']);analysis_sha=digest(encoded(p['analysis']).encode())
        v=n.get('verification',{})
        if (n.get('analysisSha256')!=analysis_sha or n.get('pianoXmlSha256')!=xml_sha or not n.get('inputHashVerified')
            or not v.get('eligibleForFragmentReview') or v.get('releaseBlockers')):
            raise CorpusError('native-unit-not-verified:'+id_)
        semantic=gzip.decompress((args.native.parent/'snapshots'/(id_+'.json.gz')).read_bytes())
        if digest(semantic)!=n['snapshotSha256']: raise CorpusError('native-snapshot-hash')
        if r.get('xmlSha256')!=xml_sha or r.get('counts')!=v['counts'] or not r.get('glyphsComplete') or not r.get('editorUnchanged'):
            raise CorpusError('render-unit-not-verified:'+id_)
        snapshot=(args.render.parent/'snapshots'/(id_+'.json')).read_bytes()
        timeline=(args.render.parent/'timelines'/(id_+'.json')).read_bytes()
        if digest(snapshot)!=r['snapshotSha256'] or digest(timeline)!=r['timelineSha256']: raise CorpusError('render-assets-hash')
        count=v['counts']['targets']; bucket=length_bucket(count,buckets)
        if bucket is None: outside.append({'id':id_,'targets':count});continue
        u,verdict=p['unit'],p['verdict']
        entry={'schemaVersion':2,'id':id_,'title':u['label'],'sourceSha256':u['sourceSha256'],
            'source':p['source'],'sourceSpan':p['sourceSpan'],'sourceLineId':u['lineId'],
            'sourceEventIds':verdict['sourceEventIds'],'grade':verdict['grade'],'profileId':u['profileId'],
            'hand':verdict['hand'],'lengthBucket':bucket,'counts':v['counts'],'unitKind':u['unitKind'],
            'exactHash':p['exactHash'],'motifHash':p['motifHash'],'bpm':verdict['bpm'],
            'durationQuarter':verdict['durationQuarter'],'status':'approved-local-pilot','visibility':'local-only',
            'review':u['review'],'gradeEvidence':verdict,'projectionVerification':p['projection'],
            'versions':{'parser':q2.identity(),'profile':digest(encoded(config).encode()),
                'lengths':digest(encoded(buckets).encode()),'builder':pipeline,'native':n['snapshotSha256'],
                'renderer':render['rendererHashes'],'engine':native['engineBuild']},
            'assets':{kind:{'path':f'exercises/{id_}/{name}','sha256':digest(data),'bytes':len(data)}
                for kind,name,data in [('notation','exercise.musicxml',p['xml']),('snapshot','snapshot.json',snapshot),
                    ('timeline','timeline.json',timeline),('context','context.json',encoded(p['context']).encode())]}}
        payloads.append((entry,p['xml'],snapshot,timeline,encoded(p['context']).encode()))
    entries=[p[0] for p in payloads]
    # Metadata/review changes create a release; musical IDs remain stable.
    release_id=digest(encoded(entries).encode())
    out=args.output/'releases'/release_id;out.mkdir(parents=True,exist_ok=True)
    for entry,xml,snapshot,timeline,context in payloads:
        for kind,data in [('notation',xml),('snapshot',snapshot),('timeline',timeline),('context',context)]:
            target=within(out,entry['assets'][kind]['path']);write_bytes(target,data)
        write_json(out/'exercises'/entry['id']/'exercise.json',entry)
    cov=coverage(entries,buckets)
    # Report overlap explicitly, without unstable union-find group IDs.
    overlap=[]
    for i,a in enumerate(entries):
        for b in entries[i+1:]:
            if a['sourceSha256']==b['sourceSha256'] and a['sourceLineId']==b['sourceLineId']:
                aa,bb=a['sourceSpan'],b['sourceSpan']
                if max(aa['startTick'],bb['startTick'])<min(aa['endTick'],bb['endTick']): overlap.append([a['id'],b['id']])
    cov['sourceOverlapPairs']=overlap
    manifest={'schemaVersion':2,'corpusVersion':release_id,'visibility':'local-only','stage':'Q4-pilot',
        'pipeline':pipeline,'lengthBuckets':buckets['buckets'],'entries':entries,'coverage':cov}
    write_json(out/'catalog.json',manifest)
    write_json(args.output/'report.json',{'pipeline':pipeline,'corpusVersion':release_id,
        'prepared':len(prepared),'approved':len(entries),'pendingOrRejected':rejected,'outsideLengthBuckets':outside,
        'coverage':cov,'nativeReportSha256':digest(args.native.read_bytes()),'renderReportSha256':digest(args.render.read_bytes()),
        'limitations':['assistant content review; no teacher or physical MIDI validation','local corpus only; publication not approved',
                        'G3-G8 and long buckets remain empty','Q5-Q7 session UI not implemented']})
    # Publish the pointer last; an interrupted build cannot select partial files.
    write_json(args.output/'manifest.json',{'schemaVersion':2,'corpusVersion':release_id,
        'catalog':f'releases/{release_id}/catalog.json','sha256':digest((out/'catalog.json').read_bytes())})
    print(encoded({'approved':len(entries),'sources':cov['sourceFiles'],'motifs':cov['motifs'],
        'exactContents':cov['exactContents'],'sourceOverlapPairs':len(overlap),'catalog':str(out/'catalog.json')}))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['inspect','prepare','finalize'])
    p.add_argument('--corpus',type=Path,default=ROOT/'artifacts/curriculum-corpus')
    p.add_argument('--normalized',type=Path,default=ROOT/'artifacts/curriculum-normalized')
    p.add_argument('--output',type=Path,default=ROOT/'artifacts/curriculum-prepared')
    p.add_argument('--reviews',type=Path,default=ROOT/'scores/curriculum/reviewed-units.v2.json')
    p.add_argument('--native',type=Path,default=ROOT/'artifacts/curriculum-prepared/native/report.json')
    p.add_argument('--render',type=Path,default=ROOT/'artifacts/curriculum-prepared/render/report.json')
    args=p.parse_args();config=read_json(ROOT/'scores/curriculum/grades.v2.json')
    buckets=read_json(ROOT/'scores/curriculum/length-buckets.v2.json');reviews=read_json(args.reviews)
    with RunLock(args.output/'.run.lock'):
        pipeline=identity(config,buckets,reviews)
        if args.command=='inspect':inspect_sources(args,reviews,config)
        elif args.command=='prepare':prepare(args,reviews,config,buckets,pipeline)
        else:finalize(args,reviews,config,buckets,pipeline)


if __name__=='__main__':main()
