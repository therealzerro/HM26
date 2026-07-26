import React, { useState, useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens, type ShadowTokens } from '@/lib/theme';

interface InfoTooltipProps {
  term: string;
  definition: string;
  size?: number;
}

export function InfoTooltip({ term, definition, size = 15 }: InfoTooltipProps) {
  const { colors, shadows } = useTheme();
  const tt = useMemo(() => makeTt(colors, shadows), [colors, shadows]);
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[tt.btn, { width: size, height: size, borderRadius: size / 2 }]}
        onPress={() => setVisible(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={`What is ${term}?`}
        accessibilityRole="button"
        accessibilityHint="Tap to see a definition"
      >
        <Text style={[tt.btnText, { fontSize: Math.round(size * 0.6) }]}>?</Text>
      </TouchableOpacity>

      <Modal
        transparent
        visible={visible}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity style={tt.backdrop} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={tt.card}>
            <Text style={tt.term}>{term}</Text>
            <View style={tt.divider} />
            <Text style={tt.def}>{definition}</Text>
            <TouchableOpacity style={tt.closeBtn} onPress={() => setVisible(false)}>
              <Text style={tt.closeText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const makeTt = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  btn: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: colors.textTertiary,
    fontWeight: '800',
    lineHeight: 16,
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    // scrim stays dark in both modes (LIGHT-01)
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.borderMed,
    padding: 22,
    ...shadows.medium,
  },
  term: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.cyan,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  def: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  closeBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  closeText: {
    // '#fff' on the saturated primary fill is correct in both modes (LIGHT-01)
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
