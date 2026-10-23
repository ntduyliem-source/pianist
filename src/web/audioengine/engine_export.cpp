/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Studio-CLA-applies
 *
 * MuseScore Studio
 * Music Composition & Notation
 *
 * Copyright (C) 2025 MuseScore Limited and others
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

#include "log.h"

using namespace muse::audio::engine;

int main()
{
    // noop
    return 0;
}

extern "C" {
void Init(unsigned int)
{
    WebAudioEngine::instance()->init();
}

void process(uintptr_t ptr, unsigned samplesPerChannel)
{
    float* stream = reinterpret_cast<float*>(ptr);
    std::memset(stream, 0, samplesPerChannel * 2 * sizeof(float));
    WebAudioEngine::instance()->process(stream, samplesPerChannel);
}

bool playbackFrame(unsigned int sequenceId, uintptr_t ptr)
{
    return WebAudioEngine::instance()->playbackFrame(sequenceId, reinterpret_cast<double*>(ptr));
}
bool preparePreview() { return WebAudioEngine::instance()->preparePreview(); }
void previewMidi(int status, int data1, int data2) { WebAudioEngine::instance()->previewMidi(status, data1, data2); }
void previewRender(uintptr_t ptr, unsigned samplesPerChannel)
{
    WebAudioEngine::instance()->previewRender(reinterpret_cast<float*>(ptr), samplesPerChannel);
}
void stopPreview() { WebAudioEngine::instance()->stopPreview(); }
}
