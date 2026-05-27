/**
 * ProposalRegenBanner — Appears above the regenerate UI to surface
 * pending proposals or recent applies so the operator knows what
 * weights they're about to use BEFORE pressing regenerate.
 *
 * Three states:
 *   1. Pending proposal exists  → ⚠️ yellow banner with "Review" link
 *   2. Proposal applied recently → ✓ green banner with diff link
 *   3. Otherwise               → renders nothing
 *
 * Does NOT change regenerate behavior. Pure visibility surface.
 * Tied to ProposalReviewView via setView('proposals') callback.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { theme } from '@/constants/theme';

interface AuditLogRow {
  id: string;
  action: string;
  target: string | null;
  payload_meta: any;
  created_at: string;
}

const RECENT_APPLY_WINDOW_HOURS = 24;

export function ProposalRegenBanner({ onOpenProposals }: { onOpenProposals?: () => void }) {
  const { colors } = useTheme();

  const { data: rows = [] } = useQuery<AuditLogRow[]>({
    queryKey: ['proposal_regen_banner'],
    queryFn: async () => {
      const r = await fetchFromSupabase<AuditLogRow[]>({
        path: `/rest/v1/audit_logs?action=in.(weight_proposal_generated,weight_proposal_applied,weight_proposal_dismissed,weight_proposal_reverted)&order=created_at.desc&limit=50`,
      });
      return Array.isArray(r) ? r : [];
    },
    staleTime: 60000,
  });

  const { pendingProposal, recentApply } = useMemo(() => {
    const dismissedIds = new Set<string>();
    const appliedIds = new Set<string>();
    const revertedAppliedIds = new Set<string>();
    for (const r of rows) {
      if (r.action === 'weight_proposal_dismissed' && r.target) dismissedIds.add(r.target);
      if (r.action === 'weight_proposal_applied' && r.payload_meta?.proposal_id) appliedIds.add(r.payload_meta.proposal_id);
      if (r.action === 'weight_proposal_reverted' && r.payload_meta?.applied_audit_log_id) revertedAppliedIds.add(r.payload_meta.applied_audit_log_id);
    }
    const pendingProposal = rows.find(r =>
      r.action === 'weight_proposal_generated' &&
      !dismissedIds.has(r.id) &&
      !appliedIds.has(r.id) &&
      r.payload_meta?.expires_at &&
      new Date(r.payload_meta.expires_at) > new Date()
    ) ?? null;
    const cutoff = Date.now() - RECENT_APPLY_WINDOW_HOURS * 60 * 60 * 1000;
    const recentApply = rows.find(r =>
      r.action === 'weight_proposal_applied' &&
      !revertedAppliedIds.has(r.id) &&
      new Date(r.created_at).getTime() >= cutoff
    ) ?? null;
    return { pendingProposal, recentApply };
  }, [rows]);

  // State 1: pending proposal wins if both conditions apply
  if (pendingProposal) {
    const expiresAt = pendingProposal.payload_meta?.expires_at;
    return (
      <View style={{ backgroundColor: colors.gold + '14', borderWidth: 1, borderColor: colors.gold + '55', borderRadius: 10, padding: 12, marginHorizontal: theme.layout.screenInset, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 16 }}>⚠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: colors.text, fontWeight: '700', marginBottom: 2 }}>
            Weight proposal pending review
          </Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary }}>
            Generated {new Date(pendingProposal.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}
            {expiresAt ? ` · expires ${new Date(expiresAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}` : ''}
            {'. If you regenerate now, current weights will be used.'}
          </Text>
        </View>
        {onOpenProposals && (
          <TouchableOpacity onPress={onOpenProposals} style={{ backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
            <Text style={{ color: '#0a0613', fontSize: 11, fontWeight: '700' }}>Review</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // State 2: recent apply since regenerate
  if (recentApply) {
    const ago = Math.round((Date.now() - new Date(recentApply.created_at).getTime()) / (60 * 60 * 1000));
    return (
      <View style={{ backgroundColor: colors.success + '14', borderWidth: 1, borderColor: colors.success + '55', borderRadius: 10, padding: 12, marginHorizontal: theme.layout.screenInset, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 16 }}>✓</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: colors.text, fontWeight: '700', marginBottom: 2 }}>
            Weight proposal applied {ago === 0 ? 'just now' : `${ago}h ago`}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary }}>
            Pressing regenerate now will use the new weights.
          </Text>
        </View>
        {onOpenProposals && (
          <TouchableOpacity onPress={onOpenProposals} style={{ backgroundColor: colors.success, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>View diff</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // State 3: nothing relevant — render nothing
  return null;
}
