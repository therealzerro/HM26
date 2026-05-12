import React from 'react';
import {
  RefreshControl as RNRefreshControl,
  RefreshControlProps,
  Platform,
} from 'react-native';
import { theme } from '@/constants/theme';

/**
 * Neon-themed pull-to-refresh.
 * - iOS: cyan tintColor
 * - Android: cyan + purple + rose Material spinner with surface2 background
 */
export function NeonRefreshControl(props: RefreshControlProps) {
  return (
    <RNRefreshControl
      {...props}
      tintColor={Platform.OS === 'ios' ? theme.colors.cyan : undefined}
      titleColor={theme.colors.textSecondary}
      colors={
        Platform.OS === 'android'
          ? [theme.colors.cyan, theme.colors.purple, theme.colors.rose]
          : undefined
      }
      progressBackgroundColor={
        Platform.OS === 'android' ? theme.colors.surface2 : undefined
      }
    />
  );
}

export default NeonRefreshControl;
