// SPDX-License-Identifier: GPL-3.0-only
// Immutable practice data and drawings from the same, currently edited score.
#include "webapi.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <emscripten/val.h>
#include <algorithm>
#include <map>
#include <set>

#include "global/io/buffer.h"
#include "engraving/dom/articulation.h"
#include "engraving/dom/arpeggio.h"
#include "engraving/dom/chord.h"
#include "engraving/dom/keysig.h"
#include "engraving/dom/rest.h"
#include "engraving/dom/measure.h"
#include "engraving/dom/note.h"
#include "engraving/dom/page.h"
#include "engraving/dom/part.h"
#include "engraving/dom/pedal.h"
#include "engraving/compat/midi/compatmidirender.h"
#include "engraving/dom/repeatlist.h"
#include "engraving/dom/score.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/staff.h"
#include "engraving/dom/system.h"
#include "engraving/dom/tie.h"
#include "notation/inotationplayback.h"
#include "importexport/imagesexport/iimagesexportconfiguration.h"

using namespace mu;
using namespace mu::appjs;

static QJsonObject box(const muse::RectF& r)
{
    return {{"x", r.x()}, {"y", r.y()}, {"width", r.width()}, {"height", r.height()}};
}

bool WebApi::getSnapshot()
{
    return snapshotFor(m_currentProject, true, "onPracticeSnapshot");
}

bool WebApi::getScoreSemantics()
{
    return snapshotFor(m_currentProject, false, "onScoreSemantics");
}

bool WebApi::getPracticePlaybackNotes()
{
    if (!m_practiceActive || !m_currentProject || !m_auditionConfigured) { return false; }
    const auto playback = m_currentProject->masterNotation()->playback();
    auto* score = m_currentProject->masterNotation()->notation()->elements()->msScore();
    std::map<uintptr_t, QString> ids;
    std::map<uintptr_t, const engraving::Note*> sources;
    int measureIndex = 0;
    for (auto* measure = score->firstMeasure(); measure; measure = measure->nextMeasure(), ++measureIndex) {
        for (auto* segment = measure->first(); segment; segment = segment->next()) {
            if (!segment->isChordRestType()) { continue; }
            for (const auto* element : segment->elist()) {
                if (!element || !element->isChord()) { continue; }
                const auto* chord = engraving::toChord(element);
                int n = 0;
                for (const auto* note : chord->notes()) {
                    const auto key = reinterpret_cast<uintptr_t>(note);
                    ids[key] = QString("m%1-t%2-v%3-n%4").arg(measureIndex).arg(segment->tick().ticks()).arg(chord->track()).arg(n++);
                    sources[key] = note;
                }
            }
        }
    }
    QJsonArray events;
    for (const auto& track : playback->existingTrackIdSet()) {
        // Read the very same MPE events delivered to FluidSequencer. In
        // particular, do not substitute CompatMidiRender's different timings.
        for (const auto& entry : playback->trackPlaybackData(track).originEvents) {
            for (const auto& value : entry.second) {
                const auto* event = std::get_if<muse::mpe::NoteEvent>(&value);
                if (!event) { continue; }
                const auto& arrangement = event->arrangementCtx();
                const auto source = sources.find(arrangement.sourceId);
                if (source == sources.end() || !arrangement.hasStart()) { continue; }
                QJsonArray anchors;
                std::set<const engraving::Note*> visited;
                for (const auto* note = source->second; note && visited.insert(note).second;) {
                    const auto id = ids.find(reinterpret_cast<uintptr_t>(note));
                    if (id != ids.end()) { anchors.append(id->second); }
                    const auto* tie = note->tieFor();
                    note = tie && tie->playSpanner() ? tie->endNote() : nullptr;
                }
                const double end = arrangement.hasEnd()
                    ? double(arrangement.actualTimestamp + arrangement.actualDuration) / 1000.0
                    : double(playback->totalPlayTime()) * 1000.0;
                events.append(QJsonObject{{"anchors", anchors}, {"atMs", double(arrangement.actualTimestamp) / 1000.0},
                    {"endMs", end}, {"pitch", int(std::clamp(muse::mpe::ZERO_PITCH_LEVEL_MIDI_EQUIVALENT
                        + event->pitchCtx().nominalPitchLevel / float(muse::mpe::PITCH_LEVEL_STEP), 0.f, 127.f))}});
                if (events.size() > 200000) { return false; }
            }
        }
    }
    const QJsonObject result{{"source", "musescore-mpe"}, {"revision", int(m_auditionNotesRevision)}, {"events", events}};
    const auto callback = emscripten::val::module_property("onPracticePlaybackNotes");
    if (callback.isUndefined() || callback.isNull()) { return false; }
    callback(QJsonDocument(result).toJson(QJsonDocument::Compact).toStdString());
    return true;
}

bool WebApi::snapshotFor(const project::INotationProjectPtr& project, bool drawings, const char* callback)
{
    if (!project) { return false; }
    const auto notation = project->masterNotation()->notation();
    auto* score = notation->elements()->msScore();
    const auto svgWriter = writers()->writer("svg");
    if (!score || (drawings && (!svgWriter || score->pages().empty() || score->pages().size() > 40))) { return false; }

    QJsonArray pages, measures, staves, occurrences, performed, beats, pedals, keyReleases;
    QJsonArray rests, keys, slurs;
    std::map<const engraving::Note*, QString> noteIds;
    std::map<const engraving::Measure*, int> measureIds;
    std::map<const engraving::Note*, QJsonObject> notes;
    std::set<QString> warnings;
    auto imageConfig = muse::modularity::globalIoc()->resolve<iex::imagesexport::IImagesExportConfiguration>("appjs");
    const int trim = imageConfig ? imageConfig->trimMarginPixelSize() : -1;
    size_t svgBytes = 0;
    for (size_t p = 0; drawings && p < score->pages().size(); ++p) {
        muse::io::Buffer buffer;
        buffer.open(muse::io::IODevice::WriteOnly);
        project::INotationWriter::Options options;
        options[project::INotationWriter::OptionKey::PAGE_NUMBER] = muse::Val(static_cast<int>(p));
        if (!svgWriter->write(notation, buffer, options)) { return false; }
        svgBytes += buffer.data().size();
        if (svgBytes > 24 * 1024 * 1024) { return false; }
        const auto* page = score->pages()[p];
        const auto r = trim >= 0 ? page->tbbox().adjusted(-trim, -trim, trim, trim) : page->pageBoundingRect();
        pages.append(QJsonObject{{"index", static_cast<int>(p)}, {"width", r.width()}, {"height", r.height()},
                                 {"displayWidth", r.width() * 96.0 / engraving::DPI},
                                 {"offsetX", r.x()}, {"offsetY", r.y()},
                                 {"svg", QString::fromUtf8(buffer.data().constChar(), static_cast<int>(buffer.data().size()))}});
    }
    for (size_t s = 0; s < score->nstaves(); ++s) {
        auto* staff = score->staff(s);
        staves.append(QJsonObject{{"id", static_cast<int>(s)}, {"part", staff->part()->partName().toQString()},
                                  {"partId", QString::number(staff->part()->id().toUint64())}});
    }
    int measureIndex = 0;
    for (auto* measure = score->firstMeasure(); measure; measure = measure->nextMeasure(), ++measureIndex) {
        if (measureIndex >= 6000) { return false; }
        measureIds[measure] = measureIndex;
        const auto* system = measure->system();
        const int page = system && system->page() ? static_cast<int>(system->page()->pageNumber()) : -1;
        auto r = measure->pageBoundingRect();
        if (system) { const auto sr = system->pageBoundingRect(); r.setY(sr.y()); r.setHeight(sr.height()); }
        measures.append(QJsonObject{{"index", measureIndex}, {"label", measure->no() + (measure->irregular() ? 0 : 1)}, {"tick", measure->tick().ticks()},
                                    {"endTick", measure->endTick().ticks()}, {"page", page}, {"box", box(r)},
                                    {"numerator", measure->timesig().numerator()}, {"denominator", measure->timesig().denominator()}});
        for (auto* segment = measure->first(); segment; segment = segment->next()) {
            if (!drawings) {
                for (const auto* element : segment->elist()) {
                    if (!element) { continue; }
                    if (element->isRest()) {
                        const auto* rest = engraving::toRest(element);
                        rests.append(QJsonArray{segment->tick().ticks(), rest->actualTicks().ticks(),
                            static_cast<int>(rest->staffIdx()), static_cast<int>(rest->voice())});
                    } else if (element->isKeySig() && !element->generated()) {
                        const auto* key = engraving::toKeySig(element);
                        if (key->isCustom() || key->isAtonal()) { warnings.insert("custom-key"); }
                        keys.append(QJsonArray{segment->tick().ticks(), static_cast<int>(key->staffIdx()), static_cast<int>(key->key())});
                    }
                }
            }
            for (const auto* annotation : segment->annotations()) {
                if (annotation && annotation->isFermata()) { warnings.insert("fermata"); }
            }
            if (!segment->isChordRestType()) { continue; }
            for (const auto* element : segment->elist()) {
                if (!element || !element->isChord()) { continue; }
                const auto* chord = engraving::toChord(element);
                if (!chord->graceNotes().empty()) { warnings.insert("grace"); }
                if (chord->arpeggio()) { warnings.insert("arpeggio"); }
                QJsonArray articulations;
                for (const auto* articulation : chord->articulations()) {
                    if (articulation->isOrnament()) { warnings.insert("ornament"); }
                    articulations.append(articulation->articulationName().toQString());
                }
                int n = 0;
                for (const auto* note : chord->notes()) {
                    const auto id = QString("m%1-t%2-v%3-n%4").arg(measureIndex).arg(segment->tick().ticks()).arg(chord->track()).arg(n++);
                    noteIds[note] = id;
                    const auto pos = note->pagePos();
                    QJsonObject data{{"id", id}, {"pitch", note->ppitch()}, {"tick", segment->tick().ticks()},
                                     {"durationTicks", chord->actualTicks().ticks()}, {"measure", measureIndex},
                                     {"staff", static_cast<int>(chord->staffIdx())}, {"visualStaff", static_cast<int>(chord->vStaffIdx())},
                                     {"voice", static_cast<int>(chord->voice())}, {"track", static_cast<int>(chord->track())},
                                     {"page", page}, {"visible", note->visible()}, {"play", note->play()},
                                     {"articulations", articulations},
                                     {"box", box(muse::RectF(pos.x() - 2, pos.y() - note->headHeight() / 2 - 2,
                                                            note->headWidth() + 4, note->headHeight() + 4))}};
                    if (const auto* arpeggio = chord->arpeggio()) {
                        const auto type = arpeggio->arpeggioType();
                        if (type != engraving::ArpeggioType::BRACKET) {
                            data["arpeggio"] = type == engraving::ArpeggioType::DOWN || type == engraving::ArpeggioType::DOWN_STRAIGHT ? "down" : "up";
                            data["arpeggioGroup"] = QString("m%1-t%2-v%3").arg(measureIndex).arg(segment->tick().ticks()).arg(chord->track());
                        }
                    }
                    notes[note] = data;
                    if (!drawings) { notes[note]["spelling"] = note->tpc(); }
                    if (notes.size() > 50000) { return false; }
                }
            }
        }
    }
    QJsonArray anchors;
    for (auto& [note, data] : notes) {
        if (note->tieBack() && note->tieBack()->startNote()) {
            const auto it = noteIds.find(note->tieBack()->startNote());
            if (it != noteIds.end()) { data["tieBack"] = it->second; }
        }
        anchors.append(data);
    }
    // MuseScore expands repeats, voltas and jumps. Do not reimplement that interpreter in JS.
    const auto& repeats = score->repeatList(true);
    // R4 references use MuseScore's MIDI renderer, including its articulation
    // gate times and ties. No release percentage or grading rule lives here.
    engraving::EventsHolder midi;
    engraving::CompatMidiRendererInternal::Context midiContext;
    midiContext.harmonyChannelSetting = engraving::CompatMidiRendererInternal::HarmonyChannelSetting::DISABLED;
    engraving::CompatMidiRender::renderScore(score, midi, midiContext, true);
    for (size_t channel = 0; channel < midi.size(); ++channel) {
        std::map<std::pair<const engraving::Note*, int>, int> starts;
        for (const auto& [tick, event] : midi[channel]) {
            if (event.type() != engraving::ME_NOTEON || !event.note() || event.discard()) { continue; }
            const auto identity = std::make_pair(event.note(), static_cast<int>(event.pitch()));
            if (event.velo()) { starts[identity] = tick; continue; }
            const auto start = starts.find(identity);
            const auto anchor = noteIds.find(event.note());
            if (start != starts.end()) {
                if (anchor != noteIds.end() && tick > start->second) {
                    keyReleases.append(QJsonObject{{"anchor", anchor->second}, {"pitch", event.pitch()},
                        {"utick", start->second}, {"endUtick", tick},
                        {"atMs", repeats.utick2utime(start->second) * 1000},
                        {"endMs", repeats.utick2utime(tick) * 1000}});
                }
                starts.erase(start);
            }
            if (keyReleases.size() > 200000) { return false; }
        }
    }
    // Export notated pedal spans, with native repeat traversal and tempo below.
    // These are score instructions, not inferred pedal marks or acoustic decay.
    std::vector<const engraving::Spanner*> pedalSpans;
    for (const auto& entry : score->spannerMap().map()) {
        const auto* span = entry.second;
        if (!drawings && span->isSlur()) {
            slurs.append(QJsonArray{span->tick().ticks(), span->tick2().ticks(),
                static_cast<int>(span->track()), static_cast<int>(span->track2())});
        }
        if (span->isPedal() && span->staff()->isPrimaryStaff()) { pedalSpans.push_back(span); }
    }
    int occurrence = 0;
    for (const auto* repeat : repeats) {
        for (const auto* measure : repeat->measureList()) {
            if (occurrence > 12000 || performed.size() > 100000) { return false; }
            const int start = measure->tick().ticks();
            const int end = measure->endTick().ticks();
            const int shift = repeat->utick - repeat->tick;
            const double from = repeats.utick2utime(start + shift) * 1000;
            const double to = repeats.utick2utime(end + shift) * 1000;
            occurrences.append(QJsonObject{{"index", occurrence}, {"measure", measureIds[measure]},
                                           {"startMs", from}, {"endMs", to}, {"utick", start + shift}});
            for (size_t p = 0; p < pedalSpans.size(); ++p) {
                const auto* span = pedalSpans[p];
                const int a = std::max(start, span->tick().ticks());
                const int b = std::min(end, span->tick2().ticks());
                if (b <= a) { continue; }
                pedals.append(QJsonObject{{"id", static_cast<int>(p)}, {"occurrence", occurrence},
                    {"partId", QString::number(span->part()->id().toUint64())},
                    {"tick", a}, {"endTick", b}, {"atMs", repeats.utick2utime(a + shift) * 1000},
                    {"endMs", repeats.utick2utime(b + shift) * 1000}});
            }
            for (const int beatTicks : {240, 480, 720}) {
                for (int tick = start, beat = 0; tick < end; tick += beatTicks, ++beat) {
                    beats.append(QJsonObject{{"atMs", repeats.utick2utime(tick + shift) * 1000},
                                             {"accent", beat == 0}, {"occurrence", occurrence},
                                             {"beatQuarter", beatTicks / 480.0}});
                }
            }
            for (auto* segment = measure->first(); segment; segment = segment->next()) {
                if (!segment->isChordRestType()) { continue; }
                const int tick = segment->tick().ticks();
                for (const auto* element : segment->elist()) {
                    if (!element || !element->isChord()) { continue; }
                    const auto* chord = engraving::toChord(element);
                    const double onset = repeats.utick2utime(tick + shift) * 1000;
                    const int noteEnd = std::min(tick + chord->actualTicks().ticks(), end);
                    const double release = repeats.utick2utime(noteEnd + shift) * 1000;
                    for (const auto* note : chord->notes()) {
                        if (!note->play()) { continue; }
                        performed.append(QJsonObject{{"anchor", noteIds[note]}, {"occurrence", occurrence},
                                                     {"atMs", onset}, {"endMs", release}});
                    }
                }
            }
            ++occurrence;
        }
    }
    QJsonArray warningList;
    for (const auto& warning : warnings) { warningList.append(warning); }
    QJsonObject result{{"schemaVersion", 1}, {"revision", static_cast<int>(m_revision)},
                             {"title", notation->workTitle()}, {"baseQuarterBpm", score->tempo(engraving::Fraction(0, 1)).val * 60},
                             {"durationMs", repeats.utick2utime(repeats.ticks()) * 1000}, {"staves", staves},
                             {"pages", pages}, {"measures", measures}, {"anchors", anchors}, {"occurrences", occurrences},
                             {"performed", performed}, {"beats", beats}, {"warnings", warningList},
                             {"durationReference", "musescore-midi"}, {"keyReleases", keyReleases}, {"pedals", pedals}};
    if (!drawings) { result["rests"] = rests; result["keys"] = keys; result["slurs"] = slurs; }
    const auto json = QJsonDocument(result).toJson(QJsonDocument::Compact);
    emscripten::val::module_property(callback)(json.toStdString());
    return true;
}
