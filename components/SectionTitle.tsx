// components/SectionTitle.tsx — DESIGN-02 T1.4
//
// Consumer section-title primitive. Seven ad-hoc variants existed across the
// tabs (sizes 9–12, mono vs monoBold, four colors); this is the canonical
// one: 10pt / 900 / letterSpacing 1.5 / monoBold. `tone` covers the two
// legitimate accents that were in use. Adopt on touch — don't bulk-migrate.

import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

export function SectionTitle({
  children,
  tone = 'muted',
  style,
}: {
  children: string;
  tone?: 'muted' | 'accent' | 'gold';
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const color =
    tone === 'accent' ? colors.cyan : tone === 'gold' ? colors.gold : colors.textTertiary;
  return (
    <Text
      style={[
        {
          fontSize: 10,
          fontWeight: '900',
          letterSpacing: 1.5,
          color,
          fontFamily: theme.typography.fontFamily.monoBold,
          marginBottom: 8,
        },
        style,
      ]}
      maxFontSizeMultiplier={1.4}
    >
      {children}
    </Text>
  );
}
