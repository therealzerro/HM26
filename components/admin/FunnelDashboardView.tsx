import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { alertAsync } from '@/lib/confirm';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Card, SectionTitle, useSt } from './AdminShared';
import { AdminKeyGate } from './AdminKeyGate';
import {
  subscriberAdmin,
  maskEmail,
  type FunnelSnapshot,
  type ProSubscriber,
  type EarningsDay,
  type GroupDailyRow,
} from '@/lib/subscriberAdminClient';

const DAY_MS = 86400000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shiftDays = (day: string, n: number) => isoDay(new Date(new Date(day + 'T00:00:00Z').getTime() + n * DAY_MS));
const money = (v: number) => `$${v.toFixed(2)}`;
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v}`;

/**
 * Pro-group headcount + engagement pulse from the Group Insights daily series
 * (fb_group_daily, newest first). The roster counts paying emails; Insights
 * counts who is actually in the group — once members churn the roster
 * overstates Pro until the next email export is imported, so both are shown.
 */
function groupPulse(rows: GroupDailyRow[]) {
  const withMembers = rows.filter(r => r.total_members != null);
  const latest = withMembers[0];
  if (!latest) return null;
  const end = latest.day;
  const inWindow = (r: GroupDailyRow, from: string, to: string) => r.day > from && r.day <= to;
  const w1 = rows.filter(r => inWindow(r, shiftDays(end, -7), end));
  const w0 = rows.filter(r => inWindow(r, shiftDays(end, -14), shiftDays(end, -7)));
  const mean = (xs: GroupDailyRow[], k: 'posts' | 'comments' | 'reactions' | 'active_members') =>
    xs.length ? xs.reduce((a, r) => a + (Number(r[k]) || 0), 0) / xs.length : 0;
  const stat = (xs: GroupDailyRow[]) => ({
    days: xs.length,
    posts: mean(xs, 'posts'),
    comments: mean(xs, 'comments'),
    reactions: mean(xs, 'reactions'),
    active: mean(xs, 'active_members'),
  });
  const weekAgo = withMembers.find(r => r.day <= shiftDays(end, -7));
  const zeroCommentDays = w1.filter(r => (Number(r.comments) || 0) === 0).length;
  return {
    asOf: end,
    members: Number(latest.total_members),
    membersWeekAgo: weekAgo ? Number(weekAgo.total_members) : null,
    now: stat(w1),
    prev: stat(w0),
    zeroCommentDays,
  };
}

function MetricTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ padding: 12, flexGrow: 1, flexBasis: 140 }}>
      <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1.5 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: color ?? colors.text, marginTop: 4 }}>{value}</Text>
      {sub && <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>{sub}</Text>}
    </Card>
  );
}

function SnapshotForm({ onSaved, latestActive }: { onSaved: () => void; latestActive: number }) {
  const { colors } = useTheme();
  const st = useSt();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [pageFollowers, setPageFollowers] = useState('');
  const [freeGroup, setFreeGroup] = useState('');
  const [reelViews, setReelViews] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    const pf = parseInt(pageFollowers, 10);
    const fg = parseInt(freeGroup, 10);
    if (!date || isNaN(pf) || isNaN(fg)) return;
    setBusy(true);
    try {
      await subscriberAdmin.upsertSnapshot({
        snapshot_date: date,
        page_followers: pf,
        free_group_members: fg,
        reel_views_today: reelViews ? parseInt(reelViews, 10) : null,
        content_interactions_today: null,
        notes: notes || null,
      });
      await subscriberAdmin.recordImport({
        import_type: 'snapshot',
        source_filename: `funnel_${date}`,
        records_processed: 1,
        records_created: 1,
        records_updated: 0,
        records_skipped: 0,
      });
      setPageFollowers('');
      setFreeGroup('');
      setReelViews('');
      setNotes('');
      onSaved();
    } catch (e) {
      alertAsync('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [date, pageFollowers, freeGroup, reelViews, notes, onSaved]);

  return (
    <Card style={{ padding: 14 }}>
      <Text style={st.title}>Record Funnel Snapshot</Text>
      <Text style={st.sub}>
        Pro count is auto-pulled from the subscriber roster ({latestActive} active). Enter today's
        page followers and free group count.
      </Text>
      <View style={{ gap: 10 }}>
        <View>
          <Text style={st.fieldLabel}>Date (YYYY-MM-DD)</Text>
          <TextInput value={date} onChangeText={setDate} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }} />
        </View>
        <View>
          <Text style={st.fieldLabel}>Page Followers</Text>
          <TextInput keyboardType="number-pad" value={pageFollowers} onChangeText={setPageFollowers} placeholder="14037" placeholderTextColor={colors.textTertiary} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }} />
        </View>
        <View>
          <Text style={st.fieldLabel}>Free Group Members</Text>
          <TextInput keyboardType="number-pad" value={freeGroup} onChangeText={setFreeGroup} placeholder="85" placeholderTextColor={colors.textTertiary} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }} />
        </View>
        <View>
          <Text style={st.fieldLabel}>Reel Views Today (optional)</Text>
          <TextInput keyboardType="number-pad" value={reelViews} onChangeText={setReelViews} placeholderTextColor={colors.textTertiary} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }} />
        </View>
        <View>
          <Text style={st.fieldLabel}>Notes (optional)</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.textTertiary} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface, minHeight: 50 }} />
        </View>
        <TouchableOpacity disabled={busy} style={[st.btnPrimary, busy && { opacity: 0.5 }]} onPress={submit}>
          <Text style={st.btnPrimaryText}>{busy ? 'Saving…' : 'Save Snapshot'}</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

function TrendBars({ snaps }: { snaps: FunnelSnapshot[] }) {
  const { colors } = useTheme();
  const data = snaps.slice().reverse(); // oldest → newest
  const maxSubs = Math.max(1, ...data.map(s => s.active_pro_subscribers));
  return (
    <Card style={{ padding: 12 }}>
      <SectionTitle>30-day Subscriber Trend</SectionTitle>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2, paddingHorizontal: 4 }}>
        {data.map((s, i) => {
          const h = Math.max(4, (s.active_pro_subscribers / maxSubs) * 90);
          return (
            <View key={s.id ?? i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <View style={{ width: '100%', height: h, backgroundColor: colors.primary, borderRadius: 2 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 9, color: colors.textTertiary }}>{data[0]?.snapshot_date.slice(5) ?? ''}</Text>
        <Text style={{ fontSize: 9, color: colors.textTertiary }}>{data[data.length - 1]?.snapshot_date.slice(5) ?? ''}</Text>
      </View>
    </Card>
  );
}

function RecentConversions({ subs }: { subs: ProSubscriber[] }) {
  const { colors } = useTheme();
  const st = useSt();
  const recent = useMemo(() => {
    const cutoff = Date.now() - 14 * 86400000;
    return subs
      .filter(s => new Date(s.date_subscribed + 'T00:00:00Z').getTime() >= cutoff)
      .sort((a, b) => b.date_subscribed.localeCompare(a.date_subscribed));
  }, [subs]);

  if (recent.length === 0) return null;
  return (
    <Card style={{ padding: 12 }}>
      <SectionTitle>{`Recent Conversions (14d): ${recent.length}`}</SectionTitle>
      {recent.map(r => (
        <View key={r.id} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
          <Text style={{ flex: 2, fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>{maskEmail(r.email)}</Text>
          <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>{r.date_subscribed}</Text>
          {r.acquisition_source && r.acquisition_source !== 'unknown' && (
            <Text style={{ fontSize: 10, color: colors.textTertiary }}>{r.acquisition_source.replace(/_/g, ' ')}</Text>
          )}
        </View>
      ))}
    </Card>
  );
}

function AcquisitionBreakdown({ subs }: { subs: ProSubscriber[] }) {
  const { colors } = useTheme();
  const st = useSt();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of subs) {
      if (s.status !== 'active') continue;
      const key = s.acquisition_source ?? 'unknown';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [subs]);

  return (
    <Card style={{ padding: 12 }}>
      <SectionTitle>Acquisition Source (active only)</SectionTitle>
      {counts.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>No data yet.</Text>
      ) : counts.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, color: colors.text }}>{k.replace(/_/g, ' ')}</Text>
          <Text style={{ fontSize: 11, color: colors.textSecondary, fontVariant: ['tabular-nums'] }}>{v}</Text>
        </View>
      ))}
    </Card>
  );
}

function FunnelDashboardInner() {
  const { colors } = useTheme();
  const [snaps, setSnaps] = useState<FunnelSnapshot[]>([]);
  const [subs, setSubs] = useState<ProSubscriber[]>([]);
  const [earn, setEarn] = useState<EarningsDay[]>([]);
  const [groupDaily, setGroupDaily] = useState<GroupDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, p, earnRows, gd] = await Promise.all([
        subscriberAdmin.listSnapshots(30),
        subscriberAdmin.listSubscribers({}),
        subscriberAdmin.listEarnings(120).catch(() => [] as EarningsDay[]),
        subscriberAdmin.listGroupDaily('pro', 60).catch(() => [] as GroupDailyRow[]),
      ]);
      setSnaps(s);
      setSubs(p);
      setEarn(earnRows);
      setGroupDaily(gd);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const latest = snaps[0];
  const previous = snaps[1];

  const activeNow = useMemo(() => subs.filter(s => s.status === 'active').length, [subs]);
  const earnings = useMemo(() => {
    const n = (v: number | string) => Number(v) || 0;
    const sorted = earn.slice().sort((a, b) => (a.earn_date < b.earn_date ? 1 : -1));
    const latest = sorted[0]?.earn_date;
    if (!latest) return null;
    const cutoff = new Date(latest + 'T00:00:00Z'); cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const cut = cutoff.toISOString().slice(0, 10);
    const last30 = sorted.filter(r => r.earn_date > cut && r.earn_date <= latest);
    const month = latest.slice(0, 7);
    const thisMonth = sorted.filter(r => r.earn_date.startsWith(month));
    const sum = (rows: EarningsDay[], k: keyof EarningsDay) => rows.reduce((a, r) => a + n(r[k] as number | string), 0);
    // Renewal wave: Meta bills monthly on the subscribe date, so this month's
    // subscription payouts vs the SAME calendar days last month is the churn
    // readout for the cohort that joined a month ago (9/2 checkpoint: the
    // 8/4–8/12 spurt renews 9/4–9/23).
    const dayOfMonth = parseInt(latest.slice(8, 10), 10);
    const prevMonthDate = new Date(latest + 'T00:00:00Z'); prevMonthDate.setUTCDate(1); prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
    const prevMonth = prevMonthDate.toISOString().slice(0, 7);
    const prevMonthSameDays = sorted.filter(r => r.earn_date.startsWith(prevMonth) && parseInt(r.earn_date.slice(8, 10), 10) <= dayOfMonth);
    const prevMonthFull = sorted.filter(r => r.earn_date.startsWith(prevMonth));
    const last7 = sorted.filter(r => r.earn_date > shiftDays(latest, -7) && r.earn_date <= latest);
    const monthAgoEnd = (() => { const d = new Date(latest + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return isoDay(d); })();
    const last7MonthAgo = sorted.filter(r => r.earn_date > shiftDays(monthAgoEnd, -7) && r.earn_date <= monthAgoEnd);
    return {
      latest,
      subs30: sum(last30, 'subscriptions_usd'),
      other30: sum(last30, 'content_monetization_usd') + sum(last30, 'stars_usd'),
      subsMonth: sum(thisMonth, 'subscriptions_usd'),
      month,
      all: sum(sorted, 'total_usd'),
      prevMonth,
      subsPrevMonthSameDays: sum(prevMonthSameDays, 'subscriptions_usd'),
      subsPrevMonthFull: sum(prevMonthFull, 'subscriptions_usd'),
      subs7: sum(last7, 'subscriptions_usd'),
      subs7MonthAgo: sum(last7MonthAgo, 'subscriptions_usd'),
      monthAgoEnd,
      dayOfMonth,
    };
  }, [earn]);

  const pulse = useMemo(() => groupPulse(groupDaily), [groupDaily]);
  const rosterGap = pulse ? activeNow - pulse.members : null;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (err) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: colors.error, fontSize: 12 }}>{err}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 }}>Funnel Intelligence</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
          Latest snapshot: {latest?.snapshot_date ?? '—'}
        </Text>
      </View>

      {latest && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <MetricTile
            label="PAGE FOLLOWERS"
            value={latest.page_followers.toLocaleString()}
            sub={previous ? `${(latest.page_followers - previous.page_followers >= 0 ? '+' : '')}${latest.page_followers - previous.page_followers} vs prev` : undefined}
          />
          <MetricTile
            label="FREE GROUP"
            value={latest.free_group_members.toLocaleString()}
            sub={previous ? `${(latest.free_group_members - previous.free_group_members >= 0 ? '+' : '')}${latest.free_group_members - previous.free_group_members} vs prev` : undefined}
            color={colors.teal}
          />
          <MetricTile
            label="ACTIVE PRO · ROSTER"
            value={String(latest.active_pro_subscribers)}
            sub={`now: ${activeNow} in roster`}
            color={colors.success}
          />
          {pulse && (
            <MetricTile
              label="PRO GROUP · INSIGHTS"
              value={String(pulse.members)}
              sub={`as of ${pulse.asOf.slice(5)}${pulse.membersWeekAgo != null ? ` · ${signed(pulse.members - pulse.membersWeekAgo)} in 7d` : ''}${rosterGap && rosterGap > 0 ? ` · roster +${rosterGap}` : ''}`}
              color={rosterGap && rosterGap > 2 ? colors.gold : colors.success}
            />
          )}
          <MetricTile
            label="CONVERSION · ROSTER"
            value={`${(Number(latest.conversion_rate) * 100).toFixed(1)}%`}
            sub={previous ? `${((Number(latest.conversion_rate) - Number(previous.conversion_rate)) * 100).toFixed(2)}pp vs prev` : undefined}
            color={colors.gold}
          />
          {pulse && latest.free_group_members > 0 && (
            <MetricTile
              label="CONVERSION · REAL"
              value={`${((pulse.members / latest.free_group_members) * 100).toFixed(1)}%`}
              sub="Insights members ÷ free group"
              color={colors.gold}
            />
          )}
          <MetricTile
            label="GROSS MRR"
            value={`$${Number(latest.gross_mrr).toFixed(2)}`}
            color={colors.primary}
          />
          <MetricTile
            label="NET MRR"
            value={`$${Number(latest.net_mrr).toFixed(2)}`}
            sub="after 30% platform fee"
            color={colors.primary}
          />
        </View>
      )}

      {earnings && (
        <View>
          <SectionTitle>Meta payouts (actual, net of platform cut)</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MetricTile label="SUBS · LAST 30D" value={`$${earnings.subs30.toFixed(2)}`} sub={`through ${earnings.latest}`} color={colors.success} />
            <MetricTile label={`SUBS · ${earnings.month}`} value={`$${earnings.subsMonth.toFixed(2)}`} sub="month to date" color={colors.success} />
            <MetricTile label="OTHER · LAST 30D" value={`$${earnings.other30.toFixed(2)}`} sub="content + stars" />
            <MetricTile label="ALL-TIME" value={`$${earnings.all.toFixed(2)}`} sub="since 2026-04-15" color={colors.gold} />
          </View>
          {latest && (
            <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 6 }}>
              Net MRR above is the roster × $1.74 (Meta pays 70% of $2.49). Last-30-day subscription payouts vs that figure:{' '}
              {((earnings.subs30 / Math.max(Number(latest.net_mrr), 0.01)) * 100).toFixed(0)}%.
            </Text>
          )}
        </View>
      )}

      {earnings && earnings.subsPrevMonthSameDays > 0 && (
        <Card style={{ padding: 12 }}>
          <SectionTitle>Renewal wave (subscription payouts)</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MetricTile
              label={`${earnings.month} · DAYS 1–${earnings.dayOfMonth}`}
              value={money(earnings.subsMonth)}
              sub={`${earnings.prevMonth} same days: ${money(earnings.subsPrevMonthSameDays)}`}
              color={colors.success}
            />
            <MetricTile
              label="VS SAME DAYS LAST MONTH"
              value={`${((earnings.subsMonth / earnings.subsPrevMonthSameDays) * 100).toFixed(0)}%`}
              sub={`${earnings.prevMonth} full month: ${money(earnings.subsPrevMonthFull)}`}
              color={earnings.subsMonth / earnings.subsPrevMonthSameDays < 0.85 ? colors.error : colors.success}
            />
            {earnings.subs7MonthAgo > 0 && (
              <MetricTile
                label="LAST 7D VS 7D A MONTH AGO"
                value={`${((earnings.subs7 / earnings.subs7MonthAgo) * 100).toFixed(0)}%`}
                sub={`${money(earnings.subs7)} vs ${money(earnings.subs7MonthAgo)} (to ${earnings.monthAgoEnd.slice(5)})`}
                color={earnings.subs7 / earnings.subs7MonthAgo < 0.85 ? colors.error : colors.success}
              />
            )}
          </View>
          <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 6 }}>
            Meta bills each subscriber monthly on their subscribe date, so this month&apos;s payouts on the same calendar
            days as last month is the renewal rate of the cohort that joined a month earlier. Daily postings wobble
            ±1 day — read the ratio over a week, not a day. Below ~85% the cohort is leaving. Paste a fresh earnings
            export (Sub Import → 💵) to move the &quot;through&quot; date.
          </Text>
        </Card>
      )}

      {pulse && (
        <Card style={{ padding: 12 }}>
          <SectionTitle>{`Pro group engagement pulse · through ${pulse.asOf}`}</SectionTitle>
          <View style={{ flexDirection: 'row', paddingVertical: 4, gap: 6 }}>
            <Text style={{ flex: 2, fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>PER DAY</Text>
            <Text style={{ width: 70, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, textAlign: 'right' }}>LAST 7D</Text>
            <Text style={{ width: 70, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, textAlign: 'right' }}>PRIOR 7D</Text>
          </View>
          {([
            ['Posts', pulse.now.posts, pulse.prev.posts],
            ['Member comments', pulse.now.comments, pulse.prev.comments],
            ['Reactions', pulse.now.reactions, pulse.prev.reactions],
            ['Active members', pulse.now.active, pulse.prev.active],
          ] as Array<[string, number, number]>).map(([label, a, b]) => (
            <View key={label} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
              <Text style={{ flex: 2, fontSize: 11, color: colors.text }}>{label}</Text>
              <Text style={{ width: 70, fontSize: 11, color: a < b * 0.7 ? colors.error : colors.text, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '700' }}>{a.toFixed(1)}</Text>
              <Text style={{ width: 70, fontSize: 11, color: colors.textSecondary, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{b.toFixed(1)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
            <Text style={{ flex: 2, fontSize: 11, color: colors.text }}>Active share of members</Text>
            <Text style={{ width: 70, fontSize: 11, color: colors.text, textAlign: 'right', fontWeight: '700' }}>{pulse.members ? `${((pulse.now.active / pulse.members) * 100).toFixed(0)}%` : '—'}</Text>
            <Text style={{ width: 70, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>{pulse.membersWeekAgo ? `${((pulse.prev.active / pulse.membersWeekAgo) * 100).toFixed(0)}%` : '—'}</Text>
          </View>
          <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 6 }}>
            {pulse.zeroCommentDays} of the last {pulse.now.days} days had zero member comments.
            {pulse.membersWeekAgo != null ? ` Members ${pulse.membersWeekAgo} → ${pulse.members} over the week.` : ''}
            {' '}Every engagement peak in this group&apos;s history was a human thread (a question asked or answered), never a
            templated drop; comments falling toward zero preceded both member slides (June–July and September).
            Refresh by pasting the Group Insights download into Sub Import → 🔥 Insights.
          </Text>
        </Card>
      )}

      {latest && Number(latest.active_pro_subscribers) !== activeNow && (
        <Card style={{ padding: 12, borderColor: colors.gold + '55' }}>
          <Text style={{ fontSize: 11, color: colors.gold, fontWeight: '700' }}>
            ⚠ Snapshot drift: roster has {activeNow} active subs, latest snapshot shows {latest.active_pro_subscribers}.
            Record a new snapshot to refresh.
          </Text>
        </Card>
      )}

      {rosterGap != null && rosterGap > 2 && pulse && (
        <Card style={{ padding: 12, borderColor: colors.gold + '55' }}>
          <Text style={{ fontSize: 11, color: colors.gold, fontWeight: '700' }}>
            ⚠ Roster overstates Pro by {rosterGap}: {activeNow} active on the roster vs {pulse.members} members in the
            group (Insights, {pulse.asOf}). Members who leave the group stop paying but stay &quot;active&quot; here until the
            next supporter-email export is imported — run Sub Import → Probe Potential Churns against it, then mark the
            leavers churned. Until then, MRR and conversion above are upper bounds; use the Insights count.
          </Text>
        </Card>
      )}

      {snaps.length >= 2 && <TrendBars snaps={snaps} />}

      <RecentConversions subs={subs} />

      <AcquisitionBreakdown subs={subs} />

      <SnapshotForm onSaved={load} latestActive={activeNow} />
    </ScrollView>
  );
}

export default function FunnelDashboardView() {
  return <AdminKeyGate><FunnelDashboardInner /></AdminKeyGate>;
}
