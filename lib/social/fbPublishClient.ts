/**
 * fbPublishClient — client for the fb-publish Edge Function (SOCIAL-01).
 *
 * Same auth pattern as subscriberAdminClient: X-Admin-Key from AsyncStorage
 * (entered once via the AdminKeyGate UI), anon JWT for the function gateway.
 * The Facebook Page token never touches the client.
 */

import Constants from 'expo-constants';
import {
  getStoredAdminKey,
  AdminKeyMissingError,
  AdminKeyInvalidError,
} from '@/lib/subscriberAdminClient';

const extra = Constants.expoConfig?.extra || {};
const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export interface FbPublishError extends Error {
  code?: string;
  violations?: string[];
  detail?: unknown;
}

async function callFbPublish<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase configuration missing');
  const adminKey = await getStoredAdminKey();
  if (!adminKey) throw new AdminKeyMissingError();

  const r = await fetch(`${SUPABASE_URL}/functions/v1/fb-publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      apikey: SUPABASE_ANON_KEY,
      'X-Admin-Key': adminKey,
    },
    body: JSON.stringify({ action, payload }),
  });
  if (r.status === 401) throw new AdminKeyInvalidError();
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err: FbPublishError = new Error(body?.error ?? `fb-publish ${action} failed (${r.status})`);
    err.code = body?.error;
    err.violations = body?.violations;
    err.detail = body?.detail ?? body?.hint;
    throw err;
  }
  return body as T;
}

export interface PageStatus {
  configured: boolean;
  tokenValid?: boolean;
  page?: { id: string; name: string; followers_count?: number };
  error?: string;
  hint?: string;
}

export const fbPublish = {
  ping: () => callFbPublish<{ ok: boolean; configured: boolean }>('ping'),
  status: () => callFbPublish<PageStatus>('status'),
  publishPageText: (p: { message: string; kind: string; scheduledFor?: string; override?: boolean }) =>
    callFbPublish<{ ok: boolean; postId: string; scheduled: boolean }>('publish_page_text', p),
  publishPagePhoto: (p: {
    caption: string; kind: string; imageDataUrl: string;
    twoQAck: { q1: boolean; q2: boolean };
    imageMeta?: Record<string, unknown>; scheduledFor?: string; override?: boolean;
  }) => callFbPublish<{ ok: boolean; postId: string; scheduled: boolean }>('publish_page_photo', p),
  logAssist: (p: { caption: string; tier: number; kind: string; targetName: string; imageMeta?: Record<string, unknown> | null }) =>
    callFbPublish<{ ok: boolean; duplicateToday: boolean; duplicates: { id: string; target_name: string }[] }>('log_assist', p),
  listPosts: (limit = 20) => callFbPublish<{ posts: any[] }>('list_posts', { limit }),
};
