import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useCoverage } from '@/hooks/useCoverage';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';

import { ErrorBoundary } from '@/components/admin/AdminShared';
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

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV = [
  { id:'dashboard', icon:'🏠', label:'Dashboard' },
  { id:'wizard', icon:'📥', label:'Import' },
  { id:'history', icon:'🗂', label:'History' },
  { id:'matrix', icon:'📊', label:'Coverage' },
  { id:'health', icon:'⚡', label:'Health' },
  { id:'engine', icon:'⚙️', label:'Engine' },
  { id:'performance', icon:'🎯', label:'Performance' },
  { id:'nationwide', icon:'🌎', label:'Nationwide' },
  { id:'adaptive', icon:'🧠', label:'Learning' },
  { id:'intelligence', icon:'🔬', label:'Intelligence' },
  { id:'fingerprint',  icon:'🧬', label:'Fingerprint'  },
  { id:'proposals',    icon:'🧾', label:'Proposals'   },
  { id:'funnel',       icon:'📈', label:'Funnel'      },
  { id:'subscribers',  icon:'👥', label:'Subscribers' },
  { id:'sub-import',   icon:'📧', label:'Sub Import'  },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const { colors } = useTheme();
  const [view, setView] = useState('dashboard');
  const [wizardPreset, setWizardPreset] = useState<{ type: 'box_history' | 'pair_history'; jurisdiction: string } | null>(null);
  const { refreshSnapshot } = useSnapshot();
  const { refreshHealth, regenerateSlate, checkSlateLock, imports, isLoading, healthMetrics, importHistory, importLedger, importDailyInput } = useDataIngestion();
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
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>← Exit</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Horizontal nav */}
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 4, flexDirection: 'row' }}>
          {NAV.map(n => (
            <TouchableOpacity key={n.id} style={[{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 5 }, view === n.id && { backgroundColor: colors.primaryLight }]} onPress={() => setView(n.id)}>
              <Text style={{ fontSize: 13 }}>{n.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: view === n.id ? '700' : '400', color: view === n.id ? colors.primary : colors.textSecondary }}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {view === 'dashboard' && <DashboardView setView={setView} imports={imports ?? []} healthMetrics={healthMetrics} regenerateSlate={regenerateSlate} checkSlateLock={checkSlateLock} onOpenZK30Import={(type) => { setWizardPreset({ type, jurisdiction: 'TX' }); setView('wizard'); }} />}
        {view === 'wizard' && <ImportWizardView setView={setView} importHistory={importHistory} importLedger={importLedger} importDailyInput={importDailyInput} regenerateSlate={regenerateSlate} preset={wizardPreset} onClearPreset={() => setWizardPreset(null)} />}
        {view === 'history' && <ImportHistoryView />}
        {view === 'matrix' && <ErrorBoundary fallback="Coverage matrix error"><CoverageMatrixView setView={setView} /></ErrorBoundary>}
        {view === 'health' && <HealthTestsView />}
        {view === 'engine' && <EngineConfigView regenerateSlate={regenerateSlate} onOpenProposals={() => setView('proposals')} />}
        {view === 'performance' && <HitTrackingView />}
        {view === 'nationwide' && <NationwideAdminView />}
        {view === 'adaptive' && <AdaptiveLearningView setView={setView} />}
        {view === 'intelligence' && <IntelligenceRouteView />}
        {view === 'fingerprint'  && <FingerprintView />}
        {view === 'proposals'    && <ProposalReviewView />}
        {view === 'funnel'       && <ErrorBoundary fallback="Funnel dashboard error"><FunnelDashboardView /></ErrorBoundary>}
        {view === 'subscribers'  && <ErrorBoundary fallback="Subscribers view error"><ProSubscribersView /></ErrorBoundary>}
        {view === 'sub-import'   && <ErrorBoundary fallback="Subscriber import error"><SubscriberImportView /></ErrorBoundary>}
      </View>
    </SafeAreaView>
  );
}
