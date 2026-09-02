-- ENH-FUNNEL follow-up (2026-09-02): Pro tier has been $2.49/mo since the summer repricing;
-- the generated MRR columns still multiplied by the $0.99 launch price. Regenerate at 2.49.
-- Net keeps the 70% placeholder retention until the real platform cut is confirmed.
ALTER TABLE funnel_daily_snapshots DROP COLUMN gross_mrr;
ALTER TABLE funnel_daily_snapshots DROP COLUMN net_mrr;
ALTER TABLE funnel_daily_snapshots
  ADD COLUMN gross_mrr NUMERIC(10,2) GENERATED ALWAYS AS (active_pro_subscribers * 2.49) STORED,
  ADD COLUMN net_mrr   NUMERIC(10,2) GENERATED ALWAYS AS (active_pro_subscribers * 2.49 * 0.70) STORED;
-- New roster rows default to the current price too (rows imported 2026-09-02 were set explicitly).
ALTER TABLE pro_subscribers ALTER COLUMN monthly_price_usd SET DEFAULT 2.49;
