"""Conservative source checks for the practice-ready public song library.

Do not repair missing notes, tie pitches or pedal releases by guessing.
"""
from library_staff_policy import read_musicxml, require_two_staff_piano


def content_issues(data):
    require_two_staff_piano(data)
    _, score = read_musicxml(data)
    issues = []
    if score.findall('.//note/grace'):
        issues.append('Bộ tập chưa theo dõi đầy đủ nốt hoa mỹ của bản này.')
    for part in score.findall('part'):
        pedals = {}
        for measure in part.findall('measure'):
            for direction in measure.findall('direction'):
                for pedal in direction.findall('direction-type/pedal'):
                    key = (direction.findtext('staff', '1'), pedal.get('number', '1'))
                    kind = pedal.get('type')
                    if kind == 'start':
                        if key in pedals:
                            issues.append('Pedal bắt đầu lại khi chưa có điểm nhả.')
                        pedals[key] = measure.get('number')
                    elif kind in ('stop', 'discontinue'):
                        pedals.pop(key, None)
        if pedals:
            issues.append('Pedal thiếu điểm kết thúc; không tự suy đoán thời gian nhả.')
    return list(dict.fromkeys(issues))


def require_practice_content(data):
    issues = content_issues(data)
    if issues:
        raise ValueError('; '.join(issues))
