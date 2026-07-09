# Facebook Publishing Setup (SOCIAL-01)

One-time setup to connect the admin **Publish** view to the HitMaster Facebook
page. ~20 minutes. After this, page posts publish/schedule directly from the
app; the Page token lives ONLY in Supabase function secrets.

Facts current as of 2026-07-09 (Graph API **v25.0**). Key point: a
single-operator app that posts only to pages **you admin** needs **no App
Review and no Business Verification** — Standard Access is granted
automatically and applies to app role users (you).

## 1. Create the Meta app

1. Go to https://developers.facebook.com/apps → **Create App**.
2. Type: **Business**. Name it something neutral, e.g. `HM Ops Console`.
3. Once created: **App settings → Basic** — note the **App ID** and **App Secret**.
4. Add the **Facebook Login** product (default settings are fine — we only
   use it to mint a token once via the Graph API Explorer).
5. **Switch the app to Live mode** (toggle at the top). Important: posts made
   by an app in Development mode are visible ONLY to app role users — Live
   mode is required for public visibility. Live mode does NOT trigger App
   Review when only role users (you) grant permissions.

## 2. Mint the permanent Page token

1. Open the **Graph API Explorer** (https://developers.facebook.com/tools/explorer),
   select your app.
2. **User or Page** → *Get User Access Token*, grant these permissions:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
   Log in as the account that has **Full control** of the HitMaster page.
3. Copy the short-lived user token, then exchange it for a long-lived one
   (server-side because it uses the App Secret — run from any terminal):

   ```
   curl "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_TOKEN>"
   ```

4. With the returned long-lived user token, list your pages:

   ```
   curl "https://graph.facebook.com/v25.0/me/accounts?access_token=<LONG_USER_TOKEN>"
   ```

   Find the HitMaster page entry — copy its **`id`** (the Page ID) and
   **`access_token`** (the Page token).
5. This Page token **does not expire**. It is invalidated only if the
   account password changes, the app is deauthorized, or the account loses
   its page role. Verify anytime at https://developers.facebook.com/tools/debug/accesstoken/
   (should show *Expires: Never*).

## 3. Set the Supabase secrets

```bash
supabase secrets set FB_PAGE_ID=<page-id> FB_PAGE_TOKEN=<page-token> --project-ref tgagarhwqbdcwoqhpapi
```

(`ADMIN_OPS_KEY` already exists from the subscriber-tracking setup and is
shared by fb-publish.)

## 4. Verify in the app

Admin tab → **Publish** → the PAGE CONNECTION card should show
`🟢 <page name> connected`. That card calls the edge function `status`
action, which round-trips the token against the Graph API.

## What the system enforces (and why)

- **Page lane is text-only in v1.** The brief's sanctioned public formats
  (yesterday's report card, signal announcement) are text posts — the
  classifier reads images via OCR, text posts with clean vocabulary carry
  near-zero classifier risk. This is what re-earned the recommendation.
- **Tier-1 vocabulary lint runs twice** — full engine client-side with
  suggestions, subset server-side in the edge function. Blocking violations
  disable publish; server refusal can be overridden only with an explicit
  logged override (brief escalation protocol).
- **Groups are assisted, never automated.** Meta removed the Groups API on
  2024-04-22; no compliant tool can auto-post to groups. The Publish view's
  group lane copies the caption, hands the image through the existing
  export pipeline, opens Facebook, and logs the handoff. Meta policy also
  prohibits prefilling the message — the clipboard step is the sanctioned
  pattern (identical to Buffer/Hootsuite "reminder publishing").
- **Every post is logged** to `social_posts` (service-role only): tier,
  destination, caption hash, lint overrides, Two-Question acks, FB post ID.
  Same-day duplicate captions across groups are flagged at handoff (the
  brief's Tier-3 spam rule).

## Optional config

Set group URLs so the "Open Facebook" button deep-links correctly:

```sql
INSERT INTO app_config (key, value) VALUES
  ('social_free_group_url', '"https://www.facebook.com/groups/<free-group>"'),
  ('social_pro_url',        '"https://www.facebook.com/groups/<pro-group>"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

## Scheduling notes

- "Tomorrow 8:15a" uses Meta's native `scheduled_publish_time` — the post is
  stored by Facebook, not by us. Constraint: 10 minutes to 30 days out.
- Scheduled posts appear in Meta Business Suite → Planner, and can be edited
  or deleted there.
