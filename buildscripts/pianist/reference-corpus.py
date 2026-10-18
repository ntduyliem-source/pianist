"""Deterministic INPUT corpus plus independent assertions. C# supplies the oracle."""
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'tests/fixtures/pianist/reference'
FIXTURES.mkdir(parents=True, exist_ok=True)
cases = []


def add(name, notes, presses, od=5, end=None):
    targets = [{'id': f'n{i}', 'pitch': p, 'at': t} for i, (t, p) in enumerate(notes)]
    steps = [{'kind': 'press', 'at': t, 'pitch': p, 'seq': i + 1} for i, (t, p) in enumerate(presses)]
    steps.sort(key=lambda s: (s['at'], s['seq']))
    steps.append({'kind': 'advance', 'at': end if end is not None else max([n['at'] for n in targets] + [s['at'] for s in steps] + [0]) + 1000})
    cases.append({'id': name, 'od': od, 'notes': targets, 'steps': steps})


add('nine-early-120', [(500+i*200, 60) for i in range(9)], [(380+i*200, 60) for i in range(9)])
add('nine-late-120', [(500+i*200, 60) for i in range(9)], [(620+i*200, 60) for i in range(9)])
add('skip-first-dense-upstream', [(1000+i*100, 60) for i in range(7)], [(1010+i*100, 60) for i in range(1, 7)])
add('chord-opposite-offsets', [(1000, 60), (1000, 64)], [(900, 60), (1100, 64)])
add('octave-is-different', [(1000, 60)], [(1000, 72)])
add('early-whole-beat', [(2000, 60)], [(1000, 60)])
add('extra-after-hit', [(1000, 60)], [(1000, 60), (1100, 60), (1150, 63)])
add('same-lane-next-onset', [(1000, 60), (1100, 60)], [(1100, 60)])
add('both-hands-density', [(1000, 48), (1600, 48)] + [(1000+i*60, 60) for i in range(12)], [(1000, 48), (1600, 48)] + [(1000+i*60, 60) for i in range(12)])
for od in [0, 2.5, 5, 7.5, 10]:
    # Deliberately use literal known window boundaries at OD5, plus a dense grid
    # for other ODs; no implementation of the upstream grading formula here.
    for delta in [-174, -173.5, -173.499, -137, -136.5, -136.499, -113, -112.5, -112.499,
                  -83, -82.5, -82.499, -50, -49.5, -49.499, -20, -19.5, -19.499,
                  0, 19.499, 19.5, 19.501, 49.5, 49.501, 82.5, 82.501, 112.5, 112.501,
                  136.5, 136.501, 173.5, 173.501]:
        add(f'boundary-{od}-{delta}', [(1000, 60)], [(1000+delta, 60)], od)
rng = random.Random(203712)
for i in range(160):
    notes = [(500+j*rng.choice([60, 100, 200, 450]), rng.choice([48, 60, 64, 67])) for j in range(24)]
    # Native adapter collapses actual unisons before they reach the kernel.
    notes = sorted(set(notes))
    events = [(at+rng.choice([-180, -120, -50, 0, 19.5, 80, 120, 170]), pitch) for at, pitch in notes if rng.random() > .2]
    events += [(rng.randint(400, 6000), rng.choice([60, 61, 64, 70])) for _ in range(8)]
    add(f'seeded-{i}', notes, events, rng.choice([0, 5, 10]))
input_path = FIXTURES / 'bpm-input.json'
output_path = FIXTURES / 'bpm-upstream.json'
input_path.write_text(json.dumps(cases, separators=(',', ':')) + '\n', encoding='utf8')
subprocess.run(['dotnet', 'build', str(ROOT/'tests/reference-runners/osu/ReferenceRunner.csproj'), '-c', 'Release', '--nologo'], check=True)
subprocess.run(['dotnet', str(ROOT/'artifacts/reference-build/bin/Release/net10.0/ReferenceRunner.dll'), str(input_path), str(output_path)], check=True)
result = {v['id']: v for v in json.loads(output_path.read_text())}
for name, delta in [('nine-early-120', -120), ('nine-late-120', 120)]:
    r = result[name]
    assert len(r['judgements']) == 9 and not r['extras']
    assert all(j['id'] == f'n{i}' and j['seq'] == i+1 and j['delta'] == delta and j['grade'] != 'miss' for i,j in enumerate(r['judgements']))
r = result['skip-first-dense-upstream']
assert {j['id']:j['grade'] for j in r['judgements']} == {'n0':'miss', **{f'n{i}':'perfect' for i in range(1,7)}}
assert all(j['delta'] == 10 for j in r['judgements'] if j['grade'] != 'miss')
assert [j['grade'] for j in result['chord-opposite-offsets']['judgements']] == ['ok', 'ok']
assert result['octave-is-different']['extras'] == [1]
assert result['early-whole-beat']['judgements'][0]['grade'] == 'miss'
assert result['boundary-5-19.5']['judgements'][0]['grade'] == 'perfect'
assert result['boundary-5-19.501']['judgements'][0]['grade'] == 'great'
print(f'R0: {len(cases)} original C# scenarios executed; independent dense/repeated/boundary assertions passed.')

# The event-time adapter uses deterministic automatic clock steps rather than
# browser frames. Run the original C# with those SAME steps too, independently
# of the TS implementation. Width comes from the original runner above.
import math
host_cases=[]
for case in cases:
    width=result[case['id']]['windows']['meh']
    steps=[dict(s,seq=s.get('seq',0)*2) for s in case['steps'] if s['kind']=='press']
    steps += [{'kind':'tick','at':math.nextafter(n['at']+width,math.inf)} for n in case['notes']]
    steps.sort(key=lambda s:(s['at'],0 if s['kind']=='tick' else 1,s.get('seq',0)))
    host_cases.append({**case,'steps':steps})
host_input=FIXTURES/'event-host-input.json';host_output=FIXTURES/'event-host-upstream.json'
host_input.write_text(json.dumps(host_cases,separators=(',',':'))+'\n',encoding='utf8')
subprocess.run(['dotnet',str(ROOT/'artifacts/reference-build/bin/Release/net10.0/ReferenceRunner.dll'),str(host_input),str(host_output)],check=True)
print(f'R2: original C# event-time host corpus generated: {len(host_cases)} cases.')
