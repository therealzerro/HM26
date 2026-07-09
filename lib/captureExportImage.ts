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
/**
 * Navy background reserved BELOW the public-export CTA banner, in output px.
 * Facebook Reels overlays its UI (caption, share buttons, account handle)
 * inside the bottom ~220px of the frame, so the banner is positioned at
 * 1550–1700 with this buffer occupying 1700–1920 to keep the CTA legible.
 * Pro exports have neither a banner nor this buffer.
 */
export const BANNER_SAFE_BUFFER = 220;

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
 * Resolve a react-native-web `View` ref to its underlying DOM node. Returns
 * null on native or if the ref isn't mounted. Shared by the brief save flow
 * (mirror of the image-export getStageNode helper).
 */
export function resolveWebNode(ref: { current: any } | null | undefined): HTMLElement | null {
  if (Platform.OS !== 'web' || !ref) return null;
  const cur: any = ref.current;
  if (!cur) return null;
  if (cur instanceof HTMLElement) return cur;                       // RN-Web: ref is the DOM node
  if (typeof cur.getBoundingClientRect === 'function') return cur as HTMLElement;
  return null;
}

/**
 * Capture a DOM node as a PNG at its NATURAL on-screen size (unlike
 * captureNodeToPng, which forces the 1080×1920 reel frame). Used by the brief
 * cards, which render inline at a variable height. Returns a PNG dataURL.
 *
 * Throws on native; callers must guard with `captureAvailable()` first.
 */
export async function captureNodeToPngNatural(node: HTMLElement, pixelRatio = 2): Promise<string> {
  if (!captureAvailable()) {
    throw new Error('Image capture is web-only in this build. Open HitMaster on the web to save.');
  }
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    throw new Error(`Capture node has zero dimensions (${rect.width}×${rect.height}).`);
  }
  const { toPng } = await import('html-to-image');
  return toPng(node, { cacheBust: true, pixelRatio, backgroundColor: '#ffffff' });
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

// ─── Web Share (Save to Photos via native share sheet) ───────────────────────
// On iOS Safari / Android Chrome the Web Share API can hand a File off to the
// system share sheet, which exposes a "Save Image" target that routes the PNG
// directly into Photos / Gallery — bypassing the Files-app round-trip the
// Download button requires. Falls back transparently: the caller only renders
// the button when shareToPhotosAvailable() returns true.

/** Decode a base64 dataURL into a File suitable for navigator.share(). */
function dataUrlToFile(dataUrl: string, filename: string, type = 'image/png'): File {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type });
}

/**
 * True if the current browser supports Web Share API with file attachments
 * (iOS Safari 15+, Android Chrome 89+, macOS Safari 14+). Returns false on
 * desktop browsers without share-with-files (Firefox, older Chrome) and on
 * native (React Native) builds. Safe to call repeatedly — does a cheap
 * canShare() probe with a 1-byte File.
 */
export function shareToPhotosAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?:    (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Sentinel error type the caller can check with `err.name === 'AbortError'`
 * — the Web Share API throws AbortError when the user dismisses the share
 * sheet, which is a normal flow and should be swallowed silently.
 */
export async function shareDataUrlToPhotos(
  dataUrl: string,
  filename: string,
  title = 'HitMaster Slate Image',
): Promise<void> {
  if (!shareToPhotosAvailable()) {
    throw new Error('Web Share API with files is not available in this browser.');
  }
  const file = dataUrlToFile(dataUrl, filename);
  const nav = navigator as Navigator & {
    share: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  await nav.share({ files: [file], title, text: '' });
}

/**
 * True if the browser can share MULTIPLE files via the Web Share API — the
 * capability behind one-tap "share all images to the Facebook app" (iOS Safari,
 * Android Chrome). Some browsers support single-file share but not multi; this
 * probes with a 2-file set so callers know which flow to offer.
 */
export function shareMultiFilesAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[] }) => Promise<void>;
  };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    const a = new File([new Uint8Array([0])], 'a.png', { type: 'image/png' });
    const b = new File([new Uint8Array([0])], 'b.png', { type: 'image/png' });
    return nav.canShare({ files: [a, b] });
  } catch {
    return false;
  }
}

/**
 * Hand a whole image set to the OS share sheet in one gesture — the closest
 * compliant path to "post everything to Facebook at once" (Groups have no
 * publish API; the operator still picks the group and pastes the caption inside
 * the FB app, since Meta prohibits prefilled captions). Throws AbortError when
 * the user dismisses the sheet (normal — swallow it).
 */
export async function shareDataUrlsToApps(
  items: { dataUrl: string; filename: string }[],
  title = 'HitMaster',
): Promise<void> {
  if (items.length === 0) throw new Error('No images to share.');
  const files = items.map(it => dataUrlToFile(it.dataUrl, it.filename));
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  if (typeof nav.share !== 'function') throw new Error('Web Share API not available in this browser.');
  if (typeof nav.canShare === 'function' && !nav.canShare({ files })) {
    throw new Error('This image set cannot be shared here (too large, or multi-file share unsupported).');
  }
  await nav.share({ files, title });
}
