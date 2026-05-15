import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  testID?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

function ErrorFallback({ message, testID }: { message: string; testID: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.hint}>Please try again or navigate back.</Text>
    </View>
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = typeof error === 'object' && error && 'message' in error ? String((error as any).message) : 'Unknown error';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message={this.state.errorMessage ?? 'Unexpected error'}
          testID={this.props.testID ?? 'error-boundary'}
        />
      );
    }

    return this.props.children as React.ReactElement;
  }
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontSize: theme.typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  hint: {
    fontSize: theme.typography.fontSize.sm,
    color: colors.textTertiary,
  },
});
