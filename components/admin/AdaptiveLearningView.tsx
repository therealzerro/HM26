import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { SectionTitle, Card, st } from './AdminShared';

// ─── Adaptive Learning View ───────────────────────────────────────────────────
export default function AdaptiveLearningView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Pull last 90 days of intelligence data for performance report
      const data = await fetchFromSupabase<any[]>({
        path: '/rest/v1/daily_intelligence?select=slate_date,scope,hit_box,hit_straight,energy_score,hit_state&order=slate_date.desc&limit=2700&mode=neq.zk30',
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Compute stats
  const totalPicks    = rows.length;
  const boxHits       = rows.filter(r => r.hit_box || r.hit_straight);
  const straightHits  = rows.filter(r => r.hit_straight);
  const totalBoxHits  = boxHits.length;
  const totalStraight = straightHits.length;
  const boxHitRate    = totalPicks > 0 ? ((totalBoxHits / totalPicks) * 100).toFixed(1) : '0.0';
  const avgEnergy     = boxHits.length > 0
    ? Math.round(boxHits.reduce((s, r) => s + (r.energy_score ?? 0), 0) / boxHits.length)
    : 0;
  const statesSet     = new Set(rows.filter(r => r.hit_box || r.hit_straight).map(r => r.hit_state).filter(Boolean));

  // Best day — find date with most hits
  const dateHitMap = new Map<string, number>();
  for (const r of rows) {
    if (r.hit_box || r.hit_straight) {
      dateHitMap.set(r.slate_date, (dateHitMap.get(r.slate_date) ?? 0) + 1);
    }
  }
  const bestDay = [...dateHitMap.values()].reduce((max, v) => Math.max(max, v), 0);

  // 7-day chart — last 7 unique dates with picks
  const allDates = [...new Set(rows.map(r => r.slate_date))].slice(0, 7).reverse();
  const day7Data = allDates.map(date => {
    const dayRows = rows.filter(r => r.slate_date === date);
    const dayHits = dayRows.filter(r => r.hit_box || r.hit_straight).length;
    const rate    = dayRows.length > 0 ? (dayHits / dayRows.length) * 100 : 0;
    const label   = date.slice(5); // MM-DD
    return { date, label, rate, hits: dayHits, total: dayRows.length };
  });

  const maxRate = Math.max(...day7Data.map(d => d.rate), 1);

  const isEmpty = !loading && !error && totalPicks === 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>📊 ZK6 Performance Report</Text>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 }}>Verified ZK6 accuracy stats — all picks tracked against real draw results</Text>

      {loading && (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 10 }}>Loading performance data…</Text>
        </View>
      )}

      {error && !loading && (
        <Card style={{ padding: 16, marginBottom: 14, borderColor: theme.colors.error + '44', backgroundColor: theme.colors.error + '0A', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: theme.colors.error, fontWeight: '700', marginBottom: 8 }}>Failed to load data</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 12, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={st.btnGhost} onPress={load}>
            <Text style={st.btnGhostText}>Retry</Text>
          </TouchableOpacity>
        </Card>
      )}

      {isEmpty && !loading && (
        <Card style={{ padding: 24, marginBottom: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>📭</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' }}>No performance data yet</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>Generate slates and import Results Ledger data to begin tracking ZK6 accuracy.</Text>
        </Card>
      )}

      {!loading && !error && !isEmpty && (
        <>
          {/* Stats grid */}
          <SectionTitle>VERIFIED ACCURACY</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {[
              { l: 'Box Hit Rate', v: boxHitRate + '%', c: theme.colors.success },
              { l: 'Best Day (hits)', v: String(bestDay) + '/6', c: theme.colors.gold },
              { l: 'Total Box Hits', v: String(totalBoxHits), c: theme.colors.primary },
              { l: 'Straight Hits', v: String(totalStraight), c: theme.colors.teal },
              { l: 'States Where ZK6 Hit', v: statesSet.size > 0 ? String(statesSet.size) : '—', c: theme.colors.rose },
              { l: 'Avg Energy on Hits', v: avgEnergy > 0 ? String(avgEnergy) : '—', c: theme.colors.primary },
            ].map(s => (
              <Card key={s.l} style={{ width: '47%', padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: 'Courier' }}>{s.v}</Text>
                <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700', textAlign: 'center', marginTop: 3 }}>{s.l}</Text>
              </Card>
            ))}
          </View>

          {/* 7-day chart */}
          {day7Data.length > 0 && (
            <>
              <SectionTitle>ZK6 ACCURACY — LAST 7 DAYS</SectionTitle>
              <Card style={{ padding: 14, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80, marginBottom: 8 }}>
                  {day7Data.map(d => {
                    const barH = Math.max(4, Math.round((d.rate / maxRate) * 70));
                    const isGood = d.rate >= 16;
                    return (
                      <View key={d.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 80 }}>
                        <Text style={{ fontSize: 9, color: isGood ? theme.colors.success : theme.colors.textTertiary, fontWeight: '700', marginBottom: 3 }}>
                          {d.rate.toFixed(0)}%
                        </Text>
                        <View style={{ width: '80%', height: barH, borderRadius: 3, backgroundColor: isGood ? theme.colors.success : theme.colors.surfaceMuted }} />
                        <Text style={{ fontSize: 8, color: theme.colors.textTertiary, marginTop: 4 }}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 10, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 4 }}>
                  Green bars = hit rate ≥16% (1+ box hit per 6 picks)
                </Text>
              </Card>
            </>
          )}

          {/* Trust statement */}
          <Card style={{ padding: 14, marginBottom: 14, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '33' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 }}>Verified Hit Tracking</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 }}>
              ZK6 Intelligence tracks every pick against real draw results automatically. These stats are verified hits — not estimates or projections. The engine is updated daily as new draw data is imported.
            </Text>
          </Card>
        </>
      )}

      <TouchableOpacity style={[st.btnGhost, { marginTop: 4 }]} onPress={load} disabled={loading}>
        <Text style={st.btnGhostText}>{loading ? 'Loading…' : '↺ Refresh Report'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
