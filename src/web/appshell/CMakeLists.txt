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

muse_create_module(appshell)

muse_module_add_qrc(appshell appshell.qrc)
add_qml_import_path(${CMAKE_CURRENT_LIST_DIR}/qml)

target_sources(appshell PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/appshellmodule.cpp
    ${CMAKE_CURRENT_LIST_DIR}/appshellmodule.h
    ${CMAKE_CURRENT_LIST_DIR}/iappshellconfiguration.h
    ${CMAKE_CURRENT_LIST_DIR}/appshelltypes.h
    ${CMAKE_CURRENT_LIST_DIR}/internal/applicationuiactions.cpp
    ${CMAKE_CURRENT_LIST_DIR}/internal/applicationuiactions.h
    ${PROJECT_SOURCE_DIR}/src/appshell/internal/appshellconfiguration.cpp
    ${PROJECT_SOURCE_DIR}/src/appshell/internal/appshellconfiguration.h
    ${CMAKE_CURRENT_LIST_DIR}/internal/applicationactioncontroller.cpp
    ${CMAKE_CURRENT_LIST_DIR}/internal/applicationactioncontroller.h
    ${CMAKE_CURRENT_LIST_DIR}/internal/istartupscenario.h
    ${CMAKE_CURRENT_LIST_DIR}/internal/startupscenario.cpp
    ${CMAKE_CURRENT_LIST_DIR}/internal/startupscenario.h
    ${CMAKE_CURRENT_LIST_DIR}/view/appmenumodel.cpp
    ${CMAKE_CURRENT_LIST_DIR}/view/appmenumodel.h
    ${CMAKE_CURRENT_LIST_DIR}/view/notationpagemodel.cpp
    ${CMAKE_CURRENT_LIST_DIR}/view/notationpagemodel.h
    ${CMAKE_CURRENT_LIST_DIR}/view/notationstatusbarmodel.cpp
    ${CMAKE_CURRENT_LIST_DIR}/view/notationstatusbarmodel.h
    ${CMAKE_CURRENT_LIST_DIR}/view/navigableappmenumodel.cpp
    ${CMAKE_CURRENT_LIST_DIR}/view/navigableappmenumodel.h
    )

target_link_libraries(appshell PRIVATE
    muse::ui
    muse::uicomponents
    Qt::Quick
    )

# we use QKeyMapper to fix https://github.com/musescore/MuseScore/issues/10181
find_package(Qt6 REQUIRED COMPONENTS GuiPrivate)
target_link_libraries(appshell PRIVATE Qt6::GuiPrivate)
