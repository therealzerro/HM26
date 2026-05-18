import { computeSlate } from '@/engines/zk6';

const SB_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tgagarhwqbdcwoqhpapi.supabase.co';
const SB_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const HEADERS = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates,return=minimal',
};

const NEW_WEIGHTS = {
  engine_weights_balanced:     { BOX: 0.55, PBURST: 0.30, CO: 0.15 },
  engine_weights_conservative: { BOX: 0.75, PBURST: 0.15, CO: 0.10 },
  engine_weights_aggressive:   { BOX: 0.45, PBURST: 0.35, CO: 0.20 },
};

async function upsertConfig(key: string, value: string) {
  await fetch(`${SB_URL}/rest/v1/app_config?key=eq.${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
  });
}

/**
 * ⚠️ WARNING: NOT A DATA-DRIVEN TUNING FUNCTION ⚠️
 *
 * Despite the previous name (`applyDataDrivenWeights`), this function
 * writes HARDCODED weight constants to app_config. It does NOT fit
 * weights from observed data or signals.
 *
 * If activated, it will OVERRIDE all existing per-scope configs
 * (CONFIG-02, CONFIG-07, and any future scope-specific overrides)
 * with flat global values.
 *
 * History: This function was created as a placeholder for adaptive
 * weight tuning but was never wired to actual fitWeights() output.
 * Renamed 2026-05-18 (self-tuning audit follow-up Order 1) to defuse
 * the latent risk of accidental activation based on its prior name.
 *
 * Activation requires either:
 *   1. Rewriting the implementation to use scripts/intel-tuning/fit.ts
 *   2. Adding significance + backtest gates per the self-tuning audit
 *      (docs/self_tuning_audit_2026-05-18.md §7.B)
 *   3. Explicit acknowledgment that hardcoded global override is
 *      intentional for a specific operational scenario
 *
 * CONFIG-01 (2026-05-09 Gemini CLI incident) is the precedent for
 * what happens when this surface is written to without gates.
 */
export async function applyHardcodedWeightOverride(): Promise<void> {
  // Runtime guard: refuses to execute unless explicitly acknowledged.
  // Set to true ONLY with explicit owner sign-off. See function comment
  // block above + docs/self_tuning_audit_2026-05-18.md §7.B before flipping.
  const ACKNOWLEDGED_HARDCODED_OVERRIDE = false;
  if (!ACKNOWLEDGED_HARDCODED_OVERRIDE) {
    throw new Error(
      'applyHardcodedWeightOverride() is gated. See function comment ' +
      'block. To activate, read docs/self_tuning_audit_2026-05-18.md ' +
      'and set ACKNOWLEDGED_HARDCODED_OVERRIDE=true with sign-off.'
    );
  }

  console.log('[weightUpdate] Applying HARDCODED weight override to app_config…');

  await Promise.all(
    Object.entries(NEW_WEIGHTS).map(([key, w]) =>
      upsertConfig(key, JSON.stringify(w)).catch(e =>
        console.warn('[weightUpdate] app_config upsert failed:', key, e)
      )
    )
  );

  console.log('[weightUpdate] app_config updated. Regenerating allday balanced slate…');

  try {
    const snapshot = await computeSlate({ scope: 'allday', weightsKey: 'balanced' });
    const picks = Array.isArray(snapshot.top_k_straights_json)
      ? (snapshot.top_k_straights_json as any[])
      : [];

    console.log('[weightUpdate] ── New Allday Balanced Top 6 ──');
    picks.slice(0, 6).forEach((p: any, i: number) => {
      console.log(`  #${i + 1} ${p.combo}  BOX=${typeof p.box === 'number' ? p.box.toFixed(3) : 'n/a'}  energy=${p.energy}  ds=${p.drawsSince ?? '?'}`);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[weightUpdate] Slate regeneration failed:', msg, e);
  }
}
