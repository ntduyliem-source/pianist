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
import QtQuick
import QtQuick.Layouts
import Muse.Ui
import Muse.UiComponents
import MuseScore.AppShell
import MuseScore.NotationScene
import MuseScore.Playback

AppWindow {
    id: root
    flags: Qt.FramelessWindowHint
    title: WebShell.documentName + (WebShell.documentDirty ? " *" : "") + " — Pianist"

    InteractiveProvider {
        id: interactiveProvider
        topParent: root
        onRequestedDockPage: function(uri, params) {
            Qt.callLater(function() {
                interactiveProvider.onPageOpened()
                root.opacity = 1.0
            })
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 28
            color: ui.theme.backgroundPrimaryColor
            AppMenuBar { anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter }
        }
        SeparatorLine { Layout.fillWidth: true }
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 44
            color: ui.theme.backgroundPrimaryColor
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 8
                spacing: 6
                Item {
                    Layout.preferredWidth: 96
                    visible: root.width >= 900
                    Layout.fillHeight: true
                    StyledTextLabel {
                        anchors.centerIn: parent
                        text: qsTrc("appshell", "Score")
                        font.bold: true
                    }
                    Rectangle {
                        anchors.bottom: parent.bottom
                        width: parent.width; height: 2
                        color: ui.theme.accentColor
                    }
                }
                FlatButton {
                    icon: IconCode.NEW_FILE; transparent: true
                    accessible.name: "New score"
                    onClicked: WebShell.requestFileAction("new")
                }
                FlatButton {
                    icon: IconCode.OPEN_FILE; transparent: true
                    accessible.name: "Open score"
                    onClicked: WebShell.requestFileAction("open")
                }
                FlatButton {
                    icon: IconCode.SAVE; transparent: true
                    accessible.name: "Save score"
                    onClicked: WebShell.requestFileAction("save")
                }
                Item { Layout.fillWidth: true }
                Item {
                    Layout.preferredWidth: notationTools.width
                    Layout.preferredHeight: 32
                    visible: root.width >= 1100
                    NotationToolBar { id: notationTools }
                }
                SeparatorLine { orientation: Qt.Vertical; Layout.preferredHeight: 26 }
                Item {
                    visible: WebShell.playbackVisible
                    Layout.preferredWidth: playbackTools.width
                    Layout.preferredHeight: 32
                    PlaybackToolBar { id: playbackTools }
                }
                SeparatorLine { orientation: Qt.Vertical; Layout.preferredHeight: 26 }
                Item {
                    Layout.preferredWidth: undoTools.width
                    Layout.preferredHeight: 32
                    UndoRedoToolBar { id: undoTools }
                }
            }
        }
        SeparatorLine { Layout.fillWidth: true }
        NotationFrame { Layout.fillWidth: true; Layout.fillHeight: true }
        SeparatorLine { Layout.fillWidth: true; visible: WebShell.statusBarVisible }
        WebStatusBar {
            Layout.fillWidth: true
            Layout.preferredHeight: 32
            visible: WebShell.statusBarVisible
        }
    }
}
