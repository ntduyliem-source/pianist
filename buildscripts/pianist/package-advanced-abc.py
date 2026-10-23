"""Package explicitly authored G5--G8 piano studies; never choose musical notes.

cells.txt contains literal ABC for both hands. studies.txt binds eight authored
cells to each study; forms.txt gives the seven fixed orders. No randomization, transposition,
rhythmic transformation, automatic harmonization, or repair is performed.
"""
from pathlib import Path
from fractions import Fraction as F
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from abc_grade_pitches import PitchContext, PITCH, NOTE, degree, pitch_load, hand_ranges, ledger_lines, matches_interval, small_interval
BUCKETS = {'n4': (3, 5), 'n6': (6, 8), 'n10': (9, 14),
           'n20': (15, 24), 'n30': (25, 39), 'n50': (40, 69), 'n100': (70, 120)}
PC = dict(zip('CDEFGAB', (0, 2, 4, 5, 7, 9, 11)))
ATOM = re.compile(r'(\[(?:' + PITCH + r'\s*)+\]|' + PITCH + r'|z)(\d+/\d+|/\d+|\d+)?(-)?')
TARGETS = {5: {'offset': 50, 'dyad': 50},
           6: {f'{quality}-{direction}': 10 for quality in ('m6', 'M6', 'm7', 'M7', 'P8') for direction in ('up', 'down')},
           7: {'dotted': 25, 'tie': 25, 'sync': 25, 'compound': 25},
           8: {'ledger-high': 25, 'ledger-low': 25, 'dyad-dotted': 25, 'dyad-tie': 25}}


def decode(token, key='C'):
    return PitchContext(key).decode(token)


def parse_voice(body, meter, staff, key='C'):
    """Return atoms and flat written events, including both sides of each tie.

    Event = onset, duration, MIDI/rest, staff, tie-in, tie-out. All times use
    quarter-note units, even in 6/8. Chord members share one onset/duration.
    """
    bar_length = F(meter.split('/')[0])*4/int(meter.split('/')[1])
    atoms, events, pending = [], [], None
    context = PitchContext(key)
    bars = body.split('|')
    for bi, bar in enumerate(bars):
        context.bar()
        cursor, offset = F(0), 0
        while offset < len(bar):
            if bar[offset].isspace():
                offset += 1
                continue
            match = ATOM.match(bar, offset)
            assert match, f'unsupported ABC near {bar[offset:]!r}'
            token, length, out = match.groups()
            offset = match.end()
            duration = F('1'+length if length and length.startswith('/') else length or '1')
            assert duration in (F(1, 2), F(1), F(3, 2), F(2), F(3), F(4)), 'unsupported duration'
            if token.startswith('['):
                tokens = [m.group(0) for m in NOTE.finditer(token[1:-1].replace(' ', ''))]
                pitches = tuple(sorted(context.decode(t, pending[1] if pending else ()) for t in tokens))
                assert len(pitches) == 2 and len(set(pitches)) == 2, 'only distinct two-note dyads'
            else:
                pitches = () if token == 'z' else (context.decode(token, pending[1] if pending else ()),)
            assert pitches or not out, 'tied rest'
            start = bi*bar_length + cursor
            tied_in = pending is not None
            if tied_in:
                assert pending[0] == start and tuple((p.identity, int(p)) for p in pending[1]) == tuple((p.identity, int(p)) for p in pitches), 'tie must continue the same upstream note/octave identity immediately'
            atom = dict(at=start, dur=duration, pitches=pitches, staff=staff,
                        tieIn=tied_in, tieOut=bool(out), bar=bi)
            atoms.append(atom)
            events.extend((start, duration, pitch, staff, tied_in, bool(out)) for pitch in pitches or (None,))
            cursor += duration
            pending = (bi*bar_length+cursor, pitches) if out else None
        assert cursor == bar_length, f'bar {bi+1}: {cursor}, expected {bar_length} quarters'
    assert pending is None, 'unterminated tie at end of piece'
    return atoms, events, len(bars)


def sounding(events):
    """Canonical sounding notes: join ties, ignore rest spelling, keep staff."""
    result, active = [], {}
    for a, d, p, s, tin, tout in sorted(events, key=lambda e: (e[3], e[0], -1 if e[2] is None else e[2])):
        if p is None:
            continue
        key = s, p
        if tin:
            assert key in active and result[active[key]][0]+result[active[key]][1] == a, 'broken sounding tie'
            i = active[key]
            old = result[i]
            result[i] = (old[0], old[1]+d, p, s)
        else:
            assert key not in active, 'overlapping untied pitch'
            result.append((a, d, p, s))
            i = len(result)-1
        if tout:
            active[key] = i
        else:
            active.pop(key, None)
    assert not active
    return result


def fingerprint(events, duration, normalized=False, swap=False):
    notes = sounding(events)
    anchors = {s: next(p for a, d, p, staff in notes if staff == s) for s in (1, 2)}
    value = [(str(a), str(d), p-anchors[s] if normalized else p, 3-s if swap else s) for a, d, p, s in notes]
    value.sort(key=lambda e: (e[3], F(e[0]), e[2], F(e[1])))
    return hashlib.sha256(json.dumps([str(duration), value], separators=(',', ':')).encode()).hexdigest()


def small_movement(atoms):
    pitched = [a for a in atoms if a['pitches'] and not a['tieIn']]
    for a, b in zip(pitched, pitched[1:]):
        for p in a['pitches']:
            for q in b['pitches']:
                assert small_interval(p, q), f'movement outside supported P1–P5 intervals: {p}->{q}'


def rhythm_witness(atoms, profile, bar_length):
    for i, a in enumerate(atoms):
        if not a['pitches']:
            continue
        phase = a['at'] % bar_length
        if profile == 'dotted' and a['dur'] == F(3, 2) and phase in (0, 2) and i+1 < len(atoms):
            b = atoms[i+1]
            if b['pitches'] and b['dur'] == F(1, 2) and a['at']+a['dur'] == b['at']:
                return dict(kind='dotted-quarter-eighth', atQuarter=str(a['at']), durations=['3/2', '1/2'])
        if profile == 'tie' and a['tieOut'] and phase.denominator == 2 and i+1 < len(atoms):
            b = atoms[i+1]
            if b['tieIn'] and b['at'].denominator == 1 and b['at'] == a['at']+a['dur']:
                return dict(kind='tie-from-offbeat-across-quarter', atQuarter=str(a['at']), acrossQuarter=str(b['at']), midi=list(a['pitches']))
        if profile == 'sync' and a['dur'] == 1 and phase.denominator == 2 and i and i+1 < len(atoms):
            before, after = atoms[i-1], atoms[i+1]
            if before['pitches'] and after['pitches'] and before['dur'] == after['dur'] == F(1, 2):
                return dict(kind='eighth-quarter-eighth', atQuarter=str(before['at']), syncOnsetQuarter=str(a['at']))
        if profile == 'compound' and phase in (0, F(3, 2)) and a['dur'] in (1, F(3, 2)):
            return dict(kind='compound-meter', meter='6/8', beatUnit='3/8', beatQuarterUnits='3/2', atQuarter=str(a['at']))
    return None


def simple_rhythm(atoms, bar_length):
    for a in atoms:
        assert not a['tieIn'] and not a['tieOut'], 'tie outside tie profile'
        assert a['dur'].denominator == 1, 'new subdivision outside rhythm profile'
        phase = a['at'] % bar_length
        if a['dur'] == 2 and a['pitches']:
            assert phase in (0, 2), 'offbeat half note'
        if a['dur'] >= 3:
            assert phase == 0 and a['dur'] == bar_length, 'long note/rest must fill bar'


def validate(grade, rh, lh, meter, profile, lead, key='C'):
    assert profile in TARGETS[grade] and lead in ('RH', 'LH'), 'unknown profile or focus hand'
    assert meter in ('4/4', '6/8'), 'unsupported meter'
    assert (meter == '6/8') == (grade == 7 and profile == 'compound'), 'meter/profile mismatch'
    right, revents, rbars = parse_voice(rh, meter, 1, key)
    left, levents, lbars = parse_voice(lh, meter, 2, key)
    assert rbars == lbars, 'unequal hand lengths'
    atoms, events = right+left, revents+levents
    leadstaff = 1 if lead == 'RH' else 2
    focus, support = (right, left) if leadstaff == 1 else (left, right)
    rn = [e for e in revents if e[2] is not None and not e[4]]
    ln = [e for e in levents if e[2] is not None and not e[4]]
    assert rn and ln, 'both hands must contain real attacks'
    assert max(e[2] for e in ln) < min(e[2] for e in rn), 'hands cross or overlap keyboard regions'
    bar_length = F(3 if meter == '6/8' else 4)
    duration = rbars*bar_length
    seconds = duration/F(3, 2) if meter == '6/8' else duration
    assert seconds <= 120, 'over two minutes at reference tempo'
    witnesses = []
    for a in atoms:
        if len(a['pitches']) == 2:
            p, q = a['pitches']
            assert matches_interval(p, q, {(2, 3), (2, 4), (3, 5), (4, 7)}), 'unfamiliar written/semitone dyad interval'
    pitch_load(events, grade)
    hand_ranges(revents, levents, 16 if grade == 6 else 7, 7, leadstaff)
    focus_pitches = [p for a in focus for p in a['pitches']]
    low, high = min(focus_pitches), max(focus_pitches)
    if grade == 8 and profile in ('ledger-high', 'ledger-low'):
        assert lead == ('RH' if profile == 'ledger-high' else 'LH'), 'ledger profile/focus hand mismatch'
        assert any(ledger_lines(p, leadstaff) >= 2 and
                   (degree(p) > 38 if profile == 'ledger-high' else degree(p) < 18)
                   for p in focus_pitches), 'missing written ledger-line focus'
    assert len({p for a in focus for p in a['pitches']}) >= 2, 'focus has only one repeated pitch'
    if grade != 6:
        small_movement(focus)
    small_movement(support)
    dyad_profile = profile in ('dyad', 'dyad-dotted', 'dyad-tie')
    assert all(len(a['pitches']) <= 1 for a in support), 'support must remain monophonic'
    assert dyad_profile == any(len(a['pitches']) == 2 for a in focus), 'dyad/profile mismatch'
    if dyad_profile:
        a = next(a for a in focus if len(a['pitches']) == 2)
        witnesses.append(dict(kind='two-note-chord', staff=leadstaff, atQuarter=str(a['at']), midi=list(a['pitches'])))
    if grade == 5:
        simple_rhythm(atoms, bar_length)
        if profile == 'offset':
            ra, la = ({e[0] for e in ee} for ee in (rn, ln))
            assert ra-la and la-ra, 'independence requires unique attacks in both hands'
            overlap = next(((r, l) for r in rn for l in ln if r[0] != l[0] and max(r[0], l[0]) < min(r[0]+r[1], l[0]+l[1])), None)
            assert overlap, 'alternating attacks alone do not establish overlapping independence'
            witnesses.append(dict(kind='overlapping-independent-attacks', rightOnsets=[str(x) for x in sorted(ra)[:8]], leftOnsets=[str(x) for x in sorted(la)[:8]]))
    elif grade == 6:
        simple_rhythm(atoms, bar_length)
        assert all(len(a['pitches']) <= 1 for a in atoms), 'G6 introduces no chords'
        quality, direction = profile.split('-')
        target = {'m6': (5, 8), 'M6': (5, 9), 'm7': (6, 10), 'M7': (6, 11), 'P8': (7, 12)}[quality]
        melodic = [a for a in focus if a['pitches']]
        for i, (a, b) in enumerate(zip(melodic, melodic[1:])):
            p, q = a['pitches'][0], b['pitches'][0]
            delta, steps = q-p, degree(q)-degree(p)
            if small_interval(p, q):
                continue
            assert matches_interval(p, q, {target}) and (delta > 0) == (direction == 'up'), f'other large interval/direction: {p}->{q}, expected {profile}'
            assert i > 0 and i+2 < len(melodic), 'leap lacks approach or departure'
            before, after = melodic[i-1], melodic[i+2]
            assert before['at']+before['dur'] == a['at'] and b['at']+b['dur'] == after['at'], 'leap context interrupted by rest'
            assert small_interval(before['pitches'][0], p, 2) and small_interval(q, after['pitches'][0], 2), 'context must approach/depart by supported step or third'
            witnesses.append(dict(kind='contextual-leap', family=quality, direction=direction, atQuarter=str(a['at']), midiRoute=[before['pitches'][0], p, q, after['pitches'][0]]))
        assert witnesses, 'no specified large interval with context'
    else:
        rhythm = profile if grade == 7 else profile.removeprefix('dyad-') if dyad_profile else None
        if rhythm:
            witness = rhythm_witness(focus, rhythm, bar_length)
            assert witness, f'missing {rhythm} rhythm on actual beat grid'
            witnesses.append(witness)
            if rhythm != 'tie':
                assert not any(a['tieIn'] or a['tieOut'] for a in atoms), 'tie in a different rhythm family'
            if rhythm in ('tie', 'sync'):
                assert not any(a['dur'] == F(3, 2) for a in focus), 'dotted written rhythm mixed into other profile'
            if rhythm == 'dotted':
                assert not any(a['dur'] == 1 and a['at'].denominator == 2 for a in focus if a['pitches']), 'syncopation mixed into dotted profile'
            if rhythm == 'compound':
                for a in atoms:
                    phase = a['at'] % F(3, 2)
                    assert a['dur'] == 3 and phase == 0 or phase+a['dur'] <= F(3, 2), '6/8 event crosses dotted-quarter grouping'
            # The accompanying hand only marks the bar; no independent rhythm.
            for a in support:
                if a['pitches']:
                    assert a['at'] % bar_length == 0, 'support adds independent attacks'
        else:
            simple_rhythm(atoms, bar_length)
            witnesses.append(dict(kind=profile, staff=leadstaff, lowestMidi=low, highestMidi=high,
                                  observedMidi=sorted({p for a in focus for p in a['pitches']})))
    # No long stretches of joint silence, and no entire long study made from a
    # repeated one- or two-bar loop. Repeated motifs inside a form are allowed.
    notes = sounding(events)
    cursor = F(0)
    for a, d, p, s in sorted(notes):
        assert a-cursor <= 1, 'joint silence longer than one quarter'
        cursor = max(cursor, a+d)
    assert duration-cursor <= 1
    if rbars >= 6:
        signature = []
        for bi in range(rbars):
            signature.append(tuple(sorted((str(a-bi*bar_length), str(d), -1 if p is None else p, s, ti, to) for a, d, p, s, ti, to in events if bi*bar_length <= a < (bi+1)*bar_length)))
        for period in (1, 2):
            assert not all(signature[i] == signature[i % period] for i in range(rbars)), 'whole piece is a short loop'
    return dict(events=events, bars=rbars, count=len(rn)+len(ln), right=len(rn), left=len(ln),
                duration=duration, seconds=seconds, witnesses=witnesses[:12])


def read_scores(grade, partial=False):
    source = ROOT/f'buildscripts/pianist/compositions/g{grade}'
    cells = {}
    for li, line in enumerate((source/'cells.txt').read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip() or line.startswith('#'):
            continue
        key, meter, rh, lh = [s.strip() for s in line.split(';')]
        assert key not in cells, f'duplicate cell {key}'
        cells[key] = meter, rh, lh
    forms = {}
    for line in (source/'forms.txt').read_text(encoding='utf-8').splitlines():
        if line.strip() and not line.startswith('#'):
            group, sequence = (s.strip() for s in line.split(';'))
            assert group in BUCKETS and group not in forms
            forms[group] = sequence.split()
    assert set(forms) == set(BUCKETS)
    rows = []
    for li, line in enumerate((source/'studies.txt').read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip() or line.startswith('#'):
            continue
        fields = [s.strip() for s in line.split(';')]
        assert len(fields) == 12, f'studies line {li}: expected number/profile/hand/title and eight explicit cell bindings'
        number, profile, lead, title, *bindings = fields
        slots = dict(zip(('s', 'a', 'c', 'p', 'q', 'r', 't', 'u'), bindings))
        number = int(number)
        for group, form in forms.items():
            sequence = ' '.join(slots[key] for key in form)
            if not sequence.strip():
                assert partial
                continue
            try:
                segments = [cells[key] for key in sequence.split()]
                assert len({s[0] for s in segments}) == 1, 'meter change at a cell join'
                meter = segments[0][0]
                rh, lh = (' | '.join(s[i] for s in segments) for i in (1, 2))
                result = validate(grade, rh, lh, meter, profile, lead)
                bounds = BUCKETS[group]
                assert bounds[0] <= result['count'] <= bounds[1], f'{result["count"]} attacks outside {bounds}'
                row = dict(id=f'g{grade}-{group}-{number:03d}', grade=grade, group=group, number=number,
                           profile=profile, lead=lead, title=title, meter=meter, rh=rh, lh=lh,
                           passages=sequence.split(), source=f'{(source/"studies.txt").relative_to(ROOT).as_posix()}:{li}', **result)
                row['contentHash'] = fingerprint(row['events'], row['duration'])
                row['normalizedHash'] = min(fingerprint(row['events'], row['duration'], True), fingerprint(row['events'], row['duration'], True, True))
                rows.append(row)
            except Exception as exc:
                raise ValueError(f'G{grade} study {number:03d}/{group}: {exc}') from exc
    for group in BUCKETS:
        subset = [r for r in rows if r['group'] == group]
        assert len({r['number'] for r in subset}) == len(subset), 'duplicate study number'
        if not partial:
            assert sorted(r['number'] for r in subset) == list(range(1, 101)), f'{group} incomplete'
            assert Counter(r['profile'] for r in subset) == TARGETS[grade], f'{group} profile quota'
            assert Counter(r['lead'] for r in subset) == {'RH': 50, 'LH': 50}, f'{group} hand balance'
    hashes = {}
    for row in rows:
        assert row['contentHash'] not in hashes, f'exact musical duplicate: {row["id"]} = {hashes.get(row["contentHash"])}'
        hashes[row['contentHash']] = row['id']
    return sorted(rows, key=lambda r: (list(BUCKETS).index(r['group']), r['number']))


def abc(row):
    index = (row['grade']-1)*700 + list(BUCKETS).index(row['group'])*100 + row['number']
    tempo = '3/8=60' if row['meter'] == '6/8' else '1/4=60'
    header = f'''%abc-2.1
X:{index}
T:{row['id']} {row['title']}
C:Nhạc do trợ lý AI biên soạn
M:{row['meter']}
L:1/4
Q:{tempo}
%%score {{ RH | LH }}
V:RH clef=treble name="Piano"
V:LH clef=bass
K:{row.get('key', 'C')}
% grade=G{row['grade']}; profile={row['profile']}; lead={row['lead']}; bucket={row['group']}; notes={row['count']}; RH={row['right']}; LH={row['left']}
% duration60={row['seconds']}s; related_pattern={row['normalizedHash'][:16]}
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
    target = Counter((r['profile'], r['lead']) for r in rows)
    while remaining:
        eligible = [r for r in remaining if r['normalizedHash'] not in recent[-6:]]
        if not eligible:
            eligible = [r for r in remaining if r['normalizedHash'] not in recent[-1:]] or remaining
        row = min(eligible, key=lambda r: (F(counts[r['profile'], r['lead']], target[r['profile'], r['lead']]), r['number']))
        remaining.remove(row)
        result.append(row)
        recent.append(row['normalizedHash'])
        counts[row['profile'], row['lead']] += 1
    return result


def check_converter(job):
    identity, text, index, expected, bars, meter = job
    sys.path.insert(0, str(ROOT/'packages/score-formats/python'))
    from converter import convert
    converted = convert({'operation': 'abc-to-xml', 'text': text, 'tuneIndex': index})
    assert converted['ok'] and not converted['diagnostics'], (identity, converted.get('diagnostics'))
    score = ET.fromstring(converted['text'])
    parts = score.findall('part')
    assert len(parts) == 1 and parts[0].findtext('measure/attributes/staves') == '2', (identity, 'not one two-staff piano part')
    measures = parts[0].findall('measure')
    assert len(measures) == bars, (identity, 'bar count changed')
    actual, origin, divisions = [], F(0), 1
    bar_length = F(meter.split('/')[0])*4/int(meter.split('/')[1])
    first_time = measures[0].find('attributes/time')
    assert f'{first_time.findtext("beats")}/{first_time.findtext("beat-type")}' == meter
    if meter == '6/8':
        metro = measures[0].find('.//metronome')
        assert metro is not None and metro.findtext('beat-unit') == 'quarter' and metro.find('beat-unit-dot') is not None and metro.findtext('per-minute') == '60', (identity, 'compound tempo must use dotted quarters')
    for measure in measures:
        cursor, extent, last_start = F(0), F(0), None
        start_index = len(actual)
        for node in measure:
            if node.tag == 'attributes':
                divisions = int(node.findtext('divisions', str(divisions)))
            elif node.tag in ('backup', 'forward'):
                cursor += F(node.findtext('duration'))/divisions * (-1 if node.tag == 'backup' else 1)
                assert cursor >= 0, (identity, 'negative XML time')
            elif node.tag == 'note':
                duration = F(node.findtext('duration'))/divisions
                chord = node.find('chord') is not None
                if not chord:
                    last_start = cursor
                assert last_start is not None
                p = node.find('pitch')
                pitch = None if p is None else (int(p.findtext('octave'))+1)*12+PC[p.findtext('step')]+int(p.findtext('alter', '0'))
                ties = {tie.attrib['type'] for tie in node.findall('tie')}
                actual.append((origin+last_start, duration, pitch, int(node.findtext('staff', '1')), 'stop' in ties, 'start' in ties))
                if not chord:
                    cursor += duration
                extent = max(extent, last_start+duration)
        assert extent == bar_length, (identity, 'XML bar extent', extent, bar_length)
        for staff in (1, 2):
            if not any(e[3] == staff for e in actual[start_index:]):
                actual.append((origin, bar_length, None, staff, False, False))
        origin += bar_length
    order = lambda e: (e[3], e[0], -999 if e[2] is None else e[2], e[1], e[4], e[5])
    assert sorted(actual, key=order) == sorted(map(tuple, expected), key=order), (identity, 'XML changed a written pitch/rest/onset/duration/chord/staff/tie', sorted(actual, key=order)[:12], sorted(expected, key=order)[:12])
    assert sounding(actual) == sounding(expected), (identity, 'XML changed attacks or tied durations')
    return identity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--grade', type=int, choices=(5, 6, 7, 8), required=True)
    parser.add_argument('--partial', action='store_true')
    parser.add_argument('--convert', action='store_true')
    parser.add_argument('--books', action='store_true')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    rows = read_scores(args.grade, args.partial)
    if args.check_only:
        print(f'G{args.grade}: {len(rows)} authored studies passed source checks')
        return
    output = ROOT/f'scores/composed/g{args.grade}-abc'
    output.mkdir(parents=True, exist_ok=True)
    texts, books, book_rows = {}, {}, {}
    for row in rows:
        path = output/row['group']/(row['id']+'.abc')
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
            (output/'books').mkdir(exist_ok=True)
            (output/'books'/f'g{args.grade}-{group}.abc').write_text(books[group], encoding='utf-8', newline='\n')
    verified = []
    if args.convert:
        jobs = [(r['id'], texts[r['id']], 0, r['events'], r['bars'], r['meter']) for r in rows]
        if args.books:
            for group, book in books.items():
                jobs += [(r['id']+'@book', book, i, r['events'], r['bars'], r['meter']) for i, r in enumerate(book_rows[group])]
        with ProcessPoolExecutor(max_workers=4) as pool:
            for future in as_completed([pool.submit(check_converter, j) for j in jobs]):
                verified.append(future.result())
                if len(verified) % 200 == 0:
                    print(f'G{args.grade} converter {len(verified)}/{len(jobs)}', flush=True)
    coverage = {}
    for group in BUCKETS:
        subset = [r for r in rows if r['group'] == group]
        coverage[group] = dict(count=len(subset), profiles=dict(Counter(r['profile'] for r in subset)),
                               focusHands=dict(Counter(r['lead'] for r in subset)),
                               noteCounts=dict(sorted(Counter(r['count'] for r in subset).items())),
                               meters=dict(Counter(r['meter'] for r in subset)),
                               maxSeconds=float(max((r['seconds'] for r in subset), default=0)))
    normalized = defaultdict(list)
    for row in rows:
        normalized[row['normalizedHash']].append(row['id'])
    report = dict(schemaVersion=2, rules=f'g{args.grade}-authored-cells-v1', total=len(rows), complete=len(rows) == 700 and not args.partial,
                  coverage=coverage, uniqueContent=len(rows), normalizedFamilies=len(normalized),
                  relatedVariants=[v for v in normalized.values() if len(v) > 1], converterChecks=len(verified),
                  individualAndBookVerified=bool(rows) and len(verified) == 2*len(rows),
                  adjacentRelatedPatternsInBooks=[(a['id'], b['id']) for rr in book_rows.values() for a, b in zip(rr, rr[1:]) if a['normalizedHash'] == b['normalizedHash']],
                  review='AI authored cells and explicit orders. Shared motifs and seven length versions are intentional; not 700 unrelated melodies. No teacher review or effectiveness trial.',
                  pieces=[{k: v for k, v in r.items() if k not in ('rh', 'lh', 'events', 'duration')} for r in rows])
    (output/'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str)+'\n', encoding='utf-8')
    columns = ('id', 'group', 'bookPosition', 'profile', 'lead', 'count', 'right', 'left', 'meter', 'bars', 'seconds', 'normalizedHash', 'title')
    (output/'index.tsv').write_text('\t'.join(columns)+'\n'+'\n'.join('\t'.join(str(r[k]) for k in columns) for r in rows)+'\n', encoding='utf-8')
    if report['complete'] and report['individualAndBookVerified']:
        assert (output/'README.md').exists(), 'write the learner guide before the final package'
        with zipfile.ZipFile(output.parent/f'g{args.grade}-abc-700.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(output.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(output.parent))
    print(json.dumps({k: report[k] for k in ('total', 'complete', 'normalizedFamilies', 'converterChecks', 'coverage')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
