import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';

/**
 * HitHeroBand — celebratory header band on Results when the day has hits.
 * Horizontal scroll of compact WE-PICKED → DRAWN tiles. The band itself
 * is the headline; the tiles are the receipts.
 *
 * Renders only when items.length > 0. Container handles that gate.
 *
 * Tile design is a compact sibling of components/HitReplay.tsx — same
 * digit-cell vocabulary, no header, fits ~1.5 per screen so the row
 * invites swiping.
 */

const SESSION_EMOJI: Record<string, string> = {
  morning: '🌅', midday: '☀️', evening: '🌙', night: '🌑',
};

export interface HitHeroItem {
  combo: string;
  hitResult?: string;          // optional — for snapshot-tier picks where we don't have it
  hitType: 'straight' | 'box';
  jurisdiction?: string;
  session?: string;
}

export function HitHeroBand({ items }: { items: HitHeroItem[] }) {
  if (items.length === 0) return null;
  const straightCount = items.filter(i => i.hitType === 'straight').length;
  const hasStraight = straightCount > 0;

  return (
    <LinearGradient
      colors={hasStraight ? theme.gradients.goldAmber : theme.gradients.cyanPurple}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.gradientBorder}
    >
      <View style={s.inner}>
        <View style={s.headerRow}>
          <Text style={s.headlineEmoji}>🎯</Text>
          <Text style={s.headline}>
            {items.length} {items.length === 1 ? 'HIT' : 'HITS'} TODAY
          </Text>
          {hasStraight && (
            <View style={s.straightChip}>
              <Text style={s.straightChipText}>⭐ {straightCount} straight</Text>
            </View>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tileRow}
          accessibilityLabel={`${items.length} hits today, scroll to view`}
        >
          {items.map((it, i) => (
            <Tile key={`${it.combo}-${it.jurisdiction ?? ''}-${i}`} item={it} />
          ))}
        </ScrollView>
      </View>
    </LinearGradient>
  );
}

function Tile({ item }: { item: HitHeroItem }) {
  const isStraight = item.hitType === 'straight';
  const accent = isStraight ? theme.colors.gold : theme.colors.cyan;
  const sess = (item.session ?? '').toLowerCase();
  const sessEmoji = SESSION_EMOJI[sess] ?? '';

  return (
    <View style={[s.tile, { borderColor: accent + '55', shadowColor: accent }]}>
      <View style={s.digitRow}>
        <DigitGroup digits={item.combo} accent={accent} variant="ghost" />
        <Text style={[s.arrow, { color: accent }]}>➜</Text>
        <DigitGroup digits={item.hitResult ?? item.combo} accent={accent} variant="solid" />
      </View>
      <View style={s.tileMetaRow}>
        <Text style={[s.tileType, { color: accent }]}>
          {isStraight ? '⭐ STRAIGHT' : '🎯 BOX'}
        </Text>
        {(item.jurisdiction || sess) && (
          <Text style={s.tileMeta} numberOfLines={1}>
            {item.jurisdiction ?? ''}
            {item.jurisdiction && sess ? ' · ' : ''}
            {sessEmoji ? `${sessEmoji} ${sess}` : sess}
          </Text>
        )}
      </View>
    </View>
  );
}

function DigitGroup({ digits, accent, variant }: {
  digits: string; accent: string; variant: 'ghost' | 'solid';
}) {
  const isSolid = variant === 'solid';
  return (
    <View style={s.digitGroup}>
      {digits.split('').map((d, i) => (
        <View
          key={i}
          style={[
            s.digitCell,
            isSolid
              ? { backgroundColor: accent }
              : { backgroundColor: accent + '14', borderWidth: 1, borderColor: accent + '55' },
          ]}
        >
          <Text style={[s.digit, isSolid ? { color: '#0a0613' } : { color: '#ffffff' }]}>{d}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  gradientBorder: {
    marginHorizontal: theme.layout.screenInset,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: theme.borderRadius.card,
    padding: 1.5,
  },
  inner: {
    borderRadius: theme.borderRadius.card - 1,
    backgroundColor: theme.colors.bgElevated,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  headlineEmoji: { fontSize: 16 },
  headline: {
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: theme.colors.text,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  straightChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.gold + '22',
    borderWidth: 1,
    borderColor: theme.colors.gold + '55',
  },
  straightChipText: {
    fontSize: 9,
    fontWeight: '900',
    color: theme.colors.gold,
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 0.5,
  },
  tileRow: { gap: 10, paddingRight: 12 },
  tile: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    padding: 10,
    minWidth: 188,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    gap: 8,
  },
  digitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  digitGroup: { flexDirection: 'row', gap: 3 },
  digitCell: {
    width: 22,
    height: 28,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.monoBold,
    fontWeight: '900',
  },
  arrow: { fontSize: 16, fontWeight: '900', marginHorizontal: 4 },
  tileMetaRow: { gap: 2 },
  tileType: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  tileMeta: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
  },
});

export default HitHeroBand;
