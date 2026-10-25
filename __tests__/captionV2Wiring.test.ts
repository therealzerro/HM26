// MKT-85 CAPTION SYSTEM v2, builds 2–4: the distinct-draw-event facts (the
// "MKT-84 rule"), the caption_meta memory read-back, and the live_kinds gate
// (EMPTY → old family on every kind; a listed kind → the v2 assembler).
import { CAPTION_BANKS, type CaptionBanks } from '../lib/social/captionBanks';
import { formatCaptionMeta } from '../lib/social/captionAssembler';
import { fetchReceiptsData, fetchSamedayFacts, drawEvents, receiptsToFacts } from '../scripts/reel-captions';
import { buildCaptionMemory, captionDayFor, captionMetaPath, captionMetaFor, isV2Live, metaSlotFor, v2Draft, MEMORY_DAYS, type CaptionMetaRow } from '../scripts/reel-caption-v2';

const links = { free: 'https://www.facebook.com/groups/3851453614997541', pro: 'https://www.facebook.com/groups/hitmasterzk' };
const pick = (comboSet: string, bestOrder: string) => ({ comboSet, bestOrder });
const slate = (scope: string, slate_date: string, picks: { comboSet: string; bestOrder: string }[]) => ({ scope, slate_date, top_k_straights_json: picks });
const draw = (date_et: string, session: string, jurisdiction: string, result_digits: string) =>
  ({ date_et, session, jurisdiction, result_digits, comboset_sorted: result_digits.split('').sort().join('') });

describe('build 2 — facts as distinct draw events', () => {
  const D = '2026-10-24';
  it('one draw matched straight by two boards = ONE event; one jurisdiction straight in two sessions = TWO; matchJx = every matched jurisdiction', () => {
    const slates = [slate('midday', D, [pick('149', '419')]), slate('allday', D, [pick('149', '419'), pick('237', '372')]), slate('evening', D, [pick('149', '419')])];
    const draws = [
      draw(D, 'midday', 'NY', '419'),     // straight on midday AND allday boards → one event
      draw(D, 'evening', 'NY', '419'),    // straight again in the evening → second event
      draw(D, 'midday', 'PA', '941'),     // box only
      draw(D, 'evening', 'GA', '273'),    // box on allday only
      draw(D, 'midday', 'TX', '555'),     // no match
    ];
    const ev = drawEvents(slates, draws);
    expect(ev.straightEvents).toEqual([{ session: 'evening', jurisdiction: 'NY' }, { session: 'midday', jurisdiction: 'NY' }]);
    expect(ev.matchJx).toEqual(['GA', 'NY', 'PA']);
  });
  it('fetchReceiptsData exposes straightEvents + matchJx beside the untouched fields', async () => {
    const slates = [slate('allday', D, [pick('149', '419'), pick('237', '372')]), slate('midday', '2026-10-20', [pick('149', '419')])];
    const draws = [draw(D, 'midday', 'NY', '419'), draw(D, 'evening', 'NY', '419'), draw(D, 'midday', 'PA', '941'), draw('2026-10-20', 'midday', 'OH', '914')];
    const get = async <T,>(path: string): Promise<T> => (path.includes('slate_snapshots') ? slates : path.includes('offset=0') ? draws : []) as unknown as T;
    const r = await fetchReceiptsData(D, get);
    expect(r.straightJx).toEqual(['NY']); expect(r.boxJx).toEqual(['PA']);          // the old per-jurisdiction fields
    expect(r.totalSignals).toBe(2); expect(r.verifiedCount).toBe(1); expect(r.verified30d).toBe(2);
    expect(r.straightEvents).toEqual([{ session: 'evening', jurisdiction: 'NY' }, { session: 'midday', jurisdiction: 'NY' }]);
    expect(r.matchJx).toEqual(['NY', 'PA']);
    expect(receiptsToFacts(r)).toEqual({ straightEvents: r.straightEvents, matchJurisdictions: ['NY', 'PA'], frame: 'yesterday' });
    expect(receiptsToFacts(null)).toBeNull();
  });
  it('verify_midday same-day facts come from histories (midday session, both morning boards), frame sameday', async () => {
    const paths: string[] = [];
    const get = async <T,>(path: string): Promise<T> => {
      paths.push(path);
      if (path.includes('slate_snapshots')) return [slate('midday', D, [pick('149', '419')]), slate('allday', D, [pick('237', '372')])] as unknown as T;
      return [draw(D, 'Midday', 'NY', '419'), draw(D, 'midday', 'GA', '372'), draw(D, 'evening', 'GA', '372')] as unknown as T;
    };
    const f = await fetchSamedayFacts(D, get);
    expect(f).toEqual({ frame: 'sameday', straightEvents: [{ session: 'midday', jurisdiction: 'GA' }, { session: 'midday', jurisdiction: 'NY' }], matchJurisdictions: ['GA', 'NY'] });
    expect(paths.some(p => p.includes('/histories?'))).toBe(true);
    expect(paths.some(p => p.includes('adaptive_tracking'))).toBe(false);
  });
});

describe('build 4 — memory read-back', () => {
  const rows: CaptionMetaRow[] = [
    { reel_date: '2026-10-24', kind: 'verify', caption_meta: { free: { v: '2.0.0', hook: 'V3', cta: 'C2', q: 'Q7', fact: { on: true, type: 'straight' } }, pro: { v: '2.0.0', hook: 'V5', cta: null, q: 'Q9', fact: { on: false, type: null } } } },
    { reel_date: '2026-10-23', kind: 'verify', caption_meta: { free: { v: '2.0.0', hook: 'V1', cta: 'C4', q: 'Q2', fact: { on: false, type: null } } } },
    { reel_date: '2026-10-25', kind: 'allday_pro', caption_meta: { free: { v: '2.0.0', hook: 'P2', cta: 'K1', q: 'Q4', fact: { on: true, type: 'states' } } } },
    { reel_date: '2026-10-25', kind: 'midday_free', caption_meta: null },
  ];
  it('D−1 kinds post the morning after their reel_date; slate kinds on it', () => {
    expect(captionDayFor('verify', '2026-10-24')).toBe('2026-10-25');
    expect(captionDayFor('verify_pro', '2026-10-24')).toBe('2026-10-25');
    expect(captionDayFor('record_public', '2026-10-24')).toBe('2026-10-25');
    expect(captionDayFor('allday_pro', '2026-10-25')).toBe('2026-10-25');
    expect(metaSlotFor('verify_pro')).toEqual({ rowKind: 'verify', side: 'pro' });
    expect(metaSlotFor('midday_free')).toEqual({ rowKind: 'midday_free', side: 'free' });
    expect(captionMetaPath('2026-10-25')).toContain(`reel_date=gte.2026-10-${25 - MEMORY_DAYS}`);
    expect(captionMetaPath('2026-10-25')).toContain('caption_meta=not.is.null');
  });
  it("verify free side: own history newest first (post days), today's questions from every other slot incl. the pro side", () => {
    const m = buildCaptionMemory('verify', '2026-10-25', rows);
    expect(m.recent).toEqual([{ date: '2026-10-25', hook: 'V3', cta: 'C2', q: 'Q7' }, { date: '2026-10-24', hook: 'V1', cta: 'C4', q: 'Q2' }]);
    expect(m.todayQuestions.sort()).toEqual(['Q4', 'Q9']);
  });
  it('verify_pro reads the pro side; in-run questions are carried; a NULL meta row contributes nothing', () => {
    const m = buildCaptionMemory('verify_pro', '2026-10-25', rows, ['Q11']);
    expect(m.recent).toEqual([{ date: '2026-10-25', hook: 'V5', cta: null, q: 'Q9' }]);
    expect(m.todayQuestions.sort()).toEqual(['Q11', 'Q4', 'Q7']);
  });
  it('caption_meta column value: NULL unless v2 drafted a side', () => {
    const meta = { v: '2.0.0', hook: 'V1', cta: null, q: 'Q1', fact: { on: false, type: null } };
    expect(captionMetaFor(null, null)).toBeNull();
    expect(captionMetaFor(meta, null)).toEqual({ free: meta });
    expect(captionMetaFor(null, meta)).toEqual({ pro: meta });
    expect(formatCaptionMeta(meta)).toBe('v2.0.0 · hook V1 · cta — · q Q1 · fact off');
    expect(formatCaptionMeta({ ...meta, cta: 'C2', fact: { on: true, type: 'straight' } })).toBe('v2.0.0 · hook V1 · cta C2 · q Q1 · fact straight');
  });
});

describe('build 4 — live_kinds gating', () => {
  const facts = { straightEvents: [{ session: 'midday', jurisdiction: 'NY' }], matchJurisdictions: ['NY', 'PA'] };
  it('live_kinds is EMPTY in this build — nothing ships on v2 until eyeballed', () => {
    expect(CAPTION_BANKS.live_kinds).toEqual([]);
    for (const k of ['verify', 'verify_pro', 'allday_pro', 'allday_free', 'midday_free', 'evening_pro', 'allday_public', 'verify_midday', 'record_public']) {
      expect(isV2Live(k)).toBe(false);
      expect(v2Draft({ kind: k, reelDate: '2026-10-24', facts, links, rows: [] })).toBeNull();
    }
  });
  it('a kind listed on a stub live_kinds is drafted by v2 with meta; its siblings still fall through', () => {
    const banks: CaptionBanks = { ...CAPTION_BANKS, live_kinds: ['verify', 'verify_pro'] };
    const free = v2Draft({ kind: 'verify', reelDate: '2026-10-24', facts, links, rows: [], banks });
    expect(free).not.toBeNull();
    expect(free!.meta.v).toBe('2.0.0'); expect(free!.meta.hook).toMatch(/^V\d$/); expect(free!.meta.cta).toMatch(/^C[1-5]$/);
    expect(free!.text).toContain('One straight match yesterday — exact order, NY.');
    // 10/24 verify posts 10/25 (Sunday): a weekday-bearing hook says Saturday, never Sunday
    const hookText = CAPTION_BANKS.hooks.verify.lines.find(l => l.id === free!.meta.hook)!.text;
    if (hookText.includes('{weekday}')) expect(free!.text).toContain('Saturday');
    expect(free!.text).not.toContain('Sunday');
    const pro = v2Draft({ kind: 'verify_pro', reelDate: '2026-10-24', facts, links, rows: [], inRun: [free!.meta.q], banks });
    expect(pro).not.toBeNull();
    expect(pro!.text).not.toMatch(/\$|facebook\.com/);
    expect(pro!.meta.q).not.toBe(free!.meta.q);   // once-per-day across the run
    expect(v2Draft({ kind: 'allday_pro', reelDate: '2026-10-25', facts, links, rows: [], banks })).toBeNull();
  });
  it('a live kind the assembler refuses (no bank / missing link) falls back to null with a warning', () => {
    const warns: string[] = [];
    const banks: CaptionBanks = { ...CAPTION_BANKS, live_kinds: ['allday_public', 'verify_public'] };
    expect(v2Draft({ kind: 'allday_public', reelDate: '2026-10-25', facts, links: { pro: links.pro }, rows: [], banks, warn: m => warns.push(m) })).toBeNull();
    expect(v2Draft({ kind: 'verify_public', reelDate: '2026-10-24', facts, links, rows: [], banks, warn: m => warns.push(m) })).toBeNull();
    expect(warns).toHaveLength(2);
    expect(warns[0]).toContain('free-group link');
    expect(warns[1]).toContain('no hook bank');
  });
});
