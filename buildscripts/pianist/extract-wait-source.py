"""Use Piano Trainer Studio's Wait functions unchanged; replace only host I/O."""
import importlib.util
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('extract', Path(__file__).with_name('extract-reference-methods.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
vendor = ROOT / 'third_party/practice-sources/piano-trainer-studio'
specs = [('js/feedback-engine.js', 'function findExpectedMatchForMidi(midi)'),
         ('js/trainer-core.js', 'function findSatisfiedOrSustainedMatchForMidi(midi)'),
         ('js/trainer-core.js', "function triggerVirtualKey(midi, isPressed, source = 'midi', velocity = 100)"),
         ('js/trainer-core.js', 'function checkWaitModeAdvance()')]
functions, provenance = [], []
for path, signature in specs:
    function = module.method((vendor / path).read_text(encoding='utf8'), signature)
    functions.append(function)
    provenance.append({'source': path, 'signature': signature, 'sha256': hashlib.sha256(function.encode()).hexdigest()})
prefix = '''// GENERATED: original functions from Piano Trainer Studio b40e412ccbc701094a9bb4bfe91ef45c32065704.
// AGPL-3.0. See third_party/practice-sources/piano-trainer-studio/LICENSE.
// Host adaptation: Wait only, no audio/DOM/LED; timer callbacks flush after each
// input. This changes presentation scheduling, not the upstream hit/advance rules.
export function createStudioWait() {
  const AppState = {isPlaying:true, mode:'wait', isAudioBusy:true, expectedNotes:[],
    pendingAudio:[], followAdvanceInfo:null, practice:{left:true,right:true}, score:{correct:0,wrong:0},
    pressedKeys:new Set(), heldCorrectNotes:new Map(), preExpectedHeldNotes:new Set(), earlyGraceReservations:new Map(),
    sustainedVisuals:[], visualNotesToStart:[], ledCalibrationMode:false, debugMatchLogs:false};
  let advanced = false;
  const jobs=[];
  const setTimeout=(callback)=>{jobs.push(callback);};
  const osmd={cursor:{update(){}}};
  const getCursorSvgX=()=>null;
  const debugLogEvent=()=>{};
  const getLiveMonitoringVelocity=(_source, value)=>value;
  const shouldRouteLiveSourceToLocalAudio=()=>false;
  const shouldRouteLiveSourceToMidiOut=()=>false;
  const renderVirtualKeyboard=()=>{};
  const selectLedCalibrationMidi=()=>{};
  const tryReserveSingleHandEarlyGrace=()=>null; // upstream mode guard: wait is excluded
  const tryReserveRealtimeUpcomingHeldNote=()=>null; // upstream mode guard: wait is excluded
  const drawFeedbackNote=()=>{};
  const updateScoreDisplay=()=>{};
  const registerHeldIncorrectFeedback=()=>{};
  const releaseHeldIncorrectFeedback=()=>{};
  const schedulePlaybackForDestinations=()=>{};
  const startVisualSustains=()=>{};
  const handleAutoScroll=()=>{};
  const playbackLoop=()=>{advanced=true;};
'''
suffix = '''
  return {
    setTargets(notes) {
      AppState.expectedNotes=notes.map(n=>({...n,hit:false}));
      AppState.isAudioBusy=true; advanced=false;
    },
    input(midi, pressed) {
      const before=new Set(AppState.expectedNotes.filter(n=>n.hit).map(n=>n.id));
      const wrongBefore=AppState.score.wrong;
      triggerVirtualKey(midi,pressed);
      const ids=AppState.expectedNotes.filter(n=>n.hit&&!before.has(n.id)).map(n=>n.id);
      while(jobs.length)jobs.shift()();
      return {ids, wrong:AppState.score.wrong>wrongBefore, advanced};
    },
    resetKeys() {
      for(const pitch of [...AppState.pressedKeys])triggerVirtualKey(pitch,false);
    },
    get scores(){return {...AppState.score};}
  };
}
'''
dest = ROOT / 'packages/practice-engine-v2/upstream/studio-wait.js'
dest.write_text(prefix + '\n\n'.join(functions) + suffix, encoding='utf8')
(dest.parent / 'studio-extractions.json').write_text(json.dumps(provenance, indent=2)+'\n', encoding='utf8')
print('Copied 4 unchanged Piano Trainer Studio functions into the Wait host.')
