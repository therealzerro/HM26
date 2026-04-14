import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { Button } from '@/components/Button';

const sampleData = `Arizona
Pick 3	Fri, Sep 26, 2025	4-0-7
Arkansas
Cash 3 Midday	Fri, Sep 26, 2025	2-0-8
Cash 3 Evening	Fri, Sep 26, 2025	3-0-7
California
Daily 3 Midday	Fri, Sep 26, 2025	6-0-3
Daily 3 Evening	Fri, Sep 26, 2025	1-4-9
Colorado
Pick 3 Midday	Fri, Sep 26, 2025	7-2-6
Pick 3 Evening	Fri, Sep 26, 2025	9-3-5
Connecticut
Play 3 Day	Fri, Sep 26, 2025	3-5-0, Wild Ball: 3
Play 3 Night	Fri, Sep 26, 2025	6-5-2, Wild Ball: 2`;

export default function TestLedgerParsingScreen() {
  const [testData, setTestData] = useState<string>(sampleData);
  const [results, setResults] = useState<any[]>([]);

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

  const testParsing = () => {
    const sanitized = testData.replace(/\u00A0/g, ' ');
    const lines = sanitized.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    
    const processedEntries: { jurisdiction: string; game: string; date_et: string; session: 'midday' | 'evening'; result_digits: string }[] = [];
    let currentJurisdiction = '';
    
    console.log(`[testParsing] Processing ${lines.length} lines for ledger data`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      console.log(`[testParsing] Line ${i}: "${line}"`);
      
      // Check if this line is a jurisdiction (no tabs, no dates, no digits pattern)
      const hasDate = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i.test(line) || 
                     /[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}/i.test(line);
      const hasDigits = /\d[-\s]?\d[-\s]?\d/.test(line);
      const hasTabs = line.includes('\t');
      
      console.log(`[testParsing] Line analysis:`, { hasDate, hasDigits, hasTabs, length: line.length });
      
      if (!hasDate && !hasDigits && !hasTabs && line.length > 0) {
        // This is likely a jurisdiction line
        currentJurisdiction = line;
        console.log(`[testParsing] Set jurisdiction: "${currentJurisdiction}"`);
      } else if (hasDate || hasDigits || hasTabs) {
        // This is game data
        console.log(`[testParsing] Parsing game data line: "${line}"`);
        const parsed = parseLedgerLoose(line);
        console.log(`[testParsing] Parsed result:`, parsed);
        
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
            console.log(`[testParsing] Added entry:`, entry);
          } catch (dateError) {
            console.error(`[testParsing] Date parsing failed for line: "${line}"`, dateError);
            console.error(`[testParsing] Raw date_et value:`, parsed.date_et);
          }
        } else {
          console.warn(`[testParsing] Skipping line - missing date or result:`, {
            line,
            parsed,
            hasDate: !!parsed.date_et,
            hasResult: !!parsed.result_digits
          });
        }
      } else {
        console.log(`[testParsing] Skipping line - no recognizable pattern: "${line}"`);
      }
    }
    
    console.log(`[testParsing] Final processed entries count: ${processedEntries.length}`);
    setResults(processedEntries);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test Ledger Parsing</Text>
          
          <TextInput
            style={styles.textInput}
            multiline
            placeholder="Paste ledger data here..."
            value={testData}
            onChangeText={setTestData}
            keyboardAppearance="dark"
          />
          
          <Button
            title="Test Parsing"
            onPress={testParsing}
          />
        </View>

        {results.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parsed Results ({results.length} entries)</Text>
            {results.map((entry, i) => (
              <View key={i} style={styles.resultItem}>
                <Text style={styles.resultText}>
                  {entry.jurisdiction} | {entry.game} | {entry.date_et} | {entry.session} | {entry.result_digits}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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
    marginBottom: theme.spacing.md,
  },
  resultItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    fontFamily: 'Courier',
  },
});