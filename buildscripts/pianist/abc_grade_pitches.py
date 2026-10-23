"""Written-pitch admission rules shared by the eight composed-score validators.

This is a validator for the authored ABC subset, not a music generator or
converter. Spelling and measure accidental state follow pinned abc2xml 2.68
MusicXml.mkPitch. Conversion parity tests remain the independent oracle.
"""
from fractions import Fraction as F
import re

PC = dict(zip('CDEFGAB', (0, 2, 4, 5, 7, 9, 11)))
PITCH = r'(?:\^\^|__|\^|_|=)?[A-Ga-g][,\']*'
NOTE = re.compile(r'(\^\^|__|\^|_|=)?([A-Ga-g])([,\']*)')
BASIC = re.compile(r'(' + PITCH + r'|z)(/2|[234])?')
# Internal admission ceilings, not examination grades or validated learning
# thresholds. G8 covers both ends of the 88-key piano without an octave rewrite.
LEDGER_LIMIT = {1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 9}
SMALL_INTERVALS = {(0, 0), (1, 1), (1, 2), (2, 3), (2, 4), (3, 5), (4, 7)}


class WrittenPitch(int):
    def __new__(cls, midi, degree, alteration=0, identity=None):
        obj = int.__new__(cls, midi)
        obj.degree, obj.alteration = degree, alteration
        obj.identity = identity
        return obj

    def __reduce__(self):
        return WrittenPitch, (int(self), self.degree, self.alteration, self.identity)


def degree(pitch):
    if isinstance(pitch, WrittenPitch):
        return pitch.degree
    # Legacy natural-pitch callers have an unambiguous spelling. Never guess
    # an enharmonic spelling from a chromatic MIDI number.
    assert pitch % 12 in PC.values(), 'chromatic interval requires written pitch spelling'
    return (pitch // 12 - 1) * 7 + list(PC.values()).index(pitch % 12)


def matches_interval(first, second, pairs):
    steps, semitones = degree(second)-degree(first), int(second)-int(first)
    return (abs(steps), abs(semitones)) in pairs and (steps == semitones == 0 or steps*semitones > 0)


def small_interval(first, second, maximum=4):
    return abs(degree(second)-degree(first)) <= maximum and matches_interval(first, second, SMALL_INTERVALS)


class PitchContext:
    def __init__(self, key='C'):
        match = re.fullmatch(r'([A-G][#b]?)\s*(maj(?:or)?|m|min(?:or)?)?', key.strip(), re.I)
        assert match, 'supported key must be a major or minor signature'
        tonic, mode = match.groups()
        tonic = tonic[0].upper() + tonic[1:]
        sharpness = ['Fb', 'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']
        assert tonic in sharpness, 'unsupported key signature'
        fifths = sharpness.index(tonic) - 8 - (3 if mode and mode.lower() in ('m', 'min', 'minor') else 0)
        assert -7 <= fifths <= 7, 'key signature outside seven accidentals'
        letters = 'FCGDAEB'[:fifths] if fifths >= 0 else 'BEADGCF'[:-fifths]
        self.key = {letter: 1 if fifths >= 0 else -1 for letter in letters}
        self.measure = {}

    def bar(self):
        self.measure.clear()

    def decode(self, token, tied=()):
        match = NOTE.fullmatch(token)
        assert match, f'unsupported written pitch {token!r}'
        accidental, letter, marks = match.groups()
        assert not (',' in marks and "'" in marks), 'mixed octave marks'
        octave = (5 if letter.islower() else 4) - marks.count(',') + marks.count("'")
        name = letter.upper()
        written_degree = octave * 7 + 'CDEFGAB'.index(name)
        # abc2xml keys ties by (original case-sensitive note letter, octave
        # offset), not by MIDI or normalized staff position (mkNote: ptup).
        identity = (letter, marks.count("'") - marks.count(','))
        carry = next((p for p in tied if p.identity == identity), None)
        if carry is not None:
            alteration = carry.alteration
        else:
            if accidental:
                self.measure[name, octave] = {'^': 1, '^^': 2, '_': -1, '__': -2, '=': 0}[accidental]
            alteration = self.measure.get((name, octave), self.key.get(name, 0))
        midi = (octave + 1) * 12 + PC[name] + alteration
        assert 21 <= midi <= 108, f'pitch outside A0–C8: {token}'
        return WrittenPitch(midi, written_degree, alteration, identity)


def ledger_lines(pitch, staff):
    bottom, top = (30, 38) if staff == 1 else (18, 26)  # treble E4–F5; bass G2–A3
    return max(0, (bottom - degree(pitch)) // 2, (degree(pitch) - top) // 2)


def pitch_load(events, grade):
    for event in events:
        pitch, staff = event[2], event[3]
        if pitch is not None:
            assert 21 <= pitch <= 108, 'pitch outside A0–C8'
            assert ledger_lines(pitch, staff) <= LEDGER_LIMIT[grade], f'ledger reading exceeds G{grade}'
            assert grade == 8 or abs(getattr(pitch, 'alteration', 0)) <= 1, 'double accidental reserved for G8'


def hand_ranges(right, left, focus_span=7, support_span=7, leadstaff=1):
    rn = [e[2] for e in right if e[2] is not None]
    ln = [e[2] for e in left if e[2] is not None]
    assert rn and ln, 'both hands must contain real notes'
    assert max(ln) < min(rn), 'hands cross or overlap keyboard regions'
    for staff, notes in ((1, rn), (2, ln)):
        assert max(notes) - min(notes) <= (focus_span if staff == leadstaff else support_span), 'hand leaves allowed pitch span'


def parse_basic(body, meter, staff, maximum, grade, key='C'):
    assert staff in (1, 2) and meter in (2, 3, 4), 'unsupported staff or meter'
    context = PitchContext(key)
    events, intervals, previous = [], [], None
    bars = body.split('|')
    for bi, bar in enumerate(bars):
        context.bar()
        cursor, offset, parsed = F(0), 0, []
        while offset < len(bar):
            if bar[offset].isspace():
                offset += 1
                continue
            match = BASIC.match(bar, offset)
            assert match, f'unsupported ABC near {bar[offset:]!r}'
            token, length = match.groups()
            offset = match.end()
            duration = F(1, 2) if length == '/2' else F(int(length or 1))
            assert grade > 1 or duration.denominator == 1, 'G1 introduces no eighth notes'
            if token == 'z':
                assert duration == 1 or (cursor == 0 and duration == meter), 'rest placement'
                pitch = None
            else:
                pitch = context.decode(token)
                if previous is not None:
                    distance = abs(degree(pitch)-degree(previous))
                    assert small_interval(previous, pitch, maximum), 'leap exceeds supported written/semitone interval pairs'
                    intervals.append(distance)
                previous = pitch
                if duration == 2:
                    assert cursor in ({0, 2} if meter == 4 else {0, 1} if meter == 3 else {0}), 'half note syncopation'
                if duration >= 3:
                    assert cursor == 0 and duration == meter, 'long note must fill bar'
            parsed.append((bi*meter+cursor, duration, pitch, staff))
            cursor += duration
        assert cursor == meter, f'bar {bi+1}: {cursor}, expected {meter}'
        for i, (onset, duration, pitch, _) in enumerate(parsed):
            if duration == F(1, 2):
                if onset.denominator == 1:
                    assert i+1 < len(parsed) and parsed[i+1][1] == F(1, 2) and parsed[i+1][2] is not None, 'unpaired eighth'
                else:
                    assert i > 0 and parsed[i-1][1] == F(1, 2) and parsed[i-1][0].denominator == 1, 'offbeat eighth pair'
        events += parsed
    pitch_load(events, grade)
    return events, intervals, len(bars)
