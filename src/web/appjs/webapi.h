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
#pragma once

#include "global/async/asyncable.h"

#include "global/modularity/ioc.h"
#include "global/iinteractive.h"
#include "actions/iactionsdispatcher.h"
#include "context/iglobalcontext.h"
#include "audio/main/istartaudiocontroller.h"
#include "audio/main/isoundfontcontroller.h"
#include "audio/main/iplayback.h"
#include "audio/main/iplayer.h"
#include "project/iprojectcreator.h"
#include "project/inotationwritersregister.h"
#include "playback/iplaybackcontroller.h"

namespace mu::appjs {
class WebApi : public muse::async::Asyncable, public muse::Contextable
{
    muse::ContextInject<muse::IInteractive> interactive = { this };
    muse::ContextInject<muse::actions::IActionsDispatcher> dispatcher = { this };
    muse::ContextInject<mu::context::IGlobalContext> globalContext = { this };
    muse::ContextInject<muse::audio::IStartAudioController> startAudioController = { this };
    muse::ContextInject<muse::audio::ISoundFontController> soundFontController = { this };
    muse::ContextInject<project::INotationWritersRegister> writers = { this };
    muse::ContextInject<playback::IPlaybackController> playbackController = { this };
    muse::ContextInject<muse::audio::IPlayback> audioPlayback = { this };
    muse::GlobalInject<project::IProjectCreator> projectCreator;

public:

    static WebApi* instance(const muse::modularity::ContextPtr& ctx = nullptr);

    void init();
    void deinit();

    bool load(const void* source, unsigned int len, const std::string& filename);
    bool loadPracticeScore(const void* source, unsigned int len, const std::string& filename);
    bool restorePracticeScore();
    bool saveProject();
    bool serializeProject();
    bool prepareProject(const void* source, unsigned int len, const std::string& filename, bool semantics);
    bool prepareSnapshot(const void* source, unsigned int len, const std::string& filename);
    bool getScoreSemantics();
    bool getSnapshot();
    bool setPracticeActive(bool active);
    bool midiInput(int status, int data1, int data2);
    bool exportScore(const std::string& format);
    bool dispatchAction(const std::string& action);
    bool getEditorPlayback();
    bool editorPlayback(const std::string& command, double value);
    bool getPracticePlayback();
    bool getPracticePlaybackNotes();
    bool practicePlayback(const std::string& command, double value, double end);
    void checkAudioReady();
    void addSoundFont(const std::string& uri);
    void startAudioProcessing();

private:

    explicit WebApi(const muse::modularity::ContextPtr& ctx) : muse::Contextable(ctx) {}

    void onProjectSaved(const muse::io::path_t& path, mu::project::SaveMode mode);
    void bumpRevision();
    bool snapshotFor(const project::INotationProjectPtr& project, bool drawings, const char* callback);
    void resetPracticePlayback();
    void applyPracticePlaybackRange();
    void preparePracticePlayback();
    void publishPracticeClock();

    enum class PreparedOutput { Project, Semantics, Snapshot };
    bool prepareTemporaryProject(const void* source, unsigned int len, const std::string& filename, PreparedOutput outputKind);

    project::INotationProjectPtr m_currentProject;
    project::INotationProjectPtr m_editorProject;
    bool m_practiceProjectLoaded = false;
    unsigned int m_revision = 0;
    bool m_practiceActive = false;
    bool m_auditionConfigured = false;
    bool m_auditionLoop = false;
    bool m_auditionPreparing = false;
    unsigned int m_auditionGeneration = 0;
    unsigned int m_auditionClockEpoch = 0;
    unsigned int m_auditionNotesRevision = 0;
    double m_auditionStart = 0.0;
    double m_auditionEnd = 0.0;
    double m_editorTempo = 1.0;
    QString m_auditionError;
    muse::audio::IPlayerPtr m_auditionPlayer;
};
}
