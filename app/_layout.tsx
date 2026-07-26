import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { View, Text, ActivityIndicator, StyleSheet, Image } from "react-native";
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
import { ZK30ViewModeProvider } from "@/lib/zk30/viewMode";
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
  const { colors, scheme } = useTheme();
  const isLight = scheme === 'light';
  const modalScreenOptions = {
    presentation: "modal" as const,
    contentStyle: { backgroundColor: colors.surface2 },
    headerStyle: { backgroundColor: colors.surface2 },
  };

  return (
    <View style={{ flex: 1, backgroundColor: isLight ? 'transparent' : colors.background }}>
      {/* DESIGN-01 remainder 5: status bar icons track the resolved scheme —
          dark scheme → light icons, light scheme → dark icons. */}
      <StatusBar style={isLight ? 'dark' : 'light'} />
      {isLight && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Image
            source={require('@/assets/background_2.png')}
            style={[StyleSheet.absoluteFillObject, { opacity: 0.2 }]}
            resizeMode="cover"
          />
        </View>
      )}
      <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: isLight ? 'transparent' : colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="admin-image-export"
        options={{ title: "Image Export", ...modalScreenOptions }}
      />
      <Stack.Screen
        name="paywall"
        // headerShown:false — the screen renders its own back chevron; the
        // native title bar doubled the header and top inset (DESIGN-02 T0.3)
        options={{ title: "Premium", headerShown: false, ...modalScreenOptions }}
      />
      <Stack.Screen
        name="coming-soon"
        options={{ title: "Coming Soon", ...modalScreenOptions }}
      />
      <Stack.Screen
        name="replay"
        options={{ title: "Replay", headerShown: false, ...modalScreenOptions }}
      />
      <Stack.Screen
        name="track-record"
        options={{ title: "Verified Track Record", headerShown: false, ...modalScreenOptions }}
      />
      <Stack.Screen
        name="pattern-explorer"
        options={{ title: "Pattern Explorer", ...modalScreenOptions }}
      />
      <Stack.Screen
        name="zk30-import"
        options={{
          title: "ZK30 TX Import",
          headerShown: false,
          // Operator screen — full-bleed dark canvas instead of the modal
          // preset other screens use. presentation: "card" makes the screen
          // take the full viewport so the contentStyle background actually
          // covers the global cosmic backdrop instead of letting it bleed
          // through a centered modal frame.
          presentation: "card",
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
    </Stack>
    </View>
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
                        <ZK30ViewModeProvider>
                          <RootLayoutNav />
                        </ZK30ViewModeProvider>
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