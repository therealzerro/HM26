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
import { theme } from "@/constants/theme";

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
  return (
    <Stack screenOptions={{ 
      headerBackTitle: "Back",
      headerStyle: {
        backgroundColor: '#141824',
      },
      headerTintColor: '#FFFFFF',
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen 
        name="import-wizard" 
        options={{ 
          title: "Import Data",
          presentation: "modal" 
        }} 
      />
      <Stack.Screen 
        name="paywall" 
        options={{ 
          title: "Premium",
          presentation: "modal" 
        }} 
      />
      <Stack.Screen 
        name="coming-soon" 
        options={{ 
          title: "Coming Soon",
          presentation: "modal" 
        }} 
      />
      <Stack.Screen 
        name="settings/test-backend" 
        options={{ 
          title: "Test Backend",
          presentation: "modal" 
        }} 
      />
      <Stack.Screen 
        name="test-slate-data" 
        options={{ 
          title: "Test Slate Data",
          presentation: "modal" 
        }} 
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

  useEffect(() => {
    let mounted = true;
    
    const initApp = async () => {
      try {
        // Add a small delay to prevent hydration timeout
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (mounted) {
          setIsReady(true);
          // Hide splash screen after a short delay to ensure UI is ready
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

    initApp();
    
    return () => {
      mounted = false;
    };
  }, []);

  if (initError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Initialization Error</Text>
        <Text style={styles.errorText}>{initError}</Text>
      </View>
    );
  }

  if (!isReady || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <ScopeProvider>
        <SnapshotProvider>
          <CoverageProvider>
            <DataIngestionProvider>
              <RootLayoutNav />
            </DataIngestionProvider>
          </CoverageProvider>
        </SnapshotProvider>
      </ScopeProvider>
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