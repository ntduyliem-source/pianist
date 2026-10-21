"""Compare automatic proposals to existing source-bound local annotations.

Annotations are held out of the scanner. They are partial assistant reviews,
not an exhaustive teacher-labelled phrase benchmark; do not report precision.
"""
import argparse
from collections import Counter
from contextlib import closing
import gzip
import json
from pathlib import Path
import sqlite3
import zlib

from curriculum_fragments import q
from curriculum_normalize import digest, encoded
from curriculum_io import CorpusError, write_json

ROOT = Path(__file__).resolve().parents[2]


def audit(scans, normalized, reference):
    units = json.loads(reference.read_text(encoding='utf8'))['units']
    cache = {}; rows = []
    with closing(sqlite3.connect((normalized / 'normalization.sqlite').resolve().as_uri() + '?mode=ro', uri=True)) as db:
        for unit in units:
            sha = unit['sourceSha256']; path = scans / 'scans' / (sha + '.json.gz')
            if sha not in cache:
                if not path.exists():
                    raise CorpusError('missing-reference-source-scan:' + sha)
                raw = path.read_bytes(); wrapper = json.loads(gzip.decompress(raw)); payload = wrapper['payload']
                if digest(encoded(payload).encode()) != wrapper['payloadSha256'] or payload['sourceSha256'] != sha:
                    raise CorpusError('unbound-scan-payload:' + sha)
                match = db.execute('SELECT blob FROM analyses WHERE source_sha=? AND analysis_sha=?',
                                   (sha, payload['analysisSha256'])).fetchone()
                if not match:
                    raise CorpusError('missing-scan-analysis:' + sha)
                blob = zlib.decompress(match[0])
                if digest(blob) != payload['analysisSha256']:
                    raise CorpusError('unbound-scan-analysis:' + sha)
                cache[sha] = (payload, json.loads(blob), digest(raw))
            payload, analysis, scan_hash = cache[sha]
            if unit['analysisSha256'] != payload['analysisSha256']:
                raise CorpusError('stale-reference-analysis:' + sha)
            lid = unit['lineId']; pid = analysis['lines'][lid]['partId']
            measures = [m for m in analysis['measures'] if m['partId'] == pid]
            lo = q(measures[unit['startMeasure']]['start'])
            last = measures[unit['endMeasure'] - 1]
            hi = q(last['start']) + q(last['duration'])
            proposed = {q(e['atQuarter']) for e in payload['proposals'][lid]['exactEdges']}
            candidates = [c for c in payload['candidates'] if set(c['selection']['lineHands']) == {lid}
                          and q(c['selection']['startQuarter']) == lo and q(c['selection']['endQuarter']) == hi]
            verdicts = [v for c in candidates for v in c['profileVerdicts'] if v['profileId'] == unit['profileId']]
            rows.append({'label': unit['label'], 'sourceSha256': sha, 'scanSha256': scan_hash,
                         'lineId': lid, 'startMeasure': unit['startMeasure'], 'endMeasure': unit['endMeasure'],
                         'startRecovered': lo in proposed, 'endRecovered': hi in proposed,
                         'candidateFound': bool(candidates), 'profileVerdicts': verdicts,
                         'referenceStatus': unit['review']['status'],
                         'referenceMethod': unit['review']['method'],
                         'teacherReviewed': unit['review'].get('teacherReviewed', False)})
    accepted=[r for r in rows if r['referenceStatus']=='accepted-local-pilot']
    return {'referenceSha256': digest(reference.read_bytes()), 'referenceUnits': len(rows),
            'acceptedReferenceUnits': len(accepted), 'pendingReferenceUnits': len(rows)-len(accepted),
            'acceptedUnitsRecovered': sum(r['startRecovered'] and r['endRecovered'] for r in accepted),
            'sourceCount': len(cache), 'unitsWithBothEndpoints': sum(r['startRecovered'] and r['endRecovered'] for r in rows),
            'candidateUnits': sum(r['candidateFound'] for r in rows),
            'contentOutcomes': dict(Counter(v['status'] for r in rows for v in r['profileVerdicts'])),
            'interpretation': 'Recovery of partial local annotations only; unannotated model peaks are not labelled false positives. No precision or piano-wide phrase accuracy claim.',
            'scannerUsesReferenceAnnotations': False, 'rows': rows}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scans', type=Path, required=True)
    p.add_argument('--normalized', type=Path, default=ROOT / 'artifacts/curriculum-normalized')
    p.add_argument('--reference', type=Path, default=ROOT / 'scores/curriculum/reviewed-units.v2.json')
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    report = audit(args.scans, args.normalized, args.reference)
    write_json(args.output, report)
    print(json.dumps({k: v for k, v in report.items() if k != 'rows'}, ensure_ascii=False))
