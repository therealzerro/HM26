/**
 * subscriberNameLink — resolves NAME-keyed import rows (Meta "Subscribers" list:
 * display name + date, no email — ENH-SUB-NAMES-01, 2026-09-12) against the
 * email-keyed `pro_subscribers` roster.
 *
 * The roster's identity column is `email` (UNIQUE NOT NULL) and the edge
 * function upserts on it, so every name row must resolve to an email before
 * commit:
 *
 *   1. LINKED (exact)   — a roster row already carries this facebook_name
 *                          (case/space-insensitive) → reuse its email.
 *   2. LINKED (guessed) — the name matches an email's local part strongly
 *                          enough (see `guessLink`) → reuse that email AND set
 *                          facebook_name on the row so the next import is exact.
 *   3. NEW              — no match → a deterministic placeholder email keyed on
 *                          the name (`<slug>@facebook-name.invalid`; `.invalid`
 *                          is the RFC 2606 reserved TLD, never deliverable).
 *                          Placeholder rows display by name in the admin UI.
 *
 * All pure; the view fetches the roster and calls `planNameLinks`.
 */

import type { ParsedSubscriber } from './subscriberEmailParser';

export const PLACEHOLDER_EMAIL_DOMAIN = 'facebook-name.invalid';

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@' + PLACEHOLDER_EMAIL_DOMAIN);
}

/** Letters/digits only, lowercase — the matching alphabet for names and email local parts. */
export function squash(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function nameKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function placeholderEmailForName(name: string): string {
  const slug = name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'unnamed';
  return `${slug}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** What to print for a roster row: real emails stay masked by the caller; placeholder rows show the name. */
export function identityLabel(row: { email: string; facebook_name?: string | null }, maskedEmail: string): string {
  if (isPlaceholderEmail(row.email)) return row.facebook_name ? `${row.facebook_name} (name-only)` : 'name-only row';
  return maskedEmail;
}

export interface RosterRowLite {
  id: string;
  email: string;
  facebook_name: string | null;
  date_subscribed: string;
}

export type LinkKind = 'exact' | 'guessed' | 'new';

export interface LinkedRow {
  /** The row as it will be sent to upsert_subscribers. */
  email: string;
  facebook_name: string;
  date_subscribed: string;
  kind: LinkKind;
  /** For 'exact'/'guessed': the roster row it resolved to. */
  rosterId?: string;
  rosterEmailMasked?: string;
}

function daysApart(a: string, b: string): number {
  const ta = Date.parse(a + 'T12:00:00Z');
  const tb = Date.parse(b + 'T12:00:00Z');
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 99;
  return Math.abs(Math.round((ta - tb) / 86400000));
}

/**
 * Strong-match rule (validated on the 9/12 paste vs the 9/2 email roster:
 * 22 links, 0 wrong on eyeball, 0 ambiguous; the weaker "surname only, date
 * off" candidates were 4 of 5 wrong, so they are NOT linked). A roster row
 * matches when its email local part contains
 *   surname (≥4 letters) AND ( first name (≥3 letters) OR first-initial+surname
 *                              OR export date within 1 day of the roster date )
 *   OR first name (≥3 letters) AND export date within 1 day.
 * Exactly one roster row may satisfy it; two or more → no guess (ambiguous).
 */
export function guessLink(name: string, date: string, roster: RosterRowLite[]): RosterRowLite | null {
  const toks = name.split(/[\s\-.]+/).map(squash).filter(t => t.length > 0 && !/^(jr|sr|ii|iii|iv)$/.test(t));
  if (toks.length < 2) return null;
  const first = toks[0];
  const last = toks[toks.length - 1];
  // Tier 1 = surname-backed matches, tier 2 = first-name + date only. A single
  // tier-1 hit wins even when tier-2 candidates exist (a common first name with
  // the same join date must not block the surname match); otherwise a single
  // tier-2 hit; anything else is ambiguous → no guess.
  const tier1: RosterRowLite[] = [];
  const tier2: RosterRowLite[] = [];
  for (const r of roster) {
    if (isPlaceholderEmail(r.email)) continue;
    const local = squash(r.email.split('@')[0] ?? '');
    const lastHit = last.length >= 4 && local.includes(last);
    const firstHit = first.length >= 3 && local.includes(first);
    const initialHit = last.length >= 4 && local.includes(first[0] + last);
    const dateHit = daysApart(date, r.date_subscribed) <= 1;
    if (lastHit && (firstHit || initialHit || dateHit)) tier1.push(r);
    else if (firstHit && dateHit) tier2.push(r);
  }
  if (tier1.length === 1) return tier1[0];
  if (tier1.length === 0 && tier2.length === 1) return tier2[0];
  return null;
}

export interface LinkPlan {
  rows: LinkedRow[];
  counts: { exact: number; guessed: number; new: number };
}

/** Resolve every name-keyed parsed row to an email-keyed upsert row. Email rows pass through untouched. */
export function planNameLinks(parsed: ParsedSubscriber[], roster: RosterRowLite[], maskEmail: (e: string) => string): LinkPlan {
  const byName = new Map<string, RosterRowLite>();
  for (const r of roster) if (r.facebook_name) byName.set(nameKey(r.facebook_name), r);
  const claimed = new Set<string>(); // roster ids already taken by an earlier name in this paste
  const rows: LinkedRow[] = [];
  const counts = { exact: 0, guessed: 0, new: 0 };
  for (const p of parsed) {
    if (!p.facebook_name) continue;
    const exact = byName.get(nameKey(p.facebook_name));
    if (exact && !claimed.has(exact.id)) {
      claimed.add(exact.id);
      rows.push({ email: exact.email, facebook_name: p.facebook_name, date_subscribed: p.date_subscribed, kind: 'exact', rosterId: exact.id, rosterEmailMasked: maskEmail(exact.email) });
      counts.exact++;
      continue;
    }
    const guess = guessLink(p.facebook_name, p.date_subscribed, roster.filter(r => !claimed.has(r.id) && !r.facebook_name));
    if (guess) {
      claimed.add(guess.id);
      rows.push({ email: guess.email, facebook_name: p.facebook_name, date_subscribed: p.date_subscribed, kind: 'guessed', rosterId: guess.id, rosterEmailMasked: maskEmail(guess.email) });
      counts.guessed++;
      continue;
    }
    rows.push({ email: placeholderEmailForName(p.facebook_name), facebook_name: p.facebook_name, date_subscribed: p.date_subscribed, kind: 'new' });
    counts.new++;
  }
  return { rows, counts };
}
