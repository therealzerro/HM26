import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

/**
 * Route-level guard for operator-only screens (SEC-05 / QW1, 2026-06-10).
 *
 * The four operator screens are hidden from the tab bar (`href: null` in
 * `app/(tabs)/_layout.tsx`) and their entry buttons are role-gated in
 * `account.tsx`, but the routes themselves were reachable directly via deep
 * link or web-build URL. This wrapper closes that path: nothing renders while
 * the stored role loads, and non-admin roles are redirected to Home.
 *
 * Client-side only — the durable enforcement is the SEC-05 write-path
 * migration (RLS + edge gateway). This raises the bar, it is not the wall.
 */
export function withAdminGate<P extends object>(Screen: React.ComponentType<P>): React.FC<P> {
  return function AdminGated(props: P) {
    const { user, isLoading } = useAuth();
    if (isLoading) return null;
    if (user?.role !== 'admin') return <Redirect href="/(tabs)" />;
    return <Screen {...props} />;
  };
}
