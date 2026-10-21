"""Read committed exercises only; report the union without counting duplicates."""
from contextlib import closing
from pathlib import Path
import argparse
import json
import sqlite3
from curriculum_release import ROOT, combine

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bank', type=Path, action='append')
    p.add_argument('--markdown', action='store_true')
    args = p.parse_args()
    paths = args.bank or [ROOT/'artifacts/curriculum-prepared/releases/reading-options-v1',
                         ROOT/'artifacts/curriculum-prepared/releases/reading-supplement-v1']
    banks = []
    for path in paths:
        if not (path/'bank.sqlite').is_file():
            continue
        with closing(sqlite3.connect((path/'bank.sqlite').resolve().as_uri()+'?mode=ro', uri=True)) as db:
            entries = [json.loads(r[0]) for r in db.execute('SELECT entry FROM exercises')]
        banks.append({'path': path, 'entries': entries})
    _, coverage, _ = combine(banks)
    if args.markdown:
        print('| Grade | ~4 | ~6 | ~10 | ~20 | ~30 | ~50 | ~100 | Total |')
        print('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
        for grade, row in coverage['verifiedUniqueByOption'].items():
            print('| G'+grade+' | '+' | '.join(str(n) for n in row.values())+' | '+str(sum(row.values()))+' |')
        print(f"{coverage['uniqueMxlFiles']} unique MXL; {coverage['optionsAtMinimum']}/56 options at 300.")
    else:
        print(json.dumps(coverage))
