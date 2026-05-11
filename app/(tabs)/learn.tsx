import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';

const LEARN_MODULES = [
  {
    id: 'what-is-pick3', icon: '🎰', title: 'What is Pick 3?',
    summary: 'The most popular daily lottery game in America.',
    sections: [
      { title: 'The Basics', body: 'Pick 3 is a daily lottery game where you choose 3 digits (000–999). Each state runs it 1–2 times per day — a Midday draw and an Evening draw. You pick 3 numbers and try to match the winning combination drawn by your state lottery.' },
      { title: 'How Much Can You Win?', body: 'Straight play: match all 3 digits in exact order → typically $500 for a $1 bet.\nBox play: match all 3 digits in any order → typically $80–$160 for a $1 bet.\nStraight/Box combo: play both for one ticket → win both if you hit straight, or just the box prize if out of order.' },
      { title: 'Where Do You Buy Tickets?', body: 'Walk into any gas station, convenience store, grocery store, or dedicated lottery retailer in your state. Ask for \'Pick 3\' or look for the lottery terminal. Most states also allow online play through their official lottery website.' },
    ],
  },
  {
    id: 'box-vs-straight', icon: '📦', title: 'Box vs Straight',
    summary: 'The two ways to play — and why Box is the smarter play.',
    sections: [
      { title: 'Straight Play', body: 'You must match ALL 3 digits in the EXACT order they are drawn. Example: You play 4-2-7. The winning number drawn is 4-2-7. You WIN. If 7-2-4 is drawn — you LOSE. Higher payout (~$500 per $1) but much harder to win.' },
      { title: 'Box Play', body: 'You match all 3 digits in ANY ORDER. Example: You play the box set {2,4,7}. You win if 4-2-7, 7-4-2, 2-7-4, or any arrangement of those three digits is drawn. Lower payout (~$80–$160) but significantly better odds.' },
      { title: 'HitMaster focuses on Box', body: 'Our ZK6 Engine analyzes the universe of all possible 3-digit number sets (000–999). We score each SET regardless of order, then identify the optimal straight arrangement. This gives you the best of both worlds — the strategic edge of box analysis with the straight-play payout opportunity.' },
      { title: 'Singles vs Doubles vs Triples', body: 'Singles: 3 different digits (123, 456) — 6 possible straight arrangements. Most common.\nDoubles: one repeated digit (112, 344) — 3 arrangements. Less frequent.\nTriples: all same digit (111, 777) — only 1 arrangement. Rare.' },
    ],
  },
  {
    id: 'daily-drawings', icon: '📅', title: 'Daily Drawing Times',
    summary: '76 draws happen every day — HitMaster tracks all of them.',
    sections: [
      { title: 'Two Sessions Per Day', body: 'Most states run Pick 3 twice daily:\n☀️ Midday: draws happen between 9:53 AM – 3:45 PM ET\n🌙 Evening: draws happen between 6:25 PM – 11:15 PM ET\n\nYou buy your ticket BEFORE the draw. Most states stop selling tickets 15–30 minutes before draw time.' },
      { title: 'Your State\'s Times', body: 'Every state has its specific draw time. For example:\n• New York Midday: 2:00 PM ET\n• Florida Evening: 9:15 PM ET\n• Ohio Midday: 12:14 PM ET\n• California Evening: 9:15 PM ET\n\nHitMaster shows you all 76 daily draw times and the next upcoming draw at the top of every screen.' },
      { title: 'All Day Scope', body: 'HitMaster\'s \'All Day\' analysis combines data from BOTH Midday and Evening sessions. This gives ZK6 the largest possible historical dataset to work with — ideal when you want the strongest overall picks regardless of session.' },
    ],
  },
  {
    id: 'regions-states', icon: '🗺', title: 'States & Regions',
    summary: 'Pick 3 is played across the US and Canada — each state is its own game.',
    sections: [
      { title: 'Each State is Independent', body: 'Every state runs its own Pick 3 lottery with its own drawing equipment, its own history, and its own winning numbers. A number hitting in New York does NOT affect New York\'s next draw — each draw is independent.' },
      { title: 'Drawing Method Matters', body: 'States using physical ball machines (like TX, SC, NY, FL) produce draws with real physical randomness — slight mechanical patterns can emerge over time. States using computerized RNG are designed to be purely random. ZK6 adjusts its signal confidence accordingly.' },
      { title: 'HitMaster Covers 40+ Jurisdictions', body: 'We track Pick 3 drawings in: AZ, AR, CA, CO, CT, DC, DE, FL, GA, IA, ID, IL, IN, KS, KY, LA, MI, MN, MO, NC, NE, NJ, NM, NY, OH, OK, PA, SC, TN, TX, VA, WA, WI, WV — plus Ontario, Quebec, and Western Canada.' },
    ],
  },
  {
    id: 'zk6-for-you', icon: '⚡', title: 'How ZK6 Works For You',
    summary: 'You don\'t need to understand the math — just follow the slate.',
    sections: [
      { title: 'Your Daily K6 Slate', body: 'Every day, ZK6 analyzes the entire Pick 3 universe — all 1,000 possible combinations — and selects the 6 picks with the strongest signal convergence. These are your K6 Slate picks. Pro members see all 6; Free members see the top 2 as a preview.' },
      { title: 'Reading a Pick Card', body: 'Each pick shows:\n• The 3-digit number set and its box combination\n• Frequency, Momentum, Pattern signal bars (higher = stronger signal)\n• Energy Score (0–100): how strongly the pick stands out vs. the full universe\n• Optimal Straight: the best ordering for straight play\n\nPicks with Energy 65+ are HOT. 80+ is BLAZING.' },
      { title: 'How to Use It', body: '1. Open HitMaster before your state\'s draw time\n2. Check the K6 Slate for your session (Midday or Evening)\n3. Find your state\'s picks — or use All Day for the combined slate\n4. Play the top picks as Box bets at your local lottery retailer\n5. After the draw, check Results to see if your picks hit' },
      { title: 'Managing Expectations', body: 'HitMaster provides data-driven analysis to help you make smarter picks — it is NOT a guarantee of winning. The lottery is a game of chance. ZK6 identifies statistical patterns and signal convergence, but every draw is independent. Play responsibly, within your means.' },
    ],
  },
];

export default function LearnScreen() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const activeModule = LEARN_MODULES.find(m => m.id === activeId) ?? null;

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <View style={s.layout}>
        {/* ── Module list (sidebar) ── */}
        <View style={s.sidebar}>
          <View style={s.sidebarHeader}>
            <Text style={s.sidebarTitle}>🎓 <Text style={{ color: theme.colors.primary }}>Learn to Play</Text></Text>
            <Text style={s.sidebarSub}>Pick 3 from zero to pro player</Text>
          </View>

          <ScrollView style={s.moduleList}>
            {LEARN_MODULES.map(m => {
              const on = activeId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[s.moduleRow, on && s.moduleRowOn]}
                  onPress={() => { setActiveId(m.id); setExpandedSection(null); }}
                >
                  <Text style={{ fontSize: 20, flexShrink: 0 }}>{m.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.moduleTitle, on && { color: theme.colors.primary }]}>{m.title}</Text>
                    <Text style={s.moduleSummary} numberOfLines={2}>{m.summary}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Quick tip */}
            <View style={s.quickTip}>
              <Text style={s.quickTipLabel}>💡 Quick Tip</Text>
              <Text style={s.quickTipText}>Always play BOX on new picks. Once you're comfortable, add straight plays for bigger payouts.</Text>
            </View>
          </ScrollView>
        </View>

        {/* ── Content panel ── */}
        <View style={s.panel}>
          {!activeModule ? (
            /* Welcome page */
            <ScrollView contentContainerStyle={s.welcomeContent}>
              <View style={s.welcomeHero}>
                <Text style={{ fontSize: 52, marginBottom: 10 }}>🎓</Text>
                <Text style={s.welcomeTitle}>New to Pick 3?</Text>
                <Text style={s.welcomeDesc}>
                  Most players only know how to play at their local store in their home state. We'll teach you everything — from buying your first ticket to understanding ZK6 picks — in plain English.
                </Text>
              </View>

              <View style={s.modulesGrid}>
                {LEARN_MODULES.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={s.moduleCard}
                    onPress={() => { setActiveId(m.id); setExpandedSection(null); }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</Text>
                    <Text style={s.moduleCardTitle}>{m.title}</Text>
                    <Text style={s.moduleCardSummary}>{m.summary}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <LinearGradient colors={[theme.colors.primaryLight, theme.colors.cosmicLight]} style={s.ctaCard}>
                <Text style={s.ctaTitle}>Ready to get your picks?</Text>
                <Text style={s.ctaDesc}>Once you understand the basics, your daily K6 Slate is waiting.</Text>
                <TouchableOpacity
                  style={s.ctaBtn}
                  onPress={() => { setActiveId('zk6-for-you'); setExpandedSection(null); }}
                >
                  <Text style={s.ctaBtnText}>Start with ZK6 ⚡</Text>
                </TouchableOpacity>
              </LinearGradient>
            </ScrollView>
          ) : (
            /* Module detail */
            <ScrollView contentContainerStyle={s.moduleContent}>
              <TouchableOpacity style={s.backBtn} onPress={() => setActiveId(null)}>
                <Text style={s.backBtnText}>← All Topics</Text>
              </TouchableOpacity>

              <View style={s.moduleHero}>
                <Text style={{ fontSize: 40 }}>{activeModule.icon}</Text>
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
                    <Text style={[s.sectionTitle, expandedSection === i && { color: theme.colors.primary }]}>
                      {section.title}
                    </Text>
                    <Text style={s.sectionArrow}>{expandedSection === i ? '▲' : '▼'}</Text>
                  </View>
                  {expandedSection === i && (
                    <Text style={s.sectionBody}>{section.body}</Text>
                  )}
                </TouchableOpacity>
              ))}

              {/* Regions — Pro teaser */}
              {activeId === 'regions-states' && (
                <LinearGradient colors={[theme.colors.cosmicLight, theme.colors.goldLight]} style={s.proTeaser}>
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>🔐</Text>
                  <Text style={s.proTeaserTitle}>Pro Secret: Play All States Nationwide</Text>
                  <Text style={s.proTeaserDesc}>Did you know you can legally play Pick 3 in multiple states from your home? Pro members unlock our curated guide showing exactly how.</Text>
                  <TouchableOpacity style={s.proTeaserBtn} onPress={() => router.push('/paywall')}>
                    <Text style={s.proTeaserBtnText}>Unlock with Pro ♛</Text>
                  </TouchableOpacity>
                </LinearGradient>
              )}

              <TouchableOpacity style={s.backBtnBottom} onPress={() => setActiveId(null)}>
                <Text style={s.backBtnText}>← All Topics</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  layout: { flex: 1, flexDirection: 'row' },

  sidebar: { width: 230, backgroundColor: theme.colors.surface, borderRightWidth: 1, borderRightColor: theme.colors.border },
  sidebarHeader: { padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  sidebarTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.text, marginBottom: 2 },
  sidebarSub: { fontSize: 11, color: theme.colors.textTertiary },
  moduleList: { flex: 1, padding: 8 },

  moduleRow: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 11, marginBottom: 4, borderWidth: 1, borderColor: 'transparent' },
  moduleRowOn: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '33' },
  moduleTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginBottom: 2 },
  moduleSummary: { fontSize: 10, color: theme.colors.textTertiary, lineHeight: 14 },

  quickTip: { backgroundColor: theme.colors.goldLight, borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: theme.colors.gold + '33' },
  quickTipLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.gold, marginBottom: 3 },
  quickTipText: { fontSize: 10, color: theme.colors.textSecondary, lineHeight: 15 },

  panel: { flex: 1, backgroundColor: theme.colors.background },

  welcomeContent: { padding: 20, paddingBottom: 32 },
  welcomeHero: { alignItems: 'center', paddingBottom: 20 },
  welcomeTitle: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginBottom: 8 },
  welcomeDesc: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', maxWidth: 380, lineHeight: 20 },
  modulesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  moduleCard: { flex: 1, minWidth: 140, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 14, ...theme.shadows.glow },
  moduleCardTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  moduleCardSummary: { fontSize: 11, color: theme.colors.textSecondary, lineHeight: 16 },
  ctaCard: { borderRadius: theme.borderRadius.xl, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary + '33' },
  ctaTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  ctaDesc: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 12 },
  ctaBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 18, paddingVertical: 9, borderRadius: theme.borderRadius.lg },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  moduleContent: { padding: 22, paddingBottom: 40 },
  backBtn: { marginBottom: 16 },
  backBtnBottom: { marginTop: 16 },
  backBtnText: { fontSize: 13, color: theme.colors.textSecondary },
  moduleHero: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 20 },
  moduleTitleLg: { fontSize: 20, fontWeight: '900', color: theme.colors.text, marginBottom: 4 },
  moduleSummaryLg: { fontSize: 13, color: theme.colors.textSecondary },

  sectionCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10, overflow: 'hidden', ...theme.shadows.glow },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, flex: 1 },
  sectionArrow: { fontSize: 11, color: theme.colors.textTertiary },
  sectionBody: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 22, padding: 14, paddingTop: 0 },

  proTeaser: { borderRadius: theme.borderRadius.xl, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.primary + '44', marginTop: 4, borderStyle: 'dashed' },
  proTeaserTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
  proTeaserDesc: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  proTeaserBtn: { backgroundColor: theme.colors.gold, paddingHorizontal: 18, paddingVertical: 9, borderRadius: theme.borderRadius.lg },
  proTeaserBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
