"""Independent MusicXML event reader used only for converter verification."""
from fractions import Fraction
from pathlib import Path
import json
import sys
import xml.etree.ElementTree as ET


def summary(text):
    root = ET.fromstring(text)
    result = {'notes': [], 'tempos': [], 'pedals': [], 'ties': [], 'staccato': [], 'meters': []}
    for part in root.findall('part'):
        origin, divisions = Fraction(0), 1
        for measure in part.findall('measure'):
            cursor = extent = previous = Fraction(0)
            for node in measure:
                if node.tag == 'attributes':
                    if node.find('divisions') is not None:
                        divisions = int(node.findtext('divisions'))
                    time = node.find('time')
                    if time is not None:
                        result['meters'].append([str(origin + cursor), int(time.findtext('beats')), int(time.findtext('beat-type'))])
                elif node.tag in ('forward', 'backup'):
                    cursor += Fraction(node.findtext('duration')) / divisions * (-1 if node.tag == 'backup' else 1)
                    extent = max(extent, cursor)
                elif node.tag == 'direction':
                    at = origin + cursor + Fraction(node.findtext('offset', '0')) / divisions
                    sound = node.find('sound')
                    if sound is not None and 'tempo' in sound.attrib:
                        result['tempos'].append([str(at), str(Fraction(sound.attrib['tempo']))])
                    for pedal in node.findall('direction-type/pedal'):
                        result['pedals'].append([str(at), pedal.attrib['type']])
                elif node.tag == 'note':
                    duration = Fraction(node.findtext('duration', '0')) / divisions
                    at = previous if node.find('chord') is not None else cursor
                    if node.find('chord') is None:
                        previous = cursor
                        cursor += duration
                    extent = max(extent, at + duration, cursor)
                    pitch = node.find('pitch')
                    if pitch is None or node.find('grace') is not None:
                        continue
                    midi = (int(pitch.findtext('octave')) + 1) * 12 + {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[pitch.findtext('step')] + int(pitch.findtext('alter', '0'))
                    result['notes'].append([str(origin + at), midi, str(duration), int(node.findtext('staff', '1'))])
                    for tie in node.findall('tie'):
                        result['ties'].append([str(origin + at), midi, tie.attrib['type']])
                    if node.find('notations/articulations/staccato') is not None:
                        result['staccato'].append([str(origin + at), midi])
            origin += extent
    for key in result:
        result[key].sort(key=lambda row: (Fraction(row[0]), str(row[1:])))
    return result


if __name__ == '__main__':
    print(json.dumps(summary(Path(sys.argv[1]).read_text(encoding='utf-8')), ensure_ascii=False))
