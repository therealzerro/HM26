/* ============================================================================
   captureExportImage — admin image-export pipeline
   ----------------------------------------------------------------------------
   Web-only. The admin operator runs HitMaster on the web for this feature;
   native (iOS) capture would require react-native-view-shot, which is a
   native module that requires an EAS dev build. The screen surfaces a clear
   error if invoked on native.

   Pipeline:
     1. The admin screen renders a sequence of composite views (slate +
        banner | pick + banner) into a hidden capture viewport at exactly
        1080×1920px.
     2. captureNode() reads the underlying DOM node from a ref and uses
        html-to-image to produce a PNG dataURL.
     3. downloadPng() triggers a browser download with the structured
        filename.
   ============================================================================ */
import { Platform } from 'react-native';

export const EXPORT_WIDTH  = 1080;
export const EXPORT_HEIGHT = 1920;
export const BANNER_HEIGHT = 150;

export type ExportType    = 'public' | 'pro';
export type ExportSession = 'midday' | 'evening' | 'allday';

export function buildFilename(opts: {
  type: ExportType;
  session: ExportSession;
  date: string;        // YYYY-MM-DD
  name: string;        // "slate" | "pick-1" .. "pick-6"
}): string {
  return `hm-${opts.type}-${opts.session}-${opts.date}-${opts.name}.png`;
}

/** True if image capture is available in the current runtime. */
export function captureAvailable(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

/**
 * Capture the given DOM node as a 1080x1920 PNG and trigger a browser download.
 * Returns the dataURL for any preview UI that wants to show a thumbnail.
 *
 * Throws on native (no view-shot dependency installed) — callers must
 * guard with `captureAvailable()` first.
 */
/**
 * Capture the given DOM node as a 1080x1920 PNG and return the dataURL.
 *
 * This function does NOT trigger a download — call `downloadDataUrl()` (or
 * `downloadAllSequential()` for batches) when the operator is ready. Splitting
 * capture from download is what avoids browser batch-download cancellation:
 * mobile Safari and Chrome cancel all-but-the-last when 7 anchor clicks fire
 * in rapid succession, so each download must be a discrete user gesture.
 *
 * Throws on native; callers must guard with `captureAvailable()` first.
 */
export async function captureNodeToPng(node: HTMLElement, filename: string): Promise<string> {
  if (!captureAvailable()) {
    throw new Error('Image export is web-only in this build. Open HitMaster on the web to use this feature.');
  }
  // Diagnostic: blank captures are usually a sign that the node has zero
  // computed dimensions OR was never painted (paint-culled at extreme
  // off-screen positions). Log so the operator can verify in DevTools.
  const rect = node.getBoundingClientRect();
  // eslint-disable-next-line no-console
  console.log('[image-export] capture node rect:', {
    width: rect.width, height: rect.height, x: rect.x, y: rect.y, filename,
  });
  if (rect.width === 0 || rect.height === 0) {
    throw new Error(`Capture node has zero dimensions (${rect.width}×${rect.height}). The stage didn't render — check DevTools.`);
  }
  // Dynamic import keeps the native bundle clean.
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(node, {
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    pixelRatio: 1,
    cacheBust: true,
    // Neutralize the wrapper's translate (which sits the original off-screen)
    // so the captured PNG starts at (0,0) of the output canvas. Without these
    // overrides the painted content lands +5000px on the X axis — i.e. fully
    // outside the 1080-wide output → blank PNG.
    style: {
      transform: 'none',
      transformOrigin: '0 0',
      left: '0',
      top: '0',
    },
  });
  // eslint-disable-next-line no-console
  console.log('[image-export] dataUrl length:', dataUrl.length, 'for', filename);
  return dataUrl;
}

/**
 * Trigger a single browser download for the given dataURL. Safe to call from
 * a user gesture handler (Download button onClick) — discrete clicks won't be
 * blocked as a batch.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Convenience: download a list of dataURL+filename pairs sequentially with a
 * delay between each. Browsers heuristically cancel rapid back-to-back
 * downloads as a suspicious batch; spacing them out (default 900ms) avoids
 * that. Even with the delay this still consumes the operator's "allow
 * multiple downloads" permission once per session.
 */
export async function downloadAllSequential(
  items: { dataUrl: string; filename: string }[],
  delayMs = 900,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    downloadDataUrl(items[i].dataUrl, items[i].filename);
    if (i < items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
