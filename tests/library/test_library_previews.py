"""Published artwork must belong to the exact curated MusicXML edition."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
from library_release import verify_library


class LibraryPreviewsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = ROOT / 'scores/library'
        catalog = json.loads((source / 'catalog.json').read_text(encoding='utf-8'))
        receipt = json.loads((source / 'previews/manifest.json').read_text(encoding='utf-8'))
        names = ['library/catalog.json', 'library/previews/manifest.json']
        names += [song['url'] for song in catalog['songs']]
        names += [image['path'] for image in receipt['files']]
        cls.assets = {name: (ROOT / 'scores' / name).read_bytes() for name in names}
        cls.preview = receipt['files'][0]['path']
        cls.count = len(catalog['songs'])

    def test_exact_coverage_and_native_receipt(self):
        self.assertEqual(verify_library(self.assets.__getitem__, self.assets), self.count)

    def test_corrupt_artwork_is_rejected(self):
        changed = dict(self.assets)
        changed[self.preview] = changed[self.preview][:-1] + bytes([changed[self.preview][-1] ^ 1])
        with self.assertRaisesRegex(ValueError, 'Thumbnail integrity failed'):
            verify_library(changed.__getitem__, changed)

    def test_missing_or_unlisted_artwork_is_rejected(self):
        paths = set(self.assets)
        for wrong in [paths - {self.preview}, paths | {'library/previews/unlisted.webp'}]:
            with self.assertRaisesRegex(ValueError, 'Missing or unexpected library assets'):
                verify_library(self.assets.__getitem__, wrong)
