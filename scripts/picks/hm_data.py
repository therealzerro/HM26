"""Shared data pull for scripts/picks. Reads histories (since 2026-04-01) and
balanced, live slate_snapshots (since 2026-04-18) straight from Supabase REST.
Key: SUPABASE_SERVICE_ROLE_KEY from .env.backtest if present, else the anon key
from .env (histories + snapshots are readable anon). Caches to --cache dir."""
import json, os, re, sys, time, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def _env(path):
    out = {}
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r'^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$', line)
            if m: out[m.group(1)] = m.group(2).strip('"').strip("'")
    return out

def creds():
    b = _env(ROOT / '.env.backtest'); e = _env(ROOT / '.env')
    url = b.get('SUPABASE_URL') or e.get('EXPO_PUBLIC_SUPABASE_URL')
    key = b.get('SUPABASE_SERVICE_ROLE_KEY') or e.get('EXPO_PUBLIC_SUPABASE_ANON_KEY')
    if not url or not key: sys.exit('no supabase creds in .env.backtest / .env')
    return url.rstrip('/'), key

def get_all(path):
    url, key = creds(); rows = []; off = 0
    while True:
        req = urllib.request.Request(f"{url}{path}&limit=1000&offset={off}",
                                     headers={'apikey': key, 'Authorization': 'Bearer ' + key})
        b = json.load(urllib.request.urlopen(req, timeout=90))
        if isinstance(b, dict): sys.exit(f"supabase error: {b}")
        rows += b; off += 1000
        if len(b) < 1000: return rows

def histories(cache=None, since='2026-04-01', max_age=600):
    f = cache and Path(cache) / 'hist.json'
    if f and f.exists() and time.time() - f.stat().st_mtime < max_age: return json.loads(f.read_text())
    rows = get_all(f"/rest/v1/histories?select=id,jurisdiction,result_digits,comboset_sorted,session,date_et&date_et=gte.{since}&jurisdiction=not.is.null&order=date_et.asc,id.asc")
    if f: f.parent.mkdir(parents=True, exist_ok=True); f.write_text(json.dumps(rows))
    return rows

def snapshots(cache=None, since='2026-04-18', max_age=600):
    f = cache and Path(cache) / 'snaps.json'
    if f and f.exists() and time.time() - f.stat().st_mtime < max_age: return json.loads(f.read_text())
    rows = get_all(f"/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json&slate_date=gte.{since}&deleted_at=is.null&mode=eq.balanced&order=slate_date.asc,scope.asc")
    out = []
    for r in rows:
        for p in r['top_k_straights_json'] or []:
            out.append({'date': r['slate_date'], 'scope': r['scope'], 'rank': p['rank'],
                        'set': p['comboSet'], 'order': p.get('bestOrder') or p['combo']})
    if f: f.parent.mkdir(parents=True, exist_ok=True); f.write_text(json.dumps(out))
    return out

# ── pools / helpers ──────────────────────────────────────────────────────────
EARLY13 = ['PA','SC','WV','ME,NH,VT','TX','GA','TN','MI','MN','DE','OH','AR','DC']
LATE26  = ['AZ','CA','CO','CT','FL','IA','ID','IL','IN','KS','KY','LA','MO','MS','NC','NE','NJ','NM','NY','OK','ON','QC','VA','W.Canada','WA','WI']
BLOCKS = {  # block -> (session, jurisdictions or None=all, session board scope)
    'midday':  ('midday',  None,    'midday'),
    'early13': ('evening', EARLY13, 'evening'),
    'late29':  ('evening', LATE26,  'evening'),
    'evening': ('evening', None,    'evening'),
    'allday':  (None,      None,    None),   # 11/10: every draw of the day; pool = the All-Day board alone
}
ALLSETS = sorted({'{' + ','.join(sorted(f"{i:03d}")) + '}' for i in range(1000)})
def digs(cs): return cs[1::2]
def cls(cs): return {3: 6, 2: 3, 1: 1}[len(set(digs(cs)))]
def setof(d): return '{' + ','.join(sorted(d)) + '}'
def pairs(s): return [''.join(sorted(s[a] + s[b])) for a, b in ((0, 1), (0, 2), (1, 2))]
def in_block(r, block):
    sess, pool, _ = BLOCKS[block]
    return (sess is None or r['session'] == sess) and (pool is None or r['jurisdiction'] in pool)
