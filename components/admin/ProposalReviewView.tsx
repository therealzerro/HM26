/**
 * ProposalReviewView — Admin surface for the Weight Proposal System.
 *
 * Reads audit_logs rows of action ∈ {weight_proposal_generated,
 * weight_proposal_applied, weight_proposal_dismissed, weight_proposal_reverted,
 * weight_proposal_blocked} and renders four sections:
 *
 *   1. Pending Proposals    — operator can Approve & Apply / Dismiss
 *   2. Recently Applied     — operator can one-click Revert
 *   3. Blocked Proposals    — informational debug signal
 *   4. System Status        — last/next run + sample-size indicator
 *
 * All apply/revert/dismiss actions go through lib/applyWeightUpdate.ts
 * which writes audit_logs rows + executes app_config PATCHes server-
 * side via the anon key. Operator confirmations are explicit (modal +
 * checkbox).
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { alertAsync } from '@/lib/confirm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { theme } from '@/constants/theme';
import { Card, SectionTitle, useSt } from './AdminShared';
import {
  applyApprovedProposal,
  revertAppliedProposal,
  dismissProposal,
} from '@/lib/applyWeightUpdate';
import { useAuth } from '@/hooks/useAuth';

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  payload_meta: any;
  created_at: string;
}

const Q_KEY = ['weight_proposals'];

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function daysUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'expired';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return `expires in ${days}d`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `expires in ${hours}h`;
}

function fmtWeightSet(w: any): string {
  if (!w) return '—';
  const pct = (v: number) => (v <= 1 ? (v * 100).toFixed(1) : v.toFixed(1)) + '%';
  return `BOX ${pct(w.BOX ?? 0)} · PBURST ${pct(w.PBURST ?? 0)} · CO ${pct(w.CO ?? 0)} · DGC ${pct(w.DGC ?? 0)}`;
}

export default function ProposalReviewView() {
  const { colors } = useTheme();
  const s = useSt(colors);
  const qc = useQueryClient();
  const { user } = useAuth();
  const operatorId = user?.id ?? 'unknown_operator';

  // ── Data fetch ──
  const { data: rows = [], isLoading, refetch } = useQuery<AuditLogRow[]>({
    queryKey: Q_KEY,
    queryFn: async () => {
      const r = await fetchFromSupabase<AuditLogRow[]>({
        path: `/rest/v1/audit_logs?action=in.(weight_proposal_generated,weight_proposal_applied,weight_proposal_dismissed,weight_proposal_reverted,weight_proposal_blocked,weight_proposal_apply_failed,weight_proposal_revert_failed)&order=created_at.desc&limit=200`,
      });
      return Array.isArray(r) ? r : [];
    },
    staleTime: 30000,
  });

  // Sample-size proxy for system status.
  //
  // PROP-01 (2026-06-06): the prior query lacked a matched_state filter and
  // returned a mix of (a) ~2 labeled K6 primaries (the only ones with
  // result_at populated under the old data model) and (b) ~136 secondary hit
  // rows, where hit_box.eq.true is structurally always true on secondaries.
  // The dataset was ~99% hits / 0% misses — a degenerate training set that
  // would make gateAucImprovement return 0.5 immediately. Pairs with
  // HIT-DET-01 (now stamps result_at on missed K6 primaries too).
  //
  // New query: count distinct K6 picks where outcome is known. Filter
  // result_at IS NOT NULL (post-HIT-DET-01 this is populated on hits AND
  // misses), then dedupe (slate_hash, rank, combo) client-side so a hit
  // pick that landed in 3 jurisdictions counts once, not three times.
  const { data: atSampleSize = 0 } = useQuery<number>({
    queryKey: ['adaptive_tracking_sample_size'],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().split('T')[0];
      const rows = await fetchFromSupabase<{ slate_hash: string; rank: number; combo: string }[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=gte.${sinceStr}&mode=eq.balanced&rank=gte.1&rank=lte.6&result_at=not.is.null&select=slate_hash,rank,combo&limit=10000`,
      });
      if (!Array.isArray(rows)) return 0;
      const uniquePicks = new Set(rows.map(r => `${r.slate_hash}|${r.rank}|${r.combo}`));
      return uniquePicks.size;
    },
    staleTime: 60000,
  });

  // ── Classify rows ──
  const { pending, applied, blocked, dismissedIds, appliedProposalIds } = useMemo(() => {
    const dismissedIds = new Set<string>();
    const appliedProposalIds = new Set<string>();
    for (const r of rows) {
      if (r.action === 'weight_proposal_dismissed' && r.target) dismissedIds.add(r.target);
      if (r.action === 'weight_proposal_applied' && r.payload_meta?.proposal_id) {
        appliedProposalIds.add(r.payload_meta.proposal_id);
      }
    }
    const revertedAppliedIds = new Set<string>();
    for (const r of rows) {
      if (r.action === 'weight_proposal_reverted' && r.payload_meta?.applied_audit_log_id) {
        revertedAppliedIds.add(r.payload_meta.applied_audit_log_id);
      }
    }

    const pending = rows.filter(r =>
      r.action === 'weight_proposal_generated' &&
      !dismissedIds.has(r.id) &&
      !appliedProposalIds.has(r.id) &&
      r.payload_meta?.expires_at &&
      new Date(r.payload_meta.expires_at) > new Date()
    );
    const applied = rows.filter(r =>
      r.action === 'weight_proposal_applied' &&
      !revertedAppliedIds.has(r.id)
    ).slice(0, 10);
    const blocked = rows.filter(r => r.action === 'weight_proposal_blocked').slice(0, 10);

    return { pending, applied, blocked, dismissedIds, appliedProposalIds };
  }, [rows]);

  // ── Last/next scheduled run estimate ──
  const lastRun = useMemo(() => {
    const all = rows.filter(r => r.action === 'weight_proposal_generated' || r.action === 'weight_proposal_blocked');
    return all.length > 0 ? all[0].created_at : null;
  }, [rows]);

  // ── Modal state ──
  const [modal, setModal] = useState<
    | { kind: 'apply'; proposal: AuditLogRow }
    | { kind: 'dismiss'; proposal: AuditLogRow }
    | { kind: 'revert'; applied: AuditLogRow }
    | null
  >(null);
  const [acknowledgeRevert, setAcknowledgeRevert] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const closeModal = () => { setModal(null); setAcknowledgeRevert(false); setReason(''); };

  const handleApply = useCallback(async () => {
    if (!modal || modal.kind !== 'apply') return;
    if (!acknowledgeRevert) return;
    setBusy(true);
    try {
      const result = await applyApprovedProposal({
        proposalId: modal.proposal.id,
        approvedBy: operatorId,
        acknowledgeRevert: true,
      });
      alertAsync(
        'Applied',
        `${result.configKeysUpdated.length} app_config key${result.configKeysUpdated.length === 1 ? '' : 's'} updated. Press Regenerate to use the new weights.`,
      );
      closeModal();
      qc.invalidateQueries({ queryKey: Q_KEY });
    } catch (e) {
      alertAsync('Apply failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [modal, acknowledgeRevert, operatorId, qc]);

  const handleDismiss = useCallback(async () => {
    if (!modal || modal.kind !== 'dismiss') return;
    setBusy(true);
    try {
      await dismissProposal({
        proposalId: modal.proposal.id,
        dismissedBy: operatorId,
        reason: reason || undefined,
      });
      closeModal();
      qc.invalidateQueries({ queryKey: Q_KEY });
    } catch (e) {
      alertAsync('Dismiss failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [modal, reason, operatorId, qc]);

  const handleRevert = useCallback(async () => {
    if (!modal || modal.kind !== 'revert') return;
    if (!acknowledgeRevert) return;
    setBusy(true);
    try {
      const result = await revertAppliedProposal({
        appliedAuditLogId: modal.applied.id,
        revertedBy: operatorId,
        reason: reason || undefined,
      });
      alertAsync(
        'Reverted',
        `${result.configKeysRestored.length} app_config key${result.configKeysRestored.length === 1 ? '' : 's'} restored. Press Regenerate to use the restored weights.`,
      );
      closeModal();
      qc.invalidateQueries({ queryKey: Q_KEY });
    } catch (e) {
      alertAsync('Revert failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [modal, acknowledgeRevert, reason, operatorId, qc]);

  // ── Render ──
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textTertiary, marginTop: 8 }}>Loading proposals…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 }}>
        Weight Proposals
      </Text>
      <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 14 }}>
        Auto-generated weekly. Review and approve to apply; regenerate manually to use.
      </Text>

      {/* ── Section 1: Pending ── */}
      <SectionTitle>PENDING ({pending.length})</SectionTitle>
      {pending.length === 0 && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>
            No pending proposals. Next scheduled run: Sunday 5:00 AM ET (when scheduling is enabled).
          </Text>
        </Card>
      )}
      {pending.map(p => {
        const pm = p.payload_meta ?? {};
        const proposed = pm.proposed_weights?.balanced;
        const auc = pm.auc;
        const g3 = pm.all_gate_results?.find((g: any) => g.name === 'G3_historical_backtest');
        const g4 = pm.all_gate_results?.find((g: any) => g.name === 'G4_divergence');
        const g5 = pm.all_gate_results?.find((g: any) => g.name === 'G5_per_scope_respect');
        return (
          <Card key={p.id} style={{ padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {fmtDate(p.created_at)} · {daysUntil(pm.expires_at)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {pm.g3_status === 'skipped_edge' && (
                  <View style={{ backgroundColor: colors.gold + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: colors.gold + '55' }}>
                    <Text style={{ fontSize: 9, color: colors.gold, fontWeight: '700' }}>G3 NOT VALIDATED</Text>
                  </View>
                )}
                {g4?.details?.is_high_divergence && (
                  <View style={{ backgroundColor: colors.gold + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9, color: colors.gold, fontWeight: '700' }}>HIGH DIVERGENCE</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={{ fontSize: 12, color: colors.text, fontFamily: theme.typography.fontFamily.mono, marginBottom: 6 }}>
              Proposed (balanced): {fmtWeightSet(proposed)}
            </Text>
            {auc && (
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 4 }}>
                Per-signal AUC: BOX {auc.signal_box?.toFixed(3)} · PBURST {auc.signal_pburst?.toFixed(3)} · CO {auc.signal_co?.toFixed(3)} · DGC {auc.signal_dgc?.toFixed(3)}
              </Text>
            )}
            {g3?.details?.scopeResults && (
              <View style={{ marginTop: 6, marginBottom: 6 }}>
                <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 3 }}>Backtest delta vs current:</Text>
                {g3.details.scopeResults.map((sr: any) => (
                  <Text key={sr.scope} style={{ fontSize: 10, color: sr.delta >= 0 ? colors.success : colors.error, fontFamily: theme.typography.fontFamily.mono }}>
                    {'  '}{sr.scope.padEnd(8)} {(sr.currentRate * 100).toFixed(1)}% → {(sr.proposedRate * 100).toFixed(1)}% ({sr.delta >= 0 ? '+' : ''}{(sr.delta * 100).toFixed(1)}pp)
                  </Text>
                ))}
              </View>
            )}
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>
              Targets: {g5?.details?.keyMappings?.map((k: any) => k.proposedKey).join(', ') ?? '—'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setModal({ kind: 'apply', proposal: p })}
                style={{ flex: 1, backgroundColor: colors.success, paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Approve & Apply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModal({ kind: 'dismiss', proposal: p })}
                style={{ flex: 1, backgroundColor: colors.surface2, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </Card>
        );
      })}

      {/* ── Section 2: Recently Applied ── */}
      <SectionTitle>RECENTLY APPLIED ({applied.length})</SectionTitle>
      {applied.length === 0 && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>No proposals applied yet.</Text>
        </Card>
      )}
      {applied.map(a => {
        const pm = a.payload_meta ?? {};
        return (
          <Card key={a.id} style={{ padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                {fmtDate(a.created_at)} · by {pm.approved_by ?? '—'}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.text, marginBottom: 4 }}>
              Keys updated: {pm.config_keys_updated?.join(', ') ?? '—'}
            </Text>
            <View style={{ marginTop: 4 }}>
              {pm.config_keys_updated?.map((key: string) => (
                <Text key={key} style={{ fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono }}>
                  {'  '}{key}: {JSON.stringify(pm.prior_values?.[key])} → {JSON.stringify(pm.new_values?.[key])}
                </Text>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setModal({ kind: 'revert', applied: a })}
              style={{ marginTop: 12, alignSelf: 'flex-start', backgroundColor: colors.error + '22', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.error + '66' }}>
              <Text style={{ color: colors.error, fontWeight: '700', fontSize: 12 }}>Revert</Text>
            </TouchableOpacity>
          </Card>
        );
      })}

      {/* ── Section 3: Blocked ── */}
      <SectionTitle>BLOCKED ({blocked.length})</SectionTitle>
      {blocked.length === 0 && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>No blocked proposals.</Text>
        </Card>
      )}
      {blocked.map(b => {
        const pm = b.payload_meta ?? {};
        return (
          <Card key={b.id} style={{ padding: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginBottom: 4 }}>
              {fmtDate(b.created_at)} · blocked by {pm.gate_that_blocked ?? '—'}
            </Text>
            <Text style={{ fontSize: 10, color: colors.textTertiary }}>
              {pm.reason ?? '(no reason)'}
            </Text>
          </Card>
        );
      })}

      {/* ── Section 4: System Status ── */}
      <SectionTitle>SYSTEM STATUS</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 30 }}>
        <View style={{ marginBottom: 6 }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>Last scheduled run</Text>
          <Text style={{ fontSize: 12, color: colors.text, fontFamily: theme.typography.fontFamily.mono }}>
            {lastRun ? fmtDate(lastRun) : 'never (manual run only)'}
          </Text>
        </View>
        <View style={{ marginBottom: 6 }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>adaptive_tracking sample size (30d, balanced)</Text>
          <Text style={{ fontSize: 12, color: atSampleSize >= 500 ? colors.success : colors.error, fontFamily: theme.typography.fontFamily.mono }}>
            n={atSampleSize} {atSampleSize >= 500 ? '✓ above G1 threshold (500)' : `✗ below G1 threshold (500) — gates will block until +${500 - atSampleSize}`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: colors.surface2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
          <Text style={{ color: colors.text, fontSize: 11 }}>Refresh</Text>
        </TouchableOpacity>
      </Card>

      {/* ── Modals ── */}
      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 460, backgroundColor: colors.bg, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            {modal?.kind === 'apply' && (() => {
              const pm = modal.proposal.payload_meta ?? {};
              const revertOps = pm.revert_ops ?? [];
              const g3Skipped = pm.g3_status === 'skipped_edge';
              return (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 }}>Approve & Apply Proposal</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 10 }}>
                    Apply these changes to app_config. Slate regeneration is NOT triggered — press Regenerate manually when ready.
                  </Text>
                  {g3Skipped && (
                    <View style={{ backgroundColor: colors.gold + '14', borderWidth: 1, borderColor: colors.gold + '66', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                      <Text style={{ fontSize: 11, color: colors.gold, fontWeight: '700', marginBottom: 4 }}>⚠️ G3 backtest gate not validated</Text>
                      <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 14 }}>
                        This proposal came from the scheduled edge function which skips the historical-backtest gate. For high-stakes approvals run{' '}
                        <Text style={{ fontFamily: theme.typography.fontFamily.mono, color: colors.text }}>npm run autotune:propose -- --manual</Text>
                        {' '}first to get a fully-validated proposal (3-4 min, runs all 5 gates locally).
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 }}>Will update:</Text>
                  {(pm.apply_ops ?? []).map((op: any) => (
                    <Text key={op.key} style={{ fontSize: 10, color: colors.text, fontFamily: theme.typography.fontFamily.mono, marginBottom: 2 }}>
                      {'  '}{op.key}: {JSON.stringify(op.value)}
                    </Text>
                  ))}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 10, marginBottom: 4 }}>Revert path (one-click in Recently Applied):</Text>
                  {revertOps.map((op: any) => (
                    <Text key={op.key} style={{ fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, marginBottom: 2 }}>
                      {'  '}{op.key}: {JSON.stringify(op.value)}
                    </Text>
                  ))}
                  <TouchableOpacity
                    onPress={() => setAcknowledgeRevert(!acknowledgeRevert)}
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 14, gap: 8 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: acknowledgeRevert ? colors.success : colors.border, backgroundColor: acknowledgeRevert ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {acknowledgeRevert && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                    </View>
                    <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>I understand I can revert this via the Recently Applied section.</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={closeModal} disabled={busy} style={{ flex: 1, backgroundColor: colors.surface2, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border, opacity: busy ? 0.5 : 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleApply} disabled={!acknowledgeRevert || busy} style={{ flex: 1, backgroundColor: acknowledgeRevert ? colors.success : colors.surface2, paddingVertical: 10, borderRadius: 8, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: acknowledgeRevert ? '#fff' : colors.textTertiary, fontWeight: '700' }}>Apply</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
            {modal?.kind === 'dismiss' && (
              <>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 }}>Dismiss Proposal</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 14 }}>
                  Dismissed proposals will not be re-generated until next Sunday. Optional reason will be logged.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity onPress={closeModal} disabled={busy} style={{ flex: 1, backgroundColor: colors.surface2, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border, opacity: busy ? 0.5 : 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDismiss} disabled={busy} style={{ flex: 1, backgroundColor: colors.error, paddingVertical: 10, borderRadius: 8, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Dismiss</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
            {modal?.kind === 'revert' && (() => {
              const pm = modal.applied.payload_meta ?? {};
              const revertOps = pm.revert_ops ?? [];
              return (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 }}>Revert Applied Proposal</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 10 }}>
                    Restore the prior values. Press Regenerate manually after revert to use restored weights.
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 }}>Will restore:</Text>
                  {revertOps.map((op: any) => (
                    <Text key={op.key} style={{ fontSize: 10, color: colors.text, fontFamily: theme.typography.fontFamily.mono, marginBottom: 2 }}>
                      {'  '}{op.key}: {JSON.stringify(op.value)}
                    </Text>
                  ))}
                  <TouchableOpacity
                    onPress={() => setAcknowledgeRevert(!acknowledgeRevert)}
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 14, gap: 8 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: acknowledgeRevert ? colors.error : colors.border, backgroundColor: acknowledgeRevert ? colors.error : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {acknowledgeRevert && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                    </View>
                    <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>I want to restore the prior weights.</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={closeModal} disabled={busy} style={{ flex: 1, backgroundColor: colors.surface2, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border, opacity: busy ? 0.5 : 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRevert} disabled={!acknowledgeRevert || busy} style={{ flex: 1, backgroundColor: acknowledgeRevert ? colors.error : colors.surface2, paddingVertical: 10, borderRadius: 8, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: acknowledgeRevert ? '#fff' : colors.textTertiary, fontWeight: '700' }}>Revert</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
