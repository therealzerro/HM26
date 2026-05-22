/**
 * invoke.ts — invoke both ZK6 paths from the parity harness.
 *
 * Local path: import engines/zk6.ts directly (Node-side, via expo-constants shim).
 * Edge path:  POST to the deployed compute-slate-zk6 function (service-role).
 */

import { getEdgeFunctionUrl, getServiceRoleAuthHeader } from './svc.js';
// @ts-ignore — mjs build helper, no .d.ts
import { buildLocalEngine } from './build-local-engine.mjs';

const EDGE_TIMEOUT_MS = 30_000;

export interface InvokeParams {
  scope: 'midday' | 'evening' | 'allday';
  weightsKey?: 'balanced' | 'conservative' | 'aggressive';
  targetDate: string;  // sandbox date for the partition
}

let bundleModulePromise: Promise<any> | null = null;

/**
 * Invoke engines/zk6.ts in this process. Lazily builds an ESM bundle of the
 * engine (with expo-constants/react-native aliased to our Node shims), then
 * imports computeSlate from it. The bundle is cached for the harness lifetime.
 */
export async function invokeLocal(params: InvokeParams): Promise<any> {
  // The whole point of the local path is to exercise engines/zk6.ts's in-process
  // math. If EXPO_PUBLIC_USE_EDGE_ZK6=true is in the user's .env (which the
  // harness loads), engines/zk6.ts would delegate to the edge fn instead — and
  // the "parity" test would be edge vs edge. Force the flag off for this call.
  process.env.EXPO_PUBLIC_USE_EDGE_ZK6 = 'false';

  // Auth-asymmetry workaround: in production the local engine runs under an
  // admin JWT (admin presses "regen"), which has table-write RLS access. The
  // harness has no admin session, only anon. To compare engine OUTPUTS instead
  // of RLS BEHAVIOR, swap the anon key the bundle's lib/supabase.ts sees with
  // the service-role key. Both paths then write with identical credentials, so
  // any row-level diff isolates engine differences. Documented in the README.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  if (!bundleModulePromise) {
    bundleModulePromise = (async () => {
      const bundlePath = await buildLocalEngine();
      // file:// URL so dynamic import doesn't try TS-paths resolution
      return import(`file://${bundlePath}`);
    })();
  }
  const mod = await bundleModulePromise;
  return mod.computeSlate({
    scope: params.scope,
    weightsKey: params.weightsKey ?? 'balanced',
    targetDate: params.targetDate,
  });
}

/** POST to the deployed compute-slate-zk6 edge function with a 30s timeout. */
export async function invokeEdge(params: InvokeParams): Promise<any> {
  const url = getEdgeFunctionUrl('compute-slate-zk6');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...getServiceRoleAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: params.scope,
        weightsKey: params.weightsKey ?? 'balanced',
        targetDate: params.targetDate,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`[edge] ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`[edge] timed out after ${EDGE_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** HEAD-style ping: invoke a tiny dummy call to confirm the edge fn responds. */
export async function pingEdge(): Promise<boolean> {
  const url = getEdgeFunctionUrl('compute-slate-zk6');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // OPTIONS request returns 204 from the edge fn's CORS handler
    const res = await fetch(url, { method: 'OPTIONS', signal: controller.signal });
    return res.status === 204 || res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
