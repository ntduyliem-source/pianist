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
    property bool compact: false
    onCompactChanged: { if (compact) WebShell.hideSidebar() }
    Component.onCompleted: { if (compact) WebShell.hideSidebar() }
    Flickable {
        Layout.fillWidth: true
        Layout.preferredHeight: root.compact && root.height > 240 ? 48 : 40
        visible: WebShell.noteInputVisible
        clip: true
        contentWidth: noteInput.width
        contentHeight: height
        flickableDirection: Flickable.HorizontalFlick
        ScrollBar.horizontal: ScrollBar { }
        NoteInputBar {
            id: noteInput
            anchors.verticalCenter: parent.verticalCenter
            maximumWidth: Math.max(root.width, 1200)
            maximumHeight: 40
            floating: true
        }
    }
    SeparatorLine { Layout.fillWidth: true; visible: WebShell.noteInputVisible }

    Item {
        id: content
        Layout.fillWidth: true
        Layout.fillHeight: true
        Rectangle {
            anchors.fill: parent
            z: 1
            visible: root.compact && WebShell.sidebarVisible
            color: "#55000000"
            MouseArea { anchors.fill: parent; onClicked: WebShell.hideSidebar() }
        }
        Rectangle {
            id: sidebar
            z: 2
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            width: Math.min(320, content.width)
            color: ui.theme.backgroundPrimaryColor
            visible: WebShell.sidebarVisible
            StyledTabBar {
                id: bar
                anchors.left: parent.left
                anchors.right: closeSidebar.left
                height: root.compact ? 44 : 36
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
                width: 44; height: 44
                icon: IconCode.CLOSE_X_ROUNDED
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
            anchors.fill: parent
            anchors.leftMargin: !root.compact && WebShell.sidebarVisible ? sidebar.width : 0
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
                SplitView.preferredHeight: Math.min(260, content.height / 2)
                SplitView.minimumHeight: 80
                sourceComponent: MixerPanel { }
            }
            Loader {
                active: WebShell.pianoVisible
                visible: active
                SplitView.preferredHeight: Math.min(160, content.height / 2)
                SplitView.minimumHeight: 60
                sourceComponent: PianoKeyboardPanel { }
            }
        }
    }
}
