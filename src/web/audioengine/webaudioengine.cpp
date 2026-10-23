/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-CLA-applies
 *
 * MuseScore
 * Music Composition & Notation
 *
 * Copyright (C) 2021 MuseScore Limited and others
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
#include "webaudioengine.h"

#include "global/modularity/ioc.h"

#include "global/runtime.h"
#include "global/async/processevents.h"
#include "audio/common/workmode.h"

#include "audio/common/rpc/platform/web/webrpcchannel.h"

#include "audio/engine/internal/enginecontroller.h"
#include "audio/engine/iengineplayback.h"
#include "audio/engine/isoundfontrepository.h"
#include "audio/engine/internal/synthesizers/fluidsynth/fluidsynth.h"
#include <algorithm>

#include "log.h"

using namespace muse;
using namespace muse::io;
using namespace muse::audio;
using namespace muse::audio::engine;
using namespace muse::audio::rpc;

WebAudioEngine* WebAudioEngine::instance()
{
    static WebAudioEngine w;
    return &w;
}

static std::string moduleName()
{
    return "audio_engine";
}

static modularity::ModulesIoC* ioc()
{
    return modularity::globalIoc();
}

void WebAudioEngine::init()
{
    muse::runtime::mainThreadId(); //! NOTE Needs only call
    muse::runtime::setThreadName("audio_engine");
    workmode::load();

    //! --- Setup logger ---
    using namespace muse::logger;
    Logger* logger = Logger::instance();
    logger->clearDests();

    //! Console
    {
        class ThreadNameProvider : public IThreadNameProvider
        {
        public:
            const std::string& threadName(const std::thread::id&) const { return muse::runtime::threadName(); }
        };

        LogLayout ll("${time} | ${type|5} | ${thread|15} | ${tag|15} | ${message}");
        ll.setThreadNameProvider(std::make_shared<ThreadNameProvider>());
        logger->addDest(new ConsoleLogDest(ll));
    }

    rpc::set_last_stream_id(100000);
    m_rpcChannel = std::make_shared<WebRpcChannel>();
    m_rpcChannel->setupOnEngine();
    ioc()->registerExport<IRpcChannel>(moduleName(), m_rpcChannel);

    m_controller = std::make_shared<EngineController>(m_rpcChannel, std::make_shared<modularity::Context>(0));
    m_controller->registerExports();
    m_playback = ioc()->resolve<IEnginePlayback>(moduleName());
    m_controller->onStartRunning();

    LOGI() << "Web audio engine running";
}

void WebAudioEngine::process(float* stream, unsigned samplesPerChannel)
{
    // The worklet has no Qt event loop to deliver deferred engine callbacks.
    async::processMessages();
    m_controller->process(stream, samplesPerChannel);
}

bool WebAudioEngine::playbackFrame(unsigned int sequenceId, double* frame) const
{
    if (!m_playback) { return false; }
    const auto ids = m_playback->sequenceIdList();
    if (std::find(ids.begin(), ids.end(), sequenceId) == ids.end()) { return false; }
    frame[0] = double(m_playback->playbackPosition(sequenceId));
    frame[1] = int(m_playback->playbackStatus(sequenceId));
    return true;
}

bool WebAudioEngine::preparePreview()
{
    if (m_preview) { return true; }
    const auto repository = ioc()->resolve<synth::ISoundFontRepository>(moduleName());
    if (!repository || repository->isLoadingSoundFonts() || !m_controller->outputSpec().isValid()) { return false; }
    // Reuse the bundled font already loaded by MuseScore; no network font or
    // substitute synthesis model is introduced for practice.
    for (const auto& entry : repository->soundFonts()) {
        if (entry.second.name != "MS Basic") { continue; }
        auto preview = std::make_shared<synth::FluidSynth>(AudioSourceParams {}, std::make_shared<modularity::Context>(0));
        if (!preview->init(m_controller->outputSpec()) || !preview->addSoundFonts({ entry.second.path })) { return false; }
        preview->setupSound(mpe::PlaybackSetupData(mpe::SoundId::Piano, mpe::SoundCategory::Keyboards));
        m_preview = preview;
        for (int channel = 0; channel < 16; ++channel) {
            midi::Event program(midi::Event::Opcode::ProgramChange, midi::Event::MessageType::ChannelVoice10);
            program.setChannel(channel);
            program.setProgram(0); // General MIDI acoustic grand piano.
            m_preview->previewEvent(program);
        }
        return true;
    }
    return false;
}

void WebAudioEngine::previewMidi(int status, int data1, int data2)
{
    if (!m_preview || status < 0x80 || status > 0xbf || data1 < 0 || data1 > 127 || data2 < 0 || data2 > 127) { return; }
    const int op = status >> 4;
    if (op != 8 && op != 9 && op != 11) { return; }
    const auto opcode = op == 11 ? midi::Event::Opcode::ControlChange
        : op == 8 || data2 == 0 ? midi::Event::Opcode::NoteOff : midi::Event::Opcode::NoteOn;
    midi::Event event(opcode, op == 11 ? midi::Event::MessageType::ChannelVoice10 : midi::Event::MessageType::ChannelVoice20);
    event.setChannel(status & 15);
    if (op == 11) { event.setIndex(data1); event.setData(data2); }
    else { event.setNote(data1); event.setVelocity7(data2); event.setPitchNote(data1, 0); }
    m_preview->previewEvent(event);
}

void WebAudioEngine::previewRender(float* stream, unsigned samplesPerChannel)
{
    if (!m_preview || !samplesPerChannel) { return; }
    m_previewBuffer.resize(samplesPerChannel * 2);
    if (!m_preview->previewRender(m_previewBuffer.data(), samplesPerChannel)) { return; }
    for (size_t i = 0; i < m_previewBuffer.size(); ++i) { stream[i] += m_previewBuffer[i] * 0.2f; }
}

void WebAudioEngine::stopPreview()
{
    for (int channel = 0; channel < 16; ++channel) {
        previewMidi(0xb0 | channel, 64, 0);
        previewMidi(0xb0 | channel, 120, 0);
    }
}
