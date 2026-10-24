import { EngineBridge, type NativeApi } from '../../../../packages/engine-bridge';
import { loadEngineAssets } from './engine-assets';

export interface NativeEngineCallbacks {
  onWebCommand(command: string): void;
  onRevisionChanged(revision: number): void;
  onExit(data: { text?: string }): void;
  onProjectSaved(bytes: Uint8Array): void;
  onMxlExported(bytes: Uint8Array): void;
  onXmlExported(bytes: Uint8Array): void;
  onPdfExported(bytes: Uint8Array): void;
}

export interface NativeEngineConfig extends NativeEngineCallbacks {
  deferAudio: boolean;
  screen: HTMLElement;
  wasmBinary: Uint8Array;
  onDocumentState(title: string, modified: boolean): void;
}

export interface EngineHostOptions {
  callbacks: NativeEngineCallbacks;
  currentRevision(): number;
  onReady(bridge: EngineBridge, started: number): void;
  onAudioError(): void;
  focus(element?: Element): void;
}

export interface EngineHostRuntime {
  loadAssets(): Promise<Uint8Array>;
  createApi(config: NativeEngineConfig): Promise<NativeApi>;
  document(): Document;
  now(): number;
  exposeDiagnostics(api: NativeApi): void;
}

const browserRuntime: EngineHostRuntime = {
  loadAssets: loadEngineAssets,
  async createApi(config) {
    const url = new URL('distr/muapi.js', location.href).href;
    // This describes the existing native glue contract; it is not runtime
    // validation of arbitrary JS or of every field on NativeApi.Module.
    const createMuApi: (config: NativeEngineConfig) => Promise<NativeApi> = (
      await import(/* @vite-ignore */ url)
    ).default;
    return createMuApi(config);
  },
  document: () => document,
  now: () => performance.now(),
  exposeDiagnostics(api) {
    if (new URLSearchParams(location.search).has('diagnostics'))
      Object.assign(window, { pianist: api });
  },
};

/** Owns native boot/readiness and Qt focus bindings, never document/session policy. */
export class EngineHost {
  private loading?: Promise<EngineBridge>;

  constructor(private readonly runtime: EngineHostRuntime = browserRuntime) {}

  ensure(options: EngineHostOptions): Promise<EngineBridge> {
    if (this.loading) return this.loading;
    this.loading = this.start(options).catch((error) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  focus(element: Element | undefined, allowed: boolean): void {
    if (!allowed) return;
    const doc = this.runtime.document();
    if (doc.querySelector('dialog[open]')) return;
    const root = doc.querySelector('#screen #qt-shadow-container')?.shadowRoot;
    const win = element ?? root?.querySelector('.qt-decorated-window:not(.inactive) .qt-window');
    if (win && !win.contains(root?.activeElement ?? null))
      win.querySelector<HTMLElement>('.qt-window-focus-helper')?.focus({ preventScroll: true });
  }

  private async start(options: EngineHostOptions): Promise<EngineBridge> {
    const started = this.runtime.now();
    const wasmBinary = await this.runtime.loadAssets();
    const doc = this.runtime.document();
    const screen = doc.getElementById('screen');
    if (!screen) throw Error('Không tìm thấy vùng hiển thị MuseScore.');
    const api = await this.runtime.createApi({
      ...options.callbacks,
      screen,
      wasmBinary,
      deferAudio: true,
      onDocumentState: (title, modified) => {
        doc.title = `${title}${modified ? ' *' : ''} — Pianist`;
        const currentScreen = doc.getElementById('screen');
        if (currentScreen) currentScreen.dataset.modified = String(modified);
      },
    });
    this.runtime.exposeDiagnostics(api);
    const bridge = new EngineBridge(api);
    bridge.revision = options.currentRevision();
    const pointer = (event: PointerEvent) => {
      void api.Module.driver?.resume().catch(() => {});
      options.focus(
        event
          .composedPath()
          .find(
            (node): node is Element =>
              node instanceof Element && node.classList.contains('qt-window'),
          ),
      );
    };
    screen.addEventListener('pointerdown', pointer, true);
    try {
      options.onReady(bridge, started);
    } catch (error) {
      screen.removeEventListener('pointerdown', pointer, true);
      throw error;
    }
    return bridge;
  }
}
