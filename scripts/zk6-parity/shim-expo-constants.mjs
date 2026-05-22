/**
 * Node-side shim for expo-constants. Loaded by loader.mjs only inside the
 * zk6-parity harness process — does not affect any other code path.
 *
 * Exposes the same shape lib/supabase.ts expects:
 *   Constants.expoConfig.extra.{supabaseUrl, supabaseAnonKey}
 *
 * Sourced from .env (EXPO_PUBLIC_*) via the harness's dotenv load. The anon
 * key is used here because engines/zk6.ts performs writes under anon-key
 * RLS — same as the RN client in production.
 */

const Constants = {
  expoConfig: {
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};

export default Constants;
