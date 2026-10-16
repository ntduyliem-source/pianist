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
#include <algorithm>
#include <cctype>
#include <map>
#include <set>

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
        }

        m_currentProject = globalContext()->currentProject();

        if (m_currentProject) {
            m_currentProject->saveComplited().onReceive(this, [this](const muse::io::path_t& path, project::SaveMode mode) {
                onProjectSaved(path, mode);
            });
        }
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
    globalContext()->setCurrentProject(project);
    interactive()->open("musescore://notation");
    return true;
}

bool WebApi::saveProject()
{
    if (!m_currentProject) {
        return false;
    }
    return m_currentProject->save("/mu/temp/pianist.mscz", project::SaveMode::SaveAs, false).success();
}

bool WebApi::exportScore(const std::string& format)
{
    if (!m_currentProject || (format != "mxl" && format != "musicxml")) {
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
    callJsWithBytes(format == "mxl" ? "onMxlExported" : "onXmlExported", buffer.data().constData(), buffer.data().size());
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
    if (!m_currentProject || command == actions.end()) {
        return false;
    }
    const auto registered = dispatcher()->actionList();
    if (std::find(registered.begin(), registered.end(), command->second) == registered.end()) {
        return false;
    }
    dispatcher()->dispatch(command->second);
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

void WebApi::onProjectSaved(const muse::io::path_t& path, mu::project::SaveMode)
{
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
