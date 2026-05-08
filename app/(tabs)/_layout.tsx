import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { theme } from '@/constants/theme';

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

export default function TabLayout() {

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.cyan,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.bgElevated,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          fontFamily: theme.typography.fontFamily.medium,
        },
        headerStyle: {
          backgroundColor: theme.colors.bgElevated,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '700',
          color: theme.colors.text,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon emoji="🏠" />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Slates',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon emoji="⚡" />
          ),
        }}
      />
      <Tabs.Screen
        name="zk30"
        options={{
          title: 'ZK30',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon emoji="🎯" />
          ),
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon emoji="📋" />
          ),
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Number Book',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon emoji="📖" />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon emoji="🎓" />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon emoji="♛" />
          ),
        }}
      />
      <Tabs.Screen name="coverage" options={{ href: null }} />
      <Tabs.Screen name="intelligence" options={{ href: null }} />
      {/* Admin — hidden from tab bar, accessible via triple-tap on logo */}
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="admin-imports" options={{ href: null }} />
    </Tabs>
  );
}
