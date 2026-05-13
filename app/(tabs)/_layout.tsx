import { Tabs } from 'expo-router';
import React, { useEffect, useMemo, useState, ComponentType } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { storage } from '@/lib/storage';
import { fetchFromSupabase } from '@/lib/supabase';
import { Crown, Zap, ClipboardList, BookMarked, GraduationCap, User } from 'lucide-react-native';

interface LucideIconProps { size?: number; color?: string; strokeWidth?: number }

function TabIcon({
  Icon,
  label,
  focused,
  hasBadge,
}: {
  Icon: ComponentType<LucideIconProps>;
  label: string;
  focused: boolean;
  hasBadge?: boolean;
}) {
  return (
    <View
      style={[styles.iconWrap, focused && styles.iconWrapFocused]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={hasBadge ? `${label} — new hits` : label}
    >
      <Icon
        size={focused ? 22 : 19}
        color={focused ? theme.colors.cyan : theme.colors.textTertiary}
        strokeWidth={focused ? 2.4 : 2}
      />
      {hasBadge && <View style={styles.badge} />}
    </View>
  );
}

// Stale tab badge (enhancements §7.7) — true when there are K6 hits on a
// slate_date newer than the last time the user opened Results. Tracks
// last-view date in AsyncStorage; defaults to yesterday for first-time
// users so an overnight hit still pings the badge on first open.
function useUnviewedResultsHits(): boolean {
  const [lastViewedDate, setLastViewedDate] = useState<string | null>(null);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }, []);

  useEffect(() => {
    storage.getItem('results_last_viewed_date').then(v => setLastViewedDate(v));
  }, []);

  const { data: hasUnviewed = false } = useQuery<boolean>({
    queryKey: ['unviewed_results_hits', lastViewedDate, yesterdayStr],
    queryFn: async () => {
      const since = lastViewedDate ?? yesterdayStr;
      const rows = await fetchFromSupabase<Array<{ scope?: string; hit_session?: string }>>({
        path: `/rest/v1/daily_intelligence?slate_date=gt.${since}&on_slate=eq.true&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)&select=scope,hit_session&limit=10`,
      });
      // Same scope-validity gate Results uses (BUG-132 defense in depth).
      const valid = (rows || []).filter(r => {
        const s = (r.scope ?? '').toLowerCase();
        const sess = (r.hit_session ?? '').toLowerCase();
        if (s === 'allday') return true;
        if (!sess) return true;
        return s === sess;
      });
      return valid.length > 0;
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return hasUnviewed;
}

export default function TabLayout() {
  const hasUnviewedHits = useUnviewedResultsHits();
  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: theme.colors.background }}
      screenOptions={{
        tabBarActiveTintColor: theme.colors.cyan,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface2,
          borderTopColor: 'rgba(155,91,255,0.18)',
          borderTopWidth: 1.5,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          shadowColor: theme.colors.purple,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          fontFamily: theme.typography.fontFamily.bold,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        },
        headerStyle: { backgroundColor: theme.colors.bgElevated },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '700', color: theme.colors.text },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon Icon={Crown} label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Slates',
          tabBarIcon: ({ focused }) => <TabIcon Icon={Zap} label="Slates" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ focused }) => <TabIcon Icon={ClipboardList} label="Results" focused={focused} hasBadge={hasUnviewedHits} />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Number Book',
          tabBarIcon: ({ focused }) => <TabIcon Icon={BookMarked} label="Number Book" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarIcon: ({ focused }) => <TabIcon Icon={GraduationCap} label="Learn" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} label="Profile" focused={focused} />,
        }}
      />
      <Tabs.Screen name="zk30" options={{ href: null }} />
      <Tabs.Screen name="coverage" options={{ href: null }} />
      <Tabs.Screen name="intelligence" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="admin-imports" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFocused: {
    backgroundColor: 'rgba(43,255,204,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(43,255,204,0.45)',
    shadowColor: theme.colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.hot,
    borderWidth: 1.5,
    borderColor: theme.colors.surface2,
  },
});
