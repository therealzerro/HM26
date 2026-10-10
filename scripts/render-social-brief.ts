// MKT-82 (2026-10-10) — headless capture of the SOCIAL BRIEF PNGs exactly as
// the Admin → 🎬 Reels "📰 Social brief — PNG" button produces them.
//
// Drives the live app (dev server on :8081, same rig as render-allday-body)
// with the admin role set, opens the brief exporter, taps each tier and saves
// the download the app itself produced — so what lands here IS the capture
// path (buildSocialBrief → lintBrief → fit assert → html-to-image ×2), not a
// replica. A refused tier (lint BLOCK / layout defect) is reported with the
// app's own message and exits 1.
//
// Usage: tsx scripts/render-social-brief.ts [outDir] [--tiers=pro,free,public]
//   outDir default: assets/marketing/brief_previews (gitignored? no — commit
//   deliberately or point it at a scratch dir).

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const BASE = 'http://localhost:8081';
const args = process.argv.slice(2);
const OUT = resolve(args.find(a => !a.startsWith('--')) ?? 'assets/marketing/brief_previews');
const TIERS = (args.find(a => a.startsWith('--tiers='))?.slice(8) ?? 'pro,free,public').split(',');
const LABEL: Record<string, string> = { pro: '💎 Pro', free: '👥 Free', public: '📡 Public' };

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark', acceptDownloads: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('user', JSON.stringify({ id: 'default', role: 'admin' }));
      window.localStorage.setItem('hm:theme-mode', 'dark');
      window.localStorage.setItem('onboarding_complete', 'true');
    } catch {}
  });
  page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 200)); });
  await page.goto(BASE + '/brief-capture', { waitUntil: 'networkidle', timeout: 240_000 });
  const toggle = page.getByText('📰 Social brief — PNG', { exact: false }).first();
  await toggle.waitFor({ timeout: 120_000 });
  await toggle.click();

  const results: Record<string, { file?: string; message: string; ok: boolean }> = {};
  for (const key of TIERS) {
    const btn = page.getByText(LABEL[key], { exact: false }).first();
    await btn.waitFor({ timeout: 30_000 });
    const dl = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    await btn.click();
    // The exporter's status line ends in ✅ (saved) or ❌ (refused/failed).
    const status = page.getByText(/^(✅|❌)/).first();
    await status.waitFor({ timeout: 120_000 });
    const message = (await status.textContent()) ?? '';
    const ok = message.startsWith('✅');
    let file: string | undefined;
    if (ok) {
      const d = await dl;
      if (d) {
        file = join(OUT, `hm-brief-${key}-${todayET()}.png`);
        await d.saveAs(file);
      }
    }
    results[key] = { file, message: message.trim(), ok };
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${key}: ${message.trim()}${file ? ` → ${file}` : ''}`);
    // let the exporter settle before the next tier (it clears render state in finally)
    await page.waitForTimeout(800);
  }
  writeFileSync(join(OUT, `brief_capture_${todayET()}.json`), JSON.stringify(results, null, 2));
  await browser.close();
  if (Object.values(results).some(r => !r.ok)) process.exit(1);
}

main().catch(e => { console.error('ABORT:', e?.message ?? e); process.exit(1); });
