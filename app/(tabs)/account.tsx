import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useToast } from '@/components/Toast';
import { LastHitPill } from '@/components/LastHitPill';
import { useFollowedStates, JURISDICTION_GROUPS } from '@/hooks/useFollowedStates';
import { useCoffeeMode } from '@/hooks/useCoffeeMode';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useTheme, type ThemeMode, type ColorTokens, type ShadowTokens } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types/core';
import { fetchFromSupabase, countFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { useSavedHits } from '@/hooks/useSavedHits';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useZK30ViewMode } from '@/lib/zk30/viewMode';
import type { ViewMode as ZK30ViewMode } from '@/lib/zk30/labelMaps';

const GLOSSARY = [
  { term: 'ZK6™ Engine', def: 'HitMaster\'s proprietary intelligence engine — a multi-dimensional pattern recognition system trained on years of public draw data. Signals are ranked by Oracle Score (signal convergence strength), not guarantees.' },
  { term: 'Energy Score', def: 'A 0–100 composite signal strength. BLAZING (80+) · STRONG (65+) · MODERATE (45+) · LOW (<45). Higher = stronger convergence across all three signals.' },
  { term: 'K6 Slate', def: 'Your 6 daily signals — the top combos emerging from ZK6\'s full intelligence pass. Oracle+ sees all 6. Free sees signals 5–6.' },
  { term: 'Frequency Signal', def: 'Historical draw pressure — how strongly a number set is signaling based on long-term draw history.' },
  { term: 'Momentum Signal', def: 'Pair energy and burst patterns — which digit pairs are building directional pressure right now.' },
  { term: 'Pattern Signal', def: 'Digit co-occurrence and relationship activity across our full historical database.' },
  { term: 'Scope', def: 'Draw session: Midday (☀️), Evening (🌙), or All Day (◈). ZK6 runs separate analyses per scope.' },
  { term: 'Optimal Straight', def: 'The recommended exact-order arrangement for a box number — the ordering with the strongest directional signal alignment.' },
  { term: 'Box vs Straight', def: 'Box: match 3 digits in ANY order (secondary tier). Straight: exact order (primary tier). ZK6 focuses on box signals, then surfaces the best straight arrangement.' },
];

const PRO_FEATURES = [
  'All 6 K6 Slate signals',
  'Optimal straight per signal',
  'Unlimited Signal Checks',
  'Full pattern depth analytics',
  'Budget Planner tool',
  'Match history & stats',
];

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  const { colors } = useTheme();
  const tog = useMemo(() => makeTog(colors), [colors]);
  return (
    <View style={tog.row}>
      <View style={{ flex: 1 }}>
        <Text style={tog.label}>{label}</Text>
        {sub && <Text style={tog.sub}>{sub}</Text>}
      </View>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.purple }}
        thumbColor="#fff"
      />
    </View>
  );
}

// Phase C1 — ZK30 view-mode segmented control. Renders ONLY for admin users.
// Non-admins are pinned to subscriber by the context; surfacing a disabled
// row for them adds noise without function.
function ZK30ViewModeRow() {
  const { colors } = useTheme();
  const tog = useMemo(() => makeTog(colors), [colors]);
  const { mode, setMode, canToggleOperator } = useZK30ViewMode();

  if (!canToggleOperator) return null;
  return (
    <View style={{ paddingVertical: 12 }}>
      <View style={{ marginBottom: 8 }}>
        <Text style={tog.label}>ZK30 view mode</Text>
        <Text style={tog.sub}>
          {mode === 'subscriber'
            ? 'Subscriber-friendly labels (FREQUENCY / PAIR HEAT / etc).'
            : 'Engine-internal labels (BOX / PBURST / CO / DGC).'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['subscriber', 'operator'] as ZK30ViewMode[]).map(m => {
          const active = mode === m;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8,
                borderWidth: 1,
                borderColor: active ? colors.purple : colors.border,
                backgroundColor: active ? colors.primaryLight : colors.bgElevated,
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color: active ? colors.purple : colors.textSecondary,
                textTransform: 'capitalize',
              }}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const makeTog = (colors: ColorTokens) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  sub: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
});

export default function AccountScreen() {
  const { user, setRole, purchaseSubscription, restorePurchases, signOut } = useAuth();
  const { showToast } = useToast();
  const { followed: followedStates, isFollowing, toggle: toggleFollowedState, clear: clearFollowedStates } = useFollowedStates();
  const { enabled: coffeeMode, toggle: toggleCoffeeMode } = useCoffeeMode();
  const { mode: themeMode, scheme: themeScheme, setMode: setThemeMode, colors, shadows, gradients } = useTheme();
  const s = useMemo(() => makeS(colors, shadows), [colors, shadows]);
  const tog = useMemo(() => makeTog(colors), [colors]);
  const [glossOpen, setGlossOpen] = useState<number | null>(null);
  // Notification preferences (enhancements §1.4 — persistence only).
  // Delivery (local schedules + push-on-hit) ships in next iteration; for now
  // we persist the user's choices so their setup carries across app restarts.
  const NOTIF_PREFS_KEY = 'notif_prefs_v1';
  const [notifPrefs, setNotifPrefs] = useState({ nextDraw: true, slateReady: true, hits: true, promo: false });

  useEffect(() => {
    (async () => {
      const stored = await storage.getItem(NOTIF_PREFS_KEY);
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored);
        setNotifPrefs(p => ({ ...p, ...parsed }));
      } catch {}
    })();
  }, []);

  // §1.4 phase 2 — push registration. Lazy: only kicks in when the user
  // flips a toggle ON, so we don't pop a permission dialog on first launch.
  const push = usePushNotifications(notifPrefs);

  const handleNotifChange = async (key: keyof typeof notifPrefs, value: boolean) => {
    const next = { ...notifPrefs, [key]: value };
    setNotifPrefs(next);
    storage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));
    const labels: Record<keyof typeof notifPrefs, string> = {
      nextDraw: 'Next Draw Alert',
      slateReady: 'Slate Ready',
      hits: 'Slate Match Alert',
      promo: 'Promotions',
    };
    // Lazy-register on first ON toggle (asks permission then). On every
    // toggle, push the updated prefs to the server row.
    if (value && !push.token && push.status !== 'unsupported') {
      const t = await push.register();
      if (t) await push.syncPrefs(next);
    } else if (push.token) {
      await push.syncPrefs(next);
    }
    showToast(`${value ? 'Enabled' : 'Disabled'}: ${labels[key]}`, 'info');
  };
  const [memberDays, setMemberDays] = useState(0);

  // §4.3 — load saved combos from Number Book storage to feed personal hit
  // history aggregate. Re-reads on screen focus so newly saved picks roll in.
  const [savedCombos, setSavedCombos] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const out: string[] = [];
      try {
        const raw = await storage.getItem('number_book_lists');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const l of parsed) {
              if (Array.isArray(l?.combos)) {
                for (const c of l.combos) if (typeof c?.combo === 'string') out.push(c.combo);
              }
            }
          }
        }
      } catch {}
      setSavedCombos(out);
    })();
  }, []);
  const personalHits = useSavedHits(savedCombos);

  // Triple-tap on avatar → promote to admin (Mystic tier) AND navigate.
  // Without the setRole call, the user lands on the admin screen visually
  // but useDataIngestion::isAdmin (role==='admin') still blocks all the
  // import flows. Promotion is the canonical Mystic unlock per BUG-02.
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 600);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      setRole('admin').then(() => router.push('/(tabs)/admin')).catch(() => {});
    }
  }, [setRole]);

  useEffect(() => {
    (async () => {
      const firstOpen = await storage.getItem('first_open_date');
      if (firstOpen) {
        const diff = Math.max(1, Math.round((Date.now() - new Date(firstOpen).getTime()) / 86400000));
        setMemberDays(diff);
      } else {
        setMemberDays(1);
      }
    })();
  }, []);

  const { data: historiesStats } = useQuery({
    queryKey: ['account_histories_stats'],
    queryFn: async () => {
      const [totalDraws, stateRows] = await Promise.all([
        countFromSupabase('/rest/v1/histories?jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)'),
        fetchFromSupabase<{ jurisdiction: string }[]>({
          path: '/rest/v1/histories?select=jurisdiction&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)&limit=500',
        }),
      ]);
      return {
        totalDraws,
        activeStates: new Set((Array.isArray(stateRows) ? stateRows : []).map(r => r.jurisdiction)).size,
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  const tier = user?.role === 'admin' ? 'PLUS' : user?.role === 'premium' ? 'PRO' : 'FREE';
  const isFree = tier === 'FREE';
  const tierLabel = isFree ? 'Seeker' : tier === 'PRO' ? 'Oracle+' : 'Mystic';
  const tierColor = isFree ? colors.free : tier === 'PRO' ? colors.premium : colors.admin;

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <LinearGradient
          colors={gradients.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <TouchableOpacity style={s.avatar} onPress={handleLogoTap} activeOpacity={0.85}>
            <Text style={{ fontSize: 30 }}>🏆</Text>
          </TouchableOpacity>
          <Text style={s.heroTitle}>Your Profile</Text>
          <Text style={s.heroSub}>{user?.id ? `ID: ${user.id.slice(0, 8).toUpperCase()}` : 'Guest'}</Text>
          <View style={s.heroPills}>
            <View style={[s.pill, { backgroundColor: tierColor + '20', borderColor: tierColor + '44' }]}>
              <Text style={[s.pillText, { color: tierColor }]}>♛ {tierLabel}</Text>
            </View>
            <View style={[s.pill, { backgroundColor: colors.bgElevated, borderColor: colors.borderMed }]}>
              <Text style={[s.pillText, { color: colors.textTertiary }]}>
                {memberDays > 0 ? `${memberDays}d member` : 'New member'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Stats ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ACTIVITY</Text>
          <View style={s.statsGrid}>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: colors.cyan }]}>
                {historiesStats?.totalDraws ? historiesStats.totalDraws.toLocaleString() : '—'}
              </Text>
              <Text style={s.statLabel}>Draws Tracked</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: colors.amber }]}>
                {historiesStats?.activeStates ?? '—'}
              </Text>
              <Text style={s.statLabel}>States Active</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: colors.gold }]}>{memberDays}</Text>
              <Text style={s.statLabel}>Days Active</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: colors.rose }]}>ZK6™</Text>
              <Text style={s.statLabel}>Engine</Text>
            </View>
          </View>
        </View>

        {/* ── Plan ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>YOUR PLAN</Text>
          {isFree ? (
            <View style={s.planFreeCard}>
              <View style={s.planFreeTop}>
                <View>
                  <Text style={s.planFreeTitle}>Seeker · Free</Text>
                  <Text style={s.planFreeSub}>2 signals preview per draw</Text>
                </View>
                <Text style={{ fontSize: 28 }}>🏆</Text>
              </View>
              <View style={s.divider} />
              {/* FREE vs PRO comparison */}
              <View style={s.compareGrid}>
                <View style={[s.compareRow, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                  <Text style={[s.compareFeature, { fontSize: 9, color: colors.textTertiary, letterSpacing: 1.2 }]}>FEATURE</Text>
                  <Text style={[s.compareFreeTxt, { fontWeight: '800', color: colors.textSecondary }]}>FREE</Text>
                  <Text style={[s.compareProTxt, { color: colors.purple, fontWeight: '800' }]}>ORACLE+</Text>
                </View>
                {([
                  ['K6 Signals',     '2 of 6',  'All 6 ✓'],
                  ['Best Straight',  '✗',        '✓'],
                  ['Signal Checks',  '✗',        'Unlimited ✓'],
                  ['Deep Analytics', '✗',        '✓'],
                  ['Match History',  '✗',        '✓'],
                ] as [string, string, string][]).map(([feature, freeVal, proVal]) => (
                  <View key={feature} style={s.compareRow}>
                    <Text style={s.compareFeature}>{feature}</Text>
                    <Text style={s.compareFreeTxt}>{freeVal}</Text>
                    <Text style={s.compareProTxt}>{proVal}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={s.upgradeBtn} onPress={() => router.push('/paywall')}>
                <Text style={s.upgradeBtnText}>Upgrade to Oracle+ · $9.99/mo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.trialBtn} onPress={() => router.push('/paywall')}>
                <Text style={s.trialBtnText}>Try 5 days for $4.99 → then $9.99/mo, cancel anytime</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.planActiveCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <View>
                  <Text style={s.planActiveTitle}>{tierLabel}</Text>
                  <Text style={[s.planActiveStatus, { color: colors.success }]}>● Active</Text>
                </View>
                <View style={[s.pill, { backgroundColor: colors.successLight, borderColor: colors.success + '33' }]}>
                  <Text style={[s.pillText, { color: colors.success }]}>ACTIVE</Text>
                </View>
              </View>
              {PRO_FEATURES.map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <Text style={s.featureCheck}>✓</Text>
                  <Text style={s.featureText}>{f}</Text>
                </View>
              ))}
              <View style={[s.divider, { marginTop: 14 }]} />
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 10, marginBottom: 8 }}>
                Subscription renews automatically. Manage or cancel in your App Store account settings.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={s.outlineBtn} onPress={() => purchaseSubscription('monthly')}>
                  <Text style={s.outlineBtnText}>Manage Subscription</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.ghostBtn} onPress={() => restorePurchases()}>
                  <Text style={s.ghostBtnText}>Restore Purchase</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* §4.2 last-hit pill */}
        <LastHitPill />

        {/* ── History (enhancements §4.4 + §2.6) ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>HISTORY</Text>
          {savedCombos.length > 0 && (
            <TouchableOpacity
              style={[s.card, { marginBottom: 8, borderColor: colors.gold + '55', borderWidth: 1 }]}
              onPress={() => router.push('/(tabs)/book')}
              accessibilityRole="button"
              accessibilityLabel={`Your saved signals have matched ${personalHits.totalHits} times in the last 30 days. Tap to open Number Book.`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                <Text style={{ fontSize: 26 }}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                    Your saved signals have matched{' '}
                    <Text style={{ color: colors.gold, fontWeight: '900' }}>{personalHits.totalHits}</Text>{' '}
                    {personalHits.totalHits === 1 ? 'time' : 'times'}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                    {savedCombos.length} {savedCombos.length === 1 ? 'signal' : 'signals'} tracked · {personalHits.totalStraight} straight · last 30 days
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.card, { marginBottom: 8 }]} onPress={() => router.push('/track-record')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
              <Text style={{ fontSize: 26 }}>🧾</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Verified track record</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Receipts: every confirmed K6 match, last 30 days.</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={s.card} onPress={() => router.push('/replay')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
              <Text style={{ fontSize: 26 }}>📼</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Replay last 7 days</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Past slates vs actual draws, day by day.</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Followed states (enhancements §3.4) ── */}
        <View style={s.section}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={s.sectionLabel}>FOLLOWED STATES</Text>
            {followedStates.length > 0 && (
              <TouchableOpacity onPress={() => clearFollowedStates().then(() => showToast('Cleared followed states', 'info'))}>
                <Text style={{ fontSize: 10, color: colors.textTertiary, letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold }}>CLEAR</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.card}>
            <Text style={{ fontSize: 11, color: colors.textSecondary, padding: 14, paddingBottom: 6, lineHeight: 16 }}>
              {followedStates.length === 0
                ? 'No filters active. Tap states to follow — Results, Match Feed, Track Record, and Last Match will filter to those states only.'
                : `Filtering to ${followedStates.length} state${followedStates.length === 1 ? '' : 's'}: ${followedStates.join(' · ')}`}
            </Text>
            {JURISDICTION_GROUPS.map(group => (
              <View key={group.label} style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: colors.textTertiary, letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 4 }}>{group.label.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {group.codes.map(code => {
                    const on = isFollowing(code);
                    return (
                      <TouchableOpacity
                        key={code}
                        onPress={() => toggleFollowedState(code)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${on ? 'Unfollow' : 'Follow'} ${code}`}
                        style={{
                          paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99,
                          borderWidth: 1,
                          borderColor: on ? colors.cyan + '88' : colors.border,
                          backgroundColor: on ? colors.cyan + '18' : colors.bgElevated,
                        }}
                      >
                        <Text style={{
                          fontSize: 11, fontWeight: '900',
                          color: on ? colors.cyan : colors.textSecondary,
                          fontFamily: theme.typography.fontFamily.monoBold,
                          letterSpacing: 0.4,
                        }}>{code}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Display (enhancements §3.5) ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>DISPLAY</Text>
          <View style={s.card}>
            {/* Appearance — light / dark / system. Persists via AsyncStorage
                in lib/theme/ThemeProvider; default 'system'. */}
            <View style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={tog.label}>Appearance</Text>
                  <Text style={tog.sub}>
                    {themeMode === 'system'
                      ? `Follow device · currently ${themeScheme}`
                      : `Always ${themeMode}`}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['system', 'light', 'dark'] as ThemeMode[]).map(m => {
                  const active = themeMode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setThemeMode(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{
                        flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8,
                        borderWidth: 1,
                        borderColor: active ? colors.purple : colors.border,
                        backgroundColor: active ? colors.primaryLight : colors.bgElevated,
                      }}
                    >
                      <Text style={{
                        fontSize: 13, fontWeight: '700',
                        color: active ? colors.purple : colors.textSecondary,
                        textTransform: 'capitalize',
                      }}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <Toggle
              on={coffeeMode}
              onChange={() => toggleCoffeeMode()}
              label="Coffee mode"
              sub="Hide all chrome on Home — just scope + 6 signals + countdown"
            />
            {/* Phase C1 — ZK30 view-mode toggle. Admin-only; non-admin users
                are locked to subscriber and don't see this control. */}
            <ZK30ViewModeRow />
          </View>
        </View>

        {/* ── Notifications ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
          <View style={s.card}>
            <Toggle on={notifPrefs.nextDraw}   onChange={v => handleNotifChange('nextDraw', v)}   label="Next Draw Alert"          sub="15 min before each draw" />
            <Toggle on={notifPrefs.slateReady} onChange={v => handleNotifChange('slateReady', v)} label="Slate Ready"               sub="When ZK6 generates your daily slate" />
            <Toggle on={notifPrefs.hits}       onChange={v => handleNotifChange('hits', v)}       label="Slate Match Alert"         sub="When your signals match draw results" />
            <Toggle on={notifPrefs.promo}      onChange={v => handleNotifChange('promo', v)}      label="Promotions & New Features" sub="Special offers and announcements" />
          </View>
        </View>

        {/* ── Glossary ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ZK6 GLOSSARY</Text>
          <View style={s.card}>
            {GLOSSARY.map((g, i) => (
              <View
                key={i}
                style={[s.glossItem, i < GLOSSARY.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              >
                <TouchableOpacity
                  style={s.glossHeader}
                  onPress={() => setGlossOpen(glossOpen === i ? null : i)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.glossTerm, glossOpen === i && { color: colors.cyan }]}>{g.term}</Text>
                  <Text style={[s.glossArrow, { color: glossOpen === i ? colors.cyan : colors.purple }]}>
                    {glossOpen === i ? '▲' : '›'}
                  </Text>
                </TouchableOpacity>
                {glossOpen === i && <Text style={s.glossDef}>{g.def}</Text>}
              </View>
            ))}
          </View>
        </View>

        {/* ── Account ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.card}>
            {([
              ['🔒', 'Change Password'],
              ['📧', 'Email Preferences'],
              ['🌐', 'Language', 'English (US)'],
              ['📱', 'App Version', 'v2.0 · ZK6 Engine'],
              ['📄', 'Terms of Service'],
              ['🛡', 'Privacy Policy'],
              ['💬', 'Contact Support'],
              ['🚪', 'Sign Out', '', true],
            ] as [string, string, string?, boolean?][]).map(([icon, label, meta, isDanger], i, arr) => (
              <TouchableOpacity
                key={i}
                style={[s.accountRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (label === 'Sign Out') {
                    signOut().then(() => {
                      router.replace('/');
                    });
                    showToast('Signed out', 'info');
                  } else if (!meta) {
                    showToast(`${label} — coming soon`, 'info');
                  }
                }}
              >
                <Text style={s.accountIcon}>{icon}</Text>
                <Text style={[s.accountLabel, isDanger && { color: colors.error }]}>{label}</Text>
                {meta
                  ? <Text style={s.accountMeta}>{meta}</Text>
                  : <Text style={s.accountArrow}>›</Text>
                }
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Dev role switcher — admin only */}
        {user?.role === 'admin' && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>DEV · ROLE SWITCHER</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['free', 'premium', 'admin'] as UserRole[]).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.roleBtn, user.role === r && s.roleBtnOn]}
                  onPress={() => setRole(r)}
                  testID={`plan-${r}`}
                >
                  <Text style={[s.roleBtnText, user.role === r && s.roleBtnTextOn]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerLogo}>HIT<Text style={{ color: colors.cyan }}>MASTER</Text></Text>
          <Text style={s.footerSub}>Powered by ZK6™ Intelligence Engine</Text>
          <Text style={s.footerLegal}>© 2026 HitMaster · For entertainment only · Not financial advice</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeS = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 32 },

  hero: {
    margin: 16, borderRadius: theme.borderRadius.xl,
    padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    ...shadows.glow,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2, borderColor: colors.purple + '55',
  },
  heroTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 4, fontFamily: theme.typography.fontFamily.bold },
  heroSub: { fontSize: 11, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, letterSpacing: 1.5, marginBottom: 12 },
  heroPills: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '700' },

  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionLabel: {
    fontSize: 10, fontWeight: '900',
    color: colors.cyan,
    fontFamily: theme.typography.fontFamily.mono,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.glow,
  },

  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.tile,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center',
    ...shadows.glow,
  },
  statNum: { fontSize: 16, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 4 },
  statLabel: { fontSize: 9, color: colors.textTertiary, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  planFreeCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1.5, borderColor: colors.purple + '44',
    padding: 18,
    ...shadows.glow,
  },
  planFreeTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  planFreeTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 3 },
  planFreeSub: { fontSize: 12, color: colors.textSecondary },
  planFreeTeaser: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginVertical: 14 },
  compareGrid: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginVertical: 12 },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  compareFeature: { flex: 2, fontSize: 12, color: colors.text, fontWeight: '600' },
  compareFreeTxt: { flex: 1, fontSize: 11, color: colors.textTertiary, textAlign: 'center' },
  compareProTxt:  { flex: 1.5, fontSize: 11, color: colors.success, textAlign: 'center', fontWeight: '700' },
  upgradeBtn: {
    backgroundColor: colors.purple,
    borderRadius: theme.borderRadius.tile,
    paddingVertical: 13, alignItems: 'center', marginBottom: 8,
  },
  upgradeBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  trialBtn: { alignItems: 'center', paddingVertical: 6 },
  trialBtnText: { fontSize: 12, color: colors.cyan, fontWeight: '600' },

  planActiveCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1, borderColor: colors.border,
    padding: 18,
    ...shadows.glow,
  },
  planActiveTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 2 },
  planActiveStatus: { fontSize: 12, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  featureCheck: { fontSize: 12, color: colors.cyan, fontWeight: '800', width: 16, fontFamily: theme.typography.fontFamily.monoBold },
  featureText: { fontSize: 13, color: colors.textSecondary },
  outlineBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.purple,
    borderRadius: theme.borderRadius.chip, paddingVertical: 8, alignItems: 'center',
  },
  outlineBtnText: { fontSize: 12, color: colors.purple, fontWeight: '600' },
  ghostBtn: {
    flex: 1, backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.chip, paddingVertical: 8, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  ghostBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },

  glossItem: {},
  glossHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  glossTerm: { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1 },
  glossArrow: { fontSize: 10, color: colors.textTertiary, marginLeft: 8 },
  glossDef: { fontSize: 12, color: colors.textSecondary, lineHeight: 19, paddingHorizontal: 16, paddingBottom: 14 },

  accountRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16, paddingVertical: 14,
  },
  accountIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  accountLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  accountMeta: { fontSize: 12, color: colors.textTertiary },
  accountArrow: { color: colors.textTertiary, fontSize: 18, fontWeight: '300' },

  roleBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: theme.borderRadius.chip,
    backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border,
  },
  roleBtnOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  roleBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  roleBtnTextOn: { color: '#fff', fontWeight: '700' },

  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 16, gap: 5 },
  footerLogo: { fontSize: 14, fontWeight: '900', color: colors.text, letterSpacing: 1 },
  footerSub: { fontSize: 10, color: colors.textTertiary },
  footerLegal: { fontSize: 10, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 24 },
});
