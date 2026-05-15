import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme';

// ─── Intelligence Route View ──────────────────────────────────────────────────
export default function IntelligenceRouteView() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <Text style={{ fontSize: 36 }}>🔬</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' }}>Pattern Intelligence</Text>
      <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 18 }}>
        Deep pick analysis: signal hit rates, rank patterns, draws-since sweet spots, and engine tuning suggestions.
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 }}
        onPress={() => router.navigate('/(tabs)/intelligence')}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Open Intelligence Screen →</Text>
      </TouchableOpacity>
    </View>
  );
}
