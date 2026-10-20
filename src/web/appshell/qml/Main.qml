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
    readonly property bool compact: width < 900
    readonly property bool shortViewport: height < 360

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
            Layout.preferredHeight: root.compact && !root.shortViewport ? 44 : 28
            color: ui.theme.backgroundPrimaryColor
            Flickable {
                anchors.fill: parent
                contentWidth: appMenu.width
                contentHeight: height
                flickableDirection: Flickable.HorizontalFlick
                clip: true
                AppMenuBar {
                    id: appMenu
                    anchors.verticalCenter: parent.verticalCenter
                    compact: root.compact && !root.shortViewport
                }
            }
        }
        SeparatorLine { Layout.fillWidth: true }
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 44
            visible: !root.shortViewport
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
                    visible: !root.compact
                    icon: IconCode.NEW_FILE; transparent: true
                    accessible.name: "New score"
                    onClicked: WebShell.requestFileAction("new")
                }
                FlatButton {
                    visible: !root.compact
                    icon: IconCode.OPEN_FILE; transparent: true
                    accessible.name: "Open score"
                    onClicked: WebShell.requestFileAction("open")
                }
                FlatButton {
                    visible: !root.compact
                    icon: IconCode.SAVE; transparent: true
                    accessible.name: "Save score"
                    onClicked: WebShell.requestFileAction("save")
                }
                FlatButton {
                    visible: root.compact
                    text: "Palettes"
                    height: 44
                    accessible.name: "Open palettes"
                    onClicked: WebShell.sidebarVisible && WebShell.sidebarTab === 0 ? WebShell.hideSidebar() : WebShell.selectSidebarTab(0)
                }
                FlatButton {
                    visible: root.compact
                    text: "Properties"
                    height: 44
                    accessible.name: "Open properties"
                    onClicked: WebShell.sidebarVisible && WebShell.sidebarTab === 2 ? WebShell.hideSidebar() : WebShell.selectSidebarTab(2)
                }
                Item { Layout.fillWidth: true }
                Item {
                    Layout.preferredWidth: notationTools.width
                    Layout.preferredHeight: 32
                    visible: root.width >= 1100
                    NotationToolBar { id: notationTools }
                }
                SeparatorLine { visible: !root.compact; orientation: Qt.Vertical; Layout.preferredHeight: 26 }
                Item {
                    visible: WebShell.playbackVisible && !root.compact
                    Layout.preferredWidth: playbackTools.width
                    Layout.preferredHeight: 32
                    PlaybackToolBar { id: playbackTools }
                }
                SeparatorLine { visible: !root.compact; orientation: Qt.Vertical; Layout.preferredHeight: 26 }
                Item {
                    Layout.preferredWidth: undoTools.width
                    Layout.preferredHeight: 32
                    UndoRedoToolBar { id: undoTools }
                }
            }
        }
        SeparatorLine { Layout.fillWidth: true; visible: !root.shortViewport }
        NotationFrame { Layout.fillWidth: true; Layout.fillHeight: true; compact: root.compact }
        SeparatorLine { Layout.fillWidth: true; visible: WebShell.statusBarVisible }
        WebStatusBar {
            Layout.fillWidth: true
            Layout.preferredHeight: root.compact && !root.shortViewport ? 44 : 32
            compact: root.compact
            visible: WebShell.statusBarVisible
        }
    }
}
