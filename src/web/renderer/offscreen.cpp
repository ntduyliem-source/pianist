// SPDX-License-Identifier: GPL-3.0-only
// Qt 6.10.2 QPA adapter for an isolated score-rendering Worker.
// Follows qtbase v6.10.2's minimal/offscreen integration: raster pixmaps,
// FreeType font database and a virtual screen. Uses Qt's WASM dispatcher.
// No notation, MIDI interpretation or grading is implemented here.
#include <qpa/qplatformintegration.h>
#include <qpa/qplatformintegrationplugin.h>
#include <qpa/qplatformscreen.h>
#include <qpa/qwindowsysteminterface.h>
#include <QtGui/private/qfreetypefontdatabase_p.h>
#include <QtGui/private/qpixmap_raster_p.h>
#include <QtCore/private/qeventdispatcher_wasm_p.h>

class RendererScreen final : public QPlatformScreen
{
public:
    QRect geometry() const override { return {0, 0, 1920, 1080}; }
    int depth() const override { return 32; }
    QImage::Format format() const override { return QImage::Format_ARGB32_Premultiplied; }
    QDpi logicalDpi() const override { return {96, 96}; }
};

class RendererIntegration final : public QPlatformIntegration
{
    mutable QFreeTypeFontDatabase m_fonts;
public:
    RendererIntegration() { QWindowSystemInterface::handleScreenAdded(new RendererScreen()); }
    QPlatformFontDatabase* fontDatabase() const override { return &m_fonts; }
    QAbstractEventDispatcher* createEventDispatcher() const override { return new QEventDispatcherWasm(); }
    QPlatformPixmap* createPlatformPixmap(QPlatformPixmap::PixelType type) const override { return new QRasterPlatformPixmap(type); }
    QPlatformWindow* createPlatformWindow(QWindow*) const override { return nullptr; }
    QPlatformBackingStore* createPlatformBackingStore(QWindow*) const override { return nullptr; }
    bool hasCapability(Capability cap) const override {
        return cap == RhiBasedRendering ? false : QPlatformIntegration::hasCapability(cap);
    }
};

class PianistOffscreenPlugin final : public QPlatformIntegrationPlugin
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID QPlatformIntegrationFactoryInterface_iid FILE "offscreen.json")
public:
    QPlatformIntegration* create(const QString& name, const QStringList&) override {
        return name == QStringLiteral("pianist-offscreen") ? new RendererIntegration() : nullptr;
    }
};

#include "offscreen.moc"
