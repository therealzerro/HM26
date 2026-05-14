import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ScopeProvider } from "@/hooks/useScope";
import { SnapshotProvider } from "@/hooks/useSnapshot";
import { CoverageProvider } from "@/hooks/useCoverage";
import { DataIngestionProvider } from "@/hooks/useDataIngestion";
import { FollowedStatesProvider } from "@/hooks/useFollowedStates";
import { CoffeeModeProvider } from "@/hooks/useCoffeeMode";
import { AppModeProvider } from "@/context/AppModeContext";
import { ToastProvider } from "@/components/Toast";
import { theme } from "@/constants/theme";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 500,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      retryDelay: 500,
      networkMode: 'offlineFirst',
    },
  },
});

function RootLayoutNav() {
  // PHASE IV: modal screens use surface2 so they read as one layer above
  // the underlying tab content. Tab content keeps `background` (deepest).
  // Theme-aware: colors track the active mode from ThemeProvider.
  const { colors } = useTheme();
  const modalScreenOptions = {
    presentation: "modal" as const,
    contentStyle: { backgroundColor: colors.surface2 },
    headerStyle: { backgroundColor: colors.surface2 },
  };

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="import-wizard"
        options={{ title: "Import Data", ...modalScreenOptions }}
      />
      <Stack.Screen
        name="paywall"
        options={{ title: "Premium", ...modalScreenOptions }}
      />
      <Stack.Screen
        name="coming-soon"
        options={{ title: "Coming Soon", ...modalScreenOptions }}
      />
      <Stack.Screen
        name="replay"
        options={{ title: "Replay", ...modalScreenOptions }}
      />
      <Stack.Screen
        name="track-record"
        options={{ title: "Verified Track Record", ...modalScreenOptions }}
      />
    </Stack>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.loadingText}>Loading K-Slate...</Text>
    </View>
  );
}

function AppContent() {
  const { isLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    let mounted = true;

    const initApp = async () => {
      try {
        if (mounted) {
          setIsReady(true);
          setTimeout(() => {
            SplashScreen.hideAsync().catch(console.warn);
          }, 200);
        }
      } catch (error) {
        console.error('App initialization error:', error);
        if (mounted) {
          setInitError(error instanceof Error ? error.message : 'Initialization failed');
        }
      }
    };

    if (fontsLoaded) initApp();

    return () => {
      mounted = false;
    };
  }, [fontsLoaded]);

  if (initError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Initialization Error</Text>
        <Text style={styles.errorText}>{initError}</Text>
      </View>
    );
  }

  if (!fontsLoaded || !isReady || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppModeProvider>
          <ToastProvider>
            <ScopeProvider>
              <SnapshotProvider>
                <CoverageProvider>
                  <DataIngestionProvider>
                    <FollowedStatesProvider>
                      <CoffeeModeProvider>
                        <RootLayoutNav />
                      </CoffeeModeProvider>
                    </FollowedStatesProvider>
                  </DataIngestionProvider>
                </CoverageProvider>
              </SnapshotProvider>
            </ScopeProvider>
          </ToastProvider>
        </AppModeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.container}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text,
    fontWeight: '500' as const,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  errorText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});