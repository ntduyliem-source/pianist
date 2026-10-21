"""Reproduce Q2 originals + music21 analyses for the independent native oracle."""
from pathlib import Path
import sys
from curriculum_normalize import normalize, piano_xml, encoded, digest
from curriculum_io import write_json

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/curriculum'))
from fixtures_q2 import fixtures

COUNTS = {'spelled-intervals':6,'accidental-bars':7,'tie-unison':4,'backup-forward-voices':4,
          'clef-changes':4,'ottava':4,'rational-triplet':3,'pedal-offsets':4}
# MuseScore serializes a boundary clef at the END of the preceding measure.
# Compare its actual saved notation, in addition to pitch/tick semantics.
NOTATION = {'clef-changes': {'clefs':[[0,0,'G'],[0,0,'F'],[1,0,'F'],[1,0,'G']], 'ottavas':[]},
            'ottava': {'clefs':[[0,0,'G']], 'ottavas':['8va']}}


def main():
    destination = ROOT / 'artifacts/q2-fixtures'
    destination.mkdir(parents=True, exist_ok=True)
    entries = []
    for name, generated in sorted(fixtures().items()):
        source = ROOT / f'tests/fixtures/pianist/curriculum/{name}.musicxml'
        if source.read_bytes() != generated:
            raise ValueError(f'Original fixture changed: regenerate and review {name}')
        analysis = normalize(generated)
        raw = encoded(analysis).encode()
        xml, _ = piano_xml(generated)
        json_path = destination / (name + '.json')
        xml_path = destination / (name + '.musicxml')
        json_path.write_bytes(raw)
        xml_path.write_bytes(xml)
        entries.append({'id':name, 'xml':str(xml_path), 'analysis':str(json_path),
                        'analysisSha256':digest(raw), 'expectEligible':name in COUNTS,
                        **({'expectedNotation':NOTATION[name]} if name in NOTATION else {}),
                        **({'expectedTargets':COUNTS[name]} if name in COUNTS else {})})
    write_json(destination / 'jobs.json', {'pipeline':'q2-fixtures','entries':entries})
    print(f'Prepared {len(entries)} fixture/native jobs')


if __name__ == '__main__':
    main()
