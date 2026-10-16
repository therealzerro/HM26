// MKT-90 — THE GUEST PASS runner: `npm run reel:guest -- --scope=midday|evening`
//
// Assembles + publishes the on-demand GUEST cut of a session scope from the
// morning's FULL body (the one reel:<scope> already rendered for the Pro cut —
// nothing is re-captured): the Pro cut's intro, stinger and voice on loan,
// the GUEST PASS stamp, the guest chip, the free-tier close with the price,
// and a tier-2 caption whose line one is the Pro-group link. Registers as
// <scope>_guest (audience free). Never part of reel:daily; allday has no
// guest (allday_free already IS the full board — SOCIAL-13).
//
// Extra assembler flags pass through (--carrier=, --endcard-motion=, …).
import { execSync } from 'node:child_process';
import { parseScopeFlag, REEL_SCOPES } from './reel-scopes';

const scope = parseScopeFlag(process.argv);
if (!(REEL_SCOPES[scope].onDemandVariants ?? []).includes('guest')) {
  console.error(`ABORT: scope "${scope}" has no guest variant — the guest pass exists for midday | evening only (allday_free is already the full board, SOCIAL-13).`);
  process.exit(1);
}
const passthrough = process.argv.slice(2).filter(a => a.startsWith('--') && !a.startsWith('--scope=') && !a.startsWith('--variant=')).join(' ');
const run = (cmd: string) => { console.log(`\n$ ${cmd}`); execSync(cmd, { stdio: 'inherit' }); };
run(`npx tsx scripts/assemble-allday-reels.ts --scope=${scope} --variant=guest ${passthrough}`.trim());
run(`npx tsx scripts/publish-reels.ts ${scope} --variant=guest`);
