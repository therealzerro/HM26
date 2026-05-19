import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Card, Pill, SectionTitle, useSt, timeAgo } from './AdminShared';
import { AdminKeyGate } from './AdminKeyGate';
import {
  subscriberAdmin,
  maskEmail,
  type ProSubscriber,
} from '@/lib/subscriberAdminClient';

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
          <Text style={{ fontSize: 12, color: colors.text, fontFamily: 'monospace' }}>
            {revealEmail ? row.email : maskEmail(row.email)}
          </Text>
          {row.facebook_name && (
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
    if (!email.includes('@') || !date) return;
    setBusy(true);
    try {
      await subscriberAdmin.upsertSubscribers([{ email, date_subscribed: date, status }]);
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
      Alert.alert('Add failed', e instanceof Error ? e.message : String(e));
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

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await subscriberAdmin.listSubscribers({});
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const patchRow = useCallback(async (id: string, patch: Partial<ProSubscriber>) => {
    try {
      await subscriberAdmin.updateSubscriber({ id, ...patch } as any);
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } as ProSubscriber : r));
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={st.title}>Pro Subscribers</Text>
      <Text style={st.sub}>Source-of-truth roster from Meta Business Suite exports.</Text>

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
