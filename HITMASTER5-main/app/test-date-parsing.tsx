import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { Button } from '@/components/Button';

export default function TestDateParsingScreen() {
  const [testInput, setTestInput] = useState('Sep 26, 2025');
  const [results, setResults] = useState<string[]>([]);

  const safeDateOrNull = (value: string | null | undefined): string | null => {
    const s = String(value ?? '').trim();
    console.log(`safeDateOrNull input: "${s}"`);
    if (!s) return null;
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      console.log('Already in YYYY-MM-DD format');
      return s;
    }
    
    // Handle common date formats from ledger data
    try {
      // Handle "Fri, Sep 26, 2025" format (with day of week)
      const dayMatch = s.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})/i);
      if (dayMatch) {
        console.log('Day match found:', dayMatch);
        const dateStr = `${dayMatch[2]} ${dayMatch[3]}, ${dayMatch[4]}`;
        console.log('Constructing Date with:', dateStr);
        const d = new Date(dateStr);
        console.log('Date object:', d, 'Valid:', !isNaN(d.getTime()));
        if (!isNaN(d.getTime())) {
          const result = d.toISOString().split('T')[0];
          console.log('Day match result:', result);
          return result;
        }
      }
      
      // Handle "Sep 26, 2025" format (without day of week)
      const monthMatch = s.match(/([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})/i);
      if (monthMatch) {
        console.log('Month match found:', monthMatch);
        const dateStr = `${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]}`;
        console.log('Constructing Date with:', dateStr);
        const d = new Date(dateStr);
        console.log('Date object:', d, 'Valid:', !isNaN(d.getTime()));
        if (!isNaN(d.getTime())) {
          const result = d.toISOString().split('T')[0];
          console.log('Month match result:', result);
          return result;
        }
      }
      
      // Handle "YYYY-MM-DD" or "YYYY/MM/DD" format
      const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        console.log('ISO match found:', isoMatch);
        const d = new Date(`${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }
      
      // Handle "MM/DD/YYYY" format
      const usMatch = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (usMatch) {
        console.log('US format match found:', usMatch);
        const d = new Date(`${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }
      
      // Try to parse any other format as a last resort
      console.log('Trying direct Date parsing');
      const d = new Date(s);
      console.log('Direct Date object:', d, 'Valid:', !isNaN(d.getTime()));
      if (!isNaN(d.getTime())) {
        const result = d.toISOString().split('T')[0];
        console.log('Direct parsing result:', result);
        return result;
      }
    } catch (e) {
      console.log('Date parsing failed in safeDateOrNull for:', s, 'Error:', e);
    }
    
    console.log('All parsing methods failed for:', s);
    return null;
  };

  const testDateParsing = () => {
    const testCases = [
      testInput,
      'Fri, Sep 26, 2025',
      'Sep 26, 2025',
      '2025-09-26',
      '09/26/2025',
      'Friday, September 26, 2025',
      'Fri,Sep 26,2025',
      'Fri, Sep 26, 2025',
      'Mon, Dec 31, 2024',
      'Sat, Sep 27, 2025',
      'invalid date'
    ];

    const newResults: string[] = [];
    
    testCases.forEach(testCase => {
      console.log(`Testing: "${testCase}"`);
      const result = safeDateOrNull(testCase);
      console.log(`Result: ${result || 'null'}`);
      newResults.push(`Input: "${testCase}" → Output: ${result || 'null'}`);
      
      // Also test direct Date constructor
      try {
        const directDate = new Date(testCase);
        const isValid = !isNaN(directDate.getTime());
        newResults.push(`  Direct Date("${testCase}"): ${isValid ? directDate.toISOString().split('T')[0] : 'Invalid'}`);
      } catch (e) {
        newResults.push(`  Direct Date("${testCase}"): Error - ${e}`);
      }
    });

    setResults(newResults);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Date Parsing Test</Text>
        
        <TextInput
          style={styles.input}
          value={testInput}
          onChangeText={setTestInput}
          placeholder="Enter date to test"
          placeholderTextColor={theme.colors.textTertiary}
        />
        
        <Button title="Test Date Parsing" onPress={testDateParsing} />
        
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Current date: {new Date().toISOString()}</Text>
          <Text style={styles.infoText}>Test case: "Sep 26, 2025"</Text>
          <Text style={styles.infoText}>Expected: 2025-09-26</Text>
        </View>
        
        {results.length > 0 && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Results:</Text>
            {results.map((result, index) => (
              <Text key={index} style={styles.resultText}>{result}</Text>
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
    padding: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold' as const,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.md,
    marginBottom: theme.spacing.md,
  },
  resultsContainer: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultsTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold' as const,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  resultText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontFamily: 'Courier',
    marginBottom: theme.spacing.xs,
  },
  infoBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.primary + '20',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  infoText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
});