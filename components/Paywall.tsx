import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { theme } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { BrandMark } from '@/components/BrandMark';

const PLANS = [
  { id: '5day', label: '5-Day Trial', price: '$4.99', period: '5 days', badge: 'TRY IT', highlight: false },
  { id: 'monthly', label: 'Oracle+ Monthly', price: '$9.99', period: 'per month', badge: 'POPULAR', highlight: true },
  { id: 'annual', label: 'Oracle+ Annual', price: '$89.99', period: 'per year', badge: 'BEST VALUE', highlight: false },
];

const PRO_BENEFITS = [
  '⚡ All 6 K6 Slate picks daily',
  '✦ Optimal straight per pick',
  '🔥 Unlimited Heat Checks',
  '📊 Full pattern depth analytics',
  '💰 Budget Pick tool',
  '📖 Number Book (unlimited lists)',
  '📋 Full hit history & stats',
  '🔔 Live slate update alerts',
];

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
}

export function Paywall({ visible, onClose }: PaywallProps) {
  const { setRole } = useAuth();
  const [selected, setSelected] = useState('monthly');
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    await new Promise<void>(r => setTimeout(r, 800));
    await setRole('premium');
    setLoading(false);
    onClose();
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={() => {}}>
          <View style={s.handle} />
          <ScrollView contentContainerStyle={s.body}>
            {/* Header — brand mark replaces the generic 🏆 emoji at the
                conversion moment so the upgrade ask is anchored to HitMaster,
                not a generic trophy. */}
            <View style={s.header}>
              <BrandMark size="lg" style={{ marginBottom: 10 }} />
              <Text style={s.title}>Unlock Oracle+</Text>
              <Text style={s.subtitle}>Join 2,400+ players using ZK6 intelligence daily</Text>
            </View>

            {/* Benefits */}
            <View style={s.benefits}>
              {PRO_BENEFITS.map((b, i) => (
                <View key={i} style={s.benefitRow}>
                  <Text style={s.benefitText}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Plan selector */}
            <View style={s.plansRow}>
              {PLANS.map(plan => (
                <TouchableOpacity
                  key={plan.id}
                  style={[s.planCard, selected === plan.id && s.planCardOn, plan.highlight && s.planCardHighlight]}
                  onPress={() => setSelected(plan.id)}
                  activeOpacity={0.85}
                >
                  {plan.highlight && (
                    <View style={s.popularBadge}>
                      <Text style={s.popularBadgeText}>{plan.badge}</Text>
                    </View>
                  )}
                  <Text style={[s.planPrice, selected === plan.id && { color: theme.colors.primary }]}>
                    {plan.price}
                  </Text>
                  <Text style={s.planPeriod}>{plan.period}</Text>
                  {!plan.highlight && (
                    <Text style={s.planBadge}>{plan.badge}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={[s.cta, loading && { opacity: 0.7 }]}
              onPress={handleSubscribe}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={s.ctaText}>
                {loading ? 'Processing…' : '♛ Start Oracle+ Now'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.restoreBtn} onPress={onClose}>
              <Text style={s.restoreBtnText}>Restore Purchase · Cancel</Text>
            </TouchableOpacity>

            <Text style={s.legal}>
              For entertainment purposes only. Not financial advice. Play responsibly. 1-800-GAMBLER
            </Text>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#1E1B4B66',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceMuted,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  body: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center' },
  benefits: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginBottom: 16,
    gap: 6,
  },
  benefitRow: {},
  benefitText: { fontSize: 13, color: theme.colors.text, fontWeight: '500' },
  plansRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  planCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  planCardOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  planCardHighlight: {
    borderColor: theme.colors.gold,
  },
  popularBadge: {
    backgroundColor: theme.colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    marginBottom: 4,
  },
  popularBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },
  planPrice: { fontSize: 16, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold },
  planPeriod: { fontSize: 9, color: theme.colors.textTertiary },
  planBadge: { fontSize: 8, fontWeight: '700', color: theme.colors.textTertiary, marginTop: 2 },
  cta: {
    backgroundColor: theme.colors.cosmic,
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
    ...theme.shadows.glow,
  },
  ctaText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  restoreBtn: { alignItems: 'center', padding: 8 },
  restoreBtnText: { fontSize: 12, color: theme.colors.textSecondary },
  legal: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
