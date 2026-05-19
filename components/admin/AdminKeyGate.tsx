import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Card, useSt } from './AdminShared';
import {
  getStoredAdminKey,
  setStoredAdminKey,
  clearStoredAdminKey,
  subscriberAdmin,
  AdminKeyInvalidError,
} from '@/lib/subscriberAdminClient';

/**
 * AdminKeyGate — gates a child view behind the operator entering the
 * ADMIN_OPS_KEY that pairs with the subscriber-admin Edge Function.
 *
 * The key is persisted in AsyncStorage so it survives reloads on the
 * operator's device. It is never bundled into the JS or sent anywhere
 * except as the X-Admin-Key header to the Edge Function.
 */
export function AdminKeyGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const st = useSt();
  const [state, setState] = useState<'loading' | 'unlocked' | 'locked' | 'verifying'>('loading');
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const probe = useCallback(async () => {
    setState('verifying');
    setErr(null);
    try {
      await subscriberAdmin.ping();
      setState('unlocked');
    } catch (e) {
      if (e instanceof AdminKeyInvalidError) {
        setErr('Admin key rejected. Re-enter the ADMIN_OPS_KEY from Supabase.');
        await clearStoredAdminKey();
        setState('locked');
      } else if (e instanceof Error && e.message === 'Admin key not set') {
        setState('locked');
      } else {
        setErr(e instanceof Error ? e.message : String(e));
        setState('locked');
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const k = await getStoredAdminKey();
      if (!k) { setState('locked'); return; }
      await probe();
    })();
  }, [probe]);

  const submit = useCallback(async () => {
    if (!input.trim()) return;
    await setStoredAdminKey(input);
    setInput('');
    await probe();
  }, [input, probe]);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (state === 'unlocked') return <>{children}</>;

  return (
    <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ padding: 20, width: '100%', maxWidth: 480 }}>
        <Text style={[st.title, { marginBottom: 6 }]}>🔐 Admin Ops Key Required</Text>
        <Text style={[st.sub, { marginBottom: 16 }]}>
          Subscriber data is gated by a server-side secret. Enter the value of{' '}
          <Text style={{ fontFamily: 'monospace', color: colors.text }}>ADMIN_OPS_KEY</Text>{' '}
          from the Supabase project secrets. The key is stored locally on this device only.
        </Text>
        <Text style={st.fieldLabel}>Admin Ops Key</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="paste secret here"
          placeholderTextColor={colors.textTertiary}
          style={{
            borderWidth: 1.5,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            color: colors.text,
            backgroundColor: colors.surface,
            marginBottom: 12,
          }}
        />
        {err && (
          <Text style={{ color: colors.error, fontSize: 11, marginBottom: 10 }}>{err}</Text>
        )}
        <TouchableOpacity
          style={[st.btnPrimary, !input.trim() && { opacity: 0.5 }]}
          disabled={!input.trim() || state === 'verifying'}
          onPress={submit}
        >
          <Text style={st.btnPrimaryText}>
            {state === 'verifying' ? 'Verifying…' : 'Unlock'}
          </Text>
        </TouchableOpacity>
      </Card>
    </View>
  );
}

/**
 * Helper for views that want to manually lock back. Currently unused but
 * exposed for a future "sign out of admin ops" affordance.
 */
export async function lockAdminOps() {
  await clearStoredAdminKey();
}
