"""Serialize fixed, AI-authored ABC passages and explicit G4 study plans.

No random choices, note generation, transposition or automatic music repair.
Every pitch, duration, rest and passage order is present in the source files.
"""
from pathlib import Path
from fractions import Fraction
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
import argparse
import hashlib
import importlib.util
import json
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from abc_grade_pitches import parse_basic, hand_ranges
SOURCE = ROOT / 'buildscripts/pianist/compositions/g4'
OUTPUT = ROOT / 'scores/composed/g4-abc'
BUCKETS = {'n4': (3, 5), 'n6': (6, 8), 'n10': (9, 14),
           'n20': (15, 24), 'n30': (25, 39), 'n50': (40, 69), 'n100': (70, 120)}
ROLES = {'R': 30, 'L': 30, 'A': 25, 'S': 15}

# Reuse the independently implemented MusicXML walker from the G1 packager.
spec = importlib.util.spec_from_file_location('g1_packaging', Path(__file__).with_name('package-g1-abc.py'))
g1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g1)


def parse_voice(body, meter, staff, maximum, key='C'):
    return parse_basic(body, meter, staff, maximum, 4, key)


def fingerprint(events, normalized=False, swap=False):
    result = []
    for staff in (1, 2):
        ee = [e for e in events if e[3] == staff]
        anchor = next(e[2] for e in ee if e[2] is not None)
        result.extend((str(a), str(d), None if p is None else p-anchor if normalized else p,
                       3-staff if swap else staff) for a, d, p, _ in ee)
    return hashlib.sha256(json.dumps(sorted(result, key=lambda e: (e[3], Fraction(e[0]))), separators=(',', ':')).encode()).hexdigest()


def focus_witnesses(events, meter, profile, leadstaff, home_range=None):
    ee = [e for e in events if e[3] == leadstaff]
    if profile in ('upper','lower'):
        # The original C-position books declare this starting position. New
        # material can declare its own home window; it is context, not a key gate.
        home = home_range or ((60, 67) if leadstaff == 1 else (48, 55))
        boundary = home[1] if profile == 'upper' else home[0]
        for a,d,p,s in ee:
            if p is not None and (p > boundary if profile == 'upper' else p < boundary):
                return [{'kind': 'new-register', 'atBeat': str(a+1), 'midi': p, 'oldBoundaryMidi': boundary, 'direction': profile}]
    elif profile == 'span':
        run = []
        for event in ee:
            if event[2] is None:
                run = []
                continue
            run.append(event)
            if max(e[2] for e in run)-min(e[2] for e in run) == 12:
                return [{'kind': 'octave-range-without-octave-leap', 'fromBeat': str(run[0][0]+1),
                         'toBeat': str(run[-1][0]+1), 'midiRoute': [e[2] for e in run],
                         'lowestMidi': min(e[2] for e in run), 'highestMidi': max(e[2] for e in run)}]
    return []


def validate(rh, lh, meter, profile, role, lead, key='C', home_range=None):
    assert profile in ('upper','lower','span') and lead in ('RH','LH'), 'invalid G4 profile or focus hand'
    assert meter in (2,3,4), 'unsupported meter'
    leadstaff = 1 if lead == 'RH' else 2
    right, ri, rbars = parse_voice(rh,meter,1,4 if leadstaff == 1 else 1,key)
    left, li, lbars = parse_voice(lh,meter,2,4 if leadstaff == 2 else 1,key)
    hand_ranges(right,left,12 if profile == 'span' else 7,7,leadstaff)
    assert rbars == lbars, 'different hand lengths'
    rn, ln = ([e for e in ee if e[2] is not None] for ee in (right,left))
    assert rn and ln, 'silent hand'
    focus, support = (rn,ln) if leadstaff == 1 else (ln,rn)
    assert len({e[2] for e in focus}) >= 2, 'focus is a single repeated pitch'
    assert max(e[2] for e in ln) < min(e[2] for e in rn), 'hands overlap or cross keyboard regions'
    assert all(e[1] >= 1 for e in right+left), 'this G4 collection keeps familiar basic rhythm'
    events = right+left
    assert focus_witnesses(events,meter,profile,leadstaff,home_range), 'no G4 register or continuous octave-range witness'
    if role == 'R':
        assert lead == 'RH' and len(rn) >= len(ln), 'RH lead mismatch'
    elif role == 'L':
        assert lead == 'LH' and len(ln) >= len(rn), 'LH lead mismatch'
    elif role == 'S':
        assert [(a,d) for a,d,_,_ in rn] == [(a,d) for a,d,_,_ in ln], 'unaligned hands'
    elif role == 'A':
        assert all(max(a,b) >= min(a+d,b+e) for a,d,_,_ in rn for b,e,_,_ in ln), 'answer hands overlap'
    else:
        raise ValueError('unknown role')
    for a,d,p,_ in rn:
        for b,e,q,_ in ln:
            assert min(a+d,b+e)-max(a,b) < 2 or (p-q)%12 not in (1,2,6,10,11), 'sustained dissonance'
    assert not any(e[2] is None and f[2] is None and min(e[0]+e[1],f[0]+f[1])-max(e[0],f[0]) > 1
                   for e in right for f in left), 'long simultaneous silence'
    if rbars >= 8:
        pairs = list(zip([b.strip() for b in rh.split('|')],[b.strip() for b in lh.split('|')]))
        assert not any(all(pairs[i] == pairs[i%period] for i in range(rbars)) for period in (1,2)), 'entire piece is tiny loop'
    return events,rbars,len(rn),len(ln)


def read_scores(partial=False):
    passages = {}
    for path in sorted(SOURCE.glob('passages-*.txt')):
        for li, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if not line.strip() or line.startswith('#'):
                continue
            key, meter, rh, lh = [v.strip() for v in line.split(';')]
            assert key not in passages, f'duplicate passage {key}'
            passages[key] = (int(meter), rh, lh, f'{path.relative_to(ROOT).as_posix()}:{li}')
    rows = []
    for group, bounds in BUCKETS.items():
        path = SOURCE / (group+'.txt')
        if not path.exists() and partial:
            continue
        group_rows = []
        for li, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if not line.strip() or line.startswith('#'):
                continue
            try:
                fields = [v.strip() for v in line.split(';')]
                number, profile, role, lead, title = fields[:5]
                number = int(number)
                assert 1 <= number <= 100 and lead in ('RH', 'LH')
                if len(fields) == 8:
                    meter, right, left = fields[5:]
                    sequence = f'inline-{group}-{number:03d}'
                    segments = [(int(meter), right, left, f'{path}:{li}')]
                else:
                    assert len(fields) == 6, 'expected literal score or explicit passage sequence'
                    sequence = fields[5]
                    segments = [passages[key] for key in sequence.split()]
                assert len({s[0] for s in segments}) == 1, 'meter change'
                meter = segments[0][0]
                assert meter in (2, 3, 4)
                rh, lh = (' | '.join(s[i] for s in segments) for i in (1, 2))
                events, bars, nr, nl = validate(rh, lh, meter, profile, role, lead)
                assert bounds[0] <= nr+nl <= bounds[1], f'{nr+nl} attacks outside {bounds}'
                assert bars*meter <= 120, 'over two minutes at reference tempo'
                witness = focus_witnesses(events, meter, profile, 1 if lead == 'RH' else 2)
                group_rows.append(dict(id=f'g4-{group}-{number:03d}', group=group, number=number, profile=profile,
                                       role=role, lead=lead, title=title, meter=meter, rh=rh, lh=lh, events=events,
                                       bars=bars, count=nr+nl, right=nr, left=nl, seconds=bars*meter,
                                       passages=sequence.split(), witnesses=witness, source=f'{path.relative_to(ROOT).as_posix()}:{li}',
                                       contentHash=fingerprint(events),
                                       normalizedHash=min(fingerprint(events, True), fingerprint(events, True, True))))
            except Exception as exc:
                raise ValueError(f'{path.name}:{li}: {exc}') from exc
        assert len({r['number'] for r in group_rows}) == len(group_rows), 'duplicate ID'
        if not partial:
            assert sorted(r['number'] for r in group_rows) == list(range(1, 101)), f'{group} incomplete'
            assert Counter(r['profile'] for r in group_rows) == {'upper': 50, 'lower': 30, 'span': 20}, f'{group} profiles'
            assert Counter(r['role'] for r in group_rows) == ROLES, f'{group} roles'
        rows += sorted(group_rows, key=lambda r: r['number'])
    seen = {}
    for row in rows:
        assert row['contentHash'] not in seen, f'exact duplicate: {row["id"]} = {seen.get(row["contentHash"])}'
        seen[row['contentHash']] = row['id']
    return rows


def abc(row):
    index = 2100 + list(BUCKETS).index(row['group'])*100 + row['number']
    header = f'''%abc-2.1
X:{index}
T:{row['id']} {row['title']}
C:Nhạc do trợ lý AI biên soạn
M:{row['meter']}/4
L:1/4
Q:1/4=60
%%score {{ RH | LH }}
V:RH clef=treble name="Piano"
V:LH clef=bass
K:{row.get('key', 'C')}
% grade=G4; profile={row['profile']}; lead={row['lead']}; bucket={row['group']}; notes={row['count']}; RH={row['right']}; LH={row['left']}
% role={row['role']}; duration60={row['seconds']}s; related_pattern={row['normalizedHash'][:16]}
% authored_passages={' '.join(row['passages'])}
% source={row['source']}
'''
    lines = []
    right, left = row['rh'].split('|'), row['lh'].split('|')
    for start in range(0, len(right), 4):
        for voice, bars in (('RH', right), ('LH', left)):
            lines.append(f'[V:{voice}] '+' | '.join(b.strip() for b in bars[start:start+4])+(' |]' if start+4 >= len(right) else ' |'))
    return header+'\n'.join(lines)+'\n'


def reading_order(rows):
    remaining, result, recent, counts = list(rows), [], [], Counter()
    target = Counter((r['profile'], r['role']) for r in rows)
    while remaining:
        eligible = [r for r in remaining if r['normalizedHash'] not in recent[-6:]]
        if not eligible:
            eligible = [r for r in remaining if r['normalizedHash'] not in recent[-1:]] or remaining
        row = min(eligible, key=lambda r: (Fraction(counts[r['profile'], r['role']], target[r['profile'], r['role']]), r['number']))
        remaining.remove(row)
        result.append(row)
        recent.append(row['normalizedHash'])
        counts[row['profile'], row['role']] += 1
    return result


def check_converter(job):
    return g1.check_converter(job)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--partial', action='store_true')
    parser.add_argument('--convert', action='store_true')
    parser.add_argument('--books', action='store_true')
    args = parser.parse_args()
    rows = read_scores(args.partial)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    texts, books, book_rows = {}, {}, {}
    for row in rows:
        path = OUTPUT/row['group']/(row['id']+'.abc')
        path.parent.mkdir(parents=True, exist_ok=True)
        texts[row['id']] = abc(row)
        path.write_text(texts[row['id']], encoding='utf-8', newline='\n')
    for group in BUCKETS:
        subset = [r for r in rows if r['group'] == group]
        if subset:
            book_rows[group] = reading_order(subset)
            for i, row in enumerate(book_rows[group], 1):
                row['bookPosition'] = i
            books[group] = '\n'.join(texts[r['id']] for r in book_rows[group])
            (OUTPUT/'books').mkdir(exist_ok=True)
            (OUTPUT/'books'/f'g4-{group}.abc').write_text(books[group], encoding='utf-8', newline='\n')
    verified = []
    if args.convert:
        jobs = [(r['id'], texts[r['id']], 0, r['events'], r['bars'], r['meter']) for r in rows]
        if args.books:
            for group, book in books.items():
                jobs += [(r['id']+'@book', book, i, r['events'], r['bars'], r['meter']) for i, r in enumerate(book_rows[group])]
        with ProcessPoolExecutor(max_workers=4) as pool:
            for future in as_completed([pool.submit(check_converter, j) for j in jobs]):
                verified.append(future.result())
                if len(verified) % 100 == 0:
                    print(f'Converter {len(verified)}/{len(jobs)}', flush=True)
    coverage = {}
    for group in BUCKETS:
        subset = [r for r in rows if r['group'] == group]
        coverage[group] = dict(count=len(subset), profiles=dict(Counter(r['profile'] for r in subset)),
                               roles=dict(Counter(r['role'] for r in subset)),
                               noteCounts=dict(sorted(Counter(r['count'] for r in subset).items())),
                               meters=dict(Counter(f'{r["meter"]}/4' for r in subset)),
                               maxSeconds=max((r['seconds'] for r in subset), default=0))
    normalized = defaultdict(list)
    for row in rows:
        normalized[row['normalizedHash']].append(row['id'])
    report = dict(schemaVersion=1, rules='g4-authored-passages-v1', total=len(rows), complete=len(rows) == 700 and not args.partial,
                  coverage=coverage, uniqueContent=len(rows), normalizedFamilies=len(normalized),
                  relatedVariants=[v for v in normalized.values() if len(v) > 1], converterChecks=len(verified),
                  individualAndBookVerified=bool(rows) and len(verified) == 2*len(rows),
                  adjacentRelatedPatternsInBooks=[(a['id'], b['id']) for rr in book_rows.values() for a, b in zip(rr, rr[1:]) if a['normalizedHash'] == b['normalizedHash']],
                  review='AI authored fixed passages and explicit forms; no teacher review or learning-effectiveness study.',
                  pieces=[{k: v for k, v in r.items() if k not in ('rh', 'lh', 'events')} for r in rows])
    (OUTPUT/'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    columns = ('id', 'group', 'bookPosition', 'profile', 'role', 'lead', 'count', 'right', 'left', 'meter', 'bars', 'seconds', 'title')
    (OUTPUT/'index.tsv').write_text('\t'.join(columns)+'\n'+'\n'.join('\t'.join(str(r[k]) for k in columns) for r in rows)+'\n', encoding='utf-8')
    if report['complete'] and report['individualAndBookVerified']:
        with zipfile.ZipFile(OUTPUT.parent/'g4-abc-700.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(OUTPUT.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(OUTPUT.parent))
    print(json.dumps({k: report[k] for k in ('total', 'complete', 'normalizedFamilies', 'converterChecks', 'coverage')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
