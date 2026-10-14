#!/usr/bin/env python3
"""RESEARCH ONLY. Extract HitMaster's published All-Day board per date from a dump of
slate_snapshots (national, balanced, allday; deleted_at IGNORED — STAT-01 G4 rule:
the board of record is the LATEST snapshot whose updated_at_et is BEFORE the 10:00 ET
cutoff; a key with only post-cutoff snapshots has no board). Window is EDT (offset 4).
Usage: hitmaster_boards.py snaps_allday.json > boards.json
"""
import json, re, sys, datetime as dt
snaps = json.load(open(sys.argv[1])); by = {}
for s in snaps:
    d = s['slate_date']; ts = s.get('updated_at_et')
    if not ts: continue
    cutoff = dt.datetime.fromisoformat(d + 'T14:00:00+00:00')         # 10:00 ET = 14:00 UTC in EDT
    t = dt.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    if t >= cutoff: continue
    if d not in by or t > by[d][0]: by[d] = (t, s)
out = {}
for d, (t, s) in sorted(by.items()):
    picks = []
    for p in s['top_k_straights_json'] or []:
        combo = str(p.get('combo', '')); order = str(p.get('bestOrder') or combo)
        if not re.fullmatch(r'\d{3}', combo): continue
        picks.append({'set': ''.join(sorted(combo)), 'order': order})
    out[d] = picks
json.dump(out, sys.stdout, indent=0)
print(f'\n# {len(out)} boards', file=sys.stderr)
