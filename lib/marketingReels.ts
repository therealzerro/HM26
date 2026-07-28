/**
 * marketingReels — client for the MKT-04 reel publishing chain.
 *
 * The reel pipelines (npm run reel:allday / reel:verify) upload finished
 * finals to the public `marketing-reels` bucket and register them in the
 * marketing_reels table (service role, scripts/publish-reels.ts). This module
 * is the app-side counterpart: anon reads of the registry, public-URL
 * construction, the native share-sheet handoff, and the posted-status write
 * (which goes through the admin-ops gateway — SEC-05, no anon writes).
 */

import Constants from 'expo-constants';
import { fetchFromSupabase } from '@/lib/supabase';
import { adminOpsFetch } from '@/lib/adminOps';

const extra = Constants.expoConfig?.extra || {};
const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;

// MKT-13: session kinds are pro-only (the free group gets midday/evening
// redacted). Mirrors the marketing_reels_kind_check constraint — adding one
// here without widening that CHECK makes the publisher fail at upsert.
export type ReelKind = 'allday_pro' | 'allday_free' | 'verify' | 'midday_pro' | 'evening_pro';
export type ReelStatus = 'ready' | 'posted' | 'archived';

export interface MarketingReel {
  id: string;
  reel_date: string;
  kind: ReelKind;
  video_path: string;
  video_1x1_path: string | null;
  sheet_path: string | null;
  duration_s: number | null;
  caption: string;              // free-group draft
  caption_pro: string | null;   // pro-group draft (verify rows only — MKT-05b)
  status: ReelStatus;
  posted_at: string | null;
  target_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Public storage URL for a bucket-relative path (bucket is public-read). */
export function reelPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/marketing-reels/${path}`;
}

/** Newest first; archived rows (pruned storage) are noise here. */
export async function fetchReels(limit = 30): Promise<MarketingReel[]> {
  return await fetchFromSupabase<MarketingReel[]>({
    path: `/rest/v1/marketing_reels?status=neq.archived&order=reel_date.desc,kind.asc&limit=${limit}`,
  });
}

/** Record the handoff on the row (admin-ops gateway; service-role upstream). */
export async function markReelPosted(id: string, targetName: string): Promise<void> {
  await adminOpsFetch({
    path: `/rest/v1/marketing_reels?id=eq.${id}`,
    method: 'PATCH',
    body: {
      status: 'posted',
      posted_at: new Date().toISOString(),
      target_name: targetName,
      updated_at: new Date().toISOString(),
    },
    prefer: 'return=minimal',
  });
}

/**
 * Native share: pull the mp4 into the app cache, then hand the FILE to the
 * OS share sheet (Facebook needs a local file — it cannot ingest a URL from
 * the sheet). Caller copies the caption to the clipboard first, same
 * assisted-lane contract as the PublishView image flow.
 */
export async function shareReelToApps(videoUrl: string, filename: string): Promise<void> {
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync().catch(() => false))) {
    throw new Error('Share sheet unavailable in this runtime — use the desktop Prep & Open flow.');
  }
  const FileSystem = await import('expo-file-system/legacy');
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const dl = await FileSystem.downloadAsync(videoUrl, dest);
  if (dl.status !== 200) throw new Error(`Video download failed (HTTP ${dl.status}).`);
  await Sharing.shareAsync(dl.uri, { mimeType: 'video/mp4', dialogTitle: 'HitMaster ZK6' });
}

/**
 * Native: save the reel into the camera roll. This is the RELIABLE Facebook
 * path — the FB app frequently drops a video handed over via the share sheet
 * (composer opens without it preloaded), but attaching from Photos always
 * works. Mirrors saveDataUrlToPhotos: writeOnly permission → cache download →
 * createAssetAsync (returns the asset, so a resolved call is proof the video
 * is really in the roll).
 */
export async function saveReelToPhotos(videoUrl: string, filename: string): Promise<void> {
  const MediaLibrary = await import('expo-media-library');
  const FileSystem = await import('expo-file-system/legacy');
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('Photos access denied — allow "Add Photos" for HitMaster in iOS Settings.');
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const dl = await FileSystem.downloadAsync(videoUrl, dest);
  if (dl.status !== 200) throw new Error(`Video download failed (HTTP ${dl.status}).`);
  const asset = await MediaLibrary.createAssetAsync(dl.uri);
  if (!asset?.id) throw new Error(`Photos did not accept ${filename}.`);
}

/**
 * ── Web lane (two-step by necessity) ─────────────────────────────────────────
 * Browsers only honor window.open / anchor-download / navigator.share inside a
 * user gesture's transient-activation window, and an ~8MB video fetch outlives
 * it — the original one-tap flow fetched first and then silently lost the
 * download AND the group tab (operator-reported 7/27). So the web flow is:
 * step 1 fetches the blob into state (no gesture-sensitive API involved),
 * step 2's actions run on a FRESH tap with the file already in memory.
 */

/** Step 1: pull the mp4 into memory. Storage serves CORS `*` (verified). */
export async function fetchReelBlob(videoUrl: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(videoUrl);
  } catch (e) {
    throw new Error(`Video fetch failed (network/CORS): ${String(e instanceof Error ? e.message : e)}`);
  }
  if (!res.ok) throw new Error(`Video fetch failed (HTTP ${res.status}).`);
  return await res.blob();
}

/**
 * Can this browser hand a VIDEO FILE to the native share sheet? True on iOS
 * Safari 15+ and Android Chrome — where the sheet includes "Save Video"
 * (→ Photos) and direct app targets like Facebook. This IS the web
 * save-to-photos path. Probed with an mp4 File specifically: image-file
 * support (shareMultiFilesAvailable) does not imply video-file support.
 */
export function canWebShareVideo(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean; share?: unknown };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [new File([new Uint8Array([0])], 'probe.mp4', { type: 'video/mp4' })] });
  } catch {
    return false;
  }
}

/** Step 2a (fresh tap): native sheet with the real file — Save Video / FB. */
export async function webShareReel(blob: Blob, filename: string): Promise<void> {
  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share: (d: { files?: File[]; title?: string }) => Promise<void>;
  };
  const files = [new File([blob], filename, { type: 'video/mp4' })];
  if (typeof nav.canShare === 'function' && !nav.canShare({ files })) {
    throw new Error('This browser cannot share video files — use Download instead.');
  }
  await nav.share({ files, title: 'HitMaster ZK6' });
}

/** Step 2b (fresh tap): object-URL anchor download — the desktop path. */
export function downloadReelBlobWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
