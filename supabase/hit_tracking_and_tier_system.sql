-- ─────────────────────────────────────────────────────────────────────────────
-- HitMaster: Hit Tracking Function + Tier System Tables
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── TASK 1: calculate_hit_rates function ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_hit_rates()
RETURNS TABLE (
  slate_date date,
  scope text,
  total_picks integer,
  box_hits integer,
  straight_hits integer,
  box_hit_rate numeric,
  straight_hit_rate numeric
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(ss.updated_at_et) as slate_date,
    ss.scope,
    jsonb_array_length(ss.top_k_straights_json) as total_picks,
    COUNT(DISTINCT h.result_digits) FILTER (
      WHERE h.comboset_sorted = ANY(
        SELECT jsonb_array_elements_text(
          jsonb_path_query_array(ss.top_k_straights_json, '$[*].comboSet')
        )
      )
    )::integer as box_hits,
    COUNT(DISTINCT h.result_digits) FILTER (
      WHERE h.result_digits = ANY(
        SELECT jsonb_array_elements_text(
          jsonb_path_query_array(ss.top_k_straights_json, '$[*].combo')
        )
      )
    )::integer as straight_hits,
    ROUND(
      COUNT(DISTINCT h.result_digits) FILTER (
        WHERE h.comboset_sorted = ANY(
          SELECT jsonb_array_elements_text(
            jsonb_path_query_array(ss.top_k_straights_json, '$[*].comboSet')
          )
        )
      )::numeric / NULLIF(jsonb_array_length(ss.top_k_straights_json), 0) * 100, 1
    ) as box_hit_rate,
    ROUND(
      COUNT(DISTINCT h.result_digits) FILTER (
        WHERE h.result_digits = ANY(
          SELECT jsonb_array_elements_text(
            jsonb_path_query_array(ss.top_k_straights_json, '$[*].combo')
          )
        )
      )::numeric / NULLIF(jsonb_array_length(ss.top_k_straights_json), 0) * 100, 1
    ) as straight_hit_rate
  FROM public.slate_snapshots ss
  LEFT JOIN public.histories h ON (
    h.date_et = DATE(ss.updated_at_et)
    AND h.session = ss.scope
    AND h.deleted_at IS NULL
  )
  WHERE ss.deleted_at IS NULL
  GROUP BY ss.id, DATE(ss.updated_at_et), ss.scope,
           ss.top_k_straights_json
  ORDER BY slate_date DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.calculate_hit_rates() TO anon, authenticated;

-- ─── TASK 6: slate_credits table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.slate_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL,
  date_et date NOT NULL DEFAULT CURRENT_DATE,
  credits_used integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'free',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(session_token, date_et)
);

ALTER TABLE public.slate_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_slate_credits ON public.slate_credits;
CREATE POLICY allow_all_slate_credits ON public.slate_credits
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.slate_credits TO anon, authenticated;

-- ─── TASK 6: admin_published columns on slate_snapshots ──────────────────────

ALTER TABLE public.slate_snapshots
  ADD COLUMN IF NOT EXISTS admin_published boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
