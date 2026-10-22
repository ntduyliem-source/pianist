"""Serialize fixed, AI-authored ABC passages and explicit G3 study plans.

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
SOURCE = ROOT / 'buildscripts/pianist/compositions/g3'
OUTPUT = ROOT / 'scores/composed/g3-abc'
BUCKETS = {'n4': (3, 5), 'n6': (6, 8), 'n10': (9, 14),
           'n20': (15, 24), 'n30': (25, 39), 'n50': (40, 69), 'n100': (70, 120)}
ROLES = {'R': 30, 'L': 30, 'A': 25, 'S': 15}
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7}
TOKEN = re.compile(r'([CDEFGz])(,?)(/2|[234])?')

# Reuse the independently implemented MusicXML walker from the G1 packager.
spec = importlib.util.spec_from_file_location('g1_packaging', Path(__file__).with_name('package-g1-abc.py'))
g1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g1)


def parse_voice(body, meter, staff, maximum):
    events, intervals = [], []
    previous = None
    bars = body.split('|')
    for bi, bar in enumerate(bars):
        cursor, offset, parsed = Fraction(0), 0, []
        while offset < len(bar):
            if bar[offset].isspace():
                offset += 1
                continue
            match = TOKEN.match(bar, offset)
            assert match, f'unsupported ABC near {bar[offset:]!r}'
            offset = match.end()
            letter, comma, length = match.groups()
            duration = Fraction(1, 2) if length == '/2' else Fraction(int(length or 1))
            if letter == 'z':
                assert not comma and (duration == 1 or (cursor == 0 and duration == meter)), 'rest placement'
                assert duration != Fraction(1, 2), 'eighth rest'
                pitch = None
            else:
                assert comma == (',' if staff == 2 else ''), 'wrong octave'
                degree = 'CDEFG'.index(letter)
                if previous is not None:
                    distance = abs(degree - previous)
                    assert distance <= maximum, f'leap across notes/rests/bars: {previous}->{degree}, bar {bi+1}'
                    intervals.append(distance)
                previous = degree
                pitch = (48 if staff == 2 else 60) + PC[letter]
                if duration == 2:
                    assert cursor in ({0, 2} if meter == 4 else {0, 1} if meter == 3 else {0}), 'half note syncopation'
                if duration >= 3:
                    assert cursor == 0 and duration == meter, 'long note must fill bar'
            parsed.append((bi * meter + cursor, duration, pitch, staff))
            cursor += duration
        assert cursor == meter, f'bar {bi+1}: {cursor} beats, expected {meter}'
        for i, (onset, duration, pitch, _) in enumerate(parsed):
            if duration == Fraction(1, 2):
                if onset.denominator == 1:
                    assert i+1 < len(parsed) and parsed[i+1][1] == Fraction(1, 2) and parsed[i+1][2] is not None, 'unpaired eighth'
                else:
                    assert i > 0 and parsed[i-1][1] == Fraction(1, 2) and parsed[i-1][0].denominator == 1, 'offbeat eighth pair'
        events += parsed
    return events, intervals, len(bars)


def fingerprint(events, normalized=False, swap=False):
    result = []
    for staff in (1, 2):
        ee = [e for e in events if e[3] == staff]
        anchor = next(e[2] for e in ee if e[2] is not None)
        result.extend((str(a), str(d), None if p is None else p-anchor if normalized else p,
                       3-staff if swap else staff) for a, d, p, _ in ee)
    return hashlib.sha256(json.dumps(sorted(result, key=lambda e: (e[3], Fraction(e[0]))), separators=(',', ':')).encode()).hexdigest()


def focus_witnesses(events, meter, profile, leadstaff):
    focus = [e for e in events if e[3] == leadstaff and e[2] is not None]
    witnesses = []
    if profile in ('fourth', 'fifth'):
        target = 5 if profile == 'fourth' else 7
        for a, b in zip(focus, focus[1:]):
            if a[0]+a[1] == b[0] and int(a[0]//meter) == int(b[0]//meter) and abs(a[2]-b[2]) == target:
                witnesses.append({'atBeat': str(b[0]+1), 'fromMidi': a[2], 'toMidi': b[2], 'semitones': target})
    elif profile == 'arpeggio':
        for a, b, c in zip(focus, focus[1:], focus[2:]):
            if (a[0]+a[1] == b[0] and b[0]+b[1] == c[0]
                    and int(a[0]//meter) == int(c[0]//meter)
                    and {a[2]%12, b[2]%12, c[2]%12} == {0, 4, 7}
                    and 7 in (abs(a[2]-b[2]), abs(b[2]-c[2]))):
                witnesses.append({'atBeat': str(a[0]+1), 'midi': [a[2], b[2], c[2]], 'harmony': 'C-major', 'adjacentFifth': True})
    return witnesses


def validate(rh, lh, meter, profile, role, lead):
    assert profile in ('fourth', 'fifth', 'arpeggio') and lead in ('RH', 'LH'), 'invalid G3 profile or focus hand'
    assert meter in (2, 3, 4), 'unsupported meter'
    leadstaff = 1 if lead == 'RH' else 2
    maximum = 3 if profile == 'fourth' else 4
    right, ri, rbars = parse_voice(rh, meter, 1, maximum if leadstaff == 1 else 1)
    left, li, lbars = parse_voice(lh, meter, 2, maximum if leadstaff == 2 else 1)
    assert rbars == lbars, 'different hand lengths'
    rn, ln = ([e for e in ee if e[2] is not None] for ee in (right, left))
    assert rn and ln, 'silent hand'
    assert all(e[1] >= 1 for e in right+left), 'this G3 collection keeps familiar basic rhythm'
    events = right+left
    assert focus_witnesses(events, meter, profile, leadstaff), 'no contiguous in-bar G3 focus witness'
    if profile == 'arpeggio':
        assert all(e[2]%12 in (0, 4, 7) for e in events if e[3] == leadstaff and e[2] is not None), 'arpeggio focus leaves C-major triad'
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
        pairs = list(zip([b.strip() for b in rh.split('|')], [b.strip() for b in lh.split('|')]))
        assert not any(all(pairs[i] == pairs[i%period] for i in range(rbars)) for period in (1,2)), 'entire piece is tiny loop'
    return events, rbars, len(rn), len(ln)


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
                group_rows.append(dict(id=f'g3-{group}-{number:03d}', group=group, number=number, profile=profile,
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
            assert Counter(r['profile'] for r in group_rows) == {'fourth': 50, 'fifth': 30, 'arpeggio': 20}, f'{group} profiles'
            assert Counter(r['role'] for r in group_rows) == ROLES, f'{group} roles'
        rows += sorted(group_rows, key=lambda r: r['number'])
    seen = {}
    for row in rows:
        assert row['contentHash'] not in seen, f'exact duplicate: {row["id"]} = {seen.get(row["contentHash"])}'
        seen[row['contentHash']] = row['id']
    return rows


def abc(row):
    index = 1400 + list(BUCKETS).index(row['group'])*100 + row['number']
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
K:C
% grade=G3; profile={row['profile']}; lead={row['lead']}; bucket={row['group']}; notes={row['count']}; RH={row['right']}; LH={row['left']}
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
            (OUTPUT/'books'/f'g3-{group}.abc').write_text(books[group], encoding='utf-8', newline='\n')
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
    report = dict(schemaVersion=1, rules='g3-authored-passages-v1', total=len(rows), complete=len(rows) == 700 and not args.partial,
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
        with zipfile.ZipFile(OUTPUT.parent/'g3-abc-700.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(OUTPUT.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(OUTPUT.parent))
    print(json.dumps({k: report[k] for k in ('total', 'complete', 'normalizedFamilies', 'converterChecks', 'coverage')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
