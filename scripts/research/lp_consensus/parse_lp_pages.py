#!/usr/bin/env python3
"""RESEARCH ONLY — parser for Lottery Post prediction pages SAVED FROM THE OPERATOR'S
BROWSER ("Save page as… HTML only"). No fetching happens here or anywhere in this
folder: the 2026-10-14 automated pass was refused at request 1 (Cloudflare 403
challenge) and, per the brief, was not retried.

⚠ UNVALIDATED against live markup: no page was obtained on 10/14, so the member /
pick extraction below is a best-effort text walk. Expect to adjust `split_members`
after the first real saved page; the counting rules downstream (consensus.py) do not
depend on it.

Input folder (default research_local/lp_saved/, gitignored). Accepted formats:
  .html / .htm   browser "Save as… HTML only"               (best)
  .webarchive    Safari "Web Archive" (main resource HTML)   (best — same as HTML)
  .pdf           Safari/Chrome "Export as PDF"              (weaker: text only, member
                 blocks found by a text heuristic, no anchors)
Filenames carry what the page does not reliably:
  top.{ext}                          /predictions/statistics/top  (4 Top-50 tables)
  {state}_{yyyy-mm-dd}.{ext}         /predictions/{state}/{yyyy}/{mm}/{dd}   e.g. ca_2026-10-13.webarchive
Output: picks.csv (member, pool, date, state, session, combo, exact, box) with pool
∈ {TOP-HOT, TOP-LIFE, ALL} — a member appears once per pool they belong to — and a
JSON summary of pages, members per pool and dropped lines.
Only 3-digit lines are kept; anything else is dropped and counted.
"""
import csv, json, os, re, sys
from collections import defaultdict
from bs4 import BeautifulSoup
import plistlib, subprocess

def load_page(path):
    """Return ('html', str) or ('text', str) for .html/.htm/.webarchive/.pdf."""
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.html', '.htm'):
        return 'html', open(path, encoding='utf-8', errors='replace').read()
    if ext == '.webarchive':
        pl = plistlib.load(open(path, 'rb'))
        data = pl['WebMainResource']['WebResourceData']
        enc = pl['WebMainResource'].get('WebResourceTextEncodingName') or 'utf-8'
        return 'html', data.decode(enc, errors='replace')
    if ext == '.pdf':
        out = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
        return 'text', out
    raise ValueError(f'unsupported format: {path}')
EXTS = ('.html', '.htm', '.webarchive', '.pdf')

GAME_RX = re.compile(r'\b(pick\s*3|cash\s*3|daily\s*3|play\s*3|numbers|dc-3|quotidienne\s*3|pick-3)\b', re.I)
SESSION_RX = re.compile(r'\b(midday|evening|day|night|noon|matin|soir)\b', re.I)
SESSION_MAP = {'midday': 'midday', 'day': 'midday', 'noon': 'midday', 'matin': 'midday', 'evening': 'evening', 'night': 'evening', 'soir': 'evening'}

def text_lines(html):
    soup = BeautifulSoup(html, 'html.parser')
    for t in soup(['script', 'style', 'noscript']): t.decompose()
    return soup, [ln.strip() for ln in soup.get_text('\n').split('\n') if ln.strip()]

def parse_top(html):
    """Return {'TOP-HOT': set(names), 'TOP-LIFE': set(names)} from the statistics page.
    Looks for the four table captions; member names = anchor texts linking to member pages."""
    soup, _ = text_lines(html); pools = {'TOP-HOT': set(), 'TOP-LIFE': set()}
    for tbl in soup.find_all('table'):
        cap = ' '.join(x.get_text(' ', strip=True) for x in [tbl.find_previous(['h1', 'h2', 'h3', 'h4', 'caption'])] if x)
        pool = 'TOP-HOT' if re.search(r'hot predictors', cap, re.I) else ('TOP-LIFE' if re.search(r'lifetime', cap, re.I) else None)
        if not pool: continue
        for a in tbl.find_all('a', href=True):
            if '/members/' in a['href'] or '/profile' in a['href']:
                pools[pool].add(a.get_text(strip=True))
    return pools

def split_members(soup):
    """Yield (member_name, [raw pick lines], session_hint) blocks from a day page.
    Heuristic: each member anchor (/members/…) starts a block that runs to the next one."""
    anchors = [a for a in soup.find_all('a', href=True) if '/members/' in a['href'] and a.get_text(strip=True)]
    for i, a in enumerate(anchors):
        name = a.get_text(strip=True); lines = []
        node = a
        stop = anchors[i + 1] if i + 1 < len(anchors) else None
        for el in a.find_all_next(string=True):
            if stop is not None and (el.find_parent('a') is stop or (el.parent is not None and stop in el.parent.find_all('a'))): break
            if stop is not None and el is stop.string: break
            s = str(el).strip()
            if s: lines.append(s)
            if len(lines) > 400: break
        yield name, lines

def split_members_text(text):
    """PDF fallback: a block starts at a line that is neither a 3-digit pick, a game/session
    header, a number-like token nor a known furniture word; everything until the next such
    line belongs to it. Heuristic — review the summary's member count against the page."""
    FURN = re.compile(r'^(lottery post|predictions?|member|game|box|straight|date|page \d+|\d+ of \d+|login|sign in|home)\b', re.I)
    blocks = []; name = None; lines = []
    for raw in text.split('\n'):
        ln = raw.strip()
        if not ln: continue
        parts = [p for p in re.split(r'\s{2,}', ln) if p]           # -layout columns
        for pt in parts:
            if re.fullmatch(r'\d{3}', pt) or GAME_RX.search(pt) or re.fullmatch(r'[\d\s\-+/]+', pt) or FURN.search(pt):
                if name is not None: lines.append(pt)
                continue
            if name is not None: blocks.append((name, lines))
            name, lines = pt, []
    if name is not None: blocks.append((name, lines))
    return blocks

def parse_day(page, state, date):
    kind, body = page; rows = []; dropped = 0
    if kind == 'html':
        soup, _ = text_lines(body); blocks = split_members(soup)
    else:
        blocks = split_members_text(body)
    for name, lines in blocks:
        sess = None
        for s in lines:
            m = SESSION_RX.search(s)
            if m and GAME_RX.search(s): sess = SESSION_MAP[m.group(1).lower()]; continue
            if re.fullmatch(r'\d{3}', s):
                rows.append((name, date, state, sess or '', s)); continue
            if re.fullmatch(r'\d{1,2}|\d{4,}|\d{3}[-+ ]\d+', s): dropped += 1
    return rows, dropped

def main(folder, out_csv, summary_path):
    pools = {'TOP-HOT': set(), 'TOP-LIFE': set()}
    for ext in EXTS:
        top = os.path.join(folder, 'top' + ext)
        if os.path.exists(top):
            kind, body = load_page(top)
            if kind == 'html': pools = parse_top(body)
            else: print('top page as PDF: Top-50 tables need the HTML/webarchive save; pools left empty', file=sys.stderr)
            break
    seen = set(); rows = []; pages = 0; dropped = 0; members = set()
    for fn in sorted(os.listdir(folder)):
        m = re.fullmatch(r'([a-z]{2,3})_(\d{4}-\d{2}-\d{2})\.(html|htm|webarchive|pdf)', fn, re.I)
        if not m: continue
        pages += 1
        r, d = parse_day(load_page(os.path.join(folder, fn)), m.group(1).upper(), m.group(2))
        dropped += d
        for name, date, state, sess, combo in r:
            key = (name, date, state, sess, ''.join(sorted(combo)), combo)
            if key in key_seen if (key_seen := seen) else False: continue
            seen.add(key); members.add(name)
            for pool in ['ALL'] + [p for p, s in pools.items() if name in s]:
                rows.append({'member': name, 'pool': pool, 'date': date, 'state': state, 'session': sess, 'combo': combo, 'exact': combo, 'box': ''.join(sorted(combo))})
    with open(out_csv, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['member', 'pool', 'date', 'state', 'session', 'combo', 'exact', 'box']); w.writeheader(); w.writerows(rows)
    summary = {'pages_parsed': pages, 'pick_rows': len(rows), 'lines_dropped_not_3_digits': dropped,
               'members': {'ALL': len(members), 'TOP-HOT': len(pools['TOP-HOT']), 'TOP-LIFE': len(pools['TOP-LIFE']),
                           'TOP-HOT_posting_in_window': len(pools['TOP-HOT'] & members), 'TOP-LIFE_posting_in_window': len(pools['TOP-LIFE'] & members)}}
    json.dump(summary, open(summary_path, 'w'), indent=1); print(json.dumps(summary, indent=1))

if __name__ == '__main__':
    a = sys.argv[1:] or ['research_local/lp_saved']
    folder = a[0]; out = a[1] if len(a) > 1 else os.path.join(folder, 'picks.csv'); summ = a[2] if len(a) > 2 else os.path.join(folder, 'parse_summary.json')
    main(folder, out, summ)
