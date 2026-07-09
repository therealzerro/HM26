/**
 * confirm — cross-platform confirmation dialog.
 *
 * Alert.alert's multi-button dialog is a NO-OP on React Native Web (Expo web):
 * the dialog never renders and the button onPress never fires, so any action
 * gated behind it silently does nothing. This helper uses window.confirm on
 * web (synchronous, reliable) and Alert.alert on native, returning a Promise
 * so callers can `if (!(await confirmAsync(...))) return;`.
 *
 * Single-argument Alert.alert (an info message with no button array) DOES work
 * on web — it maps to window.alert — so those don't need this helper.
 */
import { Alert, Platform } from 'react-native';

export function confirmAsync(
  title: string,
  message?: string,
  opts?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
): Promise<boolean> {
  const confirmLabel = opts?.confirmLabel ?? 'OK';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: opts?.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: opts?.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/** Web-safe info alert (works everywhere, but centralizes the pattern). */
export function alertAsync(title: string, message?: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
