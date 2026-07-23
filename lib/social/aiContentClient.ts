/**
 * aiContentClient — client for the ai-content Edge Function (SOCIAL-04).
 * Same X-Admin-Key auth pattern as fbPublishClient.
 */

import Constants from 'expo-constants';
import { getStoredAdminKey, AdminKeyMissingError, AdminKeyInvalidError } from '@/lib/subscriberAdminClient';

const extra = Constants.expoConfig?.extra || {};
const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function call<T = any>(action: string, payload: Record<string, unknown> = {}, timeoutMs = 90000): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase configuration missing');
  const adminKey = await getStoredAdminKey();
  if (!adminKey) throw new AdminKeyMissingError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        apikey: SUPABASE_ANON_KEY,
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });
    if (r.status === 401) throw new AdminKeyInvalidError();
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err: Error & { code?: string; detail?: unknown } = new Error(body?.message ?? body?.error ?? `ai-content ${action} failed (${r.status})`);
      err.code = body?.error;
      err.detail = body?.detail ?? body?.violations;
      throw err;
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export const aiContent = {
  ping: () => call<{ ok: boolean; claude: boolean; gemini: boolean; imageModel: string }>('ping', {}, 15000),
  generateCaption: (p: { surface: string; content: string; context?: string; priorCaptions?: string[] }) =>
    call<{ ok: boolean; caption: string; rationale: string }>('generate_caption', p),
  generateBrandImage: (p: { theme: string; surface: string; headline?: string; aspectRatio?: string; size?: string }) =>
    // 180s — Claude compose + Gemini render occasionally exceeds 120s under
    // load; the server kept succeeding (and billing) after client aborts.
    call<{ ok: boolean; imageDataUrl: string; mime: string; geminiPrompt: string; textStrings: string[] }>('generate_brand_image', p, 180000),
};
