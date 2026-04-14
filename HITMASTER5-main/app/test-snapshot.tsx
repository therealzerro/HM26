import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchFromSupabase } from '@/lib/supabase';
import { useScope } from '@/hooks/useScope';
import { useSnapshot } from '@/hooks/useSnapshot';

export default function TestSnapshotScreen() {
  const insets = useSafeAreaInsets();
  const { scope } = useScope();
  const { snapshot, refreshSnapshot } = useSnapshot();
  const [isCreating, setIsCreating] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);

  const createTestSnapshot = async () => {
    setIsCreating(true);
    setTestResult('Creating test snapshot...');
    
    try {
      const testSnapshot = {
        scope,
        horizons_present_json: {
          H01Y: true,
          H02Y: false,
          H03Y: false,
          H04Y: false,
          H05Y: false,
          H06Y: true,
          H07Y: false,
          H08Y: false,
          H09Y: false,
          H10Y: false,
        },
        weights_json: {
          BOX: 0.4,
          PBURST: 0.3,
          CO: 0.3
        },
        top_k_straights_json: [
          "123", "456", "789", "012", "345", "678", "901", "234", "567", "890"
        ],
        top_k_boxes_json: [
          "{1,2,3}", "{4,5,6}", "{7,8,9}", "{0,1,2}", "{3,4,5}", "{6,7,8}", "{9,0,1}", "{2,3,4}", "{5,6,7}", "{8,9,0}"
        ],
        components_json: [
          {
            combo: "123",
            components: { BOX: 0.8, PBURST: 0.6, CO: 0.4 },
            temperature: 85,
            multiplicity: "singles",
            topPair: "12",
            indicator: 0.75
          },
          {
            combo: "456",
            components: { BOX: 0.7, PBURST: 0.5, CO: 0.3 },
            temperature: 70,
            multiplicity: "singles",
            topPair: "45",
            indicator: 0.65
          }
        ],
        updated_at_et: new Date().toISOString(),
        hash: 'TEST123',
        snapshot_hash: 'TEST123'
      };

      console.log('[test-snapshot] Creating test snapshot:', testSnapshot);

      let result: any = null;
      try {
        result = await fetchFromSupabase({
          path: '/rest/v1/slate_snapshots',
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: testSnapshot
        });
        console.log('[test-snapshot] Create result (with snapshot_hash):', result);
      } catch (err) {
        const msg = String(err instanceof Error ? err.message : err);
        if (/snapshot_hash|PGRST204|column.*does not exist/i.test(msg)) {
          const { snapshot_hash, hash, ...fallbackBody } = testSnapshot as any;
          result = await fetchFromSupabase({
            path: '/rest/v1/slate_snapshots',
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: fallbackBody
          });
          console.log('[test-snapshot] Create result (without snapshot_hash):', result);
        } else {
          throw err;
        }
      }
      setTestResult(`✅ Test snapshot created successfully!\nResult: ${JSON.stringify(result, null, 2)}`);
      
      // Refresh the snapshot hook
      await refreshSnapshot();
      
    } catch (error) {
      console.error('[test-snapshot] Error:', error);
      setTestResult(`❌ Error creating test snapshot:\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const testRead = async () => {
    setTestResult('Testing snapshot read...');
    
    try {
      const result = await fetchFromSupabase({
        path: `/rest/v1/slate_snapshots?select=*&scope=eq.${encodeURIComponent(scope)}&order=updated_at_et.desc&limit=1`,
        method: 'GET'
      });

      console.log('[test-snapshot] Read result:', result);
      setTestResult(`📖 Read test result:\n${JSON.stringify(result, null, 2)}`);
      
    } catch (error) {
      console.error('[test-snapshot] Read error:', error);
      setTestResult(`❌ Error reading snapshots:\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clearSnapshots = async () => {
    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete all snapshots for this scope?')) {
        await performClear();
      }
    } else {
      setShowConfirm(true);
    }
  };

  const performClear = async () => {
    try {
      await fetchFromSupabase({
        path: `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(scope)}`,
        method: 'DELETE'
      });
      setTestResult('✅ All snapshots cleared');
      await refreshSnapshot();
    } catch (error) {
      setTestResult(`❌ Error clearing snapshots:\n${error instanceof Error ? error.message : String(error)}`);
    }
    setShowConfirm(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ title: 'Test Snapshot System' }} />
      
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Snapshot System Test</Text>
        <Text style={styles.subtitle}>Current Scope: {scope}</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Snapshot Status:</Text>
          <Text style={styles.status}>
            {snapshot ? `✅ Snapshot loaded (${Array.isArray(snapshot.top_k_straights_json) ? snapshot.top_k_straights_json.length : 0} items)` : '❌ No snapshot loaded'}
          </Text>
          {snapshot && (
            <Text style={styles.details}>
              Hash: {snapshot.hash || snapshot.snapshot_hash || 'No hash'}
              {'\n'}Updated: {snapshot.updated_at_et}
            </Text>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton]} 
            onPress={createTestSnapshot}
            disabled={isCreating}
          >
            <Text style={styles.buttonText}>
              {isCreating ? 'Creating...' : 'Create Test Snapshot'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={testRead}
          >
            <Text style={styles.buttonText}>Test Read Snapshots</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.refreshButton]} 
            onPress={refreshSnapshot}
          >
            <Text style={styles.buttonText}>Refresh Snapshot Hook</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.dangerButton]} 
            onPress={clearSnapshots}
          >
            <Text style={styles.buttonText}>Clear All Snapshots</Text>
          </TouchableOpacity>
        </View>

        {showConfirm && (
          <View style={styles.confirmModal}>
            <View style={styles.confirmContent}>
              <Text style={styles.confirmTitle}>Clear Snapshots</Text>
              <Text style={styles.confirmText}>Are you sure you want to delete all snapshots for this scope?</Text>
              <View style={styles.confirmButtons}>
                <TouchableOpacity 
                  style={[styles.button, styles.secondaryButton]} 
                  onPress={() => setShowConfirm(false)}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.button, styles.dangerButton]} 
                  onPress={performClear}
                >
                  <Text style={styles.buttonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {testResult ? (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>Test Result:</Text>
            <Text style={styles.resultText}>{testResult}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  status: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  details: {
    fontSize: 14,
    color: '#888',
    fontFamily: 'monospace',
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 24,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#34C759',
  },
  refreshButton: {
    backgroundColor: '#FF9500',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: '#fff',
    fontFamily: 'monospace',
  },
  confirmModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmContent: {
    backgroundColor: '#1C1C1E',
    padding: 24,
    borderRadius: 12,
    margin: 20,
    maxWidth: 300,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
});