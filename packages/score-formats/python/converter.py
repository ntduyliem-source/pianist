"""I/O adapter for unmodified Willem G. Vree converters, CPython and Pyodide.

This module contains no notation or timing conversion. Each call loads fresh
upstream module globals; ABC input is data, never executable Python.
"""
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from fractions import Fraction
import importlib.util
import io
import json
import re
import xml.etree.ElementTree as ET

MAX_BYTES = 32 * 1024 * 1024
MAX_OUTPUT = 64 * 1024 * 1024
VERSION = 'abc2xml-2.68+xml2abc-1.77'


def check_profile(score):
    """Reject lossy upstream output; never repair or rescale musical events.

    MusicXML type/dot/time-modification are an independent, exact duration
    declaration. abc2xml's integer division truncates 64th notes silently.
    This check detects that mismatch without parsing or rewriting ABC music.
    """
    note_types = {'long': 16, 'breve': 8, 'whole': 4, 'half': 2, 'quarter': 1,
                  'eighth': Fraction(1, 2), '16th': Fraction(1, 4),
                  '32nd': Fraction(1, 8), '64th': Fraction(1, 16),
                  '128th': Fraction(1, 32), '256th': Fraction(1, 64)}
    for sound in score.iter('sound'):
        if any(key in sound.attrib for key in ('dacapo', 'dalsegno', 'tocoda', 'fine', 'segno', 'coda')):
            raise ValueError('ABC có D.C./D.S./Coda/Fine ngoài profile đã kiểm chứng. Hãy mở bản MusicXML/MXL để giữ đúng thứ tự lặp.')
    for part in score.findall('part'):
        divisions = 1
        voice_staves = {}
        for measure in part.findall('measure'):
            for node in measure:
                if node.tag == 'attributes' and node.find('divisions') is not None:
                    divisions = int(node.findtext('divisions'))
                if node.tag != 'note':
                    continue
                voice, staff = node.findtext('voice', '1'), node.findtext('staff', '1')
                voice_staves.setdefault(voice, set()).add(staff)
                if len(voice_staves[voice]) > 1:
                    raise ValueError('ABC có bè chạy xuyên khuông ngoài profile đã kiểm chứng. Hãy dùng MusicXML/MXL.')
                if node.find('grace') is not None or node.find('rest[@measure="yes"]') is not None:
                    continue
                kind = node.findtext('type')
                if kind not in note_types:
                    raise ValueError('ABC có trường độ chưa được kiểm chứng. Hãy dùng MusicXML/MXL.')
                dots = len(node.findall('dot'))
                declared = Fraction(note_types[kind]) * (2 - Fraction(1, 2 ** dots))
                tm = node.find('time-modification')
                if tm is not None:
                    declared *= Fraction(int(tm.findtext('normal-notes')), int(tm.findtext('actual-notes')))
                written = Fraction(node.findtext('duration', '0')) / divisions
                if written != declared:
                    raise ValueError(f'Converter ABC không giữ chính xác trường độ ở ô {measure.get("number", "?")}: {written} thay vì {declared} phách đen. Hãy dùng MusicXML/MXL.')


def upstream(name):
    path = Path(__file__).with_name(name + '.py')
    if not path.is_file():
        path = Path(__file__).resolve().parents[3] / 'third_party/score-format-sources' / name / (name + '.py')
    spec = importlib.util.spec_from_file_location('_pianist_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inspect_abc(text):
    if not isinstance(text, str) or not text or len(text.encode('utf-8')) > MAX_BYTES:
        raise ValueError('File ABC phải từ 1 byte đến 32 MiB.')
    text = text.lstrip('\ufeff').replace('\r\n', '\n').replace('\r', '\n')
    # Includes and embedded scripts are file directives, not music. Reject
    # them before upstream expand_abc_include can open any virtual/local file.
    if re.search(r'(?im)(?:^\s*%%\s*|\bI:\s*)(?:abc-include|begin(?:js|ps|svg|ml)|javascript|postscript)\b', text):
        raise ValueError('ABC có tham chiếu file ngoài hoặc chỉ thị script không được hỗ trợ.')
    if '\x00' in text or re.search(r'<(?:\?xml|!DOCTYPE|score-partwise|score-timewise|museScore)\b', text, re.I):
        raise ValueError('Nội dung không phải ABC hợp lệ.')
    if not re.search(r'(?m)^\s*K:', text):
        raise ValueError('ABC thiếu trường K: xác định giọng/khóa của bản nhạc.')
    # Use precisely the upstream getXmlDocs envelope boundary. This only
    # enumerates titles; all music syntax stays with the upstream parser.
    fragments = re.split(r'^\s*X:', text, flags=re.M)
    bodies = fragments[1:] or ['1\n' + fragments[0]]
    if len(bodies) > 1000:
        raise ValueError('File ABC vượt giới hạn 1.000 bài; hãy chia thành file nhỏ hơn.')
    tunes = []
    for index, body in enumerate(bodies):
        title = re.search(r'(?m)^\s*T:\s*([^\n]*)', body)
        tunes.append({'index': index, 'id': body.split('\n', 1)[0].strip(),
                      'title': title.group(1).strip() if title else f'Bài {index + 1}'})
    return text, tunes


def diagnostics(log, direction):
    result = []
    for raw in log.splitlines():
        message = raw.removeprefix('-- ').strip()
        if not message or re.search(r'written with \d+ voices$', message):
            continue
        # X is already represented by the selected tune index/id in our result.
        if re.match(r'^skipped header: \(field X,', message):
            continue
        # Unknown notation diagnostics fail closed. Only explicitly cosmetic
        # skipped directives can be warnings; never hide a changed rhythm.
        cosmetic = re.match(r'skipped I-field: (?:staffwidth|staffsep|systemsep|pagescale|linebreak|continueall|stretchlast|titlefont|subtitlefont|composerfont|vocalfont|annotationfont|partsfont|measurefont|gchordfont|staffnonote|barnumbers)\b', message)
        harmless_export = direction == 'xml-to-abc' and message.startswith('accidental ') and ' added in ' in message
        level = 'warning' if cosmetic or harmless_export else 'error'
        result.append({'level': level, 'code': 'upstream', 'message': message[:4000]})
    if len(result) > 100:
        return result[:99] + [{'level': 'error', 'code': 'diagnostics-limit', 'message': 'Quá nhiều cảnh báo converter; dừng nhập để tránh bỏ sót lỗi âm nhạc.'}]
    return result


def convert(request):
    operation = request.get('operation')
    text = request.get('text', '')
    stderr, stdout = io.StringIO(), io.StringIO()
    try:
        if operation in ('inspect-abc', 'abc-to-xml'):
            text, tunes = inspect_abc(text)
            if operation == 'inspect-abc':
                return {'ok': True, 'tunes': tunes, 'diagnostics': [], 'converter': VERSION}
            index = request.get('tuneIndex', 0)
            if not isinstance(index, int) or isinstance(index, bool) or index < 0 or index >= len(tunes):
                raise ValueError('Bài được chọn không có trong file ABC.')
            with redirect_stderr(stderr), redirect_stdout(stdout):
                module = upstream('abc2xml')
                # Do not call getXmlScores: upstream's compatibility wrapper
                # hardcodes skip=0,num=1. getXmlDocs preserves both arguments.
                scores = module.getXmlDocs(text, skip=index, num=1)
                if len(scores) != 1 or not scores[0].findall('.//note'):
                    raise ValueError('ABC không tạo được bản nhạc có nốt hoặc dấu nghỉ.')
                output = module.fixDoctype(scores[0])
            # Library calls collect diagnostics in getInfo(), not stderr.
            items = diagnostics(module.getInfo() + stderr.getvalue(), operation)
            if any(d['level'] == 'error' for d in items):
                return {'ok': False, 'diagnostics': items, 'converter': VERSION}
            check_profile(scores[0])
            title = scores[0].findtext('work/work-title') or tunes[index]['title']
            result = {'ok': True, 'text': output, 'title': title, 'tunes': tunes,
                      'tuneIndex': index, 'diagnostics': items, 'converter': VERSION}
        elif operation == 'xml-to-abc':
            if not isinstance(text, str) or len(text.encode('utf-8')) > MAX_OUTPUT:
                raise ValueError('MusicXML vượt giới hạn 64 MiB.')
            if re.search(r'<!ENTITY\s', text, re.I):
                raise ValueError('Không hỗ trợ XML chứa entity.')
            source = ET.fromstring(text)
            if source.tag != 'score-partwise':
                raise ValueError('Bộ chuyển đổi cần MusicXML score-partwise.')
            if source.find('.//arpeggiate[@direction="down"]') is not None:
                raise ValueError('xml2abc 1.77 không giữ hướng arpeggio xuống. Hãy giữ MusicXML/MXL cho bài này.')
            with redirect_stderr(stderr), redirect_stdout(stdout):
                module = upstream('xml2abc')
                # vertaal defaults ped=0, unlike the CLI; explicitly preserve
                # pedal and empty voices, with repeats still written as repeats.
                output, messages = module.vertaal(text, ped=True, p='', wev=True, m=2)
            items = diagnostics(messages, operation)
            if not output or any(d['level'] == 'error' for d in items):
                return {'ok': False, 'diagnostics': items or [{'level': 'error', 'code': 'empty', 'message': 'Không tạo được ABC.'}], 'converter': VERSION}
            result = {'ok': True, 'text': output, 'diagnostics': items, 'converter': VERSION}
        else:
            raise ValueError('Thao tác chuyển đổi không hợp lệ.')
        if len(result['text'].encode('utf-8')) > MAX_OUTPUT:
            raise ValueError('Kết quả chuyển đổi vượt giới hạn 64 MiB.')
        return result
    except Exception as error:
        items = diagnostics(stderr.getvalue(), operation)
        items.append({'level': 'error', 'code': 'conversion', 'message': str(error)[:4000]})
        return {'ok': False, 'diagnostics': items[:100], 'converter': VERSION}


def convert_json(value):
    return json.dumps(convert(json.loads(value)), ensure_ascii=False)


if __name__ == '__main__':
    import sys
    print(convert_json(sys.stdin.read()))
