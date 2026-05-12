import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Animated, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '@/constants/theme';
import { SignalBar } from './SignalBar';
import { EnergyMeter } from './EnergyMeter';

const SIGNAL_COLORS = {
  BOX:    theme.colors.cyan,
  PBURST: theme.colors.rose,
  CO:     theme.colors.purple,
  DGC:    theme.colors.gold,
} as const;

export interface PickItem {
  rank: number;
  combo: string;
  comboSet: string;
  bestOrder?: string;
  energy: number;
  multiplicity?: string;
  topPair?: string;
  signals: { BOX: number; PBURST: number; CO: number; DGC?: number };
  locked: boolean;
  drawsSince?: number;
  timesDrawn?: number;
  lastSeen?: string;
  hitType?: 'straight' | 'box';
  hitState?: string;
  hitSession?: string;
  hitResult?: string;
  generatedAt?: string;   // snapshot updated_at_et
  snapshotScope?: string; // snapshot scope
  synergy?: boolean;
}

function formatGenTime(iso?: string): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET';
  } catch { return null; }
}

const SCOPE_LABELS: Record<string, string> = { midday: 'Midday', evening: 'Evening', allday: 'All Day' };

// ─── Heat rating ──────────────────────────────────────────────────────────────
function heatInfo(e: number): { label: string; emoji: string; color: string } {
  if (e >= 90) return { label: 'ON FIRE',  emoji: '🔥', color: theme.colors.error };
  if (e >= 80) return { label: 'BLAZING',  emoji: '⚡', color: theme.colors.error };
  if (e >= 65) return { label: 'HOT',      emoji: '✦',  color: theme.colors.orange };
  if (e >= 45) return { label: 'WARM',     emoji: '◈',  color: theme.colors.gold };
  return         { label: 'COOL',     emoji: '❄',  color: theme.colors.textTertiary };
}

// ─── WHY THIS PICK summary ────────────────────────────────────────────────────
function whySummary(pick: PickItem): string {
  if (pick.synergy) return '⚡ Signal synergy: Multiple lethal indicators aligned';
  const { BOX, PBURST, CO } = pick.signals;
  const parts: string[] = [];
  if (BOX >= 0.65)    parts.push('high frequency');
  if (PBURST >= 0.65) parts.push('pair momentum surging');
  if (CO >= 0.65)     parts.push('strong digit pattern');
  if (pick.drawsSince != null && pick.drawsSince > 200) parts.push(`overdue (${pick.drawsSince}d)`);
  if (parts.length === 0) return 'Multiple signals converging on this combo';
  return parts.join(' · ');
}

// ─── Pressure ─────────────────────────────────────────────────────────────────
function pressureInfo(ds?: number, td?: number): { label: string; sub: string; color: string } | null {
  if (ds == null || td === 0 || ds >= 500) return null;
  if (ds < 30)  return { label: `Fresh hit ✓`,          sub: `Hit ${ds} draws ago`,       color: theme.colors.success };
  if (ds > 200) return { label: `Overdue ⚠`,            sub: `${ds} draws without a hit`, color: theme.colors.orange };
  return               { label: 'Building pressure',     sub: `${ds} draws since last hit`, color: theme.colors.gold };
}

// ─── Signal description ───────────────────────────────────────────────────────
export function signalDesc(label: string, value: number): string {
  const pct = value * 100;
  if (label === 'Frequency') return pct >= 65 ? 'Strong historical pattern' : 'Low frequency signal';
  if (label === 'Momentum')  return pct >= 65 ? 'Pair momentum surging'     : 'Pair momentum quiet';
  return                            pct >= 65 ? 'Strong digit relationships' : 'Pattern signal weak';
}

// ─── Optimal play ─────────────────────────────────────────────────────────────
export function optimalPlay(energy: number): string {
  if (energy >= 80) return '⭐ STRONG BET — Consider box + straight combo';
  if (energy >= 65) return '✦ SOLID PICK — Box play recommended';
  if (energy >= 45) return '◈ WATCH LIST — Box play only';
  return                   '❄ SPECULATIVE — Small box play if at all';
}

// ─── Last seen format ─────────────────────────────────────────────────────────
export function formatLastSeen(lastSeen?: string): string {
  if (!lastSeen) return 'Last hit: Unknown';
  try {
    const [y, m, d] = lastSeen.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return 'Last hit: ' + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Last hit: Unknown';
  }
}

function multColor(m?: string) {
  if (m === 'singles') return theme.colors.cyan;
  if (m === 'doubles') return theme.colors.amber;
  return theme.colors.rose;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

interface PickCardProps {
  pick: PickItem;
  onTap?: () => void;
  onUnlock?: () => void;
}

export function PickCard({ pick, onTap, onUnlock }: PickCardProps) {
  const heat = heatInfo(pick.energy);
  const pressure = pressureInfo(pick.drawsSince, pick.timesDrawn);
  const isHot = pick.energy >= 80;
  const isHotStreak = pick.energy >= 85;
  const isHit = !!pick.hitType;
  const hitColor = pick.hitType === 'straight' ? theme.colors.gold : theme.colors.cyan;

  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const glowRef = useRef<Animated.CompositeAnimation | null>(null);
  const hitAnim = useRef(new Animated.Value(0.4)).current;
  const hitRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!isHot) return;
    glowRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 900, useNativeDriver: false }),
      ])
    );
    glowRef.current.start();
    return () => glowRef.current?.stop();
  }, [isHot]);

  useEffect(() => {
    if (!isHit) return;
    hitRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(hitAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(hitAnim, { toValue: 0.4, duration: 1400, useNativeDriver: false }),
      ])
    );
    hitRef.current.start();
    return () => hitRef.current?.stop();
  }, [isHit]);

  const handleTap = () => {
    Haptics.impactAsync(isHot ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    onTap?.();
  };

  const handleUnlock = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onUnlock?.();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          `🎯 My ZK6 pick for today: ${pick.combo} (Energy ${pick.energy}/100)\n` +
          `Powered by HitMaster ZK6™ Intelligence\n` +
          `Get your daily picks: hitmaster.app\n` +
          `#HitMaster #Pick3 #ZK6`,
      });
    } catch { /* ignore */ }
  };

  if (pick.locked) {
    return (
      <View style={[s.card, { overflow: 'hidden' }]}>
        <View style={{ opacity: 0.2, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={[s.rankBadge, { backgroundColor: theme.colors.surfaceLight }]}>
            <Text style={[s.rankText, { color: theme.colors.textTertiary }]}>#{pick.rank}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.combo, { color: theme.colors.textTertiary }]}>•  •  •</Text>
          </View>
        </View>
        <TouchableOpacity style={s.lockOverlay} activeOpacity={0.85} onPress={handleUnlock}>
          <Text style={{ fontSize: 20 }}>♛</Text>
          <Text style={s.lockTitle}>Pick #{pick.rank} — Oracle+ Only</Text>
          <Text style={s.lockSub}>Tap to unlock all 6 picks</Text>
          <View style={s.lockBadge}>
            <Text style={s.lockBadgeText}>UPGRADE TO ORACLE+</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const convergingSignals = [
    { key: 'BOX', color: SIGNAL_COLORS.BOX,   on: pick.signals.BOX >= 0.65 },
    { key: 'MB',  color: SIGNAL_COLORS.PBURST, on: pick.signals.PBURST >= 0.65 },
    { key: 'CO',  color: SIGNAL_COLORS.CO,     on: pick.signals.CO >= 0.65 },
    { key: 'DGC', color: SIGNAL_COLORS.DGC,    on: (pick.signals.DGC ?? 0) >= 0.65 },
  ];

  return (
    <Animated.View
      style={[
        s.card,
        isHit && { borderColor: hitColor, borderWidth: 1.5, shadowColor: hitColor, shadowOpacity: hitAnim as any, shadowRadius: 14, elevation: 10 },
        !isHit && isHot && { borderColor: heat.color, borderWidth: 1.5 },
        !isHit && isHot && { shadowColor: heat.color, shadowOpacity: glowAnim as any, shadowRadius: 12, elevation: 8 },
      ]}
    >
      <TouchableOpacity onPress={handleTap} activeOpacity={0.85}>
        {/* ── HIT banner ── */}
        {isHit && (
          <View style={[s.hitBanner, { backgroundColor: hitColor + '18', borderColor: hitColor + '50' }]}>
            <Text style={[s.hitBannerText, { color: hitColor }]}>
              {pick.hitType === 'straight' ? '⭐ STRAIGHT HIT' : '🎯 BOX HIT'}
              {pick.hitResult ? ` — ${pick.hitResult}` : ''}
            </Text>
          </View>
        )}
        {/* ── HOT STREAK banner ── */}
        {isHotStreak && !isHit && (
          <View style={s.hotStreakBanner}>
            <Text style={s.hotStreakText}>🔥 HOT STREAK — Energy {pick.energy}/100</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {/* Rank badge with medal */}
          <View style={[
            s.rankBadge,
            pick.rank === 1 ? { backgroundColor: theme.colors.gold }
            : pick.rank === 2 ? { backgroundColor: '#C0C0C0' }
            : pick.rank === 3 ? { backgroundColor: '#CD7F32' }
            : { backgroundColor: theme.colors.surfaceLight },
          ]}>
            {MEDAL[pick.rank] ? (
              <Text style={{ fontSize: 18 }}>{MEDAL[pick.rank]}</Text>
            ) : (
              <Text style={[s.rankText, { color: pick.rank <= 3 ? '#fff' : theme.colors.textTertiary }]}>
                #{pick.rank}
              </Text>
            )}
          </View>

          {/* Body */}
          <View style={{ flex: 1 }}>
            {/* Best Straight — primary */}
            <View style={{ marginBottom: 6 }}>
              <Text style={s.bestStraightLabel}>⚡ Best Straight</Text>
              <Text style={s.bestStraightDigits}>
                {(pick.bestOrder ?? pick.combo).split('').join(' - ')}
              </Text>
              <Text style={s.boxSetSecondary}>Box: {pick.comboSet}</Text>
              {(() => {
                const genTime = formatGenTime(pick.generatedAt);
                const scopeLabel = SCOPE_LABELS[pick.snapshotScope ?? ''] ?? pick.snapshotScope;
                if (!genTime && !scopeLabel) return null;
                return (
                  <Text style={s.genTimestamp}>
                    {genTime ? `Generated ${genTime}` : ''}
                    {genTime && scopeLabel ? ' · ' : ''}
                    {scopeLabel ? `${scopeLabel} scope` : ''}
                  </Text>
                );
              })()}
            </View>

            {/* WHY THIS PICK */}
            <View style={s.whyBanner}>
              <Text style={s.whyLabel}>WHY THIS PICK</Text>
              <Text style={s.whyText}>{whySummary(pick)}</Text>
            </View>

            {/* Signal convergence dots */}
            <View style={s.signalDots}>
              {convergingSignals.map(sig => (
                <View key={sig.key} style={[s.sigDot, { backgroundColor: sig.on ? sig.color : theme.colors.border }]}>
                  <Text style={[s.sigDotLabel, { color: sig.on ? '#fff' : theme.colors.textTertiary }]}>{sig.key}</Text>
                </View>
              ))}
              <Text style={s.sigDotHint}>
                {convergingSignals.filter(s => s.on).length}/{convergingSignals.length} signals converging
              </Text>
            </View>

            {/* Quick stats row */}
            <View style={s.quickStats}>
              <View style={s.qStat}>
                <Text style={s.qStatNum}>
                  {pick.drawsSince == null
                    ? '—'
                    : pick.drawsSince === 0
                    ? 'Recent'
                    : pick.drawsSince >= 500
                    ? 'Cold'
                    : pick.drawsSince}
                </Text>
                <Text style={s.qStatLabel}>draws ago</Text>
              </View>
              {pick.timesDrawn != null && pick.timesDrawn > 0 && (
                <View style={s.qStat}>
                  <Text style={s.qStatNum}>{pick.timesDrawn}×</Text>
                  <Text style={s.qStatLabel}>all-time hits</Text>
                </View>
              )}
              {pick.energy != null && (
                <View style={s.qStat}>
                  <Text style={[s.qStatNum, { color: heat.color }]}>{pick.energy}</Text>
                  <Text style={s.qStatLabel}>energy</Text>
                </View>
              )}
            </View>

            {/* Tags row */}
            <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 8, marginTop: 4 }}>
              {pick.multiplicity && (
                <View style={[s.tag, { backgroundColor: multColor(pick.multiplicity) + '18' }]}>
                  <Text style={[s.tagText, { color: multColor(pick.multiplicity) }]}>{pick.multiplicity}</Text>
                </View>
              )}
              {pick.synergy && (
                <View style={[s.tag, { backgroundColor: theme.colors.goldLight }]}>
                  <Text style={[s.tagText, { color: theme.colors.gold }]}>⚡ SUPER SIGNAL</Text>
                </View>
              )}
              {pick.topPair && (
                <View style={[s.tag, { backgroundColor: theme.colors.primaryLight }]}>
                  <Text style={[s.tagText, { color: theme.colors.primary }]}>Pair {pick.topPair}</Text>
                </View>
              )}
              {(pick.timesDrawn === 0 || pick.timesDrawn == null) && (
                <View style={[s.tag, { backgroundColor: theme.colors.surfaceLight }]}>
                  <Text style={[s.tagText, { color: theme.colors.textTertiary }]}>Limited data</Text>
                </View>
              )}
            </View>

            <SignalBar label="Frequency"   value={pick.signals.BOX}          color={SIGNAL_COLORS.BOX} />
            <SignalBar label="Momentum"    value={pick.signals.PBURST}        color={SIGNAL_COLORS.PBURST} />
            <SignalBar label="Pattern"     value={pick.signals.CO}            color={SIGNAL_COLORS.CO} />
            <SignalBar label="Consistency" value={pick.signals.DGC ?? 0}      color={SIGNAL_COLORS.DGC} />

            {pressure && (
              <View style={s.pressureRow}>
                <View style={[s.pressureDot, { backgroundColor: pressure.color }]} />
                <Text style={[s.pressureText, { color: pressure.color }]}>{pressure.label}</Text>
                <Text style={s.pressureSub}>{pressure.sub}</Text>
              </View>
            )}
          </View>

          {/* Energy badge */}
          <View style={{ alignItems: 'center' }}>
            <EnergyMeter value={pick.energy} size={52} />
            {onTap && <Text style={s.tapHint}>tap ↗</Text>}
          </View>
        </View>

        {/* Bottom row */}
        <View style={s.bottomRow}>
          {pick.lastSeen && (
            <Text style={s.lastSeenText}>{formatLastSeen(pick.lastSeen)}</Text>
          )}
          <TouchableOpacity onPress={handleShare} style={s.shareBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.shareBtnText}>📤 Share</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.purple + '28',
    padding: 14,
    marginBottom: 9,
    ...theme.shadows.glow,
  },
  hitBanner: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  hitBannerText: { fontSize: 11, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.5 },
  hotStreakBanner: {
    backgroundColor: theme.colors.error + '15',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.error + '40',
    alignItems: 'center',
  },
  hotStreakText: { fontSize: 11, fontWeight: '800', color: theme.colors.error, letterSpacing: 0.5 },
  whyBanner: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.purple + '40',
  },
  whyLabel: { fontSize: 8, fontWeight: '900', color: theme.colors.purple, letterSpacing: 1, marginBottom: 2 },
  whyText: { fontSize: 10, color: theme.colors.text, lineHeight: 14 },
  signalDots: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  sigDot: {
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  sigDotLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  sigDotHint: { fontSize: 9, color: theme.colors.textTertiary, flex: 1 },
  quickStats: {
    flexDirection: 'row', gap: 10, marginBottom: 8,
    backgroundColor: theme.colors.bgElevated, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  qStat: { alignItems: 'center', flex: 1 },
  qStatNum: { fontSize: 14, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold },
  qStatLabel: { fontSize: 8, color: theme.colors.textTertiary, fontWeight: '600' },
  rankBadge: {
    width: 37, height: 37, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankText: { fontSize: 12, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  bestStraightLabel: { fontSize: 8, fontWeight: '900', color: theme.colors.cyan, letterSpacing: 1.5, marginBottom: 2 },
  bestStraightDigits: { fontSize: 26, fontWeight: '900', color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 3, lineHeight: 31 },
  genTimestamp: { fontSize: 9, color: theme.colors.textTertiary, marginTop: 3 },
  boxSetSecondary: { fontSize: 10, color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, marginTop: 2 },
  combo: {
    fontSize: 32, color: theme.colors.text,
    letterSpacing: 4, fontFamily: theme.typography.fontFamily.monoBold,
  },
  comboSet: { fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  straightRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  straightRowGold: {
    backgroundColor: theme.colors.goldLight, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: theme.colors.gold + '33',
  },
  straightLabel: { fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700' },
  straightVal: {
    fontSize: 12, color: theme.colors.primary,
    fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 2,
  },
  straightBadge: {
    backgroundColor: theme.colors.gold + '25', borderRadius: 99,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: theme.colors.gold + '44',
  },
  straightBadgeText: { fontSize: 8, fontWeight: '800', color: theme.colors.gold },
  straightHint: {
    fontSize: 9, color: theme.colors.gold + 'BB', fontStyle: 'italic',
    marginBottom: 6, marginTop: 1, lineHeight: 13,
  },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 },
  tagText: { fontSize: 9, fontWeight: '700' },
  tapHint: { fontSize: 8, color: theme.colors.textTertiary },
  pressureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7,
  },
  pressureDot: { width: 5, height: 5, borderRadius: 3 },
  pressureText: { fontSize: 10, fontWeight: '700' },
  pressureSub: { fontSize: 9, color: theme.colors.textTertiary, marginLeft: 2 },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  lastSeenText: { fontSize: 10, color: theme.colors.textTertiary, flex: 1 },
  shareBtn: {
    backgroundColor: theme.colors.bgElevated, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: theme.colors.borderMed,
  },
  shareBtnText: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700' },
  lockOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated + 'EE',
    borderRadius: theme.borderRadius.card, gap: 4,
  },
  lockTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  lockSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 3, marginBottom: 6 },
  lockBadge: {
    backgroundColor: theme.colors.goldLight, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 99, borderWidth: 1, borderColor: theme.colors.gold + '40',
  },
  lockBadgeText: { fontSize: 10, fontWeight: '800', color: theme.colors.gold },
});
