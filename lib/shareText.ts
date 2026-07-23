/**
 * shareTextSafe — cross-platform text share (BTN-AUDIT 2026-07-23).
 *
 * RN's Share.share works natively but on web it rejects (or silently
 * no-ops) when navigator.share is unavailable — desktop browsers and any
 * non-secure context — which made several share buttons look dead. This
 * helper: native → share sheet; web → navigator.share when present, else
 * clipboard copy. Never throws: user cancel returns 'cancelled', and any
 * share failure falls back to a clipboard copy so the tap always does
 * something. Callers can surface a "copied" note when the result is
 * 'copied'.
 */
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled';

export async function shareTextSafe(message: string, title?: string): Promise<ShareOutcome> {
  try {
    if (Platform.OS === 'web') {
      const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
      if (typeof nav?.share === 'function') {
        await nav.share({ text: message, title });
        return 'shared';
      }
      await Clipboard.setStringAsync(message);
      return 'copied';
    }
    await Share.share(title ? { message, title } : { message });
    return 'shared';
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'cancelled';
    try {
      await Clipboard.setStringAsync(message);
      return 'copied';
    } catch {
      return 'cancelled';
    }
  }
}
