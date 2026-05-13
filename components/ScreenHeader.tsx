import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';

/**
 * Shared screen header (design.md step 3).
 *
 * Unifies the top-of-screen chrome across Home / Slate / Results so
 * subscribers feel they're inside one app, not three. Replaces three
 * distinct header implementations that drifted apart over time.
 *
 * Contract:
 *   - LinearGradient using `theme.gradients.header` (slight vertical fade,
 *     adds depth without being loud).
 *   - Top row: title (with optional subtitle) on the left, optional
 *     `rightSlot` on the right (e.g. tier+streak badges, action buttons).
 *   - Children render INSIDE the gradient below the title row — used for
 *     scope segments, generate controls, anything that belongs in the
 *     header band itself rather than a separate strip below.
 *
 * What's NOT here on purpose: status strips with hash/live-dot, date tab
 * scrollers, results-specific filter pills. Those are below-header bands
 * with their own contracts (and may not appear on every screen).
 */

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({ title, subtitle, rightSlot, children, style }: Props) {
  return (
    <LinearGradient
      colors={theme.gradients.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[s.header, style]}
    >
      <View style={s.topRow}>
        <View style={s.titleCol}>
          {typeof title === 'string' ? <Text style={s.title}>{title}</Text> : title}
          {subtitle != null && (
            typeof subtitle === 'string' ? <Text style={s.subtitle}>{subtitle}</Text> : subtitle
          )}
        </View>
        {rightSlot != null && <View style={s.rightSlot}>{rightSlot}</View>}
      </View>
      {children}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: theme.layout.screenInset,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.text,
    lineHeight: 26,
    fontFamily: theme.typography.fontFamily.bold,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
    fontFamily: theme.typography.fontFamily.mono,
  },
  rightSlot: { alignItems: 'flex-end', gap: 4 },
});
