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
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Muse.Ui
import Muse.UiComponents
import MuseScore.AppShell
import MuseScore.NotationScene
import MuseScore.Palette
import MuseScore.InstrumentsScene
import MuseScore.Inspector
import MuseScore.Playback

ColumnLayout {
    id: root
    spacing: 0
    Item {
        Layout.fillWidth: true
        Layout.preferredHeight: 40
        visible: WebShell.noteInputVisible
        clip: true
        NoteInputBar { maximumWidth: parent.width; maximumHeight: parent.height }
    }
    SeparatorLine { Layout.fillWidth: true; visible: WebShell.noteInputVisible }

    SplitView {
        Layout.fillWidth: true
        Layout.fillHeight: true
        orientation: Qt.Horizontal
        handle: Rectangle { implicitWidth: 1; color: ui.theme.strokeColor }
        Item {
            id: sidebar
            visible: WebShell.sidebarVisible
            SplitView.preferredWidth: 300
            SplitView.minimumWidth: 280
            SplitView.maximumWidth: 440
            StyledTabBar {
                id: bar
                anchors.left: parent.left
                anchors.right: closeSidebar.left
                height: 36
                currentIndex: WebShell.sidebarTab
                onCurrentIndexChanged: {
                    if (currentIndex !== WebShell.sidebarTab) WebShell.selectSidebarTab(currentIndex)
                }
                StyledTabButton { text: qsTrc("appshell", "Palettes") }
                StyledTabButton { text: qsTrc("appshell", "Layout") }
                StyledTabButton { text: qsTrc("appshell", "Properties") }
            }
            FlatButton {
                id: closeSidebar
                anchors.right: parent.right
                anchors.top: parent.top
                width: 24; height: 34
                icon: IconCode.CLOSE_X
                transparent: true
                accessible.name: "Close panel"
                onClicked: WebShell.hideSidebar()
            }
            StackLayout {
                anchors.top: bar.bottom
                anchors.bottom: parent.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.topMargin: 4
                currentIndex: WebShell.sidebarTab
                PalettesPanel { }
                LayoutPanel { }
                InspectorForm { notationView: notationView.paintView }
            }
        }
        SplitView {
            SplitView.fillWidth: true
            SplitView.fillHeight: true
            orientation: Qt.Vertical
            handle: Rectangle { implicitHeight: 1; color: ui.theme.strokeColor }
            NotationView {
                id: notationView
                name: "MainNotationView"
                SplitView.fillWidth: true
                SplitView.fillHeight: true
                isNavigatorVisible: WebShell.navigatorVisible
                isBraillePanelVisible: false
                isMainView: true
            }
            Loader {
                active: WebShell.mixerVisible
                visible: active
                SplitView.preferredHeight: 260
                SplitView.minimumHeight: 150
                sourceComponent: MixerPanel { }
            }
            Loader {
                active: WebShell.pianoVisible
                visible: active
                SplitView.preferredHeight: 160
                SplitView.minimumHeight: 100
                sourceComponent: PianoKeyboardPanel { }
            }
        }
    }
}
