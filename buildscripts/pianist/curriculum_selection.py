"""Exact source spans. No rounding to bars or rewriting note durations."""
from bisect import bisect_left, bisect_right
from contextlib import contextmanager

from curriculum_fragments import q
from curriculum_normalize import rational, digest, encoded
from curriculum_io import CorpusError


@contextmanager
def verified_scan(index, analysis_sha):
    """Memoize source checks only while an immutable batch scan owns the index.

    Standalone grade calls still hash their input. Any mutation during a batch
    invalidates the entire result before it can be checkpointed.
    """
    if digest(encoded(index.a).encode()) != analysis_sha:
        raise CorpusError('grade-source-analysis-binding')
    if hasattr(index, '_verified_scan_analysis'):
        raise CorpusError('nested-source-scan')
    index._verified_scan_analysis = (index.a, analysis_sha)
    index._grade_context_cache = {}
    index._grade_input_cache = {}
    index._grade_rhythm_cache = {}
    try:
        yield
        if digest(encoded(index.a).encode()) != analysis_sha:
            raise CorpusError('analysis-mutated-during-scan')
    finally:
        del index._verified_scan_analysis
        del index._grade_context_cache
        del index._grade_input_cache
        del index._grade_rhythm_cache


def bounds(index, selection):
    coarse = index.boundaries(tuple(selection['lineHands']), selection['startMeasure'], selection['endMeasure'])
    present = [k in selection for k in ('startQuarter', 'endQuarter')]
    if any(present) and not all(present):
        raise CorpusError('grade-incomplete-exact-span')
    if not any(present):
        return coarse
    try:
        lo, hi = (q(selection[k]) for k in ('startQuarter', 'endQuarter'))
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as error:
        raise CorpusError('grade-invalid-exact-span') from error
    if not coarse[0] <= lo < hi <= coarse[1]:
        raise CorpusError('grade-invalid-exact-span')
    pid = index.a['lines'][next(iter(selection['lineHands']))]['partId']
    bars = index.measures[pid]
    if not lo < q(bars[selection['startMeasure']]['start']) + q(bars[selection['startMeasure']]['duration']):
        raise CorpusError('grade-noncanonical-exact-span')
    if not hi > q(bars[selection['endMeasure'] - 1]['start']):
        raise CorpusError('grade-noncanonical-exact-span')
    return lo, hi


def events(index, selection, lids=None):
    lo, hi = bounds(index, selection)
    return [e for e in index.selected(tuple(lids or selection['lineHands']),
                                      selection['startMeasure'], selection['endMeasure'])
            if lo <= q(e['onset']) < hi]


def make_selection(index, analysis_sha, hands, lo, hi):
    pid = index.a['lines'][next(iter(hands))]['partId']
    starts = [q(m['start']) for m in index.measures[pid]]
    selection = {'sourceSha256': index.a['sourceSha256'], 'analysisSha256': analysis_sha,
                 'lineHands': hands, 'startMeasure': bisect_right(starts, lo) - 1,
                 'endMeasure': bisect_left(starts, hi),
                 'startQuarter': rational(lo), 'endQuarter': rational(hi)}
    bounds(index, selection)
    return selection


def integrity(index, selection):
    lids = tuple(sorted(selection['lineHands']))
    start, end = selection['startMeasure'], selection['endMeasure']
    lo, hi = bounds(index, selection)
    coarse = index.cut_reasons(lids, start, end)
    if (lo, hi) == index.boundaries(lids, start, end):
        return coarse
    # Preserve conservative source/unsupported warnings. Recheck cuts at the
    # actual endpoints; a cut at the surrounding bar is not this selection.
    reasons = {r for r in coarse if not r.startswith('cut-')}
    selected = events(index, selection)
    ids = {e['id'] for e in selected}
    pid = index.a['lines'][lids[0]]['partId']
    for lid in lids:
        for e in index.by_line[lid]:
            a, b = q(e['onset']), q(e['onset']) + q(e['duration'])
            if a < lo < b or a < hi < b:
                reasons.add('cut-held-note' if e['kind'] == 'note' else 'cut-rest')
            if e['id'] in ids and any(e.get(k) and e[k] not in ids for k in ('tieFrom', 'tieTo')):
                reasons.add('cut-tie')
    for slur in index.a['slurs']:
        endpoints = slur['startEventIds'] + slur['endEventIds']
        source_events = [index.events[i] for i in endpoints if i in index.events]
        relevant = [e for e in source_events if e['lineId'] in lids]
        if not relevant:
            continue
        if any(e['id'] in ids for e in relevant) and not all(i in ids for i in endpoints):
            reasons.add('cut-or-cross-line-slur')
        elif min(q(e['onset']) for e in source_events) < lo and max(q(e['onset']) for e in source_events) >= hi:
            reasons.add('cut-slur')
    for pedal in index.a['pedals']:
        if pedal['partId'] == pid and (q(pedal['start']) < lo < q(pedal['end']) or q(pedal['start']) < hi < q(pedal['end'])):
            reasons.add('cut-pedal')
    # Q2's other direction spans have measure precision only; never claim an
    # exact interior cut is safe using those coarse coordinates.
    staffs = {index.a['lines'][l]['staff'] for l in lids}
    if any(staff in staffs and a < end and b >= start for a, b, staff, _ in index.direction_spans[pid]):
        reasons.add('midbar-direction-spanner-needs-exact-context')
    return sorted(reasons)
