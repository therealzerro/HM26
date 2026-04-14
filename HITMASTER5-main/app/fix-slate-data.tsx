import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { RefreshCw, Database, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSnapshot } from '@/hooks/useSnapshot';
import { Scope } from '@/types/core';

export default function FixSlateDataScreen() {
  const { user } = useAuth();
  const { refreshSnapshot } = useSnapshot();
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  const addResult = useCallback((message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  const createMockSlateData = useCallback(async () => {
    if (user?.role !== 'admin') {
      Alert.alert('Error', 'Admin access required');
      return;
    }

    setIsLoading(true);
    setResults([]);
    addResult('Starting mock slate data creation...');

    try {
      const scopes: Scope[] = ['allday', 'midday', 'evening'];
      
      for (const scope of scopes) {
        addResult(`Creating mock data for scope: ${scope}`);
        
        // Create realistic mock slate data
        const mockTopKStraights = [
          { combo: '123', indicator: 0.95, box: 0.85, pburst: 0.78, co: 0.72, multiplicity: 'singles' as const, topPair: '12', temperature: 95, rank: 1 },
          { combo: '456', indicator: 0.92, box: 0.78, pburst: 0.69, co: 0.65, multiplicity: 'singles' as const, topPair: '45', temperature: 92, rank: 2 },
          { combo: '789', indicator: 0.88, box: 0.72, pburst: 0.61, co: 0.58, multiplicity: 'singles' as const, topPair: '78', temperature: 88, rank: 3 },
          { combo: '012', indicator: 0.84, box: 0.68, pburst: 0.55, co: 0.52, multiplicity: 'singles' as const, topPair: '01', temperature: 84, rank: 4 },
          { combo: '345', indicator: 0.81, box: 0.64, pburst: 0.51, co: 0.48, multiplicity: 'singles' as const, topPair: '34', temperature: 81, rank: 5 },
          { combo: '678', indicator: 0.78, box: 0.61, pburst: 0.48, co: 0.45, multiplicity: 'singles' as const, topPair: '67', temperature: 78, rank: 6 },
          { combo: '901', indicator: 0.75, box: 0.58, pburst: 0.45, co: 0.42, multiplicity: 'singles' as const, topPair: '90', temperature: 75, rank: 7 },
          { combo: '234', indicator: 0.72, box: 0.55, pburst: 0.42, co: 0.39, multiplicity: 'singles' as const, topPair: '23', temperature: 72, rank: 8 },
          { combo: '567', indicator: 0.69, box: 0.52, pburst: 0.39, co: 0.36, multiplicity: 'singles' as const, topPair: '56', temperature: 69, rank: 9 },
          { combo: '890', indicator: 0.66, box: 0.49, pburst: 0.36, co: 0.33, multiplicity: 'singles' as const, topPair: '89', temperature: 66, rank: 10 }
        ];

        const mockComponents = mockTopKStraights.map(item => ({
          combo: item.combo,
          components: { BOX: item.box, PBURST: item.pburst, CO: item.co },
          temperature: item.temperature,
          multiplicity: item.multiplicity,
          topPair: item.topPair,
          indicator: item.indicator
        }));

        const mockSnapshot = {
          scope,
          snapshot_hash: `mock_${scope}_${Date.now()}`,
          hash: `mock_${scope}_${Date.now()}`,
          horizons_present_json: {
            'H01Y': true,
            'H02Y': true,
            'H03Y': scope === 'allday' || scope === 'evening',
            'H04Y': false,
            'H05Y': false,
            'H06Y': false,
            'H07Y': false,
            'H08Y': false,
            'H09Y': false,
            'H10Y': false
          },
          weights_json: {
            BOX: 0.4,
            PBURST: 0.35,
            CO: 0.25
          },
          top_k_straights_json: mockTopKStraights,
          top_k_boxes_json: mockTopKStraights.map(item => `{${item.combo.split('').sort().join(',')}}`),
          components_json: mockComponents,
          updated_at_et: new Date().toISOString()
        };

        try {
          // Delete existing snapshots for this scope first
          await fetchFromSupabase({
            path: `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(scope)}`,
            method: 'DELETE'
          });
          addResult(`Cleared existing snapshots for ${scope}`);
        } catch (e) {
          addResult(`Warning: Could not clear existing snapshots for ${scope}: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Create new snapshot
        const result = await fetchFromSupabase({
          path: '/rest/v1/slate_snapshots',
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: mockSnapshot
        });

        const snapshotId = Array.isArray(result) ? result[0]?.id : (result as any)?.id;
        addResult(`✅ Created snapshot for ${scope} with ID: ${snapshotId}`);
      }

      addResult('🎉 Mock slate data creation completed successfully!');
      addResult('Refreshing snapshot cache...');
      
      // Refresh the snapshot cache
      await refreshSnapshot();
      addResult('✅ Snapshot cache refreshed');
      
      Alert.alert('Success', 'Mock slate data created successfully! The slates should now be visible.');
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addResult(`❌ Error: ${errorMsg}`);
      Alert.alert('Error', `Failed to create mock data: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, [user?.role, addResult, refreshSnapshot]);

  const clearAllSlateData = useCallback(async () => {
    if (user?.role !== 'admin') {
      Alert.alert('Error', 'Admin access required');
      return;
    }

    Alert.alert(
      'Confirm Clear',
      'This will delete ALL slate snapshots. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            setResults([]);
            addResult('Clearing all slate snapshots...');

            try {
              // Delete all slate snapshots by using a condition that matches all records
              await fetchFromSupabase({
                path: '/rest/v1/slate_snapshots?id=neq.00000000-0000-0000-0000-000000000000',
                method: 'DELETE'
              });
              addResult('✅ All slate snapshots cleared');
              await refreshSnapshot();
              addResult('✅ Snapshot cache refreshed');
              Alert.alert('Success', 'All slate data cleared');
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              addResult(`❌ Error: ${errorMsg}`);
              Alert.alert('Error', `Failed to clear data: ${errorMsg}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  }, [user?.role, addResult, refreshSnapshot]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Fix Slate Data' }} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Fix Slate Data Issues</Text>
        <Text style={styles.subtitle}>Create mock slate data to fix display issues</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={createMockSlateData}
          disabled={isLoading}
        >
          <RefreshCw size={20} color={theme.colors.text} />
          <Text style={styles.buttonText}>
            {isLoading ? 'Creating...' : 'Create Mock Slate Data'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={clearAllSlateData}
          disabled={isLoading}
        >
          <Database size={20} color={theme.colors.text} />
          <Text style={styles.buttonText}>Clear All Slate Data</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.results}>
        {results.map((result) => (
          <View key={result} style={styles.resultItem}>
            {result.includes('✅') ? (
              <CheckCircle2 size={16} color={theme.colors.success} />
            ) : result.includes('❌') ? (
              <AlertCircle size={16} color={theme.colors.error} />
            ) : (
              <RefreshCw size={16} color={theme.colors.primary} />
            )}
            <Text style={styles.resultText}>{result}</Text>
          </View>
        ))}
        
        {results.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Database size={48} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>No results yet</Text>
            <Text style={styles.emptySubtext}>Click &quot;Create Mock Slate Data&quot; to fix slate display issues</Text>
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
  header: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dangerButton: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },
  buttonText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  results: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  resultText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    marginTop: theme.spacing.xl,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
});