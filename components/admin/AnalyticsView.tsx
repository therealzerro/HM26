// components/admin/AnalyticsView.tsx — ENH-ANALYTICS-01
//
// Admin wrapper for the shared analytics panels: Footprint search +
// expected-vs-observed pattern stats. Read-only; same compute layer as the
// consumer Pattern Explorer screen (app/pattern-explorer.tsx).

import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSt } from './AdminShared';
import FootprintPanel from '@/components/analytics/FootprintPanel';
import PatternStatsPanel from '@/components/analytics/PatternStatsPanel';

const TABS = [
  { id: 'footprint', label: '🔎 Footprint' },
  { id: 'stats', label: '📊 Pattern Stats' },
] as const;

export default function AnalyticsView() {
  const st = useSt();
  const [tab, setTab] = useState<'footprint' | 'stats'>('footprint');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Text style={st.title}>Pattern Analytics</Text>
        <Text style={st.sub}>Footprint search + expected-vs-observed pattern stats · read-only · same compute as Pattern Explorer</Text>
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
          {TABS.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={[st.filterBtn, tab === t.id && st.filterBtnOn]}>
              <Text style={[st.filterBtnText, tab === t.id && { color: '#fff', fontWeight: '700' as const }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {tab === 'footprint' ? <FootprintPanel /> : <PatternStatsPanel />}
    </View>
  );
}
