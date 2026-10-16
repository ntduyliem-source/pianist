"""Independent MusicXML semantics used by the M0 round-trip acceptance check."""
from fractions import Fraction
from pathlib import Path
import json
import sys
import xml.etree.ElementTree as ET

root = ET.parse(Path(sys.argv[1])).getroot()
events = []
for part in root.findall('part'):
    divisions = 1
    for index, measure in enumerate(part.findall('measure')):
        position, previous = Fraction(0), Fraction(0)
        for element in measure:
            if element.tag == 'attributes':
                divisions = int(element.findtext('divisions', divisions))
            elif element.tag in ('backup', 'forward'):
                duration = Fraction(int(element.findtext('duration')), divisions)
                position += -duration if element.tag == 'backup' else duration
            elif element.tag == 'note':
                duration = Fraction(int(element.findtext('duration', '0')), divisions)
                chord = element.find('chord') is not None
                start = previous if chord else position
                pitch = element.find('pitch')
                midi = None if pitch is None else 12 * (int(pitch.findtext('octave')) + 1) + {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[pitch.findtext('step')] + int(pitch.findtext('alter', '0'))
                events.append({'measure':index, 'onset':str(start), 'duration':str(duration), 'staff':int(element.findtext('staff','1')), 'midi':midi})
                if not chord:
                    previous = start
                    position += duration
events.sort(key=lambda event: (event['measure'], event['staff'], Fraction(event['onset']), -1 if event['midi'] is None else event['midi']))
print(json.dumps(events))
