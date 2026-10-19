import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeEngine} from '../../../packages/practice-engine-v2/engine';
import {feedback,type Marker} from '../src/practice/feedback-v2';
import {noteSvgKey,sharedInk} from '../src/practice/note-ink';
import {timeline,midi} from './helpers/fixtures-v2';

function repeatedNotes(){
  const t=timeline([0,1000,2000]);
  t.visits=[{id:0,measure:0,occurrence:0,loop:0,startMs:0,endMs:3000}];
  t.targets.forEach((n,i)=>{n.endMs=n.atMs+900;n.spans=[{anchor:`written${i}`,visit:0,atMs:n.atMs,endMs:n.endMs}];});
  return t;
}
test('held ink survives a long note and never transfers to the next repeated pitch',()=>{
  const t=repeatedNotes(),e=new PracticeEngine(t),first=midi(1,'on',0);
  e.input(first);e.clock(900);
  let f=feedback(t,e.view(),700,[first]);
  assert.equal(f.markers.get('written0')?.kind,'hit');assert.equal(f.markers.get('written0')?.held,true);
  assert.notEqual(f.markers.get('written1')?.held,true,'holding C must not light the next written C');
  e.input(midi(2,'off',900));const second=midi(3,'on',1000);e.input(second);e.clock(1800);
  f=feedback(t,e.view(),1600,[second]);
  assert.equal(f.markers.get('written0')?.held,false);assert.equal(f.markers.get('written1')?.held,true);
  assert.notEqual(f.markers.get('written2')?.held,true);
  assert.equal(feedback(t,e.view(),1600,[]).markers.get('written1')?.held,false,'Note Off clears only the live hold, retaining the grade');
});
test('a held key cannot recolour an upstream Miss as a blue or correct note',()=>{
  const t=repeatedNotes();t.targets[0].atMs=500;t.groups[0].atMs=500;
  const e=new PracticeEngine(t),press=midi(1,'on',340);e.input(press);e.clock(800);
  const mark=feedback(t,e.view(),700,[press]).markers.get('written0');
  assert.equal(e.view().judgements[0].grade,'miss');assert.equal(mark?.kind,'miss');assert.equal(mark?.held,true);
});
test('Wait shows an extra-key warning without grading the target wrong, and clears it after correction',()=>{
  const t=repeatedNotes();t.settings.mode='wait';const e=new PracticeEngine(t);
  e.input(midi(1,'on',0,72));e.clock(200);
  assert.equal(feedback(t,e.view(),200,[]).markers.get('written0')?.kind,'wrong');assert.equal(e.view().judgements.length,0);
  e.input(midi(2,'on',300));e.clock(500);
  const f=feedback(t,e.view(),500,[]);assert.equal(f.markers.get('written0')?.kind,'hit');assert.equal(f.markers.get('written1')?.kind,'current');
});
test('loop gap retains the last pass; A clears old ink exactly when the next visit starts',()=>{
  const t=timeline([0,2000]);t.visits=[{id:0,measure:0,occurrence:0,loop:0,startMs:0,endMs:1000},{id:1,measure:0,occurrence:1,loop:1,startMs:2000,endMs:3000}];
  t.targets.forEach((n,i)=>{n.spans=[{anchor:'same-written-note',visit:i,atMs:n.atMs,endMs:n.endMs}];});
  const e=new PracticeEngine(t);e.input(midi(1,'on',0));e.input(midi(2,'off',100));e.clock(1600);
  assert.equal(feedback(t,e.view(),1500,[]).markers.get('same-written-note')?.kind,'hit');
  const next=feedback(t,e.view(),2000,[]).markers.get('same-written-note');assert.equal(next?.kind,'current');assert.notEqual(next?.held,true);
});
test('listen-only ink follows each native span duration, including simultaneous hands',()=>{
  const t=repeatedNotes();t.targets[0].spans[0].endMs=1800;const e=new PracticeEngine(t);
  let f=feedback(t,e.view(),1300,[],true);assert.equal(f.markers.get('written0')?.kind,'playback');assert.equal(f.markers.get('written1')?.kind,'playback');
  f=feedback(t,e.view(),1900,[],true);assert.equal(f.markers.size,0);assert.equal(e.view().judgements.length,0);
});
test('native note identity is exact; chord stems preserve mixed pitch feedback',()=>{
  assert.equal(noteSvgKey('m14-t18880-v5-n2'),'t18880-v5-n2');assert.equal(noteSvgKey('made-up-position'),undefined);
  const hit:Marker={kind:'hit',label:'Correct',symbol:'✓'},current:Marker={kind:'current',label:'Next',symbol:'•'};
  assert.equal(sharedInk([hit,hit])?.kind,'hit');assert.equal(sharedInk([hit,current])?.kind,'timing');
  assert.equal(sharedInk([hit,undefined])?.kind,'timing');assert.equal(sharedInk([hit,{...hit,kind:'miss'}])?.kind,'miss');
});
