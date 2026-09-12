import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { alertAsync, confirmAsync } from '@/lib/confirm';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Card, Pill, SectionTitle, useSt, timeAgo } from './AdminShared';
import { AdminKeyGate } from './AdminKeyGate';
import { subscriberAdmin, maskEmail, type ImportRecord, type ContributorWithEngagement, type ProSubscriber } from '@/lib/subscriberAdminClient';
import { parseSubscriberEmailExport } from '@/lib/subscriberEmailParser';
import { planNameLinks, identityLabel, PLACEHOLDER_EMAIL_DOMAIN, type LinkedRow } from '@/lib/subscriberNameLink';
import { parseGroupInsights, type ParsedContributor } from '@/lib/groupInsightsParser';
import { parseEarningsExport } from '@/lib/earningsParser';

type Tab = 'subscribers' | 'insights' | 'engagement' | 'earnings' | 'history';

function SubscriberPasteTab({ onCommitted }: { onCommitted: () => void }) {
  const { colors } = useTheme();
  const st = useSt();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [potentialChurns, setPotentialChurns] = useState<Array<{ id: string; email: string; date_subscribed: string }>>([]);
  // ENH-SUB-NAMES-01: the Meta "Subscribers" list pastes as display name + date
  // (no email). Name rows are resolved against the roster before commit — see
  // lib/subscriberNameLink.ts — so the roster is loaded once per tab mount.
  const [roster, setRoster] = useState<ProSubscriber[] | null>(null);
  const [rosterErr, setRosterErr] = useState<string | null>(null);

  const parsed = useMemo(() => parseSubscriberEmailExport(raw), [raw]);
  const hasNameRows = parsed.format === 'name' || parsed.format === 'mixed';

  useEffect(() => {
    let cancelled = false;
    subscriberAdmin.listSubscribers({}).then(rows => { if (!cancelled) setRoster(rows); })
      .catch(e => { if (!cancelled) setRosterErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  const plan = useMemo(() => planNameLinks(parsed.subscribers, roster ?? [], maskEmail), [parsed.subscribers, roster]);

  /** Every row as it will be sent to upsert_subscribers (email-keyed). */
  const rowsToCommit = useMemo(() => {
    const emailRows = parsed.subscribers.filter(s => s.email).map(s => ({ email: s.email as string, date_subscribed: s.date_subscribed }));
    const nameRows = plan.rows.map(r => ({ email: r.email, date_subscribed: r.date_subscribed, facebook_name: r.facebook_name }));
    return [...emailRows, ...nameRows];
  }, [parsed.subscribers, plan.rows]);
  const rosterPending = hasNameRows && roster === null;

  const previewChurns = useCallback(async () => {
    if (rowsToCommit.length === 0) return;
    setBusy(true);
    try {
      const churns = await subscriberAdmin.findPotentialChurns(rowsToCommit.map(s => s.email));
      setPotentialChurns(churns);
    } catch (e) {
      alertAsync('Probe failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [rowsToCommit]);

  useEffect(() => { setPotentialChurns([]); }, [raw]);

  const commit = useCallback(async () => {
    if (rowsToCommit.length === 0) return;
    setBusy(true);
    try {
      const res = await subscriberAdmin.upsertSubscribers(rowsToCommit);
      const stamp = new Date().toISOString().slice(0, 16);
      await subscriberAdmin.recordImport({
        import_type: 'subscriber_emails',
        source_filename: hasNameRows
          ? `paste_names_${stamp}_link${plan.counts.exact + plan.counts.guessed}_new${plan.counts.new}`
          : `paste_${stamp}`,
        records_processed: rowsToCommit.length,
        records_created: res.created,
        records_updated: res.updated,
        records_skipped: res.skipped,
        warnings: parsed.warnings,
        errors: parsed.errors,
      });
      alertAsync(
        'Import complete',
        `${res.created} new, ${res.updated} updated, ${res.skipped} skipped.` +
          (hasNameRows ? `\n\nName rows: ${plan.counts.exact} already linked, ${plan.counts.guessed} linked to an email by name match, ${plan.counts.new} name-only rows created.` : '') +
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
  }, [rowsToCommit, parsed, plan, hasNameRows, potentialChurns, onCommitted]);

  const kindLabel = (k: LinkedRow['kind']) => (k === 'exact' ? 'linked' : k === 'guessed' ? 'linked by name' : 'new · name-only');
  const commitDisabled = busy || rowsToCommit.length === 0 || rosterPending;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Import Subscribers</Text>
      <Text style={st.sub}>
        {'Paste either Meta Business Suite list: Supporter Email Addresses (email + M/D/YYYY) or the Subscribers list ' +
          '(display name + "Sep 12, 2026"). Tab, CSV, multi-space, or the phone\'s vertical name⏎date layout all work. ' +
          'Name rows are matched to the email roster before commit; unmatched names become name-only rows.'}
      </Text>

      <Card style={{ padding: 12, marginBottom: 14 }}>
        <Text style={st.fieldLabel}>PASTE EXPORT</Text>
        <TextInput
          value={raw}
          onChangeText={setRaw}
          multiline
          placeholder={"Jane Doe\nSep 12, 2026\n\nemail1@x.com\t5/19/2026"}
          placeholderTextColor={colors.textTertiary}
          style={st.csvInput}
        />
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
          Parsed: {parsed.subscribers.length} subscribers · {parsed.warnings.length} warnings
          {parsed.format !== 'none' ? ` · format: ${parsed.format}` : ''}
        </Text>
      </Card>

      {hasNameRows && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>Name → roster link plan</SectionTitle>
          {rosterErr ? (
            <Text style={{ fontSize: 11, color: colors.error }}>Roster load failed: {rosterErr}. Reopen the tab to retry — name rows cannot be committed without it.</Text>
          ) : roster === null ? (
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>Loading roster…</Text>
          ) : (
            <>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                {plan.counts.exact} already linked · {plan.counts.guessed} linked by name match (the name is saved on that row) · {plan.counts.new} new name-only rows
              </Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
                A name-only row has a placeholder address ending @{PLACEHOLDER_EMAIL_DOMAIN} and shows by name. If a new
                name is really an existing email subscriber the matcher missed, cancel, set the name on that row in
                Subscribers, then paste again — otherwise the churn probe will list the email row as lapsed.
              </Text>
            </>
          )}
        </Card>
      )}

      {parsed.subscribers.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>Preview</SectionTitle>
          {parsed.subscribers.filter(s => s.email).slice(0, 20).map((s, i) => (
            <View key={`e${i}`} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, gap: 10 }}>
              <Text style={{ flex: 2, fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>{maskEmail(s.email as string)}</Text>
              <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>{s.date_subscribed}</Text>
            </View>
          ))}
          {plan.rows.slice(0, 60).map((r, i) => (
            <View key={`n${i}`} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 10, alignItems: 'center' }}>
              <Text style={{ flex: 2, fontSize: 11, color: colors.text }} numberOfLines={1}>{r.facebook_name}</Text>
              <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>{r.date_subscribed}</Text>
              <Text style={{ flex: 1.4, fontSize: 10, color: r.kind === 'new' ? colors.gold : colors.textTertiary }} numberOfLines={1}>
                {kindLabel(r.kind)}{r.rosterEmailMasked ? ` → ${r.rosterEmailMasked}` : ''}
              </Text>
            </View>
          ))}
          {rowsToCommit.length > 80 && (
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
              … and {rowsToCommit.length - 80} more
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
          disabled={commitDisabled}
          style={[st.btnGhost, { flex: 1 }, commitDisabled && { opacity: 0.5 }]}
          onPress={previewChurns}
        >
          <Text style={st.btnGhostText}>{busy ? '…' : `Probe Potential Churns (${rowsToCommit.length})`}</Text>
        </TouchableOpacity>
      </View>

      {potentialChurns.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14, borderColor: colors.error + '55' }}>
          <SectionTitle>{`${potentialChurns.length} Potential Churns`}</SectionTitle>
          <Text style={st.sub}>
            Active subs not present in this import. A supporter export lists everyone currently paying, so an active
            roster row missing from it has lapsed — unless the export was partial or the member is comped. Review, then
            mark them churned in one step (date = today) so MRR, conversion and the cohort table stop counting them.
            {hasNameRows ? ' With a name paste, an email row can also be here because its name was not matched — link it first.' : ''}
          </Text>
          {potentialChurns.map(c => (
            <View key={c.id} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 }}>
              <Text style={{ flex: 2, fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>
                {identityLabel({ email: c.email, facebook_name: roster?.find(r => r.id === c.id)?.facebook_name ?? null }, maskEmail(c.email))}
              </Text>
              <Text style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>since {c.date_subscribed}</Text>
            </View>
          ))}
          <TouchableOpacity
            disabled={busy}
            style={[st.btnGhost, { marginTop: 10, borderWidth: 1, borderColor: colors.error + '88' }, busy && { opacity: 0.5 }]}
            onPress={async () => {
              const ok = await confirmAsync(
                `Mark ${potentialChurns.length} as churned?`,
                `Sets status=churned and date_churned=today on every listed roster row. Reversible per row in Subscribers. Only do this if the pasted export is the complete current supporter list.`,
              );
              if (!ok) return;
              setBusy(true);
              const today = new Date().toISOString().slice(0, 10);
              let done = 0; const failed: string[] = [];
              for (const c of potentialChurns) {
                try {
                  await subscriberAdmin.updateSubscriber({ id: c.id, status: 'churned', date_churned: today });
                  done++;
                } catch (e) {
                  failed.push(`${maskEmail(c.email)}: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
              try {
                await subscriberAdmin.recordImport({
                  import_type: 'manual',
                  source_filename: `bulk_churn_from_probe_${today}`,
                  records_processed: potentialChurns.length,
                  records_created: 0,
                  records_updated: done,
                  records_skipped: failed.length,
                  errors: failed.length ? failed : undefined,
                });
              } catch { /* audit row is best-effort */ }
              setBusy(false);
              alertAsync('Churn recorded', `${done} marked churned (${today}).` + (failed.length ? `\n\n${failed.length} failed:\n${failed.join('\n')}` : ''));
              setPotentialChurns([]);
              onCommitted();
            }}
          >
            <Text style={[st.btnGhostText, { color: colors.error }]}>{busy ? '…' : `Mark all ${potentialChurns.length} churned (today)`}</Text>
          </TouchableOpacity>
        </Card>
      )}

      <TouchableOpacity
        disabled={commitDisabled}
        style={[st.btnPrimary, commitDisabled && { opacity: 0.5 }]}
        onPress={commit}
      >
        <Text style={st.btnPrimaryText}>{busy ? 'Committing…' : rosterPending ? 'Loading roster…' : `Commit ${rowsToCommit.length} Rows`}</Text>
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
  const nothing = parsed.contributors.length === 0 && parsed.daily.length === 0;
  const dailyLast = parsed.daily.length ? parsed.daily.reduce((a, r) => (r.day > a.day ? r : a), parsed.daily[0]) : null;
  const dailyFirst = parsed.daily.length ? parsed.daily.reduce((a, r) => (r.day < a.day ? r : a), parsed.daily[0]) : null;
  // The 28-day contributors window ends on the export's last day when the daily block is present.
  useEffect(() => { if (dailyLast) setSnapshotDate(dailyLast.day); }, [dailyLast]);

  const commit = useCallback(async () => {
    if (nothing) return;
    setBusy(true);
    try {
      const parts: string[] = [];
      let created = 0, updated = 0;
      if (parsed.contributors.length > 0) {
        const res = await subscriberAdmin.upsertContributors({
          rows: parsed.contributors.map(c => ({ ...c, group_type: groupType })),
          snapshot_date: snapshotDate,
          source_filename: `paste_${groupType}_${snapshotDate}`,
        });
        created += res.created; updated += res.updated;
        parts.push(`${res.created} new contributors, ${res.updated} updated, ${res.snapshots_added} engagement snapshots added`);
      }
      if (parsed.daily.length > 0) {
        const res = await subscriberAdmin.upsertGroupDaily(groupType, parsed.daily);
        created += res.created; updated += res.updated;
        parts.push(`${parsed.daily.length} daily rows (${dailyFirst?.day} → ${dailyLast?.day}): ${res.created} new, ${res.updated} updated` +
          (dailyLast?.total_members != null ? ` — ${groupType} group ${dailyLast.total_members} members on ${dailyLast.day}` : ''));
      }
      await subscriberAdmin.recordImport({
        import_type: 'group_insights',
        source_filename: `paste_${groupType}_${snapshotDate}` + (parsed.daily.length ? `_daily${parsed.daily.length}` : ''),
        records_processed: parsed.contributors.length + parsed.daily.length,
        records_created: created,
        records_updated: updated,
        records_skipped: 0,
        warnings: parsed.warnings,
        errors: parsed.errors,
      });
      alertAsync('Import complete', parts.join('\n'));
      setRaw('');
      onCommitted();
    } catch (e) {
      alertAsync('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [parsed, nothing, groupType, snapshotDate, dailyFirst, dailyLast, onCommitted]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Import Group Insights</Text>
      <Text style={st.sub}>
        Paste the whole Facebook Group Insights download as-is. The daily block (Total Members ·
        Posts · Comments · Reactions · Active Members) feeds the Funnel dashboard&apos;s Pro-group headcount
        and engagement pulse; the Contributors block (28-day window) updates the roster&apos;s engagement
        view. Popular Days/Times and the Posts block are ignored — nothing from them is stored.
        The Contributors table alone still works.
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
          Parsed: {parsed.contributors.length} contributors · {parsed.daily.length} daily rows · {parsed.warnings.length} warnings
        </Text>
      </Card>

      {dailyLast && dailyFirst && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>Daily series</SectionTitle>
          <Text style={{ fontSize: 11, color: colors.text }}>
            {parsed.daily.length} days · {dailyFirst.day} → {dailyLast.day}
            {dailyLast.total_members != null ? ` · ${groupType} group ${dailyLast.total_members} members on ${dailyLast.day}` : ''}
            {` · ${dailyLast.active_members} active / ${dailyLast.posts} posts / ${dailyLast.comments} comments / ${dailyLast.reactions} reactions on the last day`}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>
            Window-end date above was set to the last day of the series. Re-pasting an overlapping export updates in place.
          </Text>
        </Card>
      )}

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
        disabled={busy || nothing}
        style={[st.btnPrimary, (busy || nothing) && { opacity: 0.5 }]}
        onPress={commit}
      >
        <Text style={st.btnPrimaryText}>
          {busy ? 'Committing…'
            : `Commit ${[
                parsed.contributors.length ? `${parsed.contributors.length} contributors` : '',
                parsed.daily.length ? `${parsed.daily.length} daily rows` : '',
              ].filter(Boolean).join(' + ') || 'nothing'} (${groupType})`}
        </Text>
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

      {parsed.rows.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>Preview by month (subscriptions ÷ $1.74 ≈ renewals)</SectionTitle>
          {Array.from(parsed.rows.reduce((m, r) => {
            const k = r.earn_date.slice(0, 7);
            const c = m.get(k) ?? { subs: 0, total: 0, days: 0 };
            c.subs += r.subscriptions_usd; c.total += r.total_usd; c.days++;
            m.set(k, c); return m;
          }, new Map<string, { subs: number; total: number; days: number }>()).entries())
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .filter(([, v]) => v.total > 0)
            .map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 11, color: colors.text }}>{k} <Text style={{ color: colors.textTertiary }}>({v.days}d)</Text></Text>
                <Text style={{ width: 80, fontSize: 11, color: colors.success, textAlign: 'right', fontWeight: '700' }}>${v.subs.toFixed(2)}</Text>
                <Text style={{ width: 80, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>${v.total.toFixed(2)}</Text>
                <Text style={{ width: 50, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>≈{(v.subs / 1.74).toFixed(0)}</Text>
              </View>
            ))}
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
        disabled={busy || parsed.rows.length === 0}
        style={[st.btnPrimary, (busy || parsed.rows.length === 0) && { opacity: 0.5 }]}
        onPress={commit}
      >
        <Text style={st.btnPrimaryText}>{busy ? 'Committing…' : `Commit ${parsed.rows.length} Days`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/**
 * Engagement — the contributors table nobody could see until now: every member
 * the Insights export has ever listed, ranked by the latest 28-day window, with
 * the change vs the previous window and who has gone quiet. Admin surface
 * (key-gated); names are shown because the operator needs to recognise them.
 */
function EngagementTab({ refreshKey }: { refreshKey: number }) {
  const { colors } = useTheme();
  const st = useSt();
  const [groupType, setGroupType] = useState<'free' | 'pro'>('pro');
  const [rows, setRows] = useState<ContributorWithEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try { setRows(await subscriberAdmin.listContributors(groupType)); }
      catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      finally { setLoading(false); }
    })();
  }, [refreshKey, groupType]);

  const view = useMemo(() => {
    const score = (p: number, c: number, l: number) => p * 5 + c * 2 + l;
    const windows = Array.from(new Set(rows.map(r => r.latest_window_end).filter((x): x is string => !!x))).sort().reverse();
    const latestWindow = windows[0] ?? null;
    const prevWindow = windows[1] ?? null;
    const items = rows.map(r => {
      const snaps = (r.fb_engagement_snapshots ?? []).slice().sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
      const cur = snaps[0];
      const prev = snaps[1];
      const inWindow = !!latestWindow && r.latest_window_end === latestWindow;
      const s = cur ? score(cur.posts, cur.comments, cur.likes) : score(r.latest_posts_28d, r.latest_comments_28d, r.latest_likes_28d);
      const sPrev = prev ? score(prev.posts, prev.comments, prev.likes) : null;
      return { r, cur, prev, inWindow, s, sPrev, delta: sPrev == null ? null : s - sPrev };
    }).sort((a, b) => (Number(b.inWindow) - Number(a.inWindow)) || (b.s - a.s));
    const active = items.filter(i => i.inWindow);
    const quiet = items.filter(i => !i.inWindow);
    const sum = (xs: typeof items, k: 'posts' | 'comments' | 'likes') => xs.reduce((a, i) => a + (i.cur ? i.cur[k] : 0), 0);
    const sumPrev = (k: 'posts' | 'comments' | 'likes') => rows.reduce((a, r) => {
      const p = (r.fb_engagement_snapshots ?? []).find(s => s.snapshot_date === prevWindow);
      return a + (p ? p[k] : 0);
    }, 0);
    const prevCount = prevWindow ? rows.filter(r => (r.fb_engagement_snapshots ?? []).some(s => s.snapshot_date === prevWindow)).length : null;
    return {
      latestWindow, prevWindow, active, quiet,
      totals: { n: active.length, posts: sum(active, 'posts'), comments: sum(active, 'comments'), likes: sum(active, 'likes') },
      prevTotals: prevWindow ? { n: prevCount ?? 0, posts: sumPrev('posts'), comments: sumPrev('comments'), likes: sumPrev('likes') } : null,
    };
  }, [rows]);

  const Row = ({ item, dim }: { item: (typeof view.active)[number]; dim?: boolean }) => (
    <View style={{ flexDirection: 'row', paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.border, gap: 6, opacity: dim ? 0.55 : 1 }}>
      <View style={{ flex: 2 }}>
        <Text style={{ fontSize: 11, color: colors.text }}>{item.r.facebook_name}{item.r.pro_subscriber_id ? ' 🔗' : ''}</Text>
        {dim && <Text style={{ fontSize: 9, color: colors.textTertiary }}>last active window {item.r.latest_window_end ?? '—'}</Text>}
      </View>
      <Text style={{ width: 36, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>{item.cur?.posts ?? item.r.latest_posts_28d}</Text>
      <Text style={{ width: 44, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>{item.cur?.comments ?? item.r.latest_comments_28d}</Text>
      <Text style={{ width: 40, fontSize: 11, color: colors.textSecondary, textAlign: 'right' }}>{item.cur?.likes ?? item.r.latest_likes_28d}</Text>
      <Text style={{ width: 44, fontSize: 11, color: colors.primary, textAlign: 'right', fontWeight: '700' }}>{item.s}</Text>
      <Text style={{ width: 44, fontSize: 10, color: item.delta == null ? colors.textTertiary : item.delta < 0 ? colors.error : item.delta > 0 ? colors.success : colors.textTertiary, textAlign: 'right' }}>
        {item.delta == null ? 'new' : `${item.delta >= 0 ? '+' : ''}${item.delta}`}
      </Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Member Engagement</Text>
      <Text style={st.sub}>
        Every member the Group Insights export has listed, ranked by the latest 28-day window (score = posts×5 + comments×2 + reactions).
        Δ is against the previous imported window. Members who dropped out of the window are listed below, dimmed. 🔗 = linked to a roster row.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(['pro', 'free'] as const).map(g => (
          <TouchableOpacity key={g} onPress={() => setGroupType(g)} style={[st.optBtn, groupType === g && st.optBtnOn]}>
            <Text style={[st.optBtnText, groupType === g && st.optBtnTextOn]}>{g === 'pro' ? 'Pro Group' : 'Free Group'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : err ? (
        <Text style={{ color: colors.error, fontSize: 11 }}>{err}</Text>
      ) : rows.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>No contributors imported for this group yet — paste the Group Insights download in 🔥 Insights.</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {([
              ['ACTIVE MEMBERS', view.totals.n, view.prevTotals?.n],
              ['POSTS', view.totals.posts, view.prevTotals?.posts],
              ['COMMENTS', view.totals.comments, view.prevTotals?.comments],
              ['REACTIONS', view.totals.likes, view.prevTotals?.likes],
            ] as Array<[string, number, number | undefined]>).map(([label, v, p]) => (
              <Card key={label} style={{ padding: 10, flexGrow: 1, flexBasis: 110 }}>
                <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>{label}</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: p != null && v < p ? colors.error : colors.text }}>{v}</Text>
                <Text style={{ fontSize: 9, color: colors.textTertiary }}>
                  {view.latestWindow ? `window → ${view.latestWindow}` : ''}{p != null ? ` · was ${p}` : ''}
                </Text>
              </Card>
            ))}
          </View>

          <Card style={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 4, gap: 6 }}>
              <Text style={[st.fieldLabel, { flex: 2 }]}>MEMBER</Text>
              <Text style={[st.fieldLabel, { width: 36, textAlign: 'right' }]}>P</Text>
              <Text style={[st.fieldLabel, { width: 44, textAlign: 'right' }]}>C</Text>
              <Text style={[st.fieldLabel, { width: 40, textAlign: 'right' }]}>R</Text>
              <Text style={[st.fieldLabel, { width: 44, textAlign: 'right' }]}>SCORE</Text>
              <Text style={[st.fieldLabel, { width: 44, textAlign: 'right' }]}>Δ</Text>
            </View>
            {view.active.map(item => <Row key={item.r.id} item={item} />)}
            {view.quiet.length > 0 && (
              <>
                <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 10, marginBottom: 2, letterSpacing: 1 }}>
                  GONE QUIET · {view.quiet.length} (not in the {view.latestWindow ?? 'latest'} window)
                </Text>
                {view.quiet.map(item => <Row key={item.r.id} item={item} dim />)}
              </>
            )}
          </Card>
          <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 8 }}>
            Members who go quiet here and then miss a renewal are the churn pattern; check them against Pro Subscribers → Renewals due.
          </Text>
        </>
      )}
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
        {(['subscribers', 'insights', 'engagement', 'earnings', 'history'] as Tab[]).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[st.filterBtn, tab === t && st.filterBtnOn]}>
            <Text style={[st.filterBtnText, tab === t && { color: '#fff', fontWeight: '700' }]}>
              {t === 'subscribers' ? '📧 Subscribers' : t === 'insights' ? '🔥 Insights' : t === 'engagement' ? '👥 Engagement' : t === 'earnings' ? '💵 Earnings' : '🗂 History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'subscribers' && <SubscriberPasteTab onCommitted={bump} />}
      {tab === 'insights' && <InsightsPasteTab onCommitted={bump} />}
      {tab === 'engagement' && <EngagementTab refreshKey={refreshKey} />}
      {tab === 'earnings' && <EarningsPasteTab onCommitted={bump} />}
      {tab === 'history' && <HistoryTab refreshKey={refreshKey} />}
    </View>
  );
}

export default function SubscriberImportView() {
  return <AdminKeyGate><SubscriberImportInner /></AdminKeyGate>;
}
