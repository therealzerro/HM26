// app/zk30-import.tsx
//
// Admin TX import wizard for ZK30. Paste raw TX Pick 3 draws (the format the
// operator already saves to assets/tx_history.txt), one click imports +
// rebuilds datasets server-side via the import-tx-raw Edge Function.
//
// UX is deliberately leaner than app/import-wizard.tsx — the edge fn does
// parsing, idempotent insert, and aggregate-rebuild in one round-trip, so
// the screen is just: textarea → button → result panel.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Upload, CheckCircle2, AlertCircle, FileText, ExternalLink,
} from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { type ColorTokens } from '@/lib/theme';

type ImportResult = {
  success: boolean;
  parsed?: number;
  inserted?: number;
  skipped?: number;
  rejected?: Array<{ line_number: number; reason: string }>;
  rejected_count?: number;
  anchor?: string;
  boxRowsWritten?: number;
  pairRowsWritten?: number;
  aggregateSkipped?: boolean;
  durationMs?: number;
  error?: string;
};

const PLACEHOLDER =
  'Paste TX Pick 3 results here. Format (tab-separated, 4 fields):\n\n' +
  'Mon, May 25, 2026\tTexas\tPick 3 Day\t1-7-1, Fireball: 3\n' +
  'Mon, May 25, 2026\tTexas\tPick 3 Morning\t8-3-6, Fireball: 4\n' +
  'Sat, May 23, 2026\tTexas\tPick 3 Night\t6-0-1, Fireball: 4\n' +
  '...\n\n' +
  'Existing draws are skipped silently (idempotent). Sunday lines + bad ' +
  'formats are rejected with a reason.';

export default function ZK30ImportScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  // Operator-only screen — pin to the static dark palette so the global
  // cosmic-light background doesn't bleed through panels and text stays
  // readable regardless of which theme mode the app is in.
  const colors = theme.colors as unknown as ColorTokens;
  const brandBlue = colors.dataBlue;
  const s = useMemo(() => makeS(colors), [colors]);

  const [rawText, setRawText] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Quick client-side preview — count non-blank lines so the operator sees
  // expected work size before tapping the heavy button. Stricter validation
  // happens server-side in the edge fn (no need to mirror the parser here).
  const previewLineCount = useMemo(
    () => rawText.split(/\r\n|\n/).filter(l => l.trim().length > 0).length,
    [rawText],
  );

  const onImport = useCallback(async () => {
    if (busy || !rawText.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        setResult({ success: false, error: 'Supabase config missing in .env' });
        return;
      }
      const res = await fetch(`${url}/functions/v1/import-tx-raw`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rawText }),
      });
      const text = await res.text();
      let json: ImportResult;
      try { json = JSON.parse(text); } catch { json = { success: false, error: text.slice(0, 200) }; }
      setResult(json);

      // On any actual write, invalidate the screens that read histories_tx /
      // datasets — the /zk30 surface will refetch when the operator
      // navigates back.
      if (json.success && (json.inserted ?? 0) > 0) {
        queryClient.invalidateQueries({ queryKey: ['zk30-snapshot'] });
        queryClient.invalidateQueries({ queryKey: ['zk30-available-dates'] });
        queryClient.invalidateQueries({ queryKey: ['zk30-hits-history'] });
        queryClient.invalidateQueries({ queryKey: ['zk30-hits-7d'] });
        queryClient.invalidateQueries({ queryKey: ['zk30-hits-by-session'] });
        queryClient.invalidateQueries({ queryKey: ['zk30-hits-fb-split-30d'] });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ success: false, error: msg.slice(0, 200) });
    } finally {
      setBusy(false);
    }
  }, [busy, rawText, queryClient]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>ZK30  ·  TX IMPORT</Text>
          <Text style={s.subtitle}>Paste raw draws · auto-rebuilds datasets</Text>
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Textarea card */}
        <View style={[s.card, { borderColor: brandBlue + '33' }]}>
          <View style={s.cardHeader}>
            <FileText size={14} color={brandBlue} />
            <Text style={[s.cardLabel, { color: brandBlue }]}>RAW DRAWS</Text>
            <Text style={s.cardSubLabel}>
              {previewLineCount > 0 ? `${previewLineCount} non-blank line${previewLineCount !== 1 ? 's' : ''}` : 'empty'}
            </Text>
          </View>
          <TextInput
            value={rawText}
            onChangeText={setRawText}
            placeholder={PLACEHOLDER}
            placeholderTextColor={colors.textTertiary}
            multiline
            scrollEnabled
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            style={s.textarea}
          />
        </View>

        {/* Primary action */}
        <TouchableOpacity
          onPress={onImport}
          disabled={busy || !rawText.trim()}
          style={[
            s.primaryBtn,
            { backgroundColor: brandBlue, opacity: busy || !rawText.trim() ? 0.5 : 1 },
          ]}
          accessibilityLabel="Import + rebuild"
          accessibilityRole="button"
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Upload size={16} color="#fff" />}
          <Text style={s.primaryBtnText}>
            {busy ? 'Importing + rebuilding…' : 'Import + Rebuild Datasets'}
          </Text>
        </TouchableOpacity>

        {/* Result panel */}
        {result && <ResultPanel result={result} colors={colors} brand={brandBlue} s={s} />}

        {/* Open ZK30 */}
        {result?.success && (result.inserted ?? 0) > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/zk30')}
            style={[s.secondaryBtn, { borderColor: brandBlue }]}
            accessibilityLabel="Open ZK30 Slate"
            accessibilityRole="button"
          >
            <ExternalLink size={14} color={brandBlue} />
            <Text style={[s.secondaryBtnText, { color: brandBlue }]}>Open ZK30 Slate</Text>
          </TouchableOpacity>
        )}

        {/* Help footer */}
        <View style={[s.helpCard, { borderColor: colors.border }]}>
          <Text style={[s.helpLabel, { color: colors.textTertiary }]}>HOW IT WORKS</Text>
          <Text style={[s.helpBody, { color: colors.textSecondary }]}>
            • Idempotent by (date, session) — re-pasting the same draws skips
              existing rows silently.{'\n'}
            • Datasets (box + pair, H01Y + H02Y) auto-rebuild on the server
              after a successful insert. Slate generator + hit detection pick
              up the new data immediately.{'\n'}
            • Sunday lines reject (TX has no Sunday Pick 3). Malformed lines
              report a reason in the rejected list.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Result panel ─────────────────────────────────────────────────────────────

function ResultPanel({
  result, colors, brand, s,
}: {
  result: ImportResult; colors: ColorTokens; brand: string;
  s: ReturnType<typeof makeS>;
}) {
  if (!result.success) {
    return (
      <View style={[s.card, { borderColor: colors.error + '88', backgroundColor: colors.error + '12' }]}>
        <View style={s.cardHeader}>
          <AlertCircle size={14} color={colors.error} />
          <Text style={[s.cardLabel, { color: colors.error }]}>IMPORT FAILED</Text>
        </View>
        <Text style={[s.helpBody, { color: colors.error }]}>{result.error ?? 'unknown error'}</Text>
        {typeof result.durationMs === 'number' && (
          <Text style={[s.cardSubLabel, { marginTop: 4 }]}>{result.durationMs}ms</Text>
        )}
      </View>
    );
  }
  return (
    <View style={[s.card, { borderColor: colors.success + '88', backgroundColor: colors.success + '08' }]}>
      <View style={s.cardHeader}>
        <CheckCircle2 size={14} color={colors.success} />
        <Text style={[s.cardLabel, { color: colors.success }]}>IMPORT COMPLETE</Text>
        {typeof result.durationMs === 'number' && (
          <Text style={s.cardSubLabel}>{result.durationMs}ms</Text>
        )}
      </View>
      <View style={s.statRow}>
        <Stat label="PARSED"   value={result.parsed   ?? 0} color={colors.text} />
        <Stat label="INSERTED" value={result.inserted ?? 0} color={brand}       />
        <Stat label="SKIPPED"  value={result.skipped  ?? 0} color={colors.textSecondary} />
        <Stat label="REJECTED" value={result.rejected_count ?? 0} color={(result.rejected_count ?? 0) > 0 ? colors.warning : colors.textTertiary} />
      </View>
      {result.aggregateSkipped ? (
        <Text style={[s.helpBody, { color: colors.textSecondary, marginTop: 8 }]}>
          All draws already existed — datasets unchanged.
        </Text>
      ) : (
        <Text style={[s.helpBody, { color: colors.textSecondary, marginTop: 8 }]}>
          Datasets rebuilt to anchor <Text style={{ color: colors.text, fontWeight: '800' }}>{result.anchor}</Text>:
          {' '}{result.boxRowsWritten ?? 0} box rows + {result.pairRowsWritten ?? 0} pair rows.
        </Text>
      )}
      {Array.isArray(result.rejected) && result.rejected.length > 0 && (
        <View style={{ marginTop: 10, gap: 4 }}>
          <Text style={[s.cardSubLabel, { color: colors.warning, fontWeight: '900' }]}>
            REJECTED LINES
          </Text>
          {result.rejected.slice(0, 20).map((r, i) => (
            <Text key={i} style={[s.rejectRow, { color: colors.textSecondary }]}>
              <Text style={{ fontFamily: theme.typography.fontFamily.mono }}>line {r.line_number}</Text>
              {`  ·  ${r.reason}`}
            </Text>
          ))}
          {result.rejected.length > 20 && (
            <Text style={[s.cardSubLabel, { color: colors.textTertiary }]}>
              + {result.rejected.length - 20} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '900', color, fontFamily: theme.typography.fontFamily.mono }}>
        {value}
      </Text>
      <Text style={{ fontSize: 9, fontWeight: '800', color: '#999', letterSpacing: 0.6, marginTop: 1 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: colors.surface2,
  },
  iconBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center', borderRadius: 18,
  },
  title: {
    fontSize: 16, fontWeight: '900', color: colors.text,
    letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.bold,
  },
  subtitle: { fontSize: 10, color: colors.textTertiary, fontWeight: '600', marginTop: 1 },
  body: { flex: 1 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderRadius: 12,
    padding: 12, gap: 8,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  cardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  cardSubLabel: { fontSize: 10, color: '#777', fontWeight: '700', marginLeft: 'auto' },

  textarea: {
    minHeight: 220,
    color: colors.text,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.mono,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, paddingHorizontal: 16,
    borderRadius: 10, borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },

  statRow: { flexDirection: 'row', gap: 4, marginTop: 4 },

  rejectRow: { fontSize: 11, fontWeight: '600' },

  helpCard: {
    borderWidth: 1, borderRadius: 10, padding: 10, gap: 4,
  },
  helpLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  helpBody: { fontSize: 11, lineHeight: 16 },
});
