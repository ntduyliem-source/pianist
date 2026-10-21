"""Validate the lazy web bank's entire file graph before staging/publishing."""
import hashlib
import json
from pathlib import PurePosixPath


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
    if index['releaseId'] != release_id or len(index['options']) != 56:
        raise ValueError('Incomplete bank index')
    if public and index['visibility'] != 'public':
        raise ValueError('Local exercise bank cannot be published')
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
        for e in data['entries']:
            if e['path'] != 'exercises/' + e['id'] + '.mxl' or option['grade'] not in e['grades']:
                raise ValueError('Exercise identity disagreement')
            if public and (not e['sources'] or any(s['license_id'] != 'CC0-1.0' or not s['source_url'].startswith(
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
    if len(exercises) != index['total']:
        raise ValueError('Bank total disagrees')
    return {'releaseId': release_id, 'count': len(exercises), 'visibility': index['visibility'], 'paths': sorted(paths)}
