/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-CLA-applies
 *
 * MuseScore
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
#include "font.h"
#include "global/realfn.h"

#ifndef NO_QT_SUPPORT
#include <QFontDatabase>
#ifdef Q_OS_WASM
#include <QSet>
#endif
#endif

using namespace muse;
using namespace muse::draw;

bool Font::g_disableFontMerging = false;

Font::Font(const FontFamily& family, Type type)
    : m_family(family), m_type(type)
{
}

bool Font::operator ==(const Font& other) const
{
    //! NOTE At the moment, the type is entered for information,
    //! its correct installation is not guaranteed,
    //! so we do not take it when comparing it yet
    // && m_type == other.m_type

    return m_family == other.m_family
           && RealIsEqual(m_pointSizeF, other.m_pointSizeF)
           && m_weight == other.m_weight
           && m_style == other.m_style
           && m_noFontMerging == other.m_noFontMerging
           && m_hinting == other.m_hinting;
}

void Font::setFamily(const FontFamily& family, Type type)
{
    m_family = family;
    m_type = type;
}

Font::FontFamily Font::family() const
{
    return m_family;
}

Font::Type Font::type() const
{
    return m_type;
}

double Font::pointSizeF() const
{
    return m_pointSizeF;
}

void Font::setPointSizeF(double s)
{
    m_pointSizeF = s;
    m_pixelSize = -1;
}

int Font::pixelSize() const
{
    return m_pixelSize;
}

void Font::setPixelSize(int s)
{
    m_pixelSize = s;
    m_pointSizeF = -1.0;
}

Font::Weight Font::weight() const
{
    return m_weight;
}

void Font::setWeight(Weight w)
{
    m_weight = w;
}

bool Font::bold() const
{
    return m_style.testFlag(Style::Bold);
}

void Font::setBold(bool arg)
{
    m_style.setFlag(Style::Bold, arg);
}

bool Font::italic() const
{
    return m_style.testFlag(Style::Italic);
}

void Font::setItalic(bool arg)
{
    m_style.setFlag(Style::Italic, arg);
}

bool Font::underline() const
{
    return m_style.testFlag(Style::Underline);
}

void Font::setUnderline(bool arg)
{
    m_style.setFlag(Style::Underline, arg);
}

bool Font::strike() const
{
    return m_style.testFlag(Style::Strike);
}

void Font::setStrike(bool arg)
{
    m_style.setFlag(Style::Strike, arg);
}

void Font::setNoFontMerging(bool arg)
{
    m_noFontMerging = arg;
}

bool Font::noFontMerging() const
{
    if (g_disableFontMerging) {
        return true;
    }
    return m_noFontMerging;
}

Font::Hinting Font::hinting() const
{
    return m_hinting;
}

void Font::setHinting(Hinting hinting)
{
    m_hinting = hinting;
}

#ifndef NO_QT_SUPPORT
#ifdef Q_OS_WASM
static QSet<QString> s_outlineFamilies;
#endif

int Font::addApplicationFont(const QString& fileName)
{
    const int id = QFontDatabase::addApplicationFont(fileName);
#ifdef Q_OS_WASM
    for (const QString& family : QFontDatabase::applicationFontFamilies(id)) {
        s_outlineFamilies.insert(family.toCaseFolded());
    }
#endif
    return id;
}

QFont Font::toQFont() const
{
    QFont qf(family().id());
#ifdef Q_OS_WASM
    // Qt/WASM advertises browser families (e.g. Times New Roman, Calibri)
    // without usable native glyph outlines. Both measurement and drawing must
    // select actual registered font data, not mix browser metrics and fallback
    // paths. Keep the original score family untouched for desktop/export.
    QString resolved = qf.family();
    if (!s_outlineFamilies.contains(resolved.toCaseFolded())) {
        QStringList candidates = QFont::substitutes(resolved);
        candidates << (type() == Type::MusicSymbol ? QStringLiteral("Bravura")
                       : type() == Type::MusicSymbolText ? QStringLiteral("Bravura Text")
                       : QStringLiteral("FreeSerif"));
        for (const QString& candidate : candidates) {
            if (s_outlineFamilies.contains(candidate.toCaseFolded())) {
                resolved = candidate;
                break;
            }
        }
    }
    // Explicit bundled fallbacks also cover Vietnamese/CJK in partial families
    // such as Edwin, before Qt attempts browser-only system fallback.
    QStringList families { resolved };
    for (const QString& fallback : { QStringLiteral("FreeSerif"), QStringLiteral("Noto Sans CJK SC") }) {
        if (s_outlineFamilies.contains(fallback.toCaseFolded()) && !families.contains(fallback)) {
            families << fallback;
        }
    }
    qf.setFamilies(families);
#endif

    if (pointSizeF() > 0) {
        qf.setPointSizeF(pointSizeF());
    } else if (pixelSize() > 0) {
        qf.setPixelSize(pixelSize());
    }
    qf.setWeight(static_cast<QFont::Weight>(weight()));
    qf.setBold(bold());
    qf.setItalic(italic());
    qf.setUnderline(underline());
    qf.setStrikeOut(strike());
    if (noFontMerging()) {
        qf.setStyleStrategy(QFont::NoFontMerging);
    }
    qf.setStyleStrategy(QFont::PreferTypoLineMetrics);
    qf.setHintingPreference(static_cast<QFont::HintingPreference>(hinting()));

    return qf;
}

Font Font::fromQFont(const QFont& qf, Font::Type type)
{
    Font f(String::fromQString(qf.family()), type);
    if (qf.pointSizeF() > 0) {
        f.setPointSizeF(qf.pointSizeF());
    } else if (qf.pixelSize() > 0) {
        f.setPixelSize(qf.pixelSize());
    }
    f.setWeight(static_cast<Font::Weight>(qf.weight()));
    f.setBold(qf.bold());
    f.setItalic(qf.italic());
    f.setUnderline(qf.underline());
    f.setStrike(qf.strikeOut());
    if (qf.styleStrategy() == QFont::NoFontMerging) {
        f.setNoFontMerging(true);
    }
    f.setHinting(static_cast<Font::Hinting>(qf.hintingPreference()));
    return f;
}

#endif
