import Constants from 'expo-constants';

interface SupabaseFetchParams {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
}

const extra = Constants.expoConfig?.extra || {};
const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const DEFAULT_TIMEOUT_MS = 30000;

async function _fetchOnce<T>(url: string, method: string, finalHeaders: Record<string, string>, body: any, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: method === 'DELETE' ? undefined : (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
    const text = await res.text();
    if (method === 'DELETE') {
      if (!res.ok && res.status !== 404) throw new Error(text || 'Delete failed: ' + res.status);
      return (text || '[]') as unknown as T;
    }
    if (!res.ok) {
      console.log('[supabase] error', res.status, text.slice(0, 200));
      throw new Error(text || `Supabase error ${res.status}`);
    }
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`Request timed out (${timeoutMs / 1000}s): ${url.slice(url.lastIndexOf('/rest/v1'))}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFromSupabase<T>({ path, method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS }: SupabaseFetchParams): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration missing in app.config.ts extra');
  }

  const url = `${SUPABASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const finalHeaders: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...(method === 'PATCH' ? { 'Prefer': 'return=minimal' } : {}),
    ...headers,
  };

  const maxAttempts = method === 'GET' ? 2 : 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500));
    try {
      return await _fetchOnce<T>(url, method, finalHeaders, body, timeoutMs);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
