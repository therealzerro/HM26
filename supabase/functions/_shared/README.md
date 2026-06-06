# `_shared/` — parity mirror of `lib/`

This directory exists to work around a Supabase CLI v1.215.1 bundler sandbox that scopes the deployable graph to `supabase/functions/`. Imports must resolve inside that directory or the bundler can't find them (see `MASTER_AUDIT.md` → **DEPLOY-01**). The canonical location for Supabase shared module code is `supabase/functions/_shared/` per the Supabase docs convention.

## Files

| File | Mirror of | Used by |
|---|---|---|
| `engineCore.ts` | `lib/engineCore.ts` | `compute-slate-zk6`, `compute-slate-zk30`, `compute-daily-auc-zk6` |
| `dateUtils.ts`  | `lib/dateUtils.ts`  | `compute-slate-zk6`, `compute-slate-zk30` |

Both files in this directory are **byte-identical copies** of the corresponding `lib/` files. **Do not edit them directly.** The RN engine and admin tooling read from `lib/`; the edge functions read from here. Drift between the two = silent slate-hash divergence between RN and edge.

## Workflow

When you change `lib/engineCore.ts` or `lib/dateUtils.ts`:

```bash
npm run sync:edge-shared    # copies lib/* into _shared/
git diff supabase/functions/_shared/  # eyeball the diff
git add lib/ supabase/functions/_shared/  # commit both sides together
```

Before deploying any edge function:

```bash
npm run check:edge-shared   # exits non-zero if _shared/ diverges from lib/
```

`check:edge-shared` is suitable for a pre-commit hook or CI lint. Sync is intentionally manual so the operator sees the change.

## Why this layout instead of inline-all

We considered inlining `engineCore` into each of the three edge fns. That gives per-edge-fn self-containment but triples the number of places that need to track `lib/` changes. With three places to keep in sync, drift is the predictable failure mode — exactly the bug we already lived through (the dead `lib/computeWeightedScore` divergence). One sync point + a check script keeps the surface narrow.
