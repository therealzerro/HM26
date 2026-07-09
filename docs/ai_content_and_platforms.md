# AI Content Generation + Multi-Platform Publishing (SOCIAL-04 / roadmap)

Research verified 2026-07-09. This is the reference for the AI layer that shipped
with SOCIAL-04 and the platform-expansion roadmap.

## AI layer (SHIPPED)

**Edge function `ai-content`** (X-Admin-Key gated, same as fb-publish):

| Action | Pipeline | Cost/asset |
|---|---|---|
| `generate_caption` | Claude `claude-opus-4-8` (structured outputs) → client brandLint re-check | ~$0.01 |
| `generate_brand_image` | Claude composes brief-§8 Gemini prompt (+ mechanical prohibition clause + rendered-text safety check) → Gemini 3 Pro Image renders | ~$0.15 |

**One-time setup** (paid Gemini tier required — image/video generation has NO free tier):

```bash
# 1. Anthropic key: console.anthropic.com → API keys
# 2. Gemini key: aistudio.google.com → Get API key (attach billing, Tier 1)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... GEMINI_API_KEY=AIza... --project-ref tgagarhwqbdcwoqhpapi
# then redeploy so fresh instances read them:
supabase functions deploy ai-content --project-ref tgagarhwqbdcwoqhpapi
```

The Publish view's CONNECTIONS card shows Claude ✓ / Gemini ✓ when live.

**Model facts (verified):**
- Image: **Nano Banana Pro = `gemini-3-pro-image`** (GA since Nov 2025 — the brief's
  "Gemini 3 Pro Image", ID updated from `-preview`). $0.134/image at 1K/2K.
  Native 9:16 / 1:1 / 4:5; size classes use uppercase K ("1K"/"2K"/"4K");
  base64 inline output. We default 1K to stay near Meta's preferred <1MB.
  Cheaper tier exists: `gemini-3.1-flash-image` ("Nano Banana 2") — switch via
  the `GEMINI_IMAGE_MODEL` secret if cost ever matters.
- **"Gemini Omni" is real** — Google's I/O 2026 any-to-any VIDEO family
  (`gemini-omni-flash-preview`, Interactions API, ~$0.10/s, 3-10s, 720p, 9:16,
  audio included). It does NOT replace Nano Banana for stills.
- Video option B: **Veo 3.1** (`veo-3.1-fast-generate-preview`) — 4/6/8s, 9:16,
  native audio, $0.80 per 8s at 720p Fast. Async: predictLongRunning → poll →
  download URI (results kept only 2 days).
- **SynthID watermark is mandatory + invisible** on all Gemini media. Platforms
  (Meta/TikTok/YouTube) may auto-label content as AI-generated — that label is
  not a policy strike, but it IS another classifier touchpoint; keep AI imagery
  brand-abstract (the §8 conventions already do this).

**Video generation = fast-follow, not shipped.** Both Veo and Omni are async
(11s-6min) — doesn't fit one edge invocation. Design when needed: `ai-content`
gains `start_video` (returns operation name, persisted to ai_generations) +
`poll_video`; the Publish view polls. Est. ~1 day of work.

**Safety architecture (unchanged by AI):** generation ≠ clearance. Every AI
caption passes the same client brandLint; every AI image requires the same
Two-Question NO/NO ack before page publishing; the server refuses its own
composed prompt if a 3-digit number or forbidden word reaches the rendered-text
list; everything logs to `ai_generations`.

## Platform roadmap (researched, not yet built)

| Order | Platform | Effort | Gate | Key facts |
|---|---|---|---|---|
| 1 | **Telegram** | ~2h | none | Bot token from @BotFather → sendPhoto/sendVideo/sendMessage to channel. 50MB video, HTML formatting — ideal for the text brief. |
| 2 | **Discord** | ~1h | none | Per-channel webhook URL, rich embeds (fields = stats), 10MiB default attachment cap (2025 change). Natural Pro-tier community home. |
| 3 | **Instagram** | ~1 day | none (own account, Standard Access) | SAME Meta app + token model. Link IG professional account to the FB page, grant `instagram_basic` + `instagram_content_publish`. Container flow: POST /{ig-user-id}/media → /media_publish. **JPEG only for images** (convert PNGs!), images need a public URL (Supabase Storage bucket); Reels 3s-15min ≤300MB 9:16. 100 API posts/day. |
| 4 | **YouTube Shorts** | moderate + audit wait | **compliance audit** — unaudited uploads locked PRIVATE | Quota pain is gone (dedicated upload bucket, ~100/day since 6/2026). Shorts = vertical ≤3min, no API flag. Start the audit paperwork early; upload private during the wait. |
| 5 | **TikTok** | heavy | scope review + client audit (2-4 wks), unaudited = SELF_ONLY | Chunked upload + creator-info preflight + polling. Defer unless the audience is specifically wanted. |

**Architecture when built:** one `social-publish` edge function with per-platform
adapters (secrets: TELEGRAM_BOT_TOKEN, DISCORD_WEBHOOK_URL, IG via existing FB
token, YOUTUBE_REFRESH_TOKEN, ...). The Publish view's surface picker grows
beyond Facebook surfaces; captions get per-platform length adapters; `social_posts`
gains a `platform` column. Cross-platform duplicate content is NOT penalized —
but always upload the original file per platform (never a TikTok-watermarked
re-download; that costs 30-50% reach on IG/YT).

**Brand-safety note:** Instagram runs through the same Meta app and the same
classifiers that de-recommended the page — §6 surface discipline and the
Two-Question filter apply with full force there. YouTube/TikTok also classify
gambling-adjacent content aggressively; the "data intelligence" framing matters
most on exactly the platforms with review gates.
