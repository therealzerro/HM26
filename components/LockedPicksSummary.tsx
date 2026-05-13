import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '@/constants/theme';
import type { PickItem } from '@/components/PickCard';

interface Props {
  lockedPicks: PickItem[];
  // Called when the user taps "Watch ad" or "Upgrade". For now both route
  // to the same handler (typically opens the paywall + a toast). When the
  // real rewarded-ad SDK is wired in (see enhancements.md ad-pipeline
  // entry), the per-pick handler can be split off to call RewardedAd.show()
  // and reveal a single pick on success.
  onUnlock: () => void;
  // Called when the row-level "Watch ad" button is tapped. Defaults to
  // onUnlock — pass a separate handler later when ads are live.
  onWatchAd?: (rank: number) => void;
}

export function LockedPicksSummary({ lockedPicks, onUnlock, onWatchAd }: Props) {
  if (lockedPicks.length === 0) return null;
  const handleWatch = onWatchAd ?? ((_rank: number) => onUnlock());

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.headerLabel}>{lockedPicks.length} HIDDEN PICKS</Text>
        <Text style={s.headerSub}>Top-ranked · Oracle+ only</Text>
      </View>
      {lockedPicks.map(p => (
        <View key={p.rank} style={s.row}>
          <Text style={s.rank}>#{p.rank}</Text>
          <Text style={s.combo}>● ● ●</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={s.adBtn}
            onPress={() => handleWatch(p.rank)}
            accessibilityLabel={`Watch ad to unlock pick ${p.rank}`}
          >
            <Text style={s.adBtnText}>👁 Watch ad</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.upgradeRow} onPress={onUnlock}>
        <Text style={s.upgradeText}>♛ Or upgrade for full access →</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 0,
    marginBottom: 9,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.purple + '55',
  },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  headerLabel: { fontSize: 10, fontWeight: '900', color: theme.colors.purple, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  headerSub: { fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  rank: { fontSize: 11, fontWeight: '900', color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, minWidth: 22 },
  combo: { fontSize: 16, fontWeight: '900', color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 4, opacity: 0.5 },
  adBtn: { backgroundColor: theme.colors.purple + '22', borderWidth: 1, borderColor: theme.colors.purple + '66', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  adBtnText: { fontSize: 10, fontWeight: '800', color: theme.colors.purple, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  upgradeRow: { marginTop: 8, paddingTop: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.border + '77' },
  upgradeText: { fontSize: 11, color: theme.colors.gold, fontWeight: '800', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.3 },
});
