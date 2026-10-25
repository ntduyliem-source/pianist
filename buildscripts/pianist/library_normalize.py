"""Normalize presentation only, preserving the entire musical XML subtree after an explicit layout allowlist."""
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import hashlib
import json
import re
import textwrap
import unicodedata
import zipfile
from lxml import etree as E
from library_staff_policy import read_musicxml
from library_metadata import clean, FIELDS

PROFILE = 'pianist-a4-v1'
POSITION_ATTRS = {'default-x', 'default-y', 'relative-x', 'relative-y', 'bezier-x', 'bezier-y', 'bezier-x2', 'bezier-y2', 'bezier-offset', 'bezier-offset2'}
TEXT_TAGS = {'words', 'rehearsal', 'text', 'elision', 'part-name', 'part-abbreviation', 'display-text'}
TEXT_ATTRS = {'font-family', 'font-size', 'halign'}
PRINT_LAYOUT = {'page-layout', 'system-layout', 'staff-layout'}
PRINT_ATTRS = {'new-system', 'new-page', 'blank-page', 'page-number'}

def parse(data):
    xml, _ = read_musicxml(data)
    return E.fromstring(xml, E.XMLParser(resolve_entities=False, no_network=True))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def music_signature(score):
    """Retain every musical element, voice, text, placement and flag, including unknown extensions."""
    root = deepcopy(score)
    for node in list(root):
        if node.tag not in {'part-list', 'part'}:
            root.remove(node)
    root.attrib.pop('version', None)
    strip_layout(root)
    for node in root.iter():
        if node.text is not None:
            node.text = unicodedata.normalize('NFC', node.text) if node.text.strip() else None
            if node.tag == 'words' and node.text:
                # Line wrapping may change whitespace, never the words themselves.
                node.text = ' '.join(node.text.split())
        # XML indentation is not music. Lyrics stay exact; words differ only in wrapping.
        if node.tail is not None and not node.tail.strip():
            node.tail = None
        if node.tag in TEXT_TAGS:
            for attr in TEXT_ATTRS:
                node.attrib.pop(attr, None)
    concert = score.find('defaults/concert-score') is not None
    return sha(str(concert).encode() + E.tostring(root, method='c14n', with_comments=False))

def strip_layout(root, preserve_breaks=False):
    for measure in root.findall('part/measure'):
        measure.attrib.pop('width', None)
    for node in list(root.iter()):
        for attr in POSITION_ATTRS:
            node.attrib.pop(attr, None)
        if node.tag == 'print':
            for attr in PRINT_ATTRS:
                if not (preserve_breaks and attr in {'new-system', 'new-page'}):
                    node.attrib.pop(attr, None)
            for child in list(node):
                if child.tag in PRINT_LAYOUT:
                    node.remove(child)
            if not len(node) and not node.attrib:
                node.getparent().remove(node)
        if node.tag == 'staff-size':
            node.getparent().remove(node)

def font_for(text):
    if any(0xE000 <= ord(c) <= 0xF8FF for c in text):
        return 'Leland Text'
    return 'Noto Sans CJK SC' if re.search('[\u3400-\u9fff\u3040-\u30ff]', text) else 'FreeSerif'

def child(parent, tag, text=None, **attrs):
    node = E.SubElement(parent, tag, {k.replace('_','-'):str(v) for k,v in attrs.items()})
    if text is not None:
        node.text = str(text)
    return node

def normalize(data, metadata, preserve_breaks=False, word_layout=None):
    score = parse(data)
    original_signature = music_signature(score)
    original_credits = [E.tostring(n, encoding='unicode') for n in score.findall('credit')]
    original_creators = [E.tostring(n, encoding='unicode') for n in score.findall('identification/creator')]
    concert = score.find('defaults/concert-score') is not None
    score.set('version', '4.0')
    # Keep all performance data; discard only the explicit presentation allowlist.
    strip_layout(score, preserve_breaks=preserve_breaks)
    for node in score.iter():
        if node.text is not None:
            node.text = unicodedata.normalize('NFC', node.text)
        if node.tag in TEXT_TAGS and (node.text or len(node)):
            node.set('font-family', font_for(''.join(node.itertext())))
            if node.tag in {'words', 'rehearsal', 'text'}:
                node.set('font-size', '10')
    for rule in word_layout or []:
        matches = [n for n in score.findall('part/measure/direction/direction-type/words') if clean(n.text) == rule['text']]
        if len(matches) != rule['count']:
            raise ValueError('Reviewed annotation layout no longer matches source')
        for node in matches:
            node.text = '\n'.join(textwrap.wrap(clean(node.text), width=rule['wrap'], break_long_words=False, break_on_hyphens=False))
            if rule.get('fontSize'):
                node.set('font-size', str(rule['fontSize']))
    work = score.find('work')
    if work is None:
        work = E.Element('work'); score.insert(0, work)
    title = work.find('work-title')
    if title is None:
        title = child(work, 'work-title')
    title.text = metadata['title']
    movement = score.find('movement-title')
    if movement is not None:
        movement.text = metadata['title']
    identification = score.find('identification')
    if identification is None:
        identification = E.Element('identification')
        index = next((i for i,n in enumerate(score) if n.tag in {'defaults','credit','part-list','part'}), len(score))
        score.insert(index, identification)
    for node in identification.findall('creator'):
        identification.remove(node)
    for role in reversed(FIELDS):
        if metadata.get(role):
            node=E.Element('creator', type=role); node.text=metadata[role]; identification.insert(0,node)
    misc = identification.find('miscellaneous')
    if misc is None:
        misc = child(identification, 'miscellaneous')
    for node in list(misc):
        if node.get('name', '').startswith('pianist-'):
            misc.remove(node)
    # Every original attribution remains recoverable even when its role is unclear.
    for name, value in [('pianist-layout-profile', PROFILE), ('pianist-source-sha256', sha(data)),
                        ('pianist-original-creators', json.dumps(original_creators, ensure_ascii=False)),
                        ('pianist-original-credits', json.dumps(original_credits, ensure_ascii=False))]:
        child(misc, 'miscellaneous-field', value, name=name)
    for node in list(score):
        if node.tag in {'defaults', 'credit'}:
            score.remove(node)
    defaults = E.Element('defaults')
    scaling = child(defaults, 'scaling'); child(scaling,'millimeters',7); child(scaling,'tenths',40)
    if concert:
        child(defaults, 'concert-score')
    page = child(defaults,'page-layout'); child(page,'page-height','1697.142857'); child(page,'page-width','1200')
    margins=child(page,'page-margins',type='both')
    for side in ['left','right','top','bottom']:
        child(margins, side+'-margin','85.714286')
    system=child(defaults,'system-layout'); sm=child(system,'system-margins')
    child(sm,'left-margin',0); child(sm,'right-margin',0); child(system,'system-distance',110); child(system,'top-system-distance',170)
    staff=child(defaults,'staff-layout'); child(staff,'staff-distance',75)
    child(defaults,'music-font',font_family='Leland')
    child(defaults,'word-font',font_family='FreeSerif',font_size=10)
    child(defaults,'lyric-font',font_family='FreeSerif',font_size=10)
    index = next(i for i,n in enumerate(score) if n.tag=='part-list'); score.insert(index, defaults); index+=1
    def credit(kind, text, x, y, size, align):
        nonlocal index
        node=E.Element('credit',page='1'); child(node,'credit-type',kind)
        child(node,'credit-words',text,default_x=x,default_y=y,font_family=font_for(text),font_size=size,justify=align,halign=align,valign='top')
        score.insert(index,node); index+=1
    title_lines = '\n'.join(textwrap.wrap(metadata['title'], width=44, break_long_words=False, break_on_hyphens=False))
    credit('title',title_lines,600,1610,22,'center')
    labels={'composer':'Nhạc','lyricist':'Lời','arranger':'Chuyển soạn piano','transcriber':'Chép lại','performer':'Theo bản trình bày'}
    lines=[]
    for role in FIELDS:
        if metadata.get(role):
            lines += textwrap.wrap(f'{labels[role]}: {metadata[role]}',width=90,break_long_words=False,break_on_hyphens=False)
    if lines:
        credit('composer','\n'.join(lines),1114,1510,10,'right')
    # Rights remain visible in MuseScore's copyright footer; preserve exact source text.
    rights = [clean(''.join(n.itertext())) for n in identification.findall('rights')]
    for raw in original_credits:
        old=E.fromstring(raw.encode('utf-8'))
        text=clean(''.join(''.join(n.itertext()) for n in old.findall('credit-words')))
        if old.findtext('credit-type')=='rights' or '©' in text or 'all rights reserved' in text.lower():
            rights.append(text)
    if any(rights):
        credit('rights','\n'.join(dict.fromkeys(v for v in rights if v)),600,45,8,'center')
    assert music_signature(score) == original_signature, 'Normalization changed musical XML'
    xml = E.tostring(score, encoding='utf-8', xml_declaration=True)
    output=BytesIO()
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name, contents in [('mimetype',b'application/vnd.recordare.musicxml'),
                               ('META-INF/container.xml',b'<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),
                               ('score.musicxml',xml)]:
            info=zipfile.ZipInfo(name,(2000,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; archive.writestr(info,contents)
    return output.getvalue(), {'profile':PROFILE,'sourceSha256':sha(data),'musicalXmlSignature':original_signature,
                               'allMusicalXmlPreserved':True, 'originalCreditCount':len(original_credits),
                               'preservedPrintedBreaks':preserve_breaks}
