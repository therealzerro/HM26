import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { fetchFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';

/**
 * §1.4 phase 2 — Push notification registration.
 *
 * Requests permission on first call, fetches the Expo push token, and
 * upserts it into `push_tokens` with the user's stored preferences. Does
 * NOT auto-prompt: caller (account.tsx toggle) decides when to ask, so we
 * don't surprise free-tier users on first open.
 *
 * Once registered, sets a notification handler so foreground notifications
 * still show as banners (default RN behavior is to swallow them).
 *
 * Web is a no-op — Expo push tokens are mobile-only.
 */

const DEVICE_ID_KEY = 'push_device_id';
const TOKEN_CACHE_KEY = 'push_token_v1';

// Foreground notification handler — show banner + play sound when active.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface PushPrefs {
  nextDraw: boolean;
  slateReady: boolean;
  hits: boolean;
  promo: boolean;
}

export interface PushState {
  /** Current Expo push token, null until registered. */
  token: string | null;
  /** Permission status: 'granted' | 'denied' | 'undetermined' | 'unsupported'. */
  status: Notifications.PermissionStatus | 'unsupported';
  /** True while requesting permission or fetching token. */
  isRegistering: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Trigger registration flow (asks permission if not yet granted). */
  register: () => Promise<string | null>;
  /** Save the user's per-channel prefs to the row keyed by current token. */
  syncPrefs: (prefs: PushPrefs) => Promise<void>;
}

async function getOrCreateDeviceId(): Promise<string> {
  let id = await storage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await storage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function pickProjectId(): string | undefined {
  const eas = (Constants?.expoConfig as any)?.extra?.eas;
  return eas?.projectId ?? (Constants as any)?.easConfig?.projectId;
}

async function upsertToken(opts: {
  token: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  prefs?: PushPrefs;
}): Promise<void> {
  const appVersion = (Constants?.expoConfig as any)?.version ?? '0.0.0';
  // PostgREST upsert via on_conflict on the primary key (expo_push_token).
  await fetchFromSupabase({
    path: `/rest/v1/push_tokens?on_conflict=expo_push_token`,
    method: 'POST',
    body: {
      expo_push_token: opts.token,
      device_id: opts.deviceId,
      platform: opts.platform,
      app_version: appVersion,
      active: true,
      last_seen_at: new Date().toISOString(),
      ...(opts.prefs ? { prefs: opts.prefs } : {}),
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  });
}

export function usePushNotifications(initialPrefs?: PushPrefs): PushState {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Notifications.PermissionStatus | 'unsupported'>(
    Notifications.PermissionStatus.UNDETERMINED,
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefsRef = useRef<PushPrefs | undefined>(initialPrefs);

  // Track prefs ref so syncPrefs always picks up the latest.
  useEffect(() => { prefsRef.current = initialPrefs; }, [initialPrefs]);

  // On mount, read cached token (if any) and current permission status
  // without prompting. Mobile only.
  useEffect(() => {
    if (Platform.OS === 'web') {
      setStatus('unsupported');
      return;
    }
    (async () => {
      try {
        const cached = await storage.getItem(TOKEN_CACHE_KEY);
        if (cached) setToken(cached);
        const perm = await Notifications.getPermissionsAsync();
        setStatus(perm.status);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    })();
  }, []);

  const register = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      setStatus('unsupported');
      return null;
    }
    if (!Device.isDevice) {
      setError('Push notifications require a physical device (not a simulator).');
      return null;
    }
    setIsRegistering(true);
    setError(null);
    try {
      const projectId = pickProjectId();
      if (!projectId) throw new Error('Missing EAS projectId in app.json.');

      // Ask permission if not yet granted.
      const existing = await Notifications.getPermissionsAsync();
      let finalStatus = existing.status;
      if (existing.status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        finalStatus = req.status;
      }
      setStatus(finalStatus);
      if (finalStatus !== 'granted') {
        setError('Notification permission was not granted.');
        return null;
      }

      // Android requires a channel before tokens dispatch reliably.
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#7c3aed',
        });
      }

      const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
      const value = expoToken.data;
      setToken(value);
      await storage.setItem(TOKEN_CACHE_KEY, value);

      const deviceId = await getOrCreateDeviceId();
      const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
      await upsertToken({
        token: value,
        deviceId,
        platform: platform as 'ios' | 'android' | 'web',
        prefs: prefsRef.current,
      });

      return value;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setIsRegistering(false);
    }
  };

  const syncPrefs = async (next: PushPrefs): Promise<void> => {
    prefsRef.current = next;
    if (!token) return;
    try {
      await fetchFromSupabase({
        path: `/rest/v1/push_tokens?expo_push_token=eq.${encodeURIComponent(token)}`,
        method: 'PATCH',
        body: { prefs: next, last_seen_at: new Date().toISOString() },
        headers: { Prefer: 'return=minimal' },
      });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  return { token, status, isRegistering, error, register, syncPrefs };
}
