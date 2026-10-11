// MKT-83 (2026-10-11): the Sunday receipts image does not render if it fails
// the lint; cell law; tier-1 translation; week window; caption family.
import { buildWeeklyModel, weeklyModelStrings, lintWeekly, lastCompleteWeek, weekRangeLabel, dayRowLabel, type WeeklyReceiptsData } from '../lib/social/weeklyReceipts';
import { lintWeeklyCaptions } from '../lib/social/weeklyCaptions';

const m = (set: string, best: string, straight: boolean) => ({ set, bestOrder: best, straight });
const day = (date: string, allday: any, midday: any, evening: any) => ({ date, cells: { allday: { scope: 'allday', ...allday }, midday: { scope: 'midday', ...midday }, evening: { scope: 'evening', ...evening } } });
const none = { state: 'none', matches: [] };
const empty = { state: 'empty', matches: [] };
const data: WeeklyReceiptsData = {
  start: '2026-10-04', end: '2026-10-10',
  days: [
    day('2026-10-04', { state: 'box', matches: [m('046', '064', false), m('257', '752', false)] }, { state: 'straight', matches: [m('037', '073', true)] }, { state: 'box', matches: [m('169', '691', false)] }),
    day('2026-10-05', { state: 'box', matches: [m('358', '385', false)] }, none, { state: 'straight', matches: [m('456', '546', true), m('067', '670', false)] }),
    day('2026-10-06', none, none, empty),
    day('2026-10-07', none, none, none),
    day('2026-10-08', { state: 'straight', matches: [m('048', '408', true)] }, none, none),
    day('2026-10-09', none, none, { state: 'straight', matches: [m('168', '861', false), m('014', '104', false), m('169', '691', true), m('148', '148', true)] }),
    day('2026-10-10', { state: 'straight', matches: [m('235', '325', false), m('357', '375', true)] }, { state: 'box', matches: [m('235', '352', false)] }, none),
  ] as any,
};

describe('weekly receipts — lint passes on every tier', () => {
  it.each([['public', undefined, 1], ['group', 'free', 2], ['group', 'pro', 4]] as const)('%s/%s tier %d', (variant, groupTier, tier) => {
    const model = buildWeeklyModel(data, variant, groupTier);
    const r = lintWeekly(model);
    expect(r.tier).toBe(tier);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('weekly receipts — cell law', () => {
  const pro = buildWeeklyModel(data, 'group', 'pro');
  const pub = buildWeeklyModel(data, 'public');
  it('rows are Sun→Sat with the ruled labels and range', () => {
    expect(pro.rows).toHaveLength(7);
    expect(pro.rows[0].label).toBe('SUN · OCT 4');
    expect(pro.rows[6].label).toBe('SAT · OCT 10');
    expect(pro.range).toBe('OCT 4 – OCT 10');
    expect(pro.kicker).toBe('SUNDAY RECEIPTS');
  });
  it('member columns ALL-DAY · MIDDAY · EVENING; public DAYTIME · NIGHTTIME · CONTINUOUS', () => {
    expect(pro.columns).toEqual(['ALL-DAY', 'MIDDAY', 'EVENING']);
    expect(pub.columns).toEqual(['DAYTIME', 'NIGHTTIME', 'CONTINUOUS']);
  });
  it('straight = gold exact-order chip, box = set chip; tier 1 relabels and shows no digits', () => {
    const sunMid = pro.rows[0].cells[1];
    expect(sunMid.state).toBe('straight'); expect(sunMid.tag).toBe('STRAIGHT MATCH');
    expect(sunMid.chips).toEqual([{ text: '0-7-3', straight: true }]);
    const sunAll = pro.rows[0].cells[0];
    expect(sunAll.tag).toBe('BOX MATCH'); expect(sunAll.chips.map(c => c.text)).toEqual(['{0,4,6}', '{2,5,7}']);
    const pubSunDay = pub.rows[0].cells[0];           // public col 0 = midday (DAYTIME)
    expect(pubSunDay.tag).toBe('EXACT ORDER'); expect(pubSunDay.chips).toEqual([]);
    expect(pub.rows[0].cells[2].tag).toBe('ANY ORDER');
    const strings = weeklyModelStrings(pub).map(s => s.text).join(' ');
    expect(strings).not.toMatch(/\d-\d-\d|\{\d,\d,\d\}/);
    expect(strings).not.toMatch(/STRAIGHT|BOX|MIDDAY|EVENING|ALL-DAY/);
  });
  it('none → dash string; empty → nothing (no string at all)', () => {
    const s = weeklyModelStrings(pro);
    expect(s.some(x => x.where === 'row.3.cell.0' && x.text === '—')).toBe(true);     // Wed all-day none
    expect(s.some(x => x.where.startsWith('row.2.cell.2'))).toBe(false);              // Tue evening empty
    expect(pro.rows[2].cells[2].state).toBe('empty');
  });
  it('a 4-match cell keeps all four chips (never truncated)', () => {
    expect(pro.rows[5].cells[2].chips).toHaveLength(4);
  });
  it('no count anywhere (R-A)', () => {
    const all = weeklyModelStrings(pro).map(s => s.text).join('\n');
    expect(all).not.toMatch(/\b\d+\s+(matches|straights|of)\b/i);
  });
});

describe('weekly receipts — week window', () => {
  it('Sunday → the week that ended yesterday', () => expect(lastCompleteWeek('2026-10-11')).toEqual({ start: '2026-10-04', end: '2026-10-10' }));
  it('Wednesday → the most recent Sat', () => expect(lastCompleteWeek('2026-10-14')).toEqual({ start: '2026-10-04', end: '2026-10-10' }));
  it('Saturday → the previous week (today is not complete)', () => expect(lastCompleteWeek('2026-10-17')).toEqual({ start: '2026-10-04', end: '2026-10-10' }));
  it('labels', () => { expect(weekRangeLabel('2026-09-27', '2026-10-03')).toBe('SEP 27 – OCT 3'); expect(dayRowLabel('2026-10-04')).toBe('SUN · OCT 4'); });
});

describe('weekly receipts — caption family lint-clean', () => {
  it('pro (4), free (2) and public (1) captions carry no blocking term', () => {
    expect(lintWeeklyCaptions({ freeGroupUrl: 'https://www.facebook.com/groups/3851453614997541', proUrl: 'https://www.facebook.com/groups/hitmasterzk' })).toEqual({ pro: [], free: [], public: [] });
  });
});
