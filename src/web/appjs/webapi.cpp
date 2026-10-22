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
#include "webapi.h"

#ifdef Q_OS_WASM
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

#include "global/io/file.h"
#include "global/io/buffer.h"
#include "midi/midievent.h"
#include "notation/inotation.h"
#include "notation/inotationplayback.h"
#include <algorithm>
#include <cctype>
#include <map>
#include <set>
#include <cmath>
#include <QJsonDocument>
#include <QJsonObject>
#include "context/iplaybackstate.h"
#include "audio/main/iplayer.h"
#include "actions/actiontypes.h"

#include "log.h"

using namespace muse;
using namespace mu::appjs;

#ifdef Q_OS_WASM
static void callJsWithBytes(const char* fnname, const uint8_t* data, size_t size)
{
    emscripten::val jsArray = emscripten::val::global("Uint8Array").new_(
        emscripten::typed_memory_view(size, data)
        );

    emscripten::val::module_property(fnname)(jsArray);
}

#else

static void callJsWithBytes(const char*, const uint8_t*, size_t)
{
    NOT_SUPPORTED;
}

#endif

WebApi* WebApi::instance(const muse::modularity::ContextPtr& ctx)
{
    static WebApi a(ctx);

    return &a;
}

void WebApi::init()
{
    auto onProjectChanged = [this]() {
        if (m_currentProject) {
            m_currentProject->saveComplited().disconnect(this);
            m_currentProject->masterNotation()->notation()->undoStack()->stackChanged().disconnect(this);
            m_currentProject->masterNotation()->notation()->notationChanged().disconnect(this);
        }

        m_currentProject = globalContext()->currentProject();
        ++m_auditionGeneration;
        m_auditionPlayer.reset();
        m_auditionConfigured = false;
        m_auditionPreparing = false;

        if (m_currentProject) {
            m_currentProject->saveComplited().onReceive(this, [this](const muse::io::path_t& path, project::SaveMode mode) {
                onProjectSaved(path, mode);
            });
            const auto notation = m_currentProject->masterNotation()->notation();
            notation->undoStack()->stackChanged().onNotify(this, [this]() { bumpRevision(); });
            notation->notationChanged().onNotify(this, [this]() { bumpRevision(); });
        }
        bumpRevision();
    };

    globalContext()->currentProjectChanged().onNotify(this, onProjectChanged);

    onProjectChanged();
}

void WebApi::deinit()
{
    if (m_currentProject) {
        m_currentProject->saveComplited().disconnect(this);
    }
}

bool WebApi::load(const void* source, unsigned int len, const std::string& filename)
{
    if (m_practiceActive) { return false; }
    // Use an allowlisted suffix, never a user-controlled virtual filesystem path.
    std::string format = io::suffix(io::path_t(filename));
    std::transform(format.begin(), format.end(), format.begin(), [](unsigned char c) { return std::tolower(c); });
    static const std::set<std::string> formats { "mxl", "xml", "musicxml", "mscz", "mscx" };
    if (!source || len == 0 || len > 32 * 1024 * 1024 || !formats.count(format)) {
        LOGE() << "Unsupported format or file size";
        return false;
    }
    ByteArray data = ByteArray::fromRawData(reinterpret_cast<const char*>(source), len);
    const io::path_t tempFilePath = std::string("/mu/temp/input.") + format;
    if (!io::File::writeFile(tempFilePath, data)) {
        return false;
    }
    auto project = projectCreator()->newProject(iocContext());
    const Ret ret = project->load(tempFilePath, {}, format);
    io::File::remove(tempFilePath);
    if (!ret) {
        LOGE() << "Open failed: " << ret.toString();
        return false;
    }
    // Publish only after successful parsing; a bad file keeps the current score.
    project->setPath(std::string("/mu/documents/") + io::filename(io::path_t(filename)).toStdString());
    // Desktop closes the old document before publishing a new one. Web reuses
    // one window, so give notation/playback observers the same empty-context
    // transition while keeping the old score alive through their callbacks.
    const auto previousProject = globalContext()->currentProject();
    if (previousProject) {
        interactive()->closeAllDialogsSync();
        globalContext()->setCurrentProject(nullptr);
    }
    globalContext()->setCurrentProject(project);
    interactive()->open("musescore://notation");
    return true;
}

bool WebApi::loadPracticeScore(const void* source, unsigned int len, const std::string& filename)
{
    if (!m_practiceActive) { return false; }
    // Keep the actual editor project alive: MSCZ serialization does not retain
    // its undo/redo stack. Use the same empty-context transition as load().
    const auto editor = m_practiceProjectLoaded ? m_editorProject : m_currentProject;
    resetPracticePlayback();
    m_practiceActive = false;
    const bool loaded = load(source, len, filename);
    m_practiceActive = true;
    if (!loaded) { return false; }
    m_editorProject = editor;
    m_practiceProjectLoaded = true;
    m_currentProject->masterNotation()->playback()->setTempoMultiplier(1.0);
    return true;
}

bool WebApi::restorePracticeScore()
{
    if (!m_practiceProjectLoaded) { return true; }
    if (!m_practiceActive) { return false; }
    resetPracticePlayback();
    const auto audition = m_currentProject; // Keep it alive through observer callbacks.
    interactive()->closeAllDialogsSync();
    globalContext()->setCurrentProject(nullptr);
    globalContext()->setCurrentProject(m_editorProject);
    if (m_editorProject) { interactive()->open("musescore://notation"); }
    m_editorProject.reset();
    m_practiceProjectLoaded = false;
    return true;
}

bool WebApi::saveProject()
{
    if (!m_currentProject) {
        return false;
    }
    const auto originalPath = m_currentProject->path();
    const bool saved = m_currentProject->save("/mu/temp/pianist.mscz", project::SaveMode::SaveAs, false).success();
    m_currentProject->setPath(originalPath);
    return saved;
}

bool WebApi::exportScore(const std::string& format)
{
    if (!m_currentProject || (format != "mxl" && format != "musicxml" && format != "pdf")) {
        return false;
    }
    const auto writer = writers()->writer(format);
    if (!writer) {
        return false;
    }
    io::Buffer buffer;
    buffer.open(io::IODevice::WriteOnly);
    const Ret ret = writer->write(m_currentProject->masterNotation()->notation(), buffer);
    if (!ret) {
        return false;
    }
    callJsWithBytes(format == "pdf" ? "onPdfExported" : format == "mxl" ? "onMxlExported" : "onXmlExported",
                    buffer.data().constData(), buffer.data().size());
    return true;
}

bool WebApi::serializeProject()
{
    if (!m_currentProject) { return false; }
    // AutoSave writes a native project without marking the editor's undo stack clean.
    const io::path_t path = "/mu/temp/pianist-recovery.mscz";
    if (!m_currentProject->save(path, project::SaveMode::AutoSave, false)) { return false; }
    ByteArray data;
    if (!io::File::readFile(path, data)) { return false; }
    callJsWithBytes("onProjectSerialized", data.constData(), data.size());
    io::File::remove(path);
    return true;
}

bool WebApi::prepareProject(const void* source, unsigned int len, const std::string& filename, bool semantics)
{
    return prepareTemporaryProject(source, len, filename,
                                   semantics ? PreparedOutput::Semantics : PreparedOutput::Project);
}

bool WebApi::prepareSnapshot(const void* source, unsigned int len, const std::string& filename)
{
    return prepareTemporaryProject(source, len, filename, PreparedOutput::Snapshot);
}

bool WebApi::prepareTemporaryProject(const void* source, unsigned int len, const std::string& filename, PreparedOutput outputKind)
{
    // Parse and serialize without publishing to globalContext. The live score,
    // its undo stack, selection and revision remain owned by the editor.
    std::string format = io::suffix(io::path_t(filename));
    std::transform(format.begin(), format.end(), format.begin(), [](unsigned char c) { return std::tolower(c); });
    static const std::set<std::string> formats { "mxl", "xml", "musicxml", "mscz", "mscx" };
    if (!source || !len || len > 64 * 1024 * 1024 || !formats.count(format)) { return false; }
    const io::path_t input = std::string("/mu/temp/pianist-prepare.") + format;
    const io::path_t output = "/mu/temp/pianist-prepared.mscz";
    if (!io::File::writeFile(input, ByteArray::fromRawData(reinterpret_cast<const char*>(source), len))) { return false; }
    auto project = projectCreator()->newProject(iocContext());
    const Ret loaded = project->load(input, {}, format);
    io::File::remove(input);
    if (!loaded) { return false; }
    if (outputKind == PreparedOutput::Semantics) { return snapshotFor(project, false, "onPreparedSemantics"); }
    if (outputKind == PreparedOutput::Snapshot) { return snapshotFor(project, true, "onPreparedSnapshot"); }
    const Ret saved = project->save(output, project::SaveMode::AutoSave, false);
    ByteArray data;
    const bool read = saved && io::File::readFile(output, data);
    io::File::remove(output);
    if (!read || data.empty() || data.size() > 32 * 1024 * 1024) { return false; }
    callJsWithBytes("onProjectPrepared", data.constData(), data.size());
    return true; // Local shared_ptr releases the temporary project here.
}

void WebApi::bumpRevision()
{
    ++m_revision;
#ifdef Q_OS_WASM
    const auto callback = emscripten::val::module_property("onRevisionChanged");
    if (!callback.isUndefined() && !callback.isNull()) { callback(m_revision); }
#endif
}

bool WebApi::setPracticeActive(bool active)
{
    if (m_practiceActive == active) { return true; }
    resetPracticePlayback();
    if (active) {
        // Native playback must not keep running behind the practice transport.
        m_editorTempo = playbackController()->tempoMultiplier();
        dispatcher()->dispatch("stop");
        dispatcher()->dispatch("escape");
    }
    if (m_currentProject) {
        // Use the upstream tempo-map operation without the editor controller's
        // asynchronous resume, which can otherwise run after stop/navigation.
        const auto playback = m_currentProject->masterNotation()->playback();
        playback->setTempoMultiplier(active ? 1.0 : m_editorTempo);
        if (!active && m_auditionPlayer) {
            // Restore the editor loop as PlaybackController::updateLoop does.
            const auto& boundaries = playback->loopBoundaries();
            if (boundaries.enabled) {
                const auto from = playback->playPositionTickByRawTick(boundaries.loopInTick.ticks());
                const auto to = playback->playPositionTickByRawTick(boundaries.loopOutTick.ticks());
                if (from.ret && to.ret) {
                    m_auditionPlayer->setLoop(audio::secsToMilisecs(playback->playedTickToSec(from.val)),
                                             audio::secsToMilisecs(playback->playedTickToSec(to.val)));
                }
            }
        }
    }
    m_practiceActive = active;
    return true;
}

bool WebApi::midiInput(int status, int data1, int data2)
{
    if (m_practiceActive || !m_currentProject || status < 0x80 || status > 0xef
        || data1 < 0 || data1 > 127 || data2 < 0 || data2 > 127) { return false; }
    const int opcode = status >> 4;
    if (opcode != 8 && opcode != 9 && opcode != 11) { return false; }
    auto event = muse::midi::Event(static_cast<muse::midi::Event::Opcode>(opcode), muse::midi::Event::MessageType::ChannelVoice10);
    event.setChannel(status & 15);
    event.setNote(data1);
    if (opcode == 11) { event.setData(data2); } else { event.setVelocity7(data2); }
    const auto notation = globalContext()->currentNotation();
    if (!notation) { return false; }
    notation->midiInput()->onMidiEventReceived(event);
    return true;
}

bool WebApi::dispatchAction(const std::string& action)
{
    // Keep browser commands stable when upstream action identifiers change.
    static const std::map<std::string, std::string> actions {
        { "undo", "action://notation/undo" },
        { "redo", "action://notation/redo" },
        { "select-all", "notation-select-all" },
        { "pitch-up", "pitch-up" },
        { "pitch-down", "pitch-down" },
        { "delete", "action://notation/delete" }
    };
    const auto command = actions.find(action);
    if (m_practiceActive || !m_currentProject || command == actions.end()) {
        return false;
    }
    const auto registered = dispatcher()->actionList();
    if (std::find(registered.begin(), registered.end(), command->second) == registered.end()) {
        return false;
    }
    dispatcher()->dispatch(command->second);
    return true;
}

bool WebApi::getEditorPlayback()
{
    const auto state = globalContext()->playbackState();
    const auto status = state ? state->playbackStatus() : audio::PlaybackStatus::Stopped;
    const bool loaded = m_currentProject && playbackController()->isPlayAllowed();
    const QJsonObject data {
        { "available", loaded && !m_practiceActive },
        { "status", status == audio::PlaybackStatus::Running ? "playing"
                    : status == audio::PlaybackStatus::Paused ? "paused" : "stopped" },
        { "positionSeconds", state ? double(state->playbackPosition()) : 0.0 },
        { "durationSeconds", m_currentProject ? double(playbackController()->totalPlayTime()) : 0.0 },
        { "tempoMultiplier", m_currentProject ? playbackController()->tempoMultiplier() : 1.0 }
    };
#ifdef Q_OS_WASM
    const auto callback = emscripten::val::module_property("onEditorPlayback");
    if (callback.isUndefined() || callback.isNull()) { return false; }
    callback(QJsonDocument(data).toJson(QJsonDocument::Compact).toStdString());
#endif
    return true;
}

void WebApi::checkAudioReady()
{
    const auto notify = [](bool ready) {
#ifdef Q_OS_WASM
        const auto callback = emscripten::val::module_property("onAudioReady");
        if (!callback.isUndefined() && !callback.isNull()) { callback(ready); }
#endif
    };
    if (!audioPlayback()->isAudioStarted()) { notify(false); return; }
    // The driver's "inited" flag precedes asynchronous soundfont installation.
    // Ask the actual audio engine's resource list before creating score tracks.
    audioPlayback()->availableInputResources().onResolve(this, [notify](const audio::AudioResourceMetaList& resources) {
        notify(std::any_of(resources.begin(), resources.end(), [](const audio::AudioResourceMeta& resource) {
            return resource.id == "MS Basic";
        }));
    }).onReject(this, [notify](int, const std::string&) { notify(false); });
}

bool WebApi::editorPlayback(const std::string& command, double value)
{
    if (m_practiceActive || !m_currentProject || !std::isfinite(value)) { return false; }
    // Use MuseScore's controller/actions for sequencing, repeat, tempo and cursor.
    // These are the same entry points as PlaybackToolBarModel, not a JS scheduler.
    if (command == "tempo") {
        if (value < 0.25 || value > 2.0) { return false; }
        playbackController()->setTempoMultiplier(value);
    } else if (command == "seek") {
        dispatcher()->dispatch("rewind", actions::ActionData::make_arg1<audio::secs_t>(value));
    } else if (command == "play" || command == "toggle") {
        if (!playbackController()->isPlayAllowed()) { return false; }
        if (command == "toggle" || !playbackController()->isPlaying()) { dispatcher()->dispatch("play"); }
    } else if (command == "pause" || command == "stop") {
        dispatcher()->dispatch(command);
    } else {
        return false;
    }
    return true;
}

void WebApi::resetPracticePlayback()
{
    ++m_auditionGeneration; // Invalidates prepareToPlay callbacks after navigation/stop.
    m_auditionPreparing = false;
    m_auditionError.clear();
    if (!m_auditionConfigured) { return; }
    const auto player = m_auditionPlayer;
    if (player) {
        player->stop();
        player->resetLoop();
    }
    // The same tempo-map operation used by PlaybackController, without its
    // asynchronous resume callback. A reset must never schedule another play.
    m_currentProject->masterNotation()->playback()->setTempoMultiplier(1.0);
    if (player) {
        player->setDuration(audio::secsToMilisecs(playbackController()->totalPlayTime()));
    }
    m_auditionConfigured = false;
}

void WebApi::applyPracticePlaybackRange()
{
    const auto player = m_auditionPlayer;
    if (!player || !m_auditionConfigured) { return; }
    const double speed = playbackController()->tempoMultiplier();
    player->setDuration(audio::secsToMilisecs(audio::secs_t(m_auditionEnd / speed)));
    // These are the upstream PlaybackController::updateLoop / IPlayer APIs.
    // The engine's audio Clock owns the boundary, including while JS is busy.
    if (m_auditionLoop) {
        player->setLoop(audio::secsToMilisecs(audio::secs_t(m_auditionStart / speed)),
                        audio::secsToMilisecs(audio::secs_t(m_auditionEnd / speed)));
    } else {
        player->resetLoop();
    }
}

void WebApi::preparePracticePlayback()
{
    const auto player = m_auditionPlayer;
    m_auditionError.clear();
    m_auditionPreparing = true;
    const auto generation = ++m_auditionGeneration;
    m_currentProject->masterNotation()->playback()->sendEventsForChangedTracks();
    player->prepareToPlay().onResolve(this, [this, player, generation](const Ret& ret) {
        if (generation != m_auditionGeneration || !m_practiceActive || !m_auditionConfigured) { return; }
        m_auditionPreparing = false;
        if (!ret) { m_auditionError = QString::fromStdString(ret.toString()); return; }
        applyPracticePlaybackRange();
        const double speed = playbackController()->tempoMultiplier();
        const double pos = double(player->playbackPosition()) * speed;
        if (pos < m_auditionStart || pos >= m_auditionEnd - 0.002) {
            player->seek(audio::secs_t(m_auditionStart / speed));
        }
        player->play();
    });
}

bool WebApi::getPracticePlayback()
{
    const auto state = globalContext()->playbackState();
    const auto status = state ? state->playbackStatus() : audio::PlaybackStatus::Stopped;
    const QJsonObject data {
        { "available", m_practiceActive && m_currentProject && playbackController()->isPlayAllowed() },
        { "status", status == audio::PlaybackStatus::Running ? "playing"
                    : status == audio::PlaybackStatus::Paused ? "paused" : "stopped" },
        { "positionSeconds", state ? double(state->playbackPosition()) : 0.0 },
        { "durationSeconds", m_currentProject ? double(playbackController()->totalPlayTime()) : 0.0 },
        { "tempoMultiplier", m_currentProject ? playbackController()->tempoMultiplier() : 1.0 },
        { "preparing", m_auditionPreparing },
        { "error", m_auditionError }
    };
#ifdef Q_OS_WASM
    const auto callback = emscripten::val::module_property("onPracticePlayback");
    if (callback.isUndefined() || callback.isNull()) { return false; }
    callback(QJsonDocument(data).toJson(QJsonDocument::Compact).toStdString());
#endif
    return true;
}

bool WebApi::practicePlayback(const std::string& command, double value, double end)
{
    if (!m_practiceActive || !std::isfinite(value) || !std::isfinite(end)) { return false; }
    // A grade preview can restore an empty editor. Reset remains idempotent
    // after that restore, including the previous screen's deferred cleanup.
    if (command == "reset") { resetPracticePlayback(); return true; }
    if (!m_currentProject || !playbackController()->isPlayAllowed()) { return false; }
    const auto sequence = playbackController()->currentTrackSequenceId();
    // Playback::player is a factory, not a getter. Retain its RPC subscriptions,
    // as PlaybackController does; creating one per poll returns an initial state.
    if (!m_auditionPlayer || m_auditionPlayer->sequenceId() != sequence) {
        m_auditionPlayer = audioPlayback()->player(sequence);
    }
    const auto player = m_auditionPlayer;
    if (!player) { return false; }
    const double speed = playbackController()->tempoMultiplier();
    if (command == "range") {
        if (value < 0 || end <= value || end > double(playbackController()->totalPlayTime()) * speed + 0.01) { return false; }
        resetPracticePlayback();
        player->stop();
        m_auditionConfigured = true;
        m_auditionLoop = false;
        m_auditionStart = value;
        m_auditionEnd = end;
        applyPracticePlaybackRange();
        player->seek(audio::secs_t(value));
        return true;
    }
    if (!m_auditionConfigured) { return false; }
    if (command == "play") {
        if (m_auditionPreparing || playbackController()->isPlaying()) { return true; }
        preparePracticePlayback();
    } else if (command == "pause" || command == "stop") {
        ++m_auditionGeneration;
        m_auditionPreparing = false;
        if (command == "pause") { player->pause(); }
        else { player->stop(); player->seek(audio::secs_t(m_auditionStart / speed)); }
    } else if (command == "seek") {
        player->seek(audio::secs_t(std::clamp(value, m_auditionStart, m_auditionEnd) / speed));
    } else if (command == "tempo") {
        if (value < 0.25 || value > 2.0 || m_auditionPreparing) { return false; }
        const double position = double(player->playbackPosition()) * speed;
        const bool playing = playbackController()->isPlaying();
        if (playing) { player->pause(); }
        m_currentProject->masterNotation()->playback()->setTempoMultiplier(value);
        applyPracticePlaybackRange();
        // Preserve the performed occurrence across repeats, not just the raw tick.
        player->seek(audio::secs_t(std::clamp(position, m_auditionStart, m_auditionEnd) / value));
        if (playing) { preparePracticePlayback(); }
    } else if (command == "loop") {
        m_auditionLoop = value != 0.0;
        applyPracticePlaybackRange();
    } else { return false; }
    return true;
}

void WebApi::addSoundFont(const std::string& uri)
{
    soundFontController()->addSoundFont(Uri(uri));
}

void WebApi::startAudioProcessing()
{
    startAudioController()->startAudioProcessing(IApplication::RunMode::GuiApp);
}

void WebApi::onProjectSaved(const muse::io::path_t& path, mu::project::SaveMode mode)
{
    if (mode == project::SaveMode::AutoSave || mode == project::SaveMode::SaveCopy) { return; }
    IF_ASSERT_FAILED(io::File::exists(path)) {
        LOGE() << "file does not exist, path: " << path;
        return;
    }

    ByteArray data;
    Ret ret  = io::File::readFile(path, data);
    if (!ret) {
        LOGE() << "failed read file, path: " << path;
        return;
    }

    callJsWithBytes("onProjectSaved", data.constData(), data.size());
}
