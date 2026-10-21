"""Lossless source-local interning of repeated K3 verdicts and boundary rows."""
from curriculum_fragments import q
from curriculum_normalize import encoded

FORMAT='k3-interned-verdicts-v1'


def pack_payload(payload):
    table=[];by_value={};by_object={};candidates=[]
    for original in payload['candidates']:
        refs=[]
        for verdict in original['profileVerdicts']:
            key=id(verdict)
            if key not in by_object:
                value=encoded(verdict)
                if value not in by_value:by_value[value]=len(table);table.append(verdict)
                by_object[key]=by_value[value]
            refs.append(by_object[key])
        row={k:v for k,v in original.items() if k not in ('profileVerdicts','boundaryEvidence')}
        row['profileVerdictRefs']=refs;candidates.append(row)
    return {**payload,'storageFormat':FORMAT,'profileVerdictTable':table,'candidates':candidates}


def unpack_payload(payload):
    if 'storageFormat' not in payload:return payload
    if payload['storageFormat']!=FORMAT:raise ValueError('unknown-scan-storage')
    table=payload['profileVerdictTable'];candidates=[]
    edges={lid:{q(e['atQuarter']):e for e in p['exactEdges']} for lid,p in payload['proposals'].items()}
    for original in payload['candidates']:
        row={k:v for k,v in original.items() if k!='profileVerdictRefs'};s=row['selection']
        if any(type(r)!=int or not 0<=r<len(table) for r in original['profileVerdictRefs']):raise ValueError('invalid-verdict-reference')
        row['profileVerdicts']=[table[r] for r in original['profileVerdictRefs']]
        row['boundaryEvidence']={lid:{side:edges[lid][q(s[side+'Quarter'])] for side in ('start','end')} for lid in s['lineHands']}
        candidates.append(row)
    return {**{k:v for k,v in payload.items() if k not in ('storageFormat','profileVerdictTable')},'candidates':candidates}
