// components/SessionFilter.tsx — design.md step 5, finally built (DESIGN-02 T1.4)
//
// The session segmented control (All / Mid / Eve). Results previously
// hand-rolled these pills inline; this is the shared, tokenized version.
// Visuals stay compact to fit the 32pt controls strip — the 44pt minimum
// touch target is met with hitSlop instead of visual height.

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

export type SessionFilterKey = 'all' | 'midday' | 'evening';

const OPTIONS: { key: SessionFilterKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '⚡' },
  { key: 'midday', label: 'Mid', icon: '☀️' },
  { key: 'evening', label: 'Eve', icon: '🌙' },
];

export function SessionFilter({
  value,
  onChange,
}: {
  value: SessionFilterKey | string;
  onChange: (key: SessionFilterKey) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {OPTIONS.map(f => {
        const active = value === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            onPress={() => onChange(f.key)}
            hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Filter session: ${f.label}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: theme.borderRadius.pill,
              backgroundColor: active ? colors.cyan + theme.alpha.soft : 'transparent',
              borderWidth: 1,
              borderColor: active ? colors.cyan + theme.alpha.border : colors.border,
            }}
          >
            <Text style={{ fontSize: 11 }}>{f.icon}</Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: active ? '700' : '600',
                color: active ? colors.cyan : colors.textSecondary,
                fontFamily: theme.typography.fontFamily.mono,
              }}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
