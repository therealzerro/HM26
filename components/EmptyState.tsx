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
      {/* 3-ring cosmic illustration */}
      <View style={styles.orbitContainer}>
        {/* Outer ring */}
        <View style={[styles.ring, styles.ring3]} />
        {/* Mid ring */}
        <View style={[styles.ring, styles.ring2]} />
        {/* Inner ring */}
        <View style={[styles.ring, styles.ring1]} />
        {/* Icon center */}
        <View style={styles.iconCenter}>
          <Icon size={28} color={theme.colors.purple} />
        </View>
      </View>

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
  orbitContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderStyle: 'solid',
  },
  ring3: {
    width: 120,
    height: 120,
    borderWidth: 1,
    borderColor: theme.colors.purple + '18',
    backgroundColor: theme.colors.purple + '05',
  },
  ring2: {
    width: 88,
    height: 88,
    borderWidth: 1,
    borderColor: theme.colors.purple + '30',
    backgroundColor: theme.colors.purple + '08',
  },
  ring1: {
    width: 60,
    height: 60,
    borderWidth: 1.5,
    borderColor: theme.colors.purple + '50',
    backgroundColor: theme.colors.purple + '12',
  },
  iconCenter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.purple + '60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontFamily: theme.typography.fontFamily.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
    textAlign: 'center',
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
