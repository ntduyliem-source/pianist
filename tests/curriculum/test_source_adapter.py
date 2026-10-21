from contextlib import closing
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'buildscripts/pianist'))
from curriculum_source_adapter import adapt, without_labels, metadata_evidence
from curriculum_normalize import normalize, source_tree, digest
from curriculum_io import CorpusError
from curriculum_adapter_cache import reusable
from curriculum_source_adapter import prepare, q2
from curriculum_catalog import open_catalog, blob, register_file, base_origin, save_origin
from curriculum_normalize import LIMITS
from curriculum_bank import mxl_bytes
import sqlite3
from fixtures_q2 import score, note


class SourceAdapterTests(unittest.TestCase):
    def source(self, label):
        body = note('C')+note('D')+note('E')+note('F')+'<backup><duration>4</duration></backup>'+note('C', 3, 4, voice='5', staff=2, kind='whole')
        return score([body], staves=2).replace(b'Piano', label.encode('utf8'))

    def test_translation_changes_only_labels_and_keeps_all_music(self):
        original = self.source('鋼琴').replace(b'Q2 original fixture', 'Bài tập — 鋼琴'.encode('utf8'))
        packed, proof = adapt(original)
        self.assertEqual(proof['kind'], 'musescore-piano-translation')
        self.assertEqual(without_labels(source_tree(original)), without_labels(source_tree(packed)))
        self.assertEqual(normalize(packed)['events'], normalize(self.source('Piano'))['events'])
        self.assertEqual(packed, adapt(original)[0])

    def test_anonymous_requires_metadata_and_full_keyboard_evidence(self):
        original = self.source('')
        packed, proof = adapt(original, ['Piano'])
        self.assertEqual(proof['kind'], 'verified-source-metadata-and-grand-staff')
        self.assertEqual(without_labels(source_tree(original)), without_labels(source_tree(packed)))
        for bad, metadata in [(original, []), (original, ['Flute']),
            (original.replace(b'<midi-channel>1</midi-channel>', b'<midi-channel>10</midi-channel>'), ['Piano']),
            (original.replace(b'<sign>F</sign>', b'<sign>G</sign>'), ['Piano'])]:
            with self.assertRaises(CorpusError): adapt(bad, metadata)

    def test_conflicting_instrument_is_not_renamed_even_with_piano_metadata(self):
        for name in ['Choir', 'Violin', 'Drumset', 'Unknown thing']:
            with self.assertRaises(CorpusError): adapt(self.source(name), ['Piano'])
        data = self.source('Piano')
        self.assertEqual(adapt(data)[0], data)
        with self.assertRaises(CorpusError): adapt(score([note()]).replace(b'Piano', b''), ['Piano'])

    def test_metadata_hash_is_required(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); data = b'{"data":{"score":{"instruments":[{"name":"Piano"}]}}}'
            (root/'meta.json').write_bytes(data)
            origin = {'metadata_path': 'meta.json', 'metadata_sha256': digest(data)}
            self.assertEqual(metadata_evidence(root, [origin])[0], ['Piano'])
            (root/'meta.json').write_bytes(b'changed')
            with self.assertRaisesRegex(CorpusError, 'metadata-hash-mismatch'):
                metadata_evidence(root, [origin])

    def test_incremental_adapter_reuses_only_unchanged_sources_and_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); corpus = root/'corpus'; normal = root/'normal'; output = root/'adapted'
            corpus.mkdir(); normal.mkdir()
            data = mxl_bytes(self.source('鋼琴'))
            with closing(open_catalog(corpus/'catalog.sqlite')) as db, db:
                item = blob(corpus, data, 'mxl')
                register_file(db, corpus, item, LIMITS, set())
                origin = base_origin('fixture', 'v1', 'source.mxl', file_sha256=item['sha256'])
                save_origin(db, origin)
            with closing(sqlite3.connect(normal/'normalization.sqlite')) as db, db:
                db.execute('CREATE TABLE analyses(source_sha,pipeline,status,blockers)')
                pipeline = digest(f'{q2.identity()}:20000:45'.encode())
                db.execute('INSERT INTO analyses VALUES(?,?,?,?)', (item['sha256'], pipeline, 'rejected', '["piano-not-explicit"]'))
            report = prepare(corpus, normal, output)
            self.assertEqual(report['outcomes'], {'prepared': 1})
            self.assertEqual(reusable(corpus, normal, output), report)
            with closing(open_catalog(corpus/'catalog.sqlite')) as db, db:
                db.execute('UPDATE origins SET title=?', ('Corrected attribution',))
            self.assertIsNone(reusable(corpus, normal, output))
            self.assertEqual((corpus/item['path']).read_bytes(), data)


if __name__ == '__main__': unittest.main()
