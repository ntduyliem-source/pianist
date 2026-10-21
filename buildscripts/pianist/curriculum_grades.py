"""K2: literal, versioned G1-G8 content rules; not a performance grader.

Intervals/chords/pitches are upstream music21. Rhythm cells implement the
already documented R0-R7 product policy with exact fractions. No learned or
weighted difficulty/phrase/fingering inference. Unknown evidence stays review.
"""
from collections import defaultdict
from fractions import Fraction
from pathlib import Path
import json
import math

import music21 as m21
from curriculum_fragments import q, line_features, pitch_name, upstream_pitch
from curriculum_normalize import digest, encoded, rational
from curriculum_io import CorpusError
from curriculum_selection import bounds as selection_bounds, events as selected_events, integrity as selection_integrity

ROOT = Path(__file__).resolve().parents[2]
VERSION = 'graded-content-rules-v3'
ALLOWED = {1:{'P1'},2:{'m2','M2'},3:{'m3','M3'},4:{'P4'},5:{'P5'},
           6:{'m6','M6'},7:{'m7','M7'},8:{'P8'}}


def load_config(path=None):
    value=json.loads((path or ROOT/'scores/curriculum/grades.v3.json').read_text(encoding='utf8'))
    if value['schemaVersion'] != 3 or value['rulesVersion'] != VERSION:
        raise CorpusError('grade-rules-version-mismatch')
    ids=[p['id'] for p in value['profiles']]
    if len(set(ids)) != len(ids) or set(p['grade'] for p in value['profiles']) != set(range(1,9)):
        raise CorpusError('grade-profile-coverage')
    return value


def selection_digest(selection):
    keys=('sourceSha256','analysisSha256','lineHands','startMeasure','endMeasure')
    value={k:selection[k] for k in keys}
    value.update({k:selection[k] for k in ('startQuarter','endQuarter') if k in selection})
    return digest(encoded(value).encode())


def context_digest(index, selection):
    cached=getattr(index,'_grade_context_cache',None)
    key=selection_digest(selection)
    if cached is not None and key in cached:return cached[key]
    pid=index.a['lines'][next(iter(selection['lineHands']))]['partId']
    start,end=selection['startMeasure'],selection['endMeasure']
    value=digest(encoded({'selection':key,
        'events':[e for e in index.a['events'] if e['partId']==pid and max(0,start-1)<=e['measureIndex']<=end],
        'contexts':index.a['contexts'],'pedals':index.a['pedals'],'slurs':index.a['slurs']}).encode())
    if cached is not None:
        if len(cached)>=1024:cached.pop(next(iter(cached)))
        cached[key]=value
    return value


def validate_selection(index, selection):
    verified=getattr(index,'_verified_scan_analysis',None)
    sha=verified[1] if verified and verified[0] is index.a else digest(encoded(index.a).encode())
    if selection.get('sourceSha256') != index.a['sourceSha256'] or selection.get('analysisSha256') != sha:
        raise CorpusError('grade-source-analysis-binding')
    hands=selection.get('lineHands',{})
    if not isinstance(hands,dict) or not hands or any(l not in index.a['lines'] or h not in ('left','right') for l,h in hands.items()):
        raise CorpusError('grade-invalid-line-hands')
    pids={index.a['lines'][l]['partId'] for l in hands}
    if len(pids)!=1: raise CorpusError('grade-different-source-parts')
    start,end=selection.get('startMeasure'),selection.get('endMeasure')
    if type(start)!=int or type(end)!=int or not 0<=start<end<=len(index.measures[next(iter(pids))]):
        raise CorpusError('grade-invalid-span')
    selection_bounds(index,selection)


def rhythm_check(index,lid,start,end,family,span=None):
    cache=getattr(index,'_grade_rhythm_cache',None)
    key=(lid,start,end,family,span)
    if cache is not None and key in cache:return cache[key]
    result=_rhythm_check(index,lid,start,end,family,span)
    if cache is not None:
        if len(cache)>=1024:cache.pop(next(iter(cache)))
        cache[key]=result
    return result


def _rhythm_check(index,lid,start,end,family,span=None):
    """Return exact source witnesses; no duration approximation/tempo scoring."""
    all_events=index.selected((lid,),start,end)
    if span:all_events=[e for e in all_events if span[0]<=q(e['onset'])<span[1]]
    ids=[e['id'] for e in all_events]
    witnesses=[]; errors=[]
    pid=index.a['lines'][lid]['partId']
    for mi in range(start,end):
        bar=index.measures[pid][mi]; lo=q(bar['start']); duration=q(bar['duration'])
        begin=max(lo,span[0]) if span else lo
        finish=min(lo+duration,span[1]) if span else lo+duration
        ee=[e for e in index.by_bar[(lid,mi)] if begin<=q(e['onset'])<finish]; cursor=begin; i=0
        while i<len(ee):
            e=ee[i]; d=q(e['duration']); phase=cursor-lo
            if q(e['onset'])!=cursor or d<=0:
                errors.append(e['id']);break
            tied=bool(e.get('tieFrom') or e.get('tieTo'))
            if tied and family!='R5': errors.append(e['id']);break
            if e['notation']['timeModification']: errors.append(e['id']);break
            cells={'R3':[(Fraction(1,2),Fraction(1,2))],
                   'R4':[(Fraction(3,2),Fraction(1,2))],
                   'R6':[(Fraction(1,2),1,Fraction(1,2))],
                   'R7':[(Fraction(1,2),)*3,(1,Fraction(1,2)),(Fraction(3,2),)]}.get(family,[])
            matched=False
            for cell in cells:
                grid=Fraction(3,2) if family=='R7' else 2 if family in ('R4','R6') else 1
                part=ee[i:i+len(cell)]; at=cursor
                if phase%grid or len(part)!=len(cell) or cursor+sum(cell)>finish: continue
                good=True
                for item,length in zip(part,cell):
                    if item['kind']!='note' or q(item['onset'])!=at or q(item['duration'])!=length or item.get('tieFrom') or item.get('tieTo'):
                        good=False;break
                    at+=length
                if good:
                    witnesses.append([n['id'] for n in part]);cursor=at;i+=len(cell);matched=True;break
            if matched: continue
            if family=='R7': errors.append(e['id']);break
            if family=='R5':
                # The only off-beat long value is a real tied note. Ordinary
                # off-beat attacks remain eighth notes; explicit links must
                # cross a quarter beat from a weak half-beat.
                if d not in (Fraction(1,2),1,2,3,4) or (phase*2).denominator!=1 or phase+d>duration:
                    errors.append(e['id']);break
                if phase.denominator!=1 and d!=Fraction(1,2) and not tied:
                    errors.append(e['id']);break
                if not tied and d in (3,4) and (phase!=0 or d!=duration):
                    errors.append(e['id']);break
                if e.get('tieTo') and phase.denominator!=1:
                    other=index.events[e['tieTo']]
                    if q(other['onset'])-lo>phase and (q(other['onset'])-lo).denominator==1:
                        chain=[e['id']]; current=e
                        while current.get('tieTo'):
                            current=index.events[current['tieTo']];chain.append(current['id'])
                        if all(n in ids for n in chain): witnesses.append(chain)
            else:
                allowed=(1,) if family=='R0' else (1,2,4)
                if duration==3 and family!='R0': allowed=(*allowed,3)
                if d not in allowed or phase.denominator!=1 or phase+d>duration:
                    errors.append(e['id']);break
                if d in (3,4) and (phase!=0 or d!=duration): errors.append(e['id']);break
            if e['kind']=='rest':
                if family in ('R0','R1') or d!=1: errors.append(e['id']);break
                if family=='R2': witnesses.append([e['id']])
            elif d>1 and family=='R1': witnesses.append([e['id']])
            cursor+=d;i+=1
        if cursor!=finish: errors.extend(n['id'] for n in ee)
        if cursor!=finish and not ee: errors.append('missing-voice-coverage:'+lid+':'+str(mi))
    if family in ('R4','R5','R6'):
        # Require source context on both sides of the teaching pattern.
        witnesses=[w for w in witnesses if ids.index(w[0])>0 and ids.index(w[-1])<len(ids)-1]
    return {'family':family,'passed':not errors and (family=='R0' or bool(witnesses)),
            'witnessEventIds':witnesses,'violatingEventIds':sorted(set(errors))}


def selection_inputs(index,selection):
    cache=getattr(index,'_grade_input_cache',None); key=selection_digest(selection)
    if cache is not None and key in cache:return cache[key]
    lids=tuple(sorted(selection['lineHands']));lo,hi=selection_bounds(index,selection)
    events=selected_events(index,selection);notes=[e for e in events if e['kind']=='note']
    by_line={lid:[e for e in events if e['lineId']==lid] for lid in lids}
    features={lid:line_features(ee) for lid,ee in by_line.items()}
    pid=index.a['lines'][lids[0]]['partId']
    source_lines={e['lineId'] for e in index.a['events'] if e['partId']==pid and
                  lo<=q(e['onset'])<hi and e['kind']=='note'}
    result=(lo,hi,events,notes,[e['id'] for e in events],by_line,features,
            selection_integrity(index,selection),source_lines)
    if cache is not None:
        if len(cache)>=1024:cache.pop(next(iter(cache)))
        cache[key]=result
    return result


def assess_profile(index, selection, profile, evidence=None, config=None):
    validate_selection(index,selection)
    config=config or load_config(); evidence=evidence if isinstance(evidence,dict) else {}
    if profile not in config['profiles']:raise CorpusError('profile-outside-config')
    checks=[]
    def record(rule,status,events=(),detail=None):
        row={'rule':rule,'status':status,'eventIds':list(dict.fromkeys(events))}
        if detail is not None: row['detail']=detail
        checks.append(row)
    def test(rule,condition,events=(),detail=None):
        record(rule,'pass' if condition else 'fail',events,detail)
    hands=selection['lineHands']; lids=tuple(sorted(hands)); start,end=selection['startMeasure'],selection['endMeasure']
    lo,hi,events,notes,event_ids,by_line,features,reasons,source_lines=selection_inputs(index,selection)
    test('hand-configuration',len(lids)==profile['lines'] and len(set(hands.values()))==len(lids),event_ids)
    test('monophony-and-held-notes',bool(notes) and all(f['monophonic'] for f in features.values()),event_ids)
    test('keyboard-range',all(21<=e['pitch']['midi']<=108 and int(e['pitch']['midi'])==e['pitch']['midi'] for e in notes),[e['id'] for e in notes])
    for reason in reasons:
        # Unsupported interpretation is reviewable, never proof that a valid
        # source file is bad. Actual severed notation is an explicit failure.
        record('source-integrity:'+reason,'fail' if reason.startswith('cut-') else 'review',event_ids)
    if not reasons: record('source-integrity','pass',event_ids)
    bound=(evidence.get('kind') in (None,'human') and
           evidence.get('selectionSha256')==selection_digest(selection) and
           evidence.get('contextSha256')==context_digest(index,selection) and
           evidence.get('rulesVersion')==VERSION and evidence.get('profileId')==profile['id'] and
           evidence.get('configSha256')==digest(encoded(config).encode()) and
           all(isinstance(evidence.get(k),str) and evidence[k].strip() for k in ('reviewer','reviewedAt','method','reference')))
    claims=evidence.get('claims',{}) if bound and isinstance(evidence.get('claims'),dict) else {}
    if evidence.get('kind')=='machine':
        from curriculum_evidence import verified_claims
        verified=verified_claims(index,selection,profile,config,evidence)
        bound=verified is not None
        claims=verified or {}
    record('evidence-binding','pass' if bound else 'review',event_ids,
           {'kind':evidence.get('kind','human') if bound else 'unverified',
            'producer':evidence.get('producer'),'humanReviewed':bound and evidence.get('kind')!='machine'})
    # A selected voice is not automatically the whole selected hand. Additional
    # voices require an explicit source-hand assignment; never omit a hard voice
    # to make the remaining line satisfy an easier profile.
    pid=index.a['lines'][lids[0]]['partId']
    unselected=source_lines-set(lids)
    hand_map=claims.get('sourceLineHands',{})
    if not unselected:
        record('source-hand-completeness','pass',event_ids)
    elif not isinstance(hand_map,dict) or any(hand_map.get(l) not in ('left','right') for l in source_lines):
        record('source-hand-completeness','review',event_ids,{'unselectedLines':sorted(unselected)})
    else:
        omitted={l for l in unselected if hand_map[l] in set(hands.values())}
        test('source-hand-completeness',not omitted and all(hand_map.get(l)==h for l,h in hands.items()),
             [e['id'] for e in index.a['events'] if e['lineId'] in omitted and lo<=q(e['onset'])<hi],
             {'unselectedLines':sorted(unselected),'omittedSelectedHandLines':sorted(omitted)})
    for lid in lids:
        ctx=index.context(lid,lo); key=ctx.get('key',{}); meter=ctx.get('meter',{}); clef=ctx.get('clef',{})
        test('key-signature',key.get('fifths') in profile['fifths'],[e['id'] for e in by_line[lid]])
        mode=key.get('mode')
        mode=mode if mode else claims.get('tonality',{}).get(lid)
        record('major-tonality','pass' if mode=='major' else 'review' if mode is None else 'fail',event_ids,
               evidence.get('trace',{}).get('tonality',{}).get(lid) if bound and evidence.get('kind')=='machine' else None)
        test('meter',meter.get('ratio') in profile['meters'],event_ids)
        expected=('G',2,0) if hands[lid]=='right' else ('F',4,0)
        actual=tuple(clef.get(k) for k in ('sign','line','octaveChange'))
        record('clef-register','pass' if actual==expected else 'review',event_ids)
        # KeySignature.accidentalByStep handles written accidentals; chromatic
        # enharmonic equivalents cannot masquerade as diatonic steps.
        signature=m21.key.KeySignature(key.get('fifths',0) or 0)
        bad=[]
        for e in by_line[lid]:
            if e['kind']!='note':continue
            acc=signature.accidentalByStep(e['pitch']['step']);alter=acc.alter if acc else 0
            if e['pitch']['alter']!=alter:bad.append(e['id'])
        test('diatonic-spelling',not bad,bad or [e['id'] for e in by_line[lid] if e['kind']=='note'])
    intervals=[i for f in features.values() for i in f['intervals']]
    bad=[i for i in intervals if abs(i['diatonic'])>profile['maxInterval'] or
         i['name'].replace('-','') not in ALLOWED.get(abs(i['diatonic']),set())]
    test('spelled-interval-limit',not bad,[x for i in bad for x in (i['from'],i['to'])],intervals)
    # Unsupported articulations need an explicit profile, not silent deletion.
    unsupported=[]
    for e in events:
        n=index.notes[e['id']]
        if e['notation']['timeModification'] or any(a!='Fingering' for a in e['articulations']) or n.find('./notations/fermata') is not None:
            unsupported.append(e['id'])
    record('notation-scope','review' if unsupported else 'pass',unsupported)
    rhythm_results={}
    melody=next((l for l in lids if hands[l]==profile.get('melodyHand')),None) if profile['lines']==2 else lids[0]
    for lid in lids:
        families=profile['rhythms'] if lid==melody else profile.get('accompanimentRhythms',profile['rhythms'])
        rr=[rhythm_check(index,lid,start,end,r,(lo,hi)) for r in families]
        rhythm_results[lid]=rr
        test('rhythm:'+lid,any(r['passed'] for r in rr),[e['id'] for e in by_line[lid]],rr)
    focus=profile['focus']; sizes={abs(i['diatonic']) for i in intervals}
    wanted=profile.get('focusIntervals',[])
    focused=[i for i in intervals if abs(i['diatonic']) in wanted and
             (not profile.get('direction') or (i['semitones']>0)==(profile['direction']=='up'))]
    focus_ids=[x for i in focused for x in (i['from'],i['to'])]
    if focus in ('steps','thirds','melodic','arpeggio','leap'):
        test('interval-focus',bool(focused) and (focus!='thirds' or 2 in sizes),focus_ids)
    if focus=='steps' and profile.get('changeDirection'):
        test('direction-change',any(i['semitones']>0 for i in intervals) and any(i['semitones']<0 for i in intervals),focus_ids)
    if focus in ('melodic','arpeggio'):
        groups=claims.get('musicalGroups',[]); validated=[]
        attacks=[e['id'] for e in features[lids[0]]['attacks']]
        for group in groups:
            gg=group.get('eventIds',[])
            if not gg or not group.get('reference') or not group.get('reason'): continue
            if any(n not in attacks for n in gg):continue
            pos=[attacks.index(n) for n in gg]
            if pos!=list(range(pos[0],pos[0]+len(pos))):continue
            if not any(i['from'] in gg and i['to'] in gg for i in focused):continue
            if group.get('kind')!=focus:continue
            if focus=='arpeggio':
                ch=m21.chord.Chord([upstream_pitch(pitch_name(index.events[n]['pitch'])) for n in gg])
                if not (ch.isMajorTriad() or ch.isMinorTriad()):continue
            validated.extend(gg)
        record('musical-group-context','pass' if validated else 'review',validated or focus_ids)
    if focus=='leap':
        unrelated=[i for i in intervals if abs(i['diatonic'])>5 and abs(i['diatonic']) not in wanted]
        test('single-leap-family',not unrelated,[x for i in unrelated for x in (i['from'],i['to'])])
        attack_ids=[e['id'] for e in features[lids[0]]['attacks']]
        follows=[i for i in focused if attack_ids.index(i['to'])+1<len(attack_ids) and
                 any(j['from']==i['to'] and abs(j['diatonic'])<=3 for j in intervals)]
        test('familiar-pattern-after-leap',bool(follows),focus_ids)
    if focus=='position':
        test('familiar-motion-focus',any(2<=abs(i['diatonic'])<=5 for i in intervals),
             [x for i in intervals if 2<=abs(i['diatonic'])<=5 for x in (i['from'],i['to'])])
    if profile['lines']==2 and len(lids)==2 and len(set(hands.values()))==2:
        accompaniment=next(l for l in lids if l!=melody)
        bass=features[accompaniment]['attacks']; mel=features[melody]['attacks']
        test('two-hand-entry',bool(bass and mel) and q(bass[0]['onset'])==lo==q(mel[0]['onset']),[e['id'] for e in bass[:1]+mel[:1]])
        counts=defaultdict(int)
        for e in bass:counts[e['measureIndex']]+=1
        test('sparse-accompaniment',bool(bass) and max(counts.values())<=1 and all(q(e['duration'])>=2 for e in bass),[e['id'] for e in bass])
        test('melody-motion',any(abs(i['diatonic'])>=2 for i in features[melody]['intervals']),[e['id'] for e in mel])
        left=[e for e in notes if hands[e['lineId']]=='left'];right=[e for e in notes if hands[e['lineId']]=='right']
        conflicts=[]
        for a in left:
            for b in right:
                if q(a['onset'])<q(b['onset'])+q(b['duration']) and q(b['onset'])<q(a['onset'])+q(a['duration']) and a['pitch']['midi']>=b['pitch']['midi']:
                    conflicts.extend((a['id'],b['id']))
        test('crossing-or-shared-held-key',not conflicts,conflicts)
    # Human review or reproducibly checked upstream-model evidence. Model
    # suggestions are distinguished in the result; no ergonomic claim is made.
    path=claims.get('handPath',{})
    complete=isinstance(path,dict) and bool(path) and all(isinstance(path.get(e['id']),dict) for e in notes)
    record('hand-path-evidence','pass' if complete else 'review',[e['id'] for e in notes])
    transitions=[]
    if complete:
        invalid=[];mapping={};conflicts=[];complex_fingering=[]
        definitions=claims.get('positions',{})
        if not isinstance(definitions,dict):definitions={}
        missing_positions=[];invalid_positions=[];anchors={}
        for e in notes:
            row=path[e['id']]; finger=row.get('finger');position=row.get('position')
            if type(finger)!=int or not 1<=finger<=5 or not isinstance(position,str) or not position or row.get('hand')!=hands[e['lineId']]:
                invalid.append(e['id']);continue
            mk=(row['hand'],position,finger);pitch=pitch_name(e['pitch'])
            if mk in mapping and mapping[mk]!=pitch: conflicts.append(e['id'])
            mapping[mk]=pitch
            definition=definitions.get(row['hand']+':'+position,{})
            if not isinstance(definition,dict):definition={}
            keys=definition.get('keys',[])
            if not definition.get('reference') or not keys:
                missing_positions.append(e['id'])
            else:
                assigned=[k for k in keys if k.get('finger')==finger]
                anchor=[k for k in keys if k.get('finger')==definition.get('anchorFinger')]
                if len(assigned)!=1 or tuple(assigned[0].get('pitch',[]))!=pitch or len(anchor)!=1:
                    invalid_positions.append(e['id'])
                else:
                    anchors[(row['hand'],position)]=(definition['anchorFinger'],tuple(anchor[0]['pitch']))
            written_fingers=index.notes[e['id']].findall('./notations/technical/fingering')
            if len(written_fingers)>1 or any((n.text or '').strip() not in ('1','2','3','4','5') or
                    n.get('substitution')=='yes' or n.get('alternate')=='yes' for n in written_fingers):
                complex_fingering.append(e['id'])
            elif written_fingers and (written_fingers[0].text or '').strip()!=str(finger):
                conflicts.append(e['id'])
            if e.get('tieFrom') and e['tieFrom'] in path and path[e['tieFrom']].get('finger')!=finger:
                invalid.append(e['id'])
        test('hand-path-values',not invalid,invalid)
        test('source-fingering-and-position',not conflicts,conflicts)
        record('source-fingering-notation','review' if complex_fingering else 'pass',complex_fingering)
        record('position-definitions','review' if missing_positions else 'pass',[*missing_positions])
        test('position-mapping',not invalid_positions,invalid_positions)
        for lid in lids:
            seq=features[lid]['attacks'];positions={path[e['id']].get('position') for e in seq}
            if profile['movement'] in ('home','fixed','new-position','register'):
                test('fixed-hand-position',len(positions)==1,[e['id'] for e in seq])
            for a,b in zip(seq,seq[1:]):
                if path[a['id']].get('position')!=path[b['id']].get('position'):
                    transitions.append((a,b))
        if profile['movement']=='shift':
            proved=[];unclear=[]
            for a,b in transitions:
                aa=anchors.get((hands[a['lineId']],path[a['id']]['position']))
                bb=anchors.get((hands[b['lineId']],path[b['id']]['position']))
                if aa and bb and aa[0]==bb[0] and aa[1]!=bb[1]:proved.extend((a['id'],b['id']))
                elif aa!=bb or aa is None:unclear.extend((a['id'],b['id']))
            record('actual-position-shift','pass' if proved else 'review' if unclear else 'fail',proved or unclear)
    home_out=[]
    for e in notes:
        octave=4 if hands[e['lineId']]=='right' else 3
        if pitch_name(e['pitch']) not in {(s,0,octave) for s in 'CDEFG'}:home_out.append(e['id'])
    if profile['movement']=='home':test('home-register',not home_out,home_out)
    if profile['movement'] in ('new-position','register'):test('new-position-focus',bool(home_out),home_out)
    if profile['movement']=='register':
        proof=claims.get('register',{})
        record('register-reading-evidence','pass' if proof.get('reference') and set(home_out)<=set(proof.get('eventIds',[])) and proof.get('notationReason') else 'review',home_out)
    bpm=claims.get('bpm',{})
    if not isinstance(bpm,dict):bpm={}
    bpm_ok=(type(bpm.get('min')) in (int,float) and type(bpm.get('max')) in (int,float) and
            math.isfinite(bpm['min']) and math.isfinite(bpm['max']) and 0<bpm['min']<=bpm['max'] and
            bpm.get('beatQuarter')==profile['beatQuarter'] and bool(bpm.get('reference')))
    bpm_rule='modeled-bpm-scope' if bound and evidence.get('kind')=='machine' else 'reviewed-bpm-scope'
    record(bpm_rule,'pass' if bpm_ok else 'review',event_ids,bpm if bpm_ok else None)
    if focus=='leap':
        transitions.extend((index.events[i['from']],index.events[i['to']]) for i in focused if (index.events[i['from']],index.events[i['to']]) not in transitions)
    for a,b in transitions:
        tail=a
        while tail.get('tieTo'):tail=index.events[tail['tieTo']]
        end_a=q(tail['onset'])+q(tail['duration']); free=q(b['onset'])-end_a
        held=[e['id'] for e in notes if hands[e['lineId']]==hands[b['lineId']] and q(e['onset'])<q(b['onset'])<q(e['onset'])+q(e['duration'])]
        move=next((r for r in claims.get('movements',[]) if r.get('from')==a['id'] and r.get('to')==b['id']),{})
        ok=(bpm_ok and not held and move.get('reference') and move.get('technique') and
            move.get('freeQuarter')==rational(free) and move.get('bpm')==bpm and
            (free>0 or move.get('resolvedLegato') is True))
        record('movement-release-window','pass' if ok else 'review',[a['id'],b['id'],*held],
               {'freeQuarter':rational(free),'heldEventIds':held,'witness':move})
    failures=[r['rule'] for r in checks if r['status']=='fail'];pending=[r['rule'] for r in checks if r['status']=='review']
    status='fail' if failures else 'review' if pending else 'pass'
    return {'rulesVersion':VERSION,'configSha256':digest(encoded(config).encode()),'profileId':profile['id'],
        'grade':profile['grade'],'status':status,'passed':status=='pass','failureRules':failures,'reviewRules':pending,
        'selectionSha256':selection_digest(selection),'contextSha256':context_digest(index,selection),
        'sourceEventIds':event_ids,'checks':checks,'rhythms':rhythm_results,
        'bpm':bpm if bpm_ok else None,'evidenceKind':evidence.get('kind','human') if bound else 'unverified',
        'admission':'K3/K4 boundary, source projection and native verification still required'}


def assess_all(index,selection,evidence_by_profile=None,config=None):
    config=config or load_config(); evidence_by_profile=evidence_by_profile or {}
    return [assess_profile(index,selection,p,evidence_by_profile.get(p['id']),config) for p in config['profiles']]
