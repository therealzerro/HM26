import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { adminOpsFetch } from '@/lib/adminOps';
import { alertAsync } from '@/lib/confirm';
import { SectionTitle, Card, useSt } from './AdminShared';
import { ProposalRegenBanner } from './ProposalRegenBanner';

type ScopeName = 'midday' | 'evening' | 'allday';
const SCOPE_NAMES: ScopeName[] = ['midday', 'evening', 'allday'];

// ─── Engine Config View ───────────────────────────────────────────────────────
export default function EngineConfigView({ regenerateSlate, onOpenProposals }: { regenerateSlate?: (scope: any, weightsKey?: any) => Promise<any>; onOpenProposals?: () => void }) {
  const { colors } = useTheme();
  const st = useSt();
  // E4 (2026-05-13): DGC is now visible. Defaults match engine production
  // (49.5/27/13.5/10) so Reset aligns with what the engine currently runs.
  // SCRUB-01 (2026-05-27): production is balanced-only. Conservative + aggressive
  // removed from the editor. Save no longer writes their app_config rows
  // (the existing legacy rows remain until 2026-06-03 review cleanup).
  const DEFAULT_PRESETS: Record<string, Record<string, number>> = {
    balanced: { BOX: 49.5, PBURST: 27, CO: 13.5, DGC: 10 },
  };

  const HORIZONS = ['H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y'];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenning, setRegenning] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // SCRUB-01: wPreset retained for the few callers below that still reference
  // it; it's always 'balanced' now.
  const [wPreset] = useState<'balanced'>('balanced');
  const [presets, setPresets]         = useState(DEFAULT_PRESETS);
  const [singlesMax, setSinglesMax]   = useState(4);
  const [doublesMax, setDoublesMax]   = useState(2);
  const [pairRepCap, setPairRepCap]   = useState(2);
  const [triplesOn, setTriplesOn]     = useState(false);
  const [defaultScope, setDefaultScope] = useState('midday');

  const DEFAULT_HORIZON_WEIGHTS: Record<string, number> = { H01Y:35, H02Y:22, H03Y:14, H04Y:9, H05Y:6, H06Y:4.5, H07Y:3, H08Y:2.5, H09Y:2, H10Y:2 };
  const [horizonWeights, setHorizonWeights] = useState<Record<string, number>>(DEFAULT_HORIZON_WEIGHTS);
  const [pressureThreshold, setPressureThreshold] = useState(250);
  const [minEnergyThreshold, setMinEnergyThreshold] = useState(0);
  const [recentHitCooldown, setRecentHitCooldown] = useState(20);
  // E1 (2026-05-13): per-scope cooldown overrides. null = no override (engine
  // falls back to global recentHitCooldown). Mirrors the CONFIG-05 production
  // mechanism: app_config keys `recent_hit_cooldown_${scope}` overlay the global.
  const [scopeCooldowns, setScopeCooldowns] = useState<Record<ScopeName, number | null>>({
    midday: null, evening: null, allday: null,
  });
  // ENGINE-UI-01 (2026-06-06): read-only mirror of per-scope signal-weight
  // overrides (`engine_weights_balanced_${scope}` rows). Production reads these
  // FIRST via the CONFIG-07 mechanism; the editor above shows only the global
  // preset. Without surfacing these, "Reset to defaults" silently degrades
  // scopes that have overrides — e.g. midday's CO=64% override would be
  // invisible. State is read-only (no save path) to prevent operators from
  // bypassing the CLAUDE.md backtest gate via the UI. To change per-scope
  // weights, add a CONFIG-XX entry + backtest + SQL ship per MASTER_AUDIT.
  type WeightSet = { BOX: number; PBURST: number; CO: number; DGC: number };
  const [perScopeWeights, setPerScopeWeights] = useState<Record<ScopeName, WeightSet | null>>({
    midday: null, evening: null, allday: null,
  });
  // Snapshot of scope overrides at last load — used to compute which keys to
  // DELETE when the user clears an override (was non-null at load, now null).
  const [loadedScopeCooldowns, setLoadedScopeCooldowns] = useState<Record<ScopeName, number | null>>({
    midday: null, evening: null, allday: null,
  });
  const [previewModal, setPreviewModal] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [backtestModalOpen, setBacktestModalOpen] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{ written: number; deleted: number } | null>(null);
  const [synergyOn, setSynergyOn] = useState(false);
  const [synergyWeight, setSynergyWeight] = useState(0.15);

  // E6 (2026-05-13): snapshot of all editable state at last load. Compared
  // against current state to drive the "● Unsaved changes" badge. Loaded
  // snapshot updates after every successful save so the badge resets.
  const [loadedSnapshot, setLoadedSnapshot] = useState<string>('');

  // ENH-AFL-2 (2026-05-27): per-scope rolling AUC + the would-be adaptive
  // weights, shown read-only for operator transparency. Flag is OFF in prod.
  type ScopeAuc = { BOX: number; PBURST: number; CO: number; DGC: number; nDays: number };
  const [adaptiveAuc, setAdaptiveAuc] = useState<Record<string, ScopeAuc | null>>({ midday: null, evening: null, allday: null });
  const [adaptiveFlagOn, setAdaptiveFlagOn] = useState<boolean>(false);
  const [adaptiveAlpha, setAdaptiveAlphaState] = useState<number>(1.0);
  const loadAdaptiveAuc = useCallback(async () => {
    try {
      const sinceDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/signal_auc_per_day?day=gte.${sinceDate}&select=scope,signal,auc,day&limit=500`,
      });
      if (!Array.isArray(rows)) return;
      const acc: Record<string, Record<string, number[]>> = {
        midday:  { BOX: [], PBURST: [], CO: [], DGC: [] },
        evening: { BOX: [], PBURST: [], CO: [], DGC: [] },
        allday:  { BOX: [], PBURST: [], CO: [], DGC: [] },
      };
      for (const r of rows) {
        if (acc[r.scope] && acc[r.scope][r.signal] && typeof r.auc === 'number') {
          acc[r.scope][r.signal].push(r.auc);
        }
      }
      const out: Record<string, ScopeAuc | null> = { midday: null, evening: null, allday: null };
      for (const sc of ['midday', 'evening', 'allday']) {
        const buckets = acc[sc];
        const minDays = Math.min(buckets.BOX.length, buckets.PBURST.length, buckets.CO.length, buckets.DGC.length);
        if (minDays === 0) continue;
        const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
        out[sc] = {
          BOX: avg(buckets.BOX), PBURST: avg(buckets.PBURST),
          CO: avg(buckets.CO), DGC: avg(buckets.DGC),
          nDays: minDays,
        };
      }
      setAdaptiveAuc(out);
    } catch (e) { console.warn('[ENH-AFL-2] AUC load failed', e); }
  }, []);
  const loadAdaptiveFlags = useCallback(async () => {
    try {
      const rows = await fetchFromSupabase<{ key: string; value: string }[]>({
        path: '/rest/v1/app_config?key=in.(adaptive_signal_weights_enabled,adaptive_signal_weights_alpha)&select=key,value',
      });
      if (!Array.isArray(rows)) return;
      for (const r of rows) {
        if (r.key === 'adaptive_signal_weights_enabled') setAdaptiveFlagOn(r.value === 'true');
        if (r.key === 'adaptive_signal_weights_alpha') {
          const v = parseFloat(r.value);
          if (!isNaN(v)) setAdaptiveAlphaState(v);
        }
      }
    } catch (e) { console.warn('[ENH-AFL-2] flag load failed', e); }
  }, []);
  // E8 (2026-05-13): recent config_change rows from audit_logs, rendered as
  // a 3-row history strip near the top so operators see what's been tuned
  // recently without leaving the screen.
  const [recentChanges, setRecentChanges] = useState<{ created_at: string; payload_meta: any }[]>([]);
  const loadRecentConfigChanges = useCallback(async () => {
    try {
      const rows = await fetchFromSupabase<any[]>({
        path: '/rest/v1/audit_logs?action=eq.config_change&order=created_at.desc&limit=3&select=created_at,payload_meta',
      });
      if (Array.isArray(rows)) setRecentChanges(rows);
    } catch (e) {
      console.warn('[engine-config] load recent changes failed:', e);
    }
  }, []);

  const w = presets[wPreset] ?? DEFAULT_PRESETS.balanced;
  const horizonSum = Object.values(horizonWeights).reduce((a, b) => a + b, 0);

  // E6: snapshot the editable surface area as a stable JSON string. Compared
  // against loadedSnapshot to detect unsaved changes. Cheaper than deep-equal
  // and stable as long as serialization order is deterministic.
  const currentSnapshot = useMemo(() => JSON.stringify({
    presets, singlesMax, doublesMax, pairRepCap, triplesOn, defaultScope,
    horizonWeights, pressureThreshold, minEnergyThreshold, recentHitCooldown,
    scopeCooldowns, synergyOn, synergyWeight,
  }), [presets, singlesMax, doublesMax, pairRepCap, triplesOn, defaultScope, horizonWeights, pressureThreshold, minEnergyThreshold, recentHitCooldown, scopeCooldowns, synergyOn, synergyWeight]);
  const isDirty = loadedSnapshot !== '' && currentSnapshot !== loadedSnapshot;

  // ── Load config from app_config table ──
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchFromSupabase<{ key: string; value: string }[]>({
        path: '/rest/v1/app_config?select=key,value',
      });
      if (!Array.isArray(rows)) return;
      const cfg: Record<string, string> = {};
      rows.forEach(r => { cfg[r.key] = r.value; });

      // E2 (2026-05-13): stripped reads for dead keys (engine_preset,
      // drawing_confidence_on, burst_signal_on, pressure_bonus_weight,
      // auto_gen_slates, morning_gen_time, evening_gen_time). Existing rows in
      // app_config are left in place — engine doesn't read them so they're
      // harmless. Stop writing them on save, drop the UI controls.
      if (cfg.synergy_boost_on)      setSynergyOn(cfg.synergy_boost_on === 'true');
      if (cfg.synergy_boost_weight)  setSynergyWeight(parseFloat(cfg.synergy_boost_weight) || 0.15);
      if (cfg.k6_triples_on)         setTriplesOn(cfg.k6_triples_on === 'true');
      if (cfg.k6_singles_max)        { const v = parseInt(cfg.k6_singles_max, 10); setSinglesMax(Number.isNaN(v) ? 4 : v); }
      if (cfg.k6_doubles_max !== undefined) { const v = parseInt(cfg.k6_doubles_max, 10); setDoublesMax(Number.isNaN(v) ? 2 : v); }
      if (cfg.pair_rep_cap)          { const v = parseInt(cfg.pair_rep_cap, 10); setPairRepCap(Number.isNaN(v) ? 2 : v); }
      if (cfg.default_scope)         setDefaultScope(cfg.default_scope);
      if (cfg.pressure_threshold)    setPressureThreshold(parseInt(cfg.pressure_threshold, 10) || 250);
      if (cfg.min_energy_threshold)  setMinEnergyThreshold(parseInt(cfg.min_energy_threshold, 10) || 0);
      if (cfg.recent_hit_cooldown)   setRecentHitCooldown(parseInt(cfg.recent_hit_cooldown, 10) || 0);
      if (cfg.horizon_weights) {
        try { setHorizonWeights({ ...DEFAULT_HORIZON_WEIGHTS, ...JSON.parse(cfg.horizon_weights) }); } catch {}
      }

      // E1: per-scope cooldown overrides (CONFIG-05). null when no override row.
      const scopeOverrides: Record<ScopeName, number | null> = {
        midday: null, evening: null, allday: null,
      };
      for (const sc of SCOPE_NAMES) {
        const raw = cfg[`recent_hit_cooldown_${sc}`];
        if (raw != null && raw !== '') {
          const v = parseInt(raw, 10);
          if (!Number.isNaN(v) && v >= 0) scopeOverrides[sc] = v;
        }
      }
      setScopeCooldowns(scopeOverrides);
      setLoadedScopeCooldowns(scopeOverrides);

      // SCRUB-01: balanced-only. Only `engine_weights_balanced` is loaded.
      // Legacy conservative/aggressive rows in app_config are ignored.
      const overrides: typeof DEFAULT_PRESETS = { ...DEFAULT_PRESETS };
      const rawBalanced = cfg['engine_weights_balanced'];
      if (rawBalanced) {
        try { overrides.balanced = { ...DEFAULT_PRESETS.balanced, ...JSON.parse(rawBalanced) }; } catch {}
      }
      setPresets(overrides);

      // ENGINE-UI-01: load per-scope balanced overrides for read-only display.
      // Engine reads these FIRST; if no row exists for a scope, engine falls
      // back to the global `engine_weights_balanced`. UI mirrors that exact
      // semantics — null = inherits global.
      const perScopeWts: Record<ScopeName, WeightSet | null> = {
        midday: null, evening: null, allday: null,
      };
      for (const sc of SCOPE_NAMES) {
        const raw = cfg[`engine_weights_balanced_${sc}`];
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (
              typeof parsed?.BOX === 'number' && typeof parsed?.PBURST === 'number' &&
              typeof parsed?.CO === 'number'  && typeof parsed?.DGC === 'number'
            ) {
              perScopeWts[sc] = parsed as WeightSet;
            }
          } catch {}
        }
      }
      setPerScopeWeights(perScopeWts);

      // E6: snapshot the loaded surface area. currentSnapshot uses live state
      // which hasn't flushed yet, so we serialize the values we just loaded
      // directly. Any subsequent edit makes isDirty true; save resets it.
      const loaded = {
        presets: overrides,
        singlesMax: cfg.k6_singles_max ? (parseInt(cfg.k6_singles_max, 10) || 4) : 4,
        doublesMax: cfg.k6_doubles_max !== undefined ? (parseInt(cfg.k6_doubles_max, 10) || 2) : 2,
        pairRepCap: cfg.pair_rep_cap ? (parseInt(cfg.pair_rep_cap, 10) || 2) : 2,
        triplesOn: cfg.k6_triples_on === 'true',
        defaultScope: cfg.default_scope || 'midday',
        horizonWeights: cfg.horizon_weights
          ? (() => { try { return { ...DEFAULT_HORIZON_WEIGHTS, ...JSON.parse(cfg.horizon_weights) }; } catch { return DEFAULT_HORIZON_WEIGHTS; } })()
          : DEFAULT_HORIZON_WEIGHTS,
        pressureThreshold: cfg.pressure_threshold ? (parseInt(cfg.pressure_threshold, 10) || 250) : 250,
        minEnergyThreshold: cfg.min_energy_threshold ? (parseInt(cfg.min_energy_threshold, 10) || 0) : 0,
        recentHitCooldown: cfg.recent_hit_cooldown ? (parseInt(cfg.recent_hit_cooldown, 10) || 0) : 20,
        scopeCooldowns: scopeOverrides,
        synergyOn: cfg.synergy_boost_on === 'true',
        synergyWeight: cfg.synergy_boost_weight ? (parseFloat(cfg.synergy_boost_weight) || 0.15) : 0.15,
      };
      setLoadedSnapshot(JSON.stringify(loaded));
    } catch (e) {
      setLoadError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); loadRecentConfigChanges(); loadAdaptiveAuc(); loadAdaptiveFlags(); }, [loadConfig, loadRecentConfigChanges, loadAdaptiveAuc, loadAdaptiveFlags]);

  // ── Save all config keys via single upsert POST (E3) ──
  // Replaces the prior PATCH-per-key flow which silently no-op'd when a key
  // didn't exist (PATCH ?key=eq.X matches 0 rows → no error). With CONFIG-05's
  // new scope-suffixed keys (recent_hit_cooldown_midday etc.), some keys are
  // genuinely created on first save — upsert handles both cases. Scope-cooldown
  // overrides that the user CLEARED are tracked separately and DELETEd.
  const handleSave = useCallback(async () => {
    // E4: sum-check now includes DGC. Engine production runs ~49/27/14/10
    // for balanced; DGC is a legitimate fourth signal, not a constant.
    const signalSum = (w.BOX ?? 0) + (w.PBURST ?? 0) + (w.CO ?? 0) + (w.DGC ?? 0);
    if (Math.abs(signalSum - 100) > 1) {
      setSaveError(`Signal weights must sum to 100% (currently ${signalSum.toFixed(1)}%)`);
      return;
    }
    if (Math.abs(horizonSum - 100) > 1) {
      setSaveError(`Horizon weights must sum to 100% (currently ${horizonSum.toFixed(1)}%)`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    setSavedSummary(null);
    try {
      const entries: Record<string, string> = {
        synergy_boost_on:         String(synergyOn),
        synergy_boost_weight:     String(synergyWeight),
        k6_triples_on:            String(triplesOn),
        k6_singles_max:           String(singlesMax),
        k6_doubles_max:           String(doublesMax),
        pair_rep_cap:             String(pairRepCap),
        default_scope:            defaultScope,
        engine_weights_balanced:  JSON.stringify(presets.balanced),
        // SCRUB-01: conservative + aggressive no longer written on save.
        horizon_weights:          JSON.stringify(horizonWeights),
        pressure_threshold:       String(pressureThreshold),
        min_energy_threshold:     String(minEnergyThreshold),
        recent_hit_cooldown:      String(recentHitCooldown),
      };
      // Scope cooldown upserts (non-null current value)
      const scopeDeletes: string[] = [];
      for (const sc of SCOPE_NAMES) {
        const key = `recent_hit_cooldown_${sc}`;
        const cur = scopeCooldowns[sc];
        const wasLoaded = loadedScopeCooldowns[sc];
        if (cur != null) {
          entries[key] = String(cur);
        } else if (wasLoaded != null) {
          // User cleared a previously-set override → DELETE that row.
          scopeDeletes.push(key);
        }
      }

      // Single upsert POST. BUG-167: app_config's PK is (id) with UNIQUE(key),
      // so merge-duplicates alone resolves on the PK and still 23505s on the
      // key constraint — on_conflict=key is required for a true key-upsert.
      const body = Object.entries(entries).map(([key, value]) => ({ key, value }));
      await adminOpsFetch({
        path: '/rest/v1/app_config?on_conflict=key',
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body,
      });
      // Process scope-override deletes one at a time (rare — only on explicit
      // clear). DELETE ?key=eq.X is a no-op if the row was never created.
      let deletedCount = 0;
      for (const key of scopeDeletes) {
        try {
          await adminOpsFetch({
            path: `/rest/v1/app_config?key=eq.${encodeURIComponent(key)}`,
            method: 'DELETE',
            prefer: 'return=minimal',
          });
          deletedCount++;
        } catch (e) {
          console.warn('[engine-config] DELETE failed:', key, e);
        }
      }
      // Refresh the loaded-snapshot so the diff tracking resets.
      setLoadedScopeCooldowns({ ...scopeCooldowns });
      setLoadedSnapshot(currentSnapshot); // E6: clear unsaved-changes badge
      setSavedOk(true);
      setSavedAt(new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }));
      setSavedSummary({ written: body.length, deleted: deletedCount });
      setTimeout(() => setSavedOk(false), 2500);

      // E8: write a config_change row to audit_logs so the "Recent config
      // changes" card at the top has fresh content. Best-effort — swallow
      // errors so the save flow doesn't fail if audit_logs is unreachable.
      try {
        await adminOpsFetch({
          path: '/rest/v1/audit_logs',
          method: 'POST',
          prefer: 'return=minimal',
          body: {
            actor_id: null,
            action: 'config_change',
            target: 'engine_config',
            payload_meta: {
              written: body.length,
              deleted: deletedCount,
              scope_overrides: scopeCooldowns,
              global_cooldown: recentHitCooldown,
              min_energy: minEnergyThreshold,
              pressure_threshold: pressureThreshold,
            },
          },
        });
        // Refresh the inline log so the new row shows immediately
        loadRecentConfigChanges();
      } catch (e) {
        console.warn('[engine-config] audit_logs write failed:', e);
      }
    } catch (e) {
      setSaveError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }, [synergyOn, synergyWeight, triplesOn, singlesMax, doublesMax, pairRepCap, defaultScope, presets, horizonWeights, pressureThreshold, minEnergyThreshold, recentHitCooldown, scopeCooldowns, loadedScopeCooldowns, horizonSum, w, currentSnapshot, loadRecentConfigChanges]);

  const handleSaveAndRegen = useCallback(async () => {
    await handleSave();
    if (!regenerateSlate) return;
    setRegenning(true);
    const scopes: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
    const failed: string[] = [];
    for (const sc of scopes) {
      try { await regenerateSlate(sc); } catch { failed.push(sc); }
    }
    setRegenning(false);
    if (failed.length > 0) alertAsync('Regen incomplete', `Regeneration failed for: ${failed.join(', ')}. Config was saved; retry those scopes.`);
  }, [handleSave, regenerateSlate]);

  // E5: Reset wipes UI to hardcoded defaults — destructive, can erase
  // operator-tuned values that aren't yet saved. Now gated behind a confirm
  // modal (confirmResetOpen). Reload-from-production is the safer adjacent
  // action; see handleReload.
  const handleReset = useCallback(() => {
    setPresets(DEFAULT_PRESETS);
    setSinglesMax(4); setDoublesMax(2); setPairRepCap(2);
    setTriplesOn(false);
    setSynergyOn(false); setSynergyWeight(0.15);
    setDefaultScope('midday');
    setHorizonWeights(DEFAULT_HORIZON_WEIGHTS);
    setPressureThreshold(250);
    setMinEnergyThreshold(0); setRecentHitCooldown(20);
    setScopeCooldowns({ midday: null, evening: null, allday: null });
  }, []);

  // E5: pull current production state from app_config without touching the
  // hardcoded defaults. Safer than Reset for "I want to see what's actually live."
  const handleReload = useCallback(() => {
    loadConfig();
  }, [loadConfig]);

  function ToggleRow({ icon, label, sub, on, onChange }: { icon: string; label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 15 }}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{label}</Text>
            {sub && <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>{sub}</Text>}
          </View>
        </View>
        <TouchableOpacity onPress={() => onChange(!on)} style={{ width: 42, height: 22, borderRadius: 11, backgroundColor: on ? colors.primary : colors.surfaceMuted, justifyContent: 'center', paddingHorizontal: 3 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: on ? 'flex-end' : 'flex-start' }} />
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>Loading engine config…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ProposalRegenBanner onOpenProposals={onOpenProposals} />
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 }}>⚙️ ZK6 Engine Configuration</Text>
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: loadError ? 8 : 16 }}>Proprietary settings — creator access only.</Text>

      {loadError && (
        <Card style={{ padding: 10, marginBottom: 14, backgroundColor: colors.goldLight, borderColor: colors.gold + '44' }}>
          <Text style={{ fontSize: 11, color: colors.gold }}>⚠️ Loaded with defaults — {loadError}</Text>
        </Card>
      )}

      {/* E6: unsaved-changes banner — compares current state against the
          snapshot taken at last load (or post-save reset). Discard pulls
          live production state via Reload. */}
      {isDirty && (
        <Card style={{ padding: 10, marginBottom: 14, backgroundColor: colors.gold + '14', borderColor: colors.gold + '55', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 16 }}>●</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gold }}>Unsaved changes</Text>
            <Text style={{ fontSize: 10, color: colors.textSecondary }}>Your edits diverge from production. Save to apply, or Reload to discard.</Text>
          </View>
          <TouchableOpacity onPress={handleReload} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary }}>↻ Discard</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* E8: recent config changes inline. Each Save writes a row to
          audit_logs with action=config_change — the strip shows the last 3
          so operators see what was tuned recently without bouncing to the
          MASTER_AUDIT.md file. */}
      {recentChanges.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 16, backgroundColor: colors.surfaceLight }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1.5, marginBottom: 8 }}>RECENT CONFIG CHANGES</Text>
          {recentChanges.map((r, i) => {
            const ts = new Date(r.created_at);
            const tsLabel = ts.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const meta = r.payload_meta ?? {};
            const overrides = Object.entries(meta.scope_overrides ?? {})
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k} cd=${v}`)
              .join(', ');
            const summary = [
              meta.global_cooldown != null ? `global cd=${meta.global_cooldown}` : null,
              meta.min_energy != null ? `floor=${meta.min_energy}` : null,
              overrides || null,
            ].filter(Boolean).join(' · ');
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Text style={{ fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, width: 92 }}>{tsLabel}</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary, flex: 1 }}>{summary || '(no diff captured)'}</Text>
              </View>
            );
          })}
        </Card>
      )}

      <SectionTitle>SIGNAL WEIGHTS</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        {/* SCRUB-01 (2026-05-27): production is balanced-only. Preset selector
            removed; editor always operates on the balanced preset. */}
        {/* E4: DGC now shown alongside BOX/PBURST/CO. Engine treats it as a
            true fourth signal — production runs ~10% (DGC contributes to the
            final indicator score). Sum-100 validation now spans all four. */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { l: 'BOX', c: colors.primary },
            { l: 'PBURST', c: colors.rose },
            { l: 'CO', c: colors.teal },
            { l: 'DGC', c: colors.gold },
          ].map(s => (
            <View key={s.l} style={{ flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '800', letterSpacing: 1, marginBottom: 3 }}>{s.l}</Text>
              <Text style={{ fontSize: 18, fontWeight: '900', color: s.c, fontFamily: theme.typography.fontFamily.monoBold }}>{(w as any)[s.l]}%</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>
            Pick a preset above. Sum across all four must equal 100%.
          </Text>
          {(() => {
            const sum = (w.BOX ?? 0) + (w.PBURST ?? 0) + (w.CO ?? 0) + (w.DGC ?? 0);
            const ok = Math.abs(sum - 100) <= 1;
            return (
              <Text style={{ fontSize: 10, fontWeight: '800', color: ok ? colors.success : colors.error, fontFamily: theme.typography.fontFamily.monoBold }}>
                Σ {sum.toFixed(1)}%
              </Text>
            );
          })()}
        </View>
      </Card>

      {/* ENGINE-UI-01 (2026-06-06): per-scope weight overrides — read-only.
          Production engine reads `engine_weights_balanced_${scope}` FIRST and
          falls back to the global preset above only when no row exists. This
          card surfaces what's actually running per scope. To change values,
          add a CONFIG-XX entry + backtest + SQL ship per MASTER_AUDIT — the
          Reset button does NOT touch these rows. */}
      <SectionTitle>PER-SCOPE OVERRIDES (LIVE)</SectionTitle>
      <Card style={{ padding: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 10, lineHeight: 14 }}>
          Engine reads these rows first; scopes without an override inherit the global preset above. Read-only here — change via CONFIG-XX backtest + SQL.
        </Text>
        {SCOPE_NAMES.map((sc, idx) => {
          const w = perScopeWeights[sc];
          const label = sc === 'midday' ? '☀️ Midday' : sc === 'evening' ? '🌙 Evening' : '◈ All Day';
          if (!w) {
            return (
              <View key={sc} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, width: 96 }}>{label}</Text>
                <Text style={{ fontSize: 10, color: colors.textTertiary, fontStyle: 'italic', flex: 1 }}>inherits global preset</Text>
              </View>
            );
          }
          const sum = w.BOX + w.PBURST + w.CO + w.DGC;
          const sumOk = Math.abs(sum - 100) <= 1;
          return (
            <View key={sc} style={{ paddingVertical: 10, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, width: 96 }}>{label}</Text>
                <View style={{ backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>OVERRIDE</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: sumOk ? colors.success : colors.error, fontFamily: theme.typography.fontFamily.monoBold }}>
                  Σ {sum.toFixed(1)}%
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {[
                  { l: 'BOX',    v: w.BOX,    c: colors.primary },
                  { l: 'PBURST', v: w.PBURST, c: colors.rose    },
                  { l: 'CO',     v: w.CO,     c: colors.teal    },
                  { l: 'DGC',    v: w.DGC,    c: colors.gold    },
                ].map(s => (
                  <View key={s.l} style={{ flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 7, alignItems: 'center' }}>
                    <Text style={{ fontSize: 8, color: colors.textTertiary, fontWeight: '800', letterSpacing: 1 }}>{s.l}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: s.c, fontFamily: theme.typography.fontFamily.monoBold }}>{s.v}%</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </Card>

      <SectionTitle>K6 RAIL CONTROLS</SectionTitle>
      <Card style={{ paddingHorizontal: 16 }}>
        <ToggleRow icon="3️⃣" label="Allow Triples in K6" sub="Currently off — triples have very low historical frequency" on={triplesOn} onChange={setTriplesOn} />

        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Max Singles in K6</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.primary, fontFamily: theme.typography.fontFamily.monoBold }}>{singlesMax}</Text>
          </View>
          <View style={{ height: 4, backgroundColor: colors.surfaceLight, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${(singlesMax / 6) * 100}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            {[1,2,3,4,5,6].map(v => (
              <TouchableOpacity key={v} onPress={() => setSinglesMax(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: singlesMax === v ? colors.primaryLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: singlesMax === v ? colors.primary : colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Max Doubles in K6</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.teal, fontFamily: theme.typography.fontFamily.monoBold }}>{doublesMax}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[0,1,2,3,4].map(v => (
              <TouchableOpacity key={v} onPress={() => setDoublesMax(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: doublesMax === v ? colors.tealLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: doublesMax === v ? colors.teal : colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Pair Repetition Cap</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.gold, fontFamily: theme.typography.fontFamily.monoBold }}>{pairRepCap}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[1,2,3,4].map(v => (
              <TouchableOpacity key={v} onPress={() => setPairRepCap(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: pairRepCap === v ? colors.goldLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: pairRepCap === v ? colors.gold : colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Signal Synergy Matrix (Tier 4) ── */}
      <SectionTitle>SIGNAL SYNERGY MATRIX</SectionTitle>
      <Card style={{ paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
        <ToggleRow
          icon="⚡"
          label="Synergy Boost"
          sub="Reward combos where multiple lethal signals align (Super Signals)"
          on={synergyOn}
          onChange={setSynergyOn}
        />
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Boost Weight</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Bonus score added when 2+ signals are {'>'} 0.70</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.primary, fontFamily: theme.typography.fontFamily.monoBold }}>+{synergyWeight.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0.05, 0.10, 0.15, 0.20, 0.25].map(v => (
              <TouchableOpacity key={v} onPress={() => setSynergyWeight(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: synergyWeight === v ? colors.primaryLight : colors.surfaceLight, borderWidth: 1, borderColor: synergyWeight === v ? colors.primary + '55' : colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: synergyWeight === v ? colors.primary : colors.textTertiary }}>+{v.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      <SectionTitle>DEFAULT SCOPE</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Default Scope on App Launch</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['midday','☀️ Midday'], ['evening','🌙 Evening'], ['allday','◈ All Day']] as [string,string][]).map(([id, lbl]) => (
            <TouchableOpacity key={id} style={[st.optBtn, { flex: 1 }, defaultScope === id && st.optBtnOn]} onPress={() => setDefaultScope(id)}>
              <Text style={[st.optBtnText, defaultScope === id && st.optBtnTextOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* ── Horizon Weights ── */}
      <SectionTitle>HORIZON WEIGHTS</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Horizon Blend Weights</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: Math.abs(horizonSum - 100) < 0.5 ? colors.success : colors.error, fontFamily: theme.typography.fontFamily.monoBold }}>
            Sum: {horizonSum.toFixed(1)}%
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 10 }}>Sum must equal 100%. Higher weight = more influence on final score.</Text>
        {HORIZONS.map(h => {
          const val = horizonWeights[h] ?? 0;
          return (
            <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, width: 40, fontFamily: theme.typography.fontFamily.monoBold }}>{h}</Text>
              <View style={{ flex: 1, height: 6, backgroundColor: colors.surfaceLight, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(val, 100)}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 3 }} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '900', color: colors.primary, fontFamily: theme.typography.fontFamily.monoBold, width: 36 }}>{val}%</Text>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                <TouchableOpacity
                  onPress={() => setHorizonWeights(w => ({ ...w, [h]: Math.max(0, (w[h] ?? 0) - 0.5) }))}
                  style={{ width: 22, height: 22, backgroundColor: colors.surfaceLight, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setHorizonWeights(w => ({ ...w, [h]: (w[h] ?? 0) + 0.5 }))}
                  style={{ width: 22, height: 22, backgroundColor: colors.surfaceLight, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </Card>

      {/* ── Draws Since Pressure ── */}
      <SectionTitle>DRAWS SINCE PRESSURE</SectionTitle>
      <Card style={{ paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Pressure Threshold</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Combos overdue by more than X draws get a pressure bonus</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.rose, fontFamily: theme.typography.fontFamily.monoBold }}>{pressureThreshold}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[50, 100, 150, 200, 250, 300, 500].map(v => (
              <TouchableOpacity key={v} onPress={() => setPressureThreshold(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: pressureThreshold === v ? colors.roseLight : colors.surfaceLight, borderWidth: 1, borderColor: pressureThreshold === v ? colors.rose + '55' : colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: pressureThreshold === v ? colors.rose : colors.textTertiary }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Diversity Rails (enhanced) ── */}
      <SectionTitle>DIVERSITY RAILS</SectionTitle>
      <Card style={{ paddingHorizontal: 16 }}>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Min Energy Threshold</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Only include picks with energy score above this threshold</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.primary, fontFamily: theme.typography.fontFamily.monoBold }}>{minEnergyThreshold}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 10, 20, 30, 40, 50].map(v => (
              <TouchableOpacity key={v} onPress={() => setMinEnergyThreshold(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: minEnergyThreshold === v ? colors.primaryLight : colors.surfaceLight, borderWidth: 1, borderColor: minEnergyThreshold === v ? colors.primary + '55' : colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: minEnergyThreshold === v ? colors.primary : colors.textTertiary }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>🚫 Recent Hit Cooldown (global)</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>Exclude combos that hit within last N draws (0 = off). Per-scope overrides below.</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.teal, fontFamily: theme.typography.fontFamily.monoBold }}>{recentHitCooldown === 0 ? 'Off' : `${recentHitCooldown}d`}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[0, 5, 10, 15, 20, 25, 30].map(v => (
              <TouchableOpacity key={v} onPress={() => setRecentHitCooldown(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: recentHitCooldown === v ? colors.tealLight : colors.surfaceLight, borderWidth: 1, borderColor: recentHitCooldown === v ? colors.teal + '55' : colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: recentHitCooldown === v ? colors.teal : colors.textTertiary }}>{v === 0 ? 'Off' : v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {/* E1 (CONFIG-05): per-scope cooldown overrides. Each scope can either
            inherit the global (left as "(global)") or set its own value. The
            engine reads `recent_hit_cooldown_${scope}` and prefers it over
            global when present. Save writes/deletes the row per scope. */}
        <View style={{ paddingVertical: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 2 }}>Per-scope cooldown overrides</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 8 }}>Surgical tuning when one scope underperforms. Empty = use global ({recentHitCooldown}d).</Text>
          {SCOPE_NAMES.map(sc => {
            const cur = scopeCooldowns[sc];
            const label = sc === 'midday' ? '☀️ Midday' : sc === 'evening' ? '🌙 Evening' : '◈ All Day';
            const isOverride = cur != null;
            return (
              <View key={sc} style={{ marginBottom: 6, padding: 8, borderRadius: 8, backgroundColor: isOverride ? colors.tealLight + '55' : colors.surfaceLight, borderWidth: 1, borderColor: isOverride ? colors.teal + '44' : colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>{label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: isOverride ? colors.teal : colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold }}>
                      {isOverride ? `${cur}d` : '(global)'}
                    </Text>
                    {isOverride && (
                      <TouchableOpacity
                        onPress={() => setScopeCooldowns(prev => ({ ...prev, [sc]: null }))}
                        style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary }}>✗ clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                  {[5, 10, 15, 20, 25, 30].map(v => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => setScopeCooldowns(prev => ({ ...prev, [sc]: v }))}
                      style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, backgroundColor: cur === v ? colors.teal : 'transparent', borderWidth: 1, borderColor: cur === v ? colors.teal : colors.border }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '700', color: cur === v ? '#fff' : colors.textTertiary }}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* ── ENH-AFL-2: Adaptive Signal Weights (debug surface) ── */}
      <SectionTitle>ADAPTIVE SIGNAL WEIGHTS (ENH-AFL-2)</SectionTitle>
      <Card style={{ paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
            Status: <Text style={{ color: adaptiveFlagOn ? colors.primary : colors.textTertiary }}>{adaptiveFlagOn ? 'ENABLED' : 'DISABLED'}</Text>
          </Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold }}>
            α = {adaptiveAlpha.toFixed(2)}
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 10, lineHeight: 14 }}>
          Rolling 30-day per-signal AUC from signal_auc_per_day. When enabled, base weights are
          adjusted toward signals that predicted well in this scope's recent history. Flag is currently
          OFF — 30-day backtest 2026-05-27 showed insufficient lift across all α ∈ [0.5, 1.5] (see
          MASTER_AUDIT.md ENH-AFL ship entry).
        </Text>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 4, marginBottom: 6 }}>
          <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: colors.textSecondary }}>scope</Text>
          <Text style={{ width: 56, fontSize: 10, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' }}>BOX</Text>
          <Text style={{ width: 56, fontSize: 10, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' }}>PBURST</Text>
          <Text style={{ width: 56, fontSize: 10, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' }}>CO</Text>
          <Text style={{ width: 56, fontSize: 10, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' }}>DGC</Text>
          <Text style={{ width: 40, fontSize: 10, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' }}>days</Text>
        </View>
        {(['midday', 'evening', 'allday'] as const).map(sc => {
          const a = adaptiveAuc[sc];
          if (!a) return (
            <View key={sc} style={{ flexDirection: 'row', paddingVertical: 4 }}>
              <Text style={{ flex: 1, fontSize: 11, color: colors.text }}>{sc}</Text>
              <Text style={{ flex: 4, fontSize: 10, color: colors.textTertiary, textAlign: 'center' }}>no data</Text>
            </View>
          );
          const fmt = (v: number, base = 0.5) => {
            const above = v >= base;
            return <Text style={{ width: 56, fontSize: 11, color: above ? colors.primary : colors.warning, textAlign: 'right', fontFamily: theme.typography.fontFamily.monoBold }}>{v.toFixed(3)}</Text>;
          };
          return (
            <View key={sc} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: sc === 'allday' ? 0 : 1, borderBottomColor: colors.border + '33' }}>
              <Text style={{ flex: 1, fontSize: 11, color: colors.text, fontWeight: '600' }}>{sc}</Text>
              {fmt(a.BOX)}
              {fmt(a.PBURST)}
              {fmt(a.CO)}
              {fmt(a.DGC)}
              <Text style={{ width: 40, fontSize: 11, color: colors.textTertiary, textAlign: 'right', fontFamily: theme.typography.fontFamily.monoBold }}>{a.nDays}</Text>
            </View>
          );
        })}
        <Text style={{ fontSize: 9, color: colors.textTertiary, marginTop: 10, lineHeight: 12 }}>
          AUC interpretation: 0.5 = no predictive lift · &gt; 0.5 = signal correctly ranked hits above misses ·
          &lt; 0.5 = anti-predictive (warning color). Daily AUC refresh fires via the Full Daily Workflow
          button (Step 2/4).
        </Text>
      </Card>

      {/* E2 (2026-05-13): removed the Slate Generation Schedule section.
          auto_gen_slates / morning_gen_time / evening_gen_time were never
          wired to a scheduler — UI itself admitted "requires server-side
          scheduling (Phase 3)" which never shipped. Use the remote routine
          mechanism (scheduled agents) instead for time-based regens. */}

      {saveError && (
        <Card style={{ padding: 10, marginBottom: 10, backgroundColor: colors.errorLight, borderColor: colors.error + '44' }}>
          <Text style={{ fontSize: 11, color: colors.error }}>✗ Save failed — {saveError}</Text>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          style={[st.btnPrimary, { flex: 1, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving || regenning}
        >
          <Text style={st.btnPrimaryText}>
            {saving ? '⏳ Saving…' : savedOk ? '✓ Saved!' : '💾 Save Engine Config'}
          </Text>
        </TouchableOpacity>
        {/* E5: Reload-from-production sits next to Reset because the two are
            adjacent in intent but opposite in destructiveness. Reload pulls
            live state; Reset wipes to UI defaults and now requires confirm. */}
        <TouchableOpacity style={st.btnGhost} onPress={handleReload} disabled={saving || regenning || loading}>
          <Text style={st.btnGhostText}>↻ Reload</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.btnGhost} onPress={() => setConfirmResetOpen(true)} disabled={saving || regenning}>
          <Text style={st.btnGhostText}>↺ Reset</Text>
        </TouchableOpacity>
      </View>
      {regenerateSlate && (
        <TouchableOpacity
          style={[st.btnPrimary, { marginTop: 8, backgroundColor: colors.teal, opacity: saving || regenning ? 0.6 : 1 }]}
          onPress={handleSaveAndRegen}
          disabled={saving || regenning}
        >
          {regenning && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
          <Text style={st.btnPrimaryText}>
            {regenning ? '↻ Saving & Regenerating…' : '↻ Save & Regen All Slates'}
          </Text>
        </TouchableOpacity>
      )}

      {/* About Engine Config button */}
      <TouchableOpacity
        style={[st.btnGhost, { borderWidth: 1.5, borderColor: colors.primary + '44', backgroundColor: colors.primaryLight, marginTop: 10 }]}
        onPress={() => setPreviewModal(true)}
      >
        <Text style={[st.btnGhostText, { color: colors.primary, fontWeight: '700' }]}>
          ℹ️ About Engine Config
        </Text>
      </TouchableOpacity>

      {/* E7: Backtest CTA. Doesn't run a backtest from RN — the script lives
          on the host (node + tsx). Modal explains the npm command per CLAUDE.md
          and where to find the CSV output. Surfacing this button next to Save
          puts the empirical-validation gate in the operator's line of sight. */}
      <TouchableOpacity
        style={[st.btnGhost, { borderWidth: 1.5, borderColor: colors.teal + '44', backgroundColor: colors.tealLight, marginTop: 8 }]}
        onPress={() => setBacktestModalOpen(true)}
      >
        <Text style={[st.btnGhostText, { color: colors.teal, fontWeight: '700' }]}>
          📊 Validate via Backtest
        </Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', marginTop: 6, marginBottom: 20 }}>
        Per CLAUDE.md: no engine change ships without a hit-rate number attached
      </Text>
      {savedAt && (
        <Text style={{ fontSize: 10, color: colors.success, textAlign: 'center', marginTop: -14, marginBottom: 16 }}>
          Last saved: {savedAt} — {savedSummary ? `${savedSummary.written} key${savedSummary.written !== 1 ? 's' : ''} written${savedSummary.deleted > 0 ? `, ${savedSummary.deleted} override${savedSummary.deleted !== 1 ? 's' : ''} cleared` : ''}. ` : ''}
          Engine will use these on next slate generation
        </Text>
      )}

      {/* E5: confirm-reset modal — prevents accidental wipe of operator-tuned
          values. Reload-from-production is the safer adjacent action; Reset
          is genuinely destructive. */}
      {confirmResetOpen && (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirmResetOpen(false)}>
          <View style={{ flex: 1, backgroundColor: '#1E1B4B66', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 18, width: '100%', maxWidth: 360 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 6 }}>Reset to UI defaults?</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 14 }}>
                This wipes all staged engine settings back to hardcoded defaults — including any per-scope cooldown overrides. It does NOT touch production app_config until you Save.{'\n\n'}<Text style={{ fontWeight: '700', color: colors.gold }}>Per-scope signal-weight overrides (Midday / Evening / Allday — shown read-only in the PER-SCOPE OVERRIDES card above) are NOT cleared by Reset and NOT cleared by Save.</Text> Production engine continues reading those rows. To change them: backtest + SQL ship per MASTER_AUDIT CONFIG-XX pattern.{'\n\n'}If you want the live production state instead, cancel and use ↻ Reload.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[st.btnGhost, { flex: 1 }]} onPress={() => setConfirmResetOpen(false)}>
                  <Text style={st.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.btnPrimary, { flex: 1, backgroundColor: colors.error }]}
                  onPress={() => { handleReset(); setConfirmResetOpen(false); }}
                >
                  <Text style={st.btnPrimaryText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* E7: backtest CTA modal */}
      {backtestModalOpen && (
        <Modal transparent animationType="slide" onRequestClose={() => setBacktestModalOpen(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: '#1E1B4B55' }} activeOpacity={1} onPress={() => setBacktestModalOpen(false)}>
            <TouchableOpacity activeOpacity={1} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 20, maxHeight: '78%' }} onPress={() => {}}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.surfaceMuted, alignSelf: 'center', marginBottom: 16 }} />
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 4 }}>📊 Validate via Backtest</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>
                  Per CLAUDE.md: every engine/config change ships with a hit-rate number attached. The backtest harness replays the engine over the last 30 days against any named config preset.
                </Text>
                <Card style={{ padding: 14, marginBottom: 12, backgroundColor: colors.tealLight, borderColor: colors.teal + '28' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.teal, marginBottom: 6, letterSpacing: 1 }}>1. RECORD BASELINE</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6 }}>From a host shell (not in this app):</Text>
                  <View style={{ backgroundColor: colors.background, borderRadius: 6, padding: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>
                      npm run backtest:replay -- --days 30 --config default
                    </Text>
                  </View>
                </Card>
                <Card style={{ padding: 14, marginBottom: 12, backgroundColor: colors.primaryLight, borderColor: colors.primary + '28' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 6, letterSpacing: 1 }}>2. RUN CANDIDATE</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6 }}>If you&apos;re testing a new combination, add a preset in:</Text>
                  <View style={{ backgroundColor: colors.background, borderRadius: 6, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>
                      scripts/backtest/configs.ts
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6 }}>Then replay it:</Text>
                  <View style={{ backgroundColor: colors.background, borderRadius: 6, padding: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>
                      npm run backtest:replay -- --days 30 --config &lt;your-preset&gt;
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6, fontStyle: 'italic' }}>
                    Tip: comma-separated configs run in parallel — e.g. `--config default,floor70,midday_cd10`
                  </Text>
                </Card>
                <Card style={{ padding: 14, marginBottom: 16, backgroundColor: colors.goldLight, borderColor: colors.gold + '28' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.gold, marginBottom: 6, letterSpacing: 1 }}>3. DECIDE</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 17 }}>
                    Ship only if CANDIDATE ≥ BASELINE on overall hit rate.{'\n'}
                    CSV output lands in <Text style={{ fontFamily: theme.typography.fontFamily.mono, color: colors.text }}>scripts/backtest/output/</Text>{'\n'}
                    Record the numbers as a CONFIG-XX entry in MASTER_AUDIT.md before applying.
                  </Text>
                </Card>
                <TouchableOpacity style={st.btnPrimary} onPress={() => setBacktestModalOpen(false)}>
                  <Text style={st.btnPrimaryText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Preview modal */}
      {previewModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setPreviewModal(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: '#1E1B4B55' }} activeOpacity={1} onPress={() => setPreviewModal(false)}>
            <TouchableOpacity activeOpacity={1} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 20, maxHeight: '70%' }} onPress={() => {}}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.surfaceMuted, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 4 }}>ℹ️ About Engine Config</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>
                Current config: {wPreset} preset · {singlesMax} singles max · {doublesMax} doubles max · scope: {defaultScope}
              </Text>
              <Card style={{ padding: 14, backgroundColor: colors.primaryLight, borderColor: colors.primary + '28', marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 8 }}>Engine Configuration</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 18 }}>
                  Save your config first, then use Regen All Slates on the Dashboard to apply settings. Changes take effect on the next slate generation — they do not retroactively modify existing snapshots.
                </Text>
              </Card>
              <TouchableOpacity style={st.btnPrimary} onPress={() => setPreviewModal(false)}>
                <Text style={st.btnPrimaryText}>Close</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </ScrollView>
  );
}
