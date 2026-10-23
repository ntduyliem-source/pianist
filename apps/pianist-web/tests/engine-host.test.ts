import test from 'node:test';
import assert from 'node:assert/strict';
import type { NativeApi } from '../../../packages/engine-bridge';
import {
  EngineHost,
  type EngineHostOptions,
  type EngineHostRuntime,
  type NativeEngineConfig,
} from '../src/platform/engine-host';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

// The fake only replaces browser/native I/O; EngineHost owns all startup sequencing.
class Screen extends EventTarget {
  dataset: Record<string, string> = {};
  classList = { contains: (name: string) => name === 'qt-window' };
  pointerBindings = 0;
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === 'pointerdown') this.pointerBindings++;
    super.addEventListener(type, callback, options);
  }
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (type === 'pointerdown') this.pointerBindings--;
    super.removeEventListener(type, callback, options);
  }
}
function makeApi(
  startAudioProcessing: () => Promise<void>,
  resume: () => void = () => {},
): NativeApi {
  return {
    Module: { driver: { resume } },
    startAudioProcessing,
    loadScoreData: () => true,
    saveProject: () => 1,
    serializeProject: () => 1,
    exportScore: () => 1,
    dispatchAction: () => 1,
    prepareProject: () => 1,
    getScoreSemantics: () => 1,
    getPracticeSnapshot: () => 1,
    setPracticeActive: () => 1,
    midiInput: () => 1,
  };
}
function options(overrides: Partial<EngineHostOptions> = {}): EngineHostOptions {
  return {
    callbacks: {
      onWebCommand() {},
      onRevisionChanged() {},
      onExit() {},
      onProjectSaved() {},
      onMxlExported() {},
      onXmlExported() {},
      onPdfExported() {},
    },
    currentRevision: () => 0,
    onReady() {},
    onAudioError() {},
    focus() {},
    ...overrides,
  };
}

test('engine host shares startup, preserves callbacks and waits for MS Basic before publishing a bridge', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Element');
  Object.defineProperty(globalThis, 'Element', { value: Screen, configurable: true });
  t.after(() =>
    descriptor
      ? Object.defineProperty(globalThis, 'Element', descriptor)
      : Reflect.deleteProperty(globalThis, 'Element'),
  );
  const assets = deferred<Uint8Array>(),
    audio = deferred<void>(),
    screen = new Screen();
  const doc = { title: '', getElementById: () => screen };
  let loads = 0,
    creates = 0,
    starts = 0,
    exposed = 0,
    ready = 0,
    resumes = 0,
    revision = 7;
  let config: NativeEngineConfig | undefined, focused: Element | undefined;
  const saved: Uint8Array[] = [];
  const api = makeApi(
    () => {
      starts++;
      return audio.promise;
    },
    () => resumes++,
  );
  const runtime: EngineHostRuntime = {
    loadAssets: () => {
      loads++;
      return assets.promise;
    },
    createApi: async (value) => {
      creates++;
      config = value;
      return api;
    },
    document: () => doc as unknown as Document,
    now: () => 123,
    exposeDiagnostics: (value) => {
      assert.equal(value, api);
      exposed++;
    },
  };
  const settings = options({
    currentRevision: () => revision,
    onReady: (bridge, started) => {
      ready++;
      assert.equal(started, 123);
      assert.equal(bridge.revision, 42);
    },
    focus: (element) => {
      focused = element;
    },
  });
  settings.callbacks.onRevisionChanged = (value) => {
    revision = value;
  };
  settings.callbacks.onProjectSaved = (bytes) => saved.push(bytes);
  const host = new EngineHost(runtime),
    first = host.ensure(settings),
    concurrent = host.ensure(settings);
  assert.equal(first, concurrent);
  assert.equal(loads, 1);
  assert.equal(creates, 0);
  const wasm = new Uint8Array([0, 97, 115, 109]);
  assets.resolve(wasm);
  await turn();
  assert(config);
  assert.equal(config.wasmBinary, wasm);
  assert.equal(config.screen, screen);
  for (const key of Object.keys(settings.callbacks) as (keyof EngineHostOptions['callbacks'])[])
    assert.equal(config[key], settings.callbacks[key]);
  assert.equal(creates, 1);
  assert.equal(starts, 1);
  assert.equal(exposed, 1);
  assert.equal(ready, 0);
  assert.equal(screen.pointerBindings, 0);
  config.onDocumentState('Bản nhạc', true);
  assert.equal(doc.title, 'Bản nhạc * — Pianist');
  assert.equal(screen.dataset.modified, 'true');
  config.onRevisionChanged(42);
  const bytes = new Uint8Array([1, 2]);
  config.onProjectSaved(bytes);
  assert.equal(saved[0], bytes);
  audio.resolve();
  const bridge = await first;
  assert.equal(ready, 1);
  assert.equal(bridge.api, api);
  assert.equal(screen.pointerBindings, 1);
  screen.dispatchEvent(new Event('pointerdown'));
  assert.equal(resumes, 1);
  assert.equal(focused, screen);
  assert.equal(await host.ensure(settings), bridge);
  assert.equal(creates, 1);
  assert.equal(screen.pointerBindings, 1);
});

test('failed native startup is retryable without a ready bridge or duplicate focus bindings', async () => {
  const screen = new Screen();
  let loadAttempt = 0,
    audioAttempt = 0,
    ready = 0,
    audioErrors = 0;
  const host = new EngineHost({
    loadAssets: async () => {
      if (++loadAttempt === 1) throw Error('asset hash');
      return new Uint8Array(4);
    },
    createApi: async () =>
      makeApi(async () => {
        if (++audioAttempt === 1) throw Error('MS Basic');
      }),
    document: () => ({ getElementById: () => screen }) as unknown as Document,
    now: () => 0,
    exposeDiagnostics() {},
  });
  const settings = options({
    onAudioError: () => audioErrors++,
    onReady: () => {
      ready++;
    },
  });
  await assert.rejects(host.ensure(settings), /asset hash/);
  assert.equal(audioErrors, 0);
  assert.equal(ready, 0);
  assert.equal(screen.pointerBindings, 0);
  await assert.rejects(host.ensure(settings), /MS Basic/);
  assert.equal(audioErrors, 1);
  assert.equal(ready, 0);
  assert.equal(screen.pointerBindings, 0);
  await host.ensure(settings);
  assert.equal(ready, 1);
  assert.equal(screen.pointerBindings, 1);
  assert.equal(loadAttempt, 3);
});

test('Qt focus remains gated by editor/modal state and does not steal focus already inside its window', () => {
  let modal = false,
    queries = 0;
  const focusCalls: FocusOptions[] = [];
  const helper = { focus: (config: FocusOptions) => focusCalls.push(config) };
  const win = { contains: (element: unknown) => element === helper, querySelector: () => helper };
  const shadow = { activeElement: undefined as unknown, querySelector: () => win };
  const host = new EngineHost({
    loadAssets: async () => new Uint8Array(),
    createApi: async () => makeApi(async () => {}),
    now: () => 0,
    exposeDiagnostics() {},
    document: () =>
      ({
        querySelector: (selector: string) => {
          queries++;
          return selector === 'dialog[open]' ? modal : { shadowRoot: shadow };
        },
      }) as unknown as Document,
  });
  host.focus(undefined, false);
  assert.equal(queries, 0);
  modal = true;
  host.focus(undefined, true);
  assert.equal(focusCalls.length, 0);
  modal = false;
  host.focus(undefined, true);
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
  shadow.activeElement = helper;
  host.focus(undefined, true);
  assert.equal(focusCalls.length, 1);
});
