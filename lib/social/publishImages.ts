/**
 * publishImages — image capture + slate loading for the Publish console (SOCIAL-01).
 *
 * Reuses the proven admin image-export capture path (lib/captureExportImage):
 * a hidden 1080×1920 reel stage rendered off-screen, read by html-to-image.
 * The fragile bits (transform neutralization, zero-dimension guards) live
 * inside captureNodeToPng, so this module just orchestrates. Web-only, exactly
 * like the exporter — the operator runs admin on the web.
 */

import { Platform } from 'react-native';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';
import type { PickItem } from '@/components/PickCard';
import {
  EXPORT_WIDTH, EXPORT_HEIGHT, BANNER_HEIGHT, BANNER_SAFE_BUFFER,
} from '@/lib/captureExportImage';

export type Surface = 'public' | 'free' | 'pro' | 'cross';
export type SocialSession = 'midday' | 'evening' | 'allday';

// Redaction rule (§6, revised 2026-07-26 — SOCIAL-13): PUBLIC + cross-post
// always get the mosaic-picks variant. The FREE group's Midday/Evening drops
// are ALSO redacted — the All-Day drop is the full free post (pure value, no
// Pro pitch); unredacted session drops are the Pro tier's exclusive. That gap
// is the conversion frame. PRO is never redacted.
export function surfaceRedacts(surface: Surface, session?: SocialSession): boolean {
  if (surface === 'public' || surface === 'cross') return true;
  if (surface === 'free') return session === 'midday' || session === 'evening';
  return false;
}

// Reel-stage geometry — identical to admin-image-export so output matches.
export const STAGE_LOGICAL_WIDTH = 390;
export const STAGE_SCALE = EXPORT_WIDTH / STAGE_LOGICAL_WIDTH;          // ≈ 2.769
export const STAGE_LOGICAL_HEIGHT = EXPORT_HEIGHT / STAGE_SCALE;        // ≈ 693.33
export const LOGICAL_BANNER_HEIGHT = BANNER_HEIGHT / STAGE_SCALE;       // ≈ 54.17
export const LOGICAL_SAFE_BUFFER = BANNER_SAFE_BUFFER / STAGE_SCALE;    // ≈ 79.44

export function logicalPosterHeight(redact: boolean): number {
  return redact
    ? STAGE_LOGICAL_HEIGHT - LOGICAL_BANNER_HEIGHT - LOGICAL_SAFE_BUFFER
    : STAGE_LOGICAL_HEIGHT;
}

function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}

/** Mirror of admin-image-export.rowToPickItem — maps a snapshot row to a PickItem. */
export function rowToPickItem(r: any, idx: number, updatedAt?: string, scope?: string, slateDate?: string): PickItem {
  const combo = r.combo ?? '---';
  const energy = typeof r.energy === 'number' ? r.energy : typeof r.temperature === 'number' ? r.temperature : 0;
  const hitType = r.hitType === 'straight' || r.hitType === 'box' ? r.hitType : undefined;
  return {
    rank: idx + 1,
    combo,
    comboSet: r.comboSet ?? toComboSet(combo),
    bestOrder: r.bestOrder ?? combo,
    energy,
    signals: {
      BOX: Number(r.signals?.BOX ?? r.box ?? r.components?.BOX ?? 0),
      PBURST: Number(r.signals?.PBURST ?? r.pburst ?? r.components?.PBURST ?? 0),
      CO: Number(r.signals?.CO ?? r.co ?? r.components?.CO ?? 0),
      DGC: Number(r.signals?.DGC ?? r.components?.DGC ?? 0),
    },
    multiplicity: r.multiplicity,
    topPair: r.topPair,
    drawsSince: r.drawsSince,
    timesDrawn: r.timesDrawn,
    lastSeen: r.lastSeen,
    locked: false,
    generatedAt: updatedAt,
    snapshotScope: scope,
    hitType,
    hitState: r.hitState ?? r.matched_state ?? undefined,
    hitSession: r.hitSession ?? r.matched_session ?? undefined,
    hitResult: r.hitResult ?? r.actual_result ?? undefined,
    hitDate: r.hitDate ?? r.slate_date ?? slateDate ?? undefined,
  };
}

export interface LoadedSlate {
  picks: PickItem[];
  slateDate: string;
  updatedAt?: string;
}

/** Fetch the latest snapshot for a session and map to PickItems (same query as the exporter). */
export async function loadSlatePicks(session: SocialSession): Promise<LoadedSlate> {
  const rows = await fetchFromSupabase<any[]>({
    path: `/rest/v1/slate_snapshots?select=*&scope=eq.${encodeURIComponent(session)}&deleted_at=is.null&or=(mode.is.null,mode.neq.zk30)&order=updated_at_et.desc&limit=1`,
  });
  const snap = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!snap) throw new Error(`No active snapshot for ${session}. Generate a slate first.`);
  const raw = Array.isArray(snap.top_k_straights_json)
    ? snap.top_k_straights_json
    : (typeof snap.top_k_straights_json === 'string'
        ? (() => { try { return JSON.parse(snap.top_k_straights_json); } catch { return []; } })()
        : []);
  const updatedAt = snap.updated_at_et ?? snap.updated_at ?? snap.created_at;
  const slateDate = typeof snap.slate_date === 'string' ? snap.slate_date : getTodayET();
  const picks = (Array.isArray(raw) ? raw : []).slice(0, 6).map((r: any, i: number) => rowToPickItem(r, i, updatedAt, session, slateDate));
  if (picks.length === 0) throw new Error(`Snapshot for ${session} has no picks.`);
  return { picks, slateDate, updatedAt };
}

// ── capture timing helpers (copied from the exporter — proven blank-safe) ────
export function raf(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      setTimeout(resolve, 32);
    }
  });
}

export async function waitFonts(): Promise<void> {
  try {
    const docAny = globalThis as unknown as { document?: any };
    const fonts = docAny.document?.fonts;
    if (fonts?.ready) await fonts.ready;
  } catch { /* fonts API absent — proceed */ }
}

export function getStageNode(ref: { current: any }): HTMLElement | unknown | null {
  const cur: any = ref?.current;
  if (!cur) return null;
  // Native: react-native-view-shot captures the RN view ref directly.
  if (Platform.OS !== 'web') return cur;
  if (cur instanceof HTMLElement) return cur;
  if (typeof cur.getBoundingClientRect === 'function') return cur as HTMLElement;
  return null;
}
