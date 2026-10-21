"""Explicit source-pool cleanup. Never traverses user folders or edits notes."""
from collections import Counter
from functools import lru_cache
from pathlib import Path
from xml.etree import ElementTree as ET
import hashlib
import json
import re
import sqlite3
import unicodedata

from curriculum_io import CorpusError, within, write_json

ROOT = Path(__file__).resolve().parents[2]


def name(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value)).casefold().split()).strip(' .')


@lru_cache(maxsize=1)
def instrument_names():
    """Use this checkout's original MuseScore names and translations."""
    tree = ET.parse(ROOT/'share/instruments/instruments.xml').getroot()
    types = {}
    piano_ids = set()
    for item in tree.iter('Instrument'):
        key = item.get('id')
        piano = item.findtext('musicXMLid', '').startswith('keyboard.piano')
        types[key] = piano
        if piano: piano_ids.add(key)
    labels = {}
    def add(text, piano):
        text = name(text)
        if text: labels.setdefault(text, set()).add(piano)
    for item in tree.iter('Instrument'):
        for tag in ('trackName', 'longName'):
            add(item.findtext(tag, ''), types[item.get('id')])
        if types[item.get('id')]: add(item.findtext('shortName', ''), True)
    for path in sorted((ROOT/'share/locale').glob('instruments_*.ts')):
        for message in ET.parse(path).iter('message'):
            comment = message.findtext('comment', '').split()
            if len(comment) < 2 or comment[0] not in types: continue
            if comment[1] not in ('trackName', 'longName', 'shortName'): continue
            piano = types[comment[0]]
            if comment[1] == 'shortName' and not piano: continue
            add(message.findtext('source', ''), piano)
            translation = message.find('translation')
            if translation is not None:
                add(''.join(translation.itertext()), piano)
    # Source names may describe a register/role instead of an instrument.
    for role in ('bass','treble','alto','tenor','soprano','left','right'):
        labels.pop(role, None)
    return labels


def label_kind(value, labels=None):
    labels = instrument_names() if labels is None else labels
    value = name(value)
    if not value: return 'unknown'
    kinds = labels.get(value, set())
    if kinds == {True}: return 'piano'
    if kinds == {False}: return 'other'
    # Literal piano variants used by MusicXML/MIDI exporters, with conflicts
    # checked separately on every part/instrument before accepting a source.
    if re.search(r'\b(piano|pianoforte|klavier)\b', value): return 'piano'
    return 'unknown'


def classify(parts, layout, metadata_names=()):
    """No grade/fingering inference. Unknown identity is retained for review."""
    if layout and sum(layout['stavesPerPart']) != 2:
        return {'action':'delete', 'reason':'not-two-staff-source'}
    if layout and layout.get('unpitchedNotes', 0):
        return {'action':'delete', 'reason':'non-piano-unpitched-source'}
    piano = other = False
    for part in parts:
        instrument_kinds = [label_kind(n) for n in part.get('instruments', []) if name(n)]
        part_name = part.get('name', '')
        part_kind = label_kind(part_name)
        # Voice labels and compound piano/vocal part names are explicit
        # conflicts; a copied piano playback patch cannot override them.
        voice = bool(re.search(r'\b(voice|vocal|vocals|choir|soprano|mezzo-soprano|tenor)\b', name(part_name)))
        if 'other' in instrument_kinds or part_kind == 'other' or voice:
            other = True
        if 'piano' in instrument_kinds or part_kind == 'piano': piano = True
    meta_kinds = [label_kind(n) for n in metadata_names if name(n)]
    if other: return {'action':'delete', 'reason':'other-instrument-source'}
    # Metadata describes the original web upload; PDMX may contain only its
    # piano part. Actual piano declarations in this MXL take precedence.
    if piano:
        return {'action':'keep', 'reason':'piano-multiple-staff-source'}
    if 'other' in meta_kinds:
        if 'piano' in meta_kinds:
            return {'action':'review', 'reason':'metadata-instrument-conflict'}
        return {'action':'delete', 'reason':'other-instrument-metadata'}
    if 'piano' in meta_kinds:
        return {'action':'keep', 'reason':'piano-multiple-staff-source'}
    # A few anonymous MusicXML exports have a contradictory Drum-group web
    # label. Retain their actual two-staff, pitched G/F keyboard notation when
    # the XML also declares a non-percussion acoustic-piano playback patch.
    clefs=layout.get('clefs',[]) if layout else []
    programs={str(p) for part in parts for p in part.get('midiPrograms',[])}
    channels={str(c) for part in parts for c in part.get('midiChannels',[])}
    if (layout and layout['stavesPerPart']==[2] and layout.get('pitchedNotes',0)>0
            and programs=={'1'} and channels and '10' not in channels and clefs
            and {c['staff'] for c in clefs}=={1,2}
            and all((c['sign'],c['line'],c['octaveChange']) in (('G',2,0),('F',4,0)) for c in clefs)):
        return {'action':'keep','reason':'two-staff-piano-notation'}
    return {'action':'review', 'reason':'identity-not-established'}


def checked_target(root, relative):
    """Each destructive target must be a regular file inside its owned root."""
    root = root.resolve()
    path = within(root, relative)
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise CorpusError('cleanup-target-outside-owned-root')
    if not path.is_file(): raise CorpusError('cleanup-target-not-file:'+str(path))
    return path


def delete_checked(root, relative, expected_sha):
    path = checked_target(root, relative)
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha:
        raise CorpusError('cleanup-target-changed:'+str(path))
    path.unlink()
    return len(data)


def tombstone_sources(db, removed):
    db.execute('''CREATE TABLE IF NOT EXISTS user_removed_sources(
        sha256 TEXT PRIMARY KEY, reason TEXT NOT NULL, removed_at TEXT NOT NULL)''')
    with db:
        for row in removed:
            db.execute("UPDATE files SET container_status='removed-by-user', error=? WHERE sha256=?",
                       (row['reason'], row['sha']))
            db.execute("UPDATE origins SET extraction_status='removed-by-user',parse_status='removed-by-user',rejection_json=? WHERE file_sha256=?",
                       (json.dumps([row['reason']]), row['sha']))
            db.execute("INSERT OR REPLACE INTO user_removed_sources VALUES(?,?,datetime('now'))",
                       (row['sha'],row['reason']))


def legacy_collection_guard(output):
    marker=output/'source-cleanup.json'
    if marker.is_file():
        raise CorpusError('source-pool-was-pruned: legacy tracks=0 bulk collection is disabled; see source-cleanup.json')
