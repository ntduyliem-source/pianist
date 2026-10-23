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

#include "web/appjs/webapi.h"

#include <emscripten.h>

using namespace mu::appjs;

extern "C" {
EMSCRIPTEN_KEEPALIVE
bool load(const void* source, unsigned int len, const char* filename)
{
    return filename && WebApi::instance()->load(source, len, filename);
}

EMSCRIPTEN_KEEPALIVE
bool loadPracticeScore(const void* source, unsigned int len, const char* filename)
{
    return filename && WebApi::instance()->loadPracticeScore(source, len, filename);
}

EMSCRIPTEN_KEEPALIVE
bool restorePracticeScore() { return WebApi::instance()->restorePracticeScore(); }

EMSCRIPTEN_KEEPALIVE
bool saveProject() { return WebApi::instance()->saveProject(); }

EMSCRIPTEN_KEEPALIVE
bool serializeProject() { return WebApi::instance()->serializeProject(); }

EMSCRIPTEN_KEEPALIVE
bool prepareProject(const void* source, unsigned int len, const char* filename, bool semantics)
{
    return filename && WebApi::instance()->prepareProject(source, len, filename, semantics);
}

EMSCRIPTEN_KEEPALIVE
bool preparePracticeSnapshot(const void* source, unsigned int len, const char* filename)
{
    return filename && WebApi::instance()->prepareSnapshot(source, len, filename);
}

EMSCRIPTEN_KEEPALIVE
bool getScoreSemantics() { return WebApi::instance()->getScoreSemantics(); }

EMSCRIPTEN_KEEPALIVE
bool getPracticeSnapshot() { return WebApi::instance()->getSnapshot(); }

EMSCRIPTEN_KEEPALIVE
bool setPracticeActive(bool active) { return WebApi::instance()->setPracticeActive(active); }

EMSCRIPTEN_KEEPALIVE
bool webMidiInput(int status, int data1, int data2) { return WebApi::instance()->midiInput(status, data1, data2); }

EMSCRIPTEN_KEEPALIVE
bool exportScore(const char* format) { return format && WebApi::instance()->exportScore(format); }

EMSCRIPTEN_KEEPALIVE
bool dispatchAction(const char* action) { return action && WebApi::instance()->dispatchAction(action); }

EMSCRIPTEN_KEEPALIVE
bool getEditorPlayback() { return WebApi::instance()->getEditorPlayback(); }

EMSCRIPTEN_KEEPALIVE
void checkAudioReady() { WebApi::instance()->checkAudioReady(); }

EMSCRIPTEN_KEEPALIVE
bool editorPlayback(const char* command, double value) { return command && WebApi::instance()->editorPlayback(command, value); }

EMSCRIPTEN_KEEPALIVE
bool getPracticePlayback() { return WebApi::instance()->getPracticePlayback(); }

EMSCRIPTEN_KEEPALIVE
bool getPracticePlaybackNotes() { return WebApi::instance()->getPracticePlaybackNotes(); }

EMSCRIPTEN_KEEPALIVE
bool practicePlayback(const char* command, double value, double end) { return command && WebApi::instance()->practicePlayback(command, value, end); }

EMSCRIPTEN_KEEPALIVE
void addSoundFont(const char* uri)
{
    WebApi::instance()->addSoundFont(std::string(uri));
}

EMSCRIPTEN_KEEPALIVE
void startAudioProcessing() { WebApi::instance()->startAudioProcessing(); }
}
