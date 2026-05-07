import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '@/constants/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useCoverage } from '@/hooks/useCoverage';
import { Clock, Database, TrendingUp, Wifi, WifiOff } from 'lucide-react-native';

export function StatusRibbon() {
  const { lastUpdate, snapshot, hasLiveData } = useSnapshot();
  const { healthMetrics, isLoading } = useDataIngestion();
  const { matrix } = useCoverage();

  // Generate coverage chips based on horizons present
  const horizonChips = [];
  if (snapshot?.horizons_present_json) {
    const present = Object.entries(snapshot.horizons_present_json)
      .filter(([_, isPresent]) => isPresent)
      .map(([horizon]) => horizon);
    
    if (present.length > 0) {
      horizonChips.push({
        icon: <Database size={14} color={theme.colors.success} />,
        label: `Box ${present.join(',')} ✓`,
        color: theme.colors.success,
      });
      
      // Show pair classes coverage (live data)
      horizonChips.push({
        icon: <Database size={14} color={theme.colors.success} />,
        label: `Pair 1-10 ${present.slice(0,2).join(',')} ✓`,
        color: theme.colors.success,
      });
      
      // Show pending horizons
      const pending = Object.entries(snapshot.horizons_present_json)
        .filter(([_, isPresent]) => !isPresent)
        .map(([horizon]) => horizon)
        .slice(0, 3); // Show first 3 pending
        
      if (pending.length > 0) {
        horizonChips.push({
          icon: <Clock size={14} color={theme.colors.warning} />,
          label: `${pending.join(',')} ⌛`,
          color: theme.colors.warning,
        });
      }
    }
  }

  // Backend status - use hasLiveData from useSnapshot or fallback to healthMetrics
  const backendOnline = hasLiveData || (healthMetrics && (
    healthMetrics.datasetCounts.boxEntries > 0 || 
    healthMetrics.datasetCounts.pairEntries > 0
  ));
  
  const backendChip = {
    icon: backendOnline ? 
      <Wifi size={14} color={theme.colors.success} /> : 
      <WifiOff size={14} color={theme.colors.warning} />,
    label: backendOnline ? 'Backend: Online' : 'Backend: Fallback',
    color: backendOnline ? theme.colors.success : theme.colors.warning,
  };

  const coverageDiff = useMemo(() => {
    const totals = { H01Y: 0, H02Y: 0, H06Y: 0 } as Record<'H01Y' | 'H02Y' | 'H06Y', number>;
    const totalClasses = 11;
    Object.keys(matrix).forEach((cidStr) => {
      const cid = Number(cidStr);
      if (!Number.isFinite(cid)) return;
      if (matrix[cid]?.['H01Y']?.present) totals.H01Y += 1;
      if (matrix[cid]?.['H02Y']?.present) totals.H02Y += 1;
      if (matrix[cid]?.['H06Y']?.present) totals.H06Y += 1;
    });
    return `H01Y=${totals.H01Y}/${totalClasses} • H02Y=${totals.H02Y}/${totalClasses} • H06Y=${totals.H06Y}/${totalClasses}`;
  }, [matrix]);

  const chips = [
    {
      icon: <Clock size={14} color={theme.colors.primary} />,
      label: `Last: ${lastUpdate || 'Never'}`,
      color: theme.colors.primary,
    },
    {
      icon: <Database size={14} color={theme.colors.dataYellow} />,
      label: coverageDiff,
      color: theme.colors.dataYellow,
    },
    ...horizonChips,
    {
      icon: <TrendingUp size={14} color={theme.colors.dataBlue} />,
      label: 'Norm: percentile',
      color: theme.colors.dataBlue,
    },
    {
      icon: <TrendingUp size={14} color={theme.colors.dataPurple} />,
      label: 'Winsor: p99',
      color: theme.colors.dataPurple,
    },
    backendChip,
  ];
  
  if (healthMetrics) {
    if (healthMetrics.datasetCounts.boxEntries > 0) {
      chips.splice(-1, 0, {
        icon: <Database size={14} color={theme.colors.dataGreen} />,
        label: `Box: ${healthMetrics.datasetCounts.boxEntries}`,
        color: theme.colors.dataGreen,
      });
    }
    if (healthMetrics.datasetCounts.pairEntries > 0) {
      chips.splice(-1, 0, {
        icon: <Database size={14} color={theme.colors.dataYellow} />,
        label: `Pairs: ${healthMetrics.datasetCounts.pairEntries}`,
        color: theme.colors.dataYellow,
      });
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chips.map((chip, index) => (
          <View key={`chip-${chip.label}-${index}`} style={[styles.chip, { borderColor: chip.color }]}>
            {chip.icon}
            <Text style={[styles.chipText, { color: chip.color }]}>
              {chip.label}
            </Text>
          </View>
        ))}
        {isLoading && (
          <View style={[styles.chip, { borderColor: theme.colors.warning }]}>
            <Clock size={14} color={theme.colors.warning} />
            <Text style={[styles.chipText, { color: theme.colors.warning }]}>
              Loading...
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    backgroundColor: theme.colors.background,
  },
  chipText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});