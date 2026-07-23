/**
 * goBackSafe — BUG-166: expo-router's router.back() silently no-ops when
 * there is no navigation history (direct URL load, page refresh on web,
 * first navigation after launch), stranding the user on stack screens.
 * Pop when history exists; otherwise replace into the given fallback route.
 */

import { router } from 'expo-router';

type Route = Parameters<typeof router.replace>[0];

export function goBackSafe(fallback: Route = '/(tabs)' as Route): void {
  try {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  } catch {
    router.replace(fallback);
  }
}
