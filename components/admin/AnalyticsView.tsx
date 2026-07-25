// components/admin/AnalyticsView.tsx — ENH-ANALYTICS-01
//
// Admin wrapper for the shared analytics panels: Footprint search +
// expected-vs-observed pattern stats. Read-only; same compute layer as the
// consumer Pattern Explorer screen (app/pattern-explorer.tsx).

import React, { useState } from 'react';
import { View } from 'react-native';
import { Chip, ChipRow } from '@/components/analytics/analyticsShared';
import FootprintPanel from '@/components/analytics/FootprintPanel';
import PatternStatsPanel from '@/components/analytics/PatternStatsPanel';

export default function AnalyticsView() {
  const [tab, setTab] = useState<'footprint' | 'stats'>('footprint');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <ChipRow>
          <Chip
            label="🔎 Footprint"
            active={tab === 'footprint'}
            onPress={() => setTab('footprint')}
          />
          <Chip label="📊 Pattern Stats" active={tab === 'stats'} onPress={() => setTab('stats')} />
        </ChipRow>
      </View>
      {tab === 'footprint' ? <FootprintPanel /> : <PatternStatsPanel />}
    </View>
  );
}
