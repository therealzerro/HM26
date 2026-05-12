import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';
import { Pill, SectionTitle, Card, st } from './AdminShared';

// ─── Health Tests View ────────────────────────────────────────────────────────
export default function HealthTestsView() {
  type TS = { s: 'idle' | 'running' | 'success' | 'error'; msg: string; ms?: number | null; detail?: string | null };
  const idle = (hint: string): TS => ({ s: 'idle', msg: hint, ms: null, detail: null });

  const [tests, setTests] = useState<Record<string, TS>>({
    conn:     idle('Ping /rest/v1/app_config'),
    snap:     idle('Query v_latest_slate_snapshots'),
    imports:  idle('Query v_import_health'),
    datasets: idle('Check datasets_box for rows'),
  });
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const setT = useCallback((k: string, v: TS) => setTests(t => ({ ...t, [k]: v })), []);

  const runConn = useCallback(async () => {
    setT('conn', { s: 'running', msg: 'Pinging endpoint…', ms: null });
    const t0 = Date.now();
    try {
      await fetchFromSupabase({ path: '/rest/v1/app_config?limit=1' });
      const ms = Date.now() - t0;
      setT('conn', { s: 'success', msg: `Connected · Supabase healthy`, ms });
    } catch (e) {
      setT('conn', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runSnap = useCallback(async () => {
    setT('snap', { s: 'running', msg: 'Fetching snapshots…', ms: null });
    const t0 = Date.now();
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/v_latest_slate_snapshots?select=*' });
      const ms = Date.now() - t0;
      if (Array.isArray(rows) && rows.length > 0) {
        const scopes = [...new Set(rows.map((r: any) => r.scope))].join(', ');
        const hash = String(rows[0]?.snapshot_hash ?? rows[0]?.hash ?? '').slice(0, 8);
        setT('snap', { s: 'success', msg: `${rows.length} snapshot(s) · scopes: ${scopes}`, ms, detail: hash || null });
      } else {
        setT('snap', { s: 'error', msg: 'No snapshots found — regenerate slate first', ms });
      }
    } catch (e) {
      setT('snap', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runImports = useCallback(async () => {
    setT('imports', { s: 'running', msg: 'Checking import health…', ms: null });
    const t0 = Date.now();
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/v_import_health?select=*' });
      const ms = Date.now() - t0;
      if (Array.isArray(rows) && rows.length > 0) {
        const r = rows[0] as any;
        const total = r.total_imports ?? rows.length;
        const completed = r.completed ?? rows.filter((x: any) => x.status === 'completed').length;
        const failed = r.failed ?? rows.filter((x: any) => x.status === 'failed').length;
        const lastAt = r.last_import_at ? new Date(r.last_import_at).toLocaleDateString() : null;
        setT('imports', {
          s: completed > 0 ? 'success' : 'error',
          msg: `${total} total · ${completed} completed · ${failed} failed${lastAt ? ' · last: ' + lastAt : ''}`,
          ms,
        });
      } else {
        // Fallback: query imports table directly
        const fallback = await fetchFromSupabase<any[]>({ path: '/rest/v1/imports?select=id,status&limit=50' });
        const ms2 = Date.now() - t0;
        const comp = Array.isArray(fallback) ? fallback.filter((x: any) => x.status === 'completed').length : 0;
        setT('imports', {
          s: comp > 0 ? 'success' : 'error',
          msg: comp > 0 ? `${fallback?.length ?? 0} imports · ${comp} completed` : 'No completed imports yet',
          ms: ms2,
        });
      }
    } catch (e) {
      setT('imports', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runDatasets = useCallback(async () => {
    setT('datasets', { s: 'running', msg: 'Checking box dataset…', ms: null });
    const t0 = Date.now();
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/datasets_box?select=id&limit=1' });
      const ms = Date.now() - t0;
      if (Array.isArray(rows) && rows.length > 0) {
        setT('datasets', { s: 'success', msg: 'Box dataset present — data confirmed', ms });
      } else {
        setT('datasets', { s: 'error', msg: 'No box data imported yet', ms });
      }
    } catch (e) {
      setT('datasets', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runAll = useCallback(async () => {
    setRunning(true);
    await Promise.all([runConn(), runSnap(), runImports(), runDatasets()]);
    setLastRun(new Date());
    setRunning(false);
  }, [runConn, runSnap, runImports, runDatasets]);

  const SUITE: { k: string; l: string; h: string; fn: () => Promise<void> }[] = [
    { k: 'conn',     l: 'Connection Test',  h: 'GET /rest/v1/app_config?limit=1',              fn: runConn },
    { k: 'snap',     l: 'Snapshot Read',    h: 'GET /rest/v1/v_latest_slate_snapshots',         fn: runSnap },
    { k: 'imports',  l: 'Import Health',    h: 'GET /rest/v1/v_import_health',                  fn: runImports },
    { k: 'datasets', l: 'Datasets Check',   h: 'GET /rest/v1/datasets_box?select=id&limit=1',  fn: runDatasets },
  ];

  const dotColor = (s: string) =>
    s === 'success' ? theme.colors.success
    : s === 'error' ? theme.colors.error
    : s === 'running' ? theme.colors.gold
    : theme.colors.textTertiary;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: lastRun ? 4 : 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>Backend Health</Text>
        <TouchableOpacity style={[st.btnPrimary, { paddingHorizontal: 16, opacity: running ? 0.6 : 1 }]} onPress={runAll} disabled={running}>
          <Text style={st.btnPrimaryText}>{running ? '⏳ Running…' : '▶ Run All'}</Text>
        </TouchableOpacity>
      </View>
      {lastRun && (
        <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 14 }}>
          Last run: {lastRun.toLocaleTimeString()}
        </Text>
      )}

      {SUITE.map(t => {
        const state = tests[t.k];
        const bg = state.s === 'success' ? theme.colors.successLight
          : state.s === 'error' ? theme.colors.errorLight
          : state.s === 'running' ? theme.colors.goldLight
          : theme.colors.surfaceLight;
        const bc = state.s === 'success' ? theme.colors.success + '33'
          : state.s === 'error' ? theme.colors.error + '33'
          : state.s === 'running' ? theme.colors.gold + '33'
          : theme.colors.border;
        return (
          <Card key={t.k} style={{ padding: 12, marginBottom: 8, backgroundColor: bg, borderColor: bc }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {state.s === 'running'
                ? <ActivityIndicator size="small" color={theme.colors.gold} style={{ width: 8, height: 8 }} />
                : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor(state.s) }} />
              }
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>{t.l}</Text>
                <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>{state.s === 'idle' ? t.h : state.msg}</Text>
              </View>
              {state.ms != null && state.s !== 'running' && (
                <Text style={{ fontSize: 10, color: state.s === 'success' ? theme.colors.success : theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono }}>
                  {state.ms}ms
                </Text>
              )}
              {state.detail && (
                <Text style={{ fontSize: 10, color: theme.colors.primary, fontFamily: theme.typography.fontFamily.mono }}>…{state.detail}</Text>
              )}
              <TouchableOpacity
                style={[st.btnGhost, { paddingHorizontal: 10, paddingVertical: 5, opacity: state.s === 'running' ? 0.4 : 1 }]}
                onPress={t.fn}
                disabled={state.s === 'running'}
              >
                <Text style={st.btnGhostText}>Run</Text>
              </TouchableOpacity>
            </View>
          </Card>
        );
      })}
      <Card style={{ padding: 12, marginTop: 8 }}>
        <Text style={{ fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, lineHeight: 16 }}>
          Connected · ZK6 Engine v2
        </Text>
      </Card>
    </ScrollView>
  );
}
