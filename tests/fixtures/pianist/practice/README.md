# Independent musical expectations (CC0 fixture)

`tempo-repeat-tie.musicxml` is an original 3-measure piano test:

- 1/8 pickup in 2/4 at quarter=80, then quarter=120.
- Three eighth-note triplets occupy one quarter note.
- Repeat measures 1–2 twice, following the pickup once (5 performed measures).
- G4 is tied across the measure boundary: one attack per repeat.
- D4 occurs in both hands at the same onset: one physical target, two anchors.

Expected full plan at quarter=80 (practice speed ratio 1 relative to initial tempo):
16 physical attacks, duration 4,375 ms; 0/375/1,375/2,375/3,375 ms measure starts.
Triplet onsets in the first repeat: 375, 541⅔, 708⅓ ms.
The first G4 attack starts at 875 ms and continues until 1,875 ms.
Practicing only the final written measure starts G4 with a new attack.

These expectations were calculated from written durations/tempo, independently
of the bridge and matcher. The original M0 fixture remains the baseline for
import/edit/save/export round trips.
