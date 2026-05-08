import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { theme } from '@/constants/theme';

function TabIcon({ emoji, label }: { emoji: string; label: string }) {
  return (
    <Text
      style={{ fontSize: 20 }}
      accessible
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      {emoji}
    </Text>
  );
}

export default function TabLayout() {

  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: theme.colors.background }}
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
          tabBarIcon: () => <TabIcon emoji="🏠" label="Home" />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Slates',
          tabBarIcon: () => <TabIcon emoji="⚡" label="Slates" />,
        }}
      />
      <Tabs.Screen
        name="zk30"
        options={{
          title: 'ZK30',
          tabBarIcon: () => <TabIcon emoji="🎯" label="ZK30" />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: () => <TabIcon emoji="📋" label="Results" />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Number Book',
          tabBarIcon: () => <TabIcon emoji="📖" label="Number Book" />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarIcon: () => <TabIcon emoji="🎓" label="Learn" />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Profile',
          tabBarIcon: () => <TabIcon emoji="♛" label="Profile" />,
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
