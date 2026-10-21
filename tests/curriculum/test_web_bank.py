import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
from web_bank_release import verify_web_bank

spec = importlib.util.spec_from_file_location('web_bank_builder', ROOT / 'buildscripts/pianist/web-reading-bank.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class WebBankTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'k5'
        self.source.mkdir()
        self.output = self.root / 'site/curriculum'
        self.files = {}
        self.entries = []
        origins = []
        for i, public in enumerate([True, False]):
            ident = str(i) * 64
            data = b'MXL fixture ' + str(i).encode()
            path = 'exercises/' + ident + '.mxl'
            self.write(path, data)
            self.entries.append(dict(id=ident, path=path, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data),
                grades=[1], lengthBucket='n4', hand='right', targetCount=4, motifGroupId=ident, title='Fixture',
                profiles=['g1-direction-quarters'], sourceMeasures=[1, 1], beatQuarter=[1],
                originalSourceSha256=ident, provenance=[str(i)]))
            origins.append(dict(id=str(i), title='Fixture', composer='Fixture',
                source_url=builder.OPEN_SCORE + 'test.mxl' if public else 'https://example.com/private',
                license_id='CC0-1.0' if public else 'unknown', license_url='https://example.com/license'))
        options = [dict(grade=g, lengthBucket=n, path=f'indexes/g{g}/{n}.json')
                   for g in range(1, 9) for n in ['n4','n6','n10','n20','n30','n50','n100']]
        self.write('catalog.json', builder.encode(dict(entries=self.entries, options=options, lengthBuckets=[])))
        self.write('attribution.json', builder.encode(dict(sources=origins)))
        (self.source / 'manifest.json').write_bytes(builder.encode(dict(releaseId='fixture', files=self.files)))

    def tearDown(self):
        self.temp.cleanup()

    def write(self, path, data):
        target = self.source / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        self.files[path] = builder.asset(path, data)

    def read(self, name):
        return (self.output.parent / name).read_bytes()

    def test_local_preserves_mxl_and_all_56_option_counts(self):
        result = builder.build(self.source, self.output)
        self.assertEqual(result['exercises'], 2)
        checked = verify_web_bank(self.read)
        self.assertEqual(checked['count'], 2)
        for entry in self.entries:
            self.assertEqual((self.output / result['releaseId'] / entry['path']).read_bytes(), (self.source / entry['path']).read_bytes())

    def test_public_build_excludes_every_unreviewed_source(self):
        result = builder.build(self.source, self.output, public=True)
        self.assertEqual(result['exercises'], 1)
        self.assertEqual(verify_web_bank(self.read, public=True)['count'], 1)
        self.assertFalse((self.output / result['releaseId'] / self.entries[1]['path']).exists())

    def test_public_verification_rejects_local_bank(self):
        builder.build(self.source, self.output)
        with self.assertRaisesRegex(ValueError, 'Local exercise bank'):
            verify_web_bank(self.read, public=True)

    def test_corruption_rejected_at_input_and_output(self):
        result = builder.build(self.source, self.output)
        path = self.output / result['releaseId'] / self.entries[0]['path']
        path.write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError, 'Bank integrity'):
            verify_web_bank(self.read)
        (self.source / self.entries[0]['path']).write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError, 'K5 integrity'):
            builder.build(self.source, self.output)


if __name__ == '__main__':
    unittest.main()
