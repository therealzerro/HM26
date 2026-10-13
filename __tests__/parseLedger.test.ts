// PARSER-HARDEN-01 (2026-10-13): fixtures built from the formats the operator
// actually pastes (see assets/results-7-8.txt — vertical, assets/backfill6-22.txt
// — tab) plus every shape that bit us in ENG-REVIEW-03 / DATA-06: Double Draw
// bonus lines, Fireball / Wild Ball suffixes, the four Tri-State headers, label
// variants, two results for one draw, evening-only states with a midday row.
import { parseRawLedgerData, normalizeVerticalFormat } from '../lib/parseLedger';

const T = '\t';

describe('parseRawLedgerData — the operator\'s two paste shapes', () => {
  it('parses the VERTICAL shape (Game / Date / Result on three lines under a state header)', () => {
    const text = [
      'Arizona',
      'Pick 3 Midday', 'Mon, Jun 29, 2026', '8-4-5',
      'Pick 3 Evening', 'Mon, Jun 29, 2026', '7-5-2',
      'Arkansas',
      'Cash 3 Midday', 'Mon, Jun 29, 2026', '1-9-5',
    ].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { jurisdiction: 'AZ', game: 'Pick 3', date_et: '2026-06-29', session: 'midday',  result_digits: '845', comboset_sorted: '{4,5,8}' },
      { jurisdiction: 'AZ', game: 'Pick 3', date_et: '2026-06-29', session: 'evening', result_digits: '752', comboset_sorted: '{2,5,7}' },
      { jurisdiction: 'AR', game: 'Cash 3', date_et: '2026-06-29', session: 'midday',  result_digits: '195', comboset_sorted: '{1,5,9}' },
    ]);
  });

  it('parses the TAB shape (Game<TAB>Date<TAB>Result under a state header)', () => {
    const text = ['Arizona', `Pick 3 Midday${T}Fri, Jul 10, 2026${T}4-2-9`, `Pick 3 Evening${T}Fri, Jul 10, 2026${T}0-2-8`].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(skipped).toEqual([]);
    expect(rows.map(r => `${r.jurisdiction} ${r.session} ${r.result_digits}`)).toEqual(['AZ midday 429', 'AZ evening 028']);
  });

  it('normalizeVerticalFormat is a no-op on tab input', () => {
    const tab = ['Arizona', `Pick 3 Midday${T}Fri, Jul 10, 2026${T}4-2-9`].join('\n');
    expect(normalizeVerticalFormat(tab)).toBe(tab);
  });
});

describe('result suffixes and session mapping', () => {
  it('ignores Fireball / Wild Ball suffixes and maps Night/Morning/clock times to the two buckets', () => {
    const text = [
      'Texas', `Pick 3 Night${T}Mon, Sep 21, 2026${T}5-2-6, Fireball: 2`,
      'Tennessee', `Cash 3 Morning${T}Thu, Sep 17, 2026${T}6-8-9, Wild Ball: 8`,
      'Washington, D.C.', `DC-3 1:50pm${T}Thu, Sep 17, 2026${T}7-7-3`, `DC-3 11:30pm${T}Thu, Sep 17, 2026${T}6-1-1`,
    ].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(skipped).toEqual([]);
    expect(rows.map(r => `${r.jurisdiction} ${r.game} ${r.session} ${r.result_digits}`)).toEqual([
      'TX Pick 3 evening 526', 'TN Cash 3 midday 689', 'DC DC-3 midday 773', 'DC DC-3 evening 611',
    ]);
  });
});

describe('Tri-State headers', () => {
  it('collapses Maine / New Hampshire / Vermont / Multi-State into ONE ME,NH,VT row', () => {
    const line = `Pick 3 Day${T}Thu, May 7, 2026${T}2-5-1`;
    const text = ['Maine', line, 'New Hampshire', line, 'Vermont', line, 'Multi-State', line].join('\n');
    const { rows } = parseRawLedgerData(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jurisdiction: 'ME,NH,VT', game: 'Pick 3', session: 'midday', result_digits: '251' });
  });

  it('accepts the "Tri-State (ME, NH & VT)" header the source actually prints', () => {
    const text = ['Tri-State (ME, NH & VT)', `Pick 3 Evening${T}Tue, May 12, 2026${T}6-6-9`].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({ jurisdiction: 'ME,NH,VT', session: 'evening', result_digits: '669' });
  });
});

describe('game label canonicalisation (label variants defeated the unique key)', () => {
  it('rewrites "Pick3" / "pick3" to the canonical "Pick 3"', () => {
    const text = ['Florida', `Pick3 Midday${T}Tue, Apr 14, 2026${T}5-1-2`, 'Texas', `pick3 Day${T}Tue, Apr 14, 2026${T}6-3-2`].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(skipped).toEqual([]);
    expect(rows.map(r => r.game)).toEqual(['Pick 3', 'Pick 3']);
  });

  it('skips a game that is not played in that jurisdiction, with the allowed list in the reason', () => {
    // A 3-digit result under a game NY does not play (a 4-digit result is rejected earlier, by the result parser).
    const text = ['New York', `Win 3 Midday${T}Tue, Apr 14, 2026${T}1-2-3`, `Numbers Midday${T}Tue, Apr 14, 2026${T}4-6-0`].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(rows.map(r => r.result_digits)).toEqual(['460']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatch(/NY game "Win 3" not in allowed list \(Numbers\)/);
  });
});

describe('draw-count guard (DATA-06 "two results for one draw")', () => {
  it('keeps a tagged Double Draw bonus drawing as a second evening row', () => {
    const text = ['New Jersey',
      `Pick 3 Evening${T}Thu, Jul 9, 2026${T}7-2-5, Fireball: 5`,
      `Pick 3 Evening${T}Thu, Jul 9, 2026${T}1-5-1Green Ball Double Draw`,
    ].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(skipped).toEqual([]);
    expect(rows.map(r => r.result_digits)).toEqual(['725', '151']);
  });

  it('drops an UNTAGGED second result for a one-draw slot, loudly, keeping the first', () => {
    const text = ['Florida',
      `Pick 3 Evening${T}Tue, Apr 14, 2026${T}6-5-6`,
      `Pick 3 Evening${T}Tue, Apr 14, 2026${T}8-8-1`,
    ].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(rows.map(r => r.result_digits)).toEqual(['656']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatch(/^CONFLICT: FL 2026-04-14 evening already has 656.*dropped a different result 881/);
  });

  it('drops an identical repeat quietly as DUPLICATE', () => {
    const text = ['Florida', `Pick 3 Evening${T}Tue, Apr 14, 2026${T}6-5-6`, `Pick 3 Evening${T}Tue, Apr 14, 2026${T}6-5-6`].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(rows).toHaveLength(1);
    expect(skipped[0]).toMatch(/^DUPLICATE: FL 2026-04-14 evening 656/);
  });

  it('allows two different draws per session for the four-draw states, but not three', () => {
    const text = ['Georgia',
      `Cash 3 Evening${T}Thu, Sep 17, 2026${T}8-1-0`,
      `Cash 3 Night${T}Thu, Sep 17, 2026${T}5-8-5`,
      `Cash 3 Night${T}Thu, Sep 17, 2026${T}0-0-0`,
    ].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(rows.map(r => r.result_digits)).toEqual(['810', '585']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatch(/^CONFLICT: GA 2026-09-17 evening already has 810\/585/);
  });
});

describe('evening-only jurisdictions (DATA-06 LA/NE class)', () => {
  it('KEEPS a midday row for an evening-only state but emits a SUSPECT warning', () => {
    const text = ['Louisiana', `Pick 3 Midday${T}Fri, Apr 17, 2026${T}4-8-6`].join('\n');
    const { rows, skipped, warnings } = parseRawLedgerData(text);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^SUSPECT: LA has never had a midday draw/);
  });

  it('emits no warning for a normal evening row', () => {
    const text = ['Louisiana', `Pick 3${T}Fri, Apr 17, 2026${T}6-1-9`].join('\n');
    const { rows, warnings } = parseRawLedgerData(text);
    expect(rows[0]).toMatchObject({ jurisdiction: 'LA', session: 'evening', result_digits: '619' });
    expect(warnings).toEqual([]);
  });
});

describe('excluded and unknown headers', () => {
  it('drops Maryland and Puerto Rico blocks', () => {
    const text = ['Maryland', `Pick 3 Midday${T}Tue, Apr 14, 2026${T}1-1-1`, 'Puerto Rico', `Pega 3 Día${T}Tue, Apr 14, 2026${T}2-2-2`].join('\n');
    const { rows } = parseRawLedgerData(text);
    expect(rows).toEqual([]);
  });

  it('fails safe on an unknown header: its lines are skipped, not attributed to the previous state', () => {
    const text = ['Arizona', `Pick 3 Midday${T}Fri, Jul 10, 2026${T}4-2-9`, 'Atlantis', `Pick 3 Midday${T}Fri, Jul 10, 2026${T}9-9-9`].join('\n');
    const { rows, skipped } = parseRawLedgerData(text);
    expect(rows.map(r => r.jurisdiction)).toEqual(['AZ']);
    expect(skipped[0]).toMatch(/data before any valid state\/region/);
  });
});
