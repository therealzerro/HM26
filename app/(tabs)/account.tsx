import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useToast } from '@/components/Toast';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types/core';
import { fetchFromSupabase, countFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';

const GLOSSARY = [
  { term: 'ZK6™ Engine', def: 'HitMaster\'s proprietary intelligence engine — a multi-dimensional pattern recognition system trained on years of lottery draw history. Picks are ranked by Oracle Score (signal convergence strength), not guarantees.' },
  { term: 'Energy Score', def: 'A 0–100 composite signal strength. BLAZING (80+) · HOT (65+) · WARM (45+) · COOL (<45). Higher = stronger convergence across all three signals.' },
  { term: 'K6 Slate', def: 'Your 6 daily picks — the top combos emerging from ZK6\'s full intelligence pass. Oracle+ sees all 6. Free sees top 2.' },
  { term: 'Frequency Signal', def: 'Historical draw pressure — how strongly a number set is signaling based on long-term draw history.' },
  { term: 'Momentum Signal', def: 'Pair energy and burst patterns — which digit pairs are building directional pressure right now.' },
  { term: 'Pattern Signal', def: 'Digit co-occurrence and relationship activity across our full historical database.' },
  { term: 'Scope', def: 'Draw session: Midday (☀️), Evening (🌙), or All Day (◈). ZK6 runs separate analyses per scope.' },
  { term: 'Optimal Straight', def: 'The recommended exact-order arrangement for a box number — the ordering with the strongest directional signal alignment.' },
  { term: 'Box vs Straight', def: 'Box: match 3 digits in ANY order (~$80 payout). Straight: exact order (~$500). ZK6 focuses on box picks, then surfaces the best straight arrangement.' },
];

const PRO_FEATURES = [
  'All 6 K6 Slate picks',
  'Optimal straight per pick',
  'Unlimited Heat Checks',
  'Full pattern depth analytics',
  'Pick by Budget tool',
  'Hit history & stats',
];

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <View style={tog.row}>
      <View style={{ flex: 1 }}>
        <Text style={tog.label}>{label}</Text>
        {sub && <Text style={tog.sub}>{sub}</Text>}
      </View>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.purple }}
        thumbColor="#fff"
      />
    </View>
  );
}

const tog = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  sub: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 },
});

export default function AccountScreen() {
  const { user, setRole, purchaseSubscription, restorePurchases, signOut } = useAuth();
  const { showToast } = useToast();
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

  const handleNotifChange = (key: keyof typeof notifPrefs, value: boolean) => {
    const next = { ...notifPrefs, [key]: value };
    setNotifPrefs(next);
    storage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));
    const labels: Record<keyof typeof notifPrefs, string> = {
      nextDraw: 'Next Draw Alert',
      slateReady: 'Slate Ready',
      hits: 'Slate Hit Alert',
      promo: 'Promotions',
    };
    showToast(`${value ? 'Enabled' : 'Disabled'}: ${labels[key]}`, 'info');
  };
  const [memberDays, setMemberDays] = useState(0);

  // Triple-tap on avatar → admin
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 600);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      router.push('/(tabs)/admin');
    }
  }, []);

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
  const tierColor = isFree ? theme.colors.free : tier === 'PRO' ? theme.colors.premium : theme.colors.admin;

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <LinearGradient
          colors={['#1a0d35', '#120a1f'] as [string, string]}
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
            <View style={[s.pill, { backgroundColor: theme.colors.bgElevated, borderColor: theme.colors.borderMed }]}>
              <Text style={[s.pillText, { color: theme.colors.textTertiary }]}>
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
              <Text style={[s.statNum, { color: theme.colors.cyan }]}>
                {historiesStats?.totalDraws ? historiesStats.totalDraws.toLocaleString() : '—'}
              </Text>
              <Text style={s.statLabel}>Draws Tracked</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: theme.colors.amber }]}>
                {historiesStats?.activeStates ?? '—'}
              </Text>
              <Text style={s.statLabel}>States Active</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: theme.colors.gold }]}>{memberDays}</Text>
              <Text style={s.statLabel}>Days Active</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: theme.colors.rose }]}>ZK6™</Text>
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
                  <Text style={s.planFreeSub}>2 picks preview per draw</Text>
                </View>
                <Text style={{ fontSize: 28 }}>🏆</Text>
              </View>
              <View style={s.divider} />
              {/* FREE vs PRO comparison */}
              <View style={s.compareGrid}>
                <View style={[s.compareRow, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                  <Text style={[s.compareFeature, { fontSize: 9, color: theme.colors.textTertiary, letterSpacing: 1.2 }]}>FEATURE</Text>
                  <Text style={[s.compareFreeTxt, { fontWeight: '800', color: theme.colors.textSecondary }]}>FREE</Text>
                  <Text style={[s.compareProTxt, { color: theme.colors.purple, fontWeight: '800' }]}>ORACLE+</Text>
                </View>
                {([
                  ['K6 Picks',       '2 of 6',  'All 6 ✓'],
                  ['Best Straight',  '✗',        '✓'],
                  ['Heat Checks',    '✗',        'Unlimited ✓'],
                  ['Deep Analytics', '✗',        '✓'],
                  ['Hit History',    '✗',        '✓'],
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
                  <Text style={[s.planActiveStatus, { color: theme.colors.success }]}>● Active</Text>
                </View>
                <View style={[s.pill, { backgroundColor: theme.colors.successLight, borderColor: theme.colors.success + '33' }]}>
                  <Text style={[s.pillText, { color: theme.colors.success }]}>ACTIVE</Text>
                </View>
              </View>
              {PRO_FEATURES.map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <Text style={s.featureCheck}>✓</Text>
                  <Text style={s.featureText}>{f}</Text>
                </View>
              ))}
              <View style={[s.divider, { marginTop: 14 }]} />
              <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 10, marginBottom: 8 }}>
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

        {/* ── Notifications ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
          <View style={s.card}>
            <Toggle on={notifPrefs.nextDraw}   onChange={v => handleNotifChange('nextDraw', v)}   label="Next Draw Alert"          sub="15 min before each draw" />
            <Toggle on={notifPrefs.slateReady} onChange={v => handleNotifChange('slateReady', v)} label="Slate Ready"               sub="When ZK6 generates your daily slate" />
            <Toggle on={notifPrefs.hits}       onChange={v => handleNotifChange('hits', v)}       label="Slate Hit Alert"           sub="When your picks match draw results" />
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
                style={[s.glossItem, i < GLOSSARY.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
              >
                <TouchableOpacity
                  style={s.glossHeader}
                  onPress={() => setGlossOpen(glossOpen === i ? null : i)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.glossTerm, glossOpen === i && { color: theme.colors.cyan }]}>{g.term}</Text>
                  <Text style={[s.glossArrow, { color: glossOpen === i ? theme.colors.cyan : theme.colors.purple }]}>
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
                style={[s.accountRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
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
                <Text style={[s.accountLabel, isDanger && { color: theme.colors.error }]}>{label}</Text>
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
          <Text style={s.footerLogo}>HIT<Text style={{ color: theme.colors.cyan }}>MASTER</Text></Text>
          <Text style={s.footerSub}>Powered by ZK6™ Intelligence Engine</Text>
          <Text style={s.footerLegal}>© 2026 HitMaster · For entertainment only · Not financial advice</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingBottom: 32 },

  hero: {
    margin: 16, borderRadius: theme.borderRadius.xl,
    padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.border,
    ...theme.shadows.glow,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2, borderColor: theme.colors.purple + '55',
  },
  heroTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 4, fontFamily: theme.typography.fontFamily.bold },
  heroSub: { fontSize: 11, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, letterSpacing: 1.5, marginBottom: 12 },
  heroPills: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '700' },

  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionLabel: {
    fontSize: 10, fontWeight: '900',
    color: theme.colors.cyan,
    fontFamily: theme.typography.fontFamily.mono,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1, borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.shadows.glow,
  },

  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.borderRadius.tile,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center',
    ...theme.shadows.glow,
  },
  statNum: { fontSize: 16, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 4 },
  statLabel: { fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },

  planFreeCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1.5, borderColor: theme.colors.purple + '44',
    padding: 18,
    ...theme.shadows.glow,
  },
  planFreeTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  planFreeTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 3 },
  planFreeSub: { fontSize: 12, color: theme.colors.textSecondary },
  planFreeTeaser: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18, marginVertical: 14 },
  compareGrid: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, marginVertical: 12 },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  compareFeature: { flex: 2, fontSize: 12, color: theme.colors.text, fontWeight: '600' },
  compareFreeTxt: { flex: 1, fontSize: 11, color: theme.colors.textTertiary, textAlign: 'center' },
  compareProTxt:  { flex: 1.5, fontSize: 11, color: theme.colors.success, textAlign: 'center', fontWeight: '700' },
  upgradeBtn: {
    backgroundColor: theme.colors.purple,
    borderRadius: theme.borderRadius.tile,
    paddingVertical: 13, alignItems: 'center', marginBottom: 8,
  },
  upgradeBtnText: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  trialBtn: { alignItems: 'center', paddingVertical: 6 },
  trialBtnText: { fontSize: 12, color: theme.colors.cyan, fontWeight: '600' },

  planActiveCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: 18,
    ...theme.shadows.glow,
  },
  planActiveTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 2 },
  planActiveStatus: { fontSize: 12, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  featureCheck: { fontSize: 12, color: theme.colors.cyan, fontWeight: '800', width: 16, fontFamily: theme.typography.fontFamily.monoBold },
  featureText: { fontSize: 13, color: theme.colors.textSecondary },
  outlineBtn: {
    flex: 1, borderWidth: 1.5, borderColor: theme.colors.purple,
    borderRadius: theme.borderRadius.chip, paddingVertical: 8, alignItems: 'center',
  },
  outlineBtnText: { fontSize: 12, color: theme.colors.purple, fontWeight: '600' },
  ghostBtn: {
    flex: 1, backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.borderRadius.chip, paddingVertical: 8, alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  ghostBtnText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },

  glossItem: {},
  glossHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  glossTerm: { fontSize: 13, fontWeight: '700', color: theme.colors.text, flex: 1 },
  glossArrow: { fontSize: 10, color: theme.colors.textTertiary, marginLeft: 8 },
  glossDef: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 19, paddingHorizontal: 16, paddingBottom: 14 },

  accountRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16, paddingVertical: 14,
  },
  accountIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  accountLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  accountMeta: { fontSize: 12, color: theme.colors.textTertiary },
  accountArrow: { color: theme.colors.textTertiary, fontSize: 18, fontWeight: '300' },

  roleBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: theme.borderRadius.chip,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  roleBtnOn: { backgroundColor: theme.colors.purple, borderColor: theme.colors.purple },
  roleBtnText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  roleBtnTextOn: { color: '#fff', fontWeight: '700' },

  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 16, gap: 5 },
  footerLogo: { fontSize: 14, fontWeight: '900', color: theme.colors.text, letterSpacing: 1 },
  footerSub: { fontSize: 10, color: theme.colors.textTertiary },
  footerLegal: { fontSize: 10, color: theme.colors.textTertiary, textAlign: 'center', paddingHorizontal: 24 },
});
