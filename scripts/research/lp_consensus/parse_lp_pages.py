#!/usr/bin/env python3
"""RESEARCH ONLY — parser for Lottery Post prediction pages SAVED FROM THE OPERATOR'S
BROWSER. No fetching happens here or anywhere in this folder (the 2026-10-14 automated
pass was refused at request 1 and will never be retried — stop accepted).

Validated 2026-10-14 against 7 operator-saved state pages (FL GA MI NY OH TX DC). Markup:
  <table class="… predtable"> rows = <td><a href=".../member/{id}">Name</a></td>
  <td><a data-game="{st}/{n}">Pick 3 Midday</a></td> <td>289, 839, …</td> <td>last post</td>
Session labels → histories' two buckets (BUG-148): Midday/Morning/Day/1:50pm → midday;
Evening/Night/7:50pm/11:30pm → evening. Only 3-digit tokens are kept; anything else is
dropped and counted. A member counts once per (date, state, session, combination).

Input folder (default research_local/lp_saved/, gitignored). Accepted:
  .html/.htm (browser save), .webarchive (Safari Web Archive — same HTML), .pdf (text only;
  weaker — no table structure, members found by a text heuristic).
State and date come from the page itself (canonical URL + the date-picker's selected day);
a filename {state}_{yyyy-mm-dd}.{ext} overrides both. top.{ext} = /predictions/statistics/top.
Output: picks.csv (member, pool, date, state, session, combo, exact, box) + parse_summary.json.
"""
import csv, datetime as dt, json, os, plistlib, re, subprocess, sys
from collections import defaultdict
from bs4 import BeautifulSoup

GAME3_RX = re.compile(r'^(pick\s*3|cash\s*3|daily\s*3|play\s*3|numbers|dc-3|pick-3|quotidienne\s*3|la quotidienne 3|daily 3|the numbers)\b', re.I)
NOT3_RX = re.compile(r'pick\s*4|cash\s*4|daily\s*4|play\s*4|win\s*4|pick\s*5|fantasy|cash\s*5|powerball|mega|lotto|keno|all or nothing|quotidienne\s*4', re.I)
MID = re.compile(r'midday|morning|\bday\b|noon|1:\d\dpm|12:\d\dpm|matin|\bmid\b', re.I)
EVE = re.compile(r'evening|night|7:\d\dpm|8:\d\dpm|9:\d\dpm|10:\d\dpm|11:\d\dpm|soir|\beve\b', re.I)
EXTS = ('.html', '.htm', '.webarchive', '.pdf')

def session_of(label):
    if EVE.search(label): return 'evening'
    if MID.search(label): return 'midday'
    return ''

def load_page(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.html', '.htm'): return 'html', open(path, encoding='utf-8', errors='replace').read()
    if ext == '.webarchive':
        pl = plistlib.load(open(path, 'rb')); mr = pl['WebMainResource']
        return 'html', mr['WebResourceData'].decode(mr.get('WebResourceTextEncodingName') or 'utf-8', errors='replace')
    if ext == '.pdf':
        return 'text', subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
    raise ValueError(f'unsupported format: {path}')

def page_identity(html):
    """(state, date) from canonical URL /predictions/{st}[/yyyy/mm/dd] and the picker's selected day."""
    m = re.search(r'rel="canonical" href="https?://[^/]+/predictions/([a-z]{2,3})(?:/(\d{4})/(\d{1,2})/(\d{1,2}))?', html)
    st = m.group(1).upper() if m else None; date = None
    if m and m.group(2): date = f'{int(m.group(2)):04d}-{int(m.group(3)):02d}-{int(m.group(4)):02d}'
    if not date:
        s = re.search(r'flatpickr-day[^"]*selected[^"]*"[^>]*aria-label="([A-Za-z]+ \d{1,2}, \d{4})"', html)
        if s: date = dt.datetime.strptime(s.group(1), '%B %d, %Y').strftime('%Y-%m-%d')
    return st, date

def parse_top(html):
    soup = BeautifulSoup(html, 'html.parser'); pools = {'TOP-HOT': set(), 'TOP-LIFE': set()}
    for tbl in soup.find_all('table'):
        hdr = tbl.find_previous(['h1', 'h2', 'h3', 'h4', 'caption']); cap = hdr.get_text(' ', strip=True) if hdr else ''
        pool = 'TOP-HOT' if re.search(r'hot predictors', cap, re.I) else ('TOP-LIFE' if re.search(r'lifetime', cap, re.I) else None)
        if not pool: continue
        for a in tbl.find_all('a', href=True):
            if re.search(r'/member/\d+', a['href']): pools[pool].add(a.get_text(strip=True))
    return pools

def parse_day_html(html, state, date):
    soup = BeautifulSoup(html, 'html.parser'); rows = []; dropped = 0; skipped_games = 0
    tbl = soup.find('table', class_='predtable')
    if tbl is None: return rows, dropped, skipped_games, 'no predtable'
    for tr in tbl.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) < 3: continue
        a = tds[0].find('a', href=re.compile(r'/member/\d+')); g = tds[1].get_text(' ', strip=True)
        if a is None: continue
        if NOT3_RX.search(g) or not GAME3_RX.search(g): skipped_games += 1; continue
        name = a.get_text(strip=True); sess = session_of(g)
        for tok in re.split(r'[,\s]+', tds[2].get_text(' ', strip=True)):
            tok = tok.strip()
            if not tok: continue
            if re.fullmatch(r'\d{3}', tok): rows.append((name, date, state, sess, tok, g))
            else: dropped += 1
    return rows, dropped, skipped_games, None

def parse_day_text(text, state, date):
    """PDF fallback: lines 'Name  Pick 3 Midday  123, 456, …'. Heuristic."""
    rows = []; dropped = 0; skipped = 0
    for ln in text.split('\n'):
        m = re.match(r'\s*(\S.*?)\s{2,}((?:Pick|Cash|Daily|Play|DC-3|Numbers)[^\d]*?(?:Midday|Evening|Morning|Day|Night|\d{1,2}:\d\d\s*[ap]m)?)\s{2,}(.*)$', ln, re.I)
        if not m: continue
        name, g, picks = m.group(1).strip(), m.group(2).strip(), m.group(3)
        if NOT3_RX.search(g) or not GAME3_RX.search(g): skipped += 1; continue
        for tok in re.split(r'[,\s]+', picks):
            if re.fullmatch(r'\d{3}', tok): rows.append((name, date, state, session_of(g), tok, g))
            elif tok: dropped += 1
    return rows, dropped, skipped, 'pdf heuristic'

def main(folder, out_csv, summary_path):
    pools = {'TOP-HOT': set(), 'TOP-LIFE': set()}; top_note = None
    for ext in EXTS:
        tp = os.path.join(folder, 'top' + ext)
        if os.path.exists(tp):
            kind, body = load_page(tp); top_note = tp
            if kind == 'html': pools = parse_top(body)
            else: top_note += ' (PDF — Top-50 tables need an HTML/webarchive save; pools empty)'
            break
    seen = set(); rows = []; pages = []; dropped = 0; skipped = 0; members = set(); game_labels = defaultdict(int)
    files = []
    for root, _, fns in os.walk(folder):
        for fn in fns:
            if fn.lower().endswith(EXTS) and not re.fullmatch(r'top\.[a-z]+', fn, re.I): files.append(os.path.join(root, fn))
    for path in sorted(files):
        fn = os.path.basename(path); kind, body = load_page(path)
        m = re.fullmatch(r'([a-z]{2,3})_(\d{4}-\d{2}-\d{2})\.[a-z]+', fn, re.I)
        st, date = (m.group(1).upper(), m.group(2)) if m else ((page_identity(body) if kind == 'html' else (None, None)))
        if not st or not date: pages.append({'file': fn, 'error': 'state/date unresolved — name it {state}_{yyyy-mm-dd}.{ext}'}); continue
        r, d, sk, note = (parse_day_html if kind == 'html' else parse_day_text)(body, st, date)
        dropped += d; skipped += sk; n0 = len(rows); mem = set()
        for name, dte, state, sess, combo, g in r:
            game_labels[f'{state} {g}'] += 1
            key = (name, dte, state, sess, combo)
            if key in seen: continue
            seen.add(key); members.add(name); mem.add(name)
            for pool in ['ALL'] + [p for p, s in pools.items() if name in s]:
                rows.append({'member': name, 'pool': pool, 'date': dte, 'state': state, 'session': sess, 'combo': combo, 'exact': combo, 'box': ''.join(sorted(combo))})
        pages.append({'file': fn, 'state': st, 'date': date, 'members_3digit': len(mem), 'pick_rows_all_pool': len(rows) - n0, 'dropped': d, 'other_game_rows_skipped': sk, 'note': note})
    with open(out_csv, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['member', 'pool', 'date', 'state', 'session', 'combo', 'exact', 'box']); w.writeheader(); w.writerows(rows)
    summary = {'pages': pages, 'top_page': top_note, 'pick_rows_total': len(rows), 'lines_dropped_not_3_digits': dropped, 'other_game_rows_skipped': skipped,
               'members': {'ALL': len(members), 'TOP-HOT': len(pools['TOP-HOT']), 'TOP-LIFE': len(pools['TOP-LIFE']),
                           'TOP-HOT_posting': len(pools['TOP-HOT'] & members), 'TOP-LIFE_posting': len(pools['TOP-LIFE'] & members)},
               'game_labels_seen': dict(sorted(game_labels.items()))}
    json.dump(summary, open(summary_path, 'w'), indent=1); print(json.dumps(summary, indent=1))

if __name__ == '__main__':
    a = sys.argv[1:] or ['research_local/lp_saved']
    folder = a[0]; out = a[1] if len(a) > 1 else os.path.join(folder, 'picks.csv'); summ = a[2] if len(a) > 2 else os.path.join(folder, 'parse_summary.json')
    main(folder, out, summ)
