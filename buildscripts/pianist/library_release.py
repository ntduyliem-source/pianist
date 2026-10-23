"""Verify only the explicitly curated, published MusicXML library."""
import hashlib
import json
import re
from pathlib import Path
from library_staff_policy import require_two_staff_piano

ROOT = Path(__file__).resolve().parents[2]


def validate_versions(songs):
    """Old entries are version 1; explicit versions belong to a real first entry."""
    groups = {}
    for song in songs:
        explicit = 'workId' in song
        if explicit != ('version' in song):
            raise ValueError('Incomplete library version metadata')
        work = song.get('workId', song['id'])
        number = song.get('version', 1)
        if not isinstance(work, str) or not re.fullmatch(r'[a-f0-9]{64}', work) or type(number) is not int or not 1 <= number <= 500:
            raise ValueError('Invalid library version identity')
        label = song.get('versionLabel')
        if label is not None and (not isinstance(label, str) or not label.strip() or len(label) > 120):
            raise ValueError('Invalid library version label')
        ready, notice = song.get('practiceReady'), song.get('practiceNotice')
        if ready is not None and type(ready) is not bool:
            raise ValueError('Invalid library practice support')
        if notice is not None and (not isinstance(notice, str) or not notice.strip() or len(notice) > 300):
            raise ValueError('Invalid library practice notice')
        if ready is False and not notice:
            raise ValueError('Unsupported practice requires an explanation')
        versions = groups.setdefault(work, {})
        if number in versions:
            raise ValueError('Duplicate library version number')
        versions[number] = song
    for work, versions in groups.items():
        if versions.get(1, {}).get('id') != work:
            raise ValueError('Missing first library version')
    return groups


def verify_library(read, paths):
    source = ROOT / 'scores/library/catalog.json'
    if not source.exists():
        if any(p.startswith('library/') for p in paths):
            raise ValueError('Unapproved bundled library')
        return 0
    catalog = json.loads(read('library/catalog.json'))
    if catalog != json.loads(source.read_text(encoding='utf-8')) or catalog.get('schemaVersion') != 1:
        raise ValueError('Library catalog differs from the curated source')
    songs = catalog['songs']
    if not isinstance(songs, list) or len(songs) > 500:
        raise ValueError('Invalid library size')
    validate_versions(songs)
    expected = {'library/catalog.json'}
    identities = set()
    for song in songs:
        name = song['url']
        if not re.fullmatch(r'library/songs/[a-z0-9-]+\.mxl', name) or name in expected:
            raise ValueError('Unsafe or duplicate library path')
        if not re.fullmatch(r'[a-f0-9]{64}', song['sha256']) or song['id'] != song['sha256'] or song['id'] in identities:
            raise ValueError('Invalid library identity')
        data = read(name)
        if len(data) != song['bytes'] or hashlib.sha256(data).hexdigest() != song['sha256']:
            raise ValueError('Library integrity failed: ' + name)
        require_two_staff_piano(data)
        identities.add(song['id'])
        expected.add(name)
    preview_source = ROOT / 'scores/library/previews/manifest.json'
    if preview_source.exists():
        preview_name = 'library/previews/manifest.json'
        previews = json.loads(read(preview_name))
        if previews != json.loads(preview_source.read_text(encoding='utf-8')) or previews.get('schemaVersion') != 1 or previews.get('kind') != 'musescore-first-page-webp-v1':
            raise ValueError('Library previews differ from the native render receipt')
        if not re.fullmatch(r'[a-f0-9]{64}', previews.get('rendererVersion', '')):
            raise ValueError('Missing thumbnail renderer provenance')
        covered = set()
        for image in previews['files']:
            source_hash, name = image['sourceHash'], image['path']
            if source_hash not in identities or source_hash in covered or name != 'library/previews/' + source_hash + '.webp':
                raise ValueError('Invalid or duplicate score thumbnail')
            data = read(name)
            if len(data) != image['bytes'] or hashlib.sha256(data).hexdigest() != image['sha256'] or data[:4] != b'RIFF' or data[8:12] != b'WEBP':
                raise ValueError('Thumbnail integrity failed: ' + name)
            covered.add(source_hash)
            expected.add(name)
        if covered != identities:
            raise ValueError('Generate previews for every library edition: node buildscripts/pianist/build-library-previews.cjs')
        expected.add(preview_name)
    if {p for p in paths if p.startswith('library/')} != expected:
        raise ValueError('Missing or unexpected library assets')
    return len(songs)
