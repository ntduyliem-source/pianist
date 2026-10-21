"""Original CC0 Q3 fixtures. Never counted as authentic corpus fragments."""
from fixtures_q2 import note, score, direction


def fixtures():
    def bar(steps, octave=4, **kwargs):
        return ''.join(note(s, octave, **kwargs) for s in steps)
    tied_start = '<tie type="start"/><notations><tied type="start"/></notations>'
    tied_stop = '<tie type="stop"/><notations><tied type="stop"/></notations>'
    n = note
    return {
        'g1-steps': score([bar('CDED'), bar('DCDC')]),
        'g1-long': score([n('C', duration=2, kind='half')+n('D', duration=2, kind='half'),
                          n('E', duration=2, kind='half')+n('D', duration=2, kind='half')]),
        'g1-rest': score([n('C')+n('D')+n(None)+n('C'),bar('CDED')]),
        'g2-thirds': score([bar('CEDC'),bar('CDEC')]),
        'g2-eighths': score([bar('CDED', duration=1, kind='eighth') + n('D',duration=2)+n('C',duration=2)],divisions=2),
        'g3-triad': score([bar('CEGC'),bar('DEGC')]),
        'g4-position': score([bar('GABA'),bar('BAGG')],fifths=1),
        'g5-both': score([bar('CDED')+'<backup><duration>4</duration></backup>'+n('C',3,4,kind='whole',voice='5',staff=2),
                          bar('DCDC')+'<backup><duration>4</duration></backup>'+n('D',3,4,kind='whole',voice='5',staff=2)],staves=2),
        'g6-leap': score([n('C',duration=2,kind='half')+n('C',5)+n('D',5),
                         n('C',5,2,kind='half')+n('C')+n('D')]),
        'g7-dotted': score([n('C',duration=3,kind='quarter',extra='<dot/>')+n('D',duration=1,kind='eighth')+n('E',duration=2)+n('D',duration=2)],divisions=2),
        'g7-tied': score([n('C',kind='eighth')+n('D',kind='eighth',extra=tied_start)+n('D',kind='eighth',extra=tied_stop)+n('E',kind='eighth')+n('D',duration=2)+n('C',duration=2)],divisions=2),
        'g7-syncopation': score([n('C',kind='eighth')+n('D',duration=2)+n('E',kind='eighth')+n('D',duration=2)+n('C',duration=2)],divisions=2),
        'g7-compound': score([bar('CDE',kind='eighth')+n('D',duration=2)+n('C',kind='eighth')],divisions=2).replace(b'<beats>4</beats><beat-type>4',b'<beats>6</beats><beat-type>8'),
        'g8-register': score([bar('CDED',6),bar('DCDC',6)]),
        'cut-tie': score([bar('CDE')+n('F',extra=tied_start), n('F',extra=tied_stop)+bar('EDC')]),
        'cut-pedal': score([direction('pedal','type="start" line="yes"')+bar('CDED'),bar('DCDC')+direction('pedal','type="stop" line="yes"')]),
        'cut-slur': score([n('C',extra='<notations><slur type="start" number="1"/></notations>')+bar('DED'),bar('DCD')+n('C',extra='<notations><slur type="stop" number="1"/></notations>')]),
        'recover-clean-bar': score(['<direction><direction-type><words>rit.</words></direction-type></direction>'+bar('CDED'),bar('DCDC')]),
    }


EXPECTED = {
    'g1-steps': 'g1-direction-quarters', 'g1-long': 'g1-direction-long', 'g1-rest': 'g1-direction-rests',
    'g2-thirds': 'g2-third-known-rhythm', 'g2-eighths': 'g2-paired-eighths-steps',
    'g3-triad': 'g3-triad-fourth-fifth', 'g4-position': 'g4-new-position',
    'g5-both': 'g5-melody-held-bass', 'g6-leap': 'g6-prepared-leap',
    'g7-dotted': 'g7-dotted-pair', 'g7-tied': 'g7-offbeat-tie',
    'g7-syncopation': 'g7-syncopated-cell', 'g7-compound': 'g7-compound-beat',
    'g8-register': 'g8-familiar-pattern-new-register',
}
