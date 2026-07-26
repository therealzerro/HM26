import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Card, useSt } from './AdminShared';
import {
  getStoredAdminKey,
  setStoredAdminKey,
  clearStoredAdminKey,
  unlockAdminOpsWithPin,
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
  const [pin, setPin] = useState('');
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

  // SEC-05 quick unlock: 4-digit code → server exchanges it for the ops key
  // (rate-limited server-side) → stored locally → normal probe.
  const submitPin = useCallback(async () => {
    if (pin.trim().length < 4) return;
    setState('verifying');
    setErr(null);
    try {
      await unlockAdminOpsWithPin(pin.trim());
      setPin('');
      await probe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('locked');
    }
  }, [pin, probe]);

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
          Operator writes are gated by a server-side secret, stored locally on this
          device only. Quick unlock with your 4-digit code, or paste the full{' '}
          <Text style={{ fontFamily: theme.typography.fontFamily.mono, color: colors.text }}>ADMIN_OPS_KEY</Text>.
        </Text>

        <Text style={st.fieldLabel}>QUICK UNLOCK — 4-DIGIT CODE</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <TextInput
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={8}
            placeholder="••••"
            placeholderTextColor={colors.textTertiary}
            onSubmitEditing={submitPin}
            style={{
              flex: 1,
              borderWidth: 1.5,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 12,
              fontSize: 16,
              letterSpacing: 6,
              color: colors.text,
              backgroundColor: colors.surface,
            }}
          />
          <TouchableOpacity
            style={[st.btnPrimary, { paddingHorizontal: 18, justifyContent: 'center' }, (pin.trim().length < 4 || state === 'verifying') && { opacity: 0.5 }]}
            disabled={pin.trim().length < 4 || state === 'verifying'}
            onPress={submitPin}
          >
            <Text style={st.btnPrimaryText}>{state === 'verifying' ? '…' : 'Unlock'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={st.fieldLabel}>OR PASTE THE FULL KEY</Text>
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
