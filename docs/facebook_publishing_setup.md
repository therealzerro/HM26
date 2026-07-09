# Facebook Publishing Setup (SOCIAL-01)

One-time setup to connect the admin **Publish** view to the HitMaster Facebook
page. ~15-20 minutes, done once. After this, page posts publish/schedule
directly from the app. The Page token lives ONLY in a Supabase function
secret — never in the app bundle.

Verified against Meta's live console flow **2026-07-09**, Graph API **v25.0**.

## The one decision that avoids all the friction

Meta's "Create App" wizard forks into two app flavors that behave very
differently:

- **Business-type app** (what you want) — created via **"Other" → "Business"**.
  Has **no Development/Live mode toggle**, **no privacy-policy requirement**,
  and **no Facebook Login product to add**. Every permission (including
  `pages_manage_posts`) is available immediately at Standard Access. This is
  the path below.
- **Use-case app** ("Manage everything on your Page") — has a Live-mode
  toggle, requires a privacy-policy + data-deletion URL before going Live,
  and hides `pages_manage_posts` until you add it under Use cases → Customize.
  More steps, more blockers. If you already started one of these, see
  "If you picked the use-case app instead" at the bottom.

A single operator posting only to a page you admin needs **no App Review and
no Business Verification** — Standard Access is automatic. Any
"Complete Business Verification" banner during this flow can be ignored.

## Step 1 — Create the app (Business type)

1. Go to https://developers.facebook.com/apps → **Create App**.
2. **App details** screen: enter an app name (e.g. `HM Ops Console`) + your
   contact email → **Next**.
3. **Use cases** screen: scroll to the bottom, choose **"Other"** → **Next**.
4. **Select an app type** screen: choose **"Business"** → **Next**.
5. **Business portfolio** screen: choose **"I don't want to connect a
   business portfolio yet"** (optional, not needed) → **Create app**.
6. **Do NOT add any product.** You do not need "Facebook Login" or anything
   else — the Graph API Explorer mints the token on its own. (Older tutorials
   that tell you to add Facebook Login are describing a different task.)
7. **App settings → Basic**: note your **App ID** and **App Secret** (click
   Show). You only need these if you use the manual curl exchange in Step 3;
   the Explorer path below doesn't require them.

## Step 2 — Mint a User token in the Graph API Explorer

1. Left nav **Tools → Graph API Explorer** (or
   https://developers.facebook.com/tools/explorer/).
2. Right panel, **"Meta App"** dropdown → select the app you just created.
3. **"User or Page"** dropdown → **"Get User Access Token"**.
4. **"Permissions"** → **"Add a Permission"** → add these three:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
5. Click **"Generate Access Token"**. A Facebook login popup opens.
   - **Watch for the Page-selection step**: the popup asks which Pages to
     grant access to. **Check the HitMaster page.** (The #1 failure is
     granting the permissions but selecting zero pages — then Step 3 returns
     an empty list.) Log in as the account with **full control** of the page.
6. You now have a **short-lived** User token (~1 hour) in the token field.

## Step 3 — Extend it and get the permanent Page token

**Easiest path (no terminal):**

1. Click the **ⓘ info icon** next to the token → **"Open in Access Token
   Tool"** (opens https://developers.facebook.com/tools/debug/accesstoken/).
2. Scroll to the bottom → click **"Extend Access Token"**. You now have a
   long-lived (~60-day) User token. (If the button isn't there, the token is
   already long-lived — fine.)
3. Copy that extended token. Back in the Graph API Explorer, paste it into the
   access-token field, set the request to **`GET /me/accounts`**, click
   **Submit**.
4. In the response, find the HitMaster page in `data[]`. Copy its:
   - **`id`** → this is your **FB_PAGE_ID**
   - **`access_token`** → this is your **FB_PAGE_TOKEN** (a *Page* token
     derived from a long-lived user token **never expires**)

**Manual alternative (terminal, uses App Secret):**

```bash
# 3a. exchange short-lived user token → long-lived user token
curl "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_USER_TOKEN>"
# 3b. list pages (returns id + access_token per page)
curl "https://graph.facebook.com/v25.0/me/accounts?access_token=<LONG_USER_TOKEN>"
```

Never run the exchange call from the app / client — it carries the App Secret.
Doing it once by hand here is fine.

## Step 4 — Verify the token never expires

1. https://developers.facebook.com/tools/debug/accesstoken/ → paste the
   **Page token** → **Debug**.
2. Confirm **Type: Page** and **Expires: Never**. (Page tokens invalidate only
   if the account password changes, the app is deauthorized, or the account
   loses its page role.)

## Step 5 — Set the Supabase secrets

```bash
supabase secrets set FB_PAGE_ID=<page-id> FB_PAGE_TOKEN=<page-token> --project-ref tgagarhwqbdcwoqhpapi
```

`ADMIN_OPS_KEY` already exists (shared with the subscriber-tracking gateway)
and is reused by fb-publish. Optional: `FB_GRAPH_VERSION` (defaults to `v25.0`).

## Step 6 — Verify in the app

Admin tab → **Publish** → the **PAGE CONNECTION** card should show
`🟢 <page name> connected`. That card calls the edge function's `status`
action, which round-trips the token against the Graph API. If it shows a token
error, re-check Step 3 (usually the page wasn't selected in the login popup, or
you copied the user token instead of the page token).

## Step 7 (optional) — Group deep links

So the group lane's "Open Facebook" button lands in the right place:

```sql
INSERT INTO app_config (key, value) VALUES
  ('social_free_group_url', '"https://www.facebook.com/groups/<free-group>"'),
  ('social_pro_url',        '"https://www.facebook.com/groups/<pro-group>"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

---

## What the system enforces (and why)

- **Page lane is text-only in v1.** The brief's sanctioned public formats
  (yesterday's report card, signal announcement) are text posts — the
  classifier reads images via OCR, so clean text posts carry near-zero
  classifier risk. This is what re-earned the recommendation.
- **Tier-1 vocabulary lint runs twice** — full engine client-side with
  suggestions, subset server-side in the edge function. Blocking violations
  disable publish; a server refusal can be overridden only with an explicit,
  logged override (brief escalation protocol).
- **Groups are assisted, never automated.** Meta removed the Groups API on
  2024-04-22; no compliant tool can auto-post to groups. The group lane copies
  the caption, hands the image through the existing export pipeline, opens
  Facebook, and logs the handoff. Meta also prohibits prefilling the share
  message, so the clipboard step is the sanctioned pattern (same as
  Buffer/Hootsuite "reminder publishing").
- **Every post is logged** to `social_posts` (service-role only): tier,
  destination, caption hash, lint overrides, Two-Question acks, FB post ID.
  Same-day duplicate captions across groups are flagged at handoff (the
  brief's Tier-3 spam rule).

## Scheduling notes

- "Tomorrow 8:15a" uses Meta's native `scheduled_publish_time` — Facebook
  stores the post, not us. Constraint: 10 minutes to 30 days out.
- Scheduled posts appear in Meta Business Suite → Planner and can be edited
  or deleted there.

## If you picked the use-case app instead ("Manage everything on your Page")

You can still use it — three extra things:

1. **Dashboard → Use cases → Customize** → click **"Add"** next to
   `pages_manage_posts` (the use case doesn't include it by default), then
   **"Ready to test"**.
2. This app flavor has an **App Mode toggle** (top of the dashboard). Posts
   made in **Development** mode are visible only to app role users — flip to
   **Live** for public posts.
3. Going Live requires **App settings → Basic** to have a **Privacy Policy
   URL**, a **User data deletion** option (a simple instructions-URL is
   accepted), a **Category**, and a **1024×1024 app icon**. The Business-type
   app in the main flow above avoids all of this.

## Troubleshooting quick table

| Symptom | Cause | Fix |
|---|---|---|
| `/me/accounts` returns `[]` | Page not selected in the login popup, or you lack full control of an NPE page | Re-run "Generate Access Token", check the page in the popup |
| PAGE CONNECTION shows token error | Copied the user token, not the page token | Redo Step 3.4 — use the `access_token` from the page's row |
| `pages_manage_posts` missing in Explorer | You made a use-case app | Add it under Use cases → Customize (see above) |
| "Extend Access Token" button absent | Token already long-lived | Not an error — proceed |
| "Complete Business Verification" banner | Only needed for Advanced Access | Ignore — Standard Access is auto-approved |
