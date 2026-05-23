/* ============================================================================
   PublicExportBanner
   ----------------------------------------------------------------------------
   Static brand banner appended to the bottom of every PUBLIC image export
   (1080×~150 region of a 1080×1920 PNG).

   This is the single source of truth for CTA copy/styling in exports.
   Banner content changes require a code edit here — intentional, prevents
   accidental drift on a public-facing surface.
   ============================================================================ */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface PublicExportBannerProps {
  /** Fixed banner height in pixels (default 150 per spec). */
  height?: number;
}

export function PublicExportBanner({ height = 150 }: PublicExportBannerProps) {
  return (
    <View style={[styles.banner, { height }]}>
      <View style={styles.topRule} />
      <View style={styles.content}>
        <Text style={styles.text} numberOfLines={1}>
          <Text style={styles.primary}>FULL SLATE INSIDE</Text>
          <Text style={styles.divider}>  ·  </Text>
          <Text style={styles.cta}>JOIN THE FREE COMMUNITY</Text>
          <Text>  </Text>
          <Text style={styles.bolt}>⚡</Text>
        </Text>
      </View>
    </View>
  );
}

const NAVY  = '#0A1525';
const WHITE = '#FFFFFF';
const CYAN  = '#00D4FF';
const GOLD  = '#FFD700';

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    backgroundColor: NAVY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRule: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1.5,
    backgroundColor: CYAN,
    opacity: 0.55,
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  primary: {
    color: WHITE,
  },
  divider: {
    color: WHITE,
    opacity: 0.6,
  },
  cta: {
    color: CYAN,
  },
  bolt: {
    color: GOLD,
    fontSize: 26,
  },
});
