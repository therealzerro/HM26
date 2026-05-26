// lib/zk30/shareSlate.ts
//
// Capture + share helpers for Phase C3. The Share Slate action sheet in
// app/(tabs)/zk30.tsx routes through these functions so the capture +
// share-sheet plumbing lives outside the rendering code.
//
// View capture uses react-native-view-shot's captureRef. Sharing uses
// expo-sharing (cross-platform — wraps native UIActivityViewController on
// iOS, ACTION_SEND on Android, and falls back to copy-link on web).

import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

export interface CaptureOpts {
  /** Ref-able View whose subtree we want to snapshot as PNG. */
  viewRef: React.RefObject<any>;
  /** PNG file name without extension — appended to the temp dir path. */
  fileName: string;
}

/** Capture a View as a PNG file, return its file:// URI. Web returns a
 *  data: URI since the native temp-file path doesn't exist there. */
export async function captureSlate(opts: CaptureOpts): Promise<string> {
  return captureRef(opts.viewRef, {
    format: 'png',
    quality: 1,
    result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
    fileName: opts.fileName,
  });
}

/** Open the native share sheet for a previously-captured URI. Falls back
 *  to clipboard-copy when sharing isn't available (older Android / web
 *  in environments without Web Share API). */
export async function shareCapturedSlate(uri: string, mimeType = 'image/png'): Promise<void> {
  const available = await Sharing.isAvailableAsync().catch(() => false);
  if (available) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: 'Share ZK30 slate',
    });
    return;
  }
  // Fallback for environments without the share sheet — put the URI on
  // the clipboard so the operator can paste it manually. Better than a
  // silent no-op.
  await Clipboard.setStringAsync(uri).catch(() => {});
}

/** Phase C3 — copy the full slate hash to the clipboard. The chip displays
 *  the first 8 chars but the full hash is what's useful for cross-referencing
 *  in logs / SQL. */
export async function copySlateHash(fullHash: string): Promise<void> {
  await Clipboard.setStringAsync(fullHash);
}
