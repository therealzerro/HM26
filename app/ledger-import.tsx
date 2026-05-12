import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { Button } from '@/components/Button';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { parseRawLedgerData, ParsedLedgerRow } from '@/lib/parseLedger';
import { useRouter } from 'expo-router';

// ─── helpers ─────────────────────────────────────────────────────────────────

function uniqueStates(rows: ParsedLedgerRow[]): string[] {
  return [...new Set(rows.map(r => r.jurisdiction))];
}

function uniqueDates(rows: ParsedLedgerRow[]): string[] {
  return [...new Set(rows.map(r => r.date_et))];
}

// ─── component ───────────────────────────────────────────────────────────────

type Stage = 'input' | 'validated' | 'committed';

export default function LedgerImportScreen() {
  const router = useRouter();
  const { importLedger } = useDataIngestion();

  const [rawData, setRawData]             = useState('');
  const [stage, setStage]                 = useState<Stage>('input');
  const [parsed, setParsed]               = useState<ParsedLedgerRow[]>([]);
  const [skipped, setSkipped]             = useState<string[]>([]);
  const [commitMsg, setCommitMsg]         = useState('');
  const [commitError, setCommitError]     = useState('');
  const [committing, setCommitting]       = useState(false);

  // ── Validate ──────────────────────────────────────────────────────────────

  const handleValidate = useCallback(() => {
    const result = parseRawLedgerData(rawData);
    setParsed(result.rows);
    setSkipped(result.skipped);
    setStage('validated');
    setCommitMsg('');
    setCommitError('');
  }, [rawData]);

  // ── Commit ────────────────────────────────────────────────────────────────

  const handleCommit = useCallback(async () => {
    if (parsed.length === 0) return;
    setCommitting(true);
    setCommitError('');
    try {
      const summary = await importLedger({
        scope: 'allday', // Ledger imports usually cover multiple scopes implicitly
        entries: parsed.map(r => ({
          jurisdiction: r.jurisdiction,
          game: r.game,
          date_et: r.date_et,
          session: r.session,
          result_digits: r.result_digits,
        })),
      });

      const accepted = summary.accepted;
      const rejected = summary.rejected;
      const states = uniqueStates(parsed);
      const dates  = uniqueDates(parsed);
      const dateLabel = dates.length === 1
        ? dates[0]
        : `${dates[0]} – ${dates[dates.length - 1]}`;

      setCommitMsg(
        `Successfully imported ${accepted} result${accepted !== 1 ? 's' : ''} across ` +
        `${states.length} state${states.length !== 1 ? 's' : ''} for ${dateLabel}.` +
        (rejected > 0 ? ` (${rejected} rows failed)` : '')
      );
      setStage('committed');
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }, [parsed, importLedger]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setRawData('');
    setParsed([]);
    setSkipped([]);
    setStage('input');
    setCommitMsg('');
    setCommitError('');
  };

  // ── UI ────────────────────────────────────────────────────────────────────

  const stateCount  = uniqueStates(parsed).length;
  const dateLabel   = (() => {
    const d = uniqueDates(parsed);
    if (d.length === 0) return '';
    return d.length === 1 ? d[0] : `${d[0]} – ${d[d.length - 1]}`;
  })();

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.title}>📋 Ledger Import</Text>
          <Text style={s.subtitle}>Paste results from lotterypost.com to power ZK6 hit tracking</Text>
        </View>

        {/* ── Input stage ── */}
        {stage !== 'committed' && (
          <View style={s.section}>
            <TextInput
              style={s.textarea}
              multiline
              value={rawData}
              onChangeText={t => { setRawData(t); setStage('input'); setParsed([]); setSkipped([]); }}
              placeholder={
                'Paste results directly from lotterypost.com – ' +
                'copy the entire page results section including state names\n\n' +
                'Example:\nArizona\nPick 3\tTue, Apr 14, 2026\t6-4-1\nArkansas\n' +
                'Cash 3 Midday\tTue, Apr 14, 2026\t2-7-2\nCash 3 Evening\tTue, Apr 14, 2026\t3-2-4'
              }
              placeholderTextColor={theme.colors.textTertiary}
              keyboardAppearance="dark"
            />

            <View style={s.actionRow}>
              <Button
                title="Validate"
                onPress={handleValidate}
                variant="secondary"
                disabled={!rawData.trim()}
              />
            </View>
          </View>
        )}

        {/* ── Validation preview ── */}
        {stage === 'validated' && (
          <>
            {/* Summary badge */}
            <View style={s.badge}>
              <CheckCircle size={14} color={theme.colors.success} />
              <Text style={s.badgeText}>
                {parsed.length} row{parsed.length !== 1 ? 's' : ''} parsed across{' '}
                {stateCount} state{stateCount !== 1 ? 's' : ''}
                {dateLabel ? `  •  ${dateLabel}` : ''}
              </Text>
            </View>

            {/* Preview table */}
            {parsed.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Preview</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    {/* Header row */}
                    <View style={[s.tableRow, s.tableHead]}>
                      {['State', 'Game', 'Date', 'Session', 'Result', 'ComboSet'].map(h => (
                        <Text key={h} style={[s.tableCell, s.tableHeadCell, colWidth(h)]}>{h}</Text>
                      ))}
                    </View>
                    {/* Data rows (first 30) */}
                    {parsed.slice(0, 30).map((row, i) => (
                      <View key={i} style={[s.tableRow, i % 2 === 0 && s.tableRowAlt]}>
                        <Text style={[s.tableCell, colWidth('State')]}>{row.jurisdiction}</Text>
                        <Text style={[s.tableCell, colWidth('Game')]} numberOfLines={1}>{row.game}</Text>
                        <Text style={[s.tableCell, colWidth('Date')]}>{row.date_et}</Text>
                        <Text style={[s.tableCell, colWidth('Session'), { color: row.session === 'midday' ? theme.colors.gold : theme.colors.primary }]}>
                          {row.session === 'midday' ? '☀️ Mid' : '🌙 Eve'}
                        </Text>
                        <Text style={[s.tableCell, colWidth('Result'), { fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '700' }]}>{row.result_digits}</Text>
                        <Text style={[s.tableCell, colWidth('ComboSet'), { fontFamily: theme.typography.fontFamily.mono }]}>{row.comboset_sorted}</Text>
                      </View>
                    ))}
                    {parsed.length > 30 && (
                      <Text style={s.moreRows}>Showing first 30 of {parsed.length} rows · scroll right to see all columns</Text>
                    )}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Skipped lines */}
            {skipped.length > 0 && (
              <View style={s.skippedBox}>
                <View style={s.skippedHeader}>
                  <AlertCircle size={14} color={theme.colors.orange} />
                  <Text style={s.skippedTitle}>{skipped.length} line{skipped.length !== 1 ? 's' : ''} skipped — these won't be imported</Text>
                </View>
                {skipped.slice(0, 10).map((msg, i) => (
                  <Text key={i} style={s.skippedLine}>
                    • {msg.replace(/Invalid date format: '([^']+)'/, 'Unrecognized date "$1" — use YYYY-MM-DD or "Mon, Apr 14, 2026"')
                          .replace(/Missing result_digits/, 'No draw result found on this line')
                          .replace(/Missing jurisdiction/, 'No state name found — make sure state names are on their own line')}
                  </Text>
                ))}
                {skipped.length > 10 && (
                  <Text style={s.skippedLine}>…and {skipped.length - 10} more skipped lines</Text>
                )}
              </View>
            )}

            {parsed.length === 0 && (
              <View style={s.emptyBox}>
                <AlertCircle size={20} color={theme.colors.error} />
                <Text style={s.emptyText}>No rows could be parsed. Check your input format.</Text>
              </View>
            )}

            {/* Actions */}
            <View style={s.actionRow}>
              <Button title="← Edit" onPress={handleReset} variant="secondary" />
              <Button
                title={committing ? 'Importing…' : `Commit ${parsed.length} rows`}
                onPress={handleCommit}
                disabled={parsed.length === 0 || committing}
              />
            </View>

            {committing && (
              <View style={s.loadingRow}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={s.loadingText}>Inserting in batches of 50…</Text>
              </View>
            )}
          </>
        )}

        {/* ── Committed stage ── */}
        {stage === 'committed' && (
          <View style={s.section}>
            <View style={s.successCard}>
              <CheckCircle size={28} color={theme.colors.success} />
              <Text style={s.successTitle}>Import Complete ✓</Text>
              <Text style={s.successMsg}>{commitMsg}</Text>
              <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 8, textAlign: 'center', lineHeight: 17 }}>
                Your results are now active. ZK6 will use this data on the next slate generation. View Results to see hit tracking.
              </Text>
              {commitError ? (
                <Text style={s.errorMsg}>{commitError}</Text>
              ) : null}
            </View>

            <View style={s.actionRow}>
              <Button title="Import More" onPress={handleReset} variant="secondary" />
              <Button
                title="View Results →"
                onPress={() => router.replace('/(tabs)/results' as any)}
              />
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── column widths for the preview table ─────────────────────────────────────

function colWidth(col: string) {
  const widths: Record<string, number> = {
    State: 52, Game: 130, Date: 98, Session: 68, Result: 60, ComboSet: 78,
  };
  return { width: widths[col] ?? 80 };
}

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll:    { flex: 1 },
  content:   { paddingBottom: 32 },

  header: {
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  title:    { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  subtitle: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 },

  section:      { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },

  textarea: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    color: theme.colors.text,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.mono,
    minHeight: 280,
    textAlignVertical: 'top',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: theme.colors.success + '18',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.success + '55',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  badgeText: { fontSize: 13, color: theme.colors.success, fontWeight: '600', flex: 1 },

  // Table
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tableRowAlt:  { backgroundColor: theme.colors.surfaceLight },
  tableHead:    { backgroundColor: theme.colors.surface },
  tableCell:    { fontSize: 11, color: theme.colors.text, paddingHorizontal: 6 },
  tableHeadCell:{ color: theme.colors.textTertiary, fontWeight: '700', letterSpacing: 0.5 },

  moreRows: {
    fontSize: 11, color: theme.colors.textTertiary,
    padding: 10, textAlign: 'center',
  },

  skippedBox: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: theme.colors.orange + '14',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.orange + '44',
    padding: 12,
  },
  skippedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  skippedTitle:  { fontSize: 12, fontWeight: '700', color: theme.colors.orange },
  skippedLine:   { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 2, fontFamily: theme.typography.fontFamily.mono },

  emptyBox: {
    marginHorizontal: 16, marginTop: 12,
    alignItems: 'center', gap: 10, padding: 20,
    backgroundColor: theme.colors.error + '10',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: theme.colors.error + '44',
  },
  emptyText: { fontSize: 13, color: theme.colors.error, textAlign: 'center' },

  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
  },
  loadingText: { fontSize: 12, color: theme.colors.textSecondary },

  successCard: {
    alignItems: 'center', gap: 10, padding: 24,
    backgroundColor: theme.colors.success + '12',
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1, borderColor: theme.colors.success + '44',
  },
  successTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.success },
  successMsg:   { fontSize: 13, color: theme.colors.text, textAlign: 'center', lineHeight: 20 },
  errorMsg:     { fontSize: 11, color: theme.colors.error, textAlign: 'center' },
});
