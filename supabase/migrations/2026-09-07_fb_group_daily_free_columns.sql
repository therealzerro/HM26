-- ENH-FUNNEL-02 follow-up (2026-09-07, same day): the FREE group's Insights
-- export carries a different daily block than the Pro group's —
--   Date, Joined, Posted or Commented, Viewed, Posts, Comments, Reactions
-- (no Total Members, no Active Members). Two columns hold what it adds;
-- "Viewed" maps onto active_members (members who viewed = the free group's
-- active count) and total_members stays NULL for that group.
ALTER TABLE fb_group_daily
  ADD COLUMN IF NOT EXISTS joined          INTEGER,   -- new members that day (free export "Joined")
  ADD COLUMN IF NOT EXISTS engaged_members INTEGER;   -- members who posted or commented (free export "Posted or Commented")
COMMENT ON COLUMN fb_group_daily.joined IS 'Free-group Insights "Joined" (new members that day); NULL where the export does not report it.';
COMMENT ON COLUMN fb_group_daily.engaged_members IS 'Free-group Insights "Posted or Commented"; NULL where the export does not report it.';
