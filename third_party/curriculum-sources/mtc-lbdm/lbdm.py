from fractions import Fraction

def getOneDegreeChange(x1, x2, const_add=0.0):
    res = None
    x1 += const_add
    x2 += const_add
    if x1 == x2: return 0.0
    if (x1+x2) != 0 and x1 >= 0 and x2 >= 0:
        res = float(abs(x1-x2)) / float (x1 + x2)
    return res


def getDegreeChangeLBDMpitch(chromaticinterval, threshold=12, const_add=1):
    #for lbdm we need at least 3 notes
    if len(chromaticinterval) < 3:
        return [None] * len(chromaticinterval)
    # we need absolute values
    # and thr_int <= threshold
    # and shift such that chormaticinterval is interval FOLLOWING note
    thr_int = [min(threshold,abs(i)) for i in chromaticinterval[1:]] + [None] 
    pairs = zip(thr_int[:-1],thr_int[1:-1])
    rpitch = [None] + [getOneDegreeChange(x1, x2, const_add=const_add) for x1, x2 in pairs] + [None]
    return rpitch


def getDegreeChangeLBDMioi(ioi, threshold=4.0):
    #for lbdm we need at least 3 notes
    if len(ioi) < 3:
        return [None] * len(ioi)
    #We need IOI AFTER the note, and we need maximize the value
    thr_ioi = [min(threshold,i) for i in ioi[:-1]] + [None]
    pairs = zip(thr_ioi[:-1],thr_ioi[1:-1])
    rioi = [None] + [getOneDegreeChange(x1, x2) for x1, x2 in pairs ] + [None]
    return rioi


def getDegreeChangeLBDMrest(restduration_frac, threshold=4.0):
    #for lbdm we need at least 3 notes
    if len(restduration_frac) < 3:
        return [None] * len(restduration_frac)
    #need rest AFTER note, and apply threshold
    thr_rd = [min(threshold, float(Fraction(r))) if r is not None else 0.0 for r in restduration_frac[:-1]] + [None]
    pairs = zip(thr_rd[:-1], thr_rd[1:-1])
    rrest = [None] + [getOneDegreeChange(x1, x2) for x1, x2 in pairs] + [None]
    return rrest


def getBoundaryStrength(rs, intervals):
    #print(list(zip(rs, intervals)))
    pairs = zip(rs[1:-1], rs[2:-1], intervals[1:])
    strength = [ c * (r1 + r2) for r1, r2, c in pairs]
    #very shor melodies:
    if len(strength) == 0:
        return [None, None, None]
    #normalize
    maxspitch = max(strength)
    if maxspitch > 0:
        strength = [s / maxspitch for s in strength]
    #Add first and last
    strength = [None] + strength + [None, None]
    return strength


def getBoundaryStrengthPitch(rpitch, chromaticinterval, threshold=12):
    #for lbdm we need at least 3 notes
    if len(chromaticinterval) < 3:
        return [None] * len(chromaticinterval)
    # we need absolute values
    # and thr_int <= threshold
    # and shift such that chormaticinterval is interval FOLLOWING note
    thr_int = [min(threshold,abs(i)) for i in chromaticinterval[1:]] + [None] 
    return getBoundaryStrength(rpitch, thr_int)


def getBoundaryStrengthIOI(rioi, ioi, threshold=4.0):
    #for lbdm we need at least 3 notes
    if len(ioi) < 3:
        return [None] * len(ioi)
    #We need IOI AFTER the note, and we need maximize the value
    thr_ioi = [min(threshold,i) for i in ioi[:-1]] + [None]
    return getBoundaryStrength(rioi, thr_ioi)


def getBoundaryStrengthRest(rrest, restduration_frac, threshold=4.0):
    #for lbdm we need at least 3 notes
    if len(restduration_frac) < 3:
        return [None] * len(restduration_frac)
    #need rest AFTER note, and apply threshold
    thr_rd = [min(threshold, float(Fraction(r))) if r is not None else 0.0 for r in restduration_frac[:-1]] + [None]
    return getBoundaryStrength(rrest, thr_rd)


def getLocalBoundaryStrength(spitch, sioi, srest):
    #for lbdm we need at least 3 notes
    if len(spitch) < 3:
        return [None] * len(spitch)
    triplets = zip(spitch[1:-2], sioi[1:-2], srest[1:-2]) #remove None values at begin and end
    strength = [0.25*p + 0.5*i + 0.25*r for p, i, r in triplets]
    strength = [None] + strength + [None, None]
    return strength

