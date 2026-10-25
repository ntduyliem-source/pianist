"""Verify the curated method-book catalog and every original two-staff lesson.

This is a separate catalog from user songs and the generated grade bank. Only
its explicit assets can enter a release; acquisition caches and pending sources
are never copied by walking scores/methods recursively.
"""
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse

from library_staff_policy import MAX_SCORE_BYTES, read_musicxml, require_two_staff_piano

ROOT = Path(__file__).resolve().parents[2]
LICENSES = frozenset({
    'CC0-1.0', 'Public-Domain', 'CC-PDDC',
    'CC-BY-2.0', 'CC-BY-2.5', 'CC-BY-3.0', 'CC-BY-4.0',
    'CC-BY-SA-2.0', 'CC-BY-SA-2.5', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0',
    # The source explicitly shares classical scores for public use. This is
    # source permission, not a claim that the edition has an SPDX/CC license.
    'LicenseRef-WhiteNote-Public-Use',
})


def _text(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('Missing method ' + name)


def verify_methods(read, paths=None):
    source = ROOT / 'scores/methods/catalog.json'
    if not source.exists():
        if paths is not None and any(p.startswith('methods/') for p in paths):
            raise ValueError('Unapproved method-book assets')
        return {'books': 0, 'lessons': 0, 'paths': []}
    catalog = json.loads(read('methods/catalog.json'))
    if catalog != json.loads(source.read_text(encoding='utf-8')) or catalog.get('schemaVersion') != 1:
        raise ValueError('Method catalog differs from the curated source')
    books = catalog.get('books')
    if not isinstance(books, list) or not books or len(books) > 500:
        raise ValueError('Invalid method-book catalog')
    expected = {'methods/catalog.json'}
    identities = set()
    lesson_count = 0
    for book in books:
        ident = book.get('id', '')
        if not isinstance(ident, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', ident) or ident in identities:
            raise ValueError('Unsafe or duplicate method-book identity')
        identities.add(ident)
        for field in ('title', 'composer', 'description'):
            _text(book.get(field), field)
        lessons = book.get('lessons')
        total = book.get('expectedLessons')
        if (not isinstance(lessons, list) or not lessons or type(total) is not int or
                not len(lessons) <= total <= 10000):
            raise ValueError('Invalid method-book lesson coverage: ' + ident)
        ids, numbers = set(), set()
        for lesson in lessons:
            lesson_id = lesson.get('id', '')
            number = lesson.get('number')
            if (not isinstance(lesson_id, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', lesson_id) or
                    lesson_id in ids or type(number) is not int or not 1 <= number <= total or number in numbers):
                raise ValueError('Duplicate or invalid lesson identity/order: ' + ident)
            ids.add(lesson_id)
            numbers.add(number)
            name = lesson.get('file')
            if name != f'methods/{ident}/{lesson_id}.mxl' or name in expected:
                raise ValueError('Unsafe or duplicate method lesson path')
            _text(lesson.get('title'), 'lesson title')
            source_url = lesson.get('sourceUrl')
            _text(source_url, 'lesson source URL')
            url = urlparse(source_url)
            if url.scheme != 'https' or not url.netloc or url.username or url.password:
                raise ValueError('Invalid method lesson source URL')
            license_id = lesson.get('license')
            if license_id not in LICENSES:
                raise ValueError('Unreviewed method lesson license: ' + str(license_id))
            if license_id == 'LicenseRef-WhiteNote-Public-Use':
                evidence = lesson.get('sourceRights') or book.get('sourceRights')
                if not evidence or url.hostname not in {'white-note.com', 'www.white-note.com'}:
                    raise ValueError('WhiteNote public-use statement must accompany its source')
            if (type(lesson.get('bytes')) is not int or not 0 < lesson['bytes'] <= MAX_SCORE_BYTES or
                    not isinstance(lesson.get('sha256'), str) or not re.fullmatch(r'[a-f0-9]{64}', lesson['sha256'])):
                raise ValueError('Invalid method lesson integrity metadata')
            data = read(name)
            if len(data) != lesson['bytes'] or hashlib.sha256(data).hexdigest() != lesson['sha256']:
                raise ValueError('Method lesson integrity failed: ' + name)
            require_two_staff_piano(data)
            _, score = read_musicxml(data)
            fingers = lesson.get('fingeringCount')
            if type(fingers) is not int or fingers != len(score.findall('.//fingering')):
                raise ValueError('Method fingering count differs from the source: ' + name)
            expected.add(name)
            lesson_count += 1
        if [lesson['number'] for lesson in lessons] != sorted(numbers):
            raise ValueError('Method lessons must keep printed exercise order: ' + ident)
    notice = ROOT / 'scores/methods/NOTICE.txt'
    if notice.exists():
        name = 'methods/NOTICE.txt'
        if read(name) != notice.read_bytes():
            raise ValueError('Method source notice differs from the curated source')
        expected.add(name)
    if paths is not None and {p for p in paths if p.startswith('methods/')} != expected:
        raise ValueError('Missing or unexpected method-book assets')
    return {'books': len(books), 'lessons': lesson_count, 'paths': sorted(expected)}
