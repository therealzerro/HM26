# MKT-81 — hitmasterzk.com: the owned funnel, Phase One · Phase 0 discovery report

Date: 2026-09-18 · Status: **REPORTED, WAITING ON RULINGS (items 1, 3, 5)** — nothing built, no table, no edge function, no DNS change, no host account.
ID check: `MKT-81` absent from MASTER_AUDIT, handoff, REEL_COMMANDS, scripts/constants/lib/components → free, stamped here (handoff v7.4 says "Next free MKT ID: 81").
Work order: content agent 2026-09-18 ("THE OWNED FUNNEL, PHASE ONE", Phase 0 items 1–5, then GATE). Pattern: discovery-first, gates, diff before commit.

Standing law carried into this lane, recorded so no future session relaxes it: **hitmasterzk.com is a TIER-1 SURFACE.** Meta reviews the ad's destination, not just the ad (policy text in item 4/§B). The Two-Question filter applies to every rendered string, stat and image on the domain. The 9/2 spec's live Verified Track Record embed is **WITHDRAWN** — the page carries the four summary stats only (days-of-30, exact-order count, jurisdiction count, date range), all two-digit. The row-level record stays inside the group. Gate record stored in `assets/marketing/_public_gate_records.json` exactly as a public reel kind's, keyed `site_hitmasterzk` (the enforcer `checkPublicGateRecords()` in `scripts/check-reel-assets.ts:1120-1151` will need that key appended when the page ships).

---

## 0. What discovery found (the facts the rulings rest on)

**Nothing exists yet.** Repo-wide: no landing page, no Meta Pixel (`fbq` hits only in bun.lock hashes), no email-capture or leads concept, no ESP integration. `app_config.brand_domain = "hitmasterzk.com"` (BRAND-07, 8/6) is read by **zero** code paths. Greenfield; nothing to collide with.

**Live DNS for hitmasterzk.com (resolved 2026-09-18 from this codespace):**

| record | value | meaning |
|---|---|---|
| NS | ns59 / ns60.domaincontrol.com | GoDaddy nameservers |
| @ A | 3.33.130.190, 15.197.148.33 | GoDaddy **forwarding/parking** IPs (BRAND-07 recorded the same two) |
| www CNAME | hitmasterzk.com | points at the parking |
| MX | **none** | **the domain has no mail.** Nothing to break |
| _dmarc TXT | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` | GoDaddy's default anti-spoof record |
| TXT @ | none | no domain verifications yet (Meta domain verification will need one) |
| HTTPS | **fails** (no certificate) · HTTP → `403 Request forbidden by administrative rules` | the parking page. The domain currently serves nothing |

GoDaddy's own docs: **"Adding forwarding will automatically update and lock your @ A record. If you need to change it, you'll need to delete forwarding first."** and CNAME name **"Cannot be the @ symbol"** (no apex CNAME at GoDaddy). Both shape item 2.

**Supabase side.** Project `tgagarhwqbdcwoqhpapi`. 15 edge functions, **all `verify_jwt: true`**; the anon key is a valid JWT so verify_jwt=true still admits anonymous callers that carry it (the app's own posture). The only body-level unauthenticated path in the codebase is `admin-ops` `action:'unlock'` (rate-limited 5/15min via `admin_unlock_attempts`). PII posture is fixed by `supabase/migrations/2026-05-19_subscriber_tracking.sql`: **RLS on, zero policies, service-role only, via a gateway function** — verified live (`pro_subscribers` relrowsecurity=true, no policies). `pro_subscribers.email TEXT UNIQUE NOT NULL` already exists; a leads table joins to it by email later without migration. Supabase plan tier is still the unanswered 7/31 dashboard question (audit "OPEN — OPERATOR DECISIONS" item 4); for this lane it does not matter — Free includes 500k function invocations/month and a lead form will never approach that. (Free projects pause after a week of inactivity; the Daily Workflow keeps it warm.)

**The record stats.** `scripts/reel-record-stats.ts` is the single computation (`summarize()` :73, `fetchTrackRecordSummary()` :96, `recordWindow()` :102, `rangeLabel()` :123) — a node-side mirror of `app/track-record.tsx` over `adaptive_tracking`, mode balanced, 30 COMPLETE days ending D−1. The reel's finals carry the figures as container tags (`hm_record_days/of/exact/juris/range/since/until`, `scripts/reel-provenance.ts:86-113`) and the assembler re-asserts them (count gate, `assemble-record-reel.ts:65-74`). That is the source the page must read (item 7 note in §6).

---

## 1. HOSTING — compared, not defaulted

What the site must do: serve one static page fast over HTTPS, host the Meta Pixel, accept an email POST, and link/redirect to the free group. It does **not** need server rendering, a database of its own, or a build pipeline beyond "upload files".

| option | setup cost | running cost | **ongoing maintenance burden (solo operator)** | verdict |
|---|---|---|---|---|
| **(a) AWS** S3 + CloudFront + Route 53 + ACM | Highest: bucket + origin-access control + distribution + cert (must be issued in us-east-1, DNS-validated) + hosted zone. Four consoles, IAM. Apex needs a Route 53 ALIAS, so nameservers move to AWS anyway | Route 53 **$0.50/zone/mo** + queries; ACM public certs free; CloudFront now sells a **$0/mo Free plan (1M requests, 100 GB)**; S3 pennies. ≈ $1/mo | **Highest.** Every deploy = upload + cache invalidation; IAM keys to rotate; the form still needs a Lambda + API Gateway or goes to Supabase anyway. Nothing here the other options don't give for free with no ops | **Rejected** — the most moving parts for zero benefit at this scale |
| **(b) Cloudflare Pages** | Low: connect the repo folder or `wrangler pages deploy`; add custom domain; SSL automatic | **$0.** Free tier: 500 builds/mo, 20k files, 25 MiB/asset; Workers free 100k req/day (not needed if the form posts to Supabase) | **Lowest.** Deploy = push or one CLI line; no cache invalidation; no certs to renew. **One catch (verified on their docs):** an **apex** custom domain (`hitmasterzk.com`) **requires the domain's nameservers to be at Cloudflare**; a subdomain (`www.`) works via CNAME from GoDaddy DNS | **Recommended static host** |
| **(c) Vercel** | Low | Hobby is **$0 but "restricted to non-commercial, personal use only"** (Fair Use, 2026-09-14); "Advertising the sale of a product or service" is their listed example of commercial use. A landing page for a $2.49/mo product is commercial → **Pro, $20/mo** | Low | **Rejected on cost** — $240/yr for what (b) does for $0 |
| **Netlify** (not in the order, included because it keeps GoDaddy nameservers) | Low | $0 "300 credits/mo": deploys 15 cr, bandwidth 20 cr/GB (≈15 GB/mo), forms free. **When credits run out the site is paused and visitors see "Site not available"** | Low, but **an ad destination that can go dark mid-campaign is a liability** | **Fallback only**, if the operator refuses to move nameservers |
| GitHub Pages | Low | $0 | Low | **Rejected** — ToS: "not intended for or allowed to be used as a free web-hosting service to run your online business" |
| **(d) Supabase-centric** — static host of choice + Edge Function for the form + the list in our Postgres | One edge function (same shape as `subscriber-admin`), one migration (same RLS posture as `pro_subscribers`) | $0 on Free (500k invocations); already paying if Pro | **Same maintenance as everything else we run** — one backend, one secrets store, one deploy command we already use, one admin gateway to extend for export | **Recommended** for the form and the list, combined with (b) for the static files |

**Ruling requested: (d) + (b).** Cloudflare Pages serves the page; a new `lead-capture` edge function writes to a new `web_leads` table in the existing project; nothing else new.

**Does the architectural reasoning for (d) hold?** Yes, and it is stronger than stated. Phase Three (if the Stripe answer ever permits it) needs auth, subscription state and billing webhooks; all three would live in this Supabase project because that is where `pro_subscribers`, `funnel_daily_snapshots` and the admin gateway already are. A list that starts in `web_leads` is joined to `pro_subscribers.email` by one query. A list that starts in Mailchimp/Kit/Typeform is an export, an import, a dedupe and a consent-provenance argument later. Second reason, independent of Phase Three: **the export path already exists in shape** — `subscriber-admin` is a service-role gateway with an action list; `list_leads` / `export_leads_csv` are one action each, read by the admin Engagement tab or the CLI. Third: the static host is **irrelevant** to Phase Three. Only the database placement matters, so the host can be the cheapest thing that stays up.

One design note for the build (not a ruling): the edge function keeps `verify_jwt: true` and the page sends the **publishable anon key** exactly as the app does — no `--no-verify-jwt` deploy, no new posture. CORS on the function is pinned to `https://hitmasterzk.com` (and `www`), not `*` as `admin-ops` uses.

---

## 2. DNS AT GODADDY — exact records for the recommended option

**Mail risk: none.** There are no MX records; no mailbox has ever been attached to this domain. The only records that exist are the parking A, the www CNAME and GoDaddy's default DMARC TXT. Nothing else is configured.

### Path B (recommended) — move nameservers to Cloudflare, serve apex + www

1. **GoDaddy → Domain → Forwarding: DELETE the forwarding rule first.** (Their doc: forwarding locks the @ A record and pins GoDaddy nameservers; nothing below can be changed while it exists.)
2. **Cloudflare (free account) → Add a site → hitmasterzk.com → Free plan.** Cloudflare scans and imports the existing records; it will show the two Cloudflare-assigned nameservers (form `xxxx.ns.cloudflare.com` / `yyyy.ns.cloudflare.com`; the exact pair is assigned at zone creation and must be copied from that screen).
3. **GoDaddy → Domain → Nameservers → "I'll use my own nameservers" → enter the two Cloudflare nameservers.** Propagation: minutes to 24 h.
4. **Cloudflare DNS for the zone — final record set** (replace whatever the import carried):

| type | name | value | proxy | note |
|---|---|---|---|---|
| CNAME | `@` | `<project>.pages.dev` | proxied (orange) | Cloudflare flattens the apex CNAME; this is the only way to get the bare domain on Pages |
| CNAME | `www` | `<project>.pages.dev` | proxied | Pages redirects www → apex (or the reverse) once both are added under the project's Custom domains |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r;` | — | keep the quarantine policy so nobody can spoof the domain; the `rua=` GoDaddy collector may be dropped or pointed at the operator's address |
| TXT | `@` | `facebook-domain-verification=<token>` | — | **added when item 4's domain verification runs** (Meta Business Settings → Brand Safety → Domains); required before the pixel's events can be configured for ads |
| — | — | *delete* the two parking A records (3.33.130.190 / 15.197.148.33) | | they are GoDaddy's forwarding, meaningless off GoDaddy DNS |

5. **Cloudflare Pages → project → Custom domains → add `hitmasterzk.com` and `www.hitmasterzk.com`** (must be added in the dashboard *before* the CNAMEs resolve, or the docs warn of a 522). SSL issues automatically.

### Path A (fallback, keeps GoDaddy nameservers) — www only

| step | at GoDaddy |
|---|---|
| 1 | Delete forwarding (same reason) |
| 2 | Edit the `www` CNAME: value `hitmasterzk.com` → `<project>.pages.dev` |
| 3 | Re-create forwarding: `hitmasterzk.com` → `https://www.hitmasterzk.com`, **Permanent (301)**, no masking |
| 4 | Add TXT `@` `facebook-domain-verification=<token>` when item 4 runs |

Cost of Path A: the bare domain only forwards over **HTTP** (GoDaddy forwarding has no certificate for the apex, which is why `https://hitmasterzk.com` fails today). The ad destination would be `https://www.hitmasterzk.com` and anyone typing the bare name gets one insecure hop. Acceptable, not clean. Netlify would instead take `@ A 75.2.60.5` + `www CNAME <site>.netlify.app` at GoDaddy with no forwarding, at the credit-pause risk noted in §1.

**Recommendation: Path B.** Three records to recreate, no mail, and Cloudflare DNS is a better registrar-independent home for the Meta verification TXT and anything Phase Two adds.

---

## 3. THE EMAIL LIST — schema, export, sending

This is the deliverable of Phase One. Proposed table, same posture as every PII table in the project (RLS on, zero policies, service-role writes through a function):

```sql
CREATE TABLE web_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,            -- stored lower-cased + trimmed by the function
  source          text NOT NULL DEFAULT 'hitmasterzk.com',   -- surface that captured it
  campaign        text,                            -- utm_campaign (Meta campaign name, operator-chosen, Q1/Q2-clean)
  asset           text,                            -- utm_content: which ad / creative / reel brought them
  utm_source      text,                            -- 'facebook' / 'instagram' / 'youtube' / null
  utm_medium      text,                            -- 'paid' / 'organic' / 'reel'
  fbclid          text,                            -- Meta click id, for later Conversions API matching; never rendered
  consent         boolean NOT NULL DEFAULT false,  -- true only when the visible consent line was shown and the submit succeeded
  consent_text_v  text,                            -- version tag of the consent sentence they saw (so the record proves WHAT they agreed to)
  consent_at      timestamptz,
  ip_hash         text,                            -- sha256(ip + daily salt); rate-limit key; raw IP never stored
  user_agent      text,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  touches         integer NOT NULL DEFAULT 1,      -- repeat submits bump this instead of erroring
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed','bounced','suppressed')),
  unsubscribed_at timestamptz,
  notes           text
);
ALTER TABLE web_leads ENABLE ROW LEVEL SECURITY;   -- intentionally NO policies (service role only) — same as pro_subscribers
CREATE INDEX idx_web_leads_first_seen ON web_leads (first_seen_at DESC);
```

Plus `web_lead_attempts (ip_hash, window_start, count)` for the rate limit, mirroring `admin_unlock_attempts`. Function `lead-capture`: validate email shape, honeypot field must be empty, rate-limit 5 submits / 15 min per ip_hash, upsert on email (first submit inserts; repeat bumps `touches` + `last_seen_at` and returns 200 so the page never reveals whether an email is known). Returns `{ok:true}` only; the page then fires the pixel Lead event and reveals the group link.

**Consent (ruling embedded in the schema).** US audience; CAN-SPAM does not require opt-in, but every ESP requires documented permission before an imported list can be sent to. Recommended: no checkbox, one visible sentence next to the field ("By entering your email you agree to receive the daily signal report and occasional updates. Unsubscribe any time.") → `consent=true, consent_text_v='v1'` on a successful submit. Copy is the content agent's; the *mechanism* — sentence visible at submit, version stored per row — is what makes the list importable anywhere later.

**Export.** One action on the existing `subscriber-admin` gateway (`export_leads` → CSV: email, first_seen_at, source, campaign, asset, consent, consent_text_v, status) surfaced two ways: a button in Admin → Engagement, and `npm run leads:export` from the CLI. The CLI path uses the service-role token in `.env.backtest`, which the 9/2 note records as **EXPIRED** — the admin-tab path does not depend on it. Every ESP (Resend, Postmark, Kit, Mailchimp, Beehiiv) imports that CSV; the consent columns are what their import forms ask for.

**Sending — not built in Phase One, but the list is built so it can be.** What sending will require when it is authorised: (i) an ESP account (Resend is the Supabase-native fit: a `send-digest` edge function + Resend API key; Kit/Beehiiv are the no-code fit), (ii) a sending domain — `mail.hitmasterzk.com` or the apex — with **SPF, DKIM and the DMARC record above** (which is why the DMARC TXT is kept now), (iii) a public unsubscribe endpoint that flips `status` — the one page-side thing sending needs, (iv) the content is the existing Pro brief / daily signal text, already Q-clean for the free tier. Until then the list is a database with a proven export, which is the 80% the work order names.

---

## 4. THE META PIXEL — placement, events, and what the platform reads

**Placement.** Base snippet in `<head>` of the one page, standard form (script + `<noscript><img src="https://www.facebook.com/tr?id=<PIXEL_ID>&ev=PageView&noscript=1"/>` fallback). Pixel ID comes from the operator's Events Manager. **Domain verification first**: Business Settings → Brand Safety → Domains → add `hitmasterzk.com` → the TXT record in item 2. Without it Meta will not let the page's events be configured for ad optimisation.

**Events worth firing — three, no more:**

| moment | event | type | params |
|---|---|---|---|
| page load | `PageView` | standard (base code) | none |
| lead-capture returns 200 | `Lead` | standard — "When a sign up is completed" | none. **No `value`/`currency`** — attaching money to the event is exactly the monetary framing the domain must not carry |
| tap on the free-group CTA | `CommunityClick` | custom (`fbq('trackCustom', …)`, ≤50 chars) | none. Registered in Events Manager so it survives restricted-category "Core Setup" (see below) |

`CompleteRegistration` is the alternative for the email; `Lead` is preferred because it is the standard event Meta's lead-optimisation objectives expect. `Contact`, `ViewContent`, `Subscribe`, `StartTrial`, `Purchase` are **not** fired — the last three describe a paid funnel this page does not have.

**Can an event carry data that makes the domain look gambling-adjacent?** Yes, in three places, all avoidable by construction:

1. **Custom event names are read.** `JoinPicksGroup`, `LotteryLead`, `PlayNow` would be self-inflicted. `CommunityClick` carries nothing. Rule for the build: every custom event name passes the same tier-1 `lintCaption` the reels use.
2. **Parameters and URL query strings are read.** The pixel sends the full page URL including `?utm_campaign=…`. A campaign named `lottery_picks_sept` or `pick3_signals` puts the forbidden word in every event Meta receives. **UTM values are Tier-1 strings**: the operator names campaigns/assets from the allowed vocabulary (`signals_sep`, `record_reel_a`) and the build lints the UTM keys it stores. No `content_name`, `content_category` or `content_ids` params at all — there is nothing to describe.
3. **Business Tools Terms §1.h** forbids sending "financial information … or other categories of sensitive information" and says event naming "must not reflect, imply or be based on" those categories. A lead form with an email only is clean; the email itself goes to Meta only as Advanced Matching (hashed) if enabled — recommend **off** in Phase One; nothing is gained for a lead objective.

**The restricted-category risk, stated.** If Meta classifies the domain into Online Gambling and Games, Events Manager applies "Core Setup" data restrictions: custom parameters and URL parts after the domain are not shared, unregistered custom events are dropped, lower-funnel events may be restricted (third-party summaries agree; Meta's help page would not render for verification). Design consequence, already in the table above: the funnel is measurable on **`PageView` + `Lead` alone**, the one custom event is registered, and no optimisation depends on parameters. If the domain is classified, the ads have bigger problems than the pixel (§B), and the page's Q1/Q2 discipline is what prevents the classification in the first place.

**Conversions API** (server-side events from the edge function, matched by `fbclid`) is the Phase Two upgrade if browser-side `Lead` under-reports (iOS/ad-blockers). The `fbclid` column exists for that; nothing else is built toward it.

### B. The Meta destination policy, verbatim, because it is the constraint

Online Gambling and Games (Transparency Center, current): authorization is required for **"Ads with destination (landing) pages that contain promotions for online gambling or games, even if there is no opportunity to gamble or game directly on that page, such as aggregator or affiliate sites."** "Some common types of gambling include betting, **lotteries**, raffles…". The state-lottery exemption reads "State or government lotteries, **as long as the advertiser is directly or exclusively responsible for running the lottery**" — a third-party analytics site does not qualify. Meta's definition of the category — "any product or service where anything of monetary value is included as part of a method of entry and prize" — does not describe an analytics subscription, which is the line the page and the ad stand on. An older Meta help text (quoted by Ifrah Law; not on the current page, treat as unverified) extended the policy to "sites or services providing tips or picks". That sentence is why the vocabulary ban is absolute on this domain: "tips", "picks", "predictions" of draw outcomes are the words the reviewer is trained on.

Prohibited Commercial Practices / fraud-scams standard, verbatim bullets the copy must never trip: "Offers of real money gambling services…with a guarantee of winning"; "Offers of investment opportunities claiming or referencing successful past performance"; "Offers of opportunities of unrealistic financial reward for unclear or minimal effort". The record stats are an observed-outcome count, not a return claim; the "what it isn't" and footer sections in the build order ("not prediction, not advice, no guarantee") are load-bearing for this standard, not decoration.

---

## 5. STRIPE — discovery only; the item that decides Phase Three

**Source:** stripe.com/legal/restricted-businesses, "Last Updated: 2026-05-13". Two lists: **Prohibited** ("Industries that can't use Stripe") and **Restricted** ("require additional due diligence by Stripe … Stripe might not be able to grant approval").

Under **PROHIBITED → Gambling**, verbatim:
- "Games of chance including gambling, internet gambling, casino games, sweepstakes and contests, and fantasy sports leagues with a monetary or material prize"
- "Payments of an entry or player fee that promise the entrant or player will win a prize of value"
- "**Sports forecasting or odds-making with a monetary or material prize**"
- "**Lotteries**" — a bare word, no qualifier
- "Bidding fee auctions"

Under **PROHIBITED → Unfair, deceptive**: "'Get rich quick' schemes, including investment opportunities or other services that promise high rewards". Under **RESTRICTED → Financial Products & Services**: "Investment and brokerage services…", lending, BNPL, money transmission — **gambling and lottery do not appear in the Restricted list at all; they are Prohibited**, which means there is **no due-diligence/prior-approval path** for them. The page's only route is "If you have questions about prohibited and restricted businesses, you can contact us" (support), or sales for the financial-services categories.

**How the product reads against it, honestly.** HitMaster sells no entry, no prize, no odds "with a monetary or material prize"; it sells analysis of published public draw results, graded after the fact, misses included. On the letter of the list it is none of the Gambling entries. But "Lotteries" is a bare-word entry, Stripe's risk team classifies on its own reading, and the merchant description, the site and the App Store copy will all say what the numbers are. A reviewer who keyword-matches "lottery" lands on Prohibited, and Prohibited has no appeal form. Stripe has **no published position on lottery-analysis or prediction services** (searched; nothing on any Stripe page).

**What a freeze looks like (verified vs not).** Verified on Stripe's own pages: reserves are "a temporary hold on a portion of a business's funds for a predetermined period"; fixed or rolling; "You can't reserve funds for longer than 180 days"; "Stripe accounts cannot be closed with an existing balance … positive balances must first be paid out". **Not verifiable on Stripe's site**: the widely repeated "120-day payout pause on accounts closed for unacceptable risk" — third-party only; treat as plausible, unproven.

**The merchant-of-record alternatives are worse, not better.** Paddle (prohibited, no approval path): "lotteries, auctions, contests, sweepstakes, or games of chance"; "Sports forecasting/odds making where monetary or material prizes are involved"; "**Investment or financial advice, including trading signals and strategies**"; "get-rich-quick schemes". Lemon Squeezy: "Regulated products such as: … gambling, … sweepstakes, lotteries, … get-rich-quick schemes". Both name the category by the word.

**Application path, as the operator's decision:** write to Stripe support *before* any account is used for this product, describing it as a subscription analytics/reporting service over public draw data with no wagering, no prizes, no guarantee, and ask for a written yes/no. The answer is binary and it decides Phase Three. Two facts go with it: (i) the rail that is unambiguously permitted for this product is **Apple/Google in-app purchase** (the parked iOS cutover — Apple reviews the app, not the payment category); (ii) the 30% Meta keeps is the price of a rail that has never frozen a payout. Recommendation on the record: **do not open a Stripe account speculatively**; ask first, in writing, and keep the answer in the audit.

---

## 6. Answers the build order asked ahead of time (no rulings needed, recorded so Phase 1 starts clean)

- **Item 7 — same computation as record_public.** The page does **not** query Supabase at view time. The site build reads the finished record reel's container tags (`hm_record_days/of/exact/juris/range`) — the same figures the assembler already count-gated — and bakes them into `record_stats.json` next to the page. If no final exists for D−1 the site build refuses (same fail-closed shape as the reel's count gate). The page therefore cannot disagree with the reel it was built from, and no adaptive_tracking row ever transits the domain. Publish = one more step appended to `npm run reel:record` (or a sibling `site:publish`), never a scheduled job.
- **Item 8 — gate vs alongside.** *Alongside.* Gating the group link behind the email costs the join the funnel is measured on (every field a form adds costs conversions; the operator's own measure is free-group joins at ~$1.67). Alongside costs nothing measurable and the email still captures the fraction who prefer it. Both CTAs present in the hero; after a successful email submit the group link is repeated in the confirmation state, so the email path also ends at the group.
- **Item 10** — first render check at 380px, the reels' feed width (`_feed.png` is already the standing eyeball width).
- **Phase Two economics, recorded:** $100 buys ~60 free-group joins at ~$1.67, not 60 Pro; ~7 Pro over time ≈ $150–230 lifetime at $1.74/mo net. **The campaign is judged on LTV, not month one.** Affordable Pro CAC $7–11 at 3:1.
- **Phase Three: NOT AUTHORISED.** Not designed for, not stubbed. Reasons as the order states them (multi-tenant billing = months; gated on §5; 60 Meta-billed subscribers cannot be migrated and the August cohort churned 41% at first renewal; when it happens it is new-subscribers-only, both rails in parallel).

---

## The gate

Waiting on three rulings: **(1)** hosting = (d)+(b), Cloudflare Pages + Supabase function/table, DNS Path B; **(3)** the `web_leads` schema + consent mechanism + export via the subscriber-admin gateway; **(5)** whether the operator writes to Stripe now. Items 2 and 4 are informational and need no ruling. Nothing proceeds to Phase 1 until (1) and (3) are ruled; (5) can be answered any time and blocks only Phase Three.
