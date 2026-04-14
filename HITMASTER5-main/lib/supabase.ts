import { Platform } from 'react-native';

interface SupabaseFetchParams {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}

const DATA_MODE = 'live' as const;

export async function fetchFromSupabase<T>({ path, method = 'GET', headers = {}, body }: SupabaseFetchParams): Promise<T> {
  // Force read from environment with fallbacks
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tgagarhwqbdcwoqhpapi.supabase.co';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYWdhcmh3cWJkY3dvcWhwYXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NjM4NDYsImV4cCI6MjA3MzQzOTg0Nn0.n78k9_hxxk8EjYpvzPaHxeiEMueZy_ZSkE4zsq2gmXM';
  const backendFlag = process.env.EXPO_PUBLIC_BACKEND || 'enabled';

  console.log('[supabase] Environment check:', {
    hasBaseUrl: !!baseUrl,
    baseUrlLength: baseUrl.length,
    hasAnonKey: !!anonKey,
    anonKeyLength: anonKey.length,
    backendFlag,
    dataMode: DATA_MODE,
    allEnvVars: Object.keys(process.env).filter(k => k.startsWith('EXPO_PUBLIC'))
  });

  if (DATA_MODE === 'live') {
    if (!baseUrl || !anonKey) {
      const msg = `[supabase] Live mode requires URL/KEY. Missing for ${path}. Current: baseUrl=${!!baseUrl}(${baseUrl.length}), anonKey=${!!anonKey}(${anonKey.length}), backend=${backendFlag}`;
      console.error(msg);
      console.error('[supabase] Full env debug:', {
        EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'using fallback',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? '[REDACTED]' : 'using fallback',
        EXPO_PUBLIC_BACKEND: process.env.EXPO_PUBLIC_BACKEND || 'using fallback'
      });
      throw new Error('Backend not configured');
    }
  }

  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const finalHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    ...headers,
  };

  const init: RequestInit = {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  };

  try {
    console.log('[supabase] fetch', { url, method, platform: Platform.OS });
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      console.log('[supabase] error', res.status, text);
      throw new Error(text || `Supabase error ${res.status}`);
    }
    try {
      const json = JSON.parse(text) as T;
      console.log('[supabase] success', { url, method, responseType: Array.isArray(json) ? `array[${json.length}]` : typeof json });
      return json;
    } catch {
      console.log('[supabase] non-json response', { url, method, textLength: text.length });
      return text as unknown as T;
    }
  } catch (err) {
    console.log('[supabase] fetch exception', { url, method, error: err });
    throw err;
  }
}
