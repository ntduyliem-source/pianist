"""Generate original CC0 scores with small, independently checkable timelines."""
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'tests/fixtures/pianist/practice'
def note(step, octave=4, duration=4, voice=1, staff=1, extra='', kind='quarter'):
    return f'<note><pitch><step>{step}</step><octave>{octave}</octave></pitch><duration>{duration}</duration><voice>{voice}</voice><type>{kind}</type><staff>{staff}</staff>{extra}</note>'

def score(name, measures, beats=1, staves=1):
    attributes = f'<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>{beats}</beats><beat-type>4</beat-type></time><staves>{staves}</staves><clef number="1"><sign>G</sign><line>2</line></clef>'
    if staves == 2:
        attributes += '<clef number="2"><sign>F</sign><line>4</line></clef>'
    attributes += '</attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>'
    parts = ''.join(f'<measure number="{i + 1}">{attributes if i == 0 else ""}{body}</measure>' for i, body in enumerate(measures))
    xml = f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Original Pianist test composition, CC0. -->
<score-partwise version="4.0"><work><work-title>{name}</work-title></work><identification><rights>CC0</rights></identification><part-list><score-part id="P1"><part-name>Piano</part-name><score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part></part-list><part id="P1">{parts}</part></score-partwise>'''
    (OUT / (name + '.musicxml')).write_text(xml, encoding='utf-8')

score('volta', [
    '<barline location="left"><repeat direction="forward"/></barline>' + note('C'),
    '<barline location="left"><ending number="1" type="start"/></barline>' + note('D') + '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>',
    '<barline location="left"><ending number="2" type="start"/></barline>' + note('E') + '<barline location="right"><ending number="2" type="stop"/></barline>',
])
score('da-capo', [note('C'), note('D') + '<direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>',
    note('E') + '<direction><direction-type><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction>'])
score('dal-segno-coda', [note('C'),
    '<direction><direction-type><segno/></direction-type><sound segno="S"/></direction>' + note('D'),
    note('E') + '<direction><direction-type><words>To Coda</words></direction-type><sound tocoda="C"/></direction>',
    note('F') + '<direction><direction-type><words>D.S. al Coda</words></direction-type><sound dalsegno="S"/></direction>',
    '<direction><direction-type><coda/></direction-type><sound coda="C"/></direction>' + note('G')])
score('cross-staff', [note('C') + note('D', staff=2) + note('E') + note('F', staff=2)
    + '<backup><duration>16</duration></backup>' + note('C', 3, 16, 5, 2, kind='whole')], beats=4, staves=2)
score('same-staff-voices', [note('C') + note('D') + note('E') + note('F')
    + '<backup><duration>16</duration></backup>' + note('G', 3, 16, 2, 1, kind='whole')], beats=4)
grace = '<note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice><type>eighth</type><staff>1</staff></note>'
arpeggio = '<notations><arpeggiate/></notations>'
chord = lambda step: note(step, extra=arpeggio).replace('<note>', '<note><chord/>')
score('special-symbols', [grace + note('C', extra=arpeggio) + chord('E') + chord('G')
    + note('D', extra='<notations><ornaments><trill-mark/></ornaments></notations>')
    + note('E', duration=8, kind='half', extra='<notations><fermata type="upright">normal</fermata></notations>')], beats=4)
print('Prepared volta, Da Capo, Dal Segno/Coda, cross-staff and special-symbol policy fixtures.')
