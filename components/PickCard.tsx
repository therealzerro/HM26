import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { shareTextSafe } from '@/lib/shareText';
import { alertAsync } from '@/lib/confirm';
import * as Haptics from 'expo-haptics';
import { theme } from '@/constants/theme';
import { useTheme, heatTier, type ColorTokens, type ShadowTokens } from '@/lib/theme';
import { SignalBar } from './SignalBar';
import { EnergyMeter } from './EnergyMeter';
import { storage } from '@/lib/storage';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useEnergyBandHitRates, bandFor } from '@/hooks/useEnergyBandHitRates';
import { PickExplainerModal } from './PickExplainerModal';

function signalColors(colors: ColorTokens) {
  return {
    BOX:    colors.cyan,
    PBURST: colors.rose,
    CO:     colors.purple,
    DGC:    colors.gold,
  } as const;
}

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
  hitDate?: string;       // slate_date (YYYY-MM-DD) the hit was recorded on
  generatedAt?: string;   // snapshot updated_at_et
  snapshotScope?: string; // snapshot scope
  synergy?: boolean;
}

function formatGenTime(iso?: string): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }) + ' ET';
  } catch { return null; }
}

const SCOPE_LABELS: Record<string, string> = { midday: 'Midday', evening: 'Evening', allday: 'All Day' };

// ─── Heat rating ──────────────────────────────────────────────────────────────
// Canonical scale lives in lib/theme/heat.ts (DESIGN-02 T1.1) — this file's
// former local ramp was promoted there verbatim.
const heatInfo = heatTier;

function tempColorFor(energy: number, colors: ColorTokens): string {
  return heatTier(energy, colors).color;
}

// ─── WHY THIS PICK summary ────────────────────────────────────────────────────
function whySummary(pick: PickItem): string {
  if (pick.synergy) return '⚡ Signal synergy: Multiple indicators aligned';
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
function pressureInfo(ds: number | undefined, td: number | undefined, colors: ColorTokens): { label: string; sub: string; color: string } | null {
  if (ds == null || td === 0 || ds >= 500) return null;
  if (ds < 30)  return { label: `Fresh match ✓`,        sub: `Matched ${ds} draws ago`,      color: colors.success };
  if (ds > 200) return { label: `Overdue ⚠`,            sub: `${ds} draws without a match`,   color: colors.orange };
  return               { label: 'Building pressure',     sub: `${ds} draws since last match`,  color: colors.gold };
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
  if (energy >= 80) return '⭐ STRONG SIGNAL — Consider box + straight combo';
  if (energy >= 65) return '✦ SOLID SIGNAL — Box arrangement recommended';
  if (energy >= 45) return '◈ WATCH LIST — Box arrangement only';
  return                   '❄ SPECULATIVE — Conservative arrangement only';
}

// ─── Last seen format ─────────────────────────────────────────────────────────
export function formatLastSeen(lastSeen?: string): string {
  if (!lastSeen) return 'Last match: Unknown';
  try {
    const [y, m, d] = lastSeen.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return 'Last match: ' + dt.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Last match: Unknown';
  }
}

function multColor(m: string | undefined, colors: ColorTokens) {
  if (m === 'singles') return colors.cyan;
  if (m === 'doubles') return colors.amber;
  return colors.rose;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

interface PickCardProps {
  pick: PickItem;
  onTap?: () => void;
  onUnlock?: () => void;
}

export function PickCard({ pick, onTap, onUnlock }: PickCardProps) {
  const { colors, shadows } = useTheme();
  const s = useMemo(() => makeS(colors, shadows), [colors, shadows]);
  const SIGNAL_COLORS = useMemo(() => signalColors(colors), [colors]);
  const heat = heatInfo(pick.energy, colors);
  const pressure = pressureInfo(pick.drawsSince, pick.timesDrawn, colors);
  const isHot = pick.energy >= 80;
  const isHotStreak = pick.energy >= 85;
  const isHit = !!pick.hitType;
  const tempC = tempColorFor(pick.energy, colors);
  const hitColor = pick.hitType === 'straight' ? colors.gold : colors.cyan;

  const reduceMotion = useReduceMotion();
  // §2.3 — plain-language explainer modal.
  const [explainerOpen, setExplainerOpen] = useState(false);
  // §2.2 — per-pick "verified by" footer. Look up the historical hit rate
  // for this pick's energy band. Only render once we have a meaningful
  // sample (≥ 50 picks); otherwise the rate is too noisy to quote.
  const { byBand: bandStats } = useEnergyBandHitRates();
  const bandKey = bandFor(pick.energy);
  const bandStat = bandKey ? bandStats.get(bandKey) : undefined;
  const showBandFooter = !!bandStat && bandStat.total >= 50;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const glowRef = useRef<Animated.CompositeAnimation | null>(null);
  const hitAnim = useRef(new Animated.Value(0.4)).current;
  const hitRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!isHot) return;
    if (reduceMotion) { glowAnim.setValue(0.7); return; }
    glowRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 900, useNativeDriver: false }),
      ])
    );
    glowRef.current.start();
    return () => glowRef.current?.stop();
  }, [isHot, reduceMotion]);

  useEffect(() => {
    if (!isHit) return;
    if (reduceMotion) { hitAnim.setValue(0.7); return; }
    hitRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(hitAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(hitAnim, { toValue: 0.4, duration: 1400, useNativeDriver: false }),
      ])
    );
    hitRef.current.start();
    return () => hitRef.current?.stop();
  }, [isHit, reduceMotion]);

  const handleTap = () => {
    Haptics.impactAsync(isHot ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    onTap?.();
  };

  const handleUnlock = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onUnlock?.();
  };

  const handleLongPress = useCallback(async () => {
    if (pick.locked) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const raw = await storage.getItem('number_book_lists');
      const lists: Array<{ id: string; name: string; scope: string; states: string[]; combos: Array<{ combo: string; note: string; starred: boolean; energy?: number }>; type?: string }> = raw ? JSON.parse(raw) : [];
      const target = lists.find(l => l.type !== 'saved_slate') ?? null;
      if (!target) {
        const newList = { id: String(Date.now()), name: 'My Numbers', scope: 'allday', states: [], combos: [], type: 'custom' as const };
        lists.unshift(newList);
      }
      const list = lists.find(l => l.type !== 'saved_slate')!;
      if (list.combos.some(c => c.combo === pick.combo)) return;
      list.combos.unshift({ combo: pick.combo, note: `ZK6 Pick #${pick.rank}`, starred: false, energy: pick.energy });
      await storage.setItem('number_book_lists', JSON.stringify(lists));
    } catch { /* ignore */ }
  }, [pick]);

  const handleShare = async () => {
    try {
      const r = await shareTextSafe(
        `🎯 Today's ZK6 signal: ${pick.combo} (Energy ${pick.energy}/100)\n` +
        `Powered by HitMaster ZK6™ Intelligence\n` +
        `Get your daily signals: hitmaster.app\n` +
        `#HitMaster #ZK6 #DataIntelligence`);
      if (r === 'copied') alertAsync('Copied to clipboard', 'Sharing is unavailable here — the text is on your clipboard.');
    } catch { /* ignore */ }
  };

  if (pick.locked) {
    return (
      <View style={[s.card, s.lockedCard]}>
        <View style={{ opacity: 0.2, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={[s.rankBadge, { backgroundColor: colors.surfaceLight }]}>
            <Text style={[s.rankText, { color: colors.textTertiary }]}>#{pick.rank}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.combo, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.4}>•  •  •</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.lockOverlay}
          activeOpacity={0.85}
          onPress={handleUnlock}
          accessibilityRole="button"
          accessibilityLabel={`Signal ${pick.rank} locked — Oracle+ only`}
          accessibilityHint="Double tap to upgrade and unlock all 6 signals."
        >
          <Text style={s.lockTitle}>♛ Signal #{pick.rank} — Oracle+</Text>
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
        isHit && { borderColor: hitColor, borderWidth: 1.5, shadowColor: hitColor, shadowOpacity: hitAnim as unknown as number, shadowRadius: 14, elevation: 10 },
        !isHit && isHot && { borderColor: heat.color, borderWidth: 1.5 },
        !isHit && isHot && { shadowColor: heat.color, shadowOpacity: glowAnim as unknown as number, shadowRadius: 12, elevation: 8 },
      ]}
    >
      <TouchableOpacity
        onPress={handleTap}
        onLongPress={handleLongPress}
        delayLongPress={600}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Signal ${pick.rank}, combo ${pick.combo.split('').join(' ')}, energy ${pick.energy} ${heat.label}${isHit ? `, match — ${pick.hitType === 'straight' ? 'straight' : 'box'}${pick.hitResult ? ` ${pick.hitResult}` : ''}` : ''}`}
        accessibilityHint="Double tap to open signal details. Long press to share."
      >
        {/* ── HIT banner ── */}
        {isHit && (
          <View style={[s.hitBanner, { backgroundColor: hitColor + '18', borderColor: hitColor + '50' }]}>
            <Text style={[s.hitBannerText, { color: hitColor }]}>
              {pick.hitType === 'straight' ? '⭐ STRAIGHT MATCH' : '🎯 BOX MATCH'}
              {pick.hitResult ? ` — ${pick.hitResult}` : ''}
            </Text>
          </View>
        )}
        {/* ── HOT STREAK banner ── */}
        {isHotStreak && !isHit && (
          <View style={s.hotStreakBanner}>
            <Text style={s.hotStreakText}>🔥 STRONG SIGNAL — Energy {pick.energy}/100</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {/* Rank badge with medal */}
          <View style={[
            s.rankBadge,
            pick.rank === 1 ? { backgroundColor: colors.gold }
            : pick.rank === 2 ? { backgroundColor: '#C0C0C0' }
            : pick.rank === 3 ? { backgroundColor: '#CD7F32' }
            : { backgroundColor: colors.surfaceLight },
          ]}>
            {MEDAL[pick.rank] ? (
              <Text style={{ fontSize: 18 }}>{MEDAL[pick.rank]}</Text>
            ) : (
              <Text style={[s.rankText, { color: pick.rank <= 3 ? '#fff' : colors.textTertiary }]}>
                #{pick.rank}
              </Text>
            )}
          </View>

          {/* Body */}
          <View style={{ flex: 1 }}>
            {/* Best Straight — primary */}
            <View style={{ marginBottom: 6 }}>
              <Text style={[s.bestStraightLabel, { color: tempC }]}>⚡ Best Straight</Text>
              <Text
                style={[
                  s.bestStraightDigits,
                  {
                    color: tempC,
                    textShadowColor: tempC,
                    textShadowRadius: 14,
                    textShadowOffset: { width: 0, height: 0 },
                  },
                ]}
                maxFontSizeMultiplier={1.4}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
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
              <Text style={s.whyLabel}>WHY THIS SIGNAL</Text>
              <Text style={s.whyText}>{whySummary(pick)}</Text>
            </View>

            {/* Signal convergence dots */}
            <View style={s.signalDots}>
              {convergingSignals.map(sig => (
                <View key={sig.key} style={[s.sigDot, { backgroundColor: sig.on ? sig.color : colors.border }]}>
                  <Text style={[s.sigDotLabel, { color: sig.on ? '#fff' : colors.textTertiary }]}>{sig.key}</Text>
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
                  <Text style={s.qStatLabel}>all-time matches</Text>
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
                <View style={[s.tag, { backgroundColor: multColor(pick.multiplicity, colors) + '18' }]}>
                  <Text style={[s.tagText, { color: multColor(pick.multiplicity, colors) }]}>{pick.multiplicity}</Text>
                </View>
              )}
              {pick.synergy && (
                <View style={[s.tag, { backgroundColor: colors.goldLight }]}>
                  <Text style={[s.tagText, { color: colors.gold }]}>⚡ SUPER SIGNAL</Text>
                </View>
              )}
              {pick.topPair && (
                <View style={[s.tag, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[s.tagText, { color: colors.primary }]}>Pair {pick.topPair}</Text>
                </View>
              )}
              {(pick.timesDrawn === 0 || pick.timesDrawn == null) && (
                <View style={[s.tag, { backgroundColor: colors.surfaceLight }]}>
                  <Text style={[s.tagText, { color: colors.textTertiary }]}>Limited data</Text>
                </View>
              )}
            </View>

            <SignalBar label="BOX"    value={pick.signals.BOX}        color={SIGNAL_COLORS.BOX} />
            <SignalBar label="PBURST" value={pick.signals.PBURST}     color={SIGNAL_COLORS.PBURST} />
            <SignalBar label="CO"     value={pick.signals.CO}         color={SIGNAL_COLORS.CO} />
            <SignalBar label="DGC"    value={pick.signals.DGC ?? 0}   color={SIGNAL_COLORS.DGC} />

            {(pressure || (pick.timesDrawn != null && pick.timesDrawn > 0)) && (
              <View style={s.pressureBlock}>
                {pressure && (
                  <View style={s.pressureRow}>
                    <View style={[s.pressureDot, { backgroundColor: pressure.color }]} />
                    <Text style={[s.pressureText, { color: pressure.color }]}>{pressure.label}</Text>
                    <Text style={s.pressureSub}>{pressure.sub}</Text>
                  </View>
                )}
                {pick.drawsSince != null && pick.drawsSince < 500 && (
                  <View style={s.timelineRow}>
                    <View style={s.timelineTrack}>
                      <View style={[s.timelineFill, {
                        width: `${Math.min(100, Math.round((pick.drawsSince / 365) * 100))}%` as any,
                        backgroundColor: pressure?.color ?? colors.gold,
                      }]} />
                    </View>
                    {pick.timesDrawn != null && pick.timesDrawn > 0 && (
                      <View style={s.hitDots}>
                        {Array.from({ length: Math.min(5, pick.timesDrawn) }).map((_, i) => (
                          <View key={i} style={[s.hitDot, { backgroundColor: pressure?.color ?? colors.gold }]} />
                        ))}
                        {pick.timesDrawn > 5 && (
                          <Text style={[s.hitDotMore, { color: pressure?.color ?? colors.gold }]}>+{pick.timesDrawn - 5}</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Energy badge */}
          <View style={{ alignItems: 'center' }}>
            <EnergyMeter value={pick.energy} size={52} />
            {onTap && <Text style={s.tapHint}>tap ↗</Text>}
          </View>
        </View>

        {showBandFooter && bandStat && (
          <View
            style={s.verifiedRow}
            accessibilityRole="text"
            accessibilityLabel={`Verified by historical record: ${bandStat.total} picks at ${bandKey} energy hit ${Math.round(bandStat.rate * 100)} percent of the time.`}
          >
            <Text style={s.verifiedIcon}>✓</Text>
            <Text style={s.verifiedText} numberOfLines={1}>
              <Text style={s.verifiedNum}>{bandStat.total}</Text> picks at{' '}
              <Text style={s.verifiedNum}>{bandKey}</Text> energy hit{' '}
              <Text style={[s.verifiedNum, { color: colors.cyan }]}>{Math.round(bandStat.rate * 100)}%</Text> historically
            </Text>
          </View>
        )}

        {/* Bottom row */}
        <View style={[s.bottomRow, showBandFooter && s.bottomRowNoDivider]}>
          {pick.lastSeen && (
            <Text style={s.lastSeenText}>{formatLastSeen(pick.lastSeen)}</Text>
          )}
          <TouchableOpacity
            onPress={() => setExplainerOpen(true)}
            style={s.explainBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`How was signal ${pick.combo} made? Opens explainer.`}
          >
            <Text style={s.explainBtnText}>❓ Why this signal?</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            style={s.shareBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Share pick ${pick.combo}`}
          >
            <Text style={s.shareBtnText}>📤 Share</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
      <PickExplainerModal visible={explainerOpen} onClose={() => setExplainerOpen(false)} pick={pick} />
    </Animated.View>
  );
}

const makeS = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: colors.purple + '28',
    padding: 14,
    marginBottom: 9,
    ...shadows.glow,
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
    backgroundColor: colors.error + '15',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.error + '40',
    alignItems: 'center',
  },
  hotStreakText: { fontSize: 11, fontWeight: '800', color: colors.error, letterSpacing: 0.5 },
  whyBanner: {
    backgroundColor: colors.bgElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.purple + '40',
  },
  whyLabel: { fontSize: 8, fontWeight: '900', color: colors.purple, letterSpacing: 1, marginBottom: 2 },
  whyText: { fontSize: 10, color: colors.text, lineHeight: 14 },
  signalDots: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  sigDot: {
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  sigDotLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  sigDotHint: { fontSize: 9, color: colors.textTertiary, flex: 1 },
  quickStats: {
    flexDirection: 'row', gap: 10, marginBottom: 8,
    backgroundColor: colors.bgElevated, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  qStat: { alignItems: 'center', flex: 1 },
  qStatNum: { fontSize: 14, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold },
  qStatLabel: { fontSize: 8, color: colors.textTertiary, fontWeight: '600' },
  rankBadge: {
    width: 37, height: 37, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankText: { fontSize: 12, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  bestStraightLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, marginBottom: 2 },
  bestStraightDigits: { fontSize: 26, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 3, lineHeight: 31 },
  genTimestamp: { fontSize: 9, color: colors.textTertiary, marginTop: 3 },
  boxSetSecondary: { fontSize: 10, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, marginTop: 2 },
  combo: {
    fontSize: 32, color: colors.text,
    letterSpacing: 4, fontFamily: theme.typography.fontFamily.monoBold,
  },
  comboSet: { fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  straightRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  straightRowGold: {
    backgroundColor: colors.goldLight, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.gold + '33',
  },
  straightLabel: { fontSize: 9, color: colors.textTertiary, fontWeight: '700' },
  straightVal: {
    fontSize: 12, color: colors.primary,
    fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 2,
  },
  straightBadge: {
    backgroundColor: colors.gold + '25', borderRadius: 99,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: colors.gold + '44',
  },
  straightBadgeText: { fontSize: 8, fontWeight: '800', color: colors.gold },
  straightHint: {
    fontSize: 9, color: colors.gold + 'BB', fontStyle: 'italic',
    marginBottom: 6, marginTop: 1, lineHeight: 13,
  },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 },
  tagText: { fontSize: 9, fontWeight: '700' },
  tapHint: { fontSize: 8, color: colors.textTertiary },
  pressureBlock: { marginTop: 7, gap: 4 },
  pressureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  pressureDot: { width: 5, height: 5, borderRadius: 3 },
  pressureText: { fontSize: 10, fontWeight: '700' },
  pressureSub: { fontSize: 9, color: colors.textTertiary, marginLeft: 2 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timelineTrack: { flex: 1, height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  timelineFill: { height: 3, borderRadius: 2 },
  hitDots: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  hitDot: { width: 6, height: 6, borderRadius: 3 },
  hitDotMore: { fontSize: 8, fontWeight: '800' },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 8, gap: 6,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  bottomRowNoDivider: { marginTop: 6, paddingTop: 0, borderTopWidth: 0 },
  verifiedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  verifiedIcon: { fontSize: 10, color: colors.cyan, fontWeight: '900' },
  verifiedText: { flex: 1, fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  verifiedNum: { color: colors.textSecondary, fontWeight: '800', fontFamily: theme.typography.fontFamily.monoBold },
  lastSeenText: { fontSize: 10, color: colors.textTertiary, flex: 1 },
  shareBtn: {
    backgroundColor: colors.bgElevated, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.borderMed,
  },
  shareBtnText: { fontSize: 10, color: colors.textSecondary, fontWeight: '700' },
  explainBtn: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: colors.cyan + '44',
    backgroundColor: colors.cyan + '0F',
  },
  explainBtnText: { fontSize: 10, color: colors.cyan, fontWeight: '700' },
  lockedCard: { minHeight: 64, paddingVertical: 8, marginBottom: 6, overflow: 'hidden' },
  lockOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgElevated + 'EE',
    borderRadius: theme.borderRadius.card, gap: 8, paddingHorizontal: 14,
  },
  lockTitle: { fontSize: 12, fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.3, flex: 1 },
  lockBadge: {
    backgroundColor: colors.goldLight, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 99, borderWidth: 1, borderColor: colors.gold + '40',
  },
  lockBadgeText: { fontSize: 9, fontWeight: '800', color: colors.gold, letterSpacing: 0.5 },
});
