// GENERATED: original functions from Piano Trainer Studio b40e412ccbc701094a9bb4bfe91ef45c32065704.
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
function findExpectedMatchForMidi(midi) {
    const candidates = AppState.expectedNotes.filter(n => n.midi === midi && !n.hit);
    if (AppState.debugMatchLogs) {
        debugLogEvent('MATCH_CANDIDATES', {
            midi,
            count: candidates.length,
            candidates: candidates.map(n => ({
                midi: n.midi,
                staffId: n.staffId,
                mIdx: n.mIdx,
                hit: n.hit,
                anchor: n.anchor ? { x: n.anchor.x, y: n.anchor.y } : null
            }))
        });
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) {
        if (AppState.debugMatchLogs) {
            debugLogEvent('MATCH_CHOSEN', {
                midi,
                reason: 'single-candidate',
                chosen: {
                    staffId: candidates[0].staffId,
                    mIdx: candidates[0].mIdx,
                    anchor: candidates[0].anchor ? { x: candidates[0].anchor.x, y: candidates[0].anchor.y } : null
                }
            });
        }
        return candidates[0];
    }

    const cursorX = getCursorSvgX();
    if (cursorX == null) {
        if (AppState.debugMatchLogs) {
            debugLogEvent('MATCH_CHOSEN', {
                midi,
                reason: 'no-cursor-x',
                chosen: {
                    staffId: candidates[0].staffId,
                    mIdx: candidates[0].mIdx,
                    anchor: candidates[0].anchor ? { x: candidates[0].anchor.x, y: candidates[0].anchor.y } : null
                }
            });
        }
        return candidates[0];
    }

    const chosen = candidates
        .slice()
        .sort((a, b) => {
            const ax = a.anchor?.x ?? cursorX;
            const bx = b.anchor?.x ?? cursorX;
            return Math.abs(ax - cursorX) - Math.abs(bx - cursorX);
        })[0];

    if (AppState.debugMatchLogs) {
        debugLogEvent('MATCH_CHOSEN', {
            midi,
            reason: 'closest-to-cursor-x',
            cursorX,
            chosen: {
                staffId: chosen.staffId,
                mIdx: chosen.mIdx,
                anchor: chosen.anchor ? { x: chosen.anchor.x, y: chosen.anchor.y } : null
            }
        });
    }

    return chosen;
}

function findSatisfiedOrSustainedMatchForMidi(midi) {
    const alreadyHit = AppState.expectedNotes.find(n => n.midi === midi && n.hit);
    if (alreadyHit) {
        return { midi, staffId: alreadyHit.staffId, mIdx: alreadyHit.mIdx, source: 'already-hit' };
    }

    const sustained = AppState.sustainedVisuals.find(n => n.midi === midi)
        || AppState.visualNotesToStart.find(n => n.midi === midi);
    if (sustained) {
        return { midi, staffId: sustained.staffId, mIdx: sustained.mIdx ?? null, source: 'sustained-visual' };
    }

    return null;
}

function triggerVirtualKey(midi, isPressed, source = 'midi', velocity = 100) {
    if (isPressed) {
        AppState.pressedKeys.add(midi);
        
        const liveVelocity = (source === 'midi' && AppState.inputVelocityEnabled) ? velocity : 100;
        const localAudioVelocity = getLiveMonitoringVelocity(source, liveVelocity);

        if (shouldRouteLiveSourceToLocalAudio(source)) {
            playLocalPianoNote(midi, localAudioVelocity, null, {
                lowLatencyLive: source === 'ui' ? true : !!AppState.liveLowLatencyMonitoringEnabled,
                retrigger: true
            });
        }

        if (shouldRouteLiveSourceToMidiOut(source)) {
            sendMidiOutNoteOn(midi, normalizeLiveVelocity(liveVelocity).midi, { scaleVolume: source === 'ui' });
        }

        if (AppState.ledCalibrationMode) {
            selectLedCalibrationMidi(midi);
            renderVirtualKeyboard();
            return;
        }
        
        if (AppState.isPlaying) {
            const expectedMatch = findExpectedMatchForMidi(midi);
            const sustainMatch = !expectedMatch ? findSatisfiedOrSustainedMatchForMidi(midi) : null;
            const repeatCarryReservation = (!expectedMatch && sustainMatch?.source === 'already-hit')
                ? tryReserveSingleHandEarlyGrace(midi)
                : null;
            const realtimeUpcomingReservation = (!expectedMatch && !sustainMatch && !repeatCarryReservation)
                ? tryReserveRealtimeUpcomingHeldNote(midi)
                : null;
            const earlyGraceReservation = (!expectedMatch && !sustainMatch && !realtimeUpcomingReservation)
                ? tryReserveSingleHandEarlyGrace(midi)
                : (realtimeUpcomingReservation || repeatCarryReservation);
            const isCorrect = !!expectedMatch;
            const isAcceptedRepeat = !expectedMatch && !!sustainMatch;
            const isEarlyGraceReserved = !!earlyGraceReservation;
            const targetStaffId = expectedMatch ? expectedMatch.staffId : (sustainMatch ? sustainMatch.staffId : (earlyGraceReservation ? earlyGraceReservation.staffId : null));
            
            if (AppState.practice.left || AppState.practice.right) {
                const forceMIdx = expectedMatch ? expectedMatch.mIdx : null;
                const anchor = expectedMatch ? expectedMatch.anchor : null;

                debugLogEvent('KEY_PRESS_MATCH_RESULT', {
                    midi,
                    isCorrect,
                    isAcceptedRepeat,
                    isEarlyGraceReserved,
                    targetStaffId,
                    forceMIdx,
                    sustainMatch: sustainMatch ? {
                        midi: sustainMatch.midi,
                        staffId: sustainMatch.staffId,
                        mIdx: sustainMatch.mIdx,
                        source: sustainMatch.source
                    } : null,
                    anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
                    expectedMatch: expectedMatch ? {
                        midi: expectedMatch.midi,
                        staffId: expectedMatch.staffId,
                        mIdx: expectedMatch.mIdx,
                        hit: expectedMatch.hit
                    } : null
                });

                if (isCorrect) {
                    drawFeedbackNote(midi, true, targetStaffId, forceMIdx, anchor);
                    AppState.score.correct++;
                    AppState.heldCorrectNotes.set(midi, targetStaffId);
                    updateScoreDisplay();
                } else if (isAcceptedRepeat || isEarlyGraceReserved) {
                    AppState.heldCorrectNotes.set(midi, targetStaffId);
                } else {
                    if (AppState.mode === 'realtime') {
                        AppState.realtimeWrongPressInCurrentContext = true;
                    }
                    registerHeldIncorrectFeedback(midi, targetStaffId, forceMIdx, anchor);
                    AppState.score.wrong++;
                    updateScoreDisplay();
                }
            }

            if (isCorrect) {
                expectedMatch.hit = true;
                if (AppState.mode === 'wait' || AppState.mode === 'follow') {
                    checkWaitModeAdvance();
                }
            }
        }
    } else {
        AppState.pressedKeys.delete(midi);
        AppState.heldCorrectNotes.delete(midi); 
        AppState.preExpectedHeldNotes.delete(midi);
        const earlyReservation = AppState.earlyGraceReservations.get(midi);
        if (!earlyReservation || !earlyReservation.allowTapCarry) {
            AppState.earlyGraceReservations.delete(midi);
        }
        releaseHeldIncorrectFeedback(midi);
        
        if (shouldRouteLiveSourceToLocalAudio(source)) {
            const noteName = getSamplerNoteName(midi);
            if (noteName) pianoSampler.triggerRelease(noteName, getLiveAudioTime());
        }

        if (shouldRouteLiveSourceToMidiOut(source)) {
            sendMidiOutNoteOff(midi);
        }
    }
    
    renderVirtualKeyboard();
}

function checkWaitModeAdvance() {
    if (!AppState.isPlaying || (AppState.mode !== 'wait' && AppState.mode !== 'follow') || !AppState.isAudioBusy) return;

    if (AppState.expectedNotes.length === 0) return; 

    const allHit = AppState.expectedNotes.every(n => n.hit);
    
    if (allHit) {
        AppState.isAudioBusy = false;
        
        AppState.pendingAudio.forEach(audio => {
            schedulePlaybackForDestinations(audio.midi, audio.durationMs, audio.velocity ?? 100, { toLocalAudio: !!audio.toLocalAudio, toMidiOut: !!audio.toMidiOut });
        });
        AppState.pendingAudio = []; 

        // Keep practicing-hand sustain visuals active in wait/follow modes so notes that
        // legitimately ring across later beats remain visible until their visual
        // duration ends. We only clear stale held-correct states when a note is no
        // longer expected or visually sustained.
        startVisualSustains();

        const followInfo = AppState.followAdvanceInfo || null;
        const shouldFollow = AppState.mode === 'follow' && followInfo && Number.isFinite(followInfo.waitSeconds);
        if (shouldFollow) {
            const fullWaitSeconds = Math.max(0, followInfo.waitSeconds);
            const rawRemainingSeconds = Number.isFinite(AppState.anchorTime)
                ? (AppState.anchorTime - Tone.now())
                : fullWaitSeconds;

            // Keep the original beat grid when the player is on time or early.
            // If the player arrives late, do not collapse the next delay into a tiny
            // catch-up burst. Let Follow Me breathe from the player's actual hit time.
            let effectiveWaitSeconds = rawRemainingSeconds > 0
                ? rawRemainingSeconds
                : fullWaitSeconds;
            const minimumComfortWaitSeconds = fullWaitSeconds * FOLLOW_ME_MIN_WAIT_RATIO;
            if (effectiveWaitSeconds < minimumComfortWaitSeconds) {
                effectiveWaitSeconds = fullWaitSeconds;
            }
            effectiveWaitSeconds = Math.max(0, effectiveWaitSeconds);

            scheduleMetronomeForPlaybackWindow(
                Tone.now(),
                followInfo.currentMeasureIdx,
                followInfo.currentTimestamp,
                effectiveWaitSeconds,
                followInfo.beatsToWait
            );
            const delayMs = Math.max(0, Math.round(effectiveWaitSeconds * 1000));
            setTimeout(() => {
                if (AppState.isPlaying && AppState.mode === 'follow') {
                    osmd.cursor.update(); 
                    handleAutoScroll();
                    playbackLoop();
                }
            }, delayMs);
            return;
        }

        setTimeout(() => {
            if (AppState.isPlaying && AppState.mode === 'wait') {
                osmd.cursor.update(); 
                handleAutoScroll();
                playbackLoop();       
            }
        }, 10); 
    }
}
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
