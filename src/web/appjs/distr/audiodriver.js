import {NativePlaybackClock} from './native-playback-clock.js';

async function URLFromFiles(files) {
    const promises = files.map(file =>
        fetch(file).then(response => response.text())
    );

    const texts = await Promise.all(promises);
    const text = texts.join("");
    const blob = new Blob([text], { type: "application/javascript" });
    return URL.createObjectURL(blob);
}

let AudioDriver = (function () {

    let audioContext = null;
    let processor = null;
    const playbackClock = new NativePlaybackClock();
    let previewRequest = 0, previewOrder = 0;
    const previewWaiters = new Map();

    var api = {

        inited: false, 
        onInited: null,
        
        setup: async function(config, rpcPort, audio_context) {

            if (audio_context) {
                audioContext = audio_context
            } else {
                audioContext = new AudioContext()
            }

            try {

                const code = await URLFromFiles([
                    './MuseAudio.js',
                    './distr/audio_worklet_processor.js'
                ]);

                await audioContext.audioWorklet.addModule(code)
                processor = new AudioWorkletNode(audioContext, 'musedriver-processor', {
                                numberOfInputs: 0,
                                numberOfOutputs: 1,
                                outputChannelCount: [2],
                                });
                console.log("[processor-main] create AudioWorkletNode for audio_worklet_processor")

            } catch (error) {
                console.error(error)
            }

            // driver (processor) -> main
            processor.port.onmessage = function(event) {
                if (event.data.type === 'PREVIEW_READY') {
                    previewWaiters.get(event.data.request)?.();
                    return;
                }
                if (event.data.type === 'PLAYBACK_FRAMES') {
                    playbackClock.receive(event.data);
                    return;
                }
                console.log("[processor]", event.data)

                if (event.data.type == "DRIVER_INITED") {
                    api.inited = true;
                    if (api.onInited) {
                        api.onInited();
                    }
                }
            }

            processor.port.postMessage({
                type: 'INITIALIZE_DRIVER',
                config: config,
                rpcPort: rpcPort,
                options: {}
            }, [rpcPort]); 
        },

        outputSpec: function() {
            return {
                sampleRate: audioContext.sampleRate,
                samplesPerChannel: Math.max(Math.round(audioContext.baseLatency * audioContext.sampleRate), 128),
                audioChannelCount: audioContext.destination.channelCount
            }
        },

        open: function() {
            console.log("[driver]", "open")
            processor.connect(audioContext.destination)
            audioContext.resume()
        },

        resume: function() {
            console.log("[driver]", "resume")
            return audioContext.resume()
        },

        observePlayback: binding => playbackClock.observe(binding),
        playbackFrame: epoch => playbackClock.read(audioContext, epoch),

        preparePreview: function(signal) {
            signal?.throwIfAborted();
            const request = ++previewRequest;
            return new Promise((resolve, reject) => {
                const cleanup = () => { clearTimeout(timeout); previewWaiters.delete(request); signal?.removeEventListener('abort', cancel); };
                const cancel = () => { cleanup(); api.stopPreview(); reject(new DOMException('Đã hủy chuẩn bị piano.', 'AbortError')); };
                const timeout = setTimeout(() => { cleanup(); api.stopPreview(); reject(Error('Chưa tải được tiếng piano MuseScore. Hãy thử lại.')); }, 30000);
                previewWaiters.set(request, () => { cleanup(); resolve(); });
                signal?.addEventListener('abort', cancel, {once:true});
                processor.port.postMessage({type:'PREVIEW_PREPARE',request});
            });
        },

        previewMidi: function(status, data1, data2, performanceMs = performance.now()) {
            const stamp = audioContext.getOutputTimestamp?.();
            const mapping = stamp?.contextTime && stamp.performanceTime
                ? stamp.contextTime - stamp.performanceTime / 1000
                : audioContext.currentTime - performance.now() / 1000 - (audioContext.baseLatency || 0) - (audioContext.outputLatency || 0);
            processor.port.postMessage({type:'PREVIEW_MIDI',status,data1,data2,
                when:Math.max(audioContext.currentTime,performanceMs / 1000 + mapping),order:++previewOrder});
        },

        stopPreview: function() { processor?.port.postMessage({type:'PREVIEW_STOP'}); },

        suspend: function() {
            console.log("[driver]", "suspend")
            audioContext.suspend();
        },

        close: function() {
            console.log("[driver]", "close")
            processor.disconnect()
        }
    }

    return api;

})();

export default AudioDriver;
