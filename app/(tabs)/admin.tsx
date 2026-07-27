import { withAdminGate } from '@/components/RequireAdmin';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { goBackSafe } from '@/lib/safeBack';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { storage } from '@/lib/storage';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useCoverage } from '@/hooks/useCoverage';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';

import { ErrorBoundary } from '@/components/admin/AdminShared';
import { AdminKeyGate } from '@/components/admin/AdminKeyGate';
import DashboardView from '@/components/admin/DashboardView';
import ImportWizardView from '@/components/admin/ImportWizardView';
import ImportHistoryView from '@/components/admin/ImportHistoryView';
import CoverageMatrixView from '@/components/admin/CoverageMatrixView';
import HealthTestsView from '@/components/admin/HealthTestsView';
import EngineConfigView from '@/components/admin/EngineConfigView';
import HitTrackingView from '@/components/admin/HitTrackingView';
import NationwideAdminView from '@/components/admin/NationwideAdminView';
import AdaptiveLearningView from '@/components/admin/AdaptiveLearningView';
import IntelligenceRouteView from '@/components/admin/IntelligenceRouteView';
import FingerprintView from '@/components/admin/FingerprintView';
import ProposalReviewView from '@/components/admin/ProposalReviewView';
import ProSubscribersView from '@/components/admin/ProSubscribersView';
import SubscriberImportView from '@/components/admin/SubscriberImportView';
import FunnelDashboardView from '@/components/admin/FunnelDashboardView';
import BriefView from '@/components/admin/BriefView';
import AnalyticsView from '@/components/admin/AnalyticsView';
import PublishView, { PublishDeepLinkPreset } from '@/components/admin/PublishView';
import ReelsView from '@/components/admin/ReelsView';

// ─── Nav config ───────────────────────────────────────────────────────────────
// DESIGN-02 T2/T3: four labeled domains in one horizontal scroller. Every id is
// load-bearing (deep links: /admin?view=<id>) — never rename them.
type NavItem = { id: string; icon: string; label: string; route?: Parameters<typeof router.push>[0] };
const NAV_GROUPS: { domain: string; items: NavItem[] }[] = [
  { domain: 'PIPELINE', items: [
    { id:'wizard', icon:'📥', label:'Import' },
    { id:'history', icon:'🗂', label:'History' },
    { id:'matrix', icon:'📊', label:'Coverage' },
    { id:'health', icon:'⚡', label:'Health' },
    { id:'nationwide', icon:'🌎', label:'Nationwide' },
  ]},
  { domain: 'ENGINE', items: [
    { id:'engine', icon:'⚙️', label:'Engine' },
    { id:'performance', icon:'🎯', label:'Performance' },
    { id:'adaptive', icon:'🧠', label:'Learning' },
    { id:'intelligence', icon:'🔬', label:'Intelligence' },
    { id:'fingerprint',  icon:'🧬', label:'Fingerprint'  },
    { id:'proposals',    icon:'🧾', label:'Proposals'   },
  ]},
  { domain: 'GROWTH', items: [
    { id:'publish', icon:'📣', label:'Publish' },
    { id:'reels', icon:'🎬', label:'Reels' },
    { id:'funnel',       icon:'📈', label:'Funnel'      },
    { id:'subscribers',  icon:'👥', label:'Subscribers' },
    { id:'sub-import',   icon:'📧', label:'Sub Import'  },
  ]},
  { domain: 'REPORTS', items: [
    { id:'dashboard', icon:'🏠', label:'Dashboard' },
    { id:'brief', icon:'📰', label:'Brief' },
    { id:'analytics', icon:'🔎', label:'Analytics' },
    // Route chip: navigates away and can never show active — ' ↗' marks it external.
    { id:'image-export', icon:'🖼', label:'Image Export ↗', route:'/admin-image-export' as unknown as Parameters<typeof router.push>[0] },
  ]},
];
const NAV: NavItem[] = NAV_GROUPS.flatMap(g => g.items);
const isViewId = (v: string) => NAV.some(n => n.id === v && !n.route);
const LAST_VIEW_KEY = 'hm:admin-last-view';

// ─── Main Screen ──────────────────────────────────────────────────────────────
function AdminScreen() {
  const { colors } = useTheme();
  // Deep-link support (SOCIAL-11): /admin?view=publish&preset=free_slate&session=midday
  // lets the operator bookmark a routine post — one tap replaces 5 navigation taps
  // plus the preset tap. Params are read once at mount; in-app nav wins afterwards.
  const params = useLocalSearchParams<{ view?: string; preset?: string; session?: string }>();
  const [view, setViewState] = useState(() => {
    const v = typeof params.view === 'string' ? params.view : '';
    return isViewId(v) ? v : 'dashboard';
  });
  // Last-view persistence: URL param wins; otherwise restore the stored view.
  const urlHadView = useRef(typeof params.view === 'string' && isViewId(params.view));
  useEffect(() => {
    if (urlHadView.current) return;
    storage.getItem(LAST_VIEW_KEY).then(v => { if (v && isViewId(v)) setViewState(v); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setView = useCallback((id: string) => {
    setViewState(id);
    storage.setItem(LAST_VIEW_KEY, id);
  }, []);

  // Scroll-into-view: chip x is relative to its group column, so absolute
  // position = group x + chip x (both recorded via onLayout).
  const navScrollRef = useRef<ScrollView>(null);
  const navGroupX = useRef<Record<string, number>>({});
  const navChipX = useRef<Record<string, { x: number; w: number }>>({});
  const navScrolledOnce = useRef(false);
  const { width: winW } = useWindowDimensions();
  const scrollNavToChip = useCallback((id: string, animated: boolean) => {
    const group = NAV_GROUPS.find(g => g.items.some(n => n.id === id));
    const chip = navChipX.current[id];
    if (!group || !chip) return;
    const abs = (navGroupX.current[group.domain] ?? 0) + chip.x;
    navScrollRef.current?.scrollTo({ x: Math.max(0, abs - (winW - chip.w) / 2), animated });
  }, [winW]);
  useEffect(() => {
    // Layout events land after first paint — defer the mount scroll a tick.
    const t = setTimeout(() => {
      scrollNavToChip(view, navScrolledOnce.current);
      navScrolledOnce.current = true;
    }, navScrolledOnce.current ? 0 : 120);
    return () => clearTimeout(t);
  }, [view, scrollNavToChip]);

  const [publishPreset, setPublishPreset] = useState<PublishDeepLinkPreset | null>(() =>
    typeof params.preset === 'string' && params.preset
      ? { preset: params.preset, session: typeof params.session === 'string' ? params.session : undefined }
      : null,
  );
  const [wizardPreset, setWizardPreset] = useState<{ type: 'box_history' | 'pair_history'; jurisdiction: string } | null>(null);
  const { refreshSnapshot } = useSnapshot();
  const { refreshHealth, regenerateSlate, checkSlateLock, imports, isLoading, healthMetrics, importHistory, importLedger } = useDataIngestion();
  const { coveragePctH01Y, missingH01Y } = useCoverage();
  const { scope } = useScope();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['left', 'right', 'bottom']}>
      {/* Top header */}
      <LinearGradient colors={[colors.cosmic, colors.primary]} style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 22 }}>🔐</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Creator Access</Text>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5 }}>ADMIN ONLY</Text>
        </View>
        {view !== 'dashboard' && (
          <TouchableOpacity onPress={() => setView('dashboard')} style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>🏠 Dashboard</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => goBackSafe()} style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>← Exit</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Horizontal nav — grouped by domain */}
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView ref={navScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'flex-end' }}>
          {NAV_GROUPS.map((g, gi) => (
            <React.Fragment key={g.domain}>
              {gi > 0 && <View style={{ width: 1, alignSelf: 'stretch', marginVertical: 4, marginHorizontal: 6, backgroundColor: colors.border }} />}
              <View onLayout={e => { navGroupX.current[g.domain] = e.nativeEvent.layout.x; }}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1.5, marginLeft: 12, marginBottom: 2 }}>{g.domain}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {g.items.map(n => {
                    const active = view === n.id;
                    return (
                      <TouchableOpacity
                        key={n.id}
                        onLayout={e => { navChipX.current[n.id] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; }}
                        style={[
                          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'transparent' },
                          active && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                        ]}
                        onPress={() => n.route ? router.push(n.route) : setView(n.id)}
                      >
                        <Text style={{ fontSize: 13 }}>{n.icon}</Text>
                        <Text style={{ fontSize: 11, fontWeight: active ? '700' : '400', color: active ? colors.primary : colors.textSecondary }}>{n.label}</Text>
                        {active && <View style={{ position: 'absolute', bottom: 2, left: 10, right: 10, height: 2, borderRadius: 1, backgroundColor: colors.primary }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </React.Fragment>
          ))}
        </ScrollView>
      </View>

      {/* Content — one AdminKeyGate for the whole admin surface (SEC-05):
          every view now writes through the admin-ops gateway, so the key is
          required everywhere; enter it once per device and it's stored. */}
      <AdminKeyGate>
      <View style={{ flex: 1 }}>
        {view === 'dashboard' && <DashboardView setView={setView} imports={imports ?? []} healthMetrics={healthMetrics} regenerateSlate={regenerateSlate} checkSlateLock={checkSlateLock} onOpenZK30Import={(type) => { setWizardPreset({ type, jurisdiction: 'TX' }); setView('wizard'); }} />}
        {view === 'brief' && <ErrorBoundary fallback="Brief view error"><BriefView /></ErrorBoundary>}
        {view === 'publish' && <ErrorBoundary fallback="Publish view error"><PublishView initialPreset={publishPreset} onPresetConsumed={() => setPublishPreset(null)} /></ErrorBoundary>}
        {view === 'reels' && <ErrorBoundary fallback="Reels view error"><ReelsView /></ErrorBoundary>}
        {view === 'wizard' && <ImportWizardView setView={setView} importHistory={importHistory} importLedger={importLedger} regenerateSlate={regenerateSlate} preset={wizardPreset} onClearPreset={() => setWizardPreset(null)} />}
        {view === 'history' && <ImportHistoryView />}
        {view === 'matrix' && <ErrorBoundary fallback="Coverage matrix error"><CoverageMatrixView setView={setView} /></ErrorBoundary>}
        {view === 'health' && <HealthTestsView />}
        {view === 'engine' && <EngineConfigView regenerateSlate={regenerateSlate} onOpenProposals={() => setView('proposals')} />}
        {view === 'performance' && <HitTrackingView />}
        {view === 'analytics' && <ErrorBoundary fallback="Analytics view error"><AnalyticsView /></ErrorBoundary>}
        {view === 'nationwide' && <NationwideAdminView />}
        {view === 'adaptive' && <AdaptiveLearningView setView={setView} />}
        {view === 'intelligence' && <IntelligenceRouteView />}
        {view === 'fingerprint'  && <FingerprintView />}
        {view === 'proposals'    && <ProposalReviewView />}
        {view === 'funnel'       && <ErrorBoundary fallback="Funnel dashboard error"><FunnelDashboardView /></ErrorBoundary>}
        {view === 'subscribers'  && <ErrorBoundary fallback="Subscribers view error"><ProSubscribersView /></ErrorBoundary>}
        {view === 'sub-import'   && <ErrorBoundary fallback="Subscriber import error"><SubscriberImportView /></ErrorBoundary>}
      </View>
      </AdminKeyGate>
    </SafeAreaView>
  );
}

export default withAdminGate(AdminScreen);
