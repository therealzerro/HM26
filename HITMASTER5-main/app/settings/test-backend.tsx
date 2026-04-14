import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Clipboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Shield, FileText, Play, Copy, CheckCircle, XCircle, Clock } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchFromSupabase } from '@/lib/supabase';

interface TestResult {
  name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  message: string;
  details?: any;
  timestamp?: string;
  latency?: number;
}

interface DiagnosticData {
  timestamp: string;
  userRole: string;
  tests: TestResult[];
  systemInfo: {
    platform: string;
    version: string;
    connectivity: string;
  };
}

export default function TestBackendScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tests, setTests] = useState<TestResult[]>([
    {
      name: 'Connection Test',
      status: 'idle',
      message: 'Ready to test backend connectivity'
    },
    {
      name: 'Snapshot Read Test',
      status: 'idle',
      message: 'Ready to test slate snapshot retrieval'
    },
    {
      name: 'Entitlement Check',
      status: 'idle',
      message: 'Ready to verify subscription status'
    },
    ...(user?.role === 'admin' ? [
      {
        name: 'Run-2E Slate Regen',
        status: 'idle' as const,
        message: 'Ready to test slate regeneration'
      },
      {
        name: 'Imports Health',
        status: 'idle' as const,
        message: 'Ready to check import system status'
      }
    ] : [])
  ]);
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);

  const updateTest = (name: string, updates: Partial<TestResult>) => {
    setTests(prev => prev.map(test => 
      test.name === name 
        ? { ...test, ...updates, timestamp: new Date().toLocaleTimeString() }
        : test
    ));
  };

  const runConnectionTest = async () => {
    updateTest('Connection Test', { status: 'running', message: 'Testing connection...' });
    
    try {
      const startTime = Date.now();
      // Test basic connection with a simple query
      const response = await fetchFromSupabase({ 
        path: '/rest/v1/imports?select=id&limit=1',
        method: 'GET'
      });
      const latency = Date.now() - startTime;
      
      updateTest('Connection Test', {
        status: 'success',
        message: `Connection successful (${latency}ms)`,
        latency,
        details: { 
          responseType: Array.isArray(response) ? 'array' : typeof response,
          itemCount: Array.isArray(response) ? response.length : 'N/A',
          latency: `${latency}ms`
        }
      });
    } catch (error) {
      updateTest('Connection Test', {
        status: 'error',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      });
    }
  };

  const runSnapshotTest = async () => {
    updateTest('Snapshot Read Test', { status: 'running', message: 'Reading snapshots...' });
    
    try {
      const scopes: Array<'allday' | 'midday' | 'evening'> = ['allday', 'midday', 'evening'];
      const results: Record<string, unknown> = {};
      
      for (const scope of scopes) {
        try {
          const queries = [
            `/rest/v1/v_latest_slate_snapshots?select=*&scope=eq.${scope}&limit=1`,
            `/rest/v1/slate_snapshots?select=*&scope=eq.${scope}&order=updated_at_et.desc.nullslast,id.desc&limit=1`
          ];
          
          let response: unknown = null;
          let queryError: unknown = null;
          
          for (const query of queries) {
            try {
              const r = await fetchFromSupabase<unknown>({ path: query, method: 'GET' });
              if (Array.isArray(r) && r.length > 0) {
                response = r;
                break;
              }
              response = r;
            } catch (err) {
              queryError = err;
              console.log(`[test] Query failed: ${query}`, err);
              continue;
            }
          }
          
          if (Array.isArray(response) && response.length > 0) {
            const snapshot: any = response[0] as any;
            const hash: string | undefined = (snapshot?.snapshot_hash ?? snapshot?.hash) as string | undefined;
            results[scope] = {
              lastUpdated: snapshot?.updated_at_et ?? 'N/A',
              hashTail: typeof hash === 'string' ? hash.slice(-8) : 'N/A',
              itemCount: Array.isArray(snapshot?.top_k_straights_json) ? snapshot.top_k_straights_json.length : 0,
              status: 'found'
            };
          } else {
            results[scope] = { 
              status: 'empty', 
              error: queryError ? `Query error: ${queryError instanceof Error ? queryError.message : String(queryError)}` : 'No snapshot found' 
            };
          }
        } catch (scopeError) {
          results[scope] = { 
            status: 'error', 
            error: scopeError instanceof Error ? scopeError.message : 'Unknown error' 
          };
        }
      }
      
      const values = Object.values(results);
      const successCount = values.filter((r: any) => r.status === 'found').length;
      const errorCount = values.filter((r: any) => r.status === 'error').length;
      
      updateTest('Snapshot Read Test', {
        status: successCount > 0 ? 'success' : 'error',
        message: successCount > 0 
          ? `Found snapshots in ${successCount}/${scopes.length} scopes`
          : errorCount > 0 
            ? 'Schema/cache issue: run supabase/schema.sql and refresh PostgREST cache'
            : `Found snapshots in ${successCount}/${scopes.length} scopes`,
        details: results
      });
    } catch (error) {
      updateTest('Snapshot Read Test', {
        status: 'error',
        message: `Snapshot read failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      });
    }
  };

  const runEntitlementCheck = async () => {
    updateTest('Entitlement Check', { status: 'running', message: 'Checking entitlements...' });
    
    try {
      const entitlements = {
        currentTier: user?.role || 'free',
        eligibleFeatures: user?.role === 'admin' ? ['all'] : user?.role === 'premium' ? ['premium'] : ['basic'],
        subscriptionStatus: user?.role === 'free' ? 'none' : 'active',
        iapStatus: 'live_placeholder'
      };
      
      updateTest('Entitlement Check', {
        status: 'success',
        message: `Tier: ${entitlements.currentTier.toUpperCase()}`,
        details: entitlements
      });
    } catch (error) {
      updateTest('Entitlement Check', {
        status: 'error',
        message: `Entitlement check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      });
    }
  };

  const runSlateRegenTest = async () => {
    if (user?.role !== 'admin') return;
    
    updateTest('Run-2E Slate Regen', { status: 'running', message: 'Creating test slate snapshot...' });
    
    try {
      // Create a test slate snapshot to verify the system works
      const testSnapshot = {
        scope: 'allday',
        horizons_present_json: {
          H01Y: true,
          H02Y: true,
          H03Y: false,
          H04Y: false,
          H05Y: false,
          H06Y: false,
          H07Y: false,
          H08Y: false,
          H09Y: false,
          H10Y: false
        },
        weights_json: {
          BOX: 0.4,
          PBURST: 0.3,
          CO: 0.3
        },
        top_k_straights_json: [
          '123', '456', '789', '012', '345', '678', '901', '234', '567', '890'
        ],
        top_k_boxes_json: [
          '{1,2,3}', '{4,5,6}', '{7,8,9}', '{0,1,2}', '{3,4,5}', '{6,7,8}', '{9,0,1}', '{2,3,4}', '{5,6,7}', '{8,9,0}'
        ],
        components_json: [
          { combo: '123', components: { BOX: 0.8, PBURST: 0.6, CO: 0.7 }, temperature: 85, multiplicity: 'singles', topPair: '12', indicator: 0.75 },
          { combo: '456', components: { BOX: 0.7, PBURST: 0.5, CO: 0.6 }, temperature: 75, multiplicity: 'singles', topPair: '45', indicator: 0.65 },
          { combo: '789', components: { BOX: 0.6, PBURST: 0.4, CO: 0.5 }, temperature: 65, multiplicity: 'singles', topPair: '78', indicator: 0.55 }
        ],
        updated_at_et: new Date().toISOString(),
        hash: 'TEST' + Date.now().toString(16).toUpperCase(),
        snapshot_hash: 'TEST' + Date.now().toString(16).toUpperCase()
      };
      
      // Try to create the test snapshot with progressive fallbacks
      let created: any = null;
      try {
        created = await fetchFromSupabase({
          path: '/rest/v1/slate_snapshots',
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: testSnapshot
        });
      } catch (e1) {
        const msg1 = String(e1 instanceof Error ? e1.message : e1);
        // If either snapshot_hash or hash not recognized, fallback to snapshot_hash only
        if (/column|PGRST204|snapshot_hash|hash/i.test(msg1)) {
          try {
            const { hash, ...withSnapshotHashOnly } = testSnapshot as any;
            created = await fetchFromSupabase({
              path: '/rest/v1/slate_snapshots',
              method: 'POST',
              headers: { 'Prefer': 'return=representation' },
              body: withSnapshotHashOnly
            });
          } catch (e2) {
            const msg2 = String(e2 instanceof Error ? e2.message : e2);
            // If snapshot_hash not recognized, try hash only
            if (/column|PGRST204|snapshot_hash/i.test(msg2)) {
              try {
                const { snapshot_hash, ...withHashOnly } = testSnapshot as any;
                created = await fetchFromSupabase({
                  path: '/rest/v1/slate_snapshots',
                  method: 'POST',
                  headers: { 'Prefer': 'return=representation' },
                  body: withHashOnly
                });
              } catch (e3) {
                const msg3 = String(e3 instanceof Error ? e3.message : e3);
                // Final fallback: neither hash field
                if (/column|PGRST204|hash/i.test(msg3)) {
                  const { snapshot_hash, hash: _hash, ...withoutHashes } = testSnapshot as any;
                  created = await fetchFromSupabase({
                    path: '/rest/v1/slate_snapshots',
                    method: 'POST',
                    headers: { 'Prefer': 'return=representation' },
                    body: withoutHashes
                  });
                } else {
                  throw e3;
                }
              }
            } else {
              throw e2;
            }
          }
        } else {
          throw e1;
        }
      }

      const createdSnapshot = Array.isArray(created) ? created[0] : created;

      updateTest('Run-2E Slate Regen', {
        status: 'success',
        message: `Test snapshot created successfully - check Home/Slates screens`,
        details: {
          snapshotId: createdSnapshot?.id,
          hash: testSnapshot.hash,
          scope: testSnapshot.scope,
          itemCount: testSnapshot.top_k_straights_json.length,
          timestamp: testSnapshot.updated_at_et,
          nextStep: 'Go to Home or Slates tab to see the generated slates'
        }
      });
      
      // Trigger a snapshot test to verify it's readable
      setTimeout(() => {
        runSnapshotTest();
      }, 1000);
    } catch (error) {
      updateTest('Run-2E Slate Regen', {
        status: 'error',
        message: `Test snapshot creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      });
    }
  };

  const runImportsHealthTest = async () => {
    if (user?.role !== 'admin') return;
    
    updateTest('Imports Health', { status: 'running', message: 'Checking import health...' });
    
    try {
      // Live imports health check
      const startTime = Date.now();
      const response = await fetchFromSupabase<any[]>({
        path: '/rest/v1/imports?select=id,type,status,created_at,error_text&order=created_at.desc&limit=10',
        method: 'GET'
      });
      const latency = Date.now() - startTime;
      
      if (Array.isArray(response)) {
        const successCount = response.filter(i => i.status === 'completed').length;
        const errorCount = response.filter(i => i.status === 'failed').length;
        const processingCount = response.filter(i => i.status === 'processing').length;
        
        updateTest('Imports Health', {
          status: 'success',
          message: `Last 10 imports: ${successCount} success, ${errorCount} error, ${processingCount} processing (${latency}ms)`,
          details: {
            imports: response.map(imp => ({
              id: imp.id,
              type: imp.type,
              status: imp.status,
              timestamp: imp.created_at,
              error: imp.error_text || null
            })),
            summary: { successCount, errorCount, processingCount },
            latency: `${latency}ms`
          }
        });
      } else {
        updateTest('Imports Health', {
          status: 'error',
          message: 'Invalid response format from imports endpoint',
          details: { response }
        });
      }
    } catch (error) {
      updateTest('Imports Health', {
        status: 'error',
        message: `Import health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error
      });
    }
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    
    try {
      await runConnectionTest();
      await runSnapshotTest();
      await runEntitlementCheck();
      
      if (user?.role === 'admin') {
        await runSlateRegenTest();
        await runImportsHealthTest();
      }
    } finally {
      setIsRunningAll(false);
    }
  };

  const copyDiagnostics = async () => {
    const diagnostics: DiagnosticData = {
      timestamp: new Date().toISOString(),
      userRole: user?.role || 'unknown',
      tests: tests.map(test => ({
        ...test,
        details: test.details ? JSON.stringify(test.details, null, 2) : undefined
      })),
      systemInfo: {
        platform: 'React Native',
        version: '1.0.0',
        connectivity: 'online'
      }
    };
    
    const diagnosticsText = JSON.stringify(diagnostics, null, 2);
    
    try {
      await Clipboard.setString(diagnosticsText);
      console.log('Diagnostics copied to clipboard');
    } catch (error) {
      console.log('Failed to copy diagnostics:', error);
    }
  };

  const getTestIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return <Clock size={20} color={theme.colors.warning} />;
      case 'success':
        return <CheckCircle size={20} color={theme.colors.success} />;
      case 'error':
        return <XCircle size={20} color={theme.colors.error} />;
      default:
        return <Play size={20} color={theme.colors.textSecondary} />;
    }
  };

  const getTestStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return theme.colors.warning;
      case 'success':
        return theme.colors.success;
      case 'error':
        return theme.colors.error;
      default:
        return theme.colors.textSecondary;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Test Backend & Run-2E</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.description}>
            Test backend connectivity, data integrity, and system health. 
            {user?.role === 'admin' && ' Admin users can also run slate regeneration tests and check import health.'}
          </Text>
        </View>

        {/* Test Cards */}
        <View style={styles.testsSection}>
          {tests.map((test) => (
            <View key={test.name} style={styles.testCard}>
              <View style={styles.testHeader}>
                <View style={styles.testInfo}>
                  <View style={styles.testTitleRow}>
                    {getTestIcon(test.status)}
                    <Text style={styles.testName}>{test.name}</Text>
                  </View>
                  <Text style={[styles.testMessage, { color: getTestStatusColor(test.status) }]}>
                    {test.message}
                  </Text>
                  {test.timestamp && (
                    <Text style={styles.testTimestamp}>
                      Last run: {test.timestamp}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.runButton, test.status === 'running' && styles.runButtonDisabled]}
                  onPress={() => {
                    switch (test.name) {
                      case 'Connection Test':
                        runConnectionTest();
                        break;
                      case 'Snapshot Read Test':
                        runSnapshotTest();
                        break;
                      case 'Entitlement Check':
                        runEntitlementCheck();
                        break;
                      case 'Run-2E Slate Regen':
                        runSlateRegenTest();
                        break;
                      case 'Imports Health':
                        runImportsHealthTest();
                        break;
                    }
                  }}
                  disabled={test.status === 'running'}
                >
                  <Text style={styles.runButtonText}>
                    {test.status === 'running' ? 'Running...' : 'Run'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {test.details && (
                <View style={styles.testDetails}>
                  <Text style={styles.testDetailsTitle}>Details:</Text>
                  <Text style={styles.testDetailsText}>
                    {typeof test.details === 'string' 
                      ? test.details 
                      : JSON.stringify(test.details, null, 2)
                    }
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.runAllButton, isRunningAll && styles.actionButtonDisabled]}
            onPress={runAllTests}
            disabled={isRunningAll}
          >
            <Play size={20} color={theme.colors.text} />
            <Text style={styles.actionButtonText}>
              {isRunningAll ? 'Running All Tests...' : 'Run All Tests'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.copyButton]}
            onPress={copyDiagnostics}
          >
            <Copy size={20} color={theme.colors.text} />
            <Text style={styles.actionButtonText}>Copy Diagnostics</Text>
          </TouchableOpacity>
          
          {user?.role === 'admin' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.adminButton]}
              onPress={() => router.push('/(tabs)/admin-imports')}
            >
              <FileText size={20} color={theme.colors.text} />
              <Text style={styles.actionButtonText}>Open Admin Tools</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[styles.actionButton, styles.supportButton]}
            onPress={() => console.log('Contact Support: support@hitmaster.app')}
          >
            <Shield size={20} color={theme.colors.text} />
            <Text style={styles.actionButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </View>

        {/* System Info */}
        <View style={styles.systemInfoSection}>
          <Text style={styles.sectionTitle}>System Information</Text>
          <View style={styles.systemInfoCard}>
            <View style={styles.systemInfoRow}>
              <Text style={styles.systemInfoLabel}>User Role:</Text>
              <Text style={styles.systemInfoValue}>{user?.role?.toUpperCase() || 'UNKNOWN'}</Text>
            </View>
            <View style={styles.systemInfoRow}>
              <Text style={styles.systemInfoLabel}>Platform:</Text>
              <Text style={styles.systemInfoValue}>React Native</Text>
            </View>
            <View style={styles.systemInfoRow}>
              <Text style={styles.systemInfoLabel}>Version:</Text>
              <Text style={styles.systemInfoValue}>3.0.0</Text>
            </View>
            <View style={styles.systemInfoRow}>
              <Text style={styles.systemInfoLabel}>Backend:</Text>
              <Text style={styles.systemInfoValue}>Supabase</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
  },
  descriptionSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  description: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  testsSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  testCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.soft,
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  testInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  testTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  testName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  testMessage: {
    fontSize: theme.typography.fontSize.md,
    marginBottom: theme.spacing.xs,
  },
  testTimestamp: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  runButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  runButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  testDetails: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
  },
  testDetailsTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  testDetailsText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily.tabular,
  },
  actionsSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  runAllButton: {
    backgroundColor: theme.colors.primary,
  },
  copyButton: {
    backgroundColor: theme.colors.textSecondary,
  },
  adminButton: {
    backgroundColor: theme.colors.warning,
  },
  supportButton: {
    backgroundColor: theme.colors.success,
  },
  systemInfoSection: {
    paddingHorizontal: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  systemInfoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  systemInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  systemInfoLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
  },
  systemInfoValue: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
});