/**
 * generate-weight-proposal — Supabase Edge Function
 *
 * Scheduled weekly (Sunday 09:00 UTC = 05:00 EDT / 04:00 EST) per the
 * Weight Proposal System work order. Runs gates G1 + G2 + G5 (sample
 * size, AUC improvement, per-scope respect) and writes either a
 * weight_proposal_generated or weight_proposal_blocked audit_logs row.
 *
 * IMPORTANT: This edge function runs a SUBSET of the gates the Node
 * harness runs. It deliberately SKIPS G3 (historical backtest) and G4
 * (divergence) because those require the engine codebase
 * (engines/zk6.ts + scripts/backtest/*) which isn't ported to Deno.
 *
 * The audit row carries `g3_status: 'skipped_edge'` and
 * `g4_status: 'skipped_edge'` so the admin UI can warn operators that
 * scheduled proposals lack backtest validation. Operators who want G3
 * evidence before approving a high-stakes proposal should run
 * `npm run autotune:propose -- --manual` which runs all 5 gates locally.
 *
 * Parity with the Node version: G1 thresholds, G2 thresholds, G5
 * per-scope logic are bit-identical to scripts/intel-tuning/generate-
 * proposal.ts.
 *
 * POST body (all optional):
 *   { "dry": boolean }   // if true, returns the proposal without writing audit_logs
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const SCOPES = ['midday', 'evening', 'allday'] as const;
type Scope = typeof SCOPES[number];

const SAMPLE_SIZE_MIN = 500;
const AUC_DELTA_MIN = 0.02;
const LOOKBACK_DAYS = 30;
const PROPOSAL_EXPIRY_DAYS = 7;

interface WeightSet { BOX: number; PBURST: number; CO: number; DGC: number }

interface ProductionWeights {
  global: { balanced: WeightSet; conservative: WeightSet; aggressive: WeightSet };
  byScope: Partial<Record<Scope, { balanced?: WeightSet; conservative?: WeightSet; aggressive?: WeightSet }>>;
  rawByKey: Record<string, string>;
}

interface DiRow {
  signal_box: number | null;
  signal_pburst: number | null;
  signal_co: number | null;
  signal_dgc: number | null;
  hit_box: boolean | null;
  hit_straight: boolean | null;
}

const sbHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
});

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`sbGet ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function sbPost(path: string, body: unknown, prefer = 'return=representation'): Promise<unknown> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: prefer },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`sbPost ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ── Production weights loader (per-scope-respecting) ──

async function loadProductionWeights(): Promise<ProductionWeights> {
  const keys: string[] = [
    'engine_weights_balanced', 'engine_weights_conservative', 'engine_weights_aggressive',
    ...SCOPES.flatMap(s => [
      `engine_weights_balanced_${s}`,
      `engine_weights_conservative_${s}`,
      `engine_weights_aggressive_${s}`,
    ]),
  ];
  const rows = await sbGet<{ key: string; value: string }[]>(
    `/rest/v1/app_config?key=in.(${keys.join(',')})&select=key,value`,
  );
  const rawByKey: Record<string, string> = {};
  if (Array.isArray(rows)) for (const r of rows) rawByKey[r.key] = r.value;

  const pct2dec = (v: number) => v > 1 ? v / 100 : v;
  const parseWs = (raw: string | undefined): WeightSet | null => {
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        BOX:    pct2dec(parsed.BOX    ?? parsed.box    ?? 0),
        PBURST: pct2dec(parsed.PBURST ?? parsed.pburst ?? 0),
        CO:     pct2dec(parsed.CO     ?? parsed.co     ?? 0),
        DGC:    pct2dec(parsed.DGC    ?? parsed.dgc    ?? 0.10),
      };
    } catch { return null; }
  };

  const defaultB: WeightSet = { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 };
  const defaultC: WeightSet = { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 };
  const defaultA: WeightSet = { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 };

  const global = {
    balanced:     parseWs(rawByKey['engine_weights_balanced'])     ?? defaultB,
    conservative: parseWs(rawByKey['engine_weights_conservative']) ?? defaultC,
    aggressive:   parseWs(rawByKey['engine_weights_aggressive'])   ?? defaultA,
  };

  const byScope: ProductionWeights['byScope'] = {};
  for (const s of SCOPES) {
    const ws: { balanced?: WeightSet; conservative?: WeightSet; aggressive?: WeightSet } = {};
    const b = parseWs(rawByKey[`engine_weights_balanced_${s}`]);
    const c = parseWs(rawByKey[`engine_weights_conservative_${s}`]);
    const a = parseWs(rawByKey[`engine_weights_aggressive_${s}`]);
    if (b) ws.balanced = b;
    if (c) ws.conservative = c;
    if (a) ws.aggressive = a;
    if (Object.keys(ws).length > 0) byScope[s] = ws;
  }
  return { global, byScope, rawByKey };
}

// ── AUC fitter (ported from scripts/intel-tuning/fit.ts) ──

const SIGNAL_KEYS = ['signal_box', 'signal_pburst', 'signal_co', 'signal_dgc'] as const;
type SignalKey = typeof SIGNAL_KEYS[number];

function computeAUC(samples: { score: number; positive: boolean }[]): number {
  samples.sort((a, b) => a.score - b.score);
  let nPos = 0, nNeg = 0, posRankSum = 0;
  let i = 0;
  while (i < samples.length) {
    let j = i;
    while (j < samples.length && samples[j].score === samples[i].score) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      if (samples[k].positive) { nPos++; posRankSum += avgRank; } else nNeg++;
    }
    i = j;
  }
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (posRankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

interface FitResult {
  n: number;
  auc: Record<SignalKey, number>;
  weights: WeightSet;
}

function fitWeights(rows: DiRow[]): FitResult {
  const auc: Record<SignalKey, number> = {
    signal_box: 0.5, signal_pburst: 0.5, signal_co: 0.5, signal_dgc: 0.5,
  };
  for (const key of SIGNAL_KEYS) {
    const samples = rows
      .filter(r => typeof r[key] === 'number')
      .map(r => ({ score: r[key] as number, positive: !!(r.hit_box || r.hit_straight) }));
    auc[key] = computeAUC(samples);
  }
  const lift: Record<SignalKey, number> = {
    signal_box:    Math.max(0, auc.signal_box    - 0.5),
    signal_pburst: Math.max(0, auc.signal_pburst - 0.5),
    signal_co:     Math.max(0, auc.signal_co     - 0.5),
    signal_dgc:    Math.max(0, auc.signal_dgc    - 0.5),
  };
  const liftSum = lift.signal_box + lift.signal_pburst + lift.signal_co + lift.signal_dgc;
  const weights: WeightSet = liftSum > 0
    ? {
        BOX:    lift.signal_box    / liftSum,
        PBURST: lift.signal_pburst / liftSum,
        CO:     lift.signal_co     / liftSum,
        DGC:    lift.signal_dgc    / liftSum,
      }
    : { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 };
  return { n: rows.length, auc, weights };
}

// ── Gates ──

interface GateResult { name: string; passed: boolean; reason: string; details: unknown }

async function gateSampleSize(): Promise<GateResult> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceStr = since.toISOString().split('T')[0];
  const rows = await sbGet<{ id: string }[]>(
    `/rest/v1/adaptive_tracking?slate_date=gte.${sinceStr}&mode=eq.balanced&rank=gte.1&rank=lte.6&or=(hit_box.eq.true,hit_straight.eq.true,result_at.not.is.null)&select=id&limit=10000`,
  );
  const n = Array.isArray(rows) ? rows.length : 0;
  return {
    name: 'G1_sample_size',
    passed: n >= SAMPLE_SIZE_MIN,
    reason: `n=${n} adaptive_tracking outcomes in last ${LOOKBACK_DAYS}d (threshold ${SAMPLE_SIZE_MIN})`,
    details: { n, threshold: SAMPLE_SIZE_MIN, lookback_days: LOOKBACK_DAYS },
  };
}

function indicatorAUC(rows: { signal_box: number; signal_pburst: number; signal_co: number; signal_dgc: number; hit: boolean }[], w: WeightSet): number {
  const samples = rows.map(r => ({
    score: w.BOX * r.signal_box + w.PBURST * r.signal_pburst + w.CO * r.signal_co + w.DGC * r.signal_dgc,
    positive: r.hit,
  }));
  return computeAUC(samples);
}

async function gateAucImprovement(prod: ProductionWeights, proposed: WeightSet, di: DiRow[]): Promise<GateResult & { proposedAuc: number; currentAuc: number }> {
  const useable = di.filter(r =>
    typeof r.signal_box === 'number' || typeof r.signal_pburst === 'number' ||
    typeof r.signal_co === 'number'  || typeof r.signal_dgc === 'number'
  ).map(r => ({
    signal_box:    typeof r.signal_box    === 'number' ? r.signal_box    : 0,
    signal_pburst: typeof r.signal_pburst === 'number' ? r.signal_pburst : 0,
    signal_co:     typeof r.signal_co     === 'number' ? r.signal_co     : 0,
    signal_dgc:    typeof r.signal_dgc    === 'number' ? r.signal_dgc    : 0,
    hit: !!(r.hit_box || r.hit_straight),
  }));
  const currentAuc = indicatorAUC(useable, prod.global.balanced);
  const proposedAuc = indicatorAUC(useable, proposed);
  const delta = proposedAuc - currentAuc;
  return {
    name: 'G2_auc_improvement',
    passed: delta >= AUC_DELTA_MIN,
    reason: `current AUC ${currentAuc.toFixed(4)}, proposed AUC ${proposedAuc.toFixed(4)}, delta ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} (threshold +${AUC_DELTA_MIN.toFixed(4)})`,
    details: { currentAuc, proposedAuc, delta, threshold: AUC_DELTA_MIN, n: useable.length },
    proposedAuc,
    currentAuc,
  };
}

function gatePerScopeRespect(prod: ProductionWeights, proposed: WeightSet): GateResult & { apply_ops: { key: string; value: unknown }[]; revert_ops: { key: string; value: unknown }[] } {
  const apply_ops: { key: string; value: unknown }[] = [];
  const revert_ops: { key: string; value: unknown }[] = [];
  const scopesWithBalancedOverride = SCOPES.filter(s => prod.byScope[s]?.balanced);
  const noScopeHasOverride = scopesWithBalancedOverride.length === 0;
  const toPercentObj = (w: WeightSet) => ({
    BOX: +(w.BOX * 100).toFixed(2),
    PBURST: +(w.PBURST * 100).toFixed(2),
    CO: +(w.CO * 100).toFixed(2),
    DGC: +(w.DGC * 100).toFixed(2),
  });
  const toPercentObjFromExisting = (raw: string | undefined): unknown | null => {
    if (!raw) return null;
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  };
  const keyMappings: { proposedKey: string; isPerScope: boolean; scope?: Scope }[] = [];

  if (noScopeHasOverride) {
    const key = 'engine_weights_balanced';
    apply_ops.push({ key, value: toPercentObj(proposed) });
    revert_ops.push({ key, value: toPercentObjFromExisting(prod.rawByKey[key]) ?? toPercentObj(prod.global.balanced) });
    keyMappings.push({ proposedKey: key, isPerScope: false });
  } else {
    for (const s of scopesWithBalancedOverride) {
      const key = `engine_weights_balanced_${s}`;
      apply_ops.push({ key, value: toPercentObj(proposed) });
      revert_ops.push({ key, value: toPercentObjFromExisting(prod.rawByKey[key]) ?? toPercentObj(prod.byScope[s]!.balanced!) });
      keyMappings.push({ proposedKey: key, isPerScope: true, scope: s });
    }
  }
  return {
    name: 'G5_per_scope_respect',
    passed: true,
    reason: noScopeHasOverride
      ? 'no per-scope overrides exist; will update global engine_weights_balanced'
      : `per-scope overrides exist for ${scopesWithBalancedOverride.join(', ')}; will update per-scope keys ONLY (global left untouched)`,
    details: { keyMappings, scopes_with_override: scopesWithBalancedOverride, none_overridden: noScopeHasOverride },
    apply_ops,
    revert_ops,
  };
}

// ── audit_logs writer ──

async function writeAuditLog(action: string, target: string, payload_meta: unknown): Promise<string> {
  const rows = await sbPost('/rest/v1/audit_logs', {
    actor_id: 'autotune_edge',
    action,
    target,
    payload_meta,
  }) as { id: string }[];
  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as { id: string });
  return row?.id ?? '';
}

// ── HTTP handler ──

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  const started = Date.now();
  let body: { dry?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const dry = body.dry === true;

  try {
    // Phase 1: load data
    const prod = await loadProductionWeights();

    const since = new Date(); since.setDate(since.getDate() - LOOKBACK_DAYS);
    const start = since.toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];
    const di = await sbGet<DiRow[]>(
      `/rest/v1/daily_intelligence?select=signal_box,signal_pburst,signal_co,signal_dgc,hit_box,hit_straight,slate_date,scope,rank` +
      `&slate_date=gte.${start}&slate_date=lte.${end}&mode=eq.balanced&order=slate_date.asc&limit=20000`,
    );
    const diEvaluated = (Array.isArray(di) ? di : []).filter(r => r.hit_box !== null || r.hit_straight !== null);

    // Phase 2: fit proposed
    const fit = fitWeights(diEvaluated);
    const proposedBalanced = fit.weights;

    // Phase 3: gates
    const allResults: GateResult[] = [];
    const g1 = await gateSampleSize();
    allResults.push(g1);
    const g2 = await gateAucImprovement(prod, proposedBalanced, diEvaluated);
    allResults.push(g2);
    const g5 = gatePerScopeRespect(prod, proposedBalanced);
    allResults.push(g5);

    // Phase 4: decide
    const blockedBy = allResults.find(r => !r.passed);
    const expires_at = new Date(Date.now() + PROPOSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const baseMeta = {
      proposed_weights: { balanced: proposedBalanced },
      current_weights: { global: prod.global, byScope: prod.byScope },
      all_gate_results: allResults,
      auc: fit.auc,
      lookback_days: LOOKBACK_DAYS,
      generator_version: 'edge_v1',
      g3_status: 'skipped_edge',
      g4_status: 'skipped_edge',
      g3_skip_reason: 'Historical backtest gate requires the Node engine codebase which is not ported to Deno. Run `npm run autotune:propose -- --manual` for full backtest validation before approving high-stakes proposals.',
    };

    if (blockedBy) {
      const payload = { ...baseMeta, reason: blockedBy.reason, gate_that_blocked: blockedBy.name };
      const id = dry ? null : await writeAuditLog('weight_proposal_blocked', 'autotune', payload);
      return new Response(JSON.stringify({
        ok: true, status: 'blocked', dry, gate_that_blocked: blockedBy.name, reason: blockedBy.reason,
        audit_log_id: id, durationMs: Date.now() - started,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const payload = {
      ...baseMeta,
      apply_ops: g5.apply_ops,
      revert_ops: g5.revert_ops,
      expires_at,
    };
    const id = dry ? null : await writeAuditLog('weight_proposal_generated', 'autotune', payload);
    return new Response(JSON.stringify({
      ok: true, status: 'generated', dry, proposed: proposedBalanced, expires_at,
      apply_ops_count: g5.apply_ops.length, audit_log_id: id,
      durationMs: Date.now() - started,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ ok: false, error: msg, durationMs: Date.now() - started }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
