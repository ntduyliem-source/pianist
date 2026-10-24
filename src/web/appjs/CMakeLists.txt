# SPDX-License-Identifier: GPL-3.0-only
# MuseScore-Studio-CLA-applies
#
# MuseScore Studio
# Music Composition & Notation
#
# Copyright (C) 2021 MuseScore Limited and others
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License version 3 as
# published by the Free Software Foundation.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

muse_create_module(appjs)
set_source_files_properties(../../framework/audio/engine/internal/synthesizers/fluidsynth/fluidsequencer.cpp
    PROPERTIES SKIP_UNITY_BUILD_INCLUSION ON)

target_sources(appjs PRIVATE
    appjsmodule.cpp
    appjsmodule.h
    webapi.cpp
    webapi.h
    practicesnapshot.cpp
    # Reuse MuseScore's MIDI articulation/pedal converter for web sample output.
    # No FluidSynth device, soundfont or audio worker is linked into this adapter.
    ../../framework/audio/engine/internal/synthesizers/fluidsynth/fluidsequencer.cpp
)
