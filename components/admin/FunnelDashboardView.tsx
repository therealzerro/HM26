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
} from '@/lib/subscriberAdminClient';

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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, p, earnRows] = await Promise.all([
        subscriberAdmin.listSnapshots(30),
        subscriberAdmin.listSubscribers({}),
        subscriberAdmin.listEarnings(120).catch(() => [] as EarningsDay[]),
      ]);
      setSnaps(s);
      setSubs(p);
      setEarn(earnRows);
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
    return {
      latest,
      subs30: sum(last30, 'subscriptions_usd'),
      other30: sum(last30, 'content_monetization_usd') + sum(last30, 'stars_usd'),
      subsMonth: sum(thisMonth, 'subscriptions_usd'),
      month,
      all: sum(sorted, 'total_usd'),
    };
  }, [earn]);

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
            label="ACTIVE PRO"
            value={String(latest.active_pro_subscribers)}
            sub={`now: ${activeNow} in roster`}
            color={colors.success}
          />
          <MetricTile
            label="CONVERSION"
            value={`${(Number(latest.conversion_rate) * 100).toFixed(1)}%`}
            sub={previous ? `${((Number(latest.conversion_rate) - Number(previous.conversion_rate)) * 100).toFixed(2)}pp vs prev` : undefined}
            color={colors.gold}
          />
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

      {latest && Number(latest.active_pro_subscribers) !== activeNow && (
        <Card style={{ padding: 12, borderColor: colors.gold + '55' }}>
          <Text style={{ fontSize: 11, color: colors.gold, fontWeight: '700' }}>
            ⚠ Snapshot drift: roster has {activeNow} active subs, latest snapshot shows {latest.active_pro_subscribers}.
            Record a new snapshot to refresh.
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
