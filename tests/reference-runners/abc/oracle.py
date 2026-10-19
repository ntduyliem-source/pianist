"""Build browser cases with CPython originals and independent expectations."""
from pathlib import Path
from fractions import Fraction
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'packages/score-formats/python'))
from converter import convert
from musicxml_summary import summary


def ordered(rows):
    return sorted(rows, key=lambda row: (Fraction(row[0]), str(row[1:])))


def cases():
    fixtures = ROOT / 'tests/fixtures/pianist'
    expected = json.loads((fixtures / 'abc/expected.json').read_text(encoding='utf-8'))
    result = []
    for path in sorted((fixtures / 'abc').glob('*.abc')):
        spec = expected.get(path.name, {})
        job = {'operation': 'abc-to-xml', 'text': path.read_text(encoding='utf-8'), 'tuneIndex': spec.get('tuneIndex', 0)}
        answer = convert(job)
        if spec:
            assert answer['ok'], (path.name, answer)
            actual = summary(answer['text'])
            for key in actual:
                if key in spec:
                    assert actual[key] == ordered(spec[key]), (path.name, key, actual[key], spec[key])
            if 'title' in spec:
                assert answer['title'] == spec['title']
        else:
            assert not answer['ok'], (path.name, 'negative fixture unexpectedly accepted')
        result.append({'name': path.stem, 'job': job, 'expected': answer, 'musicalExpectation': spec})
    paths = sorted((fixtures / 'practice').glob('*.musicxml')) + [fixtures / 'm0/piano.musicxml']
    local = ROOT / 'examples/local/pho-xa.mxl'
    if local.exists():
        paths.append(local)
    for path in paths:
        if path.suffix == '.mxl':
            with zipfile.ZipFile(path) as archive:
                import xml.etree.ElementTree as ET
                container = ET.fromstring(archive.read('META-INF/container.xml'))
                member = next(e.attrib['full-path'] for e in container.iter() if e.tag.endswith('rootfile'))
                xml = archive.read(member).decode('utf-8')
        else:
            xml = path.read_text(encoding='utf-8')
        job = {'operation': 'xml-to-abc', 'text': xml}
        answer = convert(job)
        result.append({'name': path.stem + '-export', 'job': job, 'expected': answer})
        if answer['ok']:
            job = {'operation': 'abc-to-xml', 'text': answer['text']}
            answer = convert(job)
            result.append({'name': path.stem + '-import', 'job': job, 'expected': answer, 'nativeSource': str(path)})
    return result


if __name__ == '__main__':
    output = ROOT / 'artifacts/abc'
    output.mkdir(parents=True, exist_ok=True)
    data = cases()
    (output / 'oracle.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'cases': len(data), 'accepted': sum(c['expected']['ok'] for c in data)}))
