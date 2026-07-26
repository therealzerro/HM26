import { useEffect, useRef, useState } from 'react';
import { useReduceMotion } from '@/hooks/useReduceMotion';

/**
 * DESIGN-02 T2 (2.1) — count-up number animation.
 *
 * Returns an integer that animates 0 → `target` over `duration` ms with an
 * ease-out curve, re-running whenever `target` changes. Implemented with
 * requestAnimationFrame (no reanimated dependency) so it works identically
 * on native and web.
 *
 * Respects the OS Reduce Motion setting: when enabled, returns `target`
 * immediately with no animation frames scheduled.
 *
 * Numbers only — callers render the returned value inside their existing
 * <Text>; labels/strings are never animated.
 */
export function useCountUp(target: number, opts?: { duration?: number }): number {
  const duration = opts?.duration ?? 600;
  const reduceMotion = useReduceMotion();
  const [value, setValue] = useState(() => (reduceMotion ? target : 0));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Snap to the final value when animation is unwanted or meaningless.
    if (reduceMotion || !Number.isFinite(target) || target === 0 || duration <= 0) {
      setValue(Number.isFinite(target) ? Math.round(target) : 0);
      return;
    }

    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };

    setValue(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, duration, reduceMotion]);

  return value;
}
