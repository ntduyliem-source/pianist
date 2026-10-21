"""Original CC0 synthetic Q2 fixtures. No melody copied from the source corpus."""
from pathlib import Path


def note(step='C', octave=4, duration=1, *, alter=None, voice='1', staff=1,
         kind='quarter', extra='', attrs=''):
    pitch = '<rest/>' if step is None else f'<pitch><step>{step}</step>' + (
        f'<alter>{alter}</alter>' if alter is not None else '') + f'<octave>{octave}</octave></pitch>'
    chord = '<chord/>' if extra.startswith('<chord/>') else ''
    extra = extra.removeprefix('<chord/>')
    return f'<note {attrs}>{chord}{pitch}<duration>{duration}</duration><voice>{voice}</voice><type>{kind}</type><staff>{staff}</staff>{extra}</note>'


def attributes(divisions=1, staves=1, fifths=0):
    return (f'<attributes><divisions>{divisions}</divisions><key><fifths>{fifths}</fifths></key>'
            f'<time><beats>4</beats><beat-type>4</beat-type></time><staves>{staves}</staves>'
            '<clef number="1"><sign>G</sign><line>2</line></clef>' +
            ('<clef number="2"><sign>F</sign><line>4</line></clef>' if staves == 2 else '') + '</attributes>')


def score(measures, *, title='Q2 original fixture', divisions=1, staves=1, fifths=0):
    return ('<?xml version="1.0" encoding="utf-8"?>\n<score-partwise version="4.0">'
            f'<work><work-title>{title}</work-title></work><identification><rights>CC0-1.0</rights></identification>'
            '<part-list><score-part id="P1"><part-name>Piano</part-name><score-instrument id="I1">'
            '<instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="I1">'
            '<midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part></part-list>'
            '<part id="P1">' + ''.join(f'<measure number="{i + 1}">' +
            (attributes(divisions, staves, fifths) if i == 0 else '') + body + '</measure>'
            for i, body in enumerate(measures)) + '</part></score-partwise>\n').encode()


def direction(kind, attrs, offset=0, staff=1):
    return f'<direction><direction-type><{kind} {attrs}/></direction-type><offset>{offset}</offset><staff>{staff}</staff></direction>'


def fixtures():
    n = note
    return {
        'spelled-intervals': score([
            n('E') + n('F') + n(None, duration=2, kind='half'),
            n('C') + n('C', alter=1) + n(None, duration=2, kind='half'),
            n('C') + n('D', alter=-1) + n(None, duration=2, kind='half')]),
        'accidental-bars': score([
            n('F', alter=1, extra='<accidental>sharp</accidental>') + n('F', alter=1) +
            n('F', alter=0, extra='<accidental>natural</accidental>') + n('F', alter=0),
            n('F', alter=1) + n('G') + n('F', alter=1) + n(None)], fifths=1),
        'tie-unison': score([
            n('C', duration=4, kind='whole', extra='<tie type="start"/><notations><tied type="start"/></notations>') +
            '<backup><duration>4</duration></backup>' + n('C', duration=2, voice='5', staff=2, kind='half') +
            n('G', 3, 2, voice='5', staff=2, kind='half'),
            n('C', duration=2, kind='half', extra='<tie type="stop"/><notations><tied type="stop"/></notations>') +
            n('D', duration=2, kind='half') + '<backup><duration>4</duration></backup>' +
            n('C', 3, 4, voice='5', staff=2, kind='whole')], staves=2),
        'unequal-chord': score([n('C', duration=2, kind='half') + n('E', extra='<chord/>') + n('G', duration=2, kind='half')]),
        'backup-forward-voices': score([
            n('C') + '<forward><duration>1</duration><voice>1</voice></forward>' + n('E', duration=2, kind='half') +
            '<backup><duration>4</duration></backup>' + n('G', 3, 2, voice='2', kind='half') + n('A', 3, 2, voice='2', kind='half')]),
        'clef-changes': score([
            n('C', duration=4, kind='whole') + '<backup><duration>4</duration></backup>' + n('C', 3, 4, voice='5', staff=2, kind='whole'),
            '<attributes><clef><sign>F</sign><line>4</line></clef><clef number="2"><sign>G</sign><line>2</line></clef></attributes>' +
            n('C', 3, 4, kind='whole') + '<backup><duration>4</duration></backup>' + n('C', 5, 4, voice='5', staff=2, kind='whole')], staves=2),
        'ottava': score([direction('octave-shift', 'type="down" size="8" number="1"') +
            n('C', 6) + n('D', 6) + direction('octave-shift', 'type="stop" size="8" number="1"') + n('C', 5) + n('B', 4)]),
        'rational-triplet': score([''.join(n(s, duration=1, kind='eighth',
            extra='<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>eighth</normal-type></time-modification>')
            for s in 'CDE') + n(None, duration=9, kind='half', extra='<dot/>')], divisions=3),
        'pedal-offsets': score([direction('pedal', 'type="start" line="yes" number="1"') +
            n('C', duration=2) + direction('pedal', 'type="change" line="yes" number="1"', -1) +
            n('D', duration=2) + n('E', duration=2) + direction('pedal', 'type="stop" line="yes" number="1"') + n('F', duration=2)], divisions=2),
        'negative-backup': score([n('C') + '<backup><duration>2</duration></backup>' + n('D', duration=3, kind='half', extra='<dot/>')]),
        'unclosed-tie': score([n('C', duration=4, kind='whole', extra='<tie type="start"/>')]),
        'unsupported-grace': score(['<note><grace/><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note>' + n('C', duration=4, kind='whole')]),
    }


if __name__ == '__main__':
    destination = Path(__file__).resolve().parents[1] / 'fixtures/pianist/curriculum'
    destination.mkdir(parents=True, exist_ok=True)
    for name, data in fixtures().items():
        (destination / f'{name}.musicxml').write_bytes(data)
