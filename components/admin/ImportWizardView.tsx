import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { parseRawLedgerData } from '@/lib/parseLedger';
import { getTodayET } from '@/lib/dateUtils';
import { runHitDetectionForDates } from '@/lib/hitDetection';
import { Pill, SectionTitle, Card, useSt, HORIZONS, useImportTypes, PAIR_CLASSES, ImportRecord } from './AdminShared';

// ─── Box History helpers ──────────────────────────────────────────────────────

/** Convert "Mar 23, 2026" → "2026-03-23". Also passes through YYYY-MM-DD. */
function parseDisplayDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const MONTH_MAP: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  try {
    // 1. Handle "Fri, Sep 26, 2025" or "Sep 26, 2025"
    const alphaMatch = s.match(/(?:[A-Za-z]{3,},?\s+)?([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
    if (alphaMatch) {
      const month = MONTH_MAP[alphaMatch[1].toLowerCase().slice(0, 3)];
      if (month) return `${alphaMatch[3]}-${month}-${alphaMatch[2].padStart(2, '0')}`;
    }

    // 2. Handle "YYYY-MM-DD" or "YYYY/MM/DD"
    const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;

    // 3. Handle "MM/DD/YYYY" or "MM-DD-YYYY"
    const usMatch = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;

    // 4. Fallback to native Date but use local components to avoid UTC shifts
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Split a single box-history line into exactly 5 fields:
 *   [Combo, Times Drawn, Expected, Last Seen, Draws Since]
 *
 * Handles both tab-separated (spreadsheet paste) and comma-separated.
 * Accounts for a comma inside the date ("Mar 23, 2026") and thousands
 * commas in Draws Since ("1,649").
 */
function parseBoxLine(line: string): [string, string, string, string, string] | null {
  if (line.includes('\t')) {
    const p = line.split('\t').map(x => x.trim());
    if (p.length < 5) return null;
    return [p[0], p[1], p[2], p[3], p[4].replace(/,/g, '')];
  }
  // Comma split
  const p = line.split(',').map(x => x.trim());
  if (p.length < 5) return null;
  const combo = p[0];
  const times = p[1];
  const exp   = p[2];
  // Everything after Expected is [ ...Last Seen parts..., ...Draws Since parts ]
  // Last Seen can be "Mar 23, 2026" (2 parts) or already "2026-03-23" (1 part)
  // Draws Since can be "1649" (1 part) or "1,649" (2 parts: "1" + "649")
  const rest = p.slice(3);
  if (rest.length === 0) return null;

  // Detect if rest[0] starts with a month abbreviation → date occupies first 2 rest parts
  const startsWithMonth = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(rest[0]);
  let lastSeen: string;
  let dsParts: string[];

  if (startsWithMonth && rest.length >= 3) {
    // "Mar 23" + "2026" + drawsSince parts
    lastSeen = rest[0] + ', ' + rest[1];
    dsParts = rest.slice(2);
  } else if (startsWithMonth && rest.length === 2) {
    // "Mar 23" + "2026" — no room for DS; still try
    lastSeen = rest[0] + ', ' + rest[1];
    dsParts = [];
  } else {
    // Date is a single field (ISO or plain year)
    lastSeen = rest[0];
    dsParts = rest.slice(1);
  }

  const drawsSince = dsParts.join('').replace(/,/g, '');
  return [combo, times, exp, lastSeen, drawsSince];
}

/** Sort the 3 digits of a combo and build PostgreSQL array literal: "742" → "{2,4,7}" */
function comboToSet(combo: string): string {
  const digits = combo.replace(/\D/g, '').split('').sort();
  return '{' + digits.join(',') + '}';
}

// ─── Import Wizard View ───────────────────────────────────────────────────────
export default function ImportWizardView({ setView, importHistory, importLedger, importDailyInput, regenerateSlate, preset, onClearPreset }: {
  setView: (v: string) => void;
  importHistory: (data: any) => Promise<any>;
  importLedger: (data: any) => Promise<any>;
  importDailyInput: (data: any) => Promise<any>;
  regenerateSlate: (scope: any) => Promise<any>;
  preset?: { type: 'box_history' | 'pair_history'; jurisdiction: string } | null;
  onClearPreset?: () => void;
}) {
  const { colors } = useTheme();
  const st = useSt();
  const IMPORT_TYPES = useImportTypes();
  const [step, setStep] = useState(preset ? 1 : 0);
  const [importType, setImportType] = useState<string | null>(preset?.type ?? null);
  const todayDefault = useMemo(() => getTodayET(), []);
  const yesterdayDefault = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }, []);
  const [config, setConfig] = useState({ scope: 'midday', horizon: 'H01Y', class_id: 2, import_date: todayDefault });
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  // parsedData holds the structured rows/entries ready to send to Supabase
  const [parsedData, setParsedData] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const typeInfo = IMPORT_TYPES.find(t => t.id === importType);

  const generateSample = useCallback(() => {
    if (!typeInfo) return '';
    if (importType === 'box_history') {
      // Tab-separated to match spreadsheet paste format
      const h = typeInfo.headers.join('\t');
      const rows = [
        '742\t48\t1.23\tApr 13, 2026\t3',
        '319\t31\t0.87\tApr 10, 2026\t1,649',
        '000\t12\t0.33\tMar 23, 2026\t22',
      ];
      return h + '\n' + rows.join('\n');
    }
    if (importType === 'ledger') {
      return 'New York\nPick 3 Midday\tTue, Apr 14, 2026\t7-4-2\nPick 3 Evening\tTue, Apr 14, 2026\t3-1-9\nFlorida\nPick 3 Midday\tTue, Apr 14, 2026\t6-4-1\nPick 3 Evening\tTue, Apr 14, 2026\t0-5-8';
    }
    const h = typeInfo.headers.join(',');
    const rows = importType === 'pair_history' ? ['42,18,2026-04-10,3','13,22,2026-04-08,5']
      : ['742,{2,4,7},48,2026-04-13,0'];
    return h + '\n' + rows.join('\n');
  }, [importType, typeInfo]);

  // Real CSV parsing — produces structured data for the import mutations
  const handleValidate = useCallback(() => {
    setValidating(true);
    setParsedData(null);

    // Run synchronously after a tick so "Validating…" renders
    setTimeout(() => {
      try {
        const text = (csvText || generateSample()).trim();
        const lines = text.split('\n').filter(l => l.trim());

        if (lines.length < 2) {
          setParsed({ headers: [], totalRows: 0, accepted: 0, rejected: 0, fixed: 0, warnings: ['No data rows found — paste CSV with header row and at least one data row'], errors: [], fixes: [], sampleRows: [] });
          setValidating(false);
          setStep(3);
          return;
        }

        // Header split: prefer tabs (spreadsheet paste), fall back to commas
        const firstLine = lines[0];
        const useTab = firstLine.includes('\t');
        const rawHeaders = (useTab ? firstLine.split('\t') : firstLine.split(',')).map(h => h.trim());
        // Normalise header names for matching (lowercase, collapse spaces)
        const normH = rawHeaders.map(h => h.toLowerCase().replace(/\s+/g, ''));
        const idx = (name: string) => normH.findIndex(h => h === name.toLowerCase().replace(/\s+/g, ''));
        const dataLines = lines.slice(1);
        let accepted = 0, rejected = 0, fixed = 0;
        const warnings: string[] = [];

        if (importType === 'box_history') {
          // New format: Combo | Times Drawn | Expected | Last Seen | Draws Since
          // Uses parseBoxLine() which handles tab/comma and comma-in-date/DS
          const boxRows: { key: string; timesDrawn: number; expected: number; lastSeen: string; drawsSince: number }[] = [];
          dataLines.forEach((line, i) => {
            if (!line.trim()) return;
            const fields = parseBoxLine(line);
            if (!fields) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: could not split into 5 fields`);
              return;
            }
            const [comboRaw, timesRaw, expectedRaw, lastSeenRaw, dsRaw] = fields;
            const combo = comboRaw.trim();
            const timesDrawn = parseInt(timesRaw.replace(/,/g, ''), 10);
            const expected = parseFloat(expectedRaw.replace(/,/g, ''));
            const lastSeen = parseDisplayDate(lastSeenRaw);
            const drawsSince = parseInt(dsRaw.replace(/,/g, ''), 10);

            if (!combo || !/^\d{3}$/.test(combo)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Combo "${combo}" is not a 3-digit string`);
              return;
            }
            if (isNaN(timesDrawn)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Times Drawn "${timesRaw}" is not a number`);
              return;
            }
            if (!lastSeen) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Last Seen "${lastSeenRaw}" — expected "Mon DD, YYYY"`);
              return;
            }
            if (isNaN(drawsSince)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Draws Since "${dsRaw}" is not a number`);
              return;
            }
            let ds = drawsSince;
            if (ds < 0) { fixed++; ds = 0; if (warnings.length < 5) warnings.push(`Row ${i + 2}: Draws Since < 0 clamped to 0`); }
            accepted++;
            boxRows.push({ key: combo, timesDrawn, expected: isNaN(expected) ? 0 : expected, lastSeen, drawsSince: ds });
          });
          setParsedData({ boxRows });
          setParsed({ headers: rawHeaders, totalRows: dataLines.filter(l => l.trim()).length, accepted, rejected, fixed, warnings, errors: [], fixes: [], sampleRows: boxRows.slice(0, 5).map(r => ({ Combo: r.key, 'Times Drawn': r.timesDrawn, Expected: r.expected, 'Last Seen': r.lastSeen, 'Draws Since': r.drawsSince })) });

        } else if (importType === 'daily_input') {
          const iCombo = idx('Combo'), iTimes = idx('TimesDrawn'), iLast = idx('LastSeen'), iDs = idx('DrawsSince');
          if ([iCombo, iTimes, iLast, iDs].some(i => i < 0)) {
            setParsed({ headers: rawHeaders, totalRows: 0, accepted: 0, rejected: 0, fixed: 0, warnings: ['Missing required columns: Combo, TimesDrawn, LastSeen, DrawsSince'], errors: [], fixes: [], sampleRows: [] });
            setValidating(false); setStep(3); return;
          }
          const combos: string[] = [];
          dataLines.forEach((line, i) => {
            if (!line.trim()) return;
            const c = (useTab ? line.split('\t') : line.split(',')).map(x => x.trim());
            const combo = c[iCombo], timesDrawn = parseInt(c[iTimes], 10), lastSeen = c[iLast], rawDs = parseInt(c[iDs], 10);
            if (!combo || isNaN(timesDrawn) || !lastSeen || isNaN(rawDs)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: invalid or missing data`);
              return;
            }
            accepted++;
            combos.push(combo);
          });
          setParsedData({ combos });
          setParsed({ headers: rawHeaders, totalRows: dataLines.filter(l => l.trim()).length, accepted, rejected, fixed, warnings, errors: [], fixes: [], sampleRows: combos.slice(0, 5).map(c => ({ Combo: c })) });

        } else if (importType === 'pair_history') {
          const iPair = idx('Pair'), iTimes = idx('TimesDrawn'), iLast = idx('LastSeen'), iDs = idx('DrawsSince');
          if ([iPair, iTimes, iLast, iDs].some(i => i < 0)) {
            setParsed({ headers: rawHeaders, totalRows: 0, accepted: 0, rejected: 0, fixed: 0, warnings: ['Missing required columns: Pair, TimesDrawn, LastSeen, DrawsSince'], errors: [], fixes: [], sampleRows: [] });
            setValidating(false); setStep(3); return;
          }
          const rows: { key: string; timesDrawn: number; lastSeen: string; drawsSince: number }[] = [];
          dataLines.forEach((line, i) => {
            if (!line.trim()) return;
            const c = (useTab ? line.split('\t') : line.split(',')).map(x => x.trim());
            const pair = c[iPair], timesDrawn = parseInt(c[iTimes], 10), lastSeen = c[iLast], rawDs = parseInt(c[iDs], 10);
            if (!pair || isNaN(timesDrawn) || !lastSeen || isNaN(rawDs)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: invalid or missing data`);
              return;
            }
            let drawsSince = rawDs;
            if (drawsSince < 0) { fixed++; drawsSince = 0; }
            accepted++;
            rows.push({ key: pair, timesDrawn, lastSeen, drawsSince });
          });
          setParsedData({ rows });
          setParsed({ headers: rawHeaders, totalRows: dataLines.filter(l => l.trim()).length, accepted, rejected, fixed, warnings, errors: [], fixes: [], sampleRows: rows.slice(0, 5).map(r => ({ Pair: r.key, TimesDrawn: r.timesDrawn, LastSeen: r.lastSeen, DrawsSince: r.drawsSince })) });

        } else if (importType === 'ledger') {
          // Use the lotterypost.com paste parser
          const { rows: ledgerRows, skipped } = parseRawLedgerData(text);
          const entries = ledgerRows.map(r => ({
            jurisdiction: r.jurisdiction,
            game: r.game,
            date_et: r.date_et,
            session: r.session,
            result_digits: r.result_digits,
            comboset_sorted: r.comboset_sorted,
          }));
          setParsedData({ entries });
          setParsed({
            headers: ['State', 'Game', 'Date', 'Session', 'Result', 'ComboSet'],
            totalRows: ledgerRows.length + skipped.length,
            accepted: ledgerRows.length,
            rejected: 0,
            fixed: 0,
            warnings: skipped.slice(0, 10),
            errors: [],
            fixes: [],
            sampleRows: entries.slice(0, 5),
          });
        }

        setValidating(false);
        setStep(3);
      } catch (e) {
        setValidating(false);
        Alert.alert('Parse Error', String(e instanceof Error ? e.message : e));
      }
    }, 80);
  }, [csvText, generateSample, importType]);

  // Real commit — box_history writes directly via fetchFromSupabase;
  // other types delegate to the useDataIngestion mutations.
  const handleCommit = useCallback(async () => {
    if (!parsedData) return;
    setImporting(true);
    setCommitError(null);
    try {
      let summary: any;

      if (importType === 'box_history') {
        const boxRows: { key: string; timesDrawn: number; expected: number; lastSeen: string; drawsSince: number }[] =
          parsedData.boxRows ?? [];

        // Build records for datasets_box
        const records = boxRows.map(r => ({
          class_id: 1,
          scope: config.scope,
          horizon_label: config.horizon,
          key: r.key,
          jurisdiction: preset?.jurisdiction ?? null,
          key_box: r.key,
          ds_raw: r.drawsSince,
          ds_normalized: 0,
          times_drawn: r.timesDrawn,
          last_seen: r.lastSeen,
          expected: r.expected,
          draws_since: r.drawsSince,
          deleted_at: null,
        }));

        // Chunk at 500 rows to stay within PostgREST payload limits
        const CHUNK = 500;
        let inserted = 0;
        for (let i = 0; i < records.length; i += CHUNK) {
          const batch = records.slice(i, i + CHUNK);
          await fetchFromSupabase({
            path: '/rest/v1/datasets_box?on_conflict=class_id,scope,horizon_label,key,jurisdiction',
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: batch,
          });
          inserted += batch.length;
        }

        // Log import record
        const importRec = await fetchFromSupabase<any>({
          path: '/rest/v1/imports',
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: {
            type: 'box_history',
            class_id: 1,
            horizon_label: config.horizon,
            scope: config.scope,
            counts: inserted,
            status: 'completed',
            file_meta: { rowCount: boxRows.length, rejected: (parsed?.rejected ?? 0), fixed: (parsed?.fixed ?? 0) },
          },
        });
        const importId = Array.isArray(importRec) ? importRec[0]?.id : importRec?.id;

        summary = {
          id: importId ?? ('box_' + Date.now()),
          type: 'box_history',
          accepted: inserted,
          rejected: parsed?.rejected ?? 0,
          fixed: parsed?.fixed ?? 0,
          warnings: parsed?.warnings ?? [],
        };

        // Task 5: Trigger slate regeneration for all 3 scopes after box history import
        const scopesToRegen: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
        for (const sc of scopesToRegen) {
          try {
            await regenerateSlate(sc);
          } catch (regenErr) {
            console.warn('[BoxImport] regenerateSlate warn for', sc, ':', regenErr);
            // Non-fatal — import already succeeded
          }
        }

      } else if (importType === 'pair_history') {
        summary = await importHistory({
          type: 'pair_history',
          classId: config.class_id,
          horizonLabel: config.horizon,
          scope: config.scope,
          jurisdiction: preset?.jurisdiction,
          rows: parsedData.rows ?? [],
        });
      } else if (importType === 'ledger') {
        const rawEntries: any[] = parsedData.entries ?? [];
        // No session coercion: preserve morning/night as their own sessions
        // so they don't collide with midday/evening on the unique key. The
        // engine ignores morning/night for scoring + hit detection (post
        // BUG-134) so leaving them distinct is safe and preserves data.
        // Deduplicate within the full set before batching — Postgres throws if
        // the same conflict key appears twice in one ON CONFLICT DO UPDATE statement.
        const seenKeys = new Set<string>();
        const entries = rawEntries.filter((r: any) => {
          const k = `${r.jurisdiction}|${r.game}|${r.date_et}|${r.session}|${r.result_digits}`;
          if (seenKeys.has(k)) return false;
          seenKeys.add(k);
          return true;
        });
        const BATCH = 50;
        let totalAccepted = 0;
        let lastError = '';
        for (let bi = 0; bi < entries.length; bi += BATCH) {
          const chunk = entries.slice(bi, bi + BATCH);
          try {
            await fetchFromSupabase({
              path: '/rest/v1/histories?on_conflict=jurisdiction,game,date_et,session,result_digits',
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
              body: chunk,
            });
            totalAccepted += chunk.length;
          } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
          }
        }
        const states = [...new Set(entries.map((r: any) => r.jurisdiction))];
        const dates = [...new Set(entries.map((r: any) => r.date_et))].sort() as string[];
        const dateRange = dates.length > 0
          ? (dates[0] + (dates.length > 1 ? ' – ' + dates[dates.length - 1] : ''))
          : '';
        // Warn if parsed dates don't include the expected import date
        const dateMismatchWarnings: string[] = [];
        if (config.import_date && dates.length > 0 && !dates.includes(config.import_date)) {
          dateMismatchWarnings.push(`⚠️ Date mismatch: selected ${config.import_date} but parsed dates are ${dates.join(', ')}`);
        }
        // Log import with date/scope in file_meta
        await fetchFromSupabase({
          path: '/rest/v1/imports',
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: {
            type: 'ledger',
            scope: config.scope,
            counts: totalAccepted,
            status: totalAccepted === 0 && entries.length > 0 ? 'failed' : 'completed',
            error_text: totalAccepted === 0 && entries.length > 0 ? (lastError || 'all batches failed') : null,
            file_meta: { import_date: config.import_date, scope: config.scope, dateRange, states: states.length },
          },
        }).catch(() => {/* non-fatal */});
        // BUG-149 (2026-05-18): wire hit detection into the wizard's ledger path.
        // useDataIngestion's importLedger does this automatically, but the wizard
        // path had no trigger — every wizard ledger import left daily_intelligence
        // hit_box/hit_straight at zero until the next pull-to-refresh somewhere
        // else fired it. Run for the dates we just inserted, non-fatal on failure.
        const hitDetectionWarnings: string[] = [];
        if (totalAccepted > 0 && dates.length > 0) {
          try {
            const hd = await runHitDetectionForDates(dates);
            if (hd.ran && hd.totalHits > 0) {
              hitDetectionWarnings.push(`✓ Hit detection: ${hd.totalHits} hit${hd.totalHits === 1 ? '' : 's'} found across ${dates.length} date${dates.length === 1 ? '' : 's'}`);
            } else if (hd.ran) {
              hitDetectionWarnings.push(`✓ Hit detection ran — 0 hits matched`);
            } else {
              hitDetectionWarnings.push(`⚠️ Hit detection failed to run — trigger manually from Home pull-to-refresh`);
            }
          } catch (e) {
            hitDetectionWarnings.push(`⚠️ Hit detection error: ${String(e instanceof Error ? e.message : e)}`);
          }
        }
        summary = {
          id: 'ledger_' + Date.now(),
          type: 'ledger',
          accepted: totalAccepted,
          rejected: entries.length - totalAccepted,
          fixed: 0,
          warnings: [...(lastError ? [lastError] : []), ...dateMismatchWarnings, ...hitDetectionWarnings],
          states: states.length,
          dateRange,
        };
      } else if (importType === 'daily_input') {
        summary = await importDailyInput({
          scope: config.scope,
          combos: parsedData.combos ?? [],
          import_date: config.import_date,
          file_meta: { import_date: config.import_date, scope: config.scope },
        });
      }

      setResult(summary);
      setImporting(false);
      setStep(4);
    } catch (e) {
      setImporting(false);
      const msg = String(e instanceof Error ? e.message : e);
      setCommitError(msg);
      Alert.alert('Import Failed', msg);
    }
  }, [importType, config, parsedData, parsed, importHistory, importLedger, importDailyInput, regenerateSlate]);

  const steps = ['Type', 'Configure', 'Upload', 'Review', 'Done'];

  return (
    <View style={{ flex: 1 }}>
      {/* Steps header */}
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, padding: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {steps.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: step > i ? colors.success : i === step ? colors.primary : colors.surfaceLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: step > i ? colors.success : i === step ? colors.primary : colors.border }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: step > i || i === step ? '#fff' : colors.textTertiary }}>{step > i ? '✓' : i + 1}</Text>
                </View>
                <Text style={{ fontSize: 10, color: i === step ? colors.primary : colors.textTertiary, fontWeight: i === step ? '700' : '400' }}>{s}</Text>
                {i < steps.length - 1 && <View style={{ width: 16, height: 2, backgroundColor: step > i ? colors.success : colors.border }} />}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {/* Step 0: Select type */}
        {step === 0 && (
          <View>
            <Text style={st.title}>Select Import Type</Text>
            <Text style={st.sub}>What type of data are you importing?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              {IMPORT_TYPES.map(t => (
                <TouchableOpacity key={t.id} style={{ width: '47%' }} onPress={() => {
                  setImportType(t.id);
                  // Daily input defaults to yesterday — most common case is importing yesterday's draws
                  if (t.id === 'daily_input') setConfig(c => ({ ...c, import_date: yesterdayDefault }));
                  else setConfig(c => ({ ...c, import_date: todayDefault }));
                  setStep(1);
                }} activeOpacity={0.8}>
                  <Card style={{ padding: 16, borderWidth: importType === t.id ? 2 : 1, borderColor: importType === t.id ? t.color : colors.border }}>
                    <Text style={{ fontSize: 26, marginBottom: 8 }}>{t.icon}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{t.label}</Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15, marginBottom: 8 }}>{t.desc}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                      {t.headers.map(h => <Pill key={h} label={h} color={t.color} />)}
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 1: Configure */}
        {step === 1 && (
          <View>
            <Text style={st.title}>Configure Import</Text>
            <Text style={st.sub}>Set scope, horizon, and class for this import.</Text>
            <Text style={st.fieldLabel}>SCOPE</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {[['midday', '☀️ Midday'], ['evening', '🌙 Evening'], ['allday', '◈ All Day']].map(([id, lbl]) => (
                <TouchableOpacity key={id} style={[st.optBtn, config.scope === id && st.optBtnOn]} onPress={() => setConfig(c => ({ ...c, scope: id }))}>
                  <Text style={[st.optBtnText, config.scope === id && st.optBtnTextOn]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {(importType === 'box_history' || importType === 'pair_history') && (
              <>
                <Text style={st.fieldLabel}>HORIZON</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {HORIZONS.map(h => (
                      <TouchableOpacity key={h} style={[st.optBtn, config.horizon === h && st.optBtnOn]} onPress={() => setConfig(c => ({ ...c, horizon: h }))}>
                        <Text style={[st.optBtnText, config.horizon === h && st.optBtnTextOn]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
            {importType === 'pair_history' && (
              <>
                <Text style={st.fieldLabel}>PAIR CLASS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {PAIR_CLASSES.map(pc => (
                      <TouchableOpacity key={pc.id} style={[st.optBtn, config.class_id === pc.id && st.optBtnOn]} onPress={() => setConfig(c => ({ ...c, class_id: pc.id }))}>
                        <Text style={[st.optBtnText, config.class_id === pc.id && st.optBtnTextOn]}>Cls {pc.id}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Date picker for daily_input and ledger */}
            {(importType === 'daily_input' || importType === 'ledger') && (
              <>
                <Text style={st.fieldLabel}>IMPORT DATE</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                  {[0, 1, 2, 3, 4, 5, 6].map(daysAgo => {
                    const todayET = getTodayET();
                    const d = new Date(todayET + 'T12:00:00'); d.setDate(d.getDate() - daysAgo);
                    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                    const label = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yest.' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <TouchableOpacity
                        key={dateStr}
                        style={[st.optBtn, config.import_date === dateStr && st.optBtnOn, { paddingHorizontal: 8 }]}
                        onPress={() => setConfig(c => ({ ...c, import_date: dateStr }))}
                      >
                        <Text style={[st.optBtnText, config.import_date === dateStr && st.optBtnTextOn, { fontSize: 10 }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {importType === 'daily_input' && (
                  <Card style={{ padding: 10, marginBottom: 14, backgroundColor: colors.primaryLight, borderColor: colors.primary + '28' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                      📅 This import will be tagged as date: {config.import_date} · scope: {config.scope}
                    </Text>
                  </Card>
                )}
                {importType === 'ledger' && (
                  <Card style={{ padding: 10, marginBottom: 14, backgroundColor: colors.tealLight, borderColor: colors.teal + '28' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal }}>
                      📋 Expected date: {config.import_date} · scope: {config.scope}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                      A warning will appear if parsed results don't match this date.
                    </Text>
                  </Card>
                )}
              </>
            )}

            <Card style={{ padding: 12, marginBottom: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, marginBottom: 4 }}>Import will create:</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono }}>
                {importType === 'box_history' ? 'Box Class (1)' : importType === 'pair_history' ? 'Pair Class (' + config.class_id + ')' : ''}{config.horizon ? ' · ' + config.horizon : ''} · Scope: {config.scope}{(importType === 'daily_input' || importType === 'ledger') ? ' · Date: ' + config.import_date : ''}
              </Text>
            </Card>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={st.btnPrimary} onPress={() => setStep(2)}><Text style={st.btnPrimaryText}>Continue →</Text></TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setStep(0)}><Text style={st.btnGhostText}>← Back</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2: Upload CSV */}
        {step === 2 && (
          <View>
            <Text style={st.title}>{importType === 'ledger' ? 'Paste Lotterypost Results' : 'Upload CSV'}</Text>
            <Text style={st.sub}>{importType === 'ledger' ? 'Copy the full results page from lotterypost.com and paste below.' : `Paste your CSV data. Required: ${typeInfo?.headers.join(', ')}`}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(typeInfo?.headers ?? []).map(h => <Pill key={h} label={h} color={colors.primary} />)}
              </View>
            </ScrollView>
            <TextInput
              style={st.csvInput}
              value={csvText}
              onChangeText={setCsvText}
              placeholder={importType === 'ledger'
                ? 'Paste raw results from lotterypost.com.\n\nState Name\nGame\tDate\tResult\nGame\tDate\tResult\nNext State\n...'
                : "Paste CSV here, or tap 'Load Sample'..."}
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: validating ? 0.6 : 1 }]} onPress={handleValidate} disabled={validating}>
                <Text style={st.btnPrimaryText}>{validating ? '⏳ Validating…' : 'Validate & Preview →'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setCsvText(generateSample())}><Text style={st.btnGhostText}>Sample</Text></TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setStep(1)}><Text style={st.btnGhostText}>← Back</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 3: Review */}
        {step === 3 && parsed && (
          <View>
            <Text style={st.title}>Review & Commit</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {[{ l:'Accepted', v: parsed.accepted, c: colors.success }, { l:'Rejected', v: parsed.rejected, c: colors.error }, { l:'Fixed', v: parsed.fixed, c: colors.gold }, { l:'Total', v: parsed.totalRows, c: colors.primary }].map(s => (
                <Card key={s.l} style={{ flex: 1, minWidth: 70, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: theme.typography.fontFamily.monoBold }}>{s.v}</Text>
                  <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '700' }}>{s.l}</Text>
                </Card>
              ))}
            </View>
            {parsed.warnings?.length > 0 && (
              <Card style={{ padding: 12, marginBottom: 10, backgroundColor: colors.goldLight, borderColor: colors.gold + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gold, marginBottom: 4 }}>⚠️ Warnings</Text>
                {parsed.warnings.map((w: string, i: number) => <Text key={i} style={{ fontSize: 11, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono }}>{w}</Text>)}
              </Card>
            )}
            <Card style={{ padding: 12, marginBottom: 14, backgroundColor: colors.primaryLight, borderColor: colors.primary + '28' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>Import Configuration</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono }}>
                Type: {importType}{importType === 'pair_history' ? ' · Class ' + config.class_id : importType === 'box_history' ? ' · Class 1' : ''}{config.horizon && (importType === 'box_history' || importType === 'pair_history') ? ' · ' + config.horizon : ''} · Scope: {config.scope}
              </Text>
            </Card>
            {commitError && (
              <Card style={{ padding: 12, marginBottom: 10, backgroundColor: colors.errorLight, borderColor: colors.error + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.error, marginBottom: 4 }}>✗ Import Failed</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono }}>{commitError}</Text>
              </Card>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: importing || parsed.accepted === 0 ? 0.6 : 1 }]} onPress={handleCommit} disabled={importing || parsed.accepted === 0}>
                <Text style={st.btnPrimaryText}>{importing ? '⏳ Writing to Supabase…' : '✓ Commit Import'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => { setStep(2); setCommitError(null); }}><Text style={st.btnGhostText}>← Back</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 4: Result — uses real ImportSummary from Supabase */}
        {step === 4 && result && (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 48, marginBottom: 8 }}>✅</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.success, marginBottom: 4 }}>Import Committed</Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono }} numberOfLines={1}>ID: {result.id}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[{ l:'Accepted', v: result.accepted, c: colors.success }, { l:'Rejected', v: result.rejected, c: colors.error }, { l:'Fixed', v: result.fixed ?? 0, c: colors.gold }].map(s => (
                <Card key={s.l} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: theme.typography.fontFamily.monoBold }}>{s.v}</Text>
                  <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '700' }}>{s.l}</Text>
                </Card>
              ))}
            </View>
            {result.warnings?.length > 0 && (
              <Card style={{ padding: 12, marginBottom: 10, backgroundColor: colors.goldLight, borderColor: colors.gold + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gold, marginBottom: 4 }}>⚠️ Warnings</Text>
                {result.warnings.slice(0, 5).map((w: string, i: number) => <Text key={i} style={{ fontSize: 11, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono }}>{w}</Text>)}
              </Card>
            )}
            <Card style={{ padding: 14, marginBottom: 14, backgroundColor: colors.successLight, borderColor: colors.success + '33' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success, marginBottom: 6 }}>✓ Supabase write confirmed</Text>
              {(importType === 'box_history' || importType === 'pair_history') ? (
                <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 18 }}>
                  P99 cap computed · Percentile map saved · Horizon blend updated{result.p99_cap ? ` · P99 cap: ${result.p99_cap}` : ''}{result.first_seen ? `\nFirst seen: ${result.first_seen} · Last seen: ${result.last_seen}` : ''}
                </Text>
              ) : importType === 'ledger' ? (
                <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 18 }}>
                  {result.accepted} draw results inserted into histories · ON CONFLICT DO NOTHING applied for duplicates
                </Text>
              ) : (
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  Daily input logged for scope: {config.scope}
                </Text>
              )}
            </Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={st.btnPrimary} onPress={() => { setStep(0); setImportType(null); setParsed(null); setParsedData(null); setCsvText(''); setResult(null); setCommitError(null); }}>
                <Text style={st.btnPrimaryText}>Import Another</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setView('history')}><Text style={st.btnGhostText}>View History</Text></TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setView('dashboard')}><Text style={st.btnGhostText}>← Dashboard</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
