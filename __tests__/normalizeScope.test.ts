import { normalizeScope } from '../engines/zk6';

describe('normalizeScope', () => {
  it('returns midday for midday variants', () => {
    expect(normalizeScope('midday')).toBe('midday');
    expect(normalizeScope('MIDDAY')).toBe('midday');
    expect(normalizeScope('mid_day')).toBe('midday');
    expect(normalizeScope('mid-day')).toBe('midday');
  });

  it('returns evening for evening variants', () => {
    expect(normalizeScope('evening')).toBe('evening');
    expect(normalizeScope('EVENING')).toBe('evening');
  });

  it('defaults to allday for unknown or allday variants', () => {
    expect(normalizeScope('allday')).toBe('allday');
    expect(normalizeScope('all-day')).toBe('allday');
    expect(normalizeScope('all_day')).toBe('allday');
    expect(normalizeScope('ALLDAY')).toBe('allday');
    expect(normalizeScope('unknown')).toBe('allday');
    expect(normalizeScope('')).toBe('allday');
  });
});
