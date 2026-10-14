#!/usr/bin/env python3
"""RESEARCH ONLY — parser for Lottery Post prediction pages SAVED FROM THE OPERATOR'S
BROWSER ("Save page as… HTML only"). No fetching happens here or anywhere in this
folder: the 2026-10-14 automated pass was refused at request 1 (Cloudflare 403
challenge) and, per the brief, was not retried.

⚠ UNVALIDATED against live markup: no page was obtained on 10/14, so the member /
pick extraction below is a best-effort text walk. Expect to adjust `split_members`
after the first real saved page; the counting rules downstream (consensus.py) do not
depend on it.

Input folder layout (filenames carry what the page does not reliably):
  top.html                           /predictions/statistics/top  (4 Top-50 tables)
  {state}_{yyyy}-{mm}-{dd}.html      /predictions/{state}/{yyyy}/{mm}/{dd}
Output: picks.csv (member, pool, date, state, session, combo, exact, box) with pool
∈ {TOP-HOT, TOP-LIFE, ALL} — a member appears once per pool they belong to — and a
JSON summary of pages, members per pool and dropped lines.
Only 3-digit lines are kept; anything else is dropped and counted.
"""
import csv, json, os, re, sys
from collections import defaultdict
from bs4 import BeautifulSoup

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

def parse_day(html, state, date):
    soup, _ = text_lines(html); rows = []; dropped = 0; session = None
    for name, lines in split_members(soup):
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
    top = os.path.join(folder, 'top.html')
    if os.path.exists(top): pools = parse_top(open(top, encoding='utf-8', errors='replace').read())
    seen = set(); rows = []; pages = 0; dropped = 0; members = set()
    for fn in sorted(os.listdir(folder)):
        m = re.fullmatch(r'([a-z]{2,3})_(\d{4}-\d{2}-\d{2})\.html', fn)
        if not m: continue
        pages += 1
        r, d = parse_day(open(os.path.join(folder, fn), encoding='utf-8', errors='replace').read(), m.group(1).upper(), m.group(2))
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
    main(sys.argv[1], sys.argv[2], sys.argv[3])
