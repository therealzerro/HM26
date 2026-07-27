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

export type ReelKind = 'allday_pro' | 'allday_free' | 'verify';
export type ReelStatus = 'ready' | 'posted' | 'archived';

export interface MarketingReel {
  id: string;
  reel_date: string;
  kind: ReelKind;
  video_path: string;
  video_1x1_path: string | null;
  sheet_path: string | null;
  duration_s: number | null;
  caption: string;
  status: ReelStatus;
  posted_at: string | null;
  target_name: string | null;
  created_at: string;
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
 * Web download: the storage endpoint serves CORS `*`, so fetch → blob →
 * object-URL keeps the `download` attribute working cross-origin (a bare
 * anchor to another origin ignores it and navigates instead).
 */
export async function downloadReelWeb(videoUrl: string, filename: string): Promise<void> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Video download failed (HTTP ${res.status}).`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
