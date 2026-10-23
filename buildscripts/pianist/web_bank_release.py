"""Validate the lazy web bank's entire file graph before staging/publishing."""
import hashlib
import json
import re
from pathlib import PurePosixPath
from grade_definition import (GRADES, BUCKETS, QUOTA, TOTAL, OPTION_COUNT,
                              score_identity_matches, length_buckets)


def verify_web_bank(read, public=False):
    def checked(name, expected):
        p = PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or '\\' in name:
            raise ValueError('Unsafe bank path')
        data = read(name)
        if len(data) != expected['bytes'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
            raise ValueError('Bank integrity failed: ' + name)
        return data

    pointer = json.loads(read('curriculum/manifest.json'))
    release_id = pointer['releaseId']
    if pointer['index']['path'] != release_id + '/index.json' or not release_id.startswith('web-'):
        raise ValueError('Invalid bank pointer')
    base = 'curriculum/' + release_id + '/'
    index = json.loads(checked('curriculum/' + pointer['index']['path'], pointer['index']))
    if index['releaseId'] != release_id or len(index['options']) != OPTION_COUNT:
        raise ValueError('Incomplete bank index')
    composed = index.get('kind') == 'composed-abc-v1'
    if composed and (index['visibility'] != 'composed' or not index.get('sourceRelease', '').startswith('composed-abc-')):
        raise ValueError('Invalid composed bank provenance')
    if public and not composed and index['visibility'] != 'public':
        raise ValueError('Local exercise bank cannot be published')
    if composed:
        expected = {(g, n) for g in GRADES for n in BUCKETS}
        if {(o['grade'], o['lengthBucket']) for o in index['options']} != expected:
            raise ValueError('Incomplete composed grade/length choices')
        if (index.get('minimum') != QUOTA or index.get('total') != TOTAL or
                index.get('lengthBuckets') != length_buckets() or
                any(o['count'] != QUOTA for o in index['options'])):
            raise ValueError('Composed bank differs from the committed grade edition')
    paths = {'curriculum/manifest.json', base + 'index.json'}
    exercises = {}
    options = set()
    for option in index['options']:
        key = (option['grade'], option['lengthBucket'])
        if key in options:
            raise ValueError('Duplicate option')
        options.add(key)
        data = json.loads(checked(base + option['path'], option))
        paths.add(base + option['path'])
        if data['releaseId'] != release_id or (data['grade'], data['lengthBucket']) != key or len(data['entries']) != option['count']:
            raise ValueError('Option/catalog disagreement')
        score_ids = set()
        for e in data['entries']:
            if e['path'] != 'exercises/' + e['id'] + '.mxl' or option['grade'] not in e['grades']:
                raise ValueError('Exercise identity disagreement')
            if composed:
                if (e['hand'] != 'both' or e.get('lengthBucket') != option['lengthBucket'] or
                        e['id'] != e['sha256'] or not score_identity_matches(e.get('scoreId'), option['grade'], option['lengthBucket']) or
                        e['scoreId'] in score_ids or
                        e.get('countRight', 0) < 1 or e.get('countLeft', 0) < 1 or
                        e['countRight'] + e['countLeft'] != e['targetCount'] or
                        not BUCKETS[option['lengthBucket']][0] <= e['targetCount'] <= BUCKETS[option['lengthBucket']][1] or
                        not isinstance(e.get('bookPosition'), int) or not 1 <= e['bookPosition'] <= option['count'] or
                        not re.fullmatch(r'[a-f0-9]{64}', e.get('abcSha256', '')) or
                        not e.get('sources') or any(s.get('license_id') != 'AI-composed' for s in e['sources'])):
                    raise ValueError('Invalid composed score metadata')
                score_ids.add(e['scoreId'])
            if public and not composed and (not e['sources'] or any(s['license_id'] != 'CC0-1.0' or not s['source_url'].startswith(
                    'https://raw.githubusercontent.com/OpenScore/Lieder/38c5db510224d9facdc4b08d741fc788cfb58ea8/') for s in e['sources'])):
                raise ValueError('Public bank source has not been reviewed')
            if e['id'] in exercises and exercises[e['id']] != e['sha256']:
                raise ValueError('Conflicting exercise identity')
            if e['id'] not in exercises:
                checked(base + e['path'], e)
            exercises[e['id']] = e['sha256']
            paths.add(base + e['path'])
        if option['byHand'] != {h: sum(e['hand'] == h for e in data['entries']) for h in ['left', 'right', 'both']}:
            raise ValueError('Hand counts disagree')
        if composed and sorted(e['bookPosition'] for e in data['entries']) != list(range(1, option['count'] + 1)):
            raise ValueError('Missing or repeated book position')
    if len(exercises) != index['total']:
        raise ValueError('Bank total disagrees')
    return {'releaseId': release_id, 'count': len(exercises), 'visibility': index['visibility'], 'paths': sorted(paths)}
