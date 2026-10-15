import { parsePageInsights, splitCells } from '../lib/pageInsightsParser';

const PASTE = `sep=,
"Approximate earnings"
"Date","Primary","content_monetization","stars","subscriptions"
"2026-10-13T00:00:00","2.04","0.3","0","1.74"
"2026-10-14T00:00:00","4.26","0.4","0","3.86"

sep=,
"Approximate earnings"
"Date","Primary"
"2026-10-13T00:00:00","1.74"
"2026-10-14T00:00:00","3.86"

sep=,
"Age & gender"
"","Women","Men"
"18-24","0.9","1"
"65+","17.1","5.2"

"Top cities"
"New York, NY","Chicago, IL"
"1.5","0.6"

sep=,
"Viewers"
"Date","Primary"
"2026-10-13T00:00:00","2317"
"2026-10-14T00:00:00","2371"

sep=,
"Content interactions"
"Date","Primary"
"2026-10-13T00:00:00","157"
"2026-10-14T00:00:00","161"

sep=,
"Facebook follows"
"Date","Primary"
"2026-10-13T00:00:00","3"
"2026-10-14T00:00:00","4"

sep=,
"Subscribers"
"FB_PAGE,SUBSCRIBE,UNIQUE_USERS"
"52"

"Gained subscribers"
"FB_PAGE,SUBSCRIBE_GAINED,UNIQUE_USERS"
"12"

"Canceled subscribers"
"FB_PAGE,SUBSCRIBE_CANCELED,UNIQUE_USERS"
"14"

"Untitled"
"Date","FB_PAGE,SUBSCRIBE,UNIQUE_USERS"
"2026-10-13T00:00:00","52"
"2026-10-14T00:00:00","0"

sep=,
"Views"
"Reels","Links","Photo"
"169467","127148","10895"

"Published content"
"Stories","Reels","Photos"
"90","80","18"
`;

describe('splitCells', () => {
  it('keeps commas inside quoted cells', () => {
    expect(splitCells('"Date","FB_PAGE,SUBSCRIBE,UNIQUE_USERS"')).toEqual(['Date', 'FB_PAGE,SUBSCRIBE,UNIQUE_USERS']);
    expect(splitCells('"New York, NY","1.5"')).toEqual(['New York, NY', '1.5']);
  });
  it('handles unquoted CSV and TSV', () => {
    expect(splitCells('2026-10-14,2371')).toEqual(['2026-10-14', '2371']);
    expect(splitCells('2026-10-14\t2371')).toEqual(['2026-10-14', '2371']);
  });
});

describe('parsePageInsights — the whole paste at once', () => {
  const r = parsePageInsights(PASTE);

  it('merges the four daily series by day', () => {
    expect(r.days).toEqual([
      { day: '2026-10-13', viewers_unique: 2317, content_interactions: 157, follows_new: 3, subscribers_total: 52 },
      { day: '2026-10-14', viewers_unique: 2371, content_interactions: 161, follows_new: 4, subscribers_total: null },
    ]);
    expect(r.metrics.sort()).toEqual(['content_interactions', 'follows_new', 'subscribers_total', 'viewers_unique']);
  });

  it('treats a 0 subscriber count as a partial day', () => {
    expect(r.warnings.some(w => w.includes('partial day'))).toBe(true);
  });

  it('extracts the 5-column earnings block and skips the 2-column one', () => {
    expect(r.earnings).toEqual([
      { earn_date: '2026-10-13', total_usd: 2.04, content_monetization_usd: 0.3, stars_usd: 0, subscriptions_usd: 1.74 },
      { earn_date: '2026-10-14', total_usd: 4.26, content_monetization_usd: 0.4, stars_usd: 0, subscriptions_usd: 3.86 },
    ]);
    expect(r.skipped.some(s => s.startsWith('Approximate earnings (subscriptions-only'))).toBe(true);
  });

  it('reads the subscriber summary counters without storing them as days', () => {
    expect(r.summary).toEqual({ subscribers: 52, gained: 12, canceled: 14 });
  });

  it('skips audience and content-type blocks by name and never emits them as days', () => {
    for (const t of ['Age & gender', 'Top cities', 'Views', 'Published content']) expect(r.skipped).toContain(t);
    expect(r.days.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d.day))).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe('parsePageInsights — single exports', () => {
  it('accepts one series on its own', () => {
    const r = parsePageInsights('sep=,\n"Viewers"\n"Date","Primary"\n"2026-10-14T00:00:00","2371"\n');
    expect(r.days).toEqual([{ day: '2026-10-14', viewers_unique: 2371 }]);
    expect(r.metrics).toEqual(['viewers_unique']);
  });
  it('errors on a paste with nothing page-level in it', () => {
    const r = parsePageInsights('"Top cities"\n"New York, NY"\n"1.5"\n');
    expect(r.days).toEqual([]);
    expect(r.errors.length).toBe(1);
  });
});
