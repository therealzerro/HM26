/**
 * ProNotPostedBanner — MKT-86 E2 (content agent Ledger, 2026-10-15).
 *
 * After 9:30 AM ET, if nothing Pro is marked posted for today, a red reminder
 * sits above every Admin view with the one-tap path to the framed Pro brief
 * (Admin → 🎬 Reels → 📰 Social brief). A REMINDER IN THE APP, nothing more:
 * no scheduling, no auto-post (standing rule — nothing auto-posts).
 *
 * "Pro posted today" = (a) a marketing_reels row whose kind ends in `_pro` with
 * posted_at on today's ET day, OR (b) a social_posts row created today ET with
 * tier 4 or a destination containing "pro". Either read failing (e.g. a table
 * that is not anon-readable) is treated as "no evidence", never as an error.
 * "Dismiss for today" is remembered per device so the banner stops nagging
 * once the operator has posted outside the app.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { getTodayET } from '@/lib/dateUtils';
import { Card } from './AdminShared';

const DISMISS_KEY = 'pro_not_posted_dismissed_day';
const POLL_MS = 5 * 60 * 1000;
const CUTOFF_MINUTES = 9 * 60 + 30; // 09:30 ET

function etMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** ET day of an ISO timestamp (posted_at / created_at are timestamptz). */
function etDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function proPostedToday(today: string): Promise<boolean> {
  // (a) a Pro reel marked posted today. posted_at is UTC in the row; the ET-day
  // window is today 00:00 ET minus a day of slack, filtered client-side by ET day.
  try {
    const rows = await fetchFromSupabase<Array<{ kind: string; posted_at: string | null }>>({
      path: `/rest/v1/marketing_reels?select=kind,posted_at&kind=like.*_pro&posted_at=not.is.null&posted_at=gte.${today}T00:00:00-05:00&order=posted_at.desc&limit=20`,
      method: 'GET',
    });
    if (Array.isArray(rows) && rows.some(r => r.posted_at && etDay(r.posted_at) === today)) return true;
  } catch { /* no evidence */ }
  // (b) a Pro social post logged today (log_assist / direct). May not be anon-readable.
  try {
    const rows = await fetchFromSupabase<Array<{ tier: number | null; destination: string | null; created_at: string }>>({
      path: `/rest/v1/social_posts?select=tier,destination,created_at&created_at=gte.${today}T00:00:00-05:00&order=created_at.desc&limit=50`,
      method: 'GET',
    });
    if (Array.isArray(rows) && rows.some(r => etDay(r.created_at) === today && (Number(r.tier) === 4 || /pro/i.test(r.destination ?? '')))) return true;
  } catch { /* no evidence */ }
  return false;
}

export function ProNotPostedBanner({ onOpenReels }: { onOpenReels: () => void }) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    const today = getTodayET();
    if (etMinutesNow() < CUTOFF_MINUTES) { setShow(false); return; }
    try {
      const dismissed = await storage.getItem(DISMISS_KEY);
      if (dismissed === today) { setShow(false); return; }
    } catch { /* ignore */ }
    const posted = await proPostedToday(today);
    setShow(!posted);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) check(); };
    run();
    const id = setInterval(run, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [check]);

  const dismiss = useCallback(async () => {
    try { await storage.setItem(DISMISS_KEY, getTodayET()); } catch { /* ignore */ }
    setShow(false);
  }, []);

  if (!show) return null;
  return (
    <Card style={{ padding: 12, marginHorizontal: 12, marginTop: 10, borderColor: colors.error, borderWidth: 1.5, backgroundColor: colors.error + '14' }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.error }}>
        ⛔ Pro not posted today — nothing Pro is marked posted since 9:30 AM ET.
      </Text>
      <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>
        Minimum Pro day: the framed 💎 Pro brief alone keeps the room fed. Reels → 📰 Social brief → 💎 Pro → Save / Share.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <TouchableOpacity
          onPress={onOpenReels}
          accessibilityRole="button"
          accessibilityLabel="Open the Social brief in Reels"
          style={{ backgroundColor: colors.error, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>📰 Open Social brief</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss this reminder for today">
          <Text style={{ fontSize: 11, color: colors.textSecondary, textDecorationLine: 'underline' }}>Dismiss for today</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

export default ProNotPostedBanner;
