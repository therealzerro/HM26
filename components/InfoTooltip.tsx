import React, { useState, useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';

interface InfoTooltipProps {
  term: string;
  definition: string;
  size?: number;
}

export function InfoTooltip({ term, definition, size = 15 }: InfoTooltipProps) {
  const { colors } = useTheme();
  const tt = useMemo(() => makeTt(colors), [colors]);
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

const makeTt = (colors: ColorTokens) => StyleSheet.create({
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
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
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
