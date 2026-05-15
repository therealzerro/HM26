import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme, type ColorTokens } from '@/lib/theme';

interface Props {
  onPress: () => void;
  // Distance from the bottom edge — defaults to 80 to clear the tab bar (~64px).
  bottomOffset?: number;
}

export function HeatCheckFAB({ onPress, bottomOffset = 80 }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  return (
    <TouchableOpacity
      style={[s.fab, { bottom: bottomOffset }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Heat check any number"
      accessibilityHint="Opens a panel to check the energy and hit history of any 3-digit combo."
      activeOpacity={0.85}
    >
      <Text style={s.icon}>🔥</Text>
      <Text style={s.label}>Check</Text>
    </TouchableOpacity>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amber,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: colors.amber,
    shadowColor: colors.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
  },
  icon: { fontSize: 16 },
  label: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
});
