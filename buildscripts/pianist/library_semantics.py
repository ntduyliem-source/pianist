"""Read-only MusicXML event comparison; does not rewrite or invent score events."""
from fractions import Fraction as Q
from xml.etree import ElementTree as E
import json, hashlib
from library_staff_policy import read_musicxml

def normalized(data):
    _, score = read_musicxml(data)
    result = dict(notes=[], rests=[], measures=[], keys=[], meters=[], clefs=[], pedals=[],
                  repeats=[], endings=[], sound=[], dynamics=[], words=[], rehearsals=[], fermatas=[], jumps=[],
                  harmonies=[], glissandi=[], timeModifications=[])
    for pi, part in enumerate(score.findall('part')):
        divisions = Q(1)
        for mi, measure in enumerate(part.findall('measure')):
            at = Q(0); last = Q(0); extent = Q(0)
            for node in measure:
                location = [pi, mi + 1, str(at)]
                if node.tag == 'attributes':
                    if node.find('divisions') is not None:
                        divisions = Q(node.findtext('divisions'))
                    for key in node.findall('key'):
                        result['keys'].append(location + [key.get('number', 'all'), key.findtext('fifths'), key.findtext('mode','major')])
                    for time in node.findall('time'):
                        result['meters'].append(location + [time.get('number','all'), time.findtext('beats'), time.findtext('beat-type')])
                    for clef in node.findall('clef'):
                        result['clefs'].append(location + [int(clef.get('number','1')), clef.findtext('sign'), clef.findtext('line'), clef.findtext('clef-octave-change','0')])
                elif node.tag in ('backup','forward'):
                    amount = Q(node.findtext('duration','0')) / divisions
                    at += amount if node.tag == 'forward' else -amount
                    assert at >= 0, ('negative cursor', mi + 1)
                    extent = max(extent, at)
                elif node.tag == 'note':
                    duration = Q(node.findtext('duration','0')) / divisions
                    onset = last if node.find('chord') is not None else at
                    staff = int(node.findtext('staff','1'))
                    base = [pi, mi + 1, str(onset), str(duration), staff]
                    pitch = node.find('pitch')
                    if pitch is not None:
                        spelling = [pitch.findtext('step'), str(Q(pitch.findtext('alter','0'))), int(pitch.findtext('octave'))]
                        midi = 12 * (spelling[2]+1) + {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[spelling[0]] + Q(spelling[1])
                        ties = sorted(t.get('type') for t in node.findall('tie'))
                        result['notes'].append(base + [str(midi), spelling, ties, node.find('grace') is not None])
                    elif node.find('rest') is not None:
                        result['rests'].append(base)
                    else:
                        raise ValueError('Unsupported unpitched event')
                    for fermata in node.findall('notations/fermata'):
                        result['fermatas'].append(base[:3] + [staff, fermata.get('type','upright'), (fermata.text or 'normal').strip()])
                    for gliss in node.findall('notations/glissando'):
                        result['glissandi'].append(base[:3] + [staff, gliss.get('type'), gliss.get('line-type','wavy'), (gliss.text or '').strip()])
                    for ratio in node.findall('time-modification'):
                        result['timeModifications'].append(base + [str(Q(ratio.findtext('actual-notes'))/Q(ratio.findtext('normal-notes')))])
                    if node.find('chord') is None:
                        last = at
                        at += duration
                    extent = max(extent, onset+duration, at)
                elif node.tag == 'direction':
                    stamp = [pi, mi+1, str(at + Q(node.findtext('offset','0'))/divisions), int(node.findtext('staff','1'))]
                    for direction in node.findall('direction-type'):
                        for value in direction:
                            if value.tag == 'pedal':
                                result['pedals'].append(stamp + [value.get('type'), value.get('line','no'), value.get('sign','no')])
                            elif value.tag == 'dynamics':
                                result['dynamics'].append(stamp + [[n.tag for n in value]])
                            elif value.tag in ('words','rehearsal'):
                                result['words' if value.tag == 'words' else 'rehearsals'].append(stamp + [''.join(value.itertext()).strip()])
                            elif value.tag in ('coda','segno'):
                                result['jumps'].append(stamp + [value.tag])
                    for sound in node.findall('sound'):
                        attrs = dict(sound.attrib)
                        # MusicXML dynamics is percent of MIDI forte velocity 90.
                        # Compare integer playback velocity, not export decimal rounding.
                        if 'dynamics' in attrs:
                            attrs['dynamicsMidiVelocity'] = int(Q(attrs.pop('dynamics')) * Q(9,10) + Q(1,2))
                        result['sound'].append(stamp + [attrs])
                elif node.tag == 'harmony':
                    stamp=[pi,mi+1,str(at+Q(node.findtext('offset','0'))/divisions),int(node.findtext('staff','1'))]
                    degrees=sorted((d.findtext('degree-value'),d.findtext('degree-alter','0'),d.findtext('degree-type')) for d in node.findall('degree'))
                    result['harmonies'].append(stamp + [node.findtext('root/root-step'),node.findtext('root/root-alter','0'),node.findtext('kind'),node.findtext('bass/bass-step'),node.findtext('bass/bass-alter','0'),node.findtext('inversion','0'),degrees])
                elif node.tag == 'barline':
                    for repeat in node.findall('repeat'):
                        result['repeats'].append([pi,mi+1,node.get('location','right'),repeat.get('direction'),int(repeat.get('times','2'))])
                    for ending in node.findall('ending'):
                        result['endings'].append([pi,mi+1,node.get('location','right'),ending.get('number'),ending.get('type')])
            result['measures'].append([pi,mi+1,str(extent)])
    # A clef at the previous bar's end and the next bar's beginning are the
    # same score tick. MuseScore exports the latter representation.
    starts={}; total={}
    for part, measure, duration in result['measures']:
        starts[(part,measure)]=total.get(part,Q(0)); total[part]=starts[(part,measure)]+Q(duration)
    result['clefs']=[[part,str(starts[(part,measure)]+Q(at)),*values] for part,measure,at,*values in result['clefs']]
    # MuseScore omits repeated key declarations that do not change the key.
    # Compare effective changes, not redundant MusicXML attributes.
    keys = []
    active_keys = {}
    for event in result['keys']:
        part, measure, at, staff, fifths, mode = event
        identity = (part, staff)
        if active_keys.get(identity, ('0', 'major')) != (fifths, mode):
            keys.append(event)
            active_keys[identity] = (fifths, mode)
    result['keys'] = keys
    for key in result:
        result[key].sort(key=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True))
    return result

def digest(data):
    return hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
