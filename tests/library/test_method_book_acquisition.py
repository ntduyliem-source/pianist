"""The acquisition layer must not invent or alter notation."""
from importlib.util import module_from_spec, spec_from_file_location
from io import BytesIO
from pathlib import Path
import hashlib
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
spec = spec_from_file_location('method_book_acquisition', ROOT / 'buildscripts/pianist/prepare-method-books.py')
acquisition = module_from_spec(spec)
spec.loader.exec_module(acquisition)

XML = b'''<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><staff>1</staff><notations><technical><fingering>1</fingering></technical></notations></note>
<backup><duration>1</duration></backup><note><rest/><duration>1</duration><staff>2</staff></note>
</measure></part></score-partwise>'''


class MethodBookAcquisitionTests(unittest.TestCase):
    def test_xml_wrap_is_deterministic_and_byte_exact(self):
        one = acquisition.compressed_musicxml(XML)
        self.assertEqual(one, acquisition.compressed_musicxml(XML))
        self.assertEqual(acquisition.read_musicxml(one)[0], XML)
        self.assertEqual(acquisition.compressed_musicxml(one), one)

    def test_original_mxl_source_never_recompressed(self):
        original = acquisition.compressed_musicxml(XML)
        self.assertEqual(acquisition.compressed_musicxml(original), original)

    def test_changed_cache_cannot_be_imported(self):
        with tempfile.TemporaryDirectory() as name:
            cache = Path(name)
            sha = hashlib.sha256(XML).hexdigest()
            (cache / sha).write_bytes(XML.replace(b'<step>C</step>', b'<step>D</step>'))
            with self.assertRaisesRegex(ValueError, 'hash changed'):
                acquisition.fetch_source({'sourceSha256': sha, 'sourceUrl': 'https://example.org/original'}, cache, False)

    def test_archive_member_is_exact_and_missing_name_fails(self):
        with tempfile.TemporaryDirectory() as name:
            cache = Path(name)
            output = BytesIO()
            with zipfile.ZipFile(output, 'w') as archive:
                archive.writestr('book/lesson.xml', XML)
            data = output.getvalue()
            sha = hashlib.sha256(data).hexdigest()
            (cache / sha).write_bytes(data)
            source = {'sourceSha256': sha, 'sourceUrl': 'https://example.org/book.zip', 'archiveMember': 'book/lesson.xml'}
            self.assertEqual(acquisition.fetch_source(source, cache, False), XML)
            source['archiveMember'] = 'missing.xml'
            with self.assertRaisesRegex(ValueError, 'archive member'):
                acquisition.fetch_source(source, cache, False)

    def test_committed_original_can_restore_pdmx_cache(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            original = acquisition.compressed_musicxml(XML)
            path = root / 'original.mxl'
            path.write_bytes(original)
            source = {'sourceSha256': hashlib.sha256(original).hexdigest(), 'sourceUrl': 'https://example.org/score', 'localFile': 'missing/warehouse.mxl'}
            self.assertEqual(acquisition.fetch_source(source, root / 'cache', True, root, path), original)

    def test_invalid_staff_count_cannot_partially_publish_a_book(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            cache = root / 'cache'
            cache.mkdir()
            lessons = []
            for number, xml in [(1, XML), (2, XML.replace(b'<staves>2</staves>', b'<staves>1</staves>'))]:
                sha = hashlib.sha256(xml).hexdigest()
                (cache / sha).write_bytes(xml)
                lessons.append({'id': f'book-{number}', 'number': number, 'title': f'Lesson {number}',
                                'sourceSha256': sha, 'sourceUrl': 'https://example.org/source', 'license': 'CC0-1.0'})
            sources = {'schemaVersion': 1, 'books': [{'id': 'book', 'title': 'Book', 'composer': 'Composer',
                       'opus': 'Op.1', 'description': 'Source book', 'expectedLessons': 2, 'lessons': lessons}]}
            with self.assertRaises(ValueError):
                acquisition.build(sources, root / 'output', cache)
            self.assertFalse((root / 'output').exists())


if __name__ == '__main__':
    unittest.main()
