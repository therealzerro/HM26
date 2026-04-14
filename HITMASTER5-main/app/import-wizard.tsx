import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, TouchableOpacity, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, AlertCircle, CheckCircle, Copy, RefreshCw } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { Button } from '@/components/Button';
import { ImportType, ValidationError, HorizonLabel, Scope } from '@/types/core';
import { PAIR_CLASSES, SCOPES } from '@/constants/pairClasses';
import { useRouter } from 'expo-router';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { useScope } from '@/hooks/useScope';

export default function ImportWizardScreen() {
  const router = useRouter();
  const { importHistory, importLedger, importDailyInput, isLoading, lastImportSummary, regenerateSlate } = useDataIngestion();
  const { scope, setScope } = useScope();
  const [importType, setImportType] = useState<ImportType>('box_history');
  const [csvData, setCsvData] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [classId, setClassId] = useState<number>(1);
  const [horizonLabel, setHorizonLabel] = useState<HorizonLabel>('H01Y');
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [restErrorText, setRestErrorText] = useState<string | null>(null);
  const [normalizedPreview, setNormalizedPreview] = useState<any[]>([]);
  const lastRequestRef = useRef<{ kind: 'history' | 'ledger'; payload: any } | null>(null);

  const [regenOpen, setRegenOpen] = useState<boolean>(false);
  const [regenState, setRegenState] = useState<{ status: 'idle' | 'busy' | 'missing' | 'noop' | 'success' | 'error'; message: string } | null>(null);
  const [isRegenLoading, setIsRegenLoading] = useState<boolean>(false);

  const sanitizeCell = useCallback((v: string): string => v.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim(), []);

  const copyTextSafe = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        const navAny = (globalThis as unknown as { navigator?: any }).navigator;
        if (navAny?.clipboard?.writeText) {
          try {
            await navAny.clipboard.writeText(text);
            return true;
          } catch (clipboardError) {
            console.log('Clipboard API blocked, trying fallback:', clipboardError);
          }
        }
        const docAny = globalThis as unknown as { document?: any };
        const documentRef = docAny.document;
        if (documentRef?.body) {
          const ta = documentRef.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          documentRef.body.appendChild(ta);
          ta.select();
          const ok = documentRef.execCommand && documentRef.execCommand('copy');
          documentRef.body.removeChild(ta);
          return !!ok;
        }
        return false;
      } else {
        return false;
      }
    } catch (err) {
      console.log('copy failed', err);
      return false;
    }
  }, []);

  const normalizeHeader = useCallback((h: string): string => {
    const s = h.replace(/\u00A0/g, ' ').toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases: Record<string, string> = {
      boxcombo: 'combo',
      combo: 'combo',
      comboset: 'comboset',
      combosetboxed: 'comboset',
      timesdrawn: 'timesdrawn',
      times: 'timesdrawn',
      times_drawn: 'timesdrawn',
      lastseen: 'lastseen',
      last: 'lastseen',
      last_seen: 'lastseen',
      drawssince: 'drawssince',
      draws: 'drawssince',
      expected: 'expected',
      pair: 'pair',
      jurisdiction: 'jurisdiction',
      game: 'game',
      date: 'date_et',
      dateet: 'date_et',
      date_e_t: 'date_et',
      date_et: 'date_et',
      dateandtime: 'date_et',
      drawdate: 'date_et',
      session: 'session',
      results: 'result_digits',
      result: 'result_digits',
      resultdigits: 'result_digits',
    };
    return aliases[s] ?? s;
  }, []);

  const splitFlexible = useCallback((line: string): string[] => {
    const cleaned = line.replace(/\u00A0/g, ' ');
    const candidateDelims = ['\t', ';', '|'];
    for (const d of candidateDelims) {
      const parts = cleaned.split(d).map(p => sanitizeCell(p));
      if (parts.length > 1) return parts;
    }
    const commaParts = cleaned.split(',');
    if (commaParts.length > 1) {
      const fixed: string[] = [];
      for (let i = 0; i < commaParts.length; i++) {
        const part = sanitizeCell(commaParts[i]);
        const prev = fixed[fixed.length - 1] ?? '';
        const maybeMonth = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(prev);
        const looksYear = /^\d{4}$/.test(part);
        if (maybeMonth && looksYear) {
          fixed[fixed.length - 1] = `${prev}, ${part}`;
        } else {
          fixed.push(part);
        }
      }
      return fixed;
    }
    const spaceParts = cleaned.trim().split(/\s{2,}/).map(p => sanitizeCell(p));
    if (spaceParts.length > 1) return spaceParts;
    return [cleaned.trim()];
  }, [sanitizeCell]);

  const inferHasHeader = useCallback((firstLine: string): boolean => {
    const lower = firstLine.replace(/\u00A0/g, ' ').toLowerCase();
    const tokens = splitFlexible(firstLine);
    const normTokens = tokens.map(normalizeHeader);
    const hasAlpha = /[a-zA-Z]/.test(firstLine);
    const known = ['combo', 'comboset', 'timesdrawn', 'lastseen', 'drawssince', 'pair', 'jurisdiction', 'game', 'date_et', 'session', 'result_digits'];
    if (known.some(k => lower.includes(k))) return true;
    if (!hasAlpha) return false;
    return normTokens.some(t => known.includes(t));
  }, [splitFlexible, normalizeHeader]);

  const parseRows = useCallback((raw: string): { headers: string[]; rows: string[][]; original: string[] } => {
    const sanitized = raw.replace(/\u00A0/g, ' ');
    const lines = sanitized.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [], original: [] };
    
    // Special handling for ledger data that might be in multi-line format
    if (importType === 'ledger') {
      const first = lines[0];
      const hasHeader = inferHasHeader(first);
      
      if (hasHeader) {
        const headers = splitFlexible(first);
        const dataLines = lines.slice(1);
        const rows = dataLines.map(l => splitFlexible(l));
        return { headers, rows, original: dataLines };
      } else {
        // Handle multi-line ledger format: State on one line, game data on next line
        const processedEntries: { jurisdiction: string; game: string; date_et: string; session: 'midday' | 'evening'; result_digits: string }[] = [];
        let currentJurisdiction = '';
        
        console.log(`[parseRows] Processing ${lines.length} lines for ledger data`);
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          console.log(`[parseRows] Line ${i}: "${line}"`);
          
          // More robust line detection
          const hasDate = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i.test(line) || 
                         /[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i.test(line);
          const hasDigits = /\d[-\s]?\d[-\s]?\d/.test(line);
          const hasTabs = line.includes('\t');
          
          // Check if line contains game-like words
          const hasGameWords = /\b(pick|cash|daily|play|numbers|pega|quotidienne|dc-3)\b/i.test(line);
          
          console.log(`[parseRows] Line analysis:`, { hasDate, hasDigits, hasTabs, hasGameWords, length: line.length });
          
          // If line has tabs OR (has date AND digits) OR (has game words AND digits), treat as game data
          if (hasTabs || (hasDate && hasDigits) || (hasGameWords && hasDigits)) {
            // This is game data
            console.log(`[parseRows] Parsing game data line: "${line}"`);
            const parsed = parseLedgerLoose(line);
            console.log(`[parseRows] Parsed result:`, parsed);
            
            if (parsed.date_et && parsed.result_digits) {
              try {
                const normalizedDate = parseDateLoose(parsed.date_et);
                const entry = {
                  jurisdiction: currentJurisdiction || 'Unknown',
                  game: parsed.game,
                  date_et: normalizedDate,
                  session: parsed.session,
                  result_digits: parsed.result_digits
                };
                processedEntries.push(entry);
                console.log(`[parseRows] Added entry:`, entry);
              } catch (dateError) {
                console.error(`[parseRows] Date parsing failed for line: "${line}"`, dateError);
                console.error(`[parseRows] Raw date_et value:`, parsed.date_et);
              }
            } else {
              console.warn(`[parseRows] Skipping line - missing date or result:`, {
                line,
                parsed,
                hasDate: !!parsed.date_et,
                hasResult: !!parsed.result_digits
              });
            }
          } else if (!hasDate && !hasDigits && !hasTabs && line.length > 0) {
            // This is likely a jurisdiction line
            currentJurisdiction = line;
            console.log(`[parseRows] Set jurisdiction: "${currentJurisdiction}"`);
          } else {
            console.log(`[parseRows] Skipping line - no recognizable pattern: "${line}"`);
          }
        }
        
        console.log(`[parseRows] Final processed entries count: ${processedEntries.length}`);
        
        // Convert processed entries back to row format for compatibility
        const rows = processedEntries.map(entry => [
          entry.jurisdiction,
          entry.game,
          entry.date_et,
          entry.session,
          entry.result_digits
        ]);
        
        return { 
          headers: ['jurisdiction', 'game', 'date_et', 'session', 'result_digits'], 
          rows, 
          original: processedEntries.map(e => `${e.jurisdiction}\t${e.game}\t${e.date_et}\t${e.session}\t${e.result_digits}`)
        };
      }
    }
    
    // Standard processing for other import types
    const first = lines[0];
    const hasHeader = inferHasHeader(first);
    const headers = hasHeader ? splitFlexible(first) : [];
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = dataLines.map(l => splitFlexible(l));
    return { headers, rows, original: dataLines };
  }, [inferHasHeader, splitFlexible, importType]);

  const deriveComboSet = useCallback((combo: string | undefined): string | undefined => {
    if (!combo) return undefined;
    const digits = combo.replace(/[^0-9]/g, '').split('');
    if (digits.length !== 3) return undefined;
    const sorted = digits.sort();
    return `{${sorted.join(',')}}`;
  }, []);

  const numberify = (s: any): number => {
    const t = String(s ?? '').replace(/\u00A0/g, ' ').replace(/,/g, '').trim();
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const parseDateLoose = (s: string): string => {
    const trimmed = s.replace(/\u00A0/g, ' ').trim();

    console.log(`[parseDateLoose] Processing: "${trimmed}"`);

    if (!trimmed) {
      throw new Error(`Invalid date format: empty string`);
    }

    // YYYY-MM-DD already
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      console.log(`[parseDateLoose] Already in YYYY-MM-DD format: ${trimmed}`);
      return trimmed;
    }

    // Handle "Fri, Sep 26, 2025" format (with day of week)
    const dowMon = trimmed.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
    if (dowMon) {
      const month = dowMon[2];
      const day = dowMon[3];
      const year = dowMon[4];
      const dateStr = `${month} ${day}, ${year}`;
      console.log(`[parseDateLoose] Day match - constructing: "${dateStr}"`);
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const result = d.toISOString().split('T')[0];
        console.log(`[parseDateLoose] Day match success: ${result}`);
        return result;
      }
    }

    // Handle "Sep 26, 2025" format (without day of week)
    const mon = trimmed.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
    if (mon) {
      const month = mon[1];
      const day = mon[2];
      const year = mon[3];
      const dateStr = `${month} ${day}, ${year}`;
      console.log(`[parseDateLoose] Month match - constructing: "${dateStr}"`);
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const result = d.toISOString().split('T')[0];
        console.log(`[parseDateLoose] Month match success: ${result}`);
        return result;
      }
    }

    // YYYY[-/]MM[-/]DD
    const isoMatch = trimmed.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (isoMatch) {
      const dateStr = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
      console.log(`[parseDateLoose] ISO match - constructing: "${dateStr}"`);
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const result = d.toISOString().split('T')[0];
        console.log(`[parseDateLoose] ISO match success: ${result}`);
        return result;
      }
    }

    // MM/DD/YYYY
    const usMatch = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (usMatch) {
      const dateStr = `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
      console.log(`[parseDateLoose] US format match - constructing: "${dateStr}"`);
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const result = d.toISOString().split('T')[0];
        console.log(`[parseDateLoose] US format success: ${result}`);
        return result;
      }
    }

    // Try direct parsing as fallback
    console.log(`[parseDateLoose] Trying direct parsing of: "${trimmed}"`);
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const result = d.toISOString().split('T')[0];
      console.log(`[parseDateLoose] Direct parsing success: ${result}`);
      return result;
    }

    console.log(`[parseDateLoose] All parsing methods failed for: "${trimmed}"`);
    throw new Error(`Invalid date format: "${trimmed}". Expected formats: "Fri, Sep 26, 2025" or "Sep 26, 2025" or "2025-09-26"`);
  };

  const parseLedgerLoose = (line: string) => {
    console.log(`[parseLedgerLoose] Processing line: "${line}"`);
    
    // Handle the exact format from the sample data:
    // "Pick 3\tFri, Sep 26, 2025\t4-0-7"
    // Split by tabs first, then by multiple spaces as fallback
    let parts = line.split('\t').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      // Fallback to splitting by multiple spaces
      parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
    }
    
    console.log(`[parseLedgerLoose] Split parts:`, parts);
    
    let game = '';
    let dateStr = '';
    let resultDigits = '';
    let session: 'midday' | 'evening' = 'midday';
    
    if (parts.length >= 3) {
      // Format: Game \t Date \t Result (with possible extra info)
      game = parts[0];
      dateStr = parts[1];
      let resultPart = parts[2];
      
      // Handle additional parts that might contain extra info like "Fireball: 8"
      if (parts.length > 3) {
        // Join all remaining parts as they might be part of the result
        resultPart = parts.slice(2).join(' ');
      }
      
      // Extract digits from result (handle formats like "4-0-7", "4 0 7", "407")
      // Also handle formats with extra info like "4-0-7, Fireball: 8"
      const digitMatch = resultPart.match(/(\d)[-\s]?(\d)[-\s]?(\d)/);
      if (digitMatch) {
        resultDigits = `${digitMatch[1]}${digitMatch[2]}${digitMatch[3]}`;
      }
      
      // Determine session from game name
      const gameLower = game.toLowerCase();
      if (gameLower.includes('evening') || gameLower.includes('night')) {
        session = 'evening';
      } else if (gameLower.includes('midday') || gameLower.includes('day') || gameLower.includes('morning')) {
        session = 'midday';
      }
      
    } else if (parts.length === 2) {
      // Could be: Game + "Date Result" combined
      game = parts[0];
      const combined = parts[1];
      
      // Try to extract date and result from combined string
      const dateMatch = combined.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i) ||
                       combined.match(/[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i);
      
      if (dateMatch) {
        dateStr = dateMatch[0];
        const remaining = combined.replace(dateMatch[0], '').trim();
        
        // Extract digits from remaining part
        const digitMatch = remaining.match(/(\d)[-\s]?(\d)[-\s]?(\d)/);
        if (digitMatch) {
          resultDigits = `${digitMatch[1]}${digitMatch[2]}${digitMatch[3]}`;
        }
      }
      
      // Determine session from game name
      const gameLower = game.toLowerCase();
      if (gameLower.includes('evening') || gameLower.includes('night')) {
        session = 'evening';
      } else if (gameLower.includes('midday') || gameLower.includes('day') || gameLower.includes('morning')) {
        session = 'midday';
      }
      
    } else if (parts.length === 1) {
      // Single part - try to parse everything from one string
      const fullLine = parts[0] || line;
      
      // Extract date first
      const dateMatch = fullLine.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i) ||
                       fullLine.match(/[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i);
      
      if (dateMatch) {
        dateStr = dateMatch[0];
        let remaining = fullLine.replace(dateMatch[0], '').trim();
        
        // Extract digits
        const digitMatch = remaining.match(/(\d)[-\s]?(\d)[-\s]?(\d)/);
        if (digitMatch) {
          resultDigits = `${digitMatch[1]}${digitMatch[2]}${digitMatch[3]}`;
          remaining = remaining.replace(digitMatch[0], '').trim();
        }
        
        // What's left should be the game name
        game = remaining || 'Pick 3';
        
        // Determine session from game name
        const gameLower = game.toLowerCase();
        if (gameLower.includes('evening') || gameLower.includes('night')) {
          session = 'evening';
        } else if (gameLower.includes('midday') || gameLower.includes('day') || gameLower.includes('morning')) {
          session = 'midday';
        }
      }
    }
    
    console.log(`[parseLedgerLoose] Parsed result:`, {
      game,
      date_et: dateStr,
      session,
      result_digits: resultDigits
    });
    
    return {
      jurisdiction: '', // Will be set by the calling code
      game: game || 'Pick 3',
      date_et: dateStr,
      session,
      result_digits: resultDigits
    };
  };

  const horizonValid = useMemo(() => /^H(0[1-9]|10)Y$/.test(horizonLabel), [horizonLabel]);
  const scopeValid = useMemo(() => ['midday', 'evening', 'allday'].includes(scope), [scope]);

  const toCanonicalHorizon = useCallback((h: string): HorizonLabel | null => {
    const upper = String(h ?? '').toUpperCase().trim();
    const m = upper.match(/^H0*([0-9]{1,2})Y$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) return null;
    const canon = `H${String(n).padStart(2, '0')}Y` as HorizonLabel;
    return canon;
  }, []);

  const { data: coverageSet, refetch: refetchCoverage } = useQuery<{ [h in HorizonLabel]?: boolean }>({
    queryKey: ['horizon_coverage', importType, classId, scope],
    queryFn: async () => {
      try {
        const table = importType === 'pair_history' ? 'datasets_pair' : 'datasets_box';
        const classFilter = importType === 'pair_history' ? `&class_id=eq.${classId}` : `&class_id=eq.1`;
        const base = `/rest/v1/${table}?select=horizon_label&scope=eq.${encodeURIComponent(scope)}${classFilter}&deleted_at=is.null&limit=1000`;
        const rows = await fetchFromSupabase<Array<{ horizon_label: string }>>({ path: base });
        const s: { [h in HorizonLabel]?: boolean } = {};
        rows.forEach(r => {
          const canon = toCanonicalHorizon(r?.horizon_label ?? '');
          if (canon) s[canon] = true;
        });
        return s;
      } catch (err) {
        try {
          const table = importType === 'pair_history' ? 'datasets_pair' : 'datasets_box';
          const classFilter = importType === 'pair_history' ? `&class_id=eq.${classId}` : `&class_id=eq.1`;
          const base = `/rest/v1/${table}?select=horizon_label&scope=eq.${encodeURIComponent(scope)}${classFilter}&limit=1000`;
          const rows = await fetchFromSupabase<Array<{ horizon_label: string }>>({ path: base });
          const s: { [h in HorizonLabel]?: boolean } = {};
          rows.forEach(r => {
            const canon = toCanonicalHorizon(r?.horizon_label ?? '');
            if (canon) s[canon] = true;
          });
          return s;
        } catch (e2) {
          console.log('coverage fetch failed', e2);
          return {} as { [h in HorizonLabel]?: boolean };
        }
      }
    },
    staleTime: 3000,
  });

  const validateData = () => {
    setIsValidating(true);
    setRestErrorText(null);
    const errors: ValidationError[] = [];

    if (!csvData.trim()) {
      errors.push({ message: 'No data provided' });
    } else {
      const { headers, rows, original } = parseRows(csvData);
      if (rows.length < 1) {
        errors.push({ message: 'Data must include at least one row' });
      }

      if (importType === 'box_history' || importType === 'daily_input') {
        const haveHeaders = headers.length > 0;
        const normSet = new Set(headers.map(h => normalizeHeader(h)));
        const hasCombo = normSet.has('combo') || normSet.has('comboset');
        const hasTimes = normSet.has('timesdrawn');
        const hasLastSeen = normSet.has('lastseen');
        const hasDs = normSet.has('drawssince');

        if (!haveHeaders) {
          const first = rows[0] ?? [];
          if (first.length < 3) {
            errors.push({ message: 'Unable to infer columns. Please include at least Combo, TimesDrawn, LastSeen, DrawsSince.' });
          }
        } else {
          const missing: string[] = [];
          if (!hasCombo) missing.push('Combo or ComboSet');
          if (!hasTimes) missing.push('TimesDrawn');
          if (!hasLastSeen) missing.push('LastSeen');
          if (!hasDs) missing.push('DrawsSince');
          if (missing.length > 0) errors.push({ message: `Missing required headers: ${missing.join(', ')}` });
        }
      } else if (importType === 'pair_history') {
        const normSet = new Set(headers.map(h => normalizeHeader(h)));
        const required = ['pair', 'timesdrawn', 'lastseen', 'drawssince'];
        const missing = required.filter(h => !normSet.has(h));
        if (missing.length > 0 && headers.length > 0) {
          errors.push({ message: `Missing required headers: ${missing.join(', ')}` });
        }
      } else if (importType === 'ledger') {
        const normSet = new Set(headers.map(h => normalizeHeader(h)));
        const required = ['jurisdiction', 'game', 'date_et', 'session', 'result_digits'];
        const missing = required.filter(h => !normSet.has(h));
        if (missing.length > 0 && headers.length > 0) {
          errors.push({ message: `Missing required headers: ${missing.join(', ')}` });
        }
        
        if (headers.length > 0) {
          const idxMap: Record<string, number> = {};
          headers.forEach((h, i) => { idxMap[normalizeHeader(h)] = i; });
          const badDates: number[] = [];
          rows.forEach((r, i) => {
            const raw = String(r[idxMap['date_et']] ?? '').trim();
            try {
              const parsed = parseDateLoose(raw);
              if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
                badDates.push(i + 1);
              }
            } catch (e) {
              badDates.push(i + 1);
            }
          });
          if (badDates.length > 0) {
            errors.push({ message: `Invalid DateET format on rows: ${badDates.slice(0, 5).join(', ')} (expected YYYY-MM-DD)` });
          }
        }
      }

      const offenders: string[] = [];
      if (errors.length === 0) {
        const normSet = new Set(headers.map(h => normalizeHeader(h)));
        const isBox = importType === 'box_history' || importType === 'daily_input';
        const isPair = importType === 'pair_history';
        if (isBox || isPair) {
          const idxMap: Record<string, number> = {};
          headers.forEach((h, i) => { idxMap[normalizeHeader(h)] = i; });
          rows.forEach((r, i) => {
            if (offenders.length >= 3) return;
            const td = numberify(r[idxMap['timesdrawn']]);
            const ds = numberify(r[idxMap['drawssince']]);
            try {
              const last = parseDateLoose(String(r[idxMap['lastseen']] ?? ''));
              if (!Number.isInteger(td) || !Number.isInteger(ds) || ds < 0) {
                offenders.push(`Row ${i + 1}: invalid TimesDrawn/DrawsSince`);
              }
              if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) {
                offenders.push(`Row ${i + 1}: invalid LastSeen date`);
              }
            } catch (e) {
              offenders.push(`Row ${i + 1}: invalid LastSeen date`);
            }
            if (isPair) {
              const p = String(r[idxMap['pair']] ?? '').padStart(2, '0');
              if (!/^\d{2}$/.test(p)) offenders.push(`Row ${i + 1}: Pair must be 00..99`);
            }
          });
        }
      }
      offenders.slice(0, 3).forEach(m => errors.push({ message: m }));
    }

    setValidationErrors(errors);
    setIsValidating(false);
  };

  const buildPreview = useCallback(() => {
    try {
      const { headers, rows } = parseRows(csvData);
      const normHeaders = headers.map(normalizeHeader);
      const idx = (n: string) => normHeaders.indexOf(n);
      if (importType === 'box_history' || importType === 'daily_input') {
        const list = rows.slice(0, 20).map(r => {
          const combo = r[idx('combo')] ?? '';
          const csHeader = r[idx('comboset')] ?? '';
          const cs = csHeader || deriveComboSet(String(combo));
          return {
            key: cs ?? String(combo),
            times_drawn: numberify(r[idx('timesdrawn')]),
            last_seen: parseDateLoose(String(r[idx('lastseen')] ?? '')),
            draws_since: numberify(r[idx('drawssince')])
          };
        });
        setNormalizedPreview(list);
      } else if (importType === 'pair_history') {
        const list = rows.slice(0, 20).map(r => ({
          key: String(r[idx('pair')] ?? '').padStart(2, '0'),
          times_drawn: numberify(r[idx('timesdrawn')]),
          last_seen: parseDateLoose(String(r[idx('lastseen')] ?? '')),
          draws_since: numberify(r[idx('drawssince')])
        }));
        setNormalizedPreview(list);
      } else if (importType === 'ledger') {
        const list = rows.slice(0, 20).map(r => ({
          jurisdiction: String(r[idx('jurisdiction')] ?? ''),
          game: String(r[idx('game')] ?? ''),
          date_et: parseDateLoose(String(r[idx('date_et')] ?? '')),
          session: String(r[idx('session')] ?? ''),
          result_digits: String(r[idx('result_digits')] ?? '')
        }));
        setNormalizedPreview(list);
      }
    } catch (e) {
      console.log('preview error', e);
    }
  }, [csvData, importType, parseRows, normalizeHeader, deriveComboSet]);

  const handleCommit = async () => {
    if (validationErrors.length === 0 && csvData.trim()) {
      try {
        if (!horizonValid || !scopeValid) {
          const msg = 'Horizon must be H01Y…H10Y (zero, one, Y).';
          setValidationErrors([{ message: msg }]);
          if (Platform.OS !== 'web') Alert.alert('Invalid configuration', msg);
          return;
        }

        const parsed = parseRows(csvData);
        const headers = parsed.headers;
        const dataRows = parsed.rows;
        const originalLines = parsed.original;
        
        if (importType === 'box_history' || importType === 'pair_history') {
          const rows = dataRows.map((values) => {
            const rowData: Record<string, any> = {};
            if (headers.length > 0) {
              headers.forEach((header, idx) => {
                const key = normalizeHeader(header);
                rowData[key] = values[idx];
              });
            } else {
              if (importType === 'box_history') {
                rowData.combo = values[0];
                rowData.timesdrawn = values[1];
                if (values.length >= 5) {
                  rowData.lastseen = values[3];
                  rowData.drawssince = values[4];
                } else if (values.length === 4) {
                  rowData.lastseen = values[2];
                  rowData.drawssince = values[3];
                } else {
                  rowData.lastseen = values[2] ?? '';
                  rowData.drawssince = values[3] ?? '';
                }
              } else {
                rowData.pair = values[0];
                rowData.timesdrawn = values[1];
                rowData.lastseen = values[2];
                rowData.drawssince = values[3];
              }
            }
            
            if (importType === 'box_history') {
              const cs = rowData.comboset || deriveComboSet(String(rowData.combo ?? ''));
              return {
                key: cs ?? String(rowData.combo ?? ''),
                timesDrawn: numberify(rowData.timesdrawn),
                lastSeen: parseDateLoose(String(rowData.lastseen ?? '')),
                drawsSince: numberify(rowData.drawssince)
              };
            } else {
              return {
                key: String(rowData.pair ?? '').padStart(2, '0'),
                timesDrawn: numberify(rowData.timesdrawn),
                lastSeen: parseDateLoose(String(rowData.lastseen ?? '')),
                drawsSince: numberify(rowData.drawssince)
              };
            }
          });
          
          const payload = { type: importType, classId, horizonLabel, scope, rows } as const;
          lastRequestRef.current = { kind: 'history', payload };
          const summary = await importHistory(payload as any);
          if (summary) {
            setShowSummary(true);
            await refetchCoverage();
          }
        } else if (importType === 'daily_input') {
          const { headers, rows } = parseRows(csvData);
          const normHeaders = headers.map(normalizeHeader);
          const idx = (n: string) => normHeaders.indexOf(n);
          const combos: string[] = rows.map((r) => {
            const combo = String(r[idx('combo')] ?? r[idx('comboset')] ?? r[0] ?? '').trim();
            const cs = idx('comboset') >= 0 ? String(r[idx('comboset')]) : deriveComboSet(combo);
            return cs || combo;
          }).filter(Boolean);
          const summary = await importDailyInput({ scope, combos });
          if (summary) {
            setShowSummary(true);
            await refetchCoverage();
          }
        } else if (importType === 'ledger') {
          const entriesRaw = dataRows.map((values, idx) => {
            const rowData: Record<string, any> = {};
            if (headers.length > 0) {
              headers.forEach((header, hIdx) => {
                const key = normalizeHeader(header);
                rowData[key] = values[hIdx];
              });
            } else {
              const loose = parseLedgerLoose(originalLines[idx] ?? values.join(' '));
              rowData['jurisdiction'] = loose.jurisdiction;
              rowData['game'] = loose.game;
              rowData['date_et'] = loose.date_et;
              rowData['session'] = loose.session;
              rowData['result_digits'] = loose.result_digits;
            }
            
            return {
              jurisdiction: String(rowData.jurisdiction ?? ''),
              game: String(rowData.game ?? ''),
              date_et: parseDateLoose(String(rowData.date_et ?? '')),
              session: (String(rowData.session ?? 'midday') as 'midday' | 'evening'),
              result_digits: String(rowData.result_digits ?? '').replace(/[^0-9]/g, '')
            };
          });
          
          const seen = new Set<string>();
          const entries = entriesRaw.filter(e => {
            const k = `${e.jurisdiction}|${e.date_et}|${e.session}|${e.result_digits}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

          const payload = { scope, entries } as const;
          lastRequestRef.current = { kind: 'ledger', payload };
          const summary = await importLedger(payload as any);
          if (summary) {
            setShowSummary(true);
            await refetchCoverage();
          }
        }
        
        setShowSummary(true);
      } catch (error) {
        console.log('Import error:', error);
        const msg = String(error instanceof Error ? error.message : String(error));
        setRestErrorText(msg);
        if (Platform.OS === 'web') {
          console.error('Import Failed:\n' + msg);
        } else {
          Alert.alert(
            'Import Failed',
            msg,
            [{ text: 'OK' }]
          );
        }
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Import Type</Text>
            <TouchableOpacity
              style={styles.generateBtn}
              onPress={async () => {
                try {
                  setIsRegenLoading(true);
                  const res = await regenerateSlate(scope);
                  setRegenState({ status: res.status, message: res.message });
                  setRegenOpen(true);
                } catch (e) {
                  setRegenState({ status: 'error', message: 'Failed to trigger regeneration' });
                  setRegenOpen(true);
                } finally {
                  setIsRegenLoading(false);
                }
              }}
              disabled={isRegenLoading}
              testID="generate-slate-import"
            >
              <RefreshCw size={16} color={theme.colors.text} />
              <Text style={styles.generateBtnText}>{isRegenLoading ? 'Generating…' : 'Generate Slate'}</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.typeGrid}>
            {(['box_history', 'pair_history', 'daily_input', 'ledger'] as ImportType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeCard,
                  importType === type && styles.typeCardActive,
                ]}
                onPress={() => {
                  if (type === 'ledger') {
                    router.push('/ledger-import' as any);
                  } else {
                    setImportType(type);
                  }
                }}
              >
                <Text style={[
                  styles.typeText,
                  importType === type && styles.typeTextActive,
                ]}>
                  {type.replace('_', ' ').toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {(importType === 'box_history' || importType === 'pair_history') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Configuration</Text>
            
            <View style={styles.configRow}>
              <Text style={styles.configLabel}>Scope:</Text>
              <View style={styles.configOptions}>
                {(['midday', 'evening', 'allday'] as Scope[]).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.configOption,
                      scope === s && styles.configOptionActive,
                    ]}
                    onPress={() => setScope(s)}
                  >
                    <Text style={[
                      styles.configOptionText,
                      scope === s && styles.configOptionTextActive,
                    ]}>
                      {SCOPES[s as keyof typeof SCOPES]?.label || s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.configRow}>
              <Text style={styles.configLabel}>Horizon:</Text>
              <View style={styles.configOptions}>
                {(['H01Y', 'H02Y', 'H03Y', 'H04Y', 'H05Y', 'H06Y', 'H07Y', 'H08Y', 'H09Y', 'H10Y'] as HorizonLabel[]).map((h) => {
                  const covered = !!coverageSet?.[h];
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[
                        styles.configOption,
                        horizonLabel === h && styles.configOptionActive,
                      ]}
                      onPress={() => setHorizonLabel(h)}
                      testID={`horizon-${h}`}
                    >
                      <Text style={[
                        styles.configOptionText,
                        horizonLabel === h && styles.configOptionTextActive,
                      ]}>
                        {h}
                      </Text>
                      <Text style={styles.coverageChip(covered)}>{covered ? '✓' : '⌛'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            
            {importType === 'pair_history' && (
              <View style={styles.configRow}>
                <Text style={styles.configLabel}>Class ID:</Text>
                <View style={styles.configOptions}>
                  {Object.keys(PAIR_CLASSES)
                    .map((k) => Number(k))
                    .filter((id) => id >= 2 && id <= 11)
                    .map((id) => (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.configOption,
                          classId === id && styles.configOptionActive,
                        ]}
                        onPress={() => setClassId(id)}
                        testID={`pair-class-${id}`}
                      >
                        <Text style={[
                          styles.configOptionText,
                          classId === id && styles.configOptionTextActive,
                        ]}>
                          {id} - {(PAIR_CLASSES as any)[id]?.label || 'Unknown'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Input</Text>
          <Text style={styles.helperText}>
            Paste CSV data with appropriate headers
          </Text>
          
          <TextInput
            style={styles.textInput}
            multiline
            placeholder={getPlaceholder(importType)}
            placeholderTextColor={theme.colors.textTertiary}
            value={csvData}
            onChangeText={(t) => { setCsvData(t); setNormalizedPreview([]); }}
            keyboardAppearance="dark"
          />
        </View>

        {validationErrors.length > 0 && (
          <View style={styles.errorContainer}>
            {validationErrors.map((error, index) => (
              <View key={index} style={styles.errorItem}>
                <AlertCircle size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{error.message}</Text>
              </View>
            ))}
          </View>
        )}

        {csvData.trim() && validationErrors.length === 0 && (
          <View style={styles.successContainer}>
            <CheckCircle size={16} color={theme.colors.success} />
            <Text style={styles.successText}>Data format valid</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title="Validate"
            onPress={validateData}
            variant="secondary"
            loading={isValidating}
            disabled={!csvData.trim()}
          />
          <Button
            title="Commit Import"
            onPress={handleCommit}
            disabled={validationErrors.length > 0 || !csvData.trim()}
            loading={isLoading}
          />
        </View>

        {csvData.trim().length > 0 && (
          <View style={styles.section} testID="validate-csv-card">
            <Text style={styles.sectionTitle}>Validate CSV</Text>
            <View style={styles.actions}>
              <Button title="Preview Normalized" onPress={buildPreview} variant="secondary" />
            </View>
            {normalizedPreview.length > 0 && (
              <View style={styles.previewBox}>
                {normalizedPreview.map((row, i) => (
                  <Text key={i} style={styles.previewText}>{JSON.stringify(row)}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {showSummary && (
        <View style={styles.modalOverlay} testID="import-summary-modal">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <FileText size={18} color={theme.colors.primary} />
              <Text style={styles.modalTitle}>Import committed</Text>
            </View>
            {lastImportSummary ? (
              <View style={styles.summaryGrid}>
                <Text style={styles.summaryRow}>Type: {lastImportSummary.type}</Text>
                {lastImportSummary.class_id !== undefined && (
                  <Text style={styles.summaryRow}>Class ID: {lastImportSummary.class_id}</Text>
                )}
                {lastImportSummary.horizon_label && (
                  <Text style={styles.summaryRow}>Horizon: {lastImportSummary.horizon_label}</Text>
                )}
                {lastImportSummary.scope && (
                  <Text style={styles.summaryRow}>Scope: {SCOPES[lastImportSummary.scope as keyof typeof SCOPES]?.label || lastImportSummary.scope}</Text>
                )}
                <Text style={styles.summaryRow}>Accepted: {lastImportSummary.accepted}</Text>
                <Text style={styles.summaryRow}>Rejected: {lastImportSummary.rejected}</Text>
                <Text style={styles.summaryRow}>Fixed: {lastImportSummary.fixed}</Text>
                {lastImportSummary.p99_cap !== undefined && (
                  <Text style={styles.summaryRow}>p99_cap: {lastImportSummary.p99_cap}</Text>
                )}
                {lastImportSummary.first_seen && (
                  <Text style={styles.summaryRow}>first_seen: {lastImportSummary.first_seen}</Text>
                )}
                {lastImportSummary.last_seen && (
                  <Text style={styles.summaryRow}>last_seen: {lastImportSummary.last_seen}</Text>
                )}
                {Array.isArray(lastImportSummary.warnings) && lastImportSummary.warnings.length > 0 && (
                  <Text style={styles.summaryRow}>Warnings: {lastImportSummary.warnings.join(', ')}</Text>
                )}
              </View>
            ) : (
              <Text style={styles.summaryRow}>Summary not available</Text>
            )}
            <View style={styles.modalActions}>
              <Button
                title="View details"
                onPress={() => {
                  setShowSummary(false);
                  router.replace('/(tabs)/admin-imports' as any);
                }}
                variant="secondary"
                testID="view-import-details"
              />
              <Button
                title="Done"
                onPress={() => {
                  setShowSummary(false);
                  router.back();
                }}
                testID="close-import-summary"
              />
            </View>
          </View>
        </View>
      )}

      {!!restErrorText && (
        <View style={styles.modalOverlay} testID="rest-error-modal">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <AlertCircle size={18} color={theme.colors.error} />
              <Text style={styles.modalTitle}>Import error</Text>
            </View>
            <ScrollView style={styles.errorScroll}>
              <Text style={styles.errorTextMono}>{restErrorText}</Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.copyBtn} onPress={async () => {
                if (!restErrorText) return;
                const ok = await copyTextSafe(restErrorText);
                if (!ok) {
                  if (Platform.OS === 'web') {
                    console.error('Copy blocked by browser. Select the text and copy manually.');
                  } else {
                    Alert.alert('Copy failed', 'Select the text and copy manually.');
                  }
                }
              }}>
                <Copy size={16} color={theme.colors.text} />
                <Text style={styles.copyText}>Copy error</Text>
              </TouchableOpacity>
              <Button title="Retry" onPress={async () => {
                try {
                  if (!lastRequestRef.current) return;
                  setRestErrorText(null);
                  if (lastRequestRef.current.kind === 'history') {
                    await importHistory(lastRequestRef.current.payload);
                  } else {
                    await importLedger(lastRequestRef.current.payload);
                  }
                  setShowSummary(true);
                  await refetchCoverage();
                } catch (e) {
                  const msg2 = String(e instanceof Error ? e.message : e);
                  setRestErrorText(msg2);
                }
              }} />
              <Button title="Close" onPress={() => setRestErrorText(null)} />
            </View>
          </View>
        </View>
      )}

      <Modal transparent visible={regenOpen} animationType="fade" onRequestClose={() => setRegenOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="regen-outcome-sheet-import">
            <Text style={styles.modalTitle}>Regenerate Slate</Text>
            <Text style={styles.modalBody}>{regenState?.message ?? '—'}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRegenOpen(false)} style={styles.modalBtnSecondary}>
                <Text style={styles.modalBtnSecondaryText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getPlaceholder(type: ImportType): string {
  switch (type) {
    case 'box_history':
    case 'daily_input':
      return 'Combo,ComboSet,TimesDrawn,LastSeen,DrawsSince\n123,{1,2,3},45,2024-01-15,3\n— Or paste space/tab separated without headers: 123    45    2024-01-15    3';
    case 'pair_history':
      return 'Pair,TimesDrawn,LastSeen,DrawsSince\n12,45,2024-01-15,3';
    case 'ledger':
      return 'jurisdiction,game,date_et,session,result_digits\nArizona,Pick 3,Fri Sep 26 2025,midday,407\n\nOr paste multi-line format:\nArizona\nPick 3\tFri, Sep 26, 2025\t4-0-7\nArkansas\nCash 3 Midday\tFri, Sep 26, 2025\t2-0-8';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold' as const,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  helperText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  typeGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.sm,
  },
  typeCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '20',
  },
  typeText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  typeTextActive: {
    color: theme.colors.primary,
  },
  classGrid: {
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
  },
  classCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 120,
  },
  classLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600' as const,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  classExample: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.sm,
    minHeight: 200,
    fontFamily: 'Courier',
  },
  errorContainer: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.error + '20',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  errorItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.error,
    flex: 1,
  },
  errorScroll: {
    maxHeight: 260,
    marginBottom: theme.spacing.md,
  },
  errorTextMono: {
    fontFamily: 'Courier',
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.error,
  },
  successContainer: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.success + '20',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.success,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  successText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.success,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  configRow: {
    marginBottom: theme.spacing.md,
  },
  configLabel: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600' as const,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  configOptions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.sm,
  },
  configOption: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 80,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing.sm,
  },
  configOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '20',
  },
  configOptionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '500' as const,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  configOptionTextActive: {
    color: theme.colors.primary,
  },
  coverageChip: (covered: boolean) => ({
    fontSize: theme.typography.fontSize.sm,
    color: covered ? theme.colors.success : theme.colors.textSecondary,
    fontWeight: '700' as const,
  }),
  modalOverlay: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#00000088',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing.lg,
  },
  modalBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center' as const, justifyContent: 'center' as const, padding: theme.spacing.lg },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700' as const,
    color: theme.colors.text,
  },
  summaryGrid: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  modalBody: { color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.md, marginTop: theme.spacing.xs },
  modalBtnSecondary: { paddingHorizontal: theme.spacing.md, paddingVertical: 10, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  modalBtnSecondaryText: { color: theme.colors.text },
  summaryRow: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    justifyContent: 'flex-end' as const,
  },
  previewBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  previewText: {
    fontFamily: 'Courier',
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  copyBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
  },
  copyText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.sm,
  },
  generateBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  generateBtnText: { color: theme.colors.text, fontWeight: '700' as const },
});
