/* ──────────────────────────────────────────────────────────────────────────
   v5 PATCH 02 — HitReplay
   New file: components/HitReplay.tsx

   WHAT
     Side-by-side predicted vs drawn digit visual. Drops into:
       • PickDetailModal — top of PLAY tab when the pick has hit
       • Results screen — every hit cell expands to show this
       • Push-notification deep-link landing

   ─── INTEGRATION ───────────────────────────────────────────────────────────
   In PickDetailModal.tsx PLAY tab:

      import { HitReplay } from '@/components/HitReplay';
      …
      {pick.hitType && pick.hitResult && (
        <HitReplay pick={pick}/>
      )}
   ────────────────────────────────────────────────────────────────────────── */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';

interface Props {
  pick: {
    combo: string;
    hitResult: string;
    hitType: 'box' | 'straight';
    hitState?: string;
    hitDate?: string;
    temperature: number;
  };
}

function tempColor(t: number, colors: ColorTokens) {
  if (t >= 80) return colors.hot;
  if (t >= 60) return colors.warm;
  if (t >= 40) return colors.mild;
  return colors.cold;
}

export function HitReplay({ pick }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const tc = tempColor(pick.temperature, colors);

  return (
    <View style={[s.card, { borderColor: tc + '66', shadowColor: tc }]}>
      <View style={s.header}>
        <Text style={s.eyebrow}>{pick.hitType.toUpperCase()} MATCH REPLAY</Text>
        <Text style={[s.meta, { color: tc }]}>
          {[pick.hitState, pick.hitDate].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={s.row}>
        <DigitGroup label="WE SIGNALED" digits={pick.combo} color={tc} variant="ghost"/>
        <Text style={[s.arrow, { color: tc, textShadowColor: tc }]}>→</Text>
        <DigitGroup label="DRAWN" digits={pick.hitResult} color={tc} variant="solid"/>
      </View>
    </View>
  );
}

function DigitGroup({ label, digits, color, variant }: {
  label: string; digits: string; color: string; variant: 'ghost' | 'solid';
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const isSolid = variant === 'solid';
  return (
    <View style={s.group}>
      <Text style={[s.groupLabel, { color: isSolid ? color : colors.textTertiary }]}>
        {label}
      </Text>
      <View style={s.digits}>
        {digits.split('').map((d, i) => (
          <View key={i} style={[
            s.digitCell,
            isSolid
              ? { backgroundColor: color, shadowColor: color }
              : { backgroundColor: color + '11', borderColor: color + '66' },
          ]}>
            <Text style={[
              s.digit,
              isSolid ? { color: '#0a0613' }
                      : { color: '#fff', textShadowColor: color },
            ]}>{d}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  card: {
    padding: 14, borderRadius: 14, borderWidth: 1,
    backgroundColor: colors.surface2 ?? 'rgba(20,12,38,0.72)',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 16,
    gap: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: {
    fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase',
    color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.bold,
  },
  meta: {
    fontSize: 9, letterSpacing: 1,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  group: { alignItems: 'center', gap: 4 },
  groupLabel: {
    fontSize: 8, letterSpacing: 1.4,
    fontFamily: theme.typography.fontFamily.bold,
  },
  digits: { flexDirection: 'row', gap: 4 },
  digitCell: {
    width: 32, height: 40, borderRadius: 6, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', borderColor: 'transparent',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 8,
  },
  digit: {
    fontSize: 22, fontFamily: theme.typography.fontFamily.monoBold,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },
  arrow: {
    fontSize: 24,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
});

export default HitReplay;
