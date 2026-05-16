import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { HitBadge } from './HitBadge';

/**
 * Shared single-hit row (design.md step 4).
 *
 * One gold-tinted row representing one hit, with the standard
 * [badge] [combo] [state · session] layout. Used by Home's "Today's
 * Hits" section and Slate's Hits tab — previously two separate inline
 * implementations that drifted apart.
 *
 * Stack multiple HitCards vertically inside a section header — each
 * card is self-contained (own gold background + border + padding) so
 * no outer wrapper is required.
 */

type HitType = 'straight' | 'box';

interface Props {
  combo: string;
  hitType: HitType;
  hitState?: string | null;
  hitSession?: string | null;
  /** Override accent if you ever need cyan instead of gold (rare). */
  tone?: 'gold' | 'cyan';
  style?: StyleProp<ViewStyle>;
}

function sessionEmoji(session?: string | null): string {
  switch ((session ?? '').toLowerCase()) {
    case 'morning': return '🌅';
    case 'midday':  return '☀️';
    case 'evening': return '🌙';
    case 'night':   return '🌑';
    default:        return '';
  }
}

export function HitCard({ combo, hitType, hitState, hitSession, tone = 'gold', style }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const accent = tone === 'gold' ? colors.gold : colors.cyan;
  return (
    <View
      style={[
        s.row,
        { backgroundColor: accent + '18', borderColor: accent + '44' },
        style,
      ]}
      accessibilityLabel={`${combo} ${hitType} match${hitState ? ` in ${hitState}` : ''}${hitSession ? ` ${hitSession}` : ''}`}
    >
      <HitBadge type={hitType} />
      <Text style={s.combo} numberOfLines={1}>{combo}</Text>
      {(hitState || hitSession) && (
        <Text style={s.meta} numberOfLines={1}>
          {hitState ?? ''}
          {hitSession ? `${hitState ? ' · ' : ''}${sessionEmoji(hitSession)}` : ''}
        </Text>
      )}
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  combo: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
    color: colors.text,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  meta: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
  },
});
