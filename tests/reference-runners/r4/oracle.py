"""Independent Python oracle. No product TypeScript or Pianist grading imported.

mir_eval modules run verbatim. note-seq's whole function is extracted with AST,
unchanged; only its protobuf object and unquantized flag are represented by
SimpleNamespace. No inference model, TensorFlow, audio or UI is stubbed as a rule.
"""
import ast
import collections
import copy
import hashlib
import json
import operator
from pathlib import Path
import sys
from types import SimpleNamespace
import warnings

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / '.tools/r4-python'))
import numpy as np
sys.path.insert(0, str(ROOT / 'third_party/practice-sources/mir_eval'))
from mir_eval import transcription

source = ROOT / 'third_party/practice-sources/note-seq/note_seq/sequences_lib.py'
parsed = ast.parse(source.read_text(encoding='utf-8'))
method = next(n for n in parsed.body if isinstance(n, ast.FunctionDef) and n.name == 'apply_sustain_control_changes')
namespace = dict(copy=copy, collections=collections, operator=operator,
                 is_quantized_sequence=lambda sequence: False,
                 _SUSTAIN_ON=0, _SUSTAIN_OFF=1, _NOTE_ON=2, _NOTE_OFF=3)
exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), 'exec'), namespace)


def oracle(case):
    if case['kind'] == 'offset':
        return bool(transcription.match_note_offsets(np.array([case['ref']]), np.array([[case['ref'][0], case['end']]])))
    if case['kind'] == 'pedal':
        ref, est = np.array(case['ref']).reshape(-1, 2), np.array(case['est']).reshape(-1, 2)
        matching = transcription.match_notes(ref, np.ones(len(ref)), est, np.ones(len(est)), onset_tolerance=.2)
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            metrics = transcription.precision_recall_f1_overlap(ref, np.ones(len(ref)), est, np.ones(len(est)), onset_tolerance=.2)
        return dict(matching=[[int(a), int(b)] for a, b in matching], **dict(zip(['precision','recall','f1','overlap'], metrics)))
    notes = [SimpleNamespace(id=n['id'], start_time=n['start'], end_time=n['end'], pitch=n['pitch'], instrument=n['instrument'], is_drum=n.get('drum', False)) for n in case['notes']]
    controls = [SimpleNamespace(time=c['time'], control_value=c['value'], control_number=64, instrument=c['instrument']) for c in case['controls']]
    seq = SimpleNamespace(notes=notes, control_changes=controls, total_time=max([0]+[n.end_time for n in notes]))
    result = namespace['apply_sustain_control_changes'](seq)
    return [dict(id=n.id, start=n.start_time, end=n.end_time, pitch=n.pitch, instrument=n.instrument, **({'drum': True} if n.is_drum else {})) for n in result.notes]


if __name__ == '__main__':
    cases = json.load(sys.stdin)
    print(json.dumps([oracle(c) for c in cases], separators=(',', ':')))
