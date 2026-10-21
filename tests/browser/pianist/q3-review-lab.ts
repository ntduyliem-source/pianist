// Local content-review sheets only; never part of the application bundle.
import {EngineBridge, type NativeApi} from '../../../packages/engine-bridge';
import {createTimeline, settingsFor} from '../../../packages/practice-engine-v2/score-adapter';

(window as any).q3Review = (input: {bytes: number[]; name: string}) => {
  const bridge = new EngineBridge((window as any).pianist as NativeApi);
  bridge.revision = bridge.semantics().revision;
  const snapshot = {...bridge.preparedSnapshot(new Uint8Array(input.bytes), input.name),
    projectId: 'q3-review:' + input.name, fingerprint: input.name};
  const timeline = createTimeline(snapshot, {...settingsFor(snapshot), bpm: 60, countIn: 0});
  const glyphs = new Set(snapshot.pages.flatMap(page => [...new DOMParser().parseFromString(page.svg, 'image/svg+xml')
    .querySelectorAll('[data-practice-notes]')].flatMap(e => e.getAttribute('data-practice-notes')!.split(/\s+/))));
  const missing = snapshot.anchors.filter(a => a.visible && !glyphs.has(a.id.replace(/^m\d+-/, '')));
  if (missing.length) throw Error('Missing rendered note glyphs: ' + missing.map(a => a.id));
  const pages = snapshot.pages.map(p => ({...p, previewHeight: Math.min(p.height,
    Math.max(0, ...snapshot.measures.filter(m => m.page === p.index).map(m => m.box.y + m.box.height - p.offsetY)) + p.width * .08)}));
  return {pages, anchors: snapshot.anchors,
    counts: {targets: timeline.targets.length, onsets: timeline.groups.length}, glyphs: glyphs.size};
};
