/**
 * publish-reels — MKT-04: push finished reel finals to Supabase so the admin
 * Reels view can preview + hand them to Facebook from any device.
 *
 * Runs automatically as the last step of `npm run reel:allday` / `reel:verify`.
 * Uploads ONLY the finals (9:16 + 1:1 + contact sheet, ~8-15MB/day) to the
 * public `marketing-reels` bucket and upserts one marketing_reels row per
 * variant with a lint-safe tier-2 caption draft. Re-running a date replaces
 * the files (x-upsert) and resets the row to 'ready' — a re-render IS a new
 * reel, so a stale caption edit or posted flag must not survive it.
 *
 * Retention: rows older than PRUNE_DAYS get their storage objects deleted and
 * flip to status='archived' (the log row itself is kept). Keeps the bucket at
 * a steady few hundred MB.
 *
 * Auth: service role from .env.backtest (same contract as the backfill
 * writer — never logged, never bundled).
 *
 * Captions (MKT-05): built per-run by scripts/reel-captions.ts — creative
 * daily rotation; real verification numbers appear ONLY in the pro caption
 * (operator ruling 2026-07-27, gambling-adjacent safety).
 *
 * Usage: tsx scripts/publish-reels.ts <allday|verify> [YYYYMMDD] [flags]
 *   allday defaults to today ET; verify defaults to yesterday ET — the same
 *   stamps their assemblers write.
 *   --preview        print the captions that would ship, write nothing
 *   --captions-only  refresh captions on existing rows (no uploads, keeps
 *                    status/posted flags — for tweaking after the fact)
 */
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { buildReelCaption, fetchReceiptsData, shiftDate, ReceiptsData } from './reel-captions';

loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SVC_KEY) {
  console.error('[publish-reels] Missing .env.backtest credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const BUCKET = 'marketing-reels';
const PRUNE_DAYS = 30;
const ASSETS = resolve('assets/marketing');

type Kind = 'allday_pro' | 'allday_free' | 'verify';

function etDate(offsetDays: number): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString('en-CA');
}

const mode = process.argv[2];
if (mode !== 'allday' && mode !== 'verify') {
  console.error('Usage: tsx scripts/publish-reels.ts <allday|verify> [YYYYMMDD] [--preview] [--captions-only]');
  process.exit(1);
}
const restArgs = process.argv.slice(3);
const PREVIEW = restArgs.includes('--preview');
const CAPTIONS_ONLY = restArgs.includes('--captions-only');
const stampArg = restArgs.find((a) => !a.startsWith('--'));
const defaultIso = mode === 'verify' ? etDate(-1) : etDate(0);
const stamp = stampArg ?? defaultIso.replace(/-/g, '');
const isoDate = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

interface ReelFiles { kind: Kind; video: string; video1x1: string; sheet: string }

function reelFiles(): ReelFiles[] {
  if (mode === 'verify') {
    const dir = join(ASSETS, 'verify_reels');
    return [{
      kind: 'verify',
      video: join(dir, `verify_reel_${stamp}.mp4`),
      video1x1: join(dir, `verify_reel_${stamp}_1x1.mp4`),
      sheet: join(dir, `verify_reel_${stamp}_contact.png`),
    }];
  }
  const dir = join(ASSETS, 'allday_reels');
  return (['pro', 'free'] as const).map((v) => ({
    kind: `allday_${v}` as Kind,
    video: join(dir, `allday_${v}_${stamp}.mp4`),
    video1x1: join(dir, `allday_${v}_${stamp}_1x1.mp4`),
    sheet: join(dir, `allday_${v}_${stamp}_contact.png`),
  }));
}

function svcHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SVC_KEY!, Authorization: `Bearer ${SVC_KEY}`, ...extra };
}

async function sbGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: svcHeaders() });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/**
 * Captions for this run. Receipts feed the pro captions (real numbers) and
 * the free verify caption (qualitative descriptors only). Receipts date:
 * verify grades its own reel date; allday uses the day before (today's
 * board isn't resolved when the reel ships). A receipts failure degrades to
 * fallbacks — never blocks the upload.
 *
 * Verify rows carry TWO drafts (MKT-05b): `caption` = free group,
 * `caption_pro` = pro group. Allday rows are already split per variant.
 */
interface CaptionSet { caption: string; caption_pro: string | null }

async function buildCaptions(kinds: Kind[]): Promise<Record<string, CaptionSet>> {
  let receipts: ReceiptsData | null = null;
  if (kinds.includes('allday_pro') || kinds.includes('verify')) {
    const receiptsDate = mode === 'verify' ? isoDate : shiftDate(isoDate, -1);
    try {
      receipts = await fetchReceiptsData(receiptsDate, sbGet);
    } catch (e) {
      console.warn('[publish-reels] receipts fetch failed — captions use fallbacks:', String(e).slice(0, 200));
    }
  }
  const out: Record<string, CaptionSet> = {};
  for (const k of kinds) {
    out[k] = {
      caption: buildReelCaption(k, isoDate, receipts),
      caption_pro: k === 'verify' ? buildReelCaption('verify_pro', isoDate, receipts) : null,
    };
  }
  return out;
}

async function uploadFile(localPath: string, storagePath: string, contentType: string): Promise<void> {
  const body = readFileSync(localPath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: svcHeaders({ 'Content-Type': contentType, 'x-upsert': 'true' }),
    // Buffer is a Uint8Array at runtime; TS's DOM BodyInit just can't see it.
    body: new Uint8Array(body) as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`upload ${storagePath} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log(`  ↑ ${storagePath} (${(body.length / 1e6).toFixed(1)}MB)`);
}

async function upsertRow(row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/marketing_reels?on_conflict=reel_date,kind`, {
    method: 'POST',
    headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`marketing_reels upsert → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function prune(): Promise<void> {
  const cutoff = etDate(-PRUNE_DAYS);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/marketing_reels?reel_date=lt.${cutoff}&status=neq.archived&select=id,video_path,video_1x1_path,sheet_path`,
    { headers: svcHeaders() },
  );
  if (!res.ok) { console.warn(`[publish-reels] prune query failed (${res.status}) — skipping.`); return; }
  const rows: { id: string; video_path: string; video_1x1_path: string | null; sheet_path: string | null }[] = await res.json();
  if (rows.length === 0) return;
  const paths = rows.flatMap((r) => [r.video_path, r.video_1x1_path, r.sheet_path]).filter(Boolean) as string[];
  const del = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: svcHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!del.ok) { console.warn(`[publish-reels] prune delete failed (${del.status}) — rows left unarchived for retry.`); return; }
  const patch = await fetch(`${SUPABASE_URL}/rest/v1/marketing_reels?id=in.(${rows.map((r) => `"${r.id}"`).join(',')})`, {
    method: 'PATCH',
    headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ status: 'archived', updated_at: new Date().toISOString() }),
  });
  if (!patch.ok) console.warn(`[publish-reels] prune archive-flag failed (${patch.status}).`);
  else console.log(`  🧹 pruned ${rows.length} reel(s) older than ${PRUNE_DAYS}d (${paths.length} objects).`);
}

/** --captions-only: refresh the drafts on an existing row; status untouched. */
async function updateCaptionOnly(kind: Kind, set: CaptionSet): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/marketing_reels?reel_date=eq.${isoDate}&kind=eq.${kind}`, {
    method: 'PATCH',
    headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ caption: set.caption, caption_pro: set.caption_pro, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`caption update ${kind} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  console.log(Array.isArray(rows) && rows.length > 0
    ? `  ✔ caption refreshed (${kind} · ${isoDate})`
    : `  – no row for ${kind} · ${isoDate} (run the full publish first)`);
}

async function main(): Promise<void> {
  const kinds: Kind[] = mode === 'verify' ? ['verify'] : ['allday_pro', 'allday_free'];
  const captions = await buildCaptions(kinds);

  if (PREVIEW) {
    for (const k of kinds) {
      console.log(`\n── ${k} · ${isoDate} ──\n${captions[k].caption}`);
      if (captions[k].caption_pro) console.log(`\n── ${k} (PRO draft) · ${isoDate} ──\n${captions[k].caption_pro}`);
    }
    return;
  }
  if (CAPTIONS_ONLY) {
    for (const k of kinds) await updateCaptionOnly(k, captions[k]);
    return;
  }

  const targets = reelFiles().filter((t) => {
    if (!existsSync(t.video)) {
      console.warn(`[publish-reels] skip ${t.kind}: ${basename(t.video)} not found (assembler not run for ${stamp}?).`);
      return false;
    }
    return true;
  });
  if (targets.length === 0) { console.error('[publish-reels] nothing to publish — aborting.'); process.exit(1); }

  for (const t of targets) {
    console.log(`${t.kind} · ${isoDate}`);
    const prefix = `${t.kind}/${stamp}`;
    const videoPath = `${prefix}/${basename(t.video)}`;
    await uploadFile(t.video, videoPath, 'video/mp4');

    let video1x1Path: string | null = null;
    if (existsSync(t.video1x1)) {
      video1x1Path = `${prefix}/${basename(t.video1x1)}`;
      await uploadFile(t.video1x1, video1x1Path, 'video/mp4');
    }
    let sheetPath: string | null = null;
    if (existsSync(t.sheet)) {
      sheetPath = `${prefix}/${basename(t.sheet)}`;
      await uploadFile(t.sheet, sheetPath, 'image/png');
    }

    const duration = parseFloat(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${t.video}"`).toString(),
    );
    await upsertRow({
      reel_date: isoDate,
      kind: t.kind,
      video_path: videoPath,
      video_1x1_path: video1x1Path,
      sheet_path: sheetPath,
      duration_s: Number.isFinite(duration) ? +duration.toFixed(2) : null,
      caption: captions[t.kind].caption,
      caption_pro: captions[t.kind].caption_pro,
      status: 'ready',
      posted_at: null,
      target_name: null,
      updated_at: new Date().toISOString(),
    });
    console.log(`  ✔ registered — visible in Admin → Reels`);
  }

  await prune();
}

main().catch((e) => { console.error('[publish-reels]', e); process.exit(1); });
