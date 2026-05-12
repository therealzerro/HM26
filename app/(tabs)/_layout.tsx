import { Tabs } from 'expo-router';
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

function TabIcon({
  emoji,
  label,
  focused,
}: {
  emoji: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
      <Text
        style={[styles.icon, focused && styles.iconFocused]}
        accessible
        accessibilityLabel={label}
        accessibilityRole="image"
      >
        {emoji}
      </Text>
    </View>
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
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Slates',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" label="Slates" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="zk30"
        options={{
          title: 'ZK30',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" label="ZK30" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" label="Results" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Number Book',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📖" label="Number Book" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎓" label="Learn" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="♛" label="Profile" focused={focused} />,
        }}
      />
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
  icon: { fontSize: 18, opacity: 0.7 },
  iconFocused: { fontSize: 20, opacity: 1 },
});
