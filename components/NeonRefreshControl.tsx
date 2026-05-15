import React from 'react';
import {
  RefreshControl as RNRefreshControl,
  RefreshControlProps,
  Platform,
} from 'react-native';
import { useTheme } from '@/lib/theme';

/**
 * Neon-themed pull-to-refresh.
 * - iOS: cyan tintColor
 * - Android: cyan + purple + rose Material spinner with surface2 background
 */
export function NeonRefreshControl(props: RefreshControlProps) {
  const { colors } = useTheme();
  return (
    <RNRefreshControl
      {...props}
      tintColor={Platform.OS === 'ios' ? colors.cyan : undefined}
      titleColor={colors.textSecondary}
      colors={
        Platform.OS === 'android'
          ? [colors.cyan, colors.purple, colors.rose]
          : undefined
      }
      progressBackgroundColor={
        Platform.OS === 'android' ? colors.surface2 : undefined
      }
    />
  );
}

export default NeonRefreshControl;
