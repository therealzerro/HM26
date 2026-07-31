// MKT-15 — social handoff platform registry.
//
// Mirrors scripts/reel-scopes.ts: ONE registry, every consumer reads from it.
//
// WHY constants/ AND NOT scripts/ (deviation from the work order's literal
// path): the handoff runs in the admin app, and the Phase 1 gate is a dry-run
// SCRIPT — so both an RN screen and a node script import this. That is exactly
// the split MKT-11 already established (shared ordering in
// constants/reelPanels.ts; build-only clearance in scripts/panel-config.ts).
// A registry under scripts/ cannot be imported by the app at all.
//
// THE MODEL IS ASSISTED, ALWAYS. No platform API, no send buttons. Every path
// is: save the mp4 to the camera roll → copy a platform-shaped caption → open
// the app → attach and post by hand. No URL scheme can attach a video file, so
// deep links only choose which screen opens; the CLIPBOARD is the real value,
// because retyping a platform-shaped caption is the actual friction.

import { EMOJI_RE, type SocialTier } from '@/lib/social/brandLint';

export type PlatformId = 'telegram' | 'youtube' | 'tiktok' | 'reddit' | 'x' | 'instagram';

/** Which rendered cut this platform must receive. */
export type AssetVariant = '9x16' | '1x1' | '30fps' | 'redacted';

/** Shape the destination's composer expects. */
export type CaptionShape = 'caption' | 'title+body';

export interface SocialPlatform {
  id: PlatformId;
  label: string;
  icon: string;
  asset: AssetVariant;
  captionShape: CaptionShape;
  /**
   * Deep-link template with {text} / {title} / {url} / {sub} placeholders, or
   * null for plain app-open. NEVER ship a scheme that silently fails — an
   * undocumented native scheme belongs here as null, not as a guess.
   */
  deepLink: string | null;
  /** Always-works fallback, used when deepLink is null or a sub is missing. */
  appOpen: string;
  tier: SocialTier;
  /** Caption/body character ceiling. Transform truncates on a word boundary. */
  maxLen: number;
  maxTitleLen?: number;
  /**
   * Appended if not already present. Kept MECHANICAL only — '#Shorts' is what
   * classifies a YouTube upload as a Short, not brand copy. Editorial hashtag
   * sets are content-agent copy and are deliberately left empty rather than
   * invented here (same rule Phase 2 applies to replacement vocabulary).
   */
  hashtags: string[];
  /** false = strip URLs from the caption (they are dead text on that surface). */
  allowsLinks: boolean;
  /** Two-Question NO/NO ack required before the handoff buttons unlock. */
  requiresTwoQuestion: boolean;
  enabled: boolean;
  disabledReason?: string;
}

/**
 * Phase 1 enablement, per the operator's gate ruling:
 *   • Telegram is a room we OWN — no classifier decides whether we are
 *     gambling-adjacent there — so it ships now against the same digit-bearing
 *     cut the FB groups already receive.
 *   • The four public surfaces register but stay DISABLED until MKT-15 Phase 2
 *     clears the Q2 vocabulary list. They declare asset:'redacted' so the
 *     dependency is encoded in the registry rather than living in a comment.
 *   • Instagram is disabled with cause and is not a Phase 2 unblock.
 */
export const SOCIAL_PLATFORMS: Record<PlatformId, SocialPlatform> = {
  telegram: {
    id: 'telegram',
    label: 'Telegram',
    icon: '✈️',
    asset: '9x16',
    captionShape: 'caption',
    // Opens Telegram's own share picker, so it needs no channel handle
    // configured and cannot dangle if the channel is renamed.
    deepLink: 'https://t.me/share/url?url={url}&text={text}',
    appOpen: 'https://t.me/',
    // Operator ruling 2026-07-28: the Telegram channel IS the Pro room, so it
    // is tier 4 — the same class as the FB pro group, not a cross-post. Pro
    // captions (real counts, state attributions, STRAIGHT MATCH callouts) are
    // sanctioned here; at tier 3 every one of them was blocked.
    tier: 4,
    maxLen: 1024,        // Telegram media-caption ceiling
    hashtags: [],
    allowsLinks: true,
    // NOT required, and deliberately so. A pro reel shows digits BY DESIGN, so
    // Q1 ("no 3-digit numbers visible") is false every single time — requiring
    // the ack here would train the operator to tick it untruthfully, which
    // corrodes the filter on the cross-post and public surfaces where it does
    // real work. Same reason the FB pro/free group targets never asked for it;
    // only cross-posts do.
    requiresTwoQuestion: false,
    enabled: true,
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube Shorts',
    icon: '▶️',
    asset: 'redacted',
    captionShape: 'title+body',
    deepLink: null,      // no documented mobile compose scheme
    appOpen: 'https://www.youtube.com/',
    tier: 1,
    maxLen: 5000,        // description
    maxTitleLen: 100,
    // MKT-37: the delivered tag ruling — three, in the DESCRIPTION, never the
    // title. #Shorts earns format categorisation; the other two place the
    // content in an analytics context rather than a gambling one. NO
    // lottery/numbers/daily-draw/winning/luck tags — one gambling-adjacent tag
    // undoes the education framing that makes the content recommendable. If
    // tag research later shows a reach cost to being this conservative, that
    // is a decision to revisit with data, not a default to loosen.
    hashtags: ['#Shorts', '#DataAnalysis', '#PatternAnalysis'],
    allowsLinks: true,
    requiresTwoQuestion: true,
    enabled: false,
    disabledReason: 'public surface — blocked on MKT-15 Phase 2 (Q2 vocabulary)',
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    icon: '🎵',
    asset: 'redacted',
    captionShape: 'caption',
    deepLink: null,      // native scheme undocumented / version-dependent
    appOpen: 'https://www.tiktok.com/',
    tier: 1,
    maxLen: 2200,
    hashtags: [],        // content agent supplies; not invented here
    allowsLinks: false,  // links are not tappable in a TikTok caption
    requiresTwoQuestion: true,
    enabled: false,
    disabledReason: 'public surface — blocked on MKT-15 Phase 2 (Q2 vocabulary)',
  },
  reddit: {
    id: 'reddit',
    label: 'Reddit',
    icon: '👽',
    // NOT '30fps': the ~30fps ceiling is a constraint of Reddit's API upload
    // path. The assisted lane hands Reddit a camera-roll file that its app
    // re-encodes anyway, so the transcode (measured 83s/reel) is not built.
    asset: 'redacted',
    captionShape: 'title+body',
    deepLink: 'https://www.reddit.com/r/{sub}/submit?title={title}',
    appOpen: 'https://www.reddit.com/submit',
    tier: 1,
    maxLen: 10000,
    maxTitleLen: 300,
    hashtags: [],        // hashtags are not a Reddit convention
    allowsLinks: true,
    requiresTwoQuestion: true,
    enabled: false,
    disabledReason: 'public surface — blocked on Phase 2; posting stays MANUAL (90/10 rule)',
  },
  x: {
    id: 'x',
    label: 'X',
    icon: '𝕏',
    asset: 'redacted',
    captionShape: 'caption',
    deepLink: 'https://x.com/intent/post?text={text}',
    appOpen: 'https://x.com/compose/post',
    tier: 1,
    maxLen: 280,
    hashtags: [],
    allowsLinks: true,
    requiresTwoQuestion: true,
    enabled: false,
    disabledReason: 'public surface — blocked on MKT-15 Phase 2 (Q2 vocabulary)',
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    icon: '📷',
    asset: 'redacted',
    captionShape: 'caption',
    deepLink: null,
    appOpen: 'https://www.instagram.com/',
    tier: 1,
    maxLen: 2200,
    hashtags: [],
    allowsLinks: false,  // in-caption links are not tappable
    requiresTwoQuestion: true,
    enabled: false,
    // Not a Phase 2 unblock: this one is a standing ruling, not a gate.
    disabledReason: 'DO NOT ENABLE — needs a linked FB Page + Meta review against a page de-recommended twice; Meta enforces across linked accounts',
  },
};

export const PLATFORM_IDS = Object.keys(SOCIAL_PLATFORMS) as PlatformId[];

export function enabledPlatforms(): SocialPlatform[] {
  return PLATFORM_IDS.map(id => SOCIAL_PLATFORMS[id]).filter(p => p.enabled);
}

// ── Caption transform ───────────────────────────────────────────────────────
// A TRANSFORM over the existing caption kinds, deliberately not a caption kind
// per platform × reel kind — that product is combinatorial and would double
// every time either axis grows.

export interface HandoffCaption {
  /** Present only for title+body platforms. */
  title?: string;
  /** What goes in the composer's main field. */
  body: string;
  /** Exactly what lands on the clipboard. */
  clipboard: string;
  truncated: boolean;
}

const URL_RE = /\bhttps?:\/\/\S+/gi;

/**
 * ── MKT-24 · THE PRO-ROOM RESHAPING RULE (tier 4) ────────────────────────────
 *
 * Telegram is the Pro room, and Pro surface law is: never a commercial pitch,
 * never pricing, never upgrade language. Before this, `platformCaption` shaped
 * only LENGTH and HASHTAGS, so a caption reached tier 4 verbatim — and the row
 * is fed the operator's live editor text, which for every free-defaulting kind
 * is the FREE draft. Paying members were one tap from being sold what they
 * already own.
 *
 * ⚠ THIS IS A RESHAPING RULE, NOT A TEMPLATE SET, and it deliberately splits in
 * two. The split is what keeps it safe:
 *
 *   1. THIS TRANSFORM strips only the UNCONDITIONAL markers — pricing, explicit
 *      upgrade/subscribe verbs, pinned-post pointers, and CTAs. Every one is a
 *      fixed lexical shape, so it cannot eat a receipts sentence. Real
 *      performance data (counts, state attributions, STRAIGHT MATCH callouts)
 *      is SANCTIONED at tier 4 and must survive untouched.
 *
 *   2. `platformAcceptsAudience` REFUSES free-written captions outright, which
 *      is what handles the class this transform deliberately does not chase:
 *      implicit Pro-as-destination framing ("the digits are the Pro side of the
 *      line", "the complete six live in Pro"). Catching that lexically would
 *      mean matching bare "Pro" — and "Pro first look" is sanctioned
 *      first-access framing on a pro caption. Any predicate wide enough to
 *      catch the former mangles the latter, so the audience gate carries it
 *      instead of a regex.
 *
 * Note that brandLint §6 already BLOCKS `$N` / `/mo` / "upgrade" at tier 4, so
 * the send button was disabled rather than silently wrong for that subset. A
 * block is not the same as a fix: it stops the post without producing a usable
 * one, and it says nothing about pinned-post language or CTAs, which are
 * unguarded. Stripping here means the row lints clean AND reads correctly.
 */

/** Sentence-level kill list. A sentence carrying any of these is dropped whole —
 *  excising a phrase mid-sentence leaves grammatical debris on the clipboard. */
const PRO_ROOM_DROP: Array<{ re: RegExp; why: string }> = [
  { re: /\$\s?\d|\/mo\b|\bper month\b/i,                     why: 'pricing' },
  { re: /\bupgrade\b|\bsubscribe\b|\bsign up\b|\bjoin pro\b/i, why: 'upgrade verb' },
  { re: /\bpinned\b/i,                                        why: 'pinned-post pointer' },
  // CTA: there is nowhere to convert to inside a room they are already in.
  { re: /\b(link in bio|tap in|check your state|don't miss|drop a comment|DM us|follow along)\b/i, why: 'CTA' },
];

/** Plainer register than Facebook: fewer emoji, no hashtags, no exclamation
 *  pile-ups. Keeps the FIRST emoji so the post is not stripped to grey text. */
function plainerRegister(text: string): string {
  let out = text.replace(/(^|\s)#[\w]+/g, '').replace(/[ \t]{2,}/g, ' ');
  const emoji = out.match(EMOJI_RE) ?? [];
  if (emoji.length > 1) {
    let seen = 0;
    out = out.replace(EMOJI_RE, m => (++seen === 1 ? m : ''));
  }
  return out.replace(/\s+([.,!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Split on sentence ends AND newlines, keeping the terminator with its clause. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

/**
 * Reshape a caption for the Pro room. Exported so the dry-run harness and any
 * future tier-4 platform get the identical rule rather than a second copy.
 */
export function proRoomCaption(caption: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const kept = sentences(caption).filter(s => {
    const hit = PRO_ROOM_DROP.find(d => d.re.test(s));
    if (hit) { dropped.push(`${hit.why}: "${s}"`); return false; }
    return true;
  });
  return { text: plainerRegister(kept.join(' ')), dropped };
}

/**
 * Is this reel's caption allowed on this platform at all?
 *
 * A free-group teaser has no meaning in the Pro room: strip its CTA and what
 * remains sells nothing to people who already bought, and the free VERIFY draft
 * is deliberately qualitative — handing it to Pro withholds the very counts that
 * room is entitled to. Refusing is the correct outcome, not transforming.
 *
 * ⚠ REFUSAL IS EXPRESSED AS A REASON, NOT A BOOLEAN, because the handoff rows
 * render disabled platforms WITH their cause — a silently missing row reads as
 * an oversight rather than a ruling (the same argument the Instagram entry
 * makes).
 */
export function platformAcceptsAudience(
  p: SocialPlatform,
  audience: 'free' | 'pro' | 'public',
): { ok: true } | { ok: false; reason: string } {
  if (p.tier === 4 && audience === 'free') {
    return {
      ok: false,
      reason: 'Free-group caption — the Pro room needs the pro draft, not a teaser written to sell it.',
    };
  }
  // MKT-16: public copy is funnel-to-Free by design ("the community's free").
  // Pointing paying members at the free community undersells what they bought.
  if (p.tier === 4 && audience === 'public') {
    return {
      ok: false,
      reason: 'Public caption — written to funnel strangers into the free community; the Pro room gets the pro draft.',
    };
  }
  return { ok: true };
}

/**
 * ── MKT-37 · YOUTUBE SHORTS CONTENT SET (allday_public, tier 1) ──────────────
 *
 * Delivered by the content agent 2026-07-31. Registered as a PER-PLATFORM
 * CONTENT SET consumed by the transform — not new caption kinds — so a future
 * platform inherits the mechanism (Reddit will still need its own COPY when
 * enabled: its 90/10 rule punishes announcement register, and every template
 * here is an announcement).
 *
 * Titles and descriptions rotate INDEPENDENTLY so pairings vary: title cycles
 * 8 by day; the description index advances its 4-cycle by one extra step each
 * time the title cycle wraps, so all 32 pairings appear over 32 days instead
 * of the same 8 forever.
 *
 * Deliberately absent from every field (content-agent ruling, recorded): no
 * digits-as-values, no session words, no BOX/STRAIGHT/PLAY, no pricing, no
 * Pro CTA, and no MATCH vocabulary at all — the methodology framing carries
 * the same weight without testing whether the bare term clears tier 1.
 */
export const YT_SHORTS_TITLES: string[] = [
  'Six signals, ranked before the draw',
  'How we score daily 3-digit draw patterns',
  'The board we publish before results come in',
  'Ranked, explained, and checked the next morning',
  'What pattern analysis actually looks like',
  'Published first. Verified after.',
  'Six signals a day, across 40+ states & provinces',
  'Our method, start to finish',
];

export const YT_SHORTS_DESCRIPTIONS: string[] = [
  `Every morning our engine scores combinations across 40+ states & provinces and publishes six ranked signals — before the first draw. The next morning we check every one against the official results and publish the record.\nThe full board is free in our community: {free_group_url}`,
  `This is pattern analysis, not prediction. Six signals ranked by four measures — energy, momentum, pattern and consistency — published and time-stamped before the draw, then graded against official results the following morning.\nFull board, free: {free_group_url}`,
  `No fees, no promises. We publish the analysis first and the receipts after, every day, across 40+ states & provinces. You can check every one of them yourself.\nJoin free: {free_group_url}`,
  `Most methods never show their work. Ours publishes six ranked signals before the draw, explains the reasoning behind each, then grades them against the official results in the open.\nThe whole method is free in our community: {free_group_url}`,
];

/** Day-rotated YouTube fields. dayNum = any stable content-date day number
 *  (the caption engine's dayOfYear convention); never a render clock. */
export function youtubeShortsFields(
  dayNum: number,
  freeGroupUrl?: string,
): { title: string; description: string } {
  const title = YT_SHORTS_TITLES[dayNum % YT_SHORTS_TITLES.length];
  const dLen = YT_SHORTS_DESCRIPTIONS.length;
  const dIdx = (dayNum % dLen + Math.floor(dayNum / YT_SHORTS_TITLES.length)) % dLen;
  const description = YT_SHORTS_DESCRIPTIONS[dIdx]
    .replace('{free_group_url}', (freeGroupUrl ?? '').trim() || 'link in our profile');
  return { title, description };
}

/** Trim to a word boundary rather than mid-word; only when actually over. */
function clamp(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return { text: (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd(), truncated: true };
}

/**
 * Shape a stored reel caption for one platform.
 *
 * Order matters: strip links first (they inflate length on surfaces where they
 * are dead text), then reserve room for hashtags, then clamp — otherwise a
 * clamp-then-append sequence can push the result back over the ceiling, which
 * is precisely the silent failure X's 280 limit would produce.
 */
export function platformCaption(
  p: SocialPlatform,
  caption: string,
  // MKT-37: platform content-set context. When a platform has a dedicated set
  // (YouTube today), the stored caption is REPLACED by the set — the set was
  // written for that surface's three fields, the caption for a one-field
  // composer. Optional so every existing call site keeps its behaviour.
  ctx?: { dayNum?: number; freeGroupUrl?: string },
): HandoffCaption {
  if (p.id === 'youtube' && ctx?.dayNum != null) {
    const yt = youtubeShortsFields(ctx.dayNum, ctx.freeGroupUrl);
    const tags = p.hashtags.filter(h => !new RegExp(`(^|\\s)${h}\\b`, 'i').test(yt.description));
    const t = clamp(yt.title, p.maxTitleLen ?? p.maxLen);
    const b = clamp(yt.description + (tags.length ? `\n\n${tags.join(' ')}` : ''), p.maxLen);
    return { title: t.text, body: b.text, clipboard: b.text || t.text, truncated: t.truncated || b.truncated };
  }
  let text = (caption ?? '').trim();
  // MKT-24: tier 4 is an owned room, so the reshaping runs BEFORE length work —
  // dropping a pricing sentence changes what has to be clamped, and clamping
  // first could truncate the marker out of view while leaving the pitch intact.
  if (p.tier === 4) text = proRoomCaption(text).text;
  if (!p.allowsLinks) text = text.replace(URL_RE, '').replace(/[ \t]{2,}/g, ' ').trim();

  const tags = p.hashtags.filter(h => !new RegExp(`(^|\\s)${h}\\b`, 'i').test(text));
  const tagSuffix = tags.length ? `\n\n${tags.join(' ')}` : '';

  if (p.captionShape === 'title+body') {
    // First sentence or line becomes the title; the remainder is the body.
    const split = text.search(/(?<=[.!?])\s|\n/);
    const rawTitle = (split > 0 ? text.slice(0, split) : text).trim();
    const rawBody = (split > 0 ? text.slice(split) : '').trim();
    const t = clamp(rawTitle, p.maxTitleLen ?? p.maxLen);
    const b = clamp(rawBody + tagSuffix, p.maxLen);
    return {
      title: t.text,
      body: b.text,
      clipboard: b.text || t.text,
      truncated: t.truncated || b.truncated,
    };
  }

  const c = clamp(text, Math.max(0, p.maxLen - tagSuffix.length));
  const body = c.text + tagSuffix;
  return { body, clipboard: body, truncated: c.truncated };
}

/** Resolve a deep link, or null to fall back to a plain app-open. */
export function platformLink(
  p: SocialPlatform,
  parts: { text?: string; title?: string; url?: string; sub?: string },
): string {
  if (!p.deepLink) return p.appOpen;
  // A {sub} template with no subreddit chosen would produce /r//submit — open
  // the generic composer instead of a broken URL.
  if (p.deepLink.includes('{sub}') && !parts.sub) return p.appOpen;
  return p.deepLink
    .replace('{text}', encodeURIComponent(parts.text ?? ''))
    .replace('{title}', encodeURIComponent(parts.title ?? ''))
    .replace('{url}', encodeURIComponent(parts.url ?? ''))
    .replace('{sub}', encodeURIComponent(parts.sub ?? ''));
}
