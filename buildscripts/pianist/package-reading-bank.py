"""Audit every bank/scan, reconcile current sources, then package K5."""
import argparse
import json
from pathlib import Path
from curriculum_release import ROOT, package, verify_package
from curriculum_io import RunLock

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bank', type=Path, action='append')
    p.add_argument('--corpus', type=Path, default=ROOT/'artifacts/curriculum-corpus')
    p.add_argument('--normalized', type=Path, default=ROOT/'artifacts/curriculum-normalized')
    p.add_argument('--supplemental', type=Path, default=ROOT/'artifacts/curriculum-supplemental-sources')
    p.add_argument('--supplemental-normalized', type=Path, default=ROOT/'artifacts/curriculum-supplemental-normalized')
    p.add_argument('--output', type=Path, default=ROOT/'artifacts/curriculum-bank')
    p.add_argument('--verify', type=Path, help='Verify an existing package without rebuilding')
    args = p.parse_args()
    if args.verify:
        print(json.dumps(verify_package(args.verify)))
    else:
        banks = args.bank or [ROOT/'artifacts/curriculum-prepared/releases/reading-options-v1',
                             ROOT/'artifacts/curriculum-prepared/releases/reading-supplement-v1']
        with RunLock(args.output/'.run.lock'):
            report = package(banks, args.output, args.corpus, args.normalized,
                             args.supplemental, args.supplemental_normalized)
        print(json.dumps({k: report[k] for k in ('releaseId', 'archiveBytes', 'verification', 'sourceProcessing', 'quotaComplete')}))
