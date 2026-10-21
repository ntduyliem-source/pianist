"""Exact non-overlapping source regions for monophonic upstream models.

An overlap elsewhere in a voice must not hide its monophonic passages. These
are model-input regions, not phrase boundaries or simplified arrangements.
Candidate selection always reads the original, unfiltered source events.
"""
from curriculum_fragments import q


def monophonic_regions(index, lid):
    events = index.by_line[lid]
    notes = [e for e in events if e['kind'] == 'note']
    excluded = set(); cluster = []; finish = None
    for event in notes:
        start, end = q(event['onset']), q(event['onset']) + q(event['duration'])
        if cluster and start >= finish:
            if len(cluster) > 1: excluded.update(e['id'] for e in cluster)
            cluster = []
        cluster.append(event); finish = max(finish, end) if len(cluster) > 1 else end
        if end <= start: excluded.add(event['id'])
    if len(cluster) > 1: excluded.update(e['id'] for e in cluster)
    # A tie touching an excluded overlap cannot become a new attack/partial hold.
    queue = list(excluded)
    while queue:
        event = index.events[queue.pop()]
        for key in ('tieFrom', 'tieTo'):
            other = event.get(key)
            if other and other not in excluded:
                excluded.add(other); queue.append(other)
    groups = []; group = []
    for event in events:
        if event['id'] in excluded:
            if any(e['kind'] == 'note' for e in group): groups.append(group)
            group = []
        else: group.append(event)
    if any(e['kind'] == 'note' for e in group): groups.append(group)
    return groups, sorted(excluded)
