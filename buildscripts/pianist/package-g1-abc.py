"""Package explicitly authored G1 scores and verify them; never generate notes.

Each source row contains every bar of both hands, written by the author:
number ; role ; meter numerator ; family ; title ; RH ABC ; LH ABC
Only headers, identifiers, line wrapping, reports and archives are derived.
"""
from pathlib import Path
from fractions import Fraction
from collections import Counter, defaultdict
import argparse
import hashlib
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from concurrent.futures import ProcessPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from abc_grade_pitches import parse_basic, hand_ranges, PC as PIANO_PC
SOURCE = ROOT / 'buildscripts/pianist/compositions/g1'
OUTPUT = ROOT / 'scores/composed/g1-abc'
BUCKETS = {'n4': (3, 5), 'n6': (6, 8), 'n10': (9, 14),
           'n20': (15, 24), 'n30': (25, 39), 'n50': (40, 69), 'n100': (70, 120)}
ROLES = {'R': 'Tay phải dẫn', 'L': 'Tay trái dẫn', 'A': 'Hai tay đối đáp', 'S': 'Hai tay cùng nhịp'}
TARGET_ROLES = {'R': 30, 'L': 30, 'A': 25, 'S': 15}
PC = dict(PIANO_PC)


def fail(message):
    raise ValueError(message)


def parse_voice(body, meter, staff, key='C'):
    events, intervals, bars = parse_basic(body, meter, staff, 1, 1, key)
    events = [(int(a), int(d), p, s) for a, d, p, s in events]
    assert any(e[2] is not None for e in events), 'silent hand'
    return events, sum(intervals), bars


def fingerprint(events, normalized=False, swap=False):
    result = []
    for staff in (1, 2):
        ee = [e for e in events if e[3] == staff]
        anchor = next(e[2] for e in ee if e[2] is not None)
        result.extend((a, d, None if p is None else p - anchor if normalized else p,
                       3 - staff if swap else staff) for a, d, p, _ in ee)
    return hashlib.sha256(json.dumps(sorted(result,key=lambda e:(e[3],e[0],e[1],-999 if e[2] is None else e[2])), separators=(',', ':')).encode()).hexdigest()


def read_scores(partial=False):
    rows = []
    for group, limits in BUCKETS.items():
        source = SOURCE / (group + '.txt')
        if not source.exists():
            if partial:
                continue
            fail('missing ' + str(source))
        group_rows = []
        for li, line in enumerate(source.read_text(encoding='utf-8').splitlines(), 1):
            if not line.strip() or line.startswith('#'):
                continue
            try:
                number, role, meter, family, title, rh, lh = [x.strip() for x in line.split(';')]
                number, meter = int(number), int(meter)
                assert 1 <= number <= 100 and role in ROLES and meter in (2, 3, 4)
                expected_role = 'R' if number <= 30 else 'L' if number <= 60 else 'A' if number <= 85 else 'S'
                assert role == expected_role, 'role/number mismatch'
                right, rsteps, rbars = parse_voice(rh, meter, 1)
                left, lsteps, lbars = parse_voice(lh, meter, 2)
                assert rbars == lbars, 'different hand lengths'
                assert rsteps + lsteps > 0, 'no stepwise reading focus'
                rn = [e for e in right if e[2] is not None]
                ln = [e for e in left if e[2] is not None]
                hand_ranges(right, left)
                count = len(rn) + len(ln)
                assert limits[0] <= count <= limits[1], f'{count} attacks outside {limits}'
                if role == 'S':
                    assert [(a,d) for a,d,_,_ in rn] == [(a,d) for a,d,_,_ in ln], 'unaligned synchronized hands'
                if role == 'R':
                    assert len(rn) >= len(ln) and rsteps > 0, 'RH is not leading'
                if role == 'L':
                    assert len(ln) >= len(rn) and lsteps > 0, 'LH is not leading'
                if role == 'A':
                    assert all(max(a,b) >= min(a+d,b+e) for a,d,_,_ in rn for b,e,_,_ in ln), 'answer hands overlap'
                for a,d,p,_ in rn:
                    for b,e,q,_ in ln:
                        overlap = min(a+d,b+e) - max(a,b)
                        assert overlap < 2 or (p-q) % 12 not in (1,2,6,10,11), 'sustained dissonance'
                assert not any(e[2] is None and f[2] is None and max(e[0],f[0]) < min(e[0]+e[1],f[0]+f[1])
                               and min(e[0]+e[1],f[0]+f[1])-max(e[0],f[0]) > 1
                               for e in right for f in left), 'long simultaneous silence'
                events = right + left
                digest = fingerprint(events)
                family_digest = min(fingerprint(events,True),fingerprint(events,True,True))
                row = dict(id=f'g1-{group}-{number:03d}', group=group, number=number, role=role,
                           meter=meter, family=family, title=title, rh=rh, lh=lh,
                           events=events, bars=rbars, count=count, right=len(rn), left=len(ln),
                           seconds=rbars*meter, contentHash=digest, normalizedHash=family_digest,
                           source=f'{source.relative_to(ROOT).as_posix()}:{li}')
                group_rows.append(row)
            except Exception as exc:
                fail(f'{source.name}:{li}: {exc}')
        numbers = [r['number'] for r in group_rows]
        assert len(numbers) == len(set(numbers)), 'duplicate number in ' + group
        if not partial:
            assert sorted(numbers) == list(range(1,101)), f'{group}: {len(numbers)}/100'
            assert dict(Counter(r['role'] for r in group_rows)) == TARGET_ROLES
        rows += sorted(group_rows,key=lambda r:r['number'])
    seen = {}
    for row in rows:
        if row['contentHash'] in seen:
            fail(f'exact duplicate: {row["id"]} = {seen[row["contentHash"]]}')
        seen[row['contentHash']] = row['id']
    return rows


def abc(row):
    index = list(BUCKETS).index(row['group']) * 100 + row['number']
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
% grade=G1; bucket={row['group']}; notes={row['count']}; RH={row['right']}; LH={row['left']}
% role={row['role']}; family={row['family']}; form=authored; duration60={row['seconds']}s
% related_pattern={row['normalizedHash'][:16]}
% source={row['source']}
'''
    # Write matching chunks of four already-authored bars, without altering music.
    right, left = row['rh'].split('|'), row['lh'].split('|')
    lines = []
    for i in range(0,len(right),4):
        final = i+4 >= len(right)
        for voice,bars in (('RH',right),('LH',left)):
            lines.append(f'[V:{voice}] ' + ' | '.join(b.strip() for b in bars[i:i+4]) + (' |]' if final else ' |'))
    return header + '\n'.join(lines) + '\n'


def reading_order(rows):
    """Space related drills and balance roles; musical content is unchanged."""
    remaining = list(rows)
    result, recent, counts = [], [], Counter()
    while remaining:
        eligible = [r for r in remaining if r['normalizedHash'] not in recent[-6:]]
        if not eligible:
            eligible = [r for r in remaining if r['normalizedHash'] not in recent[-1:]] or remaining
        row = min(eligible,key=lambda r:(Fraction(counts[r['role']],TARGET_ROLES[r['role']]),r['number']))
        remaining.remove(row)
        counts[row['role']] += 1
        recent.append(row['normalizedHash'])
        result.append(row)
    return result


def check_converter(job):
    identity, text, index, expected, bars, meter = job
    sys.path.insert(0,str(ROOT / 'packages/score-formats/python'))
    from converter import convert
    result = convert({'operation':'abc-to-xml','text':text,'tuneIndex':index})
    assert result['ok'] and not result['diagnostics'], (identity,result.get('diagnostics'))
    score = ET.fromstring(result['text'])
    parts = score.findall('part')
    assert len(parts) == 1 and parts[0].findtext('measure/attributes/staves') == '2', identity
    assert len(parts[0].findall('measure')) == bars, identity
    actual, origin, divisions = [], 0, 1
    for measure in parts[0].findall('measure'):
        cursor, extent = Fraction(0), Fraction(0)
        measure_start = len(actual)
        for node in measure:
            if node.tag == 'attributes':
                divisions = int(node.findtext('divisions',str(divisions)))
            elif node.tag in ('backup','forward'):
                cursor += Fraction(node.findtext('duration')) / divisions * (-1 if node.tag == 'backup' else 1)
            elif node.tag == 'note':
                assert node.find('chord') is None and node.find('tie') is None
                duration = Fraction(node.findtext('duration')) / divisions
                p = node.find('pitch')
                pitch = None if p is None else (int(p.findtext('octave'))+1)*12 + PC[p.findtext('step')] + int(p.findtext('alter','0'))
                actual.append((origin+cursor,duration,pitch,int(node.findtext('staff','1'))))
                cursor += duration
                extent = max(extent,cursor)
        assert extent == meter, (identity,extent,meter)
        # abc2xml can omit an entirely silent staff in an interior measure.
        # Its implicit full-bar silence must match the explicitly written rest.
        for staff in (1,2):
            if not any(e[3] == staff for e in actual[measure_start:]):
                actual.append((origin,Fraction(meter),None,staff))
        origin += extent
    order = lambda e:(e[3],e[0],e[1],-999 if e[2] is None else e[2])
    assert sorted(actual,key=order) == sorted(map(tuple,expected),key=order), (identity,'converter changed notes/rests/timing/staff')
    return identity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--partial',action='store_true')
    parser.add_argument('--convert',action='store_true')
    parser.add_argument('--books',action='store_true')
    args = parser.parse_args()
    rows = read_scores(args.partial)
    OUTPUT.mkdir(parents=True,exist_ok=True)
    texts = {}
    for row in rows:
        path = OUTPUT / row['group'] / (row['id'] + '.abc')
        path.parent.mkdir(parents=True,exist_ok=True)
        texts[row['id']] = abc(row)
        path.write_text(texts[row['id']],encoding='utf-8',newline='\n')
    books, book_rows = {}, {}
    for group in BUCKETS:
        group_rows = [r for r in rows if r['group'] == group]
        if group_rows:
            book_rows[group] = reading_order(group_rows)
            for position,row in enumerate(book_rows[group],1):
                row['bookPosition'] = position
            books[group] = '\n'.join(texts[r['id']] for r in book_rows[group])
            (OUTPUT/'books').mkdir(exist_ok=True)
            (OUTPUT/'books'/(f'g1-{group}.abc')).write_text(books[group],encoding='utf-8',newline='\n')
    verified = []
    if args.convert:
        jobs = [(r['id'],texts[r['id']],0,r['events'],r['bars'],r['meter']) for r in rows]
        if args.books:
            for group,book in books.items():
                jobs += [(r['id']+'@book',book,i,r['events'],r['bars'],r['meter']) for i,r in enumerate(book_rows[group])]
        with ProcessPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(check_converter,j) for j in jobs]
            for future in as_completed(futures):
                verified.append(future.result())
                if len(verified)%100 == 0:
                    print(f'Converter {len(verified)}/{len(jobs)}',flush=True)
    coverage = {}
    for group in BUCKETS:
        subset = [r for r in rows if r['group']==group]
        coverage[group] = {'count':len(subset),'roles':dict(Counter(r['role'] for r in subset)),
                           'noteCounts':dict(sorted(Counter(r['count'] for r in subset).items())),
                           'meters':dict(Counter(str(r['meter'])+'/4' for r in subset)),
                           'maxSeconds':max((r['seconds'] for r in subset),default=0)}
    normalized = defaultdict(list)
    for row in rows:
        normalized[row['normalizedHash']].append(row['id'])
    report = {'schemaVersion':1,'total':len(rows),'complete':len(rows)==700 and not args.partial,
              'rules':'g1-abc-authored-v1','coverage':coverage,'uniqueContent':len(rows),
              'normalizedFamilies':len(normalized),'relatedVariants':[v for v in normalized.values() if len(v)>1],
              'converterChecks':len(verified),'individualAndBookVerified':len(verified)==len(rows)*2 and bool(rows),
              'adjacentRelatedPatternsInBooks':[(a['id'],b['id']) for rr in book_rows.values() for a,b in zip(rr,rr[1:]) if a['normalizedHash']==b['normalizedHash']],
              'review':'AI authored and reviewed; structural checks are not teacher approval or a learning-effectiveness study.',
              'pieces':[{k:v for k,v in r.items() if k not in ('events','rh','lh')} for r in rows]}
    (OUTPUT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    columns = ('id','group','bookPosition','role','count','right','left','meter','bars','seconds','family','normalizedHash','title')
    (OUTPUT/'index.tsv').write_text('\t'.join(columns)+'\n'+'\n'.join('\t'.join(str(r[k]) for k in columns) for r in rows)+'\n',encoding='utf-8')
    if report['complete'] and report['individualAndBookVerified']:
        archive = OUTPUT.parent/'g1-abc-700.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
            for p in sorted(OUTPUT.rglob('*')):
                if p.is_file(): z.write(p,p.relative_to(OUTPUT.parent))
    print(json.dumps({k:report[k] for k in ('total','complete','uniqueContent','normalizedFamilies','converterChecks','coverage')},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
