import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { alertAsync } from '@/lib/confirm';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Card, Pill, SectionTitle, useSt, timeAgo } from './AdminShared';
import { AdminKeyGate } from './AdminKeyGate';
import { subscriberAdmin, maskEmail, type ImportRecord } from '@/lib/subscriberAdminClient';
import { parseSubscriberEmailExport, type ParsedSubscriber } from '@/lib/subscriberEmailParser';
import { parseGroupInsights, type ParsedContributor } from '@/lib/groupInsightsParser';
import { parseEarningsExport } from '@/lib/earningsParser';

type Tab = 'subscribers' | 'insights' | 'earnings' | 'history';

function SubscriberPasteTab({ onCommitted }: { onCommitted: () => void }) {
  const { colors } = useTheme();
  const st = useSt();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [potentialChurns, setPotentialChurns] = useState<Array<{ id: string; email: string; date_subscribed: string }>>([]);

  const parsed = useMemo(() => parseSubscriberEmailExport(raw), [raw]);

  const previewChurns = useCallback(async () => {
    if (parsed.subscribers.length === 0) return;
    setBusy(true);
    try {
      const churns = await subscriberAdmin.findPotentialChurns(parsed.subscribers.map(s => s.email));
      setPotentialChurns(churns);
    } catch (e) {
      alertAsync('Probe failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [parsed.subscribers]);

  useEffect(() => { setPotentialChurns([]); }, [raw]);

  const commit = useCallback(async () => {
    if (parsed.subscribers.length === 0) return;
    setBusy(true);
    try {
      const res = await subscriberAdmin.upsertSubscribers(parsed.subscribers);
      await subscriberAdmin.recordImport({
        import_type: 'subscriber_emails',
        source_filename: `paste_${new Date().toISOString().slice(0, 16)}`,
        records_processed: parsed.subscribers.length,
        records_created: res.created,
        records_updated: res.updated,
        records_skipped: res.skipped,
        warnings: parsed.warnings,
        errors: parsed.errors,
      });
      alertAsync(
        'Import complete',
        `${res.created} new, ${res.updated} updated, ${res.skipped} skipped.` +
          (potentialChurns.length ? `\n\n${potentialChurns.length} active subs not in this import (potential churns — review manually).` : ''),
      );
      setRaw('');
      setPotentialChurns([]);
      onCommitted();
    } catch (e) {
      alertAsync('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [parsed, potentialChurns, onCommitted]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Import Subscriber Emails</Text>
      <Text style={st.sub}>
        Paste the contents of Meta Business Suite → Supporter Email Addresses export.
        Two columns: email + date subscribed. Tab, CSV, or multi-space all work.
      </Text>

      <Card style={{ padding: 12, marginBottom: 14 }}>
        <Text style={st.fieldLabel}>PASTE EXPORT</Text>
        <TextInput
          value={raw}
          onChangeText={setRaw}
          multiline
          placeholder={"email1@x.com\t5/19/2026\nemail2@x.com\t5/19/2026"}
          placeholderTextColor={colors.textTertiary}
          style={st.csvInput}
        />
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
          Parsed: {parsed.subscribers.length} subscribers · {parsed.warnings.length} warnings
        </Text>
      </Card>

      {parsed.subscribers.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>Preview</SectionTitle>
          {parsed.subscribers.slice(0, 20).map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, gap: 10 }}>
              <Text style={{ flex: 2, fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>{maskEmail(s.email)}</Text>
              <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>{s.date_subscribed}</Text>
            </View>
          ))}
          {parsed.subscribers.length > 20 && (
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
              … and {parsed.subscribers.length - 20} more
            </Text>
          )}
        </Card>
      )}

      {parsed.warnings.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14, borderColor: colors.gold + '55' }}>
          <SectionTitle>Warnings</SectionTitle>
          {parsed.warnings.slice(0, 10).map((w, i) => (
            <Text key={i} style={{ fontSize: 10, color: colors.gold, marginVertical: 2 }}>• {w}</Text>
          ))}
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <TouchableOpacity
          disabled={busy || parsed.subscribers.length === 0}
          style={[st.btnGhost, { flex: 1 }, (busy || parsed.subscribers.length === 0) && { opacity: 0.5 }]}
          onPress={previewChurns}
        >
          <Text style={st.btnGhostText}>{busy ? '…' : `Probe Potential Churns (${parsed.subscribers.length})`}</Text>
        </TouchableOpacity>
      </View>

      {potentialChurns.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14, borderColor: colors.error + '55' }}>
          <SectionTitle>{`${potentialChurns.length} Potential Churns`}</SectionTitle>
          <Text style={st.sub}>Active subs not present in this import. Review and mark as churned manually if confirmed.</Text>
          {potentialChurns.map(c => (
            <View key={c.id} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 }}>
              <Text style={{ flex: 2, fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>{maskEmail(c.email)}</Text>
              <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>since {c.date_subscribed}</Text>
            </View>
          ))}
        </Card>
      )}

      <TouchableOpacity
        disabled={busy || parsed.subscribers.length === 0}
        style={[st.btnPrimary, (busy || parsed.subscribers.length === 0) && { opacity: 0.5 }]}
        onPress={commit}
      >
        <Text style={st.btnPrimaryText}>{busy ? 'Committing…' : `Commit ${parsed.subscribers.length} Rows`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InsightsPasteTab({ onCommitted }: { onCommitted: () => void }) {
  const { colors } = useTheme();
  const st = useSt();
  const [raw, setRaw] = useState('');
  const [groupType, setGroupType] = useState<'free' | 'pro'>('pro');
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseGroupInsights(raw), [raw]);

  const commit = useCallback(async () => {
    if (parsed.contributors.length === 0) return;
    setBusy(true);
    try {
      const res = await subscriberAdmin.upsertContributors({
        rows: parsed.contributors.map(c => ({ ...c, group_type: groupType })),
        snapshot_date: snapshotDate,
        source_filename: `paste_${groupType}_${snapshotDate}`,
      });
      await subscriberAdmin.recordImport({
        import_type: 'group_insights',
        source_filename: `paste_${groupType}_${snapshotDate}`,
        records_processed: parsed.contributors.length,
        records_created: res.created,
        records_updated: res.updated,
        records_skipped: 0,
        warnings: parsed.warnings,
        errors: parsed.errors,
      });
      alertAsync('Import complete', `${res.created} new contributors, ${res.updated} updated, ${res.snapshots_added} engagement snapshots added.`);
      setRaw('');
      onCommitted();
    } catch (e) {
      alertAsync('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [parsed, groupType, snapshotDate, onCommitted]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Import Group Insights</Text>
      <Text style={st.sub}>
        Paste the Contributors table from Facebook Group Insights. 4 columns expected:
        name, posts, comments, reactions (28-day window).
      </Text>

      <Card style={{ padding: 12, marginBottom: 14 }}>
        <Text style={st.fieldLabel}>GROUP</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {(['free', 'pro'] as const).map(g => (
            <TouchableOpacity key={g} onPress={() => setGroupType(g)} style={[st.optBtn, groupType === g && st.optBtnOn]}>
              <Text style={[st.optBtnText, groupType === g && st.optBtnTextOn]}>{g === 'pro' ? 'Pro Group' : 'Free Group'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={st.fieldLabel}>Window End Date (YYYY-MM-DD)</Text>
        <TextInput
          value={snapshotDate}
          onChangeText={setSnapshotDate}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface, marginBottom: 8 }}
        />
        <Text style={st.fieldLabel}>PASTE CONTRIBUTORS</Text>
        <TextInput
          value={raw}
          onChangeText={setRaw}
          multiline
          placeholder={"Contributor\tPosts\tComments\tReactions\nJane Doe\t4\t12\t47"}
          placeholderTextColor={colors.textTertiary}
          style={st.csvInput}
        />
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
          Parsed: {parsed.contributors.length} contributors · {parsed.warnings.length} warnings
        </Text>
      </Card>

      {parsed.contributors.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>Preview (top 20)</SectionTitle>
          <View style={{ flexDirection: 'row', paddingVertical: 4, gap: 6 }}>
            <Text style={[st.fieldLabel, { flex: 2 }]}>NAME</Text>
            <Text style={[st.fieldLabel, { width: 50, textAlign: 'right' }]}>POSTS</Text>
            <Text style={[st.fieldLabel, { width: 60, textAlign: 'right' }]}>COMMENTS</Text>
            <Text style={[st.fieldLabel, { width: 50, textAlign: 'right' }]}>LIKES</Text>
            <Text style={[st.fieldLabel, { width: 50, textAlign: 'right' }]}>SCORE</Text>
          </View>
          {parsed.contributors
            .slice()
            .sort((a, b) => (b.posts * 5 + b.comments * 2 + b.likes) - (a.posts * 5 + a.comments * 2 + a.likes))
            .slice(0, 20)
            .map((c, i) => {
              const score = c.posts * 5 + c.comments * 2 + c.likes;
              return (
                <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
                  <Text style={{ flex: 2, fontSize: 11, color: colors.text }}>{c.facebook_name}</Text>
                  <Text style={{ width: 50, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>{c.posts}</Text>
                  <Text style={{ width: 60, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>{c.comments}</Text>
                  <Text style={{ width: 50, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>{c.likes}</Text>
                  <Text style={{ width: 50, fontSize: 11, color: colors.primary, textAlign: 'right', fontWeight: '700' }}>{score}</Text>
                </View>
              );
            })}
        </Card>
      )}

      {parsed.warnings.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14, borderColor: colors.gold + '55' }}>
          <SectionTitle>Warnings</SectionTitle>
          {parsed.warnings.slice(0, 10).map((w, i) => (
            <Text key={i} style={{ fontSize: 10, color: colors.gold, marginVertical: 2 }}>• {w}</Text>
          ))}
        </Card>
      )}

      <TouchableOpacity
        disabled={busy || parsed.contributors.length === 0}
        style={[st.btnPrimary, (busy || parsed.contributors.length === 0) && { opacity: 0.5 }]}
        onPress={commit}
      >
        <Text style={st.btnPrimaryText}>{busy ? 'Committing…' : `Commit ${parsed.contributors.length} ${groupType} Contributors`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function EarningsPasteTab({ onCommitted }: { onCommitted: () => void }) {
  const { colors } = useTheme();
  const st = useSt();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseEarningsExport(raw), [raw]);
  const subsTotal = parsed.rows.reduce((a, r) => a + r.subscriptions_usd, 0);
  const allTotal = parsed.rows.reduce((a, r) => a + r.total_usd, 0);
  const first = parsed.rows.length ? parsed.rows.reduce((a, r) => (r.earn_date < a ? r.earn_date : a), parsed.rows[0].earn_date) : '—';
  const last = parsed.rows.length ? parsed.rows.reduce((a, r) => (r.earn_date > a ? r.earn_date : a), parsed.rows[0].earn_date) : '—';

  const commit = useCallback(async () => {
    if (parsed.rows.length === 0) return;
    setBusy(true);
    try {
      const res = await subscriberAdmin.upsertEarnings(parsed.rows);
      await subscriberAdmin.recordImport({
        import_type: 'earnings',
        source_filename: `earnings_paste_${first}_${last}`,
        records_processed: parsed.rows.length,
        records_created: res.created,
        records_updated: res.updated,
        records_skipped: 0,
        warnings: parsed.warnings,
        errors: parsed.errors,
      });
      alertAsync('Import complete', `${res.created} new days, ${res.updated} updated. Subscriptions net $${subsTotal.toFixed(2)} over ${parsed.rows.length} days.`);
      setRaw('');
      onCommitted();
    } catch (e) {
      alertAsync('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [parsed, first, last, subsTotal, onCommitted]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Import Meta Earnings</Text>
      <Text style={st.sub}>
        Professional dashboard → Monetization → Earnings → export. Paste the whole file as-is
        (the sep= line, the title, quotes and ISO dates are all handled). Re-pasting overlapping
        dates updates them in place.
      </Text>

      <Card style={{ padding: 12, marginBottom: 14 }}>
        <Text style={st.fieldLabel}>PASTE EXPORT</Text>
        <TextInput
          value={raw}
          onChangeText={setRaw}
          multiline
          placeholder={'"Date","Primary","content_monetization","stars","subscriptions"\n"2026-08-06T00:00:00","23.936","0.566","0","23.37"'}
          placeholderTextColor={colors.textTertiary}
          style={st.csvInput}
        />
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
          Parsed: {parsed.rows.length} days ({first} → {last}) · subscriptions ${subsTotal.toFixed(2)} · total ${allTotal.toFixed(2)} · {parsed.warnings.length} warnings
        </Text>
      </Card>

      {parsed.warnings.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14, borderColor: colors.gold + '55' }}>
          <SectionTitle>Warnings</SectionTitle>
          {parsed.warnings.slice(0, 10).map((w, i) => (
            <Text key={i} style={{ fontSize: 10, color: colors.gold, marginVertical: 2 }}>• {w}</Text>
          ))}
        </Card>
      )}

      <TouchableOpacity
        disabled={busy || parsed.rows.length === 0}
        style={[st.btnPrimary, (busy || parsed.rows.length === 0) && { opacity: 0.5 }]}
        onPress={commit}
      >
        <Text style={st.btnPrimaryText}>{busy ? 'Committing…' : `Commit ${parsed.rows.length} Days`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function HistoryTab({ refreshKey }: { refreshKey: number }) {
  const { colors } = useTheme();
  const st = useSt();
  const [rows, setRows] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await subscriberAdmin.listImports();
        setRows(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Import History</Text>
      <Text style={st.sub}>Last 50 imports across all sources.</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>No imports yet.</Text>
      ) : (
        <Card style={{ padding: 12 }}>
          {rows.map(r => (
            <View key={r.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pill label={r.import_type} color={r.import_type === 'subscriber_emails' ? colors.primary : r.import_type === 'group_insights' ? colors.teal : colors.gold} />
                <Text style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }}>{timeAgo(r.imported_at)}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.text }}>
                {r.records_processed} processed · {r.records_created} new · {r.records_updated} updated · {r.records_skipped} skipped
              </Text>
              {r.source_filename && (
                <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono }}>{r.source_filename}</Text>
              )}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function SubscriberImportInner() {
  const { colors } = useTheme();
  const st = useSt();
  const [tab, setTab] = useState<Tab>('subscribers');
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 8, paddingVertical: 6, gap: 4 }}>
        {(['subscribers', 'insights', 'earnings', 'history'] as Tab[]).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[st.filterBtn, tab === t && st.filterBtnOn]}>
            <Text style={[st.filterBtnText, tab === t && { color: '#fff', fontWeight: '700' }]}>
              {t === 'subscribers' ? '📧 Subscribers' : t === 'insights' ? '🔥 Insights' : t === 'earnings' ? '💵 Earnings' : '🗂 History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'subscribers' && <SubscriberPasteTab onCommitted={bump} />}
      {tab === 'insights' && <InsightsPasteTab onCommitted={bump} />}
      {tab === 'earnings' && <EarningsPasteTab onCommitted={bump} />}
      {tab === 'history' && <HistoryTab refreshKey={refreshKey} />}
    </View>
  );
}

export default function SubscriberImportView() {
  return <AdminKeyGate><SubscriberImportInner /></AdminKeyGate>;
}
