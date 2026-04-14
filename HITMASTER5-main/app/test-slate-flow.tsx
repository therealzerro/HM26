import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw, Database, CheckCircle2, AlertCircle, Hash } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';
import { fetchFromSupabase } from '@/lib/supabase';

export default function TestSlateFlowScreen() {
  const { snapshot, refreshSnapshot, isLoading, hasLiveData } = useSnapshot();
  const { regenerateSlate } = useDataIngestion();
  const { scope } = useScope();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = useCallback((message: string) => {
    console.log('[TestSlateFlow]', message);
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  const clearResults = useCallback(() => {
    setTestResults([]);
  }, []);

  const testDatabaseSanity = useCallback(async () => {
    addResult('🔍 Testing database sanity...');
    
    try {
      // Test 1A: Latest snapshot row exists
      const latestSnapshots = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?select=id,scope,updated_at_et,snapshot_hash,top_k_straights_json&scope=eq.${encodeURIComponent(scope)}&order=updated_at_et.desc.nullslast,id.desc&limit=1`
      });
      
      if (!Array.isArray(latestSnapshots) || latestSnapshots.length === 0) {
        addResult('❌ 1A: No snapshot row found for scope ' + scope);
        return false;
      }
      
      const latest = latestSnapshots[0];
      addResult(`✅ 1A: Latest snapshot found - ID: ${latest.id?.slice(0, 8)}, Hash: ${latest.snapshot_hash?.slice(0, 8) || 'N/A'}`);
      
      // Test 1B: Payload size is non-zero
      const topK = latest.top_k_straights_json;
      const topKLength = Array.isArray(topK) ? topK.length : 0;
      
      if (topKLength === 0) {
        addResult('❌ 1B: top_k_straights_json is empty (K=0)');
        return false;
      }
      
      addResult(`✅ 1B: Payload has K=${topKLength} entries`);
      
      // Test 1C: First element shape
      const firstElement = Array.isArray(topK) ? topK[0] : null;
      if (!firstElement) {
        addResult('❌ 1C: No first element in top_k_straights_json');
        return false;
      }
      
      if (typeof firstElement === 'string') {
        addResult(`✅ 1C: First element is string format: "${firstElement}"`);
      } else if (typeof firstElement === 'object') {
        const keys = Object.keys(firstElement);
        addResult(`✅ 1C: First element is object with keys: ${keys.join(', ')}`);
      } else {
        addResult(`❌ 1C: First element has unexpected type: ${typeof firstElement}`);
        return false;
      }
      
      return true;
    } catch (error) {
      addResult(`❌ Database sanity test failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, [scope, addResult]);

  const testApiPolicies = useCallback(async () => {
    addResult('🔍 Testing API policies...');
    
    try {
      const response = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?select=id,scope,top_k_straights_json&scope=eq.${encodeURIComponent(scope)}&order=updated_at_et.desc.nullslast,id.desc&limit=1`
      });
      
      if (Array.isArray(response) && response.length > 0) {
        const row = response[0];
        const hasNonEmptyArray = Array.isArray(row.top_k_straights_json) && row.top_k_straights_json.length > 0;
        addResult(`✅ API policies OK - Retrieved snapshot with ${hasNonEmptyArray ? row.top_k_straights_json.length : 0} items`);
        return true;
      } else {
        addResult('❌ API returned empty result or no data');
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('401') || errorMsg.includes('403')) {
        addResult('❌ API policies failed: Authentication/authorization error');
      } else {
        addResult(`❌ API test failed: ${errorMsg}`);
      }
      return false;
    }
  }, [scope, addResult]);

  const testRegenFlow = useCallback(async () => {
    addResult('🔍 Testing regeneration flow...');
    setIsRunning(true);
    
    try {
      // Capture previous state
      const prevSnapshot = snapshot;
      const prevHash = prevSnapshot?.hash?.slice(0, 8) || 'none';
      addResult(`📊 Previous state: Hash=${prevHash}, K=${Array.isArray(prevSnapshot?.top_k_straights_json) ? prevSnapshot.top_k_straights_json.length : 0}`);
      
      // Trigger regeneration
      addResult('🚀 Starting regeneration...');
      const result = await regenerateSlate(scope);
      
      addResult(`📋 Regeneration result: ${result.status} - ${result.message}`);
      
      if (result.status === 'success') {
        addResult(`🎯 Success! New hash: ${result.hash?.slice(0, 8) || 'N/A'}, ID: ${result.snapshotId?.slice(0, 8) || 'N/A'}`);
        
        // Wait a moment then refresh
        addResult('⏳ Refreshing snapshot...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await refreshSnapshot();
        
        // Check if data updated
        const newSnapshot = snapshot;
        const newHash = newSnapshot?.hash?.slice(0, 8) || 'none';
        const newK = Array.isArray(newSnapshot?.top_k_straights_json) ? newSnapshot.top_k_straights_json.length : 0;
        
        addResult(`📊 New state: Hash=${newHash}, K=${newK}`);
        
        if (newHash !== prevHash && newK > 0) {
          addResult('✅ Regeneration flow successful - data updated!');
          return true;
        } else {
          addResult('❌ Regeneration flow failed - data not updated');
          return false;
        }
      } else {
        addResult(`❌ Regeneration failed: ${result.status} - ${result.message}`);
        return false;
      }
    } catch (error) {
      addResult(`❌ Regeneration flow error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsRunning(false);
    }
  }, [scope, snapshot, regenerateSlate, refreshSnapshot, addResult]);

  const runFullTest = useCallback(async () => {
    clearResults();
    addResult('🧪 Starting comprehensive slate flow test...');
    addResult(`📍 Testing scope: ${scope}`);
    
    const step1 = await testDatabaseSanity();
    if (!step1) {
      addResult('❌ Test failed at step 1 (Database Sanity)');
      return;
    }
    
    const step2 = await testApiPolicies();
    if (!step2) {
      addResult('❌ Test failed at step 2 (API Policies)');
      return;
    }
    
    const step3 = await testRegenFlow();
    if (!step3) {
      addResult('❌ Test failed at step 3 (Regeneration Flow)');
      return;
    }
    
    addResult('🎉 All tests passed! Slate flow is working correctly.');
  }, [scope, testDatabaseSanity, testApiPolicies, testRegenFlow, addResult, clearResults]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Hash size={24} color={theme.colors.primary} />
          <Text style={styles.title}>Slate Flow Test</Text>
        </View>
        
        <View style={styles.currentState}>
          <Text style={styles.sectionTitle}>Current State</Text>
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Scope:</Text>
            <Text style={styles.stateValue}>{scope}</Text>
          </View>
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Has Snapshot:</Text>
            <Text style={styles.stateValue}>{snapshot ? '✅' : '❌'}</Text>
          </View>
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Hash:</Text>
            <Text style={styles.stateValue}>{snapshot?.hash?.slice(0, 8) || 'N/A'}</Text>
          </View>
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>K Count:</Text>
            <Text style={styles.stateValue}>
              {Array.isArray(snapshot?.top_k_straights_json) ? snapshot.top_k_straights_json.length : 0}
            </Text>
          </View>
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Is Loading:</Text>
            <Text style={styles.stateValue}>{isLoading ? '⏳' : '✅'}</Text>
          </View>
          <View style={styles.stateRow}>
            <Text style={styles.stateLabel}>Has Live Data:</Text>
            <Text style={styles.stateValue}>{hasLiveData ? '✅' : '❌'}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton]} 
            onPress={runFullTest}
            disabled={isRunning}
          >
            <RefreshCw size={16} color={theme.colors.text} />
            <Text style={styles.buttonText}>
              {isRunning ? 'Running Tests...' : 'Run Full Test'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={testDatabaseSanity}
            disabled={isRunning}
          >
            <Database size={16} color={theme.colors.text} />
            <Text style={styles.buttonText}>Test Database</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={clearResults}
          >
            <Text style={styles.buttonText}>Clear Results</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.results}>
          <Text style={styles.sectionTitle}>Test Results</Text>
          {testResults.length === 0 ? (
            <Text style={styles.noResults}>No test results yet. Run a test to see output.</Text>
          ) : (
            testResults.map((result, index) => (
              <View key={index} style={styles.resultRow}>
                <Text style={styles.resultText}>{result}</Text>
              </View>
            ))
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
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  currentState: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  stateLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
  },
  stateValue: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  secondaryButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  buttonText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  results: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  noResults: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: theme.spacing.lg,
  },
  resultRow: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '40',
  },
  resultText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    fontFamily: 'monospace',
  },
});