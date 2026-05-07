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

export async function applyDataDrivenWeights(): Promise<void> {
  console.log('[weightUpdate] Applying data-driven weight presets to app_config…');

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
