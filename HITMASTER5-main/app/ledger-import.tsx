import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle, Calendar, Clock } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { Button } from '@/components/Button';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';
import { Scope } from '@/types/core';
import { SCOPES } from '@/constants/pairClasses';
import { useRouter } from 'expo-router';

type Session = 'midday' | 'evening';

interface ParsedEntry {
  jurisdiction: string;
  game: string;
  result_digits: string;
}

export default function LedgerImportScreen() {
  const router = useRouter();
  const { importLedger, isLoading, lastImportSummary } = useDataIngestion();
  const { scope, setScope } = useScope();
  
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedSession, setSelectedSession] = useState<Session>('midday');
  const [rawData, setRawData] = useState<string>('');
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showSummary, setShowSummary] = useState<boolean>(false);

  const parseSimpleLedgerData = useCallback((data: string): ParsedEntry[] => {
    const lines = data.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    const entries: ParsedEntry[] = [];
    let currentJurisdiction = '';
    
    console.log(`[parseSimpleLedgerData] Processing ${lines.length} lines`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      console.log(`[parseSimpleLedgerData] Line ${i}: "${line}"`);
      
      // Look for 3-digit pattern anywhere in the line
      const digitMatch = line.match(/(\d)[-\s]?(\d)[-\s]?(\d)/);
      
      if (digitMatch) {
        // This line contains digits - it's a game result line
        if (!currentJurisdiction) {
          console.warn(`[parseSimpleLedgerData] Found digits but no jurisdiction set: "${line}"`);
          continue;
        }
        
        const resultDigits = `${digitMatch[1]}${digitMatch[2]}${digitMatch[3]}`;
        console.log(`[parseSimpleLedgerData] Found result digits: ${resultDigits}`);
        
        // Extract game name - everything before the first digit match
        let game = '';
        if (digitMatch.index !== undefined) {
          game = line.substring(0, digitMatch.index).trim();
          
          // If it's tab-separated, take the first part as the game name
          if (game.includes('\t')) {
            game = game.split('\t')[0].trim();
          }
          
          // Clean up common date patterns from game name
          game = game
            .replace(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}\s*$/i, '')
            .replace(/[A-Za-z]{3,}\s+\d{1,2},?\s*\d{4}\s*$/i, '')
            .replace(/\t+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        if (game && resultDigits.length === 3) {
          const entry: ParsedEntry = {
            jurisdiction: currentJurisdiction,
            game: game,
            result_digits: resultDigits
          };
          entries.push(entry);
          console.log(`[parseSimpleLedgerData] Added entry:`, entry);
        } else {
          console.warn(`[parseSimpleLedgerData] Skipping invalid entry:`, { game, resultDigits, line });
        }
      } else {
        // No digits found - this could be a jurisdiction line
        // Only set as jurisdiction if it doesn't look like a game name
        const looksLikeGameName = /^(Pick|Cash|Daily|Numbers|Play|Pega|Quotidienne|DC-)/i.test(line);
        
        if (!looksLikeGameName && line.length > 0) {
          currentJurisdiction = line;
          console.log(`[parseSimpleLedgerData] Set jurisdiction: "${currentJurisdiction}"`);
        } else {
          console.log(`[parseSimpleLedgerData] Skipping line (looks like game name or empty): "${line}"`);
        }
      }
    }
    
    console.log(`[parseSimpleLedgerData] Final parsed entries: ${entries.length}`);
    return entries;
  }, []);

  const validateAndParse = useCallback(() => {
    const errors: string[] = [];
    
    if (!rawData.trim()) {
      errors.push('No data provided');
      setValidationErrors(errors);
      setParsedEntries([]);
      return;
    }
    
    if (!selectedDate) {
      errors.push('Date is required');
    }
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      errors.push('Date must be in YYYY-MM-DD format');
    }
    
    try {
      const entries = parseSimpleLedgerData(rawData);
      
      if (entries.length === 0) {
        errors.push('No valid entries found in the data');
      }
      
      // Validate each entry
      entries.forEach((entry, index) => {
        if (!entry.jurisdiction) {
          errors.push(`Entry ${index + 1}: Missing jurisdiction`);
        }
        if (!entry.game) {
          errors.push(`Entry ${index + 1}: Missing game name`);
        }
        if (!/^\d{3}$/.test(entry.result_digits)) {
          errors.push(`Entry ${index + 1}: Invalid result digits "${entry.result_digits}" - must be exactly 3 digits`);
        }
      });
      
      setParsedEntries(entries);
    } catch (error) {
      errors.push(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
      setParsedEntries([]);
    }
    
    setValidationErrors(errors);
  }, [rawData, selectedDate, parseSimpleLedgerData]);

  const handleImport = async () => {
    if (validationErrors.length > 0 || parsedEntries.length === 0) {
      return;
    }
    
    try {
      // Convert parsed entries to the format expected by importLedger
      const entries = parsedEntries.map(entry => ({
        jurisdiction: entry.jurisdiction,
        game: entry.game,
        date_et: selectedDate, // Use the selected date
        session: selectedSession, // Use the selected session
        result_digits: entry.result_digits
      }));
      
      console.log('[handleImport] Importing entries:', entries);
      
      const summary = await importLedger({
        scope,
        entries
      });
      
      if (summary) {
        setShowSummary(true);
      }
    } catch (error) {
      console.error('[handleImport] Import failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      
      if (Platform.OS === 'web') {
        console.error('Import Failed:\n' + message);
      } else {
        Alert.alert('Import Failed', message, [{ text: 'OK' }]);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.content}>
        {/* Date and Session Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Calendar size={20} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Date & Session Selection</Text>
          </View>
          <Text style={styles.helperText}>
            Select the date and session for all entries in this import. The parser will only extract jurisdiction and results.
          </Text>
          
          <View style={styles.configGrid}>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateInput}
                value={selectedDate}
                onChangeText={setSelectedDate}
                placeholder="2025-09-27"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>
            
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Session</Text>
              <View style={styles.configOptions}>
                {(['midday', 'evening'] as Session[]).map((session) => (
                  <TouchableOpacity
                    key={session}
                    style={[
                      styles.configOption,
                      selectedSession === session && styles.configOptionActive,
                    ]}
                    onPress={() => setSelectedSession(session)}
                  >
                    <Clock size={14} color={selectedSession === session ? theme.colors.primary : theme.colors.textSecondary} />
                    <Text style={[
                      styles.configOptionText,
                      selectedSession === session && styles.configOptionTextActive,
                    ]}>
                      {session.charAt(0).toUpperCase() + session.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Scope</Text>
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
          </View>
        </View>

        {/* Data Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ledger Data</Text>
          <Text style={styles.helperText}>
            Paste your ledger data below. The parser will extract jurisdiction names and 3-digit results automatically.
          </Text>
          
          <TextInput
            style={styles.textInput}
            multiline
            placeholder={`Arizona
Pick 3	Fri, Sep 26, 2025	4-0-7
Arkansas
Cash 3 Midday	Fri, Sep 26, 2025	2-0-8
Cash 3 Evening	Fri, Sep 26, 2025	3-0-7
California
Daily 3 Midday	Fri, Sep 26, 2025	6-0-3
Daily 3 Evening	Fri, Sep 26, 2025	1-4-9`}
            placeholderTextColor={theme.colors.textTertiary}
            value={rawData}
            onChangeText={(text) => {
              setRawData(text);
              setParsedEntries([]);
              setValidationErrors([]);
            }}
            keyboardAppearance="dark"
          />
        </View>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <View style={styles.errorContainer}>
            {validationErrors.map((error, index) => (
              <View key={index} style={styles.errorItem}>
                <AlertCircle size={16} color={theme.colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Success Message */}
        {parsedEntries.length > 0 && validationErrors.length === 0 && (
          <View style={styles.successContainer}>
            <CheckCircle size={16} color={theme.colors.success} />
            <Text style={styles.successText}>
              Found {parsedEntries.length} valid entries
            </Text>
          </View>
        )}

        {/* Parsed Entries Preview */}
        {parsedEntries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parsed Entries ({parsedEntries.length})</Text>
            <View style={styles.previewContainer}>
              {parsedEntries.slice(0, 10).map((entry, index) => (
                <View key={index} style={styles.previewItem}>
                  <Text style={styles.previewText}>
                    {entry.jurisdiction} | {entry.game} | {entry.result_digits} | {selectedDate} | {selectedSession}
                  </Text>
                </View>
              ))}
              {parsedEntries.length > 10 && (
                <Text style={styles.previewMore}>
                  ... and {parsedEntries.length - 10} more entries
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Validate & Parse"
            onPress={validateAndParse}
            variant="secondary"
            disabled={!rawData.trim()}
          />
          <Button
            title="Import Ledger"
            onPress={handleImport}
            disabled={validationErrors.length > 0 || parsedEntries.length === 0}
            loading={isLoading}
          />
        </View>
      </ScrollView>

      {/* Import Summary Modal */}
      {showSummary && lastImportSummary && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <CheckCircle size={18} color={theme.colors.success} />
              <Text style={styles.modalTitle}>Import Completed</Text>
            </View>
            
            <View style={styles.summaryGrid}>
              <Text style={styles.summaryRow}>Type: {lastImportSummary.type}</Text>
              <Text style={styles.summaryRow}>Scope: {SCOPES[scope as keyof typeof SCOPES]?.label || scope}</Text>
              <Text style={styles.summaryRow}>Date: {selectedDate}</Text>
              <Text style={styles.summaryRow}>Session: {selectedSession}</Text>
              <Text style={styles.summaryRow}>Accepted: {lastImportSummary.accepted}</Text>
              <Text style={styles.summaryRow}>Rejected: {lastImportSummary.rejected}</Text>
              {lastImportSummary.warnings && lastImportSummary.warnings.length > 0 && (
                <Text style={styles.summaryRow}>
                  Warnings: {lastImportSummary.warnings.slice(0, 3).join(', ')}
                </Text>
              )}
            </View>
            
            <View style={styles.modalActions}>
              <Button
                title="View Details"
                onPress={() => {
                  setShowSummary(false);
                  router.replace('/(tabs)/admin-imports' as any);
                }}
                variant="secondary"
              />
              <Button
                title="Done"
                onPress={() => {
                  setShowSummary(false);
                  router.back();
                }}
              />
            </View>
          </View>
        </View>
      )}
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
  helperText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  configGrid: {
    gap: theme.spacing.lg,
  },
  configItem: {
    gap: theme.spacing.sm,
  },
  configLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600' as const,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  configOptions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing.sm,
  },
  configOption: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 100,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.xs,
    justifyContent: 'center' as const,
  },
  configOptionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '20',
  },
  configOptionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  configOptionTextActive: {
    color: theme.colors.primary,
  },
  dateInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.md,
    fontFamily: 'Courier',
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.sm,
    minHeight: 300,
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
  previewContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  previewItem: {
    marginBottom: theme.spacing.xs,
  },
  previewText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    fontFamily: 'Courier',
  },
  previewMore: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic' as const,
    marginTop: theme.spacing.sm,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
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
  summaryRow: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    justifyContent: 'flex-end' as const,
  },
});