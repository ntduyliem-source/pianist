"""K2 audit of explicitly selected source spans against EVERY G1-G8 profile.

This command is not the K3 enumerator, does not emit playable exercises and
does not modify source scores, normalization cache, library or scoring kernel.
"""
import argparse
import json
from pathlib import Path
import sqlite3
import zlib

from curriculum_fragments import SourceIndex
from curriculum_grades import assess_all,load_config,VERSION
from curriculum_io import CorpusError,within,write_json
from curriculum_normalize import digest

ROOT=Path(__file__).resolve().parents[2]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selections',type=Path,required=True,help='JSON {selections:[{selection:{...}, evidenceByProfile:{...}}]}')
    parser.add_argument('--corpus',type=Path,default=ROOT/'artifacts/curriculum-corpus')
    parser.add_argument('--normalized',type=Path,default=ROOT/'artifacts/curriculum-normalized')
    parser.add_argument('--output',type=Path,default=ROOT/'artifacts/curriculum-grades/report.json')
    args=parser.parse_args();config=load_config()
    entries=[]
    with sqlite3.connect((args.corpus/'catalog.sqlite').resolve().as_uri()+'?mode=ro',uri=True) as catalog, \
         sqlite3.connect((args.normalized/'normalization.sqlite').resolve().as_uri()+'?mode=ro',uri=True) as db:
        for item in json.loads(args.selections.read_text(encoding='utf8'))['selections']:
            selection=item['selection']; sha=selection['sourceSha256']
            try:
                row=db.execute('SELECT analysis_sha,blob FROM analyses WHERE source_sha=? AND status=?',(sha,'normalized')).fetchone()
                if row is None or row[0]!=selection['analysisSha256']: raise CorpusError('missing-or-stale-normalization')
                raw=zlib.decompress(row[1])
                if digest(raw)!=row[0]:raise CorpusError('analysis-checksum-mismatch')
                source=catalog.execute('SELECT MIN(mxl_path) FROM review_queue WHERE file_sha256=?',(sha,)).fetchone()[0]
                if source is None:raise CorpusError('source-outside-current-catalog')
                index=SourceIndex(json.loads(raw),within(args.corpus,source).read_bytes())
                entries.append({'selection':selection,'results':assess_all(index,selection,item.get('evidenceByProfile'),config)})
            except (ValueError,KeyError,OSError,zlib.error) as error:
                entries.append({'selection':selection,'error':str(error)})
    report={'schemaVersion':3,'rulesVersion':VERSION,'config':str(ROOT/'scores/curriculum/grades.v3.json'),
            'graderSha256':digest((ROOT/'buildscripts/pianist/curriculum_grades.py').read_bytes()),
            'entries':entries,'publishedExercises':0}
    write_json(args.output,report)
    print(json.dumps({'selections':len(entries),'errors':sum('error' in e for e in entries),'report':str(args.output)}))


if __name__=='__main__':main()
