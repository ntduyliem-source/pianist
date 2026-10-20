// SPDX-License-Identifier: GPL-3.0-only
// Bootstrap follows MuseScore ConsoleApp's module lifecycle and webmscore's
// independent QGuiApplication. Rendering is the existing WebApi implementation.
#include <QGuiApplication>
#include <QtPlugin>
#include <emscripten.h>
#include <emscripten/val.h>
#include "global/internal/baseapplication.h"
#include "global/globalmodule.h"
#include "draw/drawmodule.h"
#include "actions/actionsmodule.h"
#include "mpe/mpemodule.h"
#include "context/contextmodule.h"
#include "engraving/engravingmodule.h"
#include "notation/notationmodule.h"
#include "project/projectmodule.h"
#include "importexport/musicxml/musicxmlmodule.h"
#include "importexport/imagesexport/imagesexportmodule.h"
#include "playback/internal/playbackconfiguration.h"
#include "web/appjs/webapi.h"

Q_IMPORT_PLUGIN(PianistOffscreenPlugin)

class RendererApplication final : public muse::BaseApplication
{
public:
    RendererApplication() : BaseApplication(muse::modularity::globalCtx()) { setRunMode(RunMode::ConsoleApp); }
    void setup() override {}
    muse::modularity::ContextPtr setupNewContext() override { return nullptr; }
    int contextCount() const override { return 1; }
    std::vector<muse::modularity::ContextPtr> contexts() const override { return {iocContext()}; }
};

extern "C" EMSCRIPTEN_KEEPALIVE
bool preparePracticeSnapshot(const void* source, unsigned len, const char* filename)
{
    return filename && mu::appjs::WebApi::instance()->prepareSnapshot(source, len, filename);
}

int main(int argc, char** argv)
{
    // Qt 6.10.2 QWasmTimer calls window.setTimeout/clearTimeout. Expose only
    // these Worker-native functions, not a DOM/window implementation.
    // qtbase/src/corelib/platform/wasm/qwasmsuspendresumecontrol.cpp:239-257
    EM_ASM({
        globalThis.window = Object.freeze({
            setTimeout: globalThis.setTimeout.bind(globalThis),
            clearTimeout: globalThis.clearTimeout.bind(globalThis)
        });
    });
    qputenv("QT_QPA_PLATFORM", "pianist-offscreen");
    qputenv("QT_QPA_FONTDIR", "/fonts");
    new QGuiApplication(argc, argv);
    QCoreApplication::setApplicationName("PianistRenderer");
    static auto app = std::make_shared<RendererApplication>();
    static std::vector<muse::modularity::IModuleSetup*> modules {
        new muse::GlobalModule(), new muse::actions::ActionsModule(), new muse::draw::DrawModule(),
        new muse::mpe::MpeModule(), new mu::context::ContextModule(), new mu::engraving::EngravingModule(),
        new mu::notation::NotationModule(), new mu::project::ProjectModule(),
        new mu::iex::musicxml::MusicXmlModule(), new mu::iex::imagesexport::ImagesExportModule()
    };
    for (auto* m : modules) { m->setApplication(app); m->registerResources(); }
    for (auto* m : modules) { m->registerExports(); }
    // NotationProject imports require playback defaults. Reuse the real
    // configuration without starting PlaybackController or an audio device.
    static auto playbackConfig = std::make_shared<mu::playback::PlaybackConfiguration>(app->iocContext());
    app->ioc()->registerExport<mu::playback::IPlaybackConfiguration>("renderer", playbackConfig);
    for (auto* m : modules) { m->resolveImports(); }
    for (auto* m : modules) { m->onPreInit(app->runMode()); }
    playbackConfig->init();
    for (auto* m : modules) { m->onInit(app->runMode()); }
    for (auto* m : modules) { m->onAllInited(app->runMode()); }
    mu::appjs::WebApi::instance(app->iocContext());
    emscripten::val::module_property("onRendererReady")();
    return 0; // Emscripten keeps the runtime alive; Worker RPC owns its lifetime.
}
