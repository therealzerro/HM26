import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, PanResponder, Dimensions, ScrollView,
} from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import type { PickItem } from './PickCard';

/**
 * §2.3 — Plain-language "How was this pick made?" explainer.
 *
 * Sits beside the deep-dive PickDetailModal (operator-flavored). This one
 * is intentionally short and explains the engine in subscriber voice: which
 * signal is strongest, what cooldown looks like, what the rail constraints
 * do. Most users will never tap it — but its presence kills the "is this
 * random?" suspicion in one stroke.
 */

interface Props {
  visible: boolean;
  onClose: () => void;
  pick: PickItem | null;
}

interface SignalRow {
  key: 'BOX' | 'PBURST' | 'CO' | 'DGC';
  label: string;
  plain: string;
  value: number;
  color: string;
}

function summaryFor(top: SignalRow, combo: string): string {
  const setStr = '{' + combo.split('').sort().join(',') + '}';
  switch (top.key) {
    case 'BOX':
      return `${setStr} is matching more often than average across recent history — the strongest signal driving this pick.`;
    case 'PBURST':
      return `The digit pairs in ${combo} are showing momentum lately — recent draws are clustering around these pairs.`;
    case 'CO':
      return `${combo}'s digits co-occur in observed draws at an above-average rate across the historical record.`;
    case 'DGC':
      return `${combo}'s signal stays consistent across multiple time horizons (week / month / year) — it's not a one-window fluke.`;
  }
}

function lastSeenLine(pick: PickItem): string | null {
  if (pick.drawsSince == null) return null;
  if (pick.drawsSince === 0) return '⚡ Drew today — the engine flags this for residual pressure.';
  if (pick.drawsSince === 1) return '⏱ Last drew yesterday';
  if (pick.drawsSince < 7) return `⏱ Last drew ${pick.drawsSince} draws ago`;
  if (pick.drawsSince < 30) return `⏱ Last drew about ${Math.round(pick.drawsSince / 7)} week${Math.round(pick.drawsSince / 7) === 1 ? '' : 's'} ago`;
  if (pick.drawsSince < 365) return `⏱ Last drew about ${Math.round(pick.drawsSince / 30)} month${Math.round(pick.drawsSince / 30) === 1 ? '' : 's'} ago`;
  return '⏱ Hasn\'t drawn in over a year — strong overdue pressure';
}

function frequencyLine(pick: PickItem): string | null {
  if (pick.timesDrawn == null || pick.timesDrawn <= 0) return null;
  if (pick.timesDrawn === 1) return '📊 Hit 1× across the historical record';
  return `📊 Hit ${pick.timesDrawn}× across the historical record`;
}

export function PickExplainerModal({ visible, onClose, pick }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const translateY = useRef(new Animated.Value(0)).current;
  const screenH = Dimensions.get('window').height;

  const animateClose = useCallback(() => {
    Animated.timing(translateY, {
      toValue: screenH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      onClose();
    });
  }, [translateY, screenH, onClose]);

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.6) {
          animateClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (!pick) return null;

  const signals: SignalRow[] = [
    { key: 'BOX',    label: 'Frequency',       plain: 'how often this box-set hits', value: pick.signals.BOX,          color: colors.cyan },
    { key: 'PBURST', label: 'Pair Momentum',   plain: 'recent drawing of these pairs', value: pick.signals.PBURST,     color: colors.rose },
    { key: 'CO',     label: 'Co-occurrence',   plain: 'digits drawing together',       value: pick.signals.CO,         color: colors.purple },
    { key: 'DGC',    label: 'Consistency',     plain: 'signal stability across time',  value: pick.signals.DGC ?? 0,   color: colors.gold },
  ];
  const top = [...signals].sort((a, b) => b.value - a.value)[0];
  const summary = summaryFor(top, pick.combo);
  const lastSeen = lastSeenLine(pick);
  const freq = frequencyLine(pick);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={animateClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={animateClose}>
        <Animated.View
          style={[s.sheet, { transform: [{ translateY }] }]}
          onStartShouldSetResponder={() => true}
          onResponderRelease={() => {}}
        >
          <View style={s.topBar} {...panResponder.panHandlers}>
            <View style={s.topBarSpacer} />
            <View style={s.handleHitArea}>
              <View style={s.handle} />
            </View>
            <TouchableOpacity
              onPress={animateClose}
              style={s.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close explainer"
              activeOpacity={0.7}
            >
              <View style={s.closeBtnInner}>
                <Text style={s.closeX}>✕</Text>
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <Text style={s.title}>How this signal was made</Text>

              <View style={s.heroRow}>
                <Text style={s.combo}>{pick.combo}</Text>
                <View style={s.energyPill}>
                  <Text style={s.energyNum}>{pick.energy}</Text>
                  <Text style={s.energyLbl}>energy</Text>
                </View>
              </View>

              <Text style={s.summary}>{summary}</Text>

              <Text style={s.sectionLabel}>SIGNAL BREAKDOWN</Text>
              <View style={s.signalCard}>
                {signals.map(sig => (
                  <View key={sig.key} style={s.signalRow}>
                    <View style={s.signalHeader}>
                      <Text style={s.signalLabel}>{sig.label}</Text>
                      <Text style={[s.signalValue, { color: sig.color }]}>{Math.round(sig.value * 100)}%</Text>
                    </View>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${Math.min(100, Math.max(0, sig.value * 100))}%`, backgroundColor: sig.color }]} />
                    </View>
                    <Text style={s.signalSub}>{sig.plain}</Text>
                  </View>
                ))}
              </View>

              {(lastSeen || freq) && (
                <>
                  <Text style={s.sectionLabel}>RECENT HISTORY</Text>
                  <View style={s.historyCard}>
                    {lastSeen && <Text style={s.historyLine}>{lastSeen}</Text>}
                    {freq && <Text style={s.historyLine}>{freq}</Text>}
                    {pick.timesDrawn != null && pick.timesDrawn > 0 && (
                      <Text style={s.historySub}>~Expected every {Math.round(365 / pick.timesDrawn)} draws based on rate</Text>
                    )}
                  </View>
                </>
              )}

              <Text style={s.sectionLabel}>WHY IT MADE THE SLATE</Text>
              <View style={s.railCard}>
                <Text style={s.railLine}>The engine scored every 3-digit combo, ranked by weighted signal sum, and ran rail filters:</Text>
                <Text style={s.railBullet}>•  Removed combos that already matched today</Text>
                <Text style={s.railBullet}>•  Removed combos that drew yesterday (cooldown)</Text>
                <Text style={s.railBullet}>•  Capped how many singles / doubles / triples can stack on the slate</Text>
                <Text style={s.railLine}>{pick.combo} survived all six selection passes.</Text>
              </View>

              <Text style={s.footer}>ZK6 v2.0 · weighted signals: BOX / PBURST / CO / DGC</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: colors.border,
    maxHeight: '88%',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, height: 44 },
  topBarSpacer: { width: 44, height: 44 },
  handleHitArea: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 56, height: 5, borderRadius: 2.5, backgroundColor: colors.textTertiary + 'AA' },
  closeBtn: { padding: 0 },
  closeBtnInner: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeX: { fontSize: 16, color: colors.text, fontWeight: '800' },

  title: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  combo: {
    fontSize: 40, color: colors.text,
    fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 6,
  },
  energyPill: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1.5,
    borderColor: colors.cyan + '55', backgroundColor: colors.cyan + '15',
  },
  energyNum: { fontSize: 20, fontWeight: '900', color: colors.cyan, fontFamily: theme.typography.fontFamily.monoBold },
  energyLbl: { fontSize: 8, fontWeight: '700', color: colors.cyan, letterSpacing: 0.5 },

  summary: {
    fontSize: 13, lineHeight: 19, color: colors.textSecondary,
    marginBottom: 18,
  },

  sectionLabel: {
    fontSize: 10, fontWeight: '900', color: colors.textTertiary,
    letterSpacing: 1.4, marginTop: 4, marginBottom: 8,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  signalCard: {
    backgroundColor: colors.bgElevated, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border, gap: 12, marginBottom: 16,
  },
  signalRow: {},
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  signalLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  signalValue: { fontSize: 13, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  barTrack: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  signalSub: { fontSize: 10, color: colors.textTertiary, marginTop: 3, fontStyle: 'italic' },

  historyCard: {
    backgroundColor: colors.bgElevated, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border, gap: 6, marginBottom: 16,
  },
  historyLine: { fontSize: 13, color: colors.text, fontFamily: theme.typography.fontFamily.mono },
  historySub: { fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' },

  railCard: {
    backgroundColor: colors.bgElevated, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border, gap: 5, marginBottom: 14,
  },
  railLine: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  railBullet: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, paddingLeft: 6 },

  footer: { fontSize: 10, color: colors.textTertiary, textAlign: 'center', marginTop: 4 },
});
