// Wait for the real engine resource list, not just the AudioWorklet constructor.
export function waitForAudioReady(module, {timeoutMs = 120000, pollMs = 100} = {}) {
    if (module.audioReadyPromise) return module.audioReadyPromise;
    module.audioReadyPromise = new Promise((resolve, reject) => {
        const previous = module.onAudioReady;
        let poll;
        const finish = error => {
            clearTimeout(deadline); clearTimeout(poll);
            if (module.onAudioReady === receive) module.onAudioReady = previous;
            if (error) reject(error); else resolve();
        };
        const check = () => {try {module.ccall('checkAudioReady', null, [], []);} catch (e) {finish(e);}};
        const receive = ready => {if (ready) finish(); else poll = setTimeout(check, pollMs);};
        const deadline = setTimeout(() => finish(Error('Chưa tải được tiếng piano MS Basic. Kết nối mạng và tải lại trang để thử lại.')), timeoutMs);
        module.onAudioReady = receive;
        check();
    }).catch(error => {module.audioReadyPromise = undefined; throw error;});
    return module.audioReadyPromise;
}
