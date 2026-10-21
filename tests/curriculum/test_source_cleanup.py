from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from contextlib import closing
import importlib.util
import json
import sqlite3
import tempfile
import unittest
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'buildscripts/pianist'))

from curriculum_io import CorpusError
from curriculum_source_cleanup import (ROOT,classify,label_kind,delete_checked,
                                        legacy_collection_guard)

spec=importlib.util.spec_from_file_location('cleanup_cli',ROOT/'buildscripts/pianist/prune-curriculum-sources.py')
cli=importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)


def piano(label='Piano'):
    return [{'id':'P1','name':label,'instruments':[]}]


class SourceCleanupTests(unittest.TestCase):
    def test_two_staff_piano_and_original_musescore_translations(self):
        for label in ('Piano','鋼琴','钢琴','ピアノ','피아노','Klavír','Zongora','Flügel'):
            self.assertEqual(label_kind(label),'piano',label)
            result=classify(piano(label),{'stavesPerPart':[2]})
            self.assertEqual(result['action'],'keep',label)
        for layout in ([1],[3],[4]):
            self.assertEqual(classify(piano(),{'stavesPerPart':layout})['action'],'delete')

    def test_metadata_and_other_instruments_do_not_override_actual_content(self):
        blank=[{'name':'','instruments':['']}]
        self.assertEqual(classify(blank,{'stavesPerPart':[2]},['Piano'])['action'],'keep')
        self.assertEqual(classify(blank,{'stavesPerPart':[2]})['action'],'review')
        self.assertEqual(classify(piano(),{'stavesPerPart':[2]},['Flute'])['action'],'keep')
        mixed=piano()+[{'name':'Voice','instruments':['Voice']}]
        self.assertEqual(classify(mixed,{'stavesPerPart':[1,1]},['Piano'])['action'],'delete')
        self.assertEqual(classify(piano(),{'stavesPerPart':[2],'unpitchedNotes':4})['action'],'delete')

    def test_anonymous_piano_notation_is_not_deleted_for_wrong_web_drum_tag(self):
        parts=[{'name':'','instruments':[''],'midiPrograms':['1'],'midiChannels':['1']}]
        layout={'stavesPerPart':[2],'pitchedNotes':100,'unpitchedNotes':0,'clefs':[
            {'staff':1,'sign':'G','line':2,'octaveChange':0},
            {'staff':2,'sign':'F','line':4,'octaveChange':0}]}
        self.assertEqual(classify(parts,layout,['Drum group'])['action'],'keep')
        parts[0]['midiChannels']=['10']
        self.assertEqual(classify(parts,layout,['Drum group'])['action'],'review')

    def test_path_escape_and_checksum_change_abort_without_deleting(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);root=base/'sources';root.mkdir()
            outside=base/'outside.mxl';outside.write_bytes(b'outside')
            inside=root/'inside.mxl';inside.write_bytes(b'changed')
            with self.assertRaises(CorpusError):delete_checked(root,'../outside.mxl',cli.sha(b'outside'))
            with self.assertRaisesRegex(CorpusError,'target-changed'):
                delete_checked(root,'inside.mxl',cli.sha(b'old'))
            self.assertTrue(inside.is_file());self.assertTrue(outside.is_file())

    def fixture(self,root):
        corpus=root/'artifacts/curriculum-corpus';corpus.mkdir(parents=True)
        records=[]
        for filename,data,staffs in [('remove.mxl',b'same-as-exercise',1),('keep.mxl',b'keep-source',2)]:
            (corpus/filename).write_bytes(data)
            layout={'stavesPerPart':[staffs]};parts=piano()
            records.append({'sha':cli.sha(data),'path':filename,'parts':parts,'layout':layout,
                'metadataInstruments':[],**classify(parts,layout)})
        with closing(sqlite3.connect(corpus/'catalog.sqlite')) as db,db:
            db.executescript('''CREATE TABLE files(sha256 TEXT PRIMARY KEY,path TEXT,container_status TEXT,error TEXT);
                CREATE TABLE origins(file_sha256 TEXT,metadata_path TEXT,metadata_sha256 TEXT,extraction_status TEXT,parse_status TEXT,rejection_json TEXT);
                CREATE VIEW review_queue AS SELECT * FROM files WHERE container_status='valid';''')
            for row in records:
                db.execute('INSERT INTO files VALUES(?,?,?,NULL)',(row['sha'],row['path'],'valid'))
                db.execute('INSERT INTO origins VALUES(?,NULL,NULL,?,?,?)',(row['sha'],'stored','pending-q2','[]'))
        exercises=root/'artifacts/curriculum-prepared/releases/bank/exercises';exercises.mkdir(parents=True)
        (exercises/'exercise.mxl').write_bytes(b'same-as-exercise')
        (exercises.parent/'catalog.json').write_text('{"entries":[]}')
        (exercises.parent/'bank.sqlite').write_bytes(b'protected-bank')
        (exercises.parent/'progress.json').write_text('{"uniqueMxlFiles":5284}')
        copies=root/'artifacts/curriculum-research/openscore-lieder';copies.mkdir(parents=True)
        (copies/'source-copy.mxl').write_bytes(b'same-as-exercise')
        normalized=root/'artifacts/curriculum-normalized';normalized.mkdir(parents=True)
        (normalized/'normalization.sqlite').write_bytes(b'protected-analysis')
        plan=root/'plan.json'
        plan.write_text(json.dumps({'corpus':str(corpus),'classifier':'fixture','records':records}))
        return SimpleNamespace(corpus=corpus,plan=plan,workers=2),exercises

    def test_apply_deletes_only_sources_even_when_exercise_has_identical_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);args,exercises=self.fixture(root)
            with patch.object(cli,'ROOT',root),patch.object(cli,'classifier_identity',return_value='fixture'):
                before=cli.exercise_snapshot();cli.apply(args);after=cli.exercise_snapshot()
            self.assertEqual(before,after)
            self.assertEqual((exercises/'exercise.mxl').read_bytes(),b'same-as-exercise')
            self.assertEqual((exercises.parent/'bank.sqlite').read_bytes(),b'protected-bank')
            self.assertEqual((root/'artifacts/curriculum-normalized/normalization.sqlite').read_bytes(),b'protected-analysis')
            self.assertFalse((args.corpus/'remove.mxl').exists());self.assertTrue((args.corpus/'keep.mxl').exists())
            self.assertFalse((root/'artifacts/curriculum-research/openscore-lieder/source-copy.mxl').exists())
            with closing(sqlite3.connect(args.corpus/'catalog.sqlite')) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM review_queue').fetchone()[0],1)
                self.assertEqual(db.execute('SELECT count(*) FROM user_removed_sources').fetchone()[0],1)
            with self.assertRaisesRegex(CorpusError,'source-pool-was-pruned'):
                legacy_collection_guard(args.corpus)

    def test_stale_policy_or_changed_source_is_rejected_before_any_delete(self):
        for kind in ('policy','bytes'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temp:
                root=Path(temp);args,_=self.fixture(root)
                if kind=='policy':
                    plan=json.loads(args.plan.read_text());plan['records'][1]['action']='delete';args.plan.write_text(json.dumps(plan))
                else:(args.corpus/'remove.mxl').write_bytes(b'changed')
                with patch.object(cli,'ROOT',root),patch.object(cli,'classifier_identity',return_value='fixture'):
                    with self.assertRaises(CorpusError):cli.apply(args)
                self.assertTrue((args.corpus/'remove.mxl').exists())
                self.assertTrue((args.corpus/'keep.mxl').exists())
                self.assertFalse((args.corpus/'source-cleanup.json').exists())


if __name__=='__main__':unittest.main()
