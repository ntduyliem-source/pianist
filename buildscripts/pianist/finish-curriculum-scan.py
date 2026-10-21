"""Reconcile K3 against the full source catalog and build the K4 queue."""
import argparse
import json
from pathlib import Path
from curriculum_auto import ROOT
from curriculum_inventory import compile_inventory
from curriculum_io import RunLock, CorpusError

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',type=Path,default=ROOT/'artifacts/curriculum-corpus')
    parser.add_argument('--normalized',type=Path,default=ROOT/'artifacts/curriculum-normalized')
    parser.add_argument('--scans',type=Path,default=ROOT/'artifacts/curriculum-k3-final')
    parser.add_argument('--output',type=Path,default=ROOT/'artifacts/curriculum-k3-final/inventory')
    args=parser.parse_args()
    with RunLock(args.output/'.run.lock'):
        report=compile_inventory(args.corpus.resolve(),args.normalized.resolve(),args.scans.resolve(),args.output.resolve())
    print(json.dumps(report,ensure_ascii=False),flush=True)
    if not report['complete']:raise CorpusError('K3 incomplete: retry missing/stale/failed sources listed in retry-sources.json')
