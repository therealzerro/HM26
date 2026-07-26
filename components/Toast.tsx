import React, { createContext, useCallback, useContext, useRef, useState, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens, type ShadowTokens } from '@/lib/theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMsg { id: number; message: string; type: ToastType }
interface ToastCtx { showToast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });
export function useToast() { return useContext(ToastContext); }

function ToastItem({ toast, onHide }: { toast: ToastMsg; onHide: () => void }) {
  const { colors, shadows } = useTheme();
  const st = useMemo(() => makeSt(colors, shadows), [colors, shadows]);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY,  { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 16, duration: 180, useNativeDriver: true }),
      ]).start(() => onHide());
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const accent = { success: colors.success, error: colors.error, warning: colors.warning, info: colors.purple }[toast.type];
  const icon   = { success: '✓', error: '✕', warning: '⚠', info: 'i' }[toast.type];

  return (
    <Animated.View style={[st.toast, { opacity, transform: [{ translateY }], borderLeftColor: accent }]}>
      <View style={[st.iconBadge, { backgroundColor: accent + '22' }]}>
        <Text style={[st.icon, { color: accent }]}>{icon}</Text>
      </View>
      <Text style={st.msg} numberOfLines={2}>{toast.message}</Text>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, shadows } = useTheme();
  const st = useMemo(() => makeSt(colors, shadows), [colors, shadows]);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const insets  = useSafeAreaInsets();
  const counter = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter.current;
    setToasts(t => [...t.slice(-2), { id, message, type }]);
  }, []);

  const hideToast = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={[st.container, { bottom: insets.bottom + 72 }]} pointerEvents="none">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onHide={() => hideToast(t.id)} />)}
      </View>
    </ToastContext.Provider>
  );
}

const makeSt = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  container: {
    position: 'absolute', left: 16, right: 16, gap: 8, zIndex: 9999,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1, borderColor: colors.borderMed,
    borderLeftWidth: 4,
    paddingHorizontal: 12, paddingVertical: 11,
    ...shadows.medium,
  },
  iconBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  icon: { fontSize: 11, fontWeight: '900' },
  msg:  { fontSize: 13, color: colors.text, fontWeight: '600', flex: 1, lineHeight: 18 },
});
