export interface AudioReadyModule {
  onAudioReady?: (ready:boolean)=>void;
  audioReadyPromise?: Promise<void>;
  ccall(name:string,returns:null,types:unknown[],args:unknown[]):unknown;
}
export function waitForAudioReady(module:AudioReadyModule,options?:{timeoutMs?:number;pollMs?:number}):Promise<void>;
