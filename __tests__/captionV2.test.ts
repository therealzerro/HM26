// MKT-85 CAPTION SYSTEM v2: every bank line lint-clean at its tiers; the
// assembler honours the anatomy, the rotation rules and the fact law.
import { CAPTION_BANKS, lintBanks, lintSlot } from '../lib/social/captionBanks';
import { assembleCaption, pickHook, pickQuestion, pickCta, buildFact, type CaptionMemory } from '../lib/social/captionAssembler';

const links = { free: 'https://www.facebook.com/groups/3851453614997541', pro: 'https://www.facebook.com/groups/hitmasterzk' };
const none: CaptionMemory = { recent: [], todayQuestions: [] };

describe('banks', () => {
  it('every line passes its tiers (incl. hook ≤ 80)', () => { expect(lintBanks()).toEqual([]); });
  it('the FACT slot may name states on tier 1 (operator ruling 10/11); a hook may not', () => {
    expect(lintSlot('fact', 1, 'Came up in exact order yesterday in NY and PA.')).toEqual([]);
    expect(lintSlot('hook', 1, 'Came up in NY and PA.')).not.toEqual([]);
  });
});

describe('assembler — anatomy', () => {
  it('tier 1: link first, hook, fact (public form, states named), question; no CTA', () => {
    const c = assembleCaption({ kind: 'allday_public', dateISO: '2026-10-11', facts: { straightEvents: [{ session: 'midday', jurisdiction: 'NY' }], matchJurisdictions: ['NY', 'PA'] }, memory: none, links });
    const lines = c.text.split('\n\n');
    expect(lines[0]).toBe(`Free group → ${links.free}`);
    expect(lines[2]).toBe('Came up in exact order yesterday in NY.');
    expect(lines).toHaveLength(4);
    expect(c.meta.cta).toBeNull(); expect(c.meta.fact).toEqual({ on: true, type: 'exact' });
    expect(c.meta.hook).toMatch(/^A\d$/); expect(c.meta.q).toMatch(/^Q\d+(-pub)?$/);
  });
  it('tier 2: hook, fact, Pro CTA with the link, question', () => {
    const c = assembleCaption({ kind: 'midday_free', dateISO: '2026-10-11', facts: { straightEvents: [{ session: 'midday', jurisdiction: 'ID' }, { session: 'evening', jurisdiction: 'NY' }], matchJurisdictions: ['ID', 'NY', 'AR'] }, memory: none, links });
    const lines = c.text.split('\n\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('Two straight matches yesterday: ID and NY.');
    expect(lines[2]).toContain(links.pro); expect(c.meta.cta).toMatch(/^C[1-5]$/);
  });
  it('tier 4: hook, fact, community line or none, question — never a price or link', () => {
    const c = assembleCaption({ kind: 'allday_pro', dateISO: '2026-10-11', facts: { straightEvents: [], matchJurisdictions: ['ME,NH,VT', 'WI'] }, memory: none, links });
    expect(c.text).not.toMatch(/\$|facebook\.com/);
    expect(c.text).toContain('Came up yesterday in Tri-State and WI.');
    expect(c.meta.cta === null || /^K[12]$/.test(c.meta.cta)).toBe(true);
  });
  it('allday_free draws ONLY C6/C7 (ruling 3)', () => {
    for (let d = 1; d <= 14; d++) expect(pickCta('allday_free', 2, `2026-10-${String(d).padStart(2, '0')}`, none)!.id).toMatch(/^C[67]$/);
    for (let d = 1; d <= 14; d++) expect(pickCta('midday_free', 2, `2026-10-${String(d).padStart(2, '0')}`, none)!.id).toMatch(/^C[1-5]$/);
  });
  it('facts: null → omitted; zero matches → omitted; same-day form on verify_midday; >4 states → "and more"', () => {
    expect(buildFact('verify', 2, null)).toBeNull();
    expect(buildFact('verify', 2, { straightEvents: [], matchJurisdictions: [] })).toBeNull();
    expect(buildFact('verify_midday', 2, { frame: 'sameday', straightEvents: [{ session: 'midday', jurisdiction: 'AR' }], matchJurisdictions: ['AR'] })!.text).toBe('One straight match at midday today — exact order, AR.');
    expect(buildFact('verify', 4, { straightEvents: [], matchJurisdictions: ['A', 'B', 'C', 'D', 'E'] })!.text).toBe('Came up yesterday in A, B, C, D and more.');
    expect(buildFact('verify', 2, { straightEvents: [{ session: 'midday', jurisdiction: 'NY' }, { session: 'evening', jurisdiction: 'NY' }], matchJurisdictions: ['NY'] })!.text).toBe('Two straight matches yesterday: NY.');  // two draw events, one state
  });
  it('verify hooks say yesterday\'s weekday', () => {
    const hook = pickHook('verify', '2026-10-11', none);   // Sunday → {weekday} = Saturday
    const c = assembleCaption({ kind: 'verify', dateISO: '2026-10-11', facts: null, memory: none, links });
    if (hook.text.includes('{weekday}')) expect(c.text).toContain('Saturday');
  });
});

describe('assembler — rotation', () => {
  it('never the same hook two days running', () => {
    for (let d = 1; d < 30; d++) {
      const y = pickHook('verify', `2026-09-${String(d).padStart(2, '0')}`, none).id;
      const t = pickHook('verify', `2026-09-${String(d + 1).padStart(2, '0')}`, { recent: [{ date: `2026-09-${String(d).padStart(2, '0')}`, hook: y }], todayQuestions: [] }).id;
      expect(t).not.toBe(y);
    }
  });
  it('hook cycle covers the whole bank across its length', () => {
    const ids = new Set<string>(); for (let d = 1; d <= 8; d++) ids.add(pickHook('verify', `2026-10-${String(d).padStart(2, '0')}`, none).id);
    expect(ids.size).toBe(8);
  });
  it('questions: not today on another kind, not within 7 days on this kind; tier 1 uses the -pub variant', () => {
    const q0 = pickQuestion('verify', 2, '2026-10-11', none).id;
    expect(pickQuestion('verify', 2, '2026-10-11', { recent: [], todayQuestions: [q0] }).id).not.toBe(q0);
    const recent = [{ date: '2026-10-08', q: q0 }];
    expect(pickQuestion('verify', 2, '2026-10-11', { recent, todayQuestions: [] }).id).not.toBe(q0);
    expect(pickQuestion('verify', 2, '2026-10-11', { recent: [{ date: '2026-10-01', q: q0 }], todayQuestions: [] }).id).toBe(q0);   // outside the 7-day window
    const pubIds = new Set<string>(); for (let d = 1; d <= 20; d++) pubIds.add(pickQuestion('allday_public', 1, `2026-10-${String(d).padStart(2, '0')}`, none).id);
    expect([...pubIds].some(id => id.endsWith('-pub'))).toBe(true);
    expect([...pubIds].some(id => ['Q5', 'Q6', 'Q14', 'Q15', 'Q18'].includes(id))).toBe(false);
  });
  it('tier-2 CTA never repeats two days running', () => {
    const y = pickCta('midday_free', 2, '2026-10-10', none)!.id;
    expect(pickCta('midday_free', 2, '2026-10-11', { recent: [{ date: '2026-10-10', cta: y }], todayQuestions: [] })!.id).not.toBe(y);
  });
  it('deterministic: same inputs → same caption', () => {
    const a = assembleCaption({ kind: 'verify', dateISO: '2026-10-11', facts: null, memory: none, links });
    const b = assembleCaption({ kind: 'verify', dateISO: '2026-10-11', facts: null, memory: none, links });
    expect(a).toEqual(b);
  });
});
