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

import type { SocialTier } from '@/lib/social/brandLint';

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
    hashtags: ['#Shorts'],
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
export function platformCaption(p: SocialPlatform, caption: string): HandoffCaption {
  let text = (caption ?? '').trim();
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
