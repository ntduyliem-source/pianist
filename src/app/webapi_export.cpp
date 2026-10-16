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
bool saveProject() { return WebApi::instance()->saveProject(); }

EMSCRIPTEN_KEEPALIVE
bool exportScore(const char* format) { return format && WebApi::instance()->exportScore(format); }

EMSCRIPTEN_KEEPALIVE
bool dispatchAction(const char* action) { return action && WebApi::instance()->dispatchAction(action); }

EMSCRIPTEN_KEEPALIVE
void addSoundFont(const char* uri)
{
    WebApi::instance()->addSoundFont(std::string(uri));
}

EMSCRIPTEN_KEEPALIVE
void startAudioProcessing() { WebApi::instance()->startAudioProcessing(); }
}
