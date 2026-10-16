import MuImpl from "./muimpl.js"

const DEFAULT_SOUNDFONT = "sound/MS%20Basic.sf3"

const MuApi = {

    // Load score
    loadScoreFile: MuImpl.loadScoreFile.bind(MuImpl),
    loadScoreData: MuImpl.loadScoreData.bind(MuImpl),

    saveProject: () => MuImpl.Module.ccall('saveProject', 'number', [], []),
    serializeProject: () => MuImpl.Module.ccall('serializeProject', 'number', [], []),
    getPracticeSnapshot: () => MuImpl.Module.ccall('getPracticeSnapshot', 'number', [], []),
    setPracticeActive: active => MuImpl.Module.ccall('setPracticeActive', 'number', ['number'], [Number(active)]),
    midiInput: (status, data1, data2) => MuImpl.Module.ccall('webMidiInput', 'number', ['number', 'number', 'number'], [status, data1, data2]),
    exportScore: (format = 'mxl') => MuImpl.Module.ccall('exportScore', 'number', ['string'], [format]),
    dispatchAction: (action) => MuImpl.Module.ccall('dispatchAction', 'number', ['string'], [action]),

    // Start audio
    startAudioProcessing: MuImpl.startAudioProcessing.bind(MuImpl),
}

async function createMuApi(config) {

    if (!config.soundFont) {
        config.soundFont = new URL(DEFAULT_SOUNDFONT, window.location.href).toString();
    }

    MuApi.Module = await MuImpl.loadModule(config)

    MuApi.Module.onProjectSaved = function(data) {
        console.log("[js muapi internal] onProjectSaved len: ", data.length)
        if (config.onProjectSaved) {
            config.onProjectSaved(data)
        }
    }

    MuApi.Module.onMxlExported = data => config.onMxlExported?.(new Uint8Array(data));
    MuApi.Module.onXmlExported = data => config.onXmlExported?.(new Uint8Array(data));
    MuApi.Module.onPdfExported = data => config.onPdfExported?.(new Uint8Array(data));

    return MuApi
}

export default createMuApi;

