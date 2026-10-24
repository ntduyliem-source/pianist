from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'buildscripts/pianist'))
from library_staff_policy import inspect_two_staff_piano, require_two_staff_piano, read_musicxml
import library_release
from library_import import sha


def note(staff=1):
    return f'<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><staff>{staff}</staff></note>'


def score(staves=(2,), programs=(1,), labels=None, measures=None):
    labels = labels or ['Piano'] * len(staves)
    parts, definitions = [], []
    for i, count in enumerate(staves):
        ident = f'P{i+1}'
        midi = f'<midi-instrument id="I{i}"><midi-program>{programs[i]}</midi-program></midi-instrument>' if programs[i] is not None else ''
        definitions.append(f'<score-part id="{ident}"><part-name>{labels[i]}</part-name><score-instrument id="I{i}"><instrument-name>{labels[i]}</instrument-name></score-instrument>{midi}</score-part>')
        attrs = f'<attributes><staves>{count}</staves><clef number="1"><sign>G</sign><line>2</line></clef></attributes>'
        music = measures[i] if measures else f'<measure number="1">{attrs}{note()}</measure>'
        parts.append(f'<part id="{ident}">{music}</part>')
    return ('<score-partwise><part-list>' + ''.join(definitions) + '</part-list>' + ''.join(parts) + '</score-partwise>').encode()


def mxl(xml):
    out = BytesIO()
    with zipfile.ZipFile(out, 'w') as archive:
        archive.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>')
        archive.writestr('score.musicxml', xml)
    return out.getvalue()


class LibraryStaffPolicyTests(unittest.TestCase):
    def codes(self, data):
        return {v['code'] for v in inspect_two_staff_piano(data)['violations']}

    def warnings(self, data):
        proof = inspect_two_staff_piano(data)
        self.assertTrue(proof['accepted'])
        return {v['code'] for v in proof['warnings']}

    def test_grand_staff_and_two_piano_parts_are_equivalent_structurally(self):
        for xml in (score(), score((1, 1), (1, 1))):
            for data in (xml, mxl(xml)):
                proof = require_two_staff_piano(data)
                self.assertEqual(proof['totalStaves'], 2)
        # No staff declaration means one per part; two G clefs are allowed.
        split = score((1, 1), (1, 1)).replace(b'<staves>1</staves>', b'')
        self.assertTrue(inspect_two_staff_piano(split)['accepted'])

    def test_rests_hidden_staff_and_one_hand_silence_do_not_change_structure(self):
        music = '<measure number="1"><attributes><staves>2</staves><staff-details number="2" print-object="no"/></attributes><note><rest measure="yes"/><duration>4</duration></note></measure><measure number="2">' + note(1) + '</measure><measure number="3"/>'
        self.assertTrue(inspect_two_staff_piano(score(measures=[music]))['accepted'])

    def test_tempo_direction_before_initial_attributes_is_not_a_staff_change(self):
        xml = score().replace(b'<measure number="1">', b'<measure number="1"><direction><direction-type><words>Andante</words></direction-type><staff>1</staff><sound tempo="80"/></direction>')
        self.assertTrue(inspect_two_staff_piano(xml)['accepted'])

    def test_staff_changes_and_late_two_staff_declaration_are_rejected(self):
        for later in (1, 3):
            music = '<measure number="1"><attributes><staves>2</staves></attributes>' + note() + f'</measure><measure number="2"><attributes><staves>{later}</staves></attributes></measure>'
            self.assertIn('staff-count-change', self.codes(score(measures=[music])))
        music = '<measure number="1">' + note() + '<attributes><staves>2</staves></attributes></measure>'
        self.assertIn('staff-count-change', self.codes(score(measures=[music])))

    def test_one_three_staves_and_empty_extra_part_fail(self):
        for xml in (score((1,)), score((3,)), score((1, 2), (1, 1))):
            self.assertIn('staff-count', self.codes(xml))

    def test_two_staff_admission_does_not_depend_on_instrument_metadata(self):
        xml = score((1, 1), (74, 41), ['Flute', 'Violin'])
        self.assertIn('non-piano-instrument', self.warnings(xml))
        self.assertNotIn('staff-count', self.codes(xml))

    def test_instrument_conflicts_remain_diagnostics_without_discarding_music(self):
        self.assertIn('non-piano-instrument', self.warnings(score(programs=(41,))))
        xml = score().replace(b'<instrument-name>Piano</instrument-name>', b'<instrument-name>Piano</instrument-name><instrument-sound>strings.violin</instrument-sound>')
        self.assertIn('non-piano-instrument', self.warnings(xml))
        xml = score(labels=['Violin'])
        self.assertIn('non-piano-instrument', self.warnings(xml))
        self.assertIn('non-piano-instrument', self.warnings(score(labels=['Piano and Violin'])))

    def test_positive_evidence_accepts_translated_and_unnamed_piano(self):
        for label in ('', 'Part_1', 'Фортепиано', 'Đại dương cầm', 'Klavier'):
            self.assertTrue(inspect_two_staff_piano(score(labels=[label]))['accepted'])
        self.assertTrue(inspect_two_staff_piano(score(programs=(None,), labels=['Piano']))['accepted'])
        self.assertIn('unidentified-instrument', self.warnings(score(programs=(None,), labels=['Part_1'])))

    def test_later_instrument_change_and_unknown_note_instrument_are_diagnostics(self):
        xml = score().replace(b'</measure>', b'<direction><sound><midi-instrument id="I0"><midi-program>41</midi-program></midi-instrument></sound></direction></measure>')
        self.assertIn('non-piano-instrument', self.warnings(xml))
        xml = score().replace(b'</note>', b'<instrument id="missing"/></note>')
        self.assertIn('unidentified-instrument', self.warnings(xml))

    def test_invalid_note_or_clef_staff_reference_cannot_hide_third_staff(self):
        self.assertIn('invalid-staff-reference', self.codes(score().replace(b'<staff>1</staff>', b'<staff>3</staff>')))
        self.assertIn('invalid-staff-reference', self.codes(score().replace(b'clef number="1"', b'clef number="3"')))

    def test_malformed_and_mismatched_parts_are_rejected(self):
        with self.assertRaises(Exception):
            inspect_two_staff_piano(b'<score-partwise>')
        self.assertIn('part-structure', self.codes(score().replace(b'<part id="P1">', b'<part id="P2">')))
        with self.assertRaisesRegex(ValueError, 'partwise'):
            inspect_two_staff_piano(b'<score-timewise/>')

    def test_raw_and_container_root_keep_original_bytes(self):
        xml = score()
        for data in (xml, mxl(xml)):
            actual, _ = read_musicxml(data)
            self.assertEqual(actual, xml)

    def test_release_cannot_publish_a_hash_valid_noncompliant_score(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / 'scores/library'
            directory.mkdir(parents=True)
            data = mxl(score((1,)))
            song = {'id': sha(data), 'sha256': sha(data), 'url': 'library/songs/test.mxl', 'bytes': len(data)}
            catalog = json.dumps({'schemaVersion': 1, 'songs': [song]}).encode()
            (directory / 'catalog.json').write_bytes(catalog)
            assets = {'library/catalog.json': catalog, song['url']: data}
            with patch.object(library_release, 'ROOT', root):
                with self.assertRaisesRegex(ValueError, 'exactly two piano staves'):
                    library_release.verify_library(assets.__getitem__, set(assets))

    def test_curated_catalog_contains_only_admitted_scores(self):
        catalog = json.loads((ROOT / 'scores/library/catalog.json').read_text(encoding='utf8'))
        for song in catalog['songs']:
            with self.subTest(title=song['title']):
                require_two_staff_piano((ROOT / 'scores' / song['url']).read_bytes())


if __name__ == '__main__':
    unittest.main()
