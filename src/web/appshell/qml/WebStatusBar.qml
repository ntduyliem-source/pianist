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

Rectangle {
    property bool compact: false
    id: root
    color: ui.theme.backgroundPrimaryColor
    NotationStatusBarModel { id: model }
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 8
        spacing: 8
        StyledTextLabel {
            Layout.fillWidth: true
            horizontalAlignment: Text.AlignLeft
            elide: Text.ElideRight
            text: model.accessibilityInfo
        }
        ConcertPitchControl {
            visible: !root.compact
            text: model.concertPitchItem.title
            icon: model.concertPitchItem.icon
            checked: model.concertPitchItem.checked
            enabled: model.concertPitchItem.enabled
            onToggleConcertPitchRequested: model.toggleConcertPitch()
        }
        SeparatorLine { visible: !root.compact; orientation: Qt.Vertical; Layout.preferredHeight: 20 }
        ViewModeControl {
            visible: !root.compact
            currentViewMode: model.currentViewMode
            availableViewModeList: model.availableViewModeList
            onChangeCurrentViewModeRequested: function(code) { model.setCurrentViewMode(code) }
        }
        ZoomControl {
            enabled: model.zoomEnabled
            currentZoomPercentage: model.currentZoomPercentage
            minZoomPercentage: model.minZoomPercentage()
            maxZoomPercentage: model.maxZoomPercentage()
            availableZoomList: model.availableZoomList
            onChangeZoomPercentageRequested: function(value) { model.currentZoomPercentage = value }
            onChangeZoomRequested: function(code) { model.setCurrentZoom(code) }
            onZoomInRequested: model.zoomIn()
            onZoomOutRequested: model.zoomOut()
        }
    }
}
