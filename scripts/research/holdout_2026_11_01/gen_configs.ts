import { CONFIGS } from '../../backtest/configs.js';
import { writeFileSync } from 'fs';
const base: any = CONFIGS.pair_dedupe;
const W = (b: number, p: number, c: number, d: number) => {
  const ws = { BOX: b, PBURST: p, CO: c, DGC: d };
  const all = { balanced: ws, conservative: ws, aggressive: ws };
  return { presets: all, presetByScope: { midday: all, evening: all, allday: all } };
};
const cfgs: Record<string, any> = {
  parity: base,
  eq: { ...base, ...W(0.25, 0.25, 0.25, 0.25) },
  box_only: { ...base, ...W(1, 0, 0, 0) },
  pburst_only: { ...base, ...W(0, 1, 0, 0) },
  co_only: { ...base, ...W(0, 0, 1, 0) },
  dgc_only: { ...base, ...W(0, 0, 0, 1) },
  box_heavy: { ...base, ...W(0.8, 0.1, 0.05, 0.05) },
  pburst_heavy: { ...base, ...W(0.2, 0.6, 0.1, 0.1) },
  co_heavy: { ...base, ...W(0.2, 0.2, 0.5, 0.1) },
  dgc_heavy: { ...base, ...W(0.2, 0.2, 0.1, 0.5) },
  anti_eq: { ...base, ...W(-0.25, -0.25, -0.25, -0.25) },
  press_invert: { ...base, boxFreqWeight: 0.6, boxPressureWeight: -0.4, boxFreqWeightByScope: {}, boxPressureWeightByScope: {} },
  press_zero: { ...base, boxFreqWeight: 1.0, boxPressureWeight: 0.0, boxFreqWeightByScope: {}, boxPressureWeightByScope: {} },
  press_only: { ...base, boxFreqWeight: 0.0, boxPressureWeight: 1.0, boxFreqWeightByScope: {}, boxPressureWeightByScope: {} },
  singles_only: { ...base, rails: { ...base.rails, singlesMax: 6, doublesMax: 0 } },
  doubles3: { ...base, rails: { ...base.rails, singlesMax: 3, doublesMax: 3 } },
  cooldown_off: { ...base, recentHitCooldown: 0, recentHitCooldownByScope: { midday: 0, evening: 0, allday: 0 }, recentHitBlockDaysByScope: { midday: 1, evening: 1, allday: 1 }, slateStalenessThresholdByScope: { midday: 0, evening: 0, allday: 0 } },
  cooldown_wide: { ...base, recentHitCooldown: 40, recentHitCooldownByScope: { midday: 40, evening: 40, allday: 40 } },
};
const groups = [['parity','eq','box_only','pburst_only','co_only'],['dgc_only','box_heavy','pburst_heavy','co_heavy'],['dgc_heavy','anti_eq','press_invert','press_zero','press_only'],['singles_only','doubles3','cooldown_off','cooldown_wide']];
groups.forEach((g, i) => { const o: any = {}; for (const k of g) o[k] = cfgs[k]; writeFileSync(`${process.argv[2]}/grid_${i+1}.json`, JSON.stringify(o, null, 1)); });
console.log('base keys', Object.keys(base).join(','));
console.log('base presetByScope', JSON.stringify(base.presetByScope));
console.log('base rails', JSON.stringify(base.rails), 'cd', base.recentHitCooldown, JSON.stringify(base.recentHitCooldownByScope), 'press', base.boxFreqWeight, base.boxPressureWeight, JSON.stringify(base.boxFreqWeightByScope), JSON.stringify(base.boxPressureWeightByScope));
