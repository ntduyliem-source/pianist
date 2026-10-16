/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Studio-CLA-applies
 *
 * MuseScore Studio
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
#include "applicationactioncontroller.h"
#include <algorithm>
#include <map>

#ifdef Q_OS_WASM
#include <emscripten/val.h>
#endif

#include "log.h"

using namespace mu::appshell;
using namespace muse;
using namespace muse::actions;

void ApplicationActionController::preInit()
{
}

void ApplicationActionController::init()
{
    QObject::connect(this, &ApplicationActionController::documentChanged, this, [this]() {
        m_documentStateChanged.notify();
#ifdef Q_OS_WASM
        const auto callback = emscripten::val::module_property("onDocumentState");
        if (!callback.isUndefined() && !callback.isNull()) {
            callback(documentName().toStdString(), documentDirty());
        }
#endif
    });
    for (const std::string command : { "new", "open", "save", "export", "about" }) {
        dispatcher()->reg(this, "web-file-" + command, [this, command]() {
            requestFileAction(QString::fromStdString(command));
        });
    }
    for (int index = 0; index < 3; ++index) {
        const std::string code = index == 0 ? "toggle-palettes" : index == 1 ? "toggle-instruments" : "inspector";
        dispatcher()->reg(this, code, [this, index]() {
            if (m_sidebarVisible && m_sidebarTab == index) {
                hideSidebar();
            } else {
                selectSidebarTab(index);
            }
        });
    }
    const std::map<std::string, bool*> toggles {
        { "toggle-navigator", &m_navigatorVisible },
        { "toggle-piano-keyboard", &m_pianoVisible },
        { "toggle-mixer", &m_mixerVisible },
        { "toggle-noteinput", &m_noteInputVisible },
        { "toggle-transport", &m_playbackVisible },
        { "toggle-statusbar", &m_statusBarVisible }
    };
    for (const auto& entry : toggles) {
        bool* value = entry.second;
        dispatcher()->reg(this, entry.first, [this, value]() {
            *value = !*value;
            notifyViewState();
        });
    }
    dispatcher()->reg(this, "dock-restore-default-layout", [this]() {
        m_sidebarTab = 0;
        m_sidebarVisible = m_noteInputVisible = m_playbackVisible = m_statusBarVisible = true;
        m_navigatorVisible = m_pianoVisible = m_mixerVisible = false;
        notifyViewState();
    });
    globalContext()->currentProjectChanged().onNotify(this, [this]() {
        const auto project = globalContext()->currentProject();
        if (project) {
            project->needSave().notification.onNotify(this, [this]() { emit documentChanged(); });
            project->displayNameChanged().onNotify(this, [this]() { emit documentChanged(); });
        }
        emit documentChanged();
    });
    // Same focus-based global shortcut routing as the native shell.
    for (const std::string command : { "copy", "cut", "paste", "undo", "redo", "delete", "cancel" }) {
        dispatcher()->reg(this, "action://" + command, [this, command]() {
            const bool focused = globalContext()->currentProject()
                                 && uiContextResolver()->currentUiContext() == context::UiCtxProjectFocused;
            if (focused) {
                dispatcher()->dispatch("action://notation/" + command);
            } else if (command == "cancel") {
                dispatcher()->dispatch("nav-escape");
            }
        });
    }
}

QString ApplicationActionController::documentName() const
{
    const auto project = globalContext()->currentProject();
    return project ? project->displayName() : QStringLiteral("Untitled score");
}

bool ApplicationActionController::documentDirty() const
{
    const auto project = globalContext()->currentProject();
    return project && project->needSave().val;
}

void ApplicationActionController::notifyViewState()
{
    emit viewStateChanged();
    m_viewStateChanged.notify();
}

void ApplicationActionController::selectSidebarTab(int index)
{
    m_sidebarTab = std::clamp(index, 0, 2);
    m_sidebarVisible = true;
    notifyViewState();
}

void ApplicationActionController::hideSidebar()
{
    m_sidebarVisible = false;
    notifyViewState();
}

bool ApplicationActionController::isViewChecked(const ActionCode& code) const
{
    if (code == "toggle-palettes") { return m_sidebarVisible && m_sidebarTab == 0; }
    if (code == "toggle-instruments") { return m_sidebarVisible && m_sidebarTab == 1; }
    if (code == "inspector") { return m_sidebarVisible && m_sidebarTab == 2; }
    if (code == "toggle-navigator") { return m_navigatorVisible; }
    if (code == "toggle-piano-keyboard") { return m_pianoVisible; }
    if (code == "toggle-mixer") { return m_mixerVisible; }
    if (code == "toggle-noteinput") { return m_noteInputVisible; }
    if (code == "toggle-transport") { return m_playbackVisible; }
    if (code == "toggle-statusbar") { return m_statusBarVisible; }
    return false;
}

void ApplicationActionController::requestFileAction(const QString& command)
{
#ifdef Q_OS_WASM
    const auto callback = emscripten::val::module_property("onWebCommand");
    if (!callback.isUndefined() && !callback.isNull()) {
        callback(command.toStdString());
    }
#else
    UNUSED(command);
#endif
}
