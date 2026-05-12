/**
 * One-off: compute 5/12 slates locally under multiple configs and check against
 * user-provided midday draws. Read-only.
 */
import { computeSlateAsOf } from '../backtest/replay.js';
import { CONFIGS } from '../backtest/configs.js';
import { toComboSet } from '../../lib/engineCore.js';

const DATE = '2026-05-12';

const MIDDAY_DRAWS = [
  '050','829','237','624','448','949','143','847','162','686','399','382','252','309','316','208','065','120','309','309','893','223','096','374','640','878','411','273','513','709','211','335','020','309','148','677','333',
];
const drawBoxes = new Set(MIDDAY_DRAWS.map(toComboSet));

const CONFIGS_TO_TEST = ['default', 'floor70', 'legacy', 'tieredCD_15_5_3', 'intel_tuned'];

async function main() {
  console.log(`\n=== 5/12 SLATE DIAGNOSTIC (config-by-config picks vs midday draws) ===\n`);

  for (const name of CONFIGS_TO_TEST) {
    const cfg = CONFIGS[name];
    if (!cfg) continue;

    for (const scope of ['midday', 'allday'] as const) {
      const picks = await computeSlateAsOf(DATE, scope, cfg, 'balanced');
      const hits = picks.filter(p => drawBoxes.has(p.comboSet));
      const hitNote = hits.length > 0
        ? `  ✅ ${hits.length} BOX HIT(s): ${hits.map(h => `${h.combo}/${h.comboSet}`).join(', ')}`
        : '  ❌ ZERO hits';
      console.log(
        `${name.padEnd(20)} ${scope.padEnd(7)}:  ${picks.map(p => `${p.combo}(e=${p.energy})`).join(' ')}${hitNote}`,
      );
    }
    console.log();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
