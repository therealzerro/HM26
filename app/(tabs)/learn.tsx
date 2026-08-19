// app/(tabs)/learn.tsx — Learn Center (BOOK-01 T2 relayout, 2026-07-26)
//
// Single-pane rebuild of the old 230px-sidebar master-detail layout
// (docs/design_scope_2026-07-26_book.md §T2): module index ⇄ module detail
// switched on `activeId`. Module CONTENT is unchanged — copy was already
// brand-compliant; only the chrome moved. Emoji module icons → lucide per
// the DESIGN-02 lucide-on-consumer policy.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens, type ShadowTokens } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Hash, Package, CalendarDays, Map, Zap, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Lightbulb, Lock, type LucideIcon,
} from 'lucide-react-native';

interface LearnModule {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  sections: { title: string; body: string }[];
}

const LEARN_MODULES: LearnModule[] = [
  {
    id: 'what-is-pick3', icon: Hash, title: 'What is a 3-digit draw?',
    summary: 'The most popular daily state-run draw in America.',
    sections: [
      { title: 'The Basics', body: 'A 3-digit draw is a state-run game where you choose 3 digits (000–999). Each state runs it 1–2 times per day — a Midday draw and an Evening draw. You select 3 numbers and try to match the drawn combination from your state\'s official draw.' },
      { title: 'How the Tiers Work', body: 'Straight: match all 3 digits in exact order → primary tier (highest secondary return).\nBox: match all 3 digits in any order → secondary tier (lower per-arrangement return, better odds).\nStraight/Box combo: place both on one ticket — match the primary tier on exact order, or the secondary tier on any order.' },
      { title: 'Where Do You Place a Number?', body: 'Walk into any gas station, convenience store, grocery store, or state-authorized retailer. Ask for the 3-digit draw or look for the state\'s draw terminal. Most states also allow online entry through their official site.' },
    ],
  },
  {
    id: 'box-vs-straight', icon: Package, title: 'Box vs Straight',
    summary: 'The two arrangements — and why Box is the smarter approach.',
    sections: [
      { title: 'Straight Arrangement', body: 'You must match ALL 3 digits in the EXACT order they are drawn. Example: 4-2-7 is placed. If 4-2-7 is drawn, the arrangement matches. If 7-2-4 is drawn — it does not match. Primary tier: higher per-arrangement return, but a tighter match requirement.' },
      { title: 'Box Arrangement', body: 'You match all 3 digits in ANY ORDER. Example: the box set {2,4,7} matches if 4-2-7, 7-4-2, 2-7-4, or any arrangement of those three digits is drawn. Secondary tier: lower per-arrangement return, but significantly better match odds.' },
      { title: 'HitMaster focuses on Box', body: 'The ZK6 Engine analyzes the universe of all possible 3-digit number sets (000–999). We score each SET regardless of order, then identify the optimal straight arrangement. This gives you the analytical edge of box analysis with the straight-arrangement return on top when both align.' },
      { title: 'Singles vs Doubles vs Triples', body: 'Singles: 3 different digits (123, 456) — 6 possible straight arrangements. Most common.\nDoubles: one repeated digit (112, 344) — 3 arrangements. Less frequent.\nTriples: all same digit (111, 777) — only 1 arrangement. Rare.' },
    ],
  },
  {
    id: 'daily-drawings', icon: CalendarDays, title: 'Daily Drawing Times',
    summary: '76 draws happen every day — HitMaster tracks all of them.',
    sections: [
      { title: 'Two Sessions Per Day', body: 'Most states run their 3-digit draw twice daily:\n☀️ Midday: draws happen between 9:53 AM – 3:45 PM ET\n🌙 Evening: draws happen between 6:25 PM – 11:15 PM ET\n\nYou place your number BEFORE the draw. Most states stop accepting entries 15–30 minutes before draw time.' },
      { title: 'Your State\'s Times', body: 'Every state has its specific draw time. For example:\n• New York Midday: 2:00 PM ET\n• Florida Evening: 9:15 PM ET\n• Ohio Midday: 12:14 PM ET\n• California Evening: 9:15 PM ET\n\nHitMaster shows you all 76 daily draw times and the next upcoming draw at the top of every screen.' },
      { title: 'All Day Scope', body: 'HitMaster\'s \'All Day\' analysis combines data from BOTH Midday and Evening sessions. This gives ZK6 the largest possible historical dataset to work with — ideal when you want the strongest overall signals regardless of session.' },
    ],
  },
  {
    id: 'regions-states', icon: Map, title: 'States & Regions',
    summary: '3-digit draws run across the US and Canada — each state is its own game.',
    sections: [
      { title: 'Each State is Independent', body: 'Every state runs its own 3-digit draw with its own drawing equipment, its own history, and its own drawn combinations. A number matching in New York does NOT affect New York\'s next draw — each draw is independent.' },
      { title: 'Drawing Method Matters', body: 'States using physical ball machines (like TX, SC, NY, FL) produce draws with real physical randomness — slight mechanical patterns can emerge over time. States using computerized RNG are designed to be purely random. ZK6 adjusts its signal confidence accordingly.' },
      { title: 'HitMaster Covers 40+ Jurisdictions', body: 'We track 3-digit draws in: AZ, AR, CA, CO, CT, DC, DE, FL, GA, IA, ID, IL, IN, KS, KY, LA, MI, MN, MO, NC, NE, NJ, NM, NY, OH, OK, PA, SC, TN, TX, VA, WA, WI, WV — plus Ontario, Quebec, and Western Canada.' },
    ],
  },
  {
    id: 'zk6-for-you', icon: Zap, title: 'How ZK6 Works For You',
    summary: 'You don\'t need to understand the math — just follow the slate.',
    sections: [
      { title: 'Your Daily K6 Slate', body: 'Every day, ZK6 analyzes the entire 3-digit draw universe — all 1,000 possible combinations — and selects the 6 signals with the strongest signal convergence. These are your K6 Slate signals. Pro members see all 6; Free members see the top 2 as a preview.' },
      { title: 'Reading a Signal Card', body: 'Each signal shows:\n• The 3-digit number set and its box combination\n• Energy, Momentum, Pattern signal bars (higher = stronger signal)\n• Energy Score (0–100): how strongly the signal stands out vs. the full universe\n• Optimal Straight: the best ordering for straight arrangement\n\nSignals with Energy 65+ are STRONG. 80+ is BLAZING.' },
      { title: 'How to Use It', body: '1. Open HitMaster before your state\'s draw time\n2. Check the K6 Slate for your session (Midday or Evening)\n3. Find your state\'s signals — or use All Day for the combined slate\n4. Place the top signals as Box arrangements at your state-authorized retailer\n5. After the draw, check Results to see if your signals matched' },
      { title: 'Managing Expectations', body: 'HitMaster provides data-driven analysis to help you make smarter signal choices — it is NOT a guarantee of outcomes. Every draw is independent. ZK6 identifies statistical patterns and signal convergence, but no engine eliminates randomness. Use responsibly, within your means.' },
    ],
  },
];

export default function LearnScreen() {
  const { colors, shadows } = useTheme();
  const s = useMemo(() => makeS(colors, shadows), [colors, shadows]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  // DESIGN-02 T2 (2.1): section accordion fade; no-op on Reduce Motion.
  const reduceMotion = useReduceMotion();

  const activeModule = LEARN_MODULES.find(m => m.id === activeId) ?? null;
  const openModule = (id: string) => { setActiveId(id); setExpandedSection(null); };

  if (!activeModule) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Learn Center" subtitle="3-digit draws from zero to expert" />
        <ScrollView contentContainerStyle={s.indexContent}>
          <Text style={s.welcomeDesc}>
            {"Most members only know how to engage at their local retailer in their home state. We'll teach you everything — from placing your first number to understanding ZK6 signals — in plain English."}
          </Text>

          {LEARN_MODULES.map(m => {
            const Icon = m.icon;
            return (
              <TouchableOpacity key={m.id} style={s.moduleCard} onPress={() => openModule(m.id)} activeOpacity={0.8}>
                <View style={s.moduleIcon}><Icon size={18} color={colors.primary} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.moduleCardTitle}>{m.title}</Text>
                  <Text style={s.moduleCardSummary} numberOfLines={2}>{m.summary}</Text>
                </View>
                <ChevronRight size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            );
          })}

          <View style={s.quickTip}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Lightbulb size={13} color={colors.gold} />
              <Text style={s.quickTipLabel}>Quick Tip</Text>
            </View>
            <Text style={s.quickTipText}>{"Always start with BOX on new signals. Once you're comfortable, layer in straight arrangements for the primary tier."}</Text>
          </View>

          <LinearGradient colors={[colors.primaryLight, colors.cosmicLight]} style={s.ctaCard}>
            <Text style={s.ctaTitle}>Ready to see your signals?</Text>
            <Text style={s.ctaDesc}>Once you understand the basics, your daily K6 Slate is waiting.</Text>
            <TouchableOpacity style={s.ctaBtn} onPress={() => openModule('zk6-for-you')}>
              {/* white-on-primary: intentional in both modes (LIGHT-01) */}
              <Text style={s.ctaBtnText}>Start with ZK6</Text>
            </TouchableOpacity>
          </LinearGradient>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const ActiveIcon = activeModule.icon;
  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.detailHeader}>
        <TouchableOpacity style={s.backBtn} onPress={() => setActiveId(null)} accessibilityRole="button" accessibilityLabel="Back to all topics">
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={s.backText}>All Topics</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.moduleContent}>
        <View style={s.moduleHero}>
          <View style={s.moduleIconLg}><ActiveIcon size={26} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.moduleTitleLg}>{activeModule.title}</Text>
            <Text style={s.moduleSummaryLg}>{activeModule.summary}</Text>
          </View>
        </View>

        {activeModule.sections.map((section, i) => (
          <TouchableOpacity
            key={i}
            style={s.sectionCard}
            onPress={() => setExpandedSection(expandedSection === i ? null : i)}
            activeOpacity={0.85}
          >
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, expandedSection === i && { color: colors.primary }]}>
                {section.title}
              </Text>
              {expandedSection === i
                ? <ChevronUp size={15} color={colors.textTertiary} />
                : <ChevronDown size={15} color={colors.textTertiary} />}
            </View>
            {expandedSection === i && (
              <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(160)}>
                <Text style={s.sectionBody}>{section.body}</Text>
              </Animated.View>
            )}
          </TouchableOpacity>
        ))}

        {/* Regions — Pro teaser */}
        {activeId === 'regions-states' && (
          <LinearGradient colors={[colors.cosmicLight, colors.goldLight]} style={s.proTeaser}>
            <Lock size={20} color={colors.gold} style={{ marginBottom: 6 }} />
            <Text style={s.proTeaserTitle}>Pro Secret: Engage All States Nationwide</Text>
            <Text style={s.proTeaserDesc}>Did you know you can legally place 3-digit numbers in multiple states from your home? Pro members unlock our curated guide showing exactly how.</Text>
            <TouchableOpacity style={s.proTeaserBtn} onPress={() => router.push('/paywall')}>
              {/* white on gold accent fill: intentional in both modes (LIGHT-01) */}
              <Text style={s.proTeaserBtnText}>Unlock with Pro ♛</Text>
            </TouchableOpacity>
          </LinearGradient>
        )}

        <TouchableOpacity style={[s.backBtn, { marginTop: 16 }]} onPress={() => setActiveId(null)} accessibilityRole="button" accessibilityLabel="Back to all topics">
          <ChevronLeft size={18} color={colors.textSecondary} />
          <Text style={s.backText}>All Topics</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeS = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Index
  indexContent: { padding: theme.layout.screenInset, paddingBottom: 32 },
  welcomeDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  moduleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8, ...shadows.glow },
  moduleIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  moduleCardTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 },
  moduleCardSummary: { fontSize: 11, color: colors.textSecondary, lineHeight: 15 },

  quickTip: { backgroundColor: colors.goldLight, borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 14, borderWidth: 1, borderColor: colors.gold + theme.alpha.tint },
  quickTipLabel: { fontSize: 10, fontWeight: '800', color: colors.gold },
  quickTipText: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },

  ctaCard: { borderRadius: theme.borderRadius.xl, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: colors.primary + theme.alpha.tint },
  ctaTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 4 },
  ctaDesc: { fontSize: 11, color: colors.textSecondary, marginBottom: 12 },
  ctaBtn: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 9, borderRadius: theme.borderRadius.lg },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 }, // white-on-primary: intentional in both modes (LIGHT-01)

  // Detail
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.layout.screenInset, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 10 },
  backText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  moduleContent: { padding: theme.layout.screenInset, paddingBottom: 40 },
  moduleHero: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 20 },
  moduleIconLg: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  moduleTitleLg: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 4 },
  moduleSummaryLg: { fontSize: 13, color: colors.textSecondary },

  sectionCard: { backgroundColor: colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden', ...shadows.glow },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.text, flex: 1 },
  sectionBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 22, padding: 14, paddingTop: 0 },

  proTeaser: { borderRadius: theme.borderRadius.xl, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary + theme.alpha.strong, marginTop: 4, borderStyle: 'dashed' },
  proTeaserTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 6, textAlign: 'center' },
  proTeaserDesc: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  proTeaserBtn: { backgroundColor: colors.gold, paddingHorizontal: 18, paddingVertical: 9, borderRadius: theme.borderRadius.lg },
  proTeaserBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 }, // white on gold accent fill: intentional in both modes (LIGHT-01)
});
