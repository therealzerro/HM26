import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { LucideIcon } from 'lucide-react-native';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Icon size={56} color={theme.colors.purple + '55'} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontFamily: theme.typography.fontFamily.semibold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: theme.typography.fontSize.sm,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  action: {
    marginTop: theme.spacing.lg,
  },
});
