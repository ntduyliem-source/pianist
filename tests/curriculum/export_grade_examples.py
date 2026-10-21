"""Export inspectable synthetic K2 examples; never add these to the corpus."""
import collections
import inspect
import json
from pathlib import Path
import music21 as m21
from fixtures_grades import make,CONFIG,ROOT
from curriculum_grades import assess_profile,VERSION
from curriculum_normalize import digest,encoded
from curriculum_io import write_json


def main():
    root=ROOT/'artifacts/curriculum-grades/examples'
    entries=[]
    for p in CONFIG['profiles']:
        directory=root/p['id'];directory.mkdir(parents=True,exist_ok=True)
        i,s,_,e,raw=make(p['id'])
        positive=assess_profile(i,s,p,e,CONFIG)
        unknown=assess_profile(i,s,p,None,CONFIG)
        altered=raw.replace(b'<step>C</step>',b'<step>C</step><alter>1</alter>',1)
        ni,ns,np,ne,_=make(p['id'],altered)
        negative=assess_profile(ni,ns,np,ne,CONFIG)
        if [positive['status'],negative['status'],unknown['status']]!=['pass','fail','review']:
            raise RuntimeError('Unexpected fixture verdict: '+p['id'])
        (directory/'pass.musicxml').write_bytes(raw)
        (directory/'fail.musicxml').write_bytes(altered)
        write_json(directory/'evidence.json',e)
        write_json(directory/'verdicts.json',{'pass':positive,'fail':negative,'missingEvidence':unknown})
        entries.append({'profileId':p['id'],'grade':p['grade'],'positive':'pass','negative':'fail',
            'missingEvidence':'review','passXmlSha256':digest(raw),'failXmlSha256':digest(altered)})
    upstream={}
    for name,obj in [('interval',m21.interval.Interval),('chord',m21.chord.Chord),('key',m21.key.KeySignature)]:
        file=Path(inspect.getfile(obj))
        upstream[name]={'path':str(file),'sha256':digest(file.read_bytes()),'version':m21.__version__}
    report={'schemaVersion':3,'scope':'Synthetic rule validation ONLY; not original music or bank exercises',
        'rulesVersion':VERSION,'configSha256':digest(encoded(CONFIG).encode()),
        'graderSha256':digest((ROOT/'buildscripts/pianist/curriculum_grades.py').read_bytes()),
        'profiles':len(entries),'grades':dict(collections.Counter(x['grade'] for x in entries)),
        'caseCount':len(entries)*3,'upstream':upstream,'entries':entries}
    write_json(root.parent/'fixture-verification.json',report)
    print(json.dumps({'profiles':len(entries),'cases':len(entries)*3,'report':str(root.parent/'fixture-verification.json')}))


if __name__=='__main__':main()
