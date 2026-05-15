import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { SCOPES } from '@/constants/pairClasses';
import { useScope } from '@/hooks/useScope';
import { Scope } from '@/types/core';

export function ScopeSwitcher() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { scope, setScope } = useScope();

  return (
    <View style={styles.container}>
      {Object.entries(SCOPES).map(([key, config]) => (
        <TouchableOpacity
          key={key}
          style={[
            styles.button,
            scope === key && styles.buttonActive,
          ]}
          onPress={() => setScope(key as Scope)}
          testID={`scope-${key}`}
        >
          <Text style={styles.icon}>{config.icon}</Text>
          <Text style={[
            styles.label,
            scope === key && styles.labelActive,
          ]}>
            {config.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.tile,
    padding: 4,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.chip,
  },
  buttonActive: {
    backgroundColor: colors.purple,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: theme.typography.fontFamily.medium,
  },
  labelActive: {
    color: colors.text,
  },
});