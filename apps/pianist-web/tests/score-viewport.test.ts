import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSystems,scorePositions,followTarget,anchorBounds,beatPosition,type FollowGeometry} from '../src/practice/score-viewport';
import {scoreFixture,timeline} from './helpers/fixtures-v2';

function layout(){
  const s=scoreFixture();
  s.pages=[{index:0,width:1000,height:1500,displayWidth:800,offsetX:50,offsetY:20,svg:'<svg/>'},{index:1,width:1000,height:1500,displayWidth:800,offsetX:50,offsetY:20,svg:'<svg/>'}];
  s.measures=Array.from({length:6},(_,i)=>({...s.measures[0],index:i,label:i+1,page:i<4?0:1,box:{x:150+(i%2)*400,y:i<4?200+Math.floor(i/2)*500:200,width:400,height:220}}));
  s.anchors=Array.from({length:6},(_,i)=>({...s.anchors[0],id:'n'+i,measure:i,page:i<4?0:1,box:{...s.measures[i].box,x:s.measures[i].box.x+80,y:s.measures[i].box.y+70,width:20,height:20}}));
  s.cursorSegments=s.measures.map(m=>({measure:m.index,tick:0,endTick:1920,x:m.box.x+60,endX:m.box.x+m.box.width-10}));
  s.occurrences=[0,2,0].map((measure,index)=>({index,measure,startMs:index*1000,endMs:(index+1)*1000,utick:index*1920}));
  s.timeMap=s.occurrences.flatMap(o=>[{occurrence:o.index,tick:0,atMs:o.startMs},{occurrence:o.index,tick:1920,atMs:o.endMs}]);
  return s;
}
test('native systems guide the camera with both staves and never impose a staff-based image crop',()=>{
  const systems=scoreSystems(layout());assert.equal(systems.length,3);assert.deepEqual(systems.map(s=>s.measures),[[0,1],[2,3],[4,5]]);
  assert.equal(systems[0].box.height,220);assert.equal(systems[0].box.x,150);
  for(const s of systems)assert.equal('crop' in s,false);
});
const geometry:FollowGeometry={top:260,bottom:470,left:400,focusTop:280,focusBottom:450,scrollTop:100,scrollLeft:0,width:900,height:600,contentWidth:900,contentHeight:3000};
test('camera holds still in reading band, then places the complete grand staff ahead of the lower edge',()=>{
  assert.deepEqual(followTarget(geometry),{top:100,left:0});
  const g={...geometry,top:700,bottom:920,focusTop:760,focusBottom:900};const next=followTarget(g);
  assert.equal(next.top,556);assert(g.top-next.top>=16);assert(g.bottom-next.top<g.height-16);
  assert.deepEqual(followTarget({...g,scrollTop:next.top}),next);
});
test('camera clamps first/last systems, pans a zoomed page, and handles a viewport shorter than the system',()=>{
  assert.equal(followTarget({...geometry,top:0,bottom:220},true).top,0);
  assert.equal(followTarget({...geometry,top:2900,bottom:3100},true).top,2400);
  assert.equal(followTarget({...geometry,left:1200,contentWidth:1800}).left,900);
  const g={...geometry,height:300,top:600,bottom:1100,focusTop:710,focusBottom:900};const p=followTarget(g);
  assert(g.focusTop-p.top>=16);assert(g.focusBottom-p.top<=g.height-16);
});
test('BPM cursor follows performed time across rests, omitted notes, repeats and loops; Wait follows the engine group',()=>{
  const s=layout(),t=timeline([100,1100,2100]);
  t.visits=[{id:0,measure:0,occurrence:0,loop:0,startMs:0,endMs:1000},{id:1,measure:2,occurrence:1,loop:0,startMs:1000,endMs:2000},{id:2,measure:0,occurrence:2,loop:1,startMs:2000,endMs:3000}];
  t.targets.forEach((n,i)=>{n.spans=[{anchor:i===1?'n2':'n0',visit:i,atMs:n.atMs,endMs:n.endMs}];});
  const cursor=scorePositions(s,t);assert.equal(cursor(1200)!.measure,2);assert.equal(cursor(2100)!.loop,1);assert.equal(cursor(2100)!.measure,0);
  assert.equal(cursor(2400,0)!.measure,0);assert.equal(cursor(2400,1)!.measure,2);
  assert(cursor(1500)!.x>cursor(1200)!.x);assert(cursor(1999)!.x<s.measures[2].box.x+s.measures[2].box.width);
  assert.equal(cursor(-400)!.measure,0);
});
test('cursor uses native rest segments and freezes at the native tick during a fixed pause',()=>{
  const s=layout(),t=timeline();t.settings.tempoMode='score';t.visits=[{id:0,measure:0,occurrence:0,loop:0,startMs:0,endMs:2000}];
  s.occurrences=[{index:0,measure:0,startMs:0,endMs:2000,utick:0}];
  // The first ChordRest here is a rest; no notehead provides its X coordinate.
  s.cursorSegments=[{measure:0,tick:0,endTick:480,x:240,endX:320},{measure:0,tick:480,endTick:1920,x:320,endX:520}];
  s.timeMap=[{occurrence:0,tick:0,atMs:0},{occurrence:0,tick:480,atMs:500},{occurrence:0,tick:480,atMs:1500},{occurrence:0,tick:1920,atMs:2000}];
  const cursor=scorePositions(s,t);assert.equal(cursor(0)?.x,240);assert.equal(cursor(250)?.x,280);
  assert.equal(cursor(750)?.x,320);assert.equal(cursor(1250)?.x,320);assert.equal(cursor(1750)?.x,420);
  delete s.cursorSegments;assert.equal(scorePositions(s,t)(0),undefined);
});
test('camera uses the envelope of simultaneous hands; visual beats follow the native click schedule',()=>{
  const s=layout(),a={...s.anchors[0],box:{x:200,y:150,width:20,height:20}},b={...s.anchors[1],box:{x:200,y:350,width:20,height:20}};
  assert.deepEqual(anchorBounds([a,b],s.measures[0].box),{x:200,y:150,width:20,height:220});
  const t=timeline();t.tempos=[{atMs:0,bpm:80}];t.clicks=[0,750,1500,2250].map((atMs,i)=>({atMs,accent:i%2===0}));
  assert.deepEqual(beatPosition(t,1000),{beat:1,total:2,bpm:80});assert.equal(beatPosition(t,1500).beat,0);
});
