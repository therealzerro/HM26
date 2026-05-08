import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  style,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        styles[size],
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator 
          color={variant === 'secondary' ? theme.colors.primary : theme.colors.background} 
        />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text`]]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.borderRadius.tile,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primary: {
    backgroundColor: theme.colors.purple,
  },
  secondary: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderMed,
  },
  danger: {
    backgroundColor: theme.colors.error,
  },
  small: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  medium: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  large: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    fontFamily: theme.typography.fontFamily.semibold,
  },
  primaryText: {
    color: theme.colors.text,
  },
  secondaryText: {
    color: theme.colors.textSecondary,
  },
  dangerText: {
    color: theme.colors.text,
  },
});