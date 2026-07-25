// app/pattern-explorer.tsx — ENH-ANALYTICS-01
//
// Consumer Pattern Explorer (Pro): footprint search + expected-vs-observed
// frequency tables over the tracked drawing history. Thin wrapper around the
// shared panels in components/analytics/ — same read-only compute layer as
// the admin Analytics view. In check:brand-voice IN_SCOPE.

import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { PremiumGate } from '@/components/PremiumGate';
import { Chip, ChipRow } from '@/components/analytics/analyticsShared';
import FootprintPanel from '@/components/analytics/FootprintPanel';
import PatternStatsPanel from '@/components/analytics/PatternStatsPanel';

export default function PatternExplorerScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'footprint' | 'stats'>('footprint');

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <PremiumGate
        requiredTier="PRO"
        feature="Pattern Explorer"
        description="Search any 3-digit pattern's full appearance history, and compare observed frequency against mathematical baselines — across every tracked jurisdiction."
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <ChipRow>
            <Chip
              label="🔎 Footprint"
              active={tab === 'footprint'}
              onPress={() => setTab('footprint')}
            />
            <Chip
              label="📊 Frequency"
              active={tab === 'stats'}
              onPress={() => setTab('stats')}
            />
          </ChipRow>
        </View>
        {tab === 'footprint' ? <FootprintPanel /> : <PatternStatsPanel />}
      </PremiumGate>
    </View>
  );
}
