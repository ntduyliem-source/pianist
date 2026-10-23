from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
from library_import import append_library, sha, musicxml
from library_release import validate_versions


def mxl(step='C', grace=False, year=2000, staves=2):
    notes = ''.join(f'<note>{"<grace/>" if grace and i == 0 else ""}<pitch><step>{step}</step><octave>4</octave></pitch>'
                    + ('' if grace and i == 0 else '<duration>1</duration>') + '</note>' for i in range(3))
    xml = f'<score-partwise><work><work-title>Test fixture</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name><midi-instrument id="I1"><midi-program>1</midi-program></midi-instrument></score-part></part-list><part id="P1"><measure number="1"><attributes><staves>{staves}</staves></attributes>{notes}</measure></part></score-partwise>'.encode()
    out = BytesIO()
    with zipfile.ZipFile(out, 'w') as archive:
        for name, data in [('META-INF/container.xml', b'<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'), ('score.xml', xml)]:
            archive.writestr(zipfile.ZipInfo(name, (year, 1, 1, 0, 0, 0)), data)
    return out.getvalue()


class LibraryImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.library = self.root / 'library'
        (self.library / 'songs').mkdir(parents=True)
        data = mxl()
        self.original = dict(id=sha(data), sha256=sha(data), bytes=len(data), title='A real work',
                             filename='A real work.mxl', url='library/songs/original.mxl')
        (self.library / 'songs/original.mxl').write_bytes(data)
        self.write_catalog([self.original])

    def write_catalog(self, songs):
        (self.library / 'catalog.json').write_text(json.dumps(dict(schemaVersion=1, songs=songs)), encoding='utf-8')

    def catalog(self):
        return json.loads((self.library / 'catalog.json').read_text(encoding='utf-8'))

    def inputs(self, data, filename='another.mxl', title='A real work', editor_only=False):
        path = self.root / filename
        path.write_bytes(data)
        _, count, grace = musicxml(data)
        row = dict(filename=filename, path=str(path), sha256=sha(data), title=title, writtenNotes=count)
        result = dict(filename=filename, sha256=sha(data), status='editor-only' if editor_only else 'accepted',
                      nativePlayback=True, nativeNotes=count-grace if editor_only else count, sourceNotes=count,
                      missingGlyphs=0, pages=1, editorNotes=count, editorGraceNotes=grace)
        return [row], dict(errors=[], results=[result])

    def test_arrangements_append_and_old_assets_stay_untouched(self):
        before = (self.library / 'songs/original.mxl').read_bytes()
        inputs, audit = self.inputs(mxl('D'))
        inputs[0]['workId'] = self.original['id']
        report = append_library(inputs, audit, self.library)
        songs = self.catalog()['songs']
        self.assertEqual(songs[0], self.original)
        self.assertEqual((self.library / 'songs/original.mxl').read_bytes(), before)
        self.assertEqual((songs[1]['workId'], songs[1]['version']), (self.original['id'], 2))
        self.assertEqual(songs[1]['filename'], 'A real work — v2.mxl')
        self.assertEqual(report['summary']['newVersions'], 1)
        self.assertEqual(report['summary']['totalWorks'], 1)
        self.assertEqual(songs[1]['url'], 'library/songs/another-v2.mxl')

    def test_native_accepted_single_staff_is_excluded_without_catalog_mutation(self):
        before = (self.library / 'catalog.json').read_bytes()
        report = append_library(*self.inputs(mxl('D', staves=1)), self.library)
        self.assertEqual(report['summary']['excluded'], 1)
        self.assertEqual(report['results'][0]['staffPolicy']['totalStaves'], 1)
        self.assertEqual((self.library / 'catalog.json').read_bytes(), before)
        self.assertEqual(len(list((self.library / 'songs').glob('*.mxl'))), 1)

    def test_existing_noncompliant_library_blocks_append_without_mutation(self):
        data = mxl(staves=1)
        (self.library / 'songs/original.mxl').write_bytes(data)
        self.write_catalog([{**self.original, 'id': sha(data), 'sha256': sha(data), 'bytes': len(data)}])
        before = (self.library / 'catalog.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'exactly two piano staves'):
            append_library(*self.inputs(mxl('D')), self.library)
        self.assertEqual((self.library / 'catalog.json').read_bytes(), before)

    def test_exact_musicxml_copy_skips_even_if_zip_bytes_differ(self):
        different_zip = mxl(year=2001)
        self.assertNotEqual(sha(different_zip), self.original['sha256'])
        before = (self.library / 'catalog.json').read_bytes()
        report = append_library(*self.inputs(different_zip), self.library)
        self.assertEqual(report['summary']['duplicates'], 1)
        self.assertEqual((self.library / 'catalog.json').read_bytes(), before)
        self.assertEqual(len(list((self.library / 'songs').glob('*.mxl'))), 1)

    def test_repeat_import_is_idempotent_and_next_different_arrangement_gets_three(self):
        inputs, audit = self.inputs(mxl('D'))
        inputs[0]['workId'] = self.original['id']
        append_library(inputs, audit, self.library)
        before = (self.library / 'catalog.json').read_bytes()
        report = append_library(inputs, audit, self.library)
        self.assertEqual(report['summary']['duplicates'], 1)
        self.assertEqual((self.library / 'catalog.json').read_bytes(), before)
        inputs, audit = self.inputs(mxl('E'), 'another-third.mxl')
        inputs[0]['workId'] = self.original['id']
        append_library(inputs, audit, self.library)
        self.assertEqual(self.catalog()['songs'][-1]['version'], 3)

    def test_new_work_same_download_basename_number_becomes_one_version(self):
        report = append_library(*self.inputs(mxl('F'), 'new-work (2).mxl', 'Different work'), self.library)
        song = self.catalog()['songs'][-1]
        self.assertEqual((song['workId'], song['version']), (song['id'], 1))
        self.assertEqual(song['url'], 'library/songs/new-work.mxl')
        self.assertEqual(report['summary']['newWorks'], 1)

    def test_editor_only_requires_complete_round_trip_and_exact_grace_evidence(self):
        inputs, audit = self.inputs(mxl('G', grace=True), editor_only=True)
        inputs[0]['workId'] = self.original['id']
        before = (self.library / 'catalog.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'exact native grace-note'):
            append_library(inputs, audit, self.library)
        self.assertEqual((self.library / 'catalog.json').read_bytes(), before)
        bad = deepcopy(audit)
        bad['results'][0]['editorGraceNotes'] = 0
        with self.assertRaisesRegex(ValueError, 'exact native grace-note'):
            append_library(inputs, bad, self.library, allow_editor_only=True)
        report = append_library(inputs, audit, self.library, allow_editor_only=True)
        song = self.catalog()['songs'][-1]
        self.assertFalse(song['practiceReady'])
        self.assertIn('1 nốt hoa mỹ', song['practiceNotice'])
        self.assertEqual(report['summary']['editorOnly'], 1)

    def test_source_mutation_or_unfinished_audit_cannot_change_catalog(self):
        inputs, audit = self.inputs(mxl('D'))
        before = (self.library / 'catalog.json').read_bytes()
        audit['results'][0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Source changed'):
            append_library(inputs, audit, self.library)
        audit['results'][0]['status'] = 'candidate'
        with self.assertRaisesRegex(ValueError, 'unfinished'):
            append_library(inputs, audit, self.library)
        self.assertEqual((self.library / 'catalog.json').read_bytes(), before)

    def test_ambiguous_same_title_needs_explicit_work_identity(self):
        data = mxl('B')
        second = {**self.original, 'id': sha(data), 'sha256': sha(data), 'bytes': len(data), 'url': 'library/songs/second.mxl'}
        (self.library / 'songs/second.mxl').write_bytes(data)
        self.write_catalog([self.original, second])
        inputs, audit = self.inputs(mxl('D'))
        with self.assertRaisesRegex(ValueError, 'Ambiguous work title'):
            append_library(inputs, audit, self.library)
        inputs[0]['workId'] = second['id']
        append_library(inputs, audit, self.library)
        self.assertEqual(self.catalog()['songs'][-1]['workId'], second['id'])

    def test_release_checks_missing_root_and_duplicate_version_numbers(self):
        alternative = {**self.original, 'id': 'f' * 64, 'workId': self.original['id'], 'version': 2}
        with self.assertRaisesRegex(ValueError, 'Missing first'):
            validate_versions([alternative])
        with self.assertRaisesRegex(ValueError, 'Duplicate library version'):
            validate_versions([self.original, {**alternative, 'version': 1}])
        self.assertEqual(len(validate_versions([self.original, alternative])), 1)

    def test_different_vietnamese_accents_do_not_merge_different_work_names(self):
        self.write_catalog([{**self.original, 'title': 'Mơ'}])
        report = append_library(*self.inputs(mxl('F'), 'another-work.mxl', 'Mở'), self.library)
        self.assertEqual(report['summary']['newWorks'], 1)
        self.assertEqual(self.catalog()['songs'][-1]['version'], 1)

    def test_same_title_different_composers_are_separate_works(self):
        self.write_catalog([{**self.original, 'composer': 'Nguyễn Anh 9'}])
        inputs, audit = self.inputs(mxl('D'))
        inputs[0]['composer'] = 'Tia'
        report = append_library(inputs, audit, self.library)
        song = self.catalog()['songs'][-1]
        self.assertEqual((song['workId'], song['version']), (song['id'], 1))
        self.assertEqual(report['summary']['totalWorks'], 2)

    def test_same_known_composer_normalization_groups_arrangements(self):
        self.write_catalog([{**self.original, 'composer': 'Nguyễn Anh 9'}])
        inputs, audit = self.inputs(mxl('D'))
        inputs[0]['composer'] = '  NGUYE\u0302\u0303N ANH 9  '
        append_library(inputs, audit, self.library)
        song = self.catalog()['songs'][-1]
        self.assertEqual((song['workId'], song['version']), (self.original['id'], 2))

    def test_unknown_author_requires_decision_and_cannot_modify_assets(self):
        before = (self.library / 'catalog.json').read_bytes()
        for composer in ('', 'Unknown', 'A known author'):
            inputs, audit = self.inputs(mxl('D'))
            inputs[0]['composer'] = composer
            with self.assertRaisesRegex(ValueError, 'Ambiguous work title/composer'):
                append_library(inputs, audit, self.library)
            self.assertEqual((self.library / 'catalog.json').read_bytes(), before)
            self.assertEqual(len(list((self.library / 'songs').glob('*.mxl'))), 1)
        inputs[0]['newWork'] = True
        append_library(inputs, audit, self.library)
        self.assertEqual(self.catalog()['songs'][-1]['version'], 1)

    def test_known_composer_selects_correct_homonym_in_a_batch(self):
        self.write_catalog([{**self.original, 'composer': 'Author A'}])
        first, first_audit = self.inputs(mxl('D'), 'homonym.mxl')
        first[0]['composer'] = 'Author B'
        second, second_audit = self.inputs(mxl('E'), 'homonym-arrangement.mxl')
        second[0]['composer'] = 'Author B'
        audit = dict(errors=[], results=first_audit['results'] + second_audit['results'])
        report = append_library(first + second, audit, self.library)
        songs = self.catalog()['songs']
        self.assertEqual((songs[-1]['workId'], songs[-1]['version']), (songs[-2]['id'], 2))
        self.assertEqual((report['summary']['newWorks'], report['summary']['newVersions']), (1, 1))

    def test_explicit_identity_can_resolve_conflicting_composer_metadata(self):
        self.write_catalog([{**self.original, 'composer': 'Author A'}])
        inputs, audit = self.inputs(mxl('D'))
        inputs[0].update(composer='Different attribution', workId=self.original['id'])
        append_library(inputs, audit, self.library)
        self.assertEqual(self.catalog()['songs'][-1]['version'], 2)

    def test_explicit_identity_options_must_be_unambiguous(self):
        inputs, audit = self.inputs(mxl('D'))
        inputs[0]['newWork'] = 'false'
        with self.assertRaisesRegex(ValueError, 'must be a boolean'):
            append_library(inputs, audit, self.library)
        inputs[0].update(newWork=True, workId=self.original['id'])
        with self.assertRaisesRegex(ValueError, 'either explicit workId or newWork'):
            append_library(inputs, audit, self.library)


if __name__ == '__main__':
    unittest.main()
