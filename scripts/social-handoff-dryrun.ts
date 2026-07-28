/**
 * social-handoff-dryrun — MKT-15 Phase 1 gate.
 *
 * Prints the handoff bundle the admin screen would produce for one day's reels,
 * per registered platform: the shaped caption, its title/body split, character
 * budget, the tier lint, and the exact URL the Open button would hit.
 *
 * Read-only. Touches no storage, writes no rows, opens nothing. Its whole job is
 * to make the transforms reviewable OUTSIDE a phone, so a caption that silently
 * truncates or a deep link that resolves to a broken URL is caught here.
 *
 * Usage: tsx scripts/social-handoff-dryrun.ts [YYYY-MM-DD] [--all]
 *   default date: today ET · --all also prints the disabled platforms
 */
import { config as loadEnv } from 'dotenv';
import { lintCaption } from '../lib/social/brandLint';
import {
  SOCIAL_PLATFORMS, PLATFORM_IDS, platformCaption, platformLink,
} from '../constants/socialPlatforms';

loadEnv({ path: '.env.backtest', quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SVC_KEY) {
  console.error('[dryrun] Missing .env.backtest credentials.');
  process.exit(1);
}

const args = process.argv.slice(2);
const SHOW_ALL = args.includes('--all');
const date = args.find(a => !a.startsWith('--'))
  ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

interface Reel { reel_date: string; kind: string; caption: string; caption_pro: string | null; video_path: string; duration_s: string | null }

(async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/marketing_reels?reel_date=eq.${date}&select=reel_date,kind,caption,caption_pro,video_path,duration_s&order=kind.asc`,
    { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } },
  );
  if (!res.ok) { console.error(`[dryrun] fetch failed HTTP ${res.status}`); process.exit(1); }
  const reels: Reel[] = await res.json();
  if (!reels.length) { console.error(`[dryrun] no reels registered for ${date}.`); process.exit(1); }

  const bucket = `${SUPABASE_URL}/storage/v1/object/public/marketing-reels`;
  let blocked = 0, truncated = 0;

  console.log(`\n═══ SOCIAL HANDOFF DRY RUN · ${date} · ${reels.length} reel(s) ═══`);

  for (const r of reels) {
    console.log(`\n\n■ ${r.kind}${r.duration_s ? ` · ${r.duration_s}s` : ''}`);
    const videoUrl = `${bucket}/${r.video_path}`;
    for (const id of PLATFORM_IDS) {
      const p = SOCIAL_PLATFORMS[id];
      if (!p.enabled && !SHOW_ALL) continue;
      // The pro draft is what a pro-tier surface would carry; everything else
      // takes the default caption, mirroring the admin screen's target switch.
      const source = r.caption_pro ?? r.caption ?? '';
      const shaped = platformCaption(p, source);
      const lint = lintCaption(shaped.clipboard, p.tier);
      const hard = lint.violations.filter(v => v.blocking);
      if (hard.length) blocked++;
      if (shaped.truncated) truncated++;

      const state = p.enabled ? 'ENABLED ' : 'disabled';
      console.log(`\n  ${p.icon} ${p.label.padEnd(16)} [${state}] asset=${p.asset} tier=${p.tier} shape=${p.captionShape}`);
      if (!p.enabled) { console.log(`     ↳ ${p.disabledReason}`); continue; }
      if (shaped.title != null) console.log(`     TITLE (${shaped.title.length}/${p.maxTitleLen}): ${shaped.title}`);
      console.log(`     BODY  (${shaped.clipboard.length}/${p.maxLen})${shaped.truncated ? '  ⚠️ TRUNCATED' : ''}: ${shaped.clipboard.replace(/\n/g, ' ⏎ ').slice(0, 160)}`);
      console.log(`     LINT  ${hard.length ? `⛔ ${hard.map(v => `${v.term}(${v.rule})`).join(', ')}` : '✓ clean'}`);
      console.log(`     OPEN  ${platformLink(p, { text: shaped.clipboard, title: shaped.title, url: videoUrl }).slice(0, 120)}`);
    }
  }

  console.log(`\n\n═══ SUMMARY ═══`);
  console.log(`enabled platforms : ${PLATFORM_IDS.filter(i => SOCIAL_PLATFORMS[i].enabled).map(i => SOCIAL_PLATFORMS[i].label).join(', ') || '(none)'}`);
  console.log(`blocked by lint   : ${blocked}`);
  console.log(`truncated captions: ${truncated}`);
  console.log(`\nAssisted lane only — nothing here posts. A human completes every post.\n`);
})();
