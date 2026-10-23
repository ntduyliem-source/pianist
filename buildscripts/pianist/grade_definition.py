"""Shared metadata for the committed grade edition, without musical generation.

The source namespace is an immutable provenance identity. Physical storage can
move without rewriting ABC headers, content hashes, book order, or release IDs.
"""
import json
from pathlib import Path, PurePosixPath
import re

ROOT = Path(__file__).resolve().parents[2]
DEFINITION_PATH = ROOT / 'scores/grades/definition.json'


def validate_definition(value):
    if value.get('schemaVersion') != 1 or value.get('edition') != 'authored-2026-10-22-v1':
        raise ValueError('Unsupported grade definition edition')
    if value.get('kind') != 'composed-abc-v1' or value.get('exercisesPerOption') != 100:
        raise ValueError('Edition v1 requires 100 exercises per grade/length option')
    grades, buckets = value.get('grades', []), value.get('lengthBuckets', [])
    if [g.get('id') for g in grades] != list(range(1, 9)):
        raise ValueError('Edition v1 requires grades 1 through 8 in stable order')
    if [b.get('id') for b in buckets] != ['n4', 'n6', 'n10', 'n20', 'n30', 'n50', 'n100']:
        raise ValueError('Edition v1 requires the seven existing length choices in stable order')
    previous = 2
    for bucket in buckets:
        if (type(bucket.get('min')) is not int or type(bucket.get('max')) is not int or
                bucket['min'] != previous + 1 or bucket['max'] < bucket['min'] or
                not bucket.get('label') or not bucket.get('pickerLabel')):
            raise ValueError('Invalid or overlapping grade length bounds')
        previous = bucket['max']
    for grade in grades:
        expected = f'package-g{grade["id"]}-abc' if grade['id'] < 5 else 'package-advanced-abc'
        if (grade.get('validator') != expected or
                any(not isinstance(grade.get(key), str) or not grade[key] for key in ('title', 'description', 'topic'))):
            raise ValueError('Invalid grade metadata or source validator')
    for key in ('authoredRoot', 'generatedRoot', 'logicalSourceRoot'):
        path = value.get('paths', {}).get(key, '')
        parsed = PurePosixPath(path)
        if not path or parsed.is_absolute() or '..' in parsed.parts or '\\' in path or ':' in path:
            raise ValueError('Unsafe grade source path: ' + key)
    if value['paths']['authoredRoot'] == value['paths']['generatedRoot']:
        raise ValueError('Authored and generated roots must be distinct')
    return value


DEFINITION = validate_definition(json.loads(DEFINITION_PATH.read_text(encoding='utf-8')))
GRADES = tuple(g['id'] for g in DEFINITION['grades'])
GRADE_METADATA = {g['id']: g for g in DEFINITION['grades']}
BUCKETS = {b['id']: (b['min'], b['max']) for b in DEFINITION['lengthBuckets']}
QUOTA = DEFINITION['exercisesPerOption']
PER_GRADE = QUOTA * len(BUCKETS)
TOTAL = PER_GRADE * len(GRADES)
OPTION_COUNT = len(GRADES) * len(BUCKETS)
AUTHORED_ROOT = ROOT / DEFINITION['paths']['authoredRoot']
GENERATED_ROOT = ROOT / DEFINITION['paths']['generatedRoot']
KIND = DEFINITION['kind']


def authored(grade):
    if grade not in GRADES:
        raise ValueError('Unknown grade')
    return AUTHORED_ROOT / f'g{grade}'


def generated(grade):
    if grade not in GRADES:
        raise ValueError('Unknown grade')
    return GENERATED_ROOT / f'g{grade}-abc'


def logical_source(path):
    relative = Path(path).resolve().relative_to(AUTHORED_ROOT.resolve())
    return (PurePosixPath(DEFINITION['paths']['logicalSourceRoot']) / relative.as_posix()).as_posix()


def abc_index(grade, bucket, number):
    if grade not in GRADES or bucket not in BUCKETS or not 1 <= number <= QUOTA:
        raise ValueError('Unknown grade score identity')
    return GRADES.index(grade) * PER_GRADE + list(BUCKETS).index(bucket) * QUOTA + number


def score_identity_matches(score_id, grade, bucket):
    if grade not in GRADES or bucket not in BUCKETS or not isinstance(score_id, str):
        return False
    match = re.fullmatch(re.escape(f'g{grade}-{bucket}-') + r'(\d{3})', score_id)
    return bool(match and 1 <= int(match[1]) <= QUOTA)


def length_buckets():
    return [{key: bucket[key] for key in ('id', 'label', 'min', 'max')} for bucket in DEFINITION['lengthBuckets']]
