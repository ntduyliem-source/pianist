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
#ifndef MU_APPSHELL_APPLICATIONCONTROLLER_H
#define MU_APPSHELL_APPLICATIONCONTROLLER_H

#include <QObject>

#include "actions/actionable.h"
#include "async/asyncable.h"

#include "modularity/ioc.h"
#include "actions/iactionsdispatcher.h"
#include "context/iglobalcontext.h"
#include "context/iuicontextresolver.h"

namespace mu::appshell {
class ApplicationActionController : public QObject, public muse::Contextable, public muse::actions::Actionable,
    public muse::async::Asyncable
{
    Q_OBJECT
    Q_PROPERTY(QString documentName READ documentName NOTIFY documentChanged)
    Q_PROPERTY(bool documentDirty READ documentDirty NOTIFY documentChanged)
    Q_PROPERTY(int sidebarTab READ sidebarTab NOTIFY viewStateChanged)
    Q_PROPERTY(bool sidebarVisible READ sidebarVisible NOTIFY viewStateChanged)
    Q_PROPERTY(bool navigatorVisible READ navigatorVisible NOTIFY viewStateChanged)
    Q_PROPERTY(bool pianoVisible READ pianoVisible NOTIFY viewStateChanged)
    Q_PROPERTY(bool mixerVisible READ mixerVisible NOTIFY viewStateChanged)
    Q_PROPERTY(bool noteInputVisible READ noteInputVisible NOTIFY viewStateChanged)
    Q_PROPERTY(bool playbackVisible READ playbackVisible NOTIFY viewStateChanged)
    Q_PROPERTY(bool statusBarVisible READ statusBarVisible NOTIFY viewStateChanged)

    muse::ContextInject<muse::actions::IActionsDispatcher> dispatcher = { this };
    muse::ContextInject<context::IGlobalContext> globalContext = { this };
    muse::ContextInject<context::IUiContextResolver> uiContextResolver = { this };

public:
    ApplicationActionController(const muse::modularity::ContextPtr& iocCtx)
        : muse::Contextable(iocCtx) {}

    void preInit();
    void init();

    QString documentName() const;
    bool documentDirty() const;
    int sidebarTab() const { return m_sidebarTab; }
    bool sidebarVisible() const { return m_sidebarVisible; }
    bool navigatorVisible() const { return m_navigatorVisible; }
    bool pianoVisible() const { return m_pianoVisible; }
    bool mixerVisible() const { return m_mixerVisible; }
    bool noteInputVisible() const { return m_noteInputVisible; }
    bool playbackVisible() const { return m_playbackVisible; }
    bool statusBarVisible() const { return m_statusBarVisible; }
    bool isViewChecked(const muse::actions::ActionCode& code) const;
    muse::async::Notification viewStateChangedNotification() const { return m_viewStateChanged; }
    muse::async::Notification documentStateChangedNotification() const { return m_documentStateChanged; }

    Q_INVOKABLE void selectSidebarTab(int index);
    Q_INVOKABLE void hideSidebar();
    Q_INVOKABLE void requestFileAction(const QString& command);

signals:
    void documentChanged();
    void viewStateChanged();

private:
    void notifyViewState();
    int m_sidebarTab = 0;
    bool m_sidebarVisible = true;
    bool m_navigatorVisible = false;
    bool m_pianoVisible = false;
    bool m_mixerVisible = false;
    bool m_noteInputVisible = true;
    bool m_playbackVisible = true;
    bool m_statusBarVisible = true;
    muse::async::Notification m_viewStateChanged;
    muse::async::Notification m_documentStateChanged;
};
}

#endif // MU_APPSHELL_APPLICATIONCONTROLLER_H
