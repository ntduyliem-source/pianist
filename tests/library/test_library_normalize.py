from copy import deepcopy
from pathlib import Path
import json
import importlib.util
import shutil
import sys
import tempfile
import unittest
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'buildscripts/pianist'))
from library_normalize import normalize, parse, music_signature, sha, PROFILE
from library_metadata import extract
from library_release import validate_versions

SCORE = '''<score-partwise version="3.1"><work><work-title>Tên cũ</work-title></work>
<identification><creator type="composer">Composer / arranger</creator><rights>© Bản nguồn</rights></identification>
<defaults><scaling><millimeters>9</millimeters><tenths>40</tenths></scaling><concert-score/></defaults>
<credit><credit-type>composer</credit-type><credit-words>Nhạc: Nguyễn Văn An\nPiano arranged by Người Soạn</credit-words></credit>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1" width="900"><print new-page="yes"><system-layout><system-distance>1</system-distance></system-layout></print>
<attributes><divisions>12</divisions><key><fifths>-2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
<direction placement="below"><direction-type><pedal type="start" line="yes" default-y="-80"/></direction-type><staff>2</staff><sound tempo="70"/></direction>
<harmony default-x="23"><root><root-step>C</root-step></root><kind>major</kind><staff>2</staff></harmony>
<note default-x="12"><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><tie type="start"/><voice>1</voice><staff>1</staff><notations><tied type="start"/><slide type="start" number="1"/></notations><lyric><text>Người ơi</text></lyric></note>
<backup><duration>12</duration></backup><note><rest/><duration>12</duration><voice>2</voice><staff>2</staff></note>
<direction><direction-type><words default-y="10">rit.</words></direction-type><sound tempo="60"/></direction>
<barline><ending number="1" type="start"/><repeat direction="backward" times="3"/></barline></measure></part></score-partwise>'''.encode()

class NormalizeTests(unittest.TestCase):
    def test_layout_changes_preserve_every_music_element_and_original_attribution(self):
        original = parse(SCORE)
        data, receipt = normalize(SCORE, {'title':'Tên bài mới', 'composer':'Tác Giả','arranger':'Người Soạn'})
        result=parse(data)
        self.assertEqual(music_signature(original), music_signature(result))
        self.assertIsNotNone(result.find('defaults/concert-score'))
        self.assertIsNone(result.find('part/measure/print'))
        self.assertEqual(result.findtext('work/work-title'),'Tên bài mới')
        self.assertEqual(result.findtext('identification/creator[@type="arranger"]'),'Người Soạn')
        self.assertEqual(result.findtext('part/measure/note/lyric/text'),'Người ơi')
        self.assertEqual(result.findtext('identification/rights'),'© Bản nguồn')
        originals=json.loads(result.findtext('identification/miscellaneous/miscellaneous-field[@name="pianist-original-credits"]'))
        self.assertIn('Piano arranged by Người Soạn',originals[0])
        self.assertEqual(receipt['profile'],PROFILE)
        self.assertEqual(data, normalize(SCORE, {'title':'Tên bài mới','composer':'Tác Giả','arranger':'Người Soạn'})[0])

    def test_fingerprint_detects_pitch_voice_duration_repeat_pedal_text_and_concert_changes(self):
        original=parse(SCORE); signature=music_signature(original)
        for xpath,value in [('part/measure/note/pitch/step','D'),('part/measure/note/duration','13'),
                            ('part/measure/note/voice','3'),('part/measure/note/lyric/text','Người khác')]:
            changed=deepcopy(original);changed.find(xpath).text=value
            self.assertNotEqual(signature,music_signature(changed))
        for xpath,attr,value in [('part/measure/barline/repeat','times','2'),
                                ('part/measure/direction/direction-type/pedal','type','stop')]:
            changed=deepcopy(original);changed.find(xpath).set(attr,value)
            self.assertNotEqual(signature,music_signature(changed))
        changed=deepcopy(original);changed.find('defaults').remove(changed.find('defaults/concert-score'))
        self.assertNotEqual(signature,music_signature(changed))

    def test_roles_do_not_turn_arranger_transcriber_or_contact_into_composer(self):
        metadata=extract(parse(SCORE))['metadata']
        self.assertEqual(metadata['composer'],'Nguyễn Văn An')
        self.assertEqual(metadata['arranger'],'Người Soạn')
        s=parse(SCORE);s.remove(s.find('credit'));s.find('identification/creator').text='Transcribed by Người Chép'
        result=extract(s)['metadata']
        self.assertNotIn('composer',result);self.assertEqual(result['transcriber'],'Người Chép')
        s.find('identification/creator').text='EveryonePiano';self.assertNotIn('composer',extract(s)['metadata'])

    def test_reviewed_wrapping_keeps_words_and_break_override_keeps_source_boundaries(self):
        original=SCORE.replace(b'>rit.<', b'>SOURCE NOTE: keep every word<')
        rule={'text':'SOURCE NOTE: keep every word','count':1,'wrap':12,'fontSize':8}
        data,_=normalize(original,{'title':'Tên bài'},preserve_breaks=True,word_layout=[rule])
        result=parse(data)
        self.assertEqual(result.find('part/measure/print').get('new-page'),'yes')
        self.assertIsNone(result.find('part/measure/print/system-layout'))
        self.assertEqual(music_signature(parse(original)),music_signature(result))
        self.assertIn('\n',result.findtext('.//words'))
        with self.assertRaises(ValueError):
            normalize(SCORE,{'title':'Tên bài'},word_layout=[rule])

    def test_edition_source_history_cannot_point_to_another_version(self):
        a={'id':'a'*64,'sourceHashes':['b'*64]}
        validate_versions([a])
        with self.assertRaises(ValueError):validate_versions([a,{'id':'c'*64,'sourceHashes':['b'*64]}])
        with self.assertRaises(ValueError):validate_versions([{'id':'a'*64,'arranger':{'bad':'type'}}])

    def test_later_batch_keeps_normalized_bytes_catalog_and_reviewed_metadata(self):
        spec=importlib.util.spec_from_file_location('normalize_library',ROOT/'buildscripts/pianist/normalize-library.py')
        pipeline=importlib.util.module_from_spec(spec);spec.loader.exec_module(pipeline)
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);library=base/'library';(library/'songs').mkdir(parents=True)
            pipeline.LIBRARY=library
            source=SCORE
            song={'id':sha(source),'sha256':sha(source),'bytes':len(source),'title':'Tên bài',
                  'url':'library/songs/test.mxl','filename':'Tên bài.mxl','workId':sha(source),'version':1}
            (library/'songs/test.mxl').write_bytes(source)
            pipeline.write(library/'catalog.json',{'schemaVersion':1,'songs':[song]})
            for name in ['metadata-overrides.json','layout-overrides.json']:
                pipeline.write(library/name,{'editions':{}})
            first=base/'first';pipeline.prepare(first)
            shutil.copyfile(first/'candidate/catalog.json',library/'catalog.json')
            shutil.copyfile(first/'candidate/songs/test.mxl',library/'songs/test.mxl')
            second=base/'second';pipeline.prepare(second)
            self.assertEqual((first/'candidate/catalog.json').read_bytes(),(second/'candidate/catalog.json').read_bytes())
            self.assertEqual((first/'candidate/songs/test.mxl').read_bytes(),(second/'candidate/songs/test.mxl').read_bytes())
            audit=pipeline.read(second/'normalization-audit.json')
            self.assertTrue(audit['editions'][0]['alreadyNormalized'])

if __name__ == '__main__': unittest.main()
