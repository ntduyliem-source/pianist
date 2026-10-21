"""Original source -> Q3 projection -> Q2 native oracle jobs; no corpus scores."""
import sys
from pathlib import Path
from curriculum_fragments import SourceIndex, project_xml, verify_projection
from curriculum_normalize import normalize, piano_xml, encoded, digest
from curriculum_io import write_json

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tests/curriculum'))
from fixtures_q3 import fixtures, EXPECTED
from fixtures_q2 import fixtures as q2_fixtures, score, note


def main():
    folder = ROOT/'artifacts/q3-fixtures'
    folder.mkdir(parents=True, exist_ok=True)
    inputs = fixtures()
    inputs['inherited-tempo']=inputs['g5-both'].replace(b'<note ',b'<direction><sound tempo="76"/></direction><note ',1)
    inputs['inherited-accidental']=q2_fixtures()['accidental-bars']
    inputs['64-target-boundary']=score([''.join(note(s) for s in 'CDED')]*16)
    counts = dict(zip(EXPECTED, [8,4,7,8,6,8,8,10,6,4,5,5,5,8]))
    entries = []
    cases = [(name, tuple(normalize(inputs[name])['lines']), 0, None, count) for name,count in counts.items()]
    cases += [('cut-tie',('P1:s1:v1',),0,2,7),('recover-clean-bar',('P1:s1:v1',),1,2,4),
              ('g5-both',('P1:s2:v5',),0,2,2),('inherited-tempo',('P1:s2:v5',),1,2,1),
              ('inherited-accidental',('P1:s1:v1',),1,2,3),('64-target-boundary',('P1:s1:v1',),0,16,64)]
    for k,(name,lids,start,end,count) in enumerate(cases):
        raw = inputs[name]; original = normalize(raw); index = SourceIndex(original,raw)
        end = end or len(index.measures[original['lines'][lids[0]]['partId']])
        xml = project_xml(index,lids,start,end)
        analysis = normalize(xml)
        proof = verify_projection(index,lids,start,end,analysis)
        if not proof['passed'] or analysis['releaseBlockers']:
            raise ValueError((name,proof,analysis['releaseBlockers']))
        canonical,_=piano_xml(xml)
        id_=f'{k+1:02}-{name}'
        xp=folder/(id_+'.musicxml'); ap=folder/(id_+'.json')
        xp.write_bytes(canonical); ap.write_bytes(encoded(analysis).encode())
        entries.append({'id':id_,'xml':str(xp),'analysis':str(ap),'analysisSha256':digest(ap.read_bytes()),
                        'expectedTargets':count,'expectEligible':True,
                        'expectedNotation':{'clefs':[[0,0,'F']] if len(lids)==1 and 's2' in lids[0] else
                                            [[0,0,'G'],[1,0,'F']] if len(lids)==2 else [[0,0,'G']], 'ottavas':[]}})
    write_json(folder/'jobs.json',{'pipeline':'q3-original-fixtures-v1','entries':entries})
    print(f'{len(entries)} source-projection/native fixtures')


if __name__=='__main__': main()
