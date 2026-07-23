/**
 * subscriberAdminClient — Client for the subscriber-admin Edge Function.
 *
 * The operator enters their ADMIN_OPS_KEY once via the AdminKeyGate UI; we
 * persist it in AsyncStorage so it survives reloads but never ships in the
 * JS bundle. Every call attaches X-Admin-Key from storage; if the key is
 * missing or wrong the Edge Function returns 401 and we propagate that so
 * the UI can prompt for a fresh key.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};
const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const ADMIN_KEY_STORAGE = '@hm26/admin_ops_key';

export class AdminKeyMissingError extends Error {
  constructor() { super('Admin key not set'); this.name = 'AdminKeyMissingError'; }
}

export class AdminKeyInvalidError extends Error {
  constructor() { super('Admin key rejected (401)'); this.name = 'AdminKeyInvalidError'; }
}

export async function getStoredAdminKey(): Promise<string | null> {
  return AsyncStorage.getItem(ADMIN_KEY_STORAGE);
}

export async function setStoredAdminKey(key: string): Promise<void> {
  await AsyncStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
}

export async function clearStoredAdminKey(): Promise<void> {
  await AsyncStorage.removeItem(ADMIN_KEY_STORAGE);
}

/**
 * SEC-05 quick unlock: exchange the 4-digit ADMIN_UNLOCK_PIN for the ops key
 * via the admin-ops edge fn (server-side rate-limited) and store it locally —
 * so the operator never types the long secret on a new device.
 */
export async function unlockAdminOpsWithPin(pin: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase configuration missing');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-ops`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'unlock', pin }),
  });
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok || !body?.adminKey) throw new Error(body?.error ?? `unlock failed (${r.status})`);
  await setStoredAdminKey(String(body.adminKey));
}

async function callSubscriberAdmin<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration missing');
  }
  const adminKey = await getStoredAdminKey();
  if (!adminKey) throw new AdminKeyMissingError();

  const url = `${SUPABASE_URL}/functions/v1/subscriber-admin`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'X-Admin-Key': adminKey,
    },
    body: JSON.stringify({ action, payload }),
  });

  if (res.status === 401) throw new AdminKeyInvalidError();

  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { error: text }; }

  if (!res.ok || body?.error) {
    throw new Error(body?.error || `subscriber-admin error ${res.status}`);
  }
  return body.result as T;
}

// ─── Typed wrappers ──────────────────────────────────────────────────────────

export interface ProSubscriber {
  id: string;
  email: string;
  facebook_name: string | null;
  date_subscribed: string;
  status: 'active' | 'churned' | 'comped' | 'paused' | 'unknown';
  date_churned: string | null;
  acquisition_source: string | null;
  acquisition_notes: string | null;
  monthly_price_usd: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FunnelSnapshot {
  id: string;
  snapshot_date: string;
  page_followers: number;
  free_group_members: number;
  active_pro_subscribers: number;
  conversion_rate: string;
  gross_mrr: string;
  net_mrr: string;
  reel_views_today: number | null;
  content_interactions_today: number | null;
  notes: string | null;
}

export interface ImportRecord {
  id: string;
  import_type: 'subscriber_emails' | 'group_insights' | 'manual' | 'snapshot';
  source_filename: string | null;
  import_date: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  warnings: unknown;
  errors: unknown;
  imported_at: string;
}

export interface ContributorWithEngagement {
  id: string;
  facebook_name: string;
  group_type: 'free' | 'pro';
  latest_posts_28d: number;
  latest_comments_28d: number;
  latest_likes_28d: number;
  latest_window_end: string | null;
  first_seen_at: string;
  last_seen_at: string;
  pro_subscriber_id: string | null;
  fb_engagement_snapshots: Array<{
    snapshot_date: string;
    posts: number;
    comments: number;
    likes: number;
    engagement_score: number;
  }>;
}

export interface SubscriberListFilters {
  status?: string;
  acquisition_source?: string;
  facebook_name_null?: boolean;
  date_subscribed_gte?: string;
  date_subscribed_lte?: string;
}

export const subscriberAdmin = {
  ping: () => callSubscriberAdmin<{ ok: boolean; ts: string }>('ping'),

  listSubscribers: (filters: SubscriberListFilters = {}) =>
    callSubscriberAdmin<ProSubscriber[]>('list_subscribers', filters as Record<string, unknown>),

  upsertSubscribers: (rows: Array<{ email: string; date_subscribed: string; status?: string; facebook_name?: string | null; acquisition_source?: string | null }>) =>
    callSubscriberAdmin<{ created: number; updated: number; skipped: number }>('upsert_subscribers', { rows }),

  findPotentialChurns: (emails: string[]) =>
    callSubscriberAdmin<Array<{ id: string; email: string; date_subscribed: string }>>('find_potential_churns', { emails }),

  updateSubscriber: (patch: { id: string; facebook_name?: string | null; status?: string; date_churned?: string | null; acquisition_source?: string | null; acquisition_notes?: string | null; notes?: string | null }) =>
    callSubscriberAdmin('update_subscriber', patch),

  listImports: () =>
    callSubscriberAdmin<ImportRecord[]>('list_imports'),

  recordImport: (p: { import_type: string; source_filename?: string; records_processed: number; records_created: number; records_updated: number; records_skipped: number; warnings?: unknown; errors?: unknown }) =>
    callSubscriberAdmin('record_import', p),

  listSnapshots: (limit = 60) =>
    callSubscriberAdmin<FunnelSnapshot[]>('list_snapshots', { limit }),

  upsertSnapshot: (p: { snapshot_date: string; page_followers: number; free_group_members: number; reel_views_today?: number | null; content_interactions_today?: number | null; notes?: string | null }) =>
    callSubscriberAdmin<FunnelSnapshot[]>('upsert_snapshot', p),

  listContributors: (group_type?: 'free' | 'pro') =>
    callSubscriberAdmin<ContributorWithEngagement[]>('list_contributors', group_type ? { group_type } : {}),

  upsertContributors: (p: { rows: Array<{ facebook_name: string; group_type: 'free' | 'pro'; posts: number; comments: number; likes: number }>; snapshot_date: string; source_filename?: string }) =>
    callSubscriberAdmin<{ created: number; updated: number; snapshots_added: number }>('upsert_contributors', p),

  linkContributor: (p: { contributor_id: string; pro_subscriber_id: string; facebook_name: string }) =>
    callSubscriberAdmin('link_contributor', p),
};

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 3) return `${local[0] ?? '*'}***@${domain}`;
  return `${local.slice(0, 3)}****@${domain}`;
}
