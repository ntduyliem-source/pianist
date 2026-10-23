"""Publish the existing G1--G8 authored ABC collection as a lazy MXL bank.

No music is generated or repaired here. Every ABC is checked against its
existing authored-source validator, then upstream abc2xml output is compared
event-for-event before packaging. A failed conversion never changes the active
manifest. Old releases and source ABC files are left in place.
"""
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
import csv
from fractions import Fraction as F
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from grade_definition import (BUCKETS, GRADES, GRADE_METADATA, QUOTA, PER_GRADE, TOTAL,
                              GENERATED_ROOT, DEFINITION_PATH, KIND, length_buckets)
PC = dict(zip('CDEFGAB', (0, 2, 4, 5, 7, 9, 11)))


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def asset(path, data):
    return {'path': path, 'bytes': len(data), 'sha256': sha(data)}


def load_module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).with_name(name+'.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_jobs(source):
    """Read all 5,600 existing files; bind them to source rules and book order."""
    jobs = []
    advanced = load_module('package-advanced-abc')
    for grade in GRADES:
        module = load_module(GRADE_METADATA[grade]['validator']) if grade < 5 else advanced
        rows = module.read_scores() if grade < 5 else module.read_scores(grade)
        folder = source/f'g{grade}-abc'
        with (folder/'index.tsv').open(encoding='utf-8', newline='') as stream:
            index_rows = list(csv.DictReader(stream, delimiter='\t'))
        index = {r['id']: r for r in index_rows}
        if len(rows) != PER_GRADE or len(index) != PER_GRADE or len(index_rows) != PER_GRADE:
            raise ValueError(f'G{grade}: expected exactly {PER_GRADE} distinct source/index rows')
        actual_files = set(folder.glob('n*/*.abc'))
        expected_files = {folder/r['group']/(r['id']+'.abc') for r in rows}
        if actual_files != expected_files:
            raise ValueError(f'G{grade}: ABC inventory differs from authored source')
        for bucket in BUCKETS:
            ordered = module.reading_order([r for r in rows if r['group'] == bucket])
            expected_book = '\n'.join(module.abc(r) for r in ordered)
            if (folder/'books'/f'g{grade}-{bucket}.abc').read_text(encoding='utf-8') != expected_book:
                raise ValueError(f'G{grade}/{bucket}: book order/content differs from source')
            for position, row in enumerate(ordered, 1):
                recorded = index[row['id']]
                for field, value in [('group', bucket), ('bookPosition', position), ('count', row['count']),
                                     ('right', row['right']), ('left', row['left']), ('bars', row['bars'])]:
                    if str(recorded[field]) != str(value):
                        raise ValueError(f'{row["id"]}: index {field} differs from source')
                path = folder/bucket/(row['id']+'.abc')
                data = path.read_bytes()
                text = data.decode('utf-8')
                if text.replace('\r\n', '\n') != module.abc(row):
                    raise ValueError(f'{row["id"]}: ABC differs from authored source')
                events = [tuple(e) + ((False, False) if len(e) == 4 else ()) for e in row['events']]
                jobs.append({'scoreId': row['id'], 'grade': grade, 'lengthBucket': bucket,
                             'bookPosition': position, 'title': row['title'], 'text': text,
                             'abcSha256': sha(data), 'events': events, 'bars': row['bars'],
                             'meter': str(row['meter'])+'/4' if grade < 5 else row['meter'],
                             'targetCount': row['count'], 'countRight': row['right'], 'countLeft': row['left'],
                             'motifGroupId': row['normalizedHash'], 'sourceId': f'g{grade}-study-{row["number"]:03d}',
                             'profiles': [row.get('profile', row.get('role', 'authored'))]})
        print(f'G{grade}: {PER_GRADE} ABC source files, authored rules and book order verified', flush=True)
    return jobs


def ordered(events):
    return sorted(events, key=lambda e: (e[3], e[0], -999 if e[2] is None else e[2], e[1], e[4], e[5]))


def verify_xml(text, job):
    """Compare exact written events, including chord members and both tie ends."""
    score = ET.fromstring(text)
    parts = score.findall('part')
    if score.tag != 'score-partwise' or len(parts) != 1 or parts[0].findtext('measure/attributes/staves') != '2':
        raise ValueError(job['scoreId']+': expected one piano part with two real staves')
    measures = parts[0].findall('measure')
    if len(measures) != job['bars']:
        raise ValueError(job['scoreId']+': changed measure count')
    time = measures[0].find('attributes/time')
    if time is None or f'{time.findtext("beats")}/{time.findtext("beat-type")}' != job['meter']:
        raise ValueError(job['scoreId']+': changed meter')
    compound = job['meter'] == '6/8'
    metro = measures[0].find('.//metronome')
    if metro is None or metro.findtext('beat-unit') != 'quarter' or (metro.find('beat-unit-dot') is not None) != compound or metro.findtext('per-minute') != '60':
        raise ValueError(job['scoreId']+': changed reference tempo/beat unit')
    tempos = [F(s.attrib['tempo']) for s in score.iter('sound') if 'tempo' in s.attrib]
    if not tempos or any(t != (90 if compound else 60) for t in tempos):
        raise ValueError(job['scoreId']+': changed playback tempo')
    numerator, denominator = map(int, job['meter'].split('/'))
    bar_length = F(numerator*4, denominator)
    actual, origin, divisions = [], F(0), 1
    for measure in measures:
        cursor, extent, previous = F(0), F(0), None
        first = len(actual)
        for node in measure:
            if node.tag == 'attributes':
                divisions = int(node.findtext('divisions', str(divisions)))
            elif node.tag in ('backup', 'forward'):
                cursor += F(node.findtext('duration'))/divisions * (-1 if node.tag == 'backup' else 1)
                if cursor < 0:
                    raise ValueError(job['scoreId']+': negative XML time')
            elif node.tag == 'note':
                duration = F(node.findtext('duration'))/divisions
                chord = node.find('chord') is not None
                if not chord:
                    previous = cursor
                if previous is None or node.find('grace') is not None:
                    raise ValueError(job['scoreId']+': unexpected chord/grace note')
                p = node.find('pitch')
                pitch = None if p is None else (int(p.findtext('octave'))+1)*12+PC[p.findtext('step')]+int(p.findtext('alter', '0'))
                ties = {t.attrib['type'] for t in node.findall('tie')}
                actual.append((origin+previous, duration, pitch, int(node.findtext('staff', '1')), 'stop' in ties, 'start' in ties))
                if not chord:
                    cursor += duration
                extent = max(extent, previous+duration)
        if extent != bar_length:
            raise ValueError(job['scoreId']+': changed measure duration')
        # abc2xml omits a completely silent staff in some interior measures.
        # Its implicit full-bar silence must equal the explicitly authored rest.
        for staff in (1, 2):
            if not any(e[3] == staff for e in actual[first:]):
                actual.append((origin, bar_length, None, staff, False, False))
        origin += bar_length
    if ordered(actual) != ordered(job['events']):
        raise ValueError(job['scoreId']+': conversion changed pitch/rest/onset/duration/staff/chord/tie')
    counts = Counter(e[3] for e in actual if e[2] is not None and not e[4])
    if counts[1] != job['countRight'] or counts[2] != job['countLeft'] or min(counts.values()) <= 0 or sum(counts.values()) != job['targetCount']:
        raise ValueError(job['scoreId']+': changed attack counts or silent hand')
    return actual


def mxl_bytes(xml):
    # Encoding date is provenance metadata inserted by upstream on each run.
    # Omitting it makes the artifact reproducible without changing music.
    xml = re.sub(r'\s*<encoding-date>[^<]*</encoding-date>', '', xml)
    container = b'<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in [('META-INF/container.xml', container), ('score.musicxml', xml.encode('utf-8'))]:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
    return stream.getvalue()


def pipeline_hash():
    files = [Path(__file__), ROOT/'packages/score-formats/python/converter.py',
             ROOT/'third_party/score-format-sources/abc2xml/abc2xml.py',
             Path(__file__).with_name('abc_grade_pitches.py'),
             Path(__file__).with_name('package-advanced-abc.py'),
             Path(__file__).with_name('grade_definition.py'), DEFINITION_PATH]
    files += [Path(__file__).with_name(f'package-g{grade}-abc.py') for grade in range(1, 5)]
    return sha(encode([(p.name, sha(p.read_bytes())) for p in files]))[:20]


def convert_one(job, cache):
    path = Path(cache)/(job['abcSha256']+'.mxl')
    cached = path.is_file()
    if cached:
        data = path.read_bytes()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if set(archive.namelist()) != {'META-INF/container.xml', 'score.musicxml'}:
                raise ValueError(job['scoreId']+': malformed conversion cache')
            xml = archive.read('score.musicxml').decode('utf-8')
    else:
        sys.path.insert(0, str(ROOT/'packages/score-formats/python'))
        from converter import convert
        result = convert({'operation': 'abc-to-xml', 'text': job['text'], 'tuneIndex': 0})
        if not result.get('ok') or result.get('diagnostics'):
            raise ValueError(f'{job["scoreId"]}: converter rejected source: {result.get("diagnostics")}')
        xml = result['text']
        data = mxl_bytes(xml)
    verify_xml(xml, job)
    if not cached:
        path.write_bytes(data)
    digest = sha(data)
    row = {k: job[k] for k in ('scoreId', 'lengthBucket', 'bookPosition', 'title', 'abcSha256',
                              'targetCount', 'countRight', 'countLeft', 'motifGroupId', 'sourceId', 'profiles')}
    row.update(id=digest, path=f'exercises/{digest}.mxl', sha256=digest, bytes=len(data), hand='both',
               grades=[job['grade']], sourceMeasures=[0, job['bars']-1], beatQuarter=[1.5 if job['meter'] == '6/8' else 1],
               sources=[{'title': f'G{job["grade"]} · {job["scoreId"]} · {job["title"]}',
                         'composer': 'Nhạc do trợ lý AI biên soạn', 'source_url': '',
                         'license_id': 'AI-composed', 'license_url': ''}])
    return row, str(path), cached


def build(source, destination, cache, workers=4):
    jobs = source_jobs(source)
    cache = cache/pipeline_hash()
    cache.mkdir(parents=True, exist_ok=True)
    rows, cached_count = [], 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(convert_one, job, cache) for job in jobs]
        for done, future in enumerate(as_completed(futures), 1):
            row, path, cached = future.result()
            rows.append((row, path))
            cached_count += cached
            if done % 100 == 0 or done == len(jobs):
                print(f'Converted + exact event validation: {done}/{len(jobs)} (cache {cached_count})', flush=True)
    rows.sort(key=lambda pair: (pair[0]['grades'][0], list(BUCKETS).index(pair[0]['lengthBucket']), pair[0]['bookPosition']))
    entries = [row for row, _ in rows]
    if len(entries) != TOTAL or len({e['id'] for e in entries}) != TOTAL:
        raise ValueError(f'Expected {TOTAL} distinct packaged exercises')
    source_release = 'composed-abc-'+sha(encode([(e['scoreId'], e['abcSha256']) for e in entries]))[:20]
    release = 'web-'+sha(encode({'kind': KIND, 'source': source_release, 'entries': entries}))[:20]
    base = destination/release
    (base/'exercises').mkdir(parents=True, exist_ok=True)
    for row, path in rows:
        shutil.copyfile(path, base/row['path'])
    options = []
    for grade in GRADES:
        for bucket in BUCKETS:
            subset = [e for e in entries if e['grades'] == [grade] and e['lengthBucket'] == bucket]
            if len(subset) != QUOTA or sorted(e['bookPosition'] for e in subset) != list(range(1, QUOTA + 1)):
                raise ValueError(f'G{grade}/{bucket}: not exactly {QUOTA} exercises/book positions')
            name = f'indexes/g{grade}-{bucket}.json'
            data = encode({'schemaVersion': 1, 'releaseId': release, 'grade': grade, 'lengthBucket': bucket, 'entries': subset})
            (base/name).parent.mkdir(parents=True, exist_ok=True)
            (base/name).write_bytes(data)
            options.append({**asset(name, data), 'grade': grade, 'lengthBucket': bucket,
                            'count': len(subset), 'byHand': {'left': 0, 'right': 0, 'both': len(subset)}})
    index = {'schemaVersion': 1, 'kind': KIND, 'releaseId': release, 'sourceRelease': source_release,
             'visibility': 'composed', 'total': len(entries), 'minimum': QUOTA,
             'lengthBuckets': length_buckets(),
             'options': options}
    data = encode(index)
    (base/'index.json').write_bytes(data)
    report = {'schemaVersion': 1, 'kind': KIND, 'releaseId': release, 'exercises': len(entries),
              'bothStaves': len(entries), 'exactEventParity': len(entries), 'compoundMeter': sum(e['beatQuarter'] == [1.5] for e in entries),
              'sourceAbcUnchanged': True, 'mxlBytes': sum(e['bytes'] for e in entries),
              'converter': 'abc2xml-2.68', 'cacheHits': cached_count, 'pipelineHash': cache.name,
              'coverage': {f'G{o["grade"]}/{o["lengthBucket"]}': o['count'] for o in options}}
    (cache.parent/'validation.json').write_bytes(encode(report))
    pointer = {'schemaVersion': 1, 'releaseId': release, 'index': asset(release+'/index.json', data)}
    temporary = destination/'manifest.json.tmp'
    temporary.write_bytes(encode(pointer))
    temporary.replace(destination/'manifest.json')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=GENERATED_ROOT)
    parser.add_argument('--output', type=Path, default=ROOT/'build.artifacts/curriculum')
    parser.add_argument('--cache', type=Path, default=ROOT/'artifacts/composed-reading-cache')
    parser.add_argument('--workers', type=int, choices=range(1, 9), default=4)
    args = parser.parse_args()
    print(json.dumps(build(args.source.resolve(), args.output.resolve(), args.cache.resolve(), args.workers), ensure_ascii=False))
