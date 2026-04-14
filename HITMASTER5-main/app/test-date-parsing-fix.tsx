import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

export default function TestDateParsingFixScreen() {
  const [results, setResults] = useState<string[]>([]);

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

  const testDates = [
    'Fri, Sep 26, 2025',
    'Sep 26, 2025',
    'Fri Sep 26 2025',
    'Sep 26 2025',
    '2025-09-26',
    '9/26/2025',
    'Friday, September 26, 2025',
    'September 26, 2025'
  ];

  const runTests = () => {
    const newResults: string[] = [];
    
    testDates.forEach(dateStr => {
      try {
        const result = parseDateLoose(dateStr);
        newResults.push(`✅ "${dateStr}" → "${result}"`);
      } catch (error) {
        newResults.push(`❌ "${dateStr}" → Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    setResults(newResults);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.title}>Date Parsing Test</Text>
          
          <TouchableOpacity style={styles.button} onPress={runTests}>
            <Text style={styles.buttonText}>Run Tests</Text>
          </TouchableOpacity>
          
          {results.length > 0 && (
            <View style={styles.results}>
              <Text style={styles.resultsTitle}>Results:</Text>
              {results.map((result, index) => (
                <Text key={index} style={styles.resultText}>
                  {result}
                </Text>
              ))}
            </View>
          )}
        </View>
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
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold' as const,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
    marginBottom: theme.spacing.lg,
  },
  buttonText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600' as const,
  },
  results: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultsTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600' as const,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  resultText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    fontFamily: 'Courier',
  },
});