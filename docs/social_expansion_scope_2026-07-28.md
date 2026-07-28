# Social expansion scope — YouTube, TikTok, Instagram, Reddit, Telegram
**Date:** 2026-07-28 · **Status:** PROPOSAL, nothing built · **Author:** scoped for operator decision

Adding five platforms to the reels system (MKT-01…13). This document is a plan and a
risk assessment, not an implementation. **Three decisions at the end are the
operator's and block Phase 1.**

---

## 0. The finding that reframes everything

Before any API question, there is a rule already in our own codebase:

> **Two-Question filter (mandatory, brand brief):** Q1 — no 3-digit numbers visible.
> Q2 — no forbidden vocabulary. **Both must be NO** before content leaves a surface we control.

And our own handoff doc, §4, already states the consequence:

> "reels show real digits, so cross-posts honestly fail Q1 — that is the filter working;
> **reels live in the groups**"

**Every platform in this request is a public surface — more public than the FB cross-post
that already fails the filter.** YouTube, TikTok, Instagram and Reddit are open, indexed,
algorithmically distributed, and in TikTok's and YouTube's case actively classified for
gambling adjacency. Telegram is the sole exception (a channel we own, closer to a group).

So the honest scope is **not** "wire five APIs." It is:

1. **A content decision** — what public-safe cut of a reel exists at all, and
2. **A distribution decision** — which platforms are worth the enforcement risk, given the
   FB page was de-recommended twice with both appeals denied, and
3. **Then** the plumbing, which is the easy part.

Wiring five publish APIs to the reels we have today would put digit-bearing,
gambling-adjacent video onto four public platforms, at daily cadence, under automation.
That is the fastest available route to repeating the Meta outcome on four more channels.

### The unlock: one build serves two open needs

A **redacted public cut** (digits masked in the UI at capture time) is *already* the
identified blocker for a free-group Midday/Evening reel (MKT-13, §9 of the handoff). The
same capture mode makes a public-platform cut possible. **One build, two unlocks** — this
should be Phase 1 regardless of which platforms are chosen.

Alternative that needs no new build: **lead public channels with the verify/"Receipts"
reel and brand content only.** Receipts show *verified outcomes*, not tomorrow's numbers —
far more defensible, and it is the strongest brand asset we have. Digit-bearing drops stay
in the groups where they already live.

---

## 1. Platform findings (researched 2026-07-28)

| Platform | Publish gate | Content-policy risk | Effort | Verdict |
|---|---|---|---|---|
| **Telegram** | None — Bot API token | **Low** (own channel, permissive) | ~1 day | **BUILD FIRST** |
| **YouTube** | Unverified project → uploads forced **private**; audit to publish publicly via API | **Medium** — gambling rules tightened Nov 2025; "simulates gambling" → 18+, reduced reach | ~2–3 days | **BUILD, private + manual publish** |
| **TikTok** | Draft/inbox needs no audit; **direct post needs audit** (2–4wk, multiple rounds) | **HIGH** — "promotion of all gambling activities strictly prohibited"; gambling-like → 18+ **and FYP-ineligible** | ~2–3 days | **CONDITIONAL** — draft path only |
| **Reddit** | OAuth self-serve **closed**, manual approval 2–4wk; commercial use $0.24/1k | **Medium-high** — 90/10 self-promo rule, mod removal, shadowbans | ~2 days | **MANUAL ASSIST ONLY** |
| **Instagram** | Requires **FB Page link** + Meta app review 2–4wk | **SEVERE** — see below | ~3–4 days | **DO NOT BUILD NOW** |

### Instagram is the one to refuse, and it is counter-intuitive

Instagram is usually the first ask. Here it is the most dangerous single item in the list:

- IG content publishing **requires a linked Facebook Page** and Meta app review of
  `instagram_business_content_publish`. There is no path that avoids Meta.
- **Meta enforces across linked accounts.** A violation on one platform can extend
  penalties to the linked other; linkage is a primary determinant, especially when content
  and activity patterns are similar. Ours would be identical by construction.
- Our FB Page is **already de-recommended twice, both appeals denied.**

So building IG means (a) voluntarily linking a new asset to a compromised one, (b) putting
the flagged page in front of Meta reviewers, and (c) creating a path for a future IG strike
to cascade onto what Meta presence remains. The upside is one more distribution channel;
the downside is the rest of our Meta footprint.

**Recommendation: defer indefinitely.** Revisit only if the page's standing recovers.

### Telegram is the strategic pick, not just the easy one

Beyond being ~1 day of work with no review process: Telegram is the only platform here
where **we own the room**. No algorithmic classifier decides whether our content is
gambling-adjacent; no appeal process to lose. Given that the entire brand-rehab exercise
exists because a Meta classifier made that call for us, **a channel we control is a hedge
against exactly the failure mode we already suffered.** It is also a plausible home for the
Pro tier, reducing dependence on the FB group.

Bot API `sendVideo` caps at 50MB. Our 9:16 masters are ~16.4MB — comfortably inside, no
local Bot API server needed.

### TikTok: the draft path is the whole answer

Direct posting is a trap for us: unaudited clients are restricted to `SELF_ONLY` visibility
*and* every posting account must be set to private — useless — and the audit is 2–4 weeks
with multiple feedback rounds.

But the **inbox/draft** endpoint (`/v2/post/publish/inbox/video/init/`, scope
`video.upload`) uploads the video into the creator's TikTok drafts, and the human completes
the post in the app. Limits: 5 pending per 24h (we would use 1–4), 6 requests/min.

**This maps exactly onto the model we already run** — "assisted handoff, a human always
completes the post." It is the same architecture, extended, not a new one.

The unresolved issue is content, not plumbing: gambling-like content is **FYP-ineligible**,
and the For You page *is* TikTok's entire value. A TikTok presence that cannot reach FYP is
a lot of build for a channel that structurally cannot grow.

### Reddit: the API is not the hard part

Two real technical gates: OAuth self-service registration is closed (manual approval, 2–4
weeks), and daily brand posting is commercial use ($0.24/1k contract). Video upload is a
3-step media-asset flow, **max ~30fps — our reels are 60fps and would need a transcode.**

But the binding constraint is cultural: the 90/10 rule, per-subreddit moderation, and an
explicit norm against cross-posting the same promotional content. Automated daily reel
drops are the textbook path to removal and shadowban. **Reddit rewards participation, not
broadcast.** Recommend assist-only: generate a title + link + first-comment draft for the
operator to post by hand, and never automate it.

### YouTube: best risk-adjusted reach

Our 33.8s 9:16 reels are natively Shorts-shaped (<60s, vertical). Quota is no longer a
concern — `videos.insert` dropped from ~1600 units to ~100 as of Dec 2025, so the default
10,000/day allows ~100 uploads against our 1–4.

The verification gate is actually *convenient*: an unverified project can only upload as
**private**, which means the shipping design is "API uploads privately → operator reviews →
operator publishes from Studio." That is our existing handoff model, and it needs **no
audit at all**. Pursue the compliance audit later only if fully automated public posting
ever becomes desirable.

---

## 2. Proposed architecture

Deliberately an extension of what exists, not a parallel system. The MKT-13 scope registry
is the template: **one registry, everything else reads from it.**

### 2.1 `scripts/social-platforms.ts` — the registry
Mirrors `reel-scopes.ts`. One entry per platform: display name, delivery mode
(`api_draft` | `api_private` | `assisted`), asset variant required (9:16 / 1:1 / 30fps),
caption shape (caption vs title+body), brand tier, and whether it is enabled. A platform
that is off is dormant, exactly like an undelivered scope today.

### 2.2 `social_deliveries` table (new)
One row per (reel × platform): status (`pending|delivered|published|failed|skipped`),
remote id, remote URL, error text, timestamps. `marketing_reels` stays the artifact record;
deliveries become a separate concern rather than more columns on the reel.

*Note: the `marketing_reels.kind` CHECK constraint and `KIND_UI` lesson from MKT-13 applies
— any enum here needs both the DB constraint and the admin UI entry, or it fails late.*

### 2.3 `social-deliver` edge function (new)
**Platform tokens are secrets and must never reach the app bundle.** All token storage,
refresh (TikTok and YouTube both expire; Telegram's bot token is static) and outbound calls
live server-side behind the existing `admin-ops` gateway pattern with `ADMIN_OPS_KEY`. This
is the same decision SEC-05 already forced for every other writer.

### 2.4 Per-platform lint + gate
`brandLint` gains a tier per platform (all public platforms → strict tier, i.e. the
existing Tier-1 rules). The Two-Question checkboxes become **per-platform and mandatory for
every public destination**, not just cross-posts. Given §0, this gate will *correctly* block
digit-bearing reels until a redacted cut exists — that is the system working, and it should
not be weakened to make a phase pass.

### 2.5 Asset variants
Already produced: 9:16 master, 1:1 cut, contact sheet. Needed: a **30fps transcode** for
Reddit, and (if §0 resolves that way) the **redacted public cut**. Both are assembler
additions, not new pipelines.

### 2.6 Captions
`CAPTION_REGISTRY` already has the right shape. Platforms need: hashtag sets (YT Shorts,
TikTok), a title/body split (Reddit), and link policy (IG allows no in-caption links). Add
platform *transforms* over existing kinds rather than a caption kind per platform × reel
kind, which would be a combinatorial mess.

---

## 3. Phasing

| Phase | Scope | Effort | Depends on |
|---|---|---|---|
| **0** | **Operator decisions** (§5) — content posture, platform set, accounts/handles | — | nothing |
| **1** | Shared infra: registry, `social_deliveries`, `social-deliver` edge fn, per-platform lint/gate, admin Deliveries UI | 2–3 d | Phase 0 |
| **1b** | **Redacted public cut** (if chosen) — also unlocks the free session reel | 2–3 d | Phase 0 |
| **2** | **Telegram** — `sendVideo` to channel, caption, delivery logging | ~1 d | Phase 1 |
| **3** | **YouTube Shorts** — OAuth, resumable upload, `privacyStatus=private`, operator publishes | 2–3 d | Phase 1 |
| **4** | **TikTok** — OAuth, inbox/draft upload, operator completes in app | 2–3 d | Phase 1 + a TikTok content ruling |
| **5** | **Reddit** — assisted only: title/body/link generator, no automated posting | ~0.5 d | Phase 1 |
| **—** | **Instagram** — not built. Revisit only on Meta recovery | — | — |

**Realistic total for Telegram + YouTube + TikTok + Reddit-assist: ~8–12 working days**,
plus 1b if chosen. Lead times run in parallel and should start at Phase 0: Reddit OAuth
approval (2–4wk) and any TikTok/YouTube audit are calendar, not effort.

**Suggested minimum viable slice:** Phase 1 + Phase 2 (Telegram) + Phase 3 (YouTube,
private-upload). ~5–7 days, no external approval required, no platform we can be thrown off
without recourse, and it proves the whole delivery architecture end-to-end.

---

## 4. What I recommend against

- **Auto-posting anywhere.** The current no-auto-post rule is a brand-safety asset, not a
  gap. Every platform here has a draft/private path that keeps a human in the loop; use it.
- **Instagram, now.** §1.
- **The TikTok direct-post audit**, at least initially — 2–4 weeks of review to unlock a
  surface where our content class is FYP-ineligible anyway.
- **Automated Reddit posting.** Fastest route to a shadowban.
- **Weakening the Two-Question gate to let reels through.** If the gate blocks a platform,
  that is information about the content, not about the gate.

---

## 5. Decisions needed from the operator (blocking)

1. **Content posture for public platforms.** Pick one:
   - **(a)** Build the redacted public cut (~2–3 d, also unlocks the free session reel) — *recommended*
   - **(b)** Public channels carry verify/"Receipts" + brand content only; digit drops stay in groups — *cheapest, no build*
   - **(c)** Post current reels as-is and accept the enforcement risk — *not recommended given the FB history*
2. **Platform set.** Confirm Telegram + YouTube first, TikTok conditional, Reddit
   assist-only, Instagram deferred — or overrule.
3. **Accounts.** Which handles exist today? YouTube channel, TikTok account, Telegram
   channel, Reddit account with usable karma? Each needs to exist before its phase, and the
   Reddit account in particular cannot be created on demand and used immediately.

---

## Sources

- [TikTok Content Posting API — Get Started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [TikTok — Initialize Video Upload (inbox/draft)](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)
- [TikTok — Media Transfer Guide (PULL_FROM_URL verification)](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
- [TikTok Community Guidelines — Regulated Goods and Commercial Activities](https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities)
- [Meta — Instagram Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [YouTube Data API — Quota and Compliance Audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)
- [YouTube Data API — Getting Started (quota)](https://developers.google.com/youtube/v3/getting-started)
- [YouTube gambling policy update, Nov 2025](https://sbcamericas.com/2025/11/05/youtube-update-policy-gambling-content/)
- [Reddit API rate limits and pricing, 2026](https://www.redditapis.com/blogs/reddit-api-rate-limits-2026)
- [Reddit self-promotion rules, 2026](https://redship.io/blog/reddit-self-promotion-rules)
- [Reddit API video encoding limitations](https://techevangelistseo.com/reddit-api-documentation-encoding-limitations/)
- [Telegram Bot API — sendVideo](https://core.telegram.org/bots/api#sendvideo)
- [Meta linked-account cross-enforcement](https://e-cabilly.com/blog/suspended-meta-facebook-instagram-linked-accounts/)
