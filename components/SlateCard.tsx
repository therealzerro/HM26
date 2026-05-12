/* ──────────────────────────────────────────────────────────────────────────
   v5 PATCH 01 — SlateCard v2 (real-data aware)
   Replaces: components/SlateCard.tsx

   WHAT CHANGED vs current SlateCard
     • Renders 3 OR 4 signal bars based on what's present
       — your engine only emits DGC on 122/563 picks, so DGC is opt-in
     • New surfaced fields: drawsSince, lastSeen (both first-class)
     • Optional hit-result footer when pick.hitType is set
         shows "DREW → 827  CT · 2026-04-26"
     • Container padding & rank metrics already match data spec
       (12h / 8v, rank 32px width, gap 8px)

   ─── INTEGRATION ────────────────────────────────────────────────────────────
   1) Replace components/SlateCard.tsx with this file.
   2) No call-site changes needed — the new props (drawsSince, lastSeen,
      hitType, hitResult, hitState, hitDate) all already exist on your
      pick objects in slate_snapshots. If your TypeScript Pick type
      doesn't include them, add them as optional in types/core.ts.
   ────────────────────────────────────────────────────────────────────────── */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { SignalBar } from '@/components/SignalBar';

type Signals = Partial<{ BOX: number; PBURST: number; CO: number; DGC: number }>;

interface Props {
  pick: {
    rank: number;
    combo: string;
    comboSet?: string;
    topPair?: string;
    temperature: number;
    energy?: number;
    multiplicity?: 'singles' | 'doubles' | 'triples';
    drawsSince?: number;
    lastSeen?: string;
    signals: Signals;
    // optional hit-realized fields
    hitType?: 'box' | 'straight' | null;
    hitResult?: string;
    hitState?: string;
    hitDate?: string;
  };
  onPress?: () => void;
}

function tempColor(t: number) {
  if (t >= 80) return theme.colors.hot;
  if (t >= 60) return theme.colors.warm;
  if (t >= 40) return theme.colors.mild;
  return theme.colors.cold;
}

const CHANNEL_META: { key: keyof Signals; color: string }[] = [
  { key: 'BOX',    color: theme.colors.cyan   },
  { key: 'PBURST', color: theme.colors.rose   },
  { key: 'CO',     color: theme.colors.purple },
  { key: 'DGC',    color: theme.colors.gold   },
];

export function SlateCard({ pick, onPress }: Props) {
  const tc = tempColor(pick.temperature);
  const isHit = !!pick.hitType;

  const channels = CHANNEL_META.filter(c => typeof pick.signals[c.key] === 'number');

  return (
    <View style={[
      s.card,
      { borderColor: isHit ? tc : theme.colors.border,
        shadowColor: tc,
        shadowOpacity: isHit ? 0.45 : 0.18 },
    ]}>
      {isHit && (
        <View style={[s.hitBadge, { backgroundColor: tc, shadowColor: tc }]}>
          <Text style={s.hitBadgeText}>⭐ {pick.hitType!.toUpperCase()} HIT</Text>
        </View>
      )}

      {/* Header — rank · meta · temp */}
      <View style={s.row}>
        <View style={s.rankBox}>
          <Text style={[s.rank, { color: tc, textShadowColor: tc }]}>#{pick.rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>
            {pick.multiplicity ?? 'singles'}
            {pick.drawsSince !== undefined ? ` · ${pick.drawsSince}↓ DRAWS SINCE` : ''}
          </Text>
          {pick.lastSeen && (
            <Text style={s.metaMono}>last · {pick.lastSeen}</Text>
          )}
        </View>
        <View style={[s.tempBadge, { borderColor: tc, shadowColor: tc }]}>
          <Text style={[s.tempText, { color: tc }]}>
            {pick.temperature >= 80 ? 'HOT' :
             pick.temperature >= 60 ? 'WARM' :
             pick.temperature >= 40 ? 'MILD' : 'COLD'} {pick.temperature}°
          </Text>
        </View>
      </View>

      {/* Combo digits */}
      <View style={s.comboRow}>
        {pick.combo.split('').map((d, i) => (
          <Text key={i} style={[s.digit, { textShadowColor: tc }]}>{d}</Text>
        ))}
        <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
          {pick.comboSet && <Text style={s.metaMono}>{pick.comboSet}</Text>}
          {pick.topPair && (
            <Text style={[s.metaMono, { color: tc }]}>top · {pick.topPair}</Text>
          )}
        </View>
      </View>

      {/* Signal bars — 3 or 4 depending on what's in the data */}
      <View style={s.signals}>
        {channels.map(ch => (
          <SignalBar
            key={ch.key as string}
            channel={ch.key as string}
            value={pick.signals[ch.key] as number}
            color={ch.color}
          />
        ))}
      </View>

      {/* Hit-result footer */}
      {isHit && pick.hitResult && (
        <View style={[s.hitFooter, { borderTopColor: tc + '55' }]}>
          <Text style={s.eyebrow}>DREW →</Text>
          <Text style={[s.hitResult, { color: tc, textShadowColor: tc }]}>
            {pick.hitResult}
          </Text>
          {(pick.hitState || pick.hitDate) && (
            <Text style={s.metaMono}>
              {[pick.hitState, pick.hitDate].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface2 ?? 'rgba(20,12,38,0.72)',
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 18, elevation: 4,
  },
  hitBadge: {
    position: 'absolute', top: -10, right: 12,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10,
  },
  hitBadgeText: {
    color: '#0a0613', fontSize: 9, letterSpacing: 1.4,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankBox: { width: 32, paddingRight: 8 },
  rank: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.monoBold,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  eyebrow: {
    fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase',
    color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.bold,
  },
  metaMono: {
    fontSize: 11, color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily.monoBold, marginTop: 2,
  },
  tempBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, backgroundColor: 'rgba(20,12,38,0.6)',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 10,
  },
  tempText: {
    fontSize: 11, letterSpacing: 1,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  comboRow: { flexDirection: 'row', alignItems: 'baseline', gap: 14, paddingLeft: 32 },
  digit: {
    fontSize: 40, lineHeight: 42, letterSpacing: -1, color: '#fff',
    fontFamily: theme.typography.fontFamily.monoBold,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14,
  },
  signals: { paddingLeft: 32, gap: 5 },
  hitFooter: {
    marginTop: 2, paddingTop: 6, paddingLeft: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  hitResult: {
    fontSize: 18, fontFamily: theme.typography.fontFamily.monoBold,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
});

export default SlateCard;
