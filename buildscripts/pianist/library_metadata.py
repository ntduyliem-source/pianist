"""Conservative credit extraction. A source declaration is evidence, not authorship verification."""
import re
import unicodedata

FIELDS = ('composer', 'lyricist', 'arranger', 'transcriber', 'performer')
PLACEHOLDERS = {'', '.', '-', 'none', 'unknown', 'composer', 'arranger', 'composer / arranger',
                'compositeur / arrangeur', 'compositor / arreglista', 'tác giả', 'title', 'untitled', 'music title', '/', '|', 'piano', 'bolero', 'for solo piano'}
LABELS = re.compile(
    r'(?P<arranger>piano\s+arranged\s+by|piang\s+arranged\s+by|arrange(?:d)?\s+by|(?:piano\s+)?arrangement\s*[:：]|arranger\s*[:：]|arr[.:]|chuyển soạn(?:\s+piano)?\s*[:：]?|biên soạn(?: lại)?\s*[:：]?|soạn(?:\s+cho)?(?:\s+piano)?\s*[:：])'
    r'|(?P<transcriber>transcribed\s+by|transcription\s*[:：]|(?:piano\s+)?sheet(?:\s+piano)?\s+by|chép(?:\s+lại)?\s*[:：])'
    r'|(?P<performer>cover\s+by|performed\s+by|trình bày\s*[:：]|ca sĩ\s*[:：])'
    r'|(?P<lyricist>lyricists?\s*[:：]|lyrics?\s*(?:by|[:：])|lời(?: việt)?\s*[:：])'
    r'|(?P<composer>composed\s+by|composers?\s*(?:by|[:：])|compositor\s*[:：]|music\s*(?:by|[:：])|comp\.|sáng tác\s*[:：]?|nhạc\s*[:：])', re.I)

TITLE_OVERRIDES = {
    'Triệu Đoá Hồng': 'Triệu đóa hồng', 'Tình Đơn Phương': 'Tình đơn phương',
    'Xuân Này Con Không Về': 'Xuân này con không về', 'Giọt Lệ Đài Trang': 'Giọt lệ đài trang',
    'Vết Mưa': 'Vết mưa', 'Đưa Em Về Nhà': 'Đưa em về nhà', 'Sau Tất Cả': 'Sau tất cả',
    'Thêm Một Lần Đau': 'Thêm một lần đau', 'Ai đưa em về — Tia': 'Ai đưa em về',
    'Ai đưa em về — Nguyễn Ánh 9': 'Ai đưa em về',
    '我不后悔 / I Don’t Regret': '我不后悔',
}
NAME_OVERRIDES = {'MAI TRỌNG QUÝ': 'Mai Trọng Quý', 'Phuong Thy': 'Phương Thy'}
UNVERIFIED_NAMES = {'everyonepiano', 'everyone piano', 'music21', 'kids piano', 'huymai', 'huy mai',
                    'ngern', 'win', 'renqin', 'jeanie', '化身无', 'mountain', 'melody', 'hkt', 'đăng ân music'}

def clean(value):
    return ' '.join(unicodedata.normalize('NFC', value or '').split()).strip()

def usable(value):
    return clean(value).casefold() not in PLACEHOLDERS

def extract(score, song=None):
    song = song or {}
    title = clean(song.get('title') or score.findtext('work/work-title') or score.findtext('movement-title'))
    title = TITLE_OVERRIDES.get(title, title)
    people = {role: [] for role in FIELDS}
    evidence, unresolved = [], []
    aliases = []
    for value in [song.get('title'), score.findtext('work/work-title'), score.findtext('movement-title'), *song.get('aliases', [])]:
        value = clean(value)
        if usable(value) and value != title and value not in aliases and len(value) <= 180:
            aliases.append(value)
    if title == '我不后悔':
        aliases += [v for v in ['Wo Bu Hou Hui', 'I Don’t Regret'] if v not in aliases]

    def add(role, value, source, raw):
        value = clean(value).strip(' ;,:：./|')
        value = re.sub(r'^by\s+', '', value, flags=re.I)
        value = NAME_OVERRIDES.get(value, value)
        if not usable(value):
            return
        if len(value) > 180 or re.search(r'https?://|www\.|@|\bweb:|facebook\s*\.|\.(com|vn)\b|source\s*:|source credit|ý tưởng từ|^\d+/\d+/\d+|dành cho học viên', value, re.I) or (role in ('composer','lyricist') and value.casefold() in UNVERIFIED_NAMES):
            unresolved.append({'source': source, 'text': raw, 'reason': 'Source/performer/notation credit does not establish authorship'})
            return
        if value not in people[role]:
            people[role].append(value)
        evidence.append({'field': role, 'value': value, 'source': source, 'text': raw, 'confidence': 'source-declared'})

    def parse(value, source, fallback=None):
        value = clean(value)
        if not usable(value):
            return False
        labels = list(LABELS.finditer(value))
        if labels:
            prefix = value[:labels[0].start()].strip(' ;,:')
            if prefix and fallback in FIELDS:
                # A "ft" artist list is not automatically a composition credit.
                if re.search(r'\bft\.?\b|\bfeat\.?\b', prefix, re.I):
                    add('performer', prefix, source, value)
                else:
                    add(fallback, prefix, source, value)
            for i, match in enumerate(labels):
                end = labels[i+1].start() if i+1 < len(labels) else len(value)
                add(match.lastgroup, value[match.end():end], source, value)
            return True
        if fallback in FIELDS:
            add(fallback, value, source, value)
            return True
        return False

    for index, creator in enumerate(score.findall('identification/creator')):
        role = creator.get('type', '')
        role = 'lyricist' if role == 'poet' else role
        parse(''.join(creator.itertext()), f'identification/creator[{index}]', role)
    # Explicit labels printed on the page often contain information absent from identification.
    credits = []
    for index, credit in enumerate(score.findall('credit')):
        value = clean(''.join(''.join(n.itertext()) for n in credit.findall('credit-words')))
        if not usable(value):
            continue
        source = f'credit[{index}]'
        roles = credit.findall('credit-type')
        role = roles[0].text if len(roles) == 1 else None
        accepted = parse(value, source, role if role in FIELDS else None)
        credits.append({'text': value, 'source': source, 'role': role, 'recognizedContributor': accepted})
    for role in FIELDS:
        if not people[role] and usable(song.get(role)):
            parse(song[role], 'catalog/' + role, role)
    if song.get('title') == 'Ai đưa em về — Tia' and not people['performer']:
        add('performer', 'Tia', 'catalog/title', song['title'])
    # Prefer accented spelling when the same name occurs twice in the source.
    for role, names in people.items():
        folded = {}
        for name in names:
            key = ''.join(c for c in unicodedata.normalize('NFD', name.lower().replace('đ','d')) if unicodedata.category(c) != 'Mn')
            old = folded.get(key, '')
            if not old or sum(ord(c)>127 for c in name)>sum(ord(c)>127 for c in old):
                folded[key] = name
        people[role] = list(folded.values())
    metadata = {'title': title, **{role: ' · '.join(names) for role, names in people.items() if names}, 'aliases': aliases}
    return {'metadata': metadata, 'evidence': evidence, 'sourceCredits': credits, 'unresolved': unresolved,
            'missing': [role for role in ('composer', 'arranger') if not people[role]]}
