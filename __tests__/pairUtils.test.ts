import { getPairs, normalizePairKey } from '../lib/pairUtils';

describe('getPairs', () => {
  it('extracts front, back, and split pairs from a 3-digit combo', () => {
    expect(getPairs('123')).toEqual({ front: '12', back: '23', split: '13' });
    expect(getPairs('789')).toEqual({ front: '78', back: '89', split: '79' });
  });

  it('returns empty strings for non-3-digit input', () => {
    expect(getPairs('12')).toEqual({ front: '', back: '', split: '' });
    expect(getPairs('')).toEqual({ front: '', back: '', split: '' });
    expect(getPairs('1234')).toEqual({ front: '', back: '', split: '' });
  });

  it('handles leading zeros', () => {
    expect(getPairs('012')).toEqual({ front: '01', back: '12', split: '02' });
  });
});

describe('normalizePairKey', () => {
  it('sorts digits for consistent key format', () => {
    expect(normalizePairKey('21')).toBe('12');
    expect(normalizePairKey('12')).toBe('12');
    expect(normalizePairKey('98')).toBe('89');
  });

  it('returns empty string for empty input', () => {
    expect(normalizePairKey('')).toBe('');
  });
});
