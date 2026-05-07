# HitMaster — Complete Supabase Setup Guide
## Browser-Only · No Terminal Required · Mac OS 10.5 Compatible

---

## BEFORE YOU START

You will need:
- A browser (Chrome or Safari)
- Your Supabase account (you already have a project at `tgagarhwqbdcwoqhpapi.supabase.co`)
- The SQL files from this guide (copy-paste into Supabase SQL editor)
- About 30–45 minutes for the full setup

Your Supabase project URL: `https://supabase.com/dashboard/project/tgagarhwqbdcwoqhpapi`

---

## PHASE 1 — CONFIRM YOUR PROJECT EXISTS

1. Open `https://supabase.com` in your browser
2. Sign in to your account
3. You should see a project named something like **HITMASTER5** 
4. Click on it to open the project dashboard
5. You will land on the main project overview page

> **If you don't see the project:** Click "New Project", name it `hitmaster`,
> choose a database password (save it!), choose region `US East (N. Virginia)`,
> then wait 2–3 minutes for it to provision.

---

## PHASE 2 — GET YOUR API KEYS

1. In your Supabase project dashboard, look at the **left sidebar**
2. Click **Settings** (gear icon, near the bottom)
3. Click **API** in the settings submenu
4. You will see two keys:

### Key 1: anon (public)
- Already in your `.env` file ✓
- This is safe to include in the app

### Key 2: service_role (secret) ← YOU NEED THIS
- Click the eye icon to reveal it
- Copy it
- Paste it into your `.env` file as `SUPABASE_SERVICE_ROLE_KEY=`
- **NEVER put this key in any file that gets committed to git**
- **NEVER put this key in any EXPO_PUBLIC_ variable**

---

## PHASE 3 — RUN THE DATABASE SCHEMA

This creates all the tables HitMaster needs.

1. In the left sidebar, click **SQL Editor** (looks like `</>`)
2. Click **New query** (top left, `+` button or "New query" button)
3. You will see a blank SQL editor
4. **Copy the entire contents of `schema_complete.sql`** (the file provided alongside this guide)
5. Paste it into the SQL editor
6. Click the green **Run** button (or press Cmd+Enter)
7. Wait 10–15 seconds
8. You should see: `SUCCESS: Schema rebuild complete. All required columns verified.`

### If you see errors:
- Error `already exists`: Safe to ignore — the schema drops tables first then recreates them
- Error `permission denied`: Make sure you are logged in as the project owner
- Any other error: Copy the error message and share it here for help

### Verify tables were created:
1. Click **Table Editor** in the left sidebar
2. You should see these tables listed:
   - `imports`
   - `slate_snapshots`
   - `histories`
   - `datasets_box`
   - `datasets_pair`
   - `percentile_maps`
   - `horizon_blends`
   - `audit_logs`
   - `app_config`
   - `adaptive_tracking`

---

## PHASE 4 — RUN THE ADDITIONS SCHEMA

This adds the new tables for app config, adaptive learning, and user sessions.

1. In the SQL Editor, click **New query** again
2. Copy the entire contents of `schema_additions.sql`
3. Paste and run
4. Should complete without errors

---

## PHASE 5 — SET UP ROW LEVEL SECURITY

The schema already sets up permissive RLS policies. However, before going live,
you will want to tighten them. For now, the `allow_all` policies are fine for 
development and testing.

**For production (Phase 3), you will change policies to:**
- Public (anon): READ only on `slate_snapshots`, `histories`, `app_config`
- Service role: Full access to everything
- No direct write access from the app to engine data tables

---

## PHASE 6 — CREATE YOUR FIRST EDGE FUNCTION

Edge Functions are server-side code that runs ZK6 away from the browser.
This is where your engine logic will eventually live.

> **Note:** For now, the app uses the client-side mock ZK6 engine.
> Edge Functions are Phase 2 of backend wiring.
> You can skip this step until you are ready to go live.

When ready:

1. In the left sidebar, click **Edge Functions**
2. Click **Deploy a new function**
3. Function name: `generate-slate`
4. You will see a code editor in the browser
5. Copy and paste the `edge-function-generate-slate.ts` file provided
6. Click **Deploy**

---

## PHASE 7 — SEED INITIAL APP CONFIG

This sets the default creator settings (nationwide URL, engine weights, etc.)

1. In the SQL Editor, click **New query**
2. Paste and run this SQL:

```sql
-- Seed default app_config values
INSERT INTO public.app_config (key, value, description) VALUES
  ('nationwide_enabled', 'true', 'Whether Pro users see the nationwide play feature'),
  ('nationwide_url', 'https://www.thelotter.com', 'The service URL shown to Pro users'),
  ('nationwide_description', 'Legal lottery concierge service — buy tickets in 40+ states from home.', 'Description shown to Pro users'),
  ('engine_weights_balanced', '{"BOX":0.40,"PBURST":0.40,"CO":0.20}', 'Balanced weight preset'),
  ('engine_weights_conservative', '{"BOX":0.70,"PBURST":0.20,"CO":0.10}', 'Conservative weight preset'),
  ('engine_weights_aggressive', '{"BOX":0.25,"PBURST":0.45,"CO":0.30}', 'Aggressive weight preset'),
  ('active_weight_preset', 'balanced', 'Which preset is currently active'),
  ('drawing_confidence_enabled', 'true', 'Whether to apply Drawing Report Card confidence adjustment'),
  ('burst_signal_enabled', 'true', 'Whether Recency Burst Detection is active'),
  ('k6_singles_max', '4', 'Max singles picks in K6 slate'),
  ('k6_doubles_max', '2', 'Max doubles picks in K6 slate'),
  ('k6_triples_enabled', 'false', 'Whether triples are allowed in K6 slate'),
  ('pair_rep_cap', '2', 'Max picks sharing the same TopPair'),
  ('app_version', '2.0.0', 'Current app version'),
  ('zk6_engine_version', 'v2.1', 'Current ZK6 engine version')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

---

## PHASE 8 — TEST THE CONNECTION

1. Open your HitMaster app (in Expo Snack or on your phone)
2. Triple-tap the HitMaster logo in the sidebar (3 taps fast) to open Creator Access
3. Navigate to **Health Tests**
4. Click **Run All**
5. All tests should show green ✓

### If Connection Test fails:
- Check your `EXPO_PUBLIC_SUPABASE_URL` in `.env` — should be `https://tgagarhwqbdcwoqhpapi.supabase.co`
- Make sure `EXPO_PUBLIC_BACKEND=enabled` in `.env`
- Restart Expo after any `.env` change

### If Snapshot Read fails:
- Run Phase 3 again (the schema SQL) — the test snapshot data may not have been inserted
- Check Table Editor → `slate_snapshots` to see if rows exist

---

## PHASE 9 — FIRST REAL DATA IMPORT (WHEN READY)

Once the schema is confirmed, you can start importing real lottery history data.

**Import order (do this order exactly):**
1. Box History (H01Y) — Midday scope first
2. Box History (H01Y) — Evening scope
3. Box History (H01Y) — All Day scope
4. Pair History (H01Y, Classes 2–11) — Midday
5. Pair History (H01Y, Classes 2–11) — Evening
6. Ledger (historical results) — All scopes
7. Repeat for H02Y, H03Y... (build up horizons over time)

**In the app:**
1. Creator Access → Import Wizard
2. Select type → Configure scope/horizon/class → Paste CSV → Validate → Commit
3. After each import, run Health Tests to confirm data landed

---

## QUICK REFERENCE — WHERE EVERYTHING LIVES

| What | Where to find it |
|------|-----------------|
| Supabase Dashboard | supabase.com/dashboard/project/tgagarhwqbdcwoqhpapi |
| SQL Editor | Dashboard → left sidebar → SQL Editor |
| Table Editor | Dashboard → left sidebar → Table Editor |
| API Keys | Dashboard → Settings → API |
| Edge Functions | Dashboard → left sidebar → Edge Functions |
| Logs | Dashboard → left sidebar → Logs |
| Your `.env` file | HITMASTER5-main/.env (open in TextEdit) |

---

## COMMON ISSUES

**"JWT expired" error**  
Your anon key has a very long expiry (year 2035) so this shouldn't happen.
If it does: Settings → API → copy the anon key again.

**"relation does not exist" error in Health Tests**  
Run the schema SQL again. The table may not have been created.

**App shows mock data even though backend is enabled**  
Check `.env` has `EXPO_PUBLIC_BACKEND=enabled` and restart Expo.

**"Row Level Security" blocking writes**  
The current policies allow everything. If tightened: 
SQL Editor → run `ALTER POLICY allow_all_imports ON public.imports USING (true);`

---

## NEXT PHASES OVERVIEW

| Phase | What | Status |
|-------|------|--------|
| Phase 1 (NOW) | Schema + tables + Health Tests green | ← You are here |
| Phase 2 | Import real H01Y data → first real slate | Next step |
| Phase 3 | Move ZK6 to Edge Function (server-side, proprietary) | After Phase 2 |
| Phase 4 | RevenueCat IAP + Expo push notifications | Pre-launch |
| Phase 5 | EAS Build → App Store submission | Launch |
