import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMsg { id: number; message: string; type: ToastType }
interface ToastCtx { showToast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });
export function useToast() { return useContext(ToastContext); }

function ToastItem({ toast, onHide }: { toast: ToastMsg; onHide: () => void }) {
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

  const accent = { success: theme.colors.success, error: theme.colors.error, warning: theme.colors.warning, info: theme.colors.purple }[toast.type];
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

const st = StyleSheet.create({
  container: {
    position: 'absolute', left: 16, right: 16, gap: 8, zIndex: 9999,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1, borderColor: theme.colors.borderMed,
    borderLeftWidth: 4,
    paddingHorizontal: 12, paddingVertical: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  iconBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  icon: { fontSize: 11, fontWeight: '900' },
  msg:  { fontSize: 13, color: theme.colors.text, fontWeight: '600', flex: 1, lineHeight: 18 },
});
