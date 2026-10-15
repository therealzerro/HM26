import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { alertAsync } from '@/lib/confirm';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Card, Pill, SectionTitle, useSt, timeAgo } from './AdminShared';
import { AdminKeyGate } from './AdminKeyGate';
import {
  subscriberAdmin,
  maskEmail,
  type ProSubscriber,
  type GroupDailyRow,
} from '@/lib/subscriberAdminClient';
import { identityLabel, isPlaceholderEmail } from '@/lib/subscriberNameLink';
import * as Clipboard from 'expo-clipboard';
import { getTodayET } from '@/lib/dateUtils';
import { PRO_ONBOARDING_TEMPLATES, ONBOARDING_DUE_DAYS, ONBOARDING_TOUCH_LABEL, fillName, type OnboardingTouchKey } from '@/lib/social/proOnboarding';
import type { OnboardingTouch } from '@/lib/subscriberAdminClient';

const TOUCHES: OnboardingTouchKey[] = ['day1', 'day3', 'day21'];
const UNKNOWN_START_MARK = 'unknown real start';

/**
 * MKT-86 E3 — ONBOARDING TICKS. One tick per member per touch (day 1 / day 3 /
 * day 21 since date_subscribed), recorded with the date, so a later pass can
 * compare first-renewal rates for members who got all three vs not. The copy
 * buttons hand the operator the verbatim Pro-room comment with {name} filled
 * from the member's display name when known. Nothing here leaves the app.
 */
function OnboardingCard({
  rows, touches, revealAll, onToggle,
}: {
  rows: ProSubscriber[];
  touches: OnboardingTouch[];
  revealAll: boolean;
  onToggle: (subscriber_id: string, touch: OnboardingTouchKey, done: boolean) => void;
}) {
  const { colors } = useTheme();
  const st = useSt();
  const [showUpcoming, setShowUpcoming] = useState(true);
  const today = getTodayET();
  const todayMs = new Date(today + 'T00:00:00Z').getTime();
  const daysSince = (r: ProSubscriber) => Math.round((todayMs - new Date(r.date_subscribed + 'T00:00:00Z').getTime()) / 86400000);
  const byMember = useMemo(() => {
    const m = new Map<string, Partial<Record<OnboardingTouchKey, OnboardingTouch>>>();
    for (const t of touches) {
      const cur = m.get(t.subscriber_id) ?? {};
      cur[t.touch] = t;
      m.set(t.subscriber_id, cur);
    }
    return m;
  }, [touches]);

  const active = useMemo(() => rows.filter(r => r.status === 'active'), [rows]);
  const unknownStart = useMemo(() => active.filter(r => (r.notes ?? '').includes(UNKNOWN_START_MARK)), [active]);
  const known = useMemo(() => active.filter(r => !(r.notes ?? '').includes(UNKNOWN_START_MARK)), [active]);
  const dueToday = useMemo(() => known
    .map(r => ({ r, d: daysSince(r), due: TOUCHES.filter(t => ONBOARDING_DUE_DAYS[t] === daysSince(r)) }))
    .filter(x => x.due.length > 0), [known]); // eslint-disable-line react-hooks/exhaustive-deps
  const upcoming = useMemo(() => known
    .map(r => ({ r, d: daysSince(r) }))
    .filter(x => x.d >= 0 && x.d <= 30 && !dueToday.some(y => y.r.id === x.r.id))
    .sort((a, b) => a.d - b.d), [known, dueToday]); // eslint-disable-line react-hooks/exhaustive-deps
  const allThree = useMemo(() => active.filter(r => { const t = byMember.get(r.id); return !!(t?.day1 && t?.day3 && t?.day21); }).length, [active, byMember]);

  const copy = useCallback(async (r: ProSubscriber, t: OnboardingTouchKey) => {
    const text = fillName(PRO_ONBOARDING_TEMPLATES[t], r.facebook_name);
    try {
      await Clipboard.setStringAsync(text);
      alertAsync('Copied', `${ONBOARDING_TOUCH_LABEL[t]} comment on the clipboard${/\{name\}/.test(text) ? ' — {name} is still a placeholder (no display name on the roster); type it before posting.' : '.'}`);
    } catch (e) {
      alertAsync('Copy failed', e instanceof Error ? e.message : String(e));
    }
  }, []);

  const MemberLine = ({ r, d }: { r: ProSubscriber; d: number | null }) => {
    const t = byMember.get(r.id) ?? {};
    const done = TOUCHES.filter(k => t[k]).length;
    return (
      <View style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }} numberOfLines={1}>
            {identityLabel(r, revealAll ? r.email : maskEmail(r.email))}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary }}>{d == null ? 'join date unknown' : `day ${d}`}</Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: done === 3 ? colors.success + '22' : colors.border }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: done === 3 ? colors.success : colors.textSecondary }}>{done}/3</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {TOUCHES.map(k => {
            const tick = t[k];
            const dueNow = d != null && ONBOARDING_DUE_DAYS[k] === d;
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => onToggle(r.id, k, !tick)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tick ? 'Untick' : 'Tick'} ${ONBOARDING_TOUCH_LABEL[k]}`}
                  style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: tick ? colors.success : dueNow ? colors.gold : colors.border, backgroundColor: tick ? colors.success + '22' : dueNow ? colors.gold + '18' : 'transparent' }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '800', color: tick ? colors.success : dueNow ? colors.gold : colors.textSecondary }}>
                    {tick ? `✓ ${ONBOARDING_TOUCH_LABEL[k]} · ${tick.done_on.slice(5)}` : ONBOARDING_TOUCH_LABEL[k]}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => copy(r, k)} accessibilityRole="button" accessibilityLabel={`Copy the ${ONBOARDING_TOUCH_LABEL[k]} comment`} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 10, color: colors.primary }}>📋</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Card style={{ padding: 12, marginBottom: 14 }}>
      <SectionTitle>{`💎 Onboarding · due today: ${dueToday.length}`}</SectionTitle>
      <Text style={st.sub}>
        Members with all three touches: {allThree} · first-renewal comparison available once a cohort passes day 30.
        {' '}Tick after you post the comment in the Pro group; 📋 copies it with the member&apos;s name filled when the roster has one.
        {' '}Roster dates can be wrong — check the Pro group&apos;s new-member list before tagging.
      </Text>
      <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1, marginTop: 8 }}>DUE TODAY · {today}</Text>
      {dueToday.length === 0
        ? <Text style={{ fontSize: 11, color: colors.textSecondary, marginVertical: 4 }}>No member is at day 1, 3 or 21 today.</Text>
        : dueToday.map(({ r, d }) => <MemberLine key={r.id} r={r} d={d} />)}
      <TouchableOpacity onPress={() => setShowUpcoming(v => !v)} style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>UPCOMING · JOINED ≤ 30 DAYS · {upcoming.length} {showUpcoming ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {showUpcoming && (upcoming.length === 0
        ? <Text style={{ fontSize: 11, color: colors.textSecondary, marginVertical: 4 }}>No member with a known join date in the last 30 days.</Text>
        : upcoming.map(({ r, d }) => <MemberLine key={r.id} r={r} d={d} />))}
      {unknownStart.length > 0 && (
        <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 8 }}>
          {unknownStart.length} active member{unknownStart.length === 1 ? '' : 's'} joined on an unknown date (email-only export, dated on import) and cannot be scheduled — tick them from their row below when you see them in the group.
        </Text>
      )}
    </Card>
  );
}


const ACQ_SOURCES = ['reel', 'cross_post', 'free_group_organic', 'direct_referral', 'word_of_mouth', 'unknown'] as const;
const STATUSES = ['active', 'churned', 'comped', 'paused', 'unknown'] as const;

function StatusPill({ status }: { status: string }) {
  const { colors } = useTheme();
  const c = status === 'active' ? colors.success
    : status === 'churned' ? colors.error
    : status === 'comped' ? colors.gold
    : status === 'paused' ? colors.textTertiary
    : colors.textSecondary;
  return <Pill label={status.toUpperCase()} color={c} />;
}

function SubscriberRow({
  row,
  expanded,
  onToggle,
  onPatch,
  revealEmail,
}: {
  row: ProSubscriber;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<ProSubscriber>) => void;
  revealEmail: boolean;
}) {
  const { colors } = useTheme();
  const st = useSt();
  const daysActive = useMemo(() => {
    const start = new Date(row.date_subscribed + 'T00:00:00Z').getTime();
    const end = (row.status === 'churned' && row.date_churned)
      ? new Date(row.date_churned + 'T00:00:00Z').getTime()
      : Date.now();
    return Math.max(0, Math.floor((end - start) / 86400000));
  }, [row.date_subscribed, row.date_churned, row.status]);

  const [nameEdit, setNameEdit] = useState(row.facebook_name ?? '');
  const [notesEdit, setNotesEdit] = useState(row.notes ?? '');

  useEffect(() => {
    setNameEdit(row.facebook_name ?? '');
    setNotesEdit(row.notes ?? '');
  }, [row.id, row.facebook_name, row.notes]);

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
      <TouchableOpacity onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 }}>
        <View style={{ flex: 2 }}>
          <Text style={{ fontSize: 12, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>
            {identityLabel(row, revealEmail ? row.email : maskEmail(row.email))}
          </Text>
          {row.facebook_name && !isPlaceholderEmail(row.email) && (
            <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>{row.facebook_name}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{row.date_subscribed}</Text>
          <Text style={{ fontSize: 9, color: colors.textTertiary, marginTop: 2 }}>{daysActive}d</Text>
        </View>
        <View style={{ width: 78, alignItems: 'flex-end' }}>
          <StatusPill status={row.status} />
        </View>
        <Text style={{ fontSize: 12, color: colors.textTertiary, width: 12 }}>{expanded ? '▾' : '▸'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingVertical: 12, paddingHorizontal: 4, gap: 12 }}>
          <View>
            <Text style={st.fieldLabel}>Facebook Name</Text>
            <TextInput
              value={nameEdit}
              onChangeText={setNameEdit}
              onBlur={() => {
                if ((nameEdit || null) !== (row.facebook_name || null)) {
                  onPatch({ facebook_name: nameEdit || null });
                }
              }}
              placeholder="Type display name from FB"
              placeholderTextColor={colors.textTertiary}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }}
            />
          </View>

          <View>
            <Text style={st.fieldLabel}>Status</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {STATUSES.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => {
                    if (s === row.status) return;
                    const patch: any = { status: s };
                    if (s === 'churned' && !row.date_churned) {
                      patch.date_churned = new Date().toISOString().slice(0, 10);
                    }
                    onPatch(patch);
                  }}
                  style={[st.optBtn, row.status === s && st.optBtnOn]}
                >
                  <Text style={[st.optBtnText, row.status === s && st.optBtnTextOn]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={st.fieldLabel}>Acquisition Source</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ACQ_SOURCES.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => onPatch({ acquisition_source: s })}
                  style={[st.optBtn, row.acquisition_source === s && st.optBtnOn]}
                >
                  <Text style={[st.optBtnText, row.acquisition_source === s && st.optBtnTextOn]}>{s.replace(/_/g, ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={st.fieldLabel}>Notes</Text>
            <TextInput
              value={notesEdit}
              onChangeText={setNotesEdit}
              onBlur={() => {
                if ((notesEdit || null) !== (row.notes || null)) {
                  onPatch({ notes: notesEdit || null });
                }
              }}
              multiline
              placeholder="Operator notes"
              placeholderTextColor={colors.textTertiary}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface, minHeight: 50 }}
            />
          </View>

          {row.date_churned && (
            <Text style={{ fontSize: 10, color: colors.textTertiary }}>
              Churned {row.date_churned} · last update {timeAgo(row.updated_at)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function AddManualForm({ onAdded }: { onAdded: () => void }) {
  const { colors } = useTheme();
  const st = useSt();
  const [email, setEmail] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<typeof STATUSES[number]>('comped');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    // BUG-177: this field accepted any text containing "@" — a whole pasted
    // export landed as ONE roster row whose email was 57 addresses. Exactly one
    // address, no whitespace; multi-line lists belong in Sub Import.
    const one = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(one) || !date) {
      alertAsync('One email only', 'Enter a single email address here. To add a list, use Sub Import → Subscribers.');
      return;
    }
    setBusy(true);
    try {
      await subscriberAdmin.upsertSubscribers([{ email: one, date_subscribed: date, status }]);
      await subscriberAdmin.recordImport({
        import_type: 'manual',
        source_filename: 'admin_ui_manual_add',
        records_processed: 1,
        records_created: 1,
        records_updated: 0,
        records_skipped: 0,
      });
      setEmail('');
      onAdded();
    } catch (e) {
      alertAsync('Add failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [email, date, status, onAdded]);

  return (
    <Card style={{ padding: 14, marginTop: 14 }}>
      <Text style={st.title}>Add Manual Subscriber</Text>
      <Text style={st.sub}>For comped members, special cases, or not-yet-synced records.</Text>
      <View style={{ gap: 10 }}>
        <View>
          <Text style={st.fieldLabel}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            placeholder="someone@example.com"
            placeholderTextColor={colors.textTertiary}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }}
          />
        </View>
        <View>
          <Text style={st.fieldLabel}>Date Subscribed (YYYY-MM-DD)</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }}
          />
        </View>
        <View>
          <Text style={st.fieldLabel}>Status</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {STATUSES.map(s => (
              <TouchableOpacity key={s} onPress={() => setStatus(s)} style={[st.optBtn, status === s && st.optBtnOn]}>
                <Text style={[st.optBtnText, status === s && st.optBtnTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity disabled={busy} style={[st.btnPrimary, busy && { opacity: 0.5 }]} onPress={submit}>
          <Text style={st.btnPrimaryText}>{busy ? 'Adding…' : 'Add Subscriber'}</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

function ProSubscribersInner() {
  const { colors } = useTheme();
  const st = useSt();
  const [rows, setRows] = useState<ProSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revealAll, setRevealAll] = useState(false);
  // Latest Pro-group headcount from Group Insights (fb_group_daily). The roster
  // counts paying emails; once members leave the group they stay "active" here
  // until the next supporter-email export — surface the gap.
  const [groupLatest, setGroupLatest] = useState<GroupDailyRow | null>(null);
  // MKT-86 E3: onboarding ticks (day 1 / 3 / 21) per member.
  const [touches, setTouches] = useState<OnboardingTouch[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [data, gd, ob] = await Promise.all([
        subscriberAdmin.listSubscribers({}),
        subscriberAdmin.listGroupDaily('pro', 14).catch(() => [] as GroupDailyRow[]),
        subscriberAdmin.listOnboarding().catch(() => [] as OnboardingTouch[]),
      ]);
      setRows(data);
      setGroupLatest(gd.find(r => r.total_members != null) ?? null);
      setTouches(ob);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Optimistic tick/untick; the server is the truth on the next load.
  const toggleTouch = useCallback(async (subscriber_id: string, touch: OnboardingTouchKey, done: boolean) => {
    const today = getTodayET();
    setTouches(prev => {
      const rest = prev.filter(t => !(t.subscriber_id === subscriber_id && t.touch === touch));
      return done ? [{ id: `tmp-${subscriber_id}-${touch}`, subscriber_id, touch, done_on: today, note: null, created_at: new Date().toISOString() }, ...rest] : rest;
    });
    try {
      await subscriberAdmin.setOnboarding({ subscriber_id, touch, done });
    } catch (e) {
      alertAsync('Tick failed', e instanceof Error ? e.message : String(e));
      try { setTouches(await subscriberAdmin.listOnboarding()); } catch { /* keep optimistic state */ }
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.email.toLowerCase().includes(q) && !(r.facebook_name ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  const totals = useMemo(() => ({
    active: rows.filter(r => r.status === 'active').length,
    churned: rows.filter(r => r.status === 'churned').length,
    comped: rows.filter(r => r.status === 'comped').length,
    mrr: rows.filter(r => r.status === 'active').reduce((s, r) => s + (Number(r.monthly_price_usd) || 0), 0),
  }), [rows]);

  // Renewal calendar: Meta bills each subscriber monthly on their subscribe
  // day-of-month, so the next renewal is the next occurrence of that day.
  // During a churn window this is the list of who is about to decide.
  const renewals = useMemo(() => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10);
    const next = (dateSubscribed: string) => {
      const dom = parseInt(dateSubscribed.slice(8, 10), 10);
      for (let k = 0; k < 3; k++) {
        const y = today.getUTCFullYear(); const m = today.getUTCMonth() + k;
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const d = new Date(Date.UTC(y, m, Math.min(dom, last)));
        const iso = d.toISOString().slice(0, 10);
        if (iso >= todayIso) return iso;
      }
      return todayIso;
    };
    const items = rows
      .filter(r => r.status === 'active')
      .map(r => {
        const due = next(r.date_subscribed);
        const daysOut = Math.round((new Date(due + 'T00:00:00Z').getTime() - today.getTime()) / 86400000);
        const months = Math.max(0, Math.floor((today.getTime() - new Date(r.date_subscribed + 'T00:00:00Z').getTime()) / (30.44 * 86400000)));
        return { r, due, daysOut, months };
      })
      .sort((a, b) => a.due.localeCompare(b.due));
    return {
      next7: items.filter(i => i.daysOut <= 7),
      next8to30: items.filter(i => i.daysOut > 7 && i.daysOut <= 30).length,
      firstRenewal7: items.filter(i => i.daysOut <= 7 && i.months <= 1).length,
    };
  }, [rows]);

  // Cohorts by subscribe month: how much of each intake is still paying.
  const cohorts = useMemo(() => {
    const m = new Map<string, { total: number; active: number; churned: number; other: number }>();
    for (const r of rows) {
      const k = r.date_subscribed.slice(0, 7);
      const c = m.get(k) ?? { total: 0, active: 0, churned: 0, other: 0 };
      c.total++;
      if (r.status === 'active') c.active++;
      else if (r.status === 'churned') c.churned++;
      else c.other++;
      m.set(k, c);
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const patchRow = useCallback(async (id: string, patch: Partial<ProSubscriber>) => {
    try {
      await subscriberAdmin.updateSubscriber({ id, ...patch } as any);
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } as ProSubscriber : r));
    } catch (e) {
      alertAsync('Update failed', e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Pro Subscribers</Text>
      <Text style={st.sub}>Source-of-truth roster from Meta Business Suite exports.</Text>

      {groupLatest && groupLatest.total_members != null && totals.active - Number(groupLatest.total_members) > 2 && (
        <Card style={{ padding: 12, marginBottom: 14, borderColor: colors.gold + '55' }}>
          <Text style={{ fontSize: 11, color: colors.gold, fontWeight: '700' }}>
            ⚠ Roster {totals.active} active vs {groupLatest.total_members} members in the Pro group (Insights, {groupLatest.day})
            — {totals.active - Number(groupLatest.total_members)} likely churned and unrecorded. Import the latest supporter-email
            export in Sub Import → 📧 and run Probe Potential Churns; mark the leavers churned so MRR stops counting them.
          </Text>
        </Card>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Card style={{ padding: 10, flexGrow: 1, flexBasis: 100 }}>
          <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>ACTIVE</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.success }}>{totals.active}</Text>
        </Card>
        <Card style={{ padding: 10, flexGrow: 1, flexBasis: 100 }}>
          <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>GROSS MRR</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>${totals.mrr.toFixed(2)}</Text>
        </Card>
        <Card style={{ padding: 10, flexGrow: 1, flexBasis: 100 }}>
          <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>CHURNED</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.error }}>{totals.churned}</Text>
        </Card>
        <Card style={{ padding: 10, flexGrow: 1, flexBasis: 100 }}>
          <Text style={{ fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>COMPED</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.gold }}>{totals.comped}</Text>
        </Card>
      </View>

      {!loading && rows.length > 0 && (
        <OnboardingCard rows={rows} touches={touches} revealAll={revealAll} onToggle={toggleTouch} />
      )}

      {!loading && rows.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>{`Renewals due · next 7 days: ${renewals.next7.length} · days 8–30: ${renewals.next8to30}`}</SectionTitle>
          <Text style={st.sub}>
            Meta bills on the subscribe day each month. {renewals.firstRenewal7 > 0 ? `${renewals.firstRenewal7} of the next-7-day renewals are FIRST renewals (joined ≤1 month ago) — the cohort most likely to lapse. ` : ''}
            After each renewal date passes, the earnings export shows whether it cleared (Funnel → Renewal wave).
          </Text>
          {renewals.next7.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Nothing due in the next 7 days.</Text>
          ) : renewals.next7.slice(0, 25).map(({ r, due, daysOut, months }) => (
            <View key={r.id} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 8, alignItems: 'center' }}>
              <Text style={{ flex: 2, fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>{identityLabel(r, revealAll ? r.email : maskEmail(r.email))}</Text>
              <Text style={{ width: 80, fontSize: 11, color: daysOut <= 1 ? colors.gold : colors.textSecondary, textAlign: 'right' }}>{daysOut === 0 ? 'today' : daysOut === 1 ? 'tomorrow' : due.slice(5)}</Text>
              <Text style={{ width: 54, fontSize: 10, color: months <= 1 ? colors.gold : colors.textTertiary, textAlign: 'right' }}>{months <= 1 ? '1st' : `${months}th`} renewal</Text>
            </View>
          ))}
          {renewals.next7.length > 25 && <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>… and {renewals.next7.length - 25} more</Text>}
        </Card>
      )}

      {cohorts.length > 0 && (
        <Card style={{ padding: 12, marginBottom: 14 }}>
          <SectionTitle>Cohorts by subscribe month</SectionTitle>
          <View style={{ flexDirection: 'row', paddingVertical: 4, gap: 6 }}>
            <Text style={{ flex: 1.2, fontSize: 9, color: colors.textTertiary, letterSpacing: 1 }}>MONTH</Text>
            <Text style={{ width: 50, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, textAlign: 'right' }}>JOINED</Text>
            <Text style={{ width: 50, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, textAlign: 'right' }}>ACTIVE</Text>
            <Text style={{ width: 56, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, textAlign: 'right' }}>CHURNED</Text>
            <Text style={{ width: 56, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, textAlign: 'right' }}>RETAINED</Text>
          </View>
          {cohorts.map(([month, c]) => (
            <View key={month} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
              <Text style={{ flex: 1.2, fontSize: 11, color: colors.text }}>{month}</Text>
              <Text style={{ width: 50, fontSize: 11, color: colors.textSecondary, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{c.total}</Text>
              <Text style={{ width: 50, fontSize: 11, color: colors.success, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '700' }}>{c.active}</Text>
              <Text style={{ width: 56, fontSize: 11, color: c.churned ? colors.error : colors.textTertiary, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{c.churned}</Text>
              <Text style={{ width: 56, fontSize: 11, color: colors.text, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{c.total ? `${Math.round((c.active / c.total) * 100)}%` : '—'}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 6 }}>
            RETAINED counts roster status, which only changes when you mark churns (Sub Import → Probe Potential Churns → Mark churned).
            If it reads 100% while the Pro group shrinks, the roster is stale, not the cohort healthy.
          </Text>
        </Card>
      )}

      <Card style={{ padding: 12, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search email or facebook name…"
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surface }}
          />
          <TouchableOpacity onPress={() => setRevealAll(v => !v)} style={[st.filterBtn, revealAll && st.filterBtnOn]}>
            <Text style={[st.filterBtnText, revealAll && { color: '#fff', fontWeight: '700' }]}>
              {revealAll ? '🔓 Revealed' : '🔒 Masked'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {['all', ...STATUSES].map(s => (
            <TouchableOpacity key={s} onPress={() => setStatusFilter(s)} style={[st.filterBtn, statusFilter === s && st.filterBtnOn]}>
              <Text style={[st.filterBtnText, statusFilter === s && { color: '#fff', fontWeight: '700' }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card style={{ padding: 12 }}>
        <SectionTitle>{`${filtered.length} of ${rows.length}`}</SectionTitle>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : err ? (
          <Text style={{ color: colors.error, fontSize: 11 }}>{err}</Text>
        ) : filtered.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>No matching subscribers.</Text>
        ) : (
          <View>
            <View style={{ flexDirection: 'row', paddingVertical: 6, gap: 10 }}>
              <Text style={[st.fieldLabel, { flex: 2 }]}>EMAIL / NAME</Text>
              <Text style={[st.fieldLabel, { flex: 1 }]}>SUBSCRIBED</Text>
              <Text style={[st.fieldLabel, { width: 78, textAlign: 'right' }]}>STATUS</Text>
              <Text style={{ width: 12 }}></Text>
            </View>
            {filtered.map(row => (
              <SubscriberRow
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => setExpandedId(prev => prev === row.id ? null : row.id)}
                onPatch={(patch) => patchRow(row.id, patch)}
                revealEmail={revealAll}
              />
            ))}
          </View>
        )}
      </Card>

      <AddManualForm onAdded={load} />
    </ScrollView>
  );
}

export default function ProSubscribersView() {
  return <AdminKeyGate><ProSubscribersInner /></AdminKeyGate>;
}
