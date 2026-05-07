import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { theme } from '@/constants/theme';
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
  if (energy >= 85) return '🔥 BLAZING HOT — High-confidence pick';
  if (energy >= 70) return '✦ HOT SIGNAL — Strong box play';
  if (energy >= 50) return '◈ WARM — Moderate signal, box only';
  if (drawsSince != null && drawsSince > 200) return '⚠️ OVERDUE — Pressure building, speculative play';
  return '❄ COLD — Low signal, not recommended';
}

function verdictColor(energy: number | null): string {
  if (energy == null) return theme.colors.textTertiary;
  if (energy >= 85) return theme.colors.error;
  if (energy >= 70) return theme.colors.orange;
  if (energy >= 50) return theme.colors.gold;
  return theme.colors.textTertiary;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Pre-fill combo from context (e.g. tapping a pick card) */
  initialCombo?: string;
  scope?: string;
}

export function HeatCheckModal({ visible, onClose, initialCombo = '', scope = 'midday' }: Props) {
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

  const handleClose = useCallback(() => {
    setCombo(initialCombo);
    setResult(null);
    setError(null);
    setRateLimited(false);
    onClose();
  }, [initialCombo, onClose]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.title}>🔍 Heat Check</Text>
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
                placeholderTextColor={theme.colors.textTertiary}
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
                <Text style={s.rateLimitSub}>Upgrade to Oracle to run unlimited Heat Checks.</Text>
              </View>
            )}

            {result && !rateLimited && (
              <View style={s.resultCard}>
                {/* Header row: digits + comboSet + energy pill */}
                <View style={s.resultHeader}>
                  <View>
                    <Text style={s.resultCombo}>{result.combo}</Text>
                    <Text style={s.resultComboSet}>{result.comboSet}</Text>
                    <Text style={[s.resultComboSet, { color: theme.colors.textTertiary + 'AA' }]}>key: {result.sortedKey}</Text>
                  </View>
                  {result.energy != null && (
                    <View style={[s.energyPill, { borderColor: verdictColor(result.energy) + '55', backgroundColor: verdictColor(result.energy) + '12' }]}>
                      <Text style={[s.energyPillNum, { color: verdictColor(result.energy) }]}>{result.energy}</Text>
                      <Text style={[s.energyPillLbl, { color: verdictColor(result.energy) }]}>energy</Text>
                    </View>
                  )}
                </View>

                <Text style={[s.verdict, { color: verdictColor(result.energy) }]}>{result.verdict}</Text>

                {/* Stats grid */}
                <View style={s.statsRow}>
                  {result.drawsSince != null && (
                    <View style={s.stat}>
                      <Text style={s.statNum}>{result.drawsSince}</Text>
                      <Text style={s.statLbl}>{result.drawsSince === 0 ? 'hit today' : result.drawsSince === 1 ? 'hit yesterday' : result.drawsSince <= 7 ? 'draws ago\n(this week)' : result.drawsSince >= 500 ? 'no recent\ndata' : 'draws ago'}</Text>
                    </View>
                  )}
                  {result.timesDrawn != null && result.timesDrawn > 0 && (
                    <View style={s.stat}>
                      <Text style={s.statNum}>{result.timesDrawn}×</Text>
                      <Text style={s.statLbl}>all-time{'\n'}hits</Text>
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
                  <View style={{ marginTop: 8, backgroundColor: theme.colors.background, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>BOX SIGNAL (allday · H01Y)</Text>
                    {result.signalBox != null ? (
                      <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: 10, color: theme.colors.textSecondary }}>BOX</Text>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.text, fontFamily: 'Courier' }}>{(result.signalBox * 100).toFixed(1)}%</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3 }}>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.primary, width: `${Math.min(100, result.signalBox * 100).toFixed(1)}%` as any }} />
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                          ds_raw: <Text style={{ fontWeight: '800', color: theme.colors.text, fontFamily: 'Courier' }}>{result.dsRaw}</Text>
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                          scope: <Text style={{ fontWeight: '700', color: theme.colors.text }}>allday</Text>
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Pair signals */}
                {(result.signalPburst != null || result.signalCo != null || result.pairRows.length > 0) && (
                  <View style={{ marginTop: 8, backgroundColor: theme.colors.background, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>PAIR SIGNALS</Text>
                    {(result.signalPburst != null || result.signalCo != null) ? (
                      <View style={{ gap: 6 }}>
                        {result.signalPburst != null && (
                          <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={{ fontSize: 10, color: theme.colors.textSecondary }}>PBURST</Text>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.text, fontFamily: 'Courier' }}>{(result.signalPburst * 100).toFixed(1)}%</Text>
                            </View>
                            <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3 }}>
                              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.gold, width: `${Math.min(100, result.signalPburst * 100).toFixed(1)}%` as any }} />
                            </View>
                          </View>
                        )}
                        {result.signalCo != null && (
                          <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={{ fontSize: 10, color: theme.colors.textSecondary }}>CO</Text>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.text, fontFamily: 'Courier' }}>{(result.signalCo * 100).toFixed(1)}%</Text>
                            </View>
                            <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3 }}>
                              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.orange, width: `${Math.min(100, result.signalCo * 100).toFixed(1)}%` as any }} />
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      result.pairRows.slice(0, 6).map((pr: any, i: number) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Courier', color: theme.colors.text, fontWeight: '700', width: 28 }}>{pr.key}</Text>
                          <Text style={{ fontSize: 10, color: theme.colors.textSecondary }}>class {pr.class_id}</Text>
                          <Text style={{ fontSize: 10, color: theme.colors.textSecondary }}>ds_raw: <Text style={{ fontWeight: '700', color: theme.colors.text }}>{pr.ds_raw}</Text></Text>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* Consistency signal */}
                {result.signalDgc != null && (
                  <View style={{ marginTop: 8, backgroundColor: theme.colors.background, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>CONSISTENCY SIGNAL</Text>
                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Text style={{ fontSize: 10, color: theme.colors.textSecondary }}>DGC</Text>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.text, fontFamily: 'Courier' }}>{((result.signalDgc ?? 0) * 100).toFixed(1)}%</Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3 }}>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.gold, width: `${Math.min(100, (result.signalDgc ?? 0) * 100).toFixed(1)}%` as any }} />
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}
            <View style={{ height: 20 }} />
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 4 },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 12 },
  tierBadge: {
    backgroundColor: theme.colors.goldLight, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12,
    borderWidth: 1, borderColor: theme.colors.gold + '44',
  },
  tierText: { fontSize: 11, color: theme.colors.gold, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  input: {
    flex: 1, height: 48, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: 10, paddingHorizontal: 14,
    fontSize: 22, fontWeight: '900', color: theme.colors.text,
    fontFamily: 'Courier', letterSpacing: 6,
    backgroundColor: theme.colors.background, textAlign: 'center',
  },
  checkBtn: {
    paddingHorizontal: 20, height: 48, borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBtnDisabled: { opacity: 0.45 },
  checkBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  errorText: { fontSize: 12, color: theme.colors.error, marginBottom: 8 },
  rateLimitBox: {
    backgroundColor: theme.colors.error + '12', borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.error + '44',
    padding: 14, marginBottom: 8,
  },
  rateLimitTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.error, marginBottom: 4 },
  rateLimitSub: { fontSize: 12, color: theme.colors.textSecondary },
  resultCard: {
    backgroundColor: theme.colors.surfaceLight, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border, padding: 14,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  resultCombo: {
    fontSize: 36, fontWeight: '900', color: theme.colors.text,
    fontFamily: 'Courier', letterSpacing: 6,
  },
  resultComboSet: { flex: 1, fontSize: 10, color: theme.colors.textTertiary, fontFamily: 'Courier' },
  energyPill: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1.5,
  },
  energyPillNum: { fontSize: 18, fontWeight: '900', fontFamily: 'Courier' },
  energyPillLbl: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  verdict: { fontSize: 13, fontWeight: '700', marginBottom: 10, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 0 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  statNum: { fontSize: 14, fontWeight: '900', color: theme.colors.text, fontFamily: 'Courier' },
  statLbl: { fontSize: 9, color: theme.colors.textTertiary, fontWeight: '600', marginTop: 1 },
  noDataText: { fontSize: 11, color: theme.colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
});
