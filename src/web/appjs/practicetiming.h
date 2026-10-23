// SPDX-License-Identifier: GPL-3.0-only
#pragma once

#include <algorithm>
#include <set>
#include <vector>

#include "engraving/dom/measure.h"
#include "engraving/dom/repeatlist.h"
#include "engraving/dom/score.h"
#include "engraving/dom/tempo.h"

namespace mu::appjs {
struct PracticeTimePoint {
    int occurrence = 0;
    int tick = 0;
    int utick = 0;
    double atMs = 0.0;
};

// Read the native piecewise tempo map, including BOTH ends of fixed pauses.
// No BPM multiplication is used: RepeatList::utick2utime owns unfolded times.
// Section-break pauses are included only on the final visit, exactly as in
// RepeatList::updateTempo (repeatlist.cpp).
inline std::vector<PracticeTimePoint> practiceTimePoints(engraving::Score* score)
{
    std::vector<PracticeTimePoint> result;
    if (!score) { return result; }
    const auto& repeats = score->repeatList();
    const auto* tempos = score->tempomap();
    std::set<int> sectionBreakEnds;
    for (const auto* repeat : repeats) {
        if (repeat->pause > 0.0) { sectionBreakEnds.insert(repeat->endTick()); }
    }
    int occurrence = 0;
    for (const auto* repeat : repeats) {
        for (const auto* measure : repeat->measureList()) {
            const int start = measure->tick().ticks();
            const int end = measure->endTick().ticks();
            std::set<int> ticks { start, end };
            for (auto it = tempos->upper_bound(start); it != tempos->end() && it->first <= end; ++it) {
                ticks.insert(it->first);
            }
            for (const int tick : ticks) {
                const int utick = repeat->utick + tick - repeat->tick;
                const double atMs = score->utick2utime(utick) * 1000.0;
                double pauseMs = tempos->pauseSecs(tick) * 1000.0;
                if (tick == repeat->endTick() && repeat->pause == 0.0 && sectionBreakEnds.count(tick)) {
                    pauseMs = 0.0;
                }
                // A pause at a measure's start was already emitted at the end
                // of the preceding measure. Do not move the table backwards.
                if (tick > start && pauseMs > 0.0) {
                    result.push_back({ occurrence, tick, utick, atMs - pauseMs });
                }
                result.push_back({ occurrence, tick, utick, atMs });
            }
            ++occurrence;
        }
    }
    return result;
}
}
