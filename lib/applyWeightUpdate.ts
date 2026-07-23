/**
 * Weight Proposal Apply System
 *
 * Replaces the orphan `applyDataDrivenWeights()` (renamed earlier via
 * audit-follow-up Order 1, then redesigned by the Weight Proposal System
 * work order, 2026-05-18). Pre-validated proposals are generated weekly
 * by `scripts/intel-tuning/generate-proposal.ts` and written to
 * `audit_logs` with `action='weight_proposal_generated'`. Operators
 * review proposals in the admin UI (ProposalReviewView) and click
 * Approve. This function executes the proposal's pre-validated SQL,
 * logs the apply event, and returns the revert SQL for one-click undo.
 *
 * Design principles:
 * - This function TRUSTS the proposal. It does NOT re-run gates or
 *   re-validate weights. The gates ran at proposal-generation time;
 *   re-running them here would be wasteful and could fail on data
 *   drift between proposal time and apply time.
 * - The proposal carries its own apply_sql + revert_sql in payload_meta.
 *   This function just executes them.
 * - Every apply writes a `weight_proposal_applied` audit_logs row with
 *   full before/after state. Every revert writes `weight_proposal_reverted`.
 */

import { adminOpsFetch } from './adminOps';

const SB_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tgagarhwqbdcwoqhpapi.supabase.co';
const SB_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const JSON_HEADERS = () => ({
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
});

interface ProposalPayload {
  proposed_weights: Record<string, any>;
  current_weights: Record<string, any>;
  all_gate_results: any;
  /** Array of {key, value} pairs to apply via app_config PATCHes. */
  apply_ops: { key: string; value: any }[];
  /** Array of {key, value} pairs that restore the prior state. */
  revert_ops: { key: string; value: any }[];
  expires_at: string;
}

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  payload_meta: any;
  created_at: string;
}

async function fetchProposal(proposalId: string): Promise<AuditLogRow | null> {
  const url = `${SB_URL}/rest/v1/audit_logs?id=eq.${encodeURIComponent(proposalId)}&action=eq.weight_proposal_generated&select=*&limit=1`;
  const res = await fetch(url, { headers: JSON_HEADERS() });
  if (!res.ok) throw new Error(`fetchProposal ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function hasBeenApplied(proposalId: string): Promise<boolean> {
  const url = `${SB_URL}/rest/v1/audit_logs?action=eq.weight_proposal_applied&payload_meta->>proposal_id=eq.${encodeURIComponent(proposalId)}&select=id&limit=1`;
  const res = await fetch(url, { headers: JSON_HEADERS() });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function patchConfig(key: string, value: any): Promise<void> {
  // SEC-05: config writes go through the admin-ops gateway, not the anon key.
  await adminOpsFetch({
    path: `/rest/v1/app_config?key=eq.${encodeURIComponent(key)}`,
    method: 'PATCH',
    body: {
      value: typeof value === 'string' ? value : JSON.stringify(value),
      updated_at: new Date().toISOString(),
    },
    prefer: 'return=minimal',
  });
}

async function writeAuditLog(action: string, target: string, payload_meta: any, actor_id: string): Promise<string> {
  const rows = await adminOpsFetch<any>({
    path: '/rest/v1/audit_logs',
    method: 'POST',
    body: { actor_id, action, target, payload_meta },
    prefer: 'return=representation',
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.id ?? '';
}

/**
 * Apply a pre-validated weight proposal.
 *
 * - Reads the proposal from audit_logs by ID
 * - Refuses if proposal has expired (>7 days old per generator) or already applied
 * - Refuses if acknowledgeRevert is false (operator must confirm they know the undo path)
 * - Executes apply_ops sequentially (best-effort; partial failure surfaces via thrown error
 *   and the proposal's revert_ops can be used to undo whatever was applied)
 * - Writes a `weight_proposal_applied` audit_logs row with before/after state
 * - Returns the revert SQL so the UI can offer one-click revert
 *
 * No regeneration is triggered. Operator presses regenerate manually
 * when ready to use the new weights.
 */
export async function applyApprovedProposal(options: {
  proposalId: string;
  approvedBy: string;
  acknowledgeRevert: boolean;
}): Promise<{
  applied: boolean;
  configKeysUpdated: string[];
  priorValues: Record<string, any>;
  newValues: Record<string, any>;
  revertSql: string;
  auditLogId: string;
}> {
  const { proposalId, approvedBy, acknowledgeRevert } = options;

  if (!acknowledgeRevert) {
    throw new Error(
      'applyApprovedProposal: acknowledgeRevert must be true. ' +
      'Operator must confirm they understand the revert path before applying.'
    );
  }
  if (!proposalId) throw new Error('applyApprovedProposal: proposalId is required');
  if (!approvedBy)  throw new Error('applyApprovedProposal: approvedBy is required');

  const proposal = await fetchProposal(proposalId);
  if (!proposal) {
    throw new Error(`applyApprovedProposal: proposal ${proposalId} not found or not a weight_proposal_generated row`);
  }

  const payload = (proposal.payload_meta ?? {}) as ProposalPayload;
  if (!Array.isArray(payload.apply_ops) || payload.apply_ops.length === 0) {
    throw new Error(`applyApprovedProposal: proposal ${proposalId} has no apply_ops`);
  }
  if (!Array.isArray(payload.revert_ops)) {
    throw new Error(`applyApprovedProposal: proposal ${proposalId} has no revert_ops`);
  }
  if (payload.expires_at && new Date(payload.expires_at) < new Date()) {
    throw new Error(`applyApprovedProposal: proposal ${proposalId} expired at ${payload.expires_at}`);
  }
  if (await hasBeenApplied(proposalId)) {
    throw new Error(`applyApprovedProposal: proposal ${proposalId} has already been applied`);
  }

  // Best-effort sequential apply. If a write fails partway, the audit log will
  // record what succeeded and the revert_ops can undo the partial state.
  const configKeysUpdated: string[] = [];
  const priorValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  for (const op of payload.apply_ops) {
    // Capture the prior value from the proposal's snapshot so the audit log
    // is faithful to what was actually there at proposal time. (The revert_ops
    // are the source of truth for what to restore.)
    const priorOp = payload.revert_ops.find(r => r.key === op.key);
    priorValues[op.key] = priorOp?.value ?? null;
    newValues[op.key] = op.value;
    try {
      await patchConfig(op.key, op.value);
      configKeysUpdated.push(op.key);
    } catch (e) {
      // Log the partial-apply state then re-throw so caller knows to revert.
      const failureLogId = await writeAuditLog(
        'weight_proposal_apply_failed',
        proposalId,
        {
          proposal_id: proposalId,
          approved_by: approvedBy,
          failed_at_key: op.key,
          keys_succeeded: configKeysUpdated,
          revert_ops: payload.revert_ops,
          error: String(e instanceof Error ? e.message : e),
        },
        approvedBy,
      ).catch(() => '');
      throw new Error(
        `applyApprovedProposal: failed at key=${op.key} after ${configKeysUpdated.length} successful writes. ` +
        `Audit log id=${failureLogId}. Use revert_ops from the proposal to undo. Underlying error: ${e}`
      );
    }
  }

  const revertSql = payload.revert_ops
    .map(r => `UPDATE app_config SET value=${typeof r.value === 'string' ? `'${r.value}'::jsonb` : `'${JSON.stringify(r.value)}'::jsonb`} WHERE key='${r.key}';`)
    .join('\n');

  const auditLogId = await writeAuditLog(
    'weight_proposal_applied',
    proposalId,
    {
      proposal_id: proposalId,
      approved_by: approvedBy,
      config_keys_updated: configKeysUpdated,
      prior_values: priorValues,
      new_values: newValues,
      revert_ops: payload.revert_ops,
      apply_ops: payload.apply_ops,
      gate_results_at_proposal_time: payload.all_gate_results,
    },
    approvedBy,
  );

  return {
    applied: true,
    configKeysUpdated,
    priorValues,
    newValues,
    revertSql,
    auditLogId,
  };
}

/**
 * Revert a previously-applied proposal.
 *
 * Looks up the apply audit row by ID, extracts the revert_ops, and
 * executes them sequentially. Writes a `weight_proposal_reverted`
 * audit row pointing to both the apply audit row and the original
 * proposal.
 */
export async function revertAppliedProposal(options: {
  appliedAuditLogId: string;
  revertedBy: string;
  reason?: string;
}): Promise<{ reverted: boolean; configKeysRestored: string[]; auditLogId: string }> {
  const { appliedAuditLogId, revertedBy, reason } = options;
  if (!appliedAuditLogId) throw new Error('revertAppliedProposal: appliedAuditLogId required');
  if (!revertedBy) throw new Error('revertAppliedProposal: revertedBy required');

  const url = `${SB_URL}/rest/v1/audit_logs?id=eq.${encodeURIComponent(appliedAuditLogId)}&action=eq.weight_proposal_applied&select=*&limit=1`;
  const res = await fetch(url, { headers: JSON_HEADERS() });
  if (!res.ok) throw new Error(`revertAppliedProposal lookup ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`revertAppliedProposal: applied audit log ${appliedAuditLogId} not found`);
  }
  const applyRow = rows[0];
  const payload = applyRow.payload_meta ?? {};
  const revertOps = Array.isArray(payload.revert_ops) ? payload.revert_ops : [];
  if (revertOps.length === 0) {
    throw new Error(`revertAppliedProposal: apply log ${appliedAuditLogId} has no revert_ops`);
  }

  const configKeysRestored: string[] = [];
  for (const op of revertOps) {
    try {
      await patchConfig(op.key, op.value);
      configKeysRestored.push(op.key);
    } catch (e) {
      const failId = await writeAuditLog(
        'weight_proposal_revert_failed',
        appliedAuditLogId,
        {
          applied_audit_log_id: appliedAuditLogId,
          reverted_by: revertedBy,
          failed_at_key: op.key,
          keys_succeeded: configKeysRestored,
          error: String(e instanceof Error ? e.message : e),
        },
        revertedBy,
      ).catch(() => '');
      throw new Error(`revertAppliedProposal: failed at key=${op.key}. Audit ${failId}. Underlying: ${e}`);
    }
  }

  const auditLogId = await writeAuditLog(
    'weight_proposal_reverted',
    payload.proposal_id ?? appliedAuditLogId,
    {
      applied_audit_log_id: appliedAuditLogId,
      proposal_id: payload.proposal_id,
      reverted_by: revertedBy,
      reason: reason ?? null,
      config_keys_restored: configKeysRestored,
      restored_values: revertOps.reduce((acc: any, op: any) => ({ ...acc, [op.key]: op.value }), {}),
    },
    revertedBy,
  );

  return { reverted: true, configKeysRestored, auditLogId };
}

/**
 * Dismiss a pending proposal without applying.
 *
 * Writes a `weight_proposal_dismissed` audit row so the proposal stops
 * appearing in the Pending list. Does not modify app_config.
 */
export async function dismissProposal(options: {
  proposalId: string;
  dismissedBy: string;
  reason?: string;
}): Promise<{ dismissed: boolean; auditLogId: string }> {
  const { proposalId, dismissedBy, reason } = options;
  if (!proposalId) throw new Error('dismissProposal: proposalId required');
  if (!dismissedBy) throw new Error('dismissProposal: dismissedBy required');

  const auditLogId = await writeAuditLog(
    'weight_proposal_dismissed',
    proposalId,
    {
      proposal_id: proposalId,
      dismissed_by: dismissedBy,
      reason: reason ?? null,
    },
    dismissedBy,
  );

  return { dismissed: true, auditLogId };
}
