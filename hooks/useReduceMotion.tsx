import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Subscribes to the OS "Reduce Motion" accessibility setting.
 * Returns `true` when the user has asked for reduced motion (iOS Settings →
 * Accessibility → Motion → Reduce Motion; Android Settings → Accessibility →
 * Remove animations). Components should skip looping animations and snap
 * animated values to their stable final state when this returns true.
 *
 * Web: AccessibilityInfo doesn't fully implement reduceMotion on RN Web in
 * all SDKs; we still call the API (returns false on unsupported platforms)
 * and fall back to the OS-level prefers-reduced-motion media query when
 * available.
 */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(v => { if (mounted) setEnabled(!!v); })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (v: boolean) => { if (mounted) setEnabled(!!v); },
    );

    // Web fallback — listen to prefers-reduced-motion media query if the
    // RN polyfill doesn't fire reduceMotionChanged.
    let mq: MediaQueryList | null = null;
    let mqHandler: ((e: MediaQueryListEvent) => void) | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.matches) setEnabled(true);
      mqHandler = (e: MediaQueryListEvent) => setEnabled(!!e.matches);
      mq.addEventListener?.('change', mqHandler);
    }

    return () => {
      mounted = false;
      sub?.remove?.();
      if (mq && mqHandler) mq.removeEventListener?.('change', mqHandler);
    };
  }, []);

  return enabled;
}
