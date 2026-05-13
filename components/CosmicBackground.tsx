import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';

interface Props {
  // 0–1; default 0.06 keeps the gradient barely visible against the
  // dark background — enough to feel "cosmic", not enough to compete
  // with content readability.
  opacity?: number;
}

/**
 * Subtle full-screen cyan→purple diagonal overlay (enhancements §8.2).
 * Sits at low opacity behind page content, ties screens to the brand
 * gradient palette without overpowering. pointerEvents="none" so taps
 * pass through.
 */
export function CosmicBackground({ opacity = 0.06 }: Props) {
  return (
    <LinearGradient
      colors={theme.gradients.cyanPurple}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFillObject, { opacity }]}
      pointerEvents="none"
    />
  );
}
