"""Revisit unread sources using hash-bound piano instrument declarations."""
import argparse
import json
from pathlib import Path
from curriculum_source_adapter import ROOT, prepare
from curriculum_io import RunLock
from curriculum_adapter_cache import reusable

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corpus', type=Path, default=ROOT/'artifacts/curriculum-corpus')
    p.add_argument('--normalized', type=Path, default=ROOT/'artifacts/curriculum-normalized')
    p.add_argument('--output', type=Path, default=ROOT/'artifacts/curriculum-supplemental-sources')
    args = p.parse_args()
    with RunLock(args.output/'.run.lock'):
        result = reusable(args.corpus, args.normalized, args.output)
        if result:
            print('Reused source adapters after verifying source, metadata, output and provenance hashes.', flush=True)
        else:
            result = prepare(args.corpus, args.normalized, args.output)
    print(json.dumps({k: result[k] for k in ('selected', 'outcomes', 'originalFilesModified')}))
