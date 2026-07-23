import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Animated, PanResponder, Dimensions, ScrollView, Keyboard,
} from 'react-native';
import { shareTextSafe } from '@/lib/shareText';
import { alertAsync } from '@/lib/confirm';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { storage } from '@/lib/storage';
import { useAuth } from '@/hooks/useAuth';
import { isPremium, getTodayET } from '@/lib/dateUtils';

const HEAT_CHECK_KEY = 'heatcheck_last_date';
const FREE_LIMIT = 1;

// DB key = sorted digits string: "223", "247", "388"
function toSortedKey(combo: string): string {
  return combo.split('').sort().join('');
}

// Display format: "{2,2,3}"
function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}

interface HeatCheckResult {
  combo: string;
  sortedKey: string;
  comboSet: string;
  energy: number | null;
  drawsSince: number | null;
  timesDrawn: number | null;
  dsRaw: number | null;
  lastSeen: string | null;
  pairRows: any[];
  signalBox: number | null;
  signalPburst: number | null;
  signalCo: number | null;
  signalDgc: number | null;
  diEnergyScore: number | null;
  verdict: string;
}

function verdictText(energy: number | null, drawsSince: number | null): string {
  if (energy == null) return 'No signal data found for this combo';
  if (energy >= 85) return '🔥 BLAZING SIGNAL — High-confidence signal';
  if (energy >= 70) return '✦ STRONG SIGNAL — Box arrangement recommended';
  if (energy >= 50) return '◈ MODERATE — Box arrangement only';
  if (drawsSince != null && drawsSince > 200) return '⚠️ OVERDUE — Pressure building, conservative arrangement';
  return '❄ LOW — Weak signal, not recommended';
}

function verdictColor(energy: number | null, colors: ColorTokens): string {
  if (energy == null) return colors.textTertiary;
  if (energy >= 85) return colors.error;
  if (energy >= 70) return colors.orange;
  if (energy >= 50) return colors.gold;
  return colors.textTertiary;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Pre-fill combo from context (e.g. tapping a pick card) */
  initialCombo?: string;
  scope?: string;
}

export function HeatCheckModal({ visible, onClose, initialCombo = '', scope = 'midday' }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const { user } = useAuth();
  const userRole = (user as any)?.role ?? (user as any)?.tier ?? '';
  const isPro = isPremium(userRole) || user?.role === 'premium' || user?.role === 'admin';

  const [combo, setCombo] = useState(initialCombo);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HeatCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const checkRateLimit = useCallback(async (): Promise<boolean> => {
    if (isPro) return false;
    const today = getTodayET();
    const last = await storage.getItem(HEAT_CHECK_KEY);
    if (last === today) return true;
    return false;
  }, [isPro]);

  const handleCheck = useCallback(async () => {
    // Dismiss the keyboard so the result content isn't hidden behind it.
    Keyboard.dismiss();
    const cleaned = combo.trim().replace(/\D/g, '').slice(0, 3);
    if (cleaned.length !== 3) {
      setError('Enter a valid 3-digit combo');
      return;
    }

    const limited = await checkRateLimit();
    if (limited) {
      setRateLimited(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setRateLimited(false);

    try {
      const sortedKey = toSortedKey(cleaned);
      const comboSet = toComboSet(cleaned);
      const digits = cleaned.split('');

      const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const headers = {
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json',
      };

      // Box data — key is sorted digits string, scope allday, H01Y
      const boxUrl = supabaseUrl + '/rest/v1/datasets_box' +
        '?key=eq.' + sortedKey +
        '&class_id=eq.1' +
        '&scope=eq.allday' +
        '&horizon_label=eq.H01Y' +
        '&deleted_at=is.null' +
        '&select=key,ds_raw,times_drawn,draws_since,last_seen';

      const boxRes = await fetch(boxUrl, { headers });
      const boxRows = await boxRes.json();

      const box = Array.isArray(boxRows) && boxRows.length > 0 ? boxRows[0] : null;

      if (!box) {
        setError(`No data found for combo ${cleaned} (key="${sortedKey}") in allday/H01Y. Check that box history is imported.`);
        setLoading(false);
        return;
      }

      // Pair data for the 3 pairs
      const p01 = [digits[0], digits[1]].sort().join('');
      const p12 = [digits[1], digits[2]].sort().join('');
      const p02 = [digits[0], digits[2]].sort().join('');
      const pairKeys = [...new Set([p01, p12, p02])];

      const pairUrl = supabaseUrl + '/rest/v1/datasets_pair' +
        '?key=in.(' + pairKeys.join(',') + ')' +
        '&scope=eq.allday' +
        '&horizon_label=eq.H01Y' +
        '&deleted_at=is.null' +
        '&select=key,class_id,ds_raw,times_drawn';

      let pairRows: any[] = [];
      try {
        const pairRes = await fetch(pairUrl, { headers });
        pairRows = await pairRes.json();
        if (!Array.isArray(pairRows)) pairRows = [];
      } catch { /* non-fatal */ }

      // Daily intelligence row — today's precomputed signals for this combo
      const today = getTodayET();
      const diUrl2 = supabaseUrl + '/rest/v1/daily_intelligence' +
        '?combo_set=eq.' + encodeURIComponent(comboSet) +
        '&slate_date=eq.' + today +
        '&select=signal_box,signal_pburst,signal_co,signal_dgc,energy_score' +
        '&limit=1';
      let diRow: any = null;
      try {
        const diRes = await fetch(diUrl2, { headers });
        const diRows = await diRes.json();
        if (Array.isArray(diRows) && diRows.length > 0) diRow = diRows[0];
      } catch { /* non-fatal */ }

      // Energy: ds_raw is the blended score (higher = more overdue = higher pressure)
      // Normalize against 500 as approximate max for a 1-year horizon
      const dsRaw = typeof box.ds_raw === 'number' ? box.ds_raw : 0;
      const energy = diRow?.energy_score != null
        ? Math.min(100, Math.round(diRow.energy_score))
        : Math.min(100, Math.round((dsRaw / 500) * 100));

      const res: HeatCheckResult = {
        combo: cleaned,
        sortedKey,
        comboSet,
        energy,
        drawsSince: box.draws_since ?? null,
        timesDrawn: box.times_drawn ?? null,
        dsRaw,
        lastSeen: box.last_seen ?? null,
        pairRows,
        signalBox: diRow?.signal_box ?? null,
        signalPburst: diRow?.signal_pburst ?? null,
        signalCo: diRow?.signal_co ?? null,
        signalDgc: diRow?.signal_dgc ?? null,
        diEnergyScore: diRow?.energy_score ?? null,
        verdict: verdictText(energy, box.draws_since ?? null),
      };
      setResult(res);

      if (!isPro) {
        await storage.setItem(HEAT_CHECK_KEY, getTodayET());
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [combo, scope, isPro, checkRateLimit]);

  // Swipe-down-to-dismiss + tap-outside-to-close. Native Modal with
  // animationType="slide" doesn't include pan gesture; we add it ourselves
  // with PanResponder so the sheet feels like an iOS bottom sheet.
  const translateY = useRef(new Animated.Value(0)).current;
  const screenH = Dimensions.get('window').height;

  const animateClose = useCallback(() => {
    Animated.timing(translateY, {
      toValue: screenH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      setCombo(initialCombo);
      setResult(null);
      setError(null);
      setRateLimited(false);
      onClose();
    });
  }, [translateY, screenH, initialCombo, onClose]);

  const handleClose = useCallback(() => {
    animateClose();
  }, [animateClose]);

  // Reset slide position whenever the modal becomes visible (in case the
  // previous close left translateY mid-animation).
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
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  // §5.3 — share a brandable text summary of the heat check. Native PNG
  // screenshot deferred (requires react-native-view-shot, a native module
  // that pairs naturally with the §1.4 phase 2 EAS build cycle). Text
  // share works on every platform today and is what users actually paste
  // into iMessage / WhatsApp / Discord without an image preview hiccup.
  const handleShare = useCallback(async () => {
    if (!result) return;
    const pct = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(1)}%`;
    const lines: string[] = [];
    lines.push(`🔍 Signal Check: ${result.combo}`);
    lines.push(`${result.comboSet} · key ${result.sortedKey}`);
    lines.push('');
    if (result.energy != null) lines.push(`ENERGY ${result.energy}/100`);
    lines.push(result.verdict);
    lines.push('');
    if (result.signalBox != null) lines.push(`BOX    ${pct(result.signalBox)}`);
    if (result.signalPburst != null) lines.push(`PBURST ${pct(result.signalPburst)}`);
    if (result.signalCo != null) lines.push(`CO     ${pct(result.signalCo)}`);
    if (result.signalDgc != null) lines.push(`DGC    ${pct(result.signalDgc)}`);
    if (result.signalBox != null || result.signalPburst != null || result.signalCo != null || result.signalDgc != null) {
      lines.push('');
    }
    if (result.drawsSince != null) lines.push(`draws since:  ${result.drawsSince}`);
    if (result.timesDrawn != null && result.timesDrawn > 0) {
      lines.push(`all-time:     ${result.timesDrawn}× matches`);
      lines.push(`expected:     ~every ${Math.round(365 / result.timesDrawn)} draws`);
    }
    if (result.lastSeen) lines.push(`last seen:    ${result.lastSeen}`);
    lines.push('');
    lines.push('Powered by HitMaster ZK6™ Intelligence');
    lines.push('Run your own signal check → https://hitmaster.app');
    const message = lines.join('\n');
    const r = await shareTextSafe(message, `Signal Check: ${result.combo}`);
    if (r === 'copied') alertAsync('Copied to clipboard', 'Sharing is unavailable here — the text is on your clipboard.');
  }, [result]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Animated.View
            style={[s.sheet, { transform: [{ translateY }] }]}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => {}}
          >
            {/* Top bar: drag handle (whole bar pannable) + explicit X close on the
                right. Flex layout so X is always visible. Pan on the whole bar
                gives users a fatter drag target; TouchableOpacity child still
                claims its own touches via the responder system. */}
            <View style={s.topBar} {...panResponder.panHandlers}>
              <View style={s.topBarSpacer} />
              <View style={s.handleHitArea}>
                <View style={s.handle} />
              </View>
              <TouchableOpacity
                onPress={handleClose}
                style={s.closeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close signal check"
                activeOpacity={0.7}
              >
                <View style={s.closeBtnInner}>
                  <Text style={s.closeX}>✕</Text>
                </View>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={s.sheetScroll}
              contentContainerStyle={s.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Tap-eater: absorbs any tap inside the sheet so it doesn't
                  bubble up to the backdrop TouchableOpacity (which closes). */}
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <Text style={s.title}>🔍 Signal Check</Text>
              <Text style={s.sub}>Look up the ZK6 signal for any 3-digit combo</Text>

            {!isPro && (
              <View style={s.tierBadge}>
                <Text style={s.tierText}>FREE · {FREE_LIMIT} check/day — Upgrade for unlimited</Text>
              </View>
            )}

            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={combo}
                onChangeText={v => setCombo(v.replace(/\D/g, '').slice(0, 3))}
                placeholder="e.g. 472"
                keyboardType="numeric"
                maxLength={3}
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
              <TouchableOpacity
                style={[s.checkBtn, (loading || combo.trim().length !== 3) && s.checkBtnDisabled]}
                onPress={handleCheck}
                disabled={loading || combo.trim().length !== 3}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.checkBtnText}>Check</Text>
                )}
              </TouchableOpacity>
            </View>

            {error && <Text style={s.errorText}>{error}</Text>}

            {rateLimited && (
              <View style={s.rateLimitBox}>
                <Text style={s.rateLimitTitle}>Daily limit reached</Text>
                <Text style={s.rateLimitSub}>Upgrade to Oracle to run unlimited Signal Checks.</Text>
              </View>
            )}

            {result && !rateLimited && (
              <View style={s.resultCard}>
                {/* Header row: digits + comboSet + energy pill */}
                <View style={s.resultHeader}>
                  <View>
                    <Text style={s.resultCombo}>{result.combo}</Text>
                    <Text style={s.resultComboSet}>{result.comboSet}</Text>
                    <Text style={[s.resultComboSet, { color: colors.textTertiary + 'AA' }]}>key: {result.sortedKey}</Text>
                  </View>
                  {result.energy != null && (
                    <View style={[s.energyPill, { borderColor: verdictColor(result.energy, colors) + '55', backgroundColor: verdictColor(result.energy, colors) + '12' }]}>
                      <Text style={[s.energyPillNum, { color: verdictColor(result.energy, colors) }]}>{result.energy}</Text>
                      <Text style={[s.energyPillLbl, { color: verdictColor(result.energy, colors) }]}>energy</Text>
                    </View>
                  )}
                </View>

                <Text style={[s.verdict, { color: verdictColor(result.energy, colors) }]}>{result.verdict}</Text>

                {/* Stats grid */}
                <View style={s.statsRow}>
                  {result.drawsSince != null && (
                    <View style={s.stat}>
                      <Text style={s.statNum}>{result.drawsSince}</Text>
                      <Text style={s.statLbl}>{result.drawsSince === 0 ? 'matched today' : result.drawsSince === 1 ? 'matched yesterday' : result.drawsSince <= 7 ? 'draws ago\n(this week)' : result.drawsSince >= 500 ? 'no recent\ndata' : 'draws ago'}</Text>
                    </View>
                  )}
                  {result.timesDrawn != null && result.timesDrawn > 0 && (
                    <View style={s.stat}>
                      <Text style={s.statNum}>{result.timesDrawn}×</Text>
                      <Text style={s.statLbl}>all-time{'\n'}matches</Text>
                    </View>
                  )}
                  {result.timesDrawn != null && result.timesDrawn > 0 && (
                    <View style={s.stat}>
                      <Text style={s.statNum}>~{Math.round(365 / result.timesDrawn)}</Text>
                      <Text style={s.statLbl}>expected{'\n'}every N draws</Text>
                    </View>
                  )}
                  {result.lastSeen && (
                    <View style={s.stat}>
                      <Text style={s.statNum} numberOfLines={1}>{result.lastSeen.slice(5)}</Text>
                      <Text style={s.statLbl}>last seen</Text>
                    </View>
                  )}
                </View>

                {/* BOX SIGNAL */}
                {(result.signalBox != null || result.dsRaw != null) && (
                  <View style={{ marginTop: 8, backgroundColor: colors.background, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>BOX SIGNAL (allday · H01Y)</Text>
                    {result.signalBox != null ? (
                      <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: 10, color: colors.textSecondary }}>BOX</Text>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold }}>{(result.signalBox * 100).toFixed(1)}%</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: `${Math.min(100, result.signalBox * 100).toFixed(1)}%` as any }} />
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          ds_raw: <Text style={{ fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold }}>{result.dsRaw}</Text>
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          scope: <Text style={{ fontWeight: '700', color: colors.text }}>allday</Text>
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Pair signals */}
                {(result.signalPburst != null || result.signalCo != null || result.pairRows.length > 0) && (
                  <View style={{ marginTop: 8, backgroundColor: colors.background, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>PAIR SIGNALS</Text>
                    {(result.signalPburst != null || result.signalCo != null) ? (
                      <View style={{ gap: 6 }}>
                        {result.signalPburst != null && (
                          <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={{ fontSize: 10, color: colors.textSecondary }}>PBURST</Text>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold }}>{(result.signalPburst * 100).toFixed(1)}%</Text>
                            </View>
                            <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.gold, width: `${Math.min(100, result.signalPburst * 100).toFixed(1)}%` as any }} />
                            </View>
                          </View>
                        )}
                        {result.signalCo != null && (
                          <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={{ fontSize: 10, color: colors.textSecondary }}>CO</Text>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold }}>{(result.signalCo * 100).toFixed(1)}%</Text>
                            </View>
                            <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.orange, width: `${Math.min(100, result.signalCo * 100).toFixed(1)}%` as any }} />
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      result.pairRows.slice(0, 6).map((pr: any, i: number) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, fontFamily: theme.typography.fontFamily.monoBold, color: colors.text, fontWeight: '700', width: 28 }}>{pr.key}</Text>
                          <Text style={{ fontSize: 10, color: colors.textSecondary }}>class {pr.class_id}</Text>
                          <Text style={{ fontSize: 10, color: colors.textSecondary }}>ds_raw: <Text style={{ fontWeight: '700', color: colors.text }}>{pr.ds_raw}</Text></Text>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* Consistency signal */}
                {result.signalDgc != null && (
                  <View style={{ marginTop: 8, backgroundColor: colors.background, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>CONSISTENCY SIGNAL</Text>
                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>DGC</Text>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold }}>{((result.signalDgc ?? 0) * 100).toFixed(1)}%</Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.gold, width: `${Math.min(100, (result.signalDgc ?? 0) * 100).toFixed(1)}%` as any }} />
                      </View>
                    </View>
                  </View>
                )}

                {/* §5.3 — share analysis */}
                <TouchableOpacity
                  style={s.shareBtn}
                  onPress={handleShare}
                  accessibilityRole="button"
                  accessibilityLabel={`Share signal check analysis for combo ${result.combo}`}
                  activeOpacity={0.85}
                >
                  <Text style={s.shareBtnText}>📤 Share this analysis</Text>
                </TouchableOpacity>
              </View>
            )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: colors.border,
    maxHeight: '88%',
  },
  sheetScroll: { flexGrow: 0 },
  sheetScrollContent: { paddingBottom: 8 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, height: 44,
  },
  topBarSpacer: { width: 44, height: 44 },
  handleHitArea: {
    flex: 1, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  handle: {
    width: 56, height: 5, borderRadius: 2.5,
    backgroundColor: colors.textTertiary + 'AA',
  },
  closeBtn: { padding: 0 },
  closeBtnInner: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeX: { fontSize: 16, color: colors.text, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 4 },
  sub: { fontSize: 12, color: colors.textSecondary, marginBottom: 12 },
  tierBadge: {
    backgroundColor: colors.goldLight, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12,
    borderWidth: 1, borderColor: colors.gold + '44',
  },
  tierText: { fontSize: 11, color: colors.gold, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  input: {
    flex: 1, height: 48, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14,
    fontSize: 22, color: colors.text,
    fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 6,
    backgroundColor: colors.background, textAlign: 'center',
  },
  checkBtn: {
    paddingHorizontal: 20, height: 48, borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBtnDisabled: { opacity: 0.45 },
  checkBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  errorText: { fontSize: 12, color: colors.error, marginBottom: 8 },
  rateLimitBox: {
    backgroundColor: colors.error + '12', borderRadius: 10,
    borderWidth: 1, borderColor: colors.error + '44',
    padding: 14, marginBottom: 8,
  },
  rateLimitTitle: { fontSize: 13, fontWeight: '800', color: colors.error, marginBottom: 4 },
  rateLimitSub: { fontSize: 12, color: colors.textSecondary },
  resultCard: {
    backgroundColor: colors.surfaceLight, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  resultCombo: {
    fontSize: 36, color: colors.text,
    fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 6,
  },
  resultComboSet: { flex: 1, fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  energyPill: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1.5,
  },
  energyPillNum: { fontSize: 18, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  energyPillLbl: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  verdict: { fontSize: 13, fontWeight: '700', marginBottom: 10, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 0 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  statNum: { fontSize: 14, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold },
  statLbl: { fontSize: 9, color: colors.textTertiary, fontWeight: '600', marginTop: 1 },
  noDataText: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
  shareBtn: {
    marginTop: 12, paddingVertical: 11,
    backgroundColor: colors.primary, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
});
