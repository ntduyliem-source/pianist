"""Verify only the explicitly curated, published MusicXML library."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


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
        identities.add(song['id'])
        expected.add(name)
    if {p for p in paths if p.startswith('library/')} != expected:
        raise ValueError('Missing or unexpected library assets')
    return len(songs)
