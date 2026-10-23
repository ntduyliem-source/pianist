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
#pragma once

#include <memory>
#include <vector>

namespace muse {
class GlobalModule;
}

namespace muse::audio::rpc {
class IRpcChannel;
}

namespace muse::audio::synth { class FluidSynth; }

namespace muse::audio::engine {
class EngineController;
class IEnginePlayback;
class WebAudioEngine
{
public:

    static WebAudioEngine* instance();

    void init();
    void process(float* stream, unsigned samplesPerChannel);
    bool playbackFrame(unsigned int sequenceId, double* frame) const;
    bool preparePreview();
    void previewMidi(int status, int data1, int data2);
    void previewRender(float* stream, unsigned samplesPerChannel);
    void stopPreview();

private:
    WebAudioEngine() = default;

    std::shared_ptr<rpc::IRpcChannel> m_rpcChannel;
    std::shared_ptr<engine::EngineController> m_controller;
    std::shared_ptr<engine::IEnginePlayback> m_playback;
    std::shared_ptr<synth::FluidSynth> m_preview;
    std::vector<float> m_previewBuffer;
};
}
