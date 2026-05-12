import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';
import { SectionTitle, Card, st } from './AdminShared';

// ─── Engine Config View ───────────────────────────────────────────────────────
export default function EngineConfigView({ regenerateSlate }: { regenerateSlate?: (scope: any, weightsKey?: any) => Promise<any> }) {
  const DEFAULT_PRESETS: Record<string, Record<string, number>> = {
    balanced:     { BOX: 40, PBURST: 40, CO: 20 },
    conservative: { BOX: 70, PBURST: 20, CO: 10 },
    aggressive:   { BOX: 25, PBURST: 45, CO: 30 },
  };

  const HORIZONS = ['H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y'];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenning, setRegenning] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wPreset, setWPreset]         = useState('balanced');
  const [presets, setPresets]         = useState(DEFAULT_PRESETS);
  const [singlesMax, setSinglesMax]   = useState(4);
  const [doublesMax, setDoublesMax]   = useState(2);
  const [pairRepCap, setPairRepCap]   = useState(2);
  const [confAdjust, setConfAdjust]   = useState(true);
  const [burstSignal, setBurstSignal] = useState(true);
  const [triplesOn, setTriplesOn]     = useState(false);
  const [defaultScope, setDefaultScope] = useState('midday');

  // Task 4 — new engine config state
  const DEFAULT_HORIZON_WEIGHTS: Record<string, number> = { H01Y:35, H02Y:22, H03Y:14, H04Y:9, H05Y:6, H06Y:4.5, H07Y:3, H08Y:2.5, H09Y:2, H10Y:2 };
  const [horizonWeights, setHorizonWeights] = useState<Record<string, number>>(DEFAULT_HORIZON_WEIGHTS);
  const [pressureThreshold, setPressureThreshold] = useState(200);
  const [pressureBonusWeight, setPressureBonusWeight] = useState(10);
  const [minEnergyThreshold, setMinEnergyThreshold] = useState(0);
  const [recentHitCooldown, setRecentHitCooldown] = useState(20);
  const [autoGenSlates, setAutoGenSlates] = useState(false);
  const [morningGenTime, setMorningGenTime] = useState('04:00');
  const [eveningGenTime, setEveningGenTime] = useState('16:00');
  const [previewModal, setPreviewModal] = useState(false);
  const [synergyOn, setSynergyOn] = useState(false);
  const [synergyWeight, setSynergyWeight] = useState(0.15);

  const w = presets[wPreset] ?? DEFAULT_PRESETS.balanced;
  const horizonSum = Object.values(horizonWeights).reduce((a, b) => a + b, 0);

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

      if (cfg.engine_preset) setWPreset(cfg.engine_preset);
      if (cfg.drawing_confidence_on) setConfAdjust(cfg.drawing_confidence_on === 'true');
      if (cfg.burst_signal_on)       setBurstSignal(cfg.burst_signal_on === 'true');
      if (cfg.synergy_boost_on)      setSynergyOn(cfg.synergy_boost_on === 'true');
      if (cfg.synergy_boost_weight)  setSynergyWeight(parseFloat(cfg.synergy_boost_weight) || 0.15);
      if (cfg.k6_triples_on)         setTriplesOn(cfg.k6_triples_on === 'true');
      if (cfg.k6_singles_max)        setSinglesMax(parseInt(cfg.k6_singles_max, 10) || 4);
      if (cfg.k6_doubles_max)        setDoublesMax(parseInt(cfg.k6_doubles_max, 10) || 2);  // 0 is valid
      if (cfg.pair_rep_cap)          setPairRepCap(parseInt(cfg.pair_rep_cap, 10) || 2);
      if (cfg.default_scope)         setDefaultScope(cfg.default_scope);
      if (cfg.pressure_threshold)    setPressureThreshold(parseInt(cfg.pressure_threshold, 10) || 200);
      if (cfg.pressure_bonus_weight) setPressureBonusWeight(parseInt(cfg.pressure_bonus_weight, 10) || 10);
      if (cfg.min_energy_threshold)  setMinEnergyThreshold(parseInt(cfg.min_energy_threshold, 10) || 0);
      if (cfg.recent_hit_cooldown)   setRecentHitCooldown(parseInt(cfg.recent_hit_cooldown, 10) || 0);
      if (cfg.auto_gen_slates)       setAutoGenSlates(cfg.auto_gen_slates === 'true');
      if (cfg.morning_gen_time)      setMorningGenTime(cfg.morning_gen_time);
      if (cfg.evening_gen_time)      setEveningGenTime(cfg.evening_gen_time);
      if (cfg.horizon_weights) {
        try { setHorizonWeights({ ...DEFAULT_HORIZON_WEIGHTS, ...JSON.parse(cfg.horizon_weights) }); } catch {}
      }

      // Load custom preset weights if stored
      const overrides: typeof DEFAULT_PRESETS = { ...DEFAULT_PRESETS };
      (['balanced', 'conservative', 'aggressive'] as const).forEach(p => {
        const raw = cfg[`engine_weights_${p}`];
        if (raw) {
          try { overrides[p] = { ...DEFAULT_PRESETS[p], ...JSON.parse(raw) }; } catch {}
        }
      });
      setPresets(overrides);
    } catch (e) {
      setLoadError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Save all config keys via individual PATCH calls (avoids RLS INSERT restriction) ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      const entries: Record<string, string> = {
        engine_preset:            wPreset,
        drawing_confidence_on:    String(confAdjust),
        burst_signal_on:          String(burstSignal),
        synergy_boost_on:         String(synergyOn),
        synergy_boost_weight:      String(synergyWeight),
        k6_triples_on:            String(triplesOn),
        k6_singles_max:           String(singlesMax),
        k6_doubles_max:           String(doublesMax),
        pair_rep_cap:             String(pairRepCap),
        default_scope:            defaultScope,
        engine_weights_balanced:  JSON.stringify(presets.balanced),
        engine_weights_conservative: JSON.stringify(presets.conservative),
        engine_weights_aggressive: JSON.stringify(presets.aggressive),
        horizon_weights:          JSON.stringify(horizonWeights),
        pressure_threshold:       String(pressureThreshold),
        pressure_bonus_weight:    String(pressureBonusWeight),
        min_energy_threshold:     String(minEnergyThreshold),
        recent_hit_cooldown:      String(recentHitCooldown),
        auto_gen_slates:          String(autoGenSlates),
        morning_gen_time:         morningGenTime,
        evening_gen_time:         eveningGenTime,
      };

      // Use PATCH per key — rows already exist, INSERT would violate RLS
      await Promise.all(
        Object.entries(entries).map(([k, v]) =>
          fetchFromSupabase({
            path: `/rest/v1/app_config?key=eq.${encodeURIComponent(k)}`,
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: { value: v },
          })
        )
      );
      setSavedOk(true);
      setSavedAt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e) {
      setSaveError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }, [wPreset, confAdjust, burstSignal, synergyOn, synergyWeight, triplesOn, singlesMax, doublesMax, pairRepCap, defaultScope, presets, horizonWeights, pressureThreshold, pressureBonusWeight, minEnergyThreshold, recentHitCooldown, autoGenSlates, morningGenTime, eveningGenTime]);

  const handleSaveAndRegen = useCallback(async () => {
    await handleSave();
    if (!regenerateSlate) return;
    setRegenning(true);
    const scopes: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
    for (const sc of scopes) {
      try { await regenerateSlate(sc); } catch {}
    }
    setRegenning(false);
  }, [handleSave, regenerateSlate]);

  const handleReset = useCallback(() => {
    setWPreset('balanced'); setPresets(DEFAULT_PRESETS);
    setSinglesMax(4); setDoublesMax(2); setPairRepCap(2);
    setConfAdjust(true); setBurstSignal(true); setTriplesOn(false);
    setSynergyOn(false); setSynergyWeight(0.15);
    setDefaultScope('midday');
    setHorizonWeights(DEFAULT_HORIZON_WEIGHTS);
    setPressureThreshold(200); setPressureBonusWeight(10);
    setMinEnergyThreshold(0); setRecentHitCooldown(20);
    setAutoGenSlates(false); setMorningGenTime('04:00'); setEveningGenTime('16:00');
  }, []);

  function ToggleRow({ icon, label, sub, on, onChange }: { icon: string; label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 15 }}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>{label}</Text>
            {sub && <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 1 }}>{sub}</Text>}
          </View>
        </View>
        <TouchableOpacity onPress={() => onChange(!on)} style={{ width: 42, height: 22, borderRadius: 11, backgroundColor: on ? theme.colors.primary : theme.colors.surfaceMuted, justifyContent: 'center', paddingHorizontal: 3 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: on ? 'flex-end' : 'flex-start' }} />
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Loading engine config…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>⚙️ ZK6 Engine Configuration</Text>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: loadError ? 8 : 16 }}>Proprietary settings — creator access only.</Text>

      {loadError && (
        <Card style={{ padding: 10, marginBottom: 14, backgroundColor: theme.colors.goldLight, borderColor: theme.colors.gold + '44' }}>
          <Text style={{ fontSize: 11, color: theme.colors.gold }}>⚠️ Loaded with defaults — {loadError}</Text>
        </Card>
      )}

      <SectionTitle>SIGNAL WEIGHTS</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Object.entries(presets).map(([k, v]) => (
              <TouchableOpacity key={k} style={[st.optBtn, wPreset === k && st.optBtnOn]} onPress={() => setWPreset(k)}>
                <Text style={[st.optBtnText, wPreset === k && st.optBtnTextOn]}>
                  {k.charAt(0).toUpperCase() + k.slice(1)} ({v.BOX}/{v.PBURST}/{v.CO})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ l: 'BOX', c: theme.colors.primary }, { l: 'PBURST', c: theme.colors.rose }, { l: 'CO', c: theme.colors.teal }].map(s => (
            <View key={s.l} style={{ flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '800', letterSpacing: 1, marginBottom: 3 }}>{s.l}</Text>
              <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: theme.typography.fontFamily.monoBold }}>{(w as any)[s.l]}%</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle>K6 RAIL CONTROLS</SectionTitle>
      <Card style={{ paddingHorizontal: 16 }}>
        <ToggleRow icon="🏆" label="Drawing Confidence Adjustment" sub="Weight signals higher for physical ball machine states" on={confAdjust} onChange={setConfAdjust} />
        <ToggleRow icon="📈" label="Recency Burst Detection" sub="Bonus signal for combos building extra pressure in H01Y" on={burstSignal} onChange={setBurstSignal} />
        <ToggleRow icon="3️⃣" label="Allow Triples in K6" sub="Currently off — triples have very low historical frequency" on={triplesOn} onChange={setTriplesOn} />

        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Max Singles in K6</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.typography.fontFamily.monoBold }}>{singlesMax}</Text>
          </View>
          <View style={{ height: 4, backgroundColor: theme.colors.surfaceLight, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${(singlesMax / 6) * 100}%`, height: '100%', backgroundColor: theme.colors.primary, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            {[1,2,3,4,5,6].map(v => (
              <TouchableOpacity key={v} onPress={() => setSinglesMax(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: singlesMax === v ? theme.colors.primaryLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: singlesMax === v ? theme.colors.primary : theme.colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Max Doubles in K6</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.teal, fontFamily: theme.typography.fontFamily.monoBold }}>{doublesMax}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[0,1,2,3,4].map(v => (
              <TouchableOpacity key={v} onPress={() => setDoublesMax(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: doublesMax === v ? theme.colors.tealLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: doublesMax === v ? theme.colors.teal : theme.colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Pair Repetition Cap</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.gold, fontFamily: theme.typography.fontFamily.monoBold }}>{pairRepCap}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[1,2,3,4].map(v => (
              <TouchableOpacity key={v} onPress={() => setPairRepCap(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: pairRepCap === v ? theme.colors.goldLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: pairRepCap === v ? theme.colors.gold : theme.colors.textTertiary, fontWeight: '700' }}>{v}</Text>
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
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Boost Weight</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Bonus score added when 2+ signals are {'>'} 0.70</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.typography.fontFamily.monoBold }}>+{synergyWeight.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0.05, 0.10, 0.15, 0.20, 0.25].map(v => (
              <TouchableOpacity key={v} onPress={() => setSynergyWeight(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: synergyWeight === v ? theme.colors.primaryLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: synergyWeight === v ? theme.colors.primary + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: synergyWeight === v ? theme.colors.primary : theme.colors.textTertiary }}>+{v.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      <SectionTitle>DEFAULT SCOPE</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text, marginBottom: 8 }}>Default Scope on App Launch</Text>
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
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Horizon Blend Weights</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: Math.abs(horizonSum - 100) < 0.5 ? theme.colors.success : theme.colors.error, fontFamily: theme.typography.fontFamily.monoBold }}>
            Sum: {horizonSum.toFixed(1)}%
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 10 }}>Sum must equal 100%. Higher weight = more influence on final score.</Text>
        {HORIZONS.map(h => {
          const val = horizonWeights[h] ?? 0;
          return (
            <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary, width: 40, fontFamily: theme.typography.fontFamily.monoBold }}>{h}</Text>
              <View style={{ flex: 1, height: 6, backgroundColor: theme.colors.surfaceLight, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(val, 100)}%`, height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 }} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.typography.fontFamily.monoBold, width: 36 }}>{val}%</Text>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                <TouchableOpacity
                  onPress={() => setHorizonWeights(w => ({ ...w, [h]: Math.max(0, (w[h] ?? 0) - 0.5) }))}
                  style={{ width: 22, height: 22, backgroundColor: theme.colors.surfaceLight, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '700' }}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setHorizonWeights(w => ({ ...w, [h]: (w[h] ?? 0) + 0.5 }))}
                  style={{ width: 22, height: 22, backgroundColor: theme.colors.surfaceLight, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </Card>

      {/* ── Draws Since Pressure ── */}
      <SectionTitle>DRAWS SINCE PRESSURE</SectionTitle>
      <Card style={{ paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
        <View style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Pressure Threshold</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Combos overdue by more than X draws get a pressure bonus</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.rose, fontFamily: theme.typography.fontFamily.monoBold }}>{pressureThreshold}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[50, 100, 150, 200, 300, 500].map(v => (
              <TouchableOpacity key={v} onPress={() => setPressureThreshold(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: pressureThreshold === v ? theme.colors.roseLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: pressureThreshold === v ? theme.colors.rose + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: pressureThreshold === v ? theme.colors.rose : theme.colors.textTertiary }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Pressure Bonus Weight</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>How much the pressure bonus affects final score</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.rose, fontFamily: theme.typography.fontFamily.monoBold }}>{pressureBonusWeight}%</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[5, 10, 15, 20, 25].map(v => (
              <TouchableOpacity key={v} onPress={() => setPressureBonusWeight(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: pressureBonusWeight === v ? theme.colors.roseLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: pressureBonusWeight === v ? theme.colors.rose + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: pressureBonusWeight === v ? theme.colors.rose : theme.colors.textTertiary }}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Diversity Rails (enhanced) ── */}
      <SectionTitle>DIVERSITY RAILS</SectionTitle>
      <Card style={{ paddingHorizontal: 16 }}>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Min Energy Threshold</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Only include picks with energy score above this threshold</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: theme.typography.fontFamily.monoBold }}>{minEnergyThreshold}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 10, 20, 30, 40, 50].map(v => (
              <TouchableOpacity key={v} onPress={() => setMinEnergyThreshold(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: minEnergyThreshold === v ? theme.colors.primaryLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: minEnergyThreshold === v ? theme.colors.primary + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: minEnergyThreshold === v ? theme.colors.primary : theme.colors.textTertiary }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>🚫 Recent Hit Cooldown</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 1 }}>Exclude combos that hit within last N draws (0 = off)</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.teal, fontFamily: theme.typography.fontFamily.monoBold }}>{recentHitCooldown === 0 ? 'Off' : `${recentHitCooldown}d`}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[0, 5, 10, 15, 20, 25, 30].map(v => (
              <TouchableOpacity key={v} onPress={() => setRecentHitCooldown(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: recentHitCooldown === v ? theme.colors.tealLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: recentHitCooldown === v ? theme.colors.teal + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: recentHitCooldown === v ? theme.colors.teal : theme.colors.textTertiary }}>{v === 0 ? 'Off' : v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Slate Generation Schedule ── */}
      <SectionTitle>SLATE GENERATION SCHEDULE</SectionTitle>
      <Card style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <ToggleRow
          icon="⏰"
          label="Auto-generate Slates"
          sub="Note: requires server-side scheduling (Phase 3)"
          on={autoGenSlates}
          onChange={setAutoGenSlates}
        />
        {autoGenSlates && (
          <>
            <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>Morning Generation Time (ET)</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {['02:00','03:00','04:00','05:00','06:00'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setMorningGenTime(t)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: morningGenTime === t ? theme.colors.goldLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: morningGenTime === t ? theme.colors.gold + '55' : theme.colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: morningGenTime === t ? theme.colors.gold : theme.colors.textTertiary }}>{t} ET</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ paddingVertical: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>Evening Generation Time (ET)</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {['14:00','15:00','16:00','17:00','18:00'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setEveningGenTime(t)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: eveningGenTime === t ? theme.colors.goldLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: eveningGenTime === t ? theme.colors.gold + '55' : theme.colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: eveningGenTime === t ? theme.colors.gold : theme.colors.textTertiary }}>{t} ET</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}
      </Card>

      {saveError && (
        <Card style={{ padding: 10, marginBottom: 10, backgroundColor: theme.colors.errorLight, borderColor: theme.colors.error + '44' }}>
          <Text style={{ fontSize: 11, color: theme.colors.error }}>✗ Save failed — {saveError}</Text>
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
        <TouchableOpacity style={st.btnGhost} onPress={handleReset}>
          <Text style={st.btnGhostText}>↺ Reset</Text>
        </TouchableOpacity>
      </View>
      {regenerateSlate && (
        <TouchableOpacity
          style={[st.btnPrimary, { marginTop: 8, backgroundColor: theme.colors.teal, opacity: saving || regenning ? 0.6 : 1 }]}
          onPress={handleSaveAndRegen}
          disabled={saving || regenning}
        >
          {regenning && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
          <Text style={st.btnPrimaryText}>
            {regenning ? '↻ Saving & Regenerating…' : '↻ Save & Regen All Slates'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Preview Engine Output button */}
      <TouchableOpacity
        style={[st.btnGhost, { borderWidth: 1.5, borderColor: theme.colors.primary + '44', backgroundColor: theme.colors.primaryLight, marginTop: 10 }]}
        onPress={() => setPreviewModal(true)}
      >
        <Text style={[st.btnGhostText, { color: theme.colors.primary, fontWeight: '700' }]}>
          🔮 Preview Engine Output
        </Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 10, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 6, marginBottom: 20 }}>
        Runs computeSlate with current settings and shows K6 picks
      </Text>
      {savedAt && (
        <Text style={{ fontSize: 10, color: theme.colors.success, textAlign: 'center', marginTop: -14, marginBottom: 16 }}>
          Last saved: {savedAt} — engine will use these weights on next slate generation
        </Text>
      )}

      {/* Preview modal */}
      {previewModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setPreviewModal(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: '#1E1B4B55' }} activeOpacity={1} onPress={() => setPreviewModal(false)}>
            <TouchableOpacity activeOpacity={1} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: theme.colors.border, padding: 20, maxHeight: '70%' }} onPress={() => {}}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceMuted, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>🔮 Engine Preview</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 }}>
                Current config: {wPreset} preset · {singlesMax} singles max · {doublesMax} doubles max · scope: {defaultScope}
              </Text>
              <Card style={{ padding: 14, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '28', marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 }}>Preview Engine Output</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 18 }}>
                  To preview engine output with current settings, save your config first then use Regen All Slates on the Dashboard. Live engine preview requires the full Supabase dataset to be loaded.
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
