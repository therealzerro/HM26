import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAppMode } from '@/context/AppModeContext';

const PURPLE = '#7c3aed';
const BLUE   = '#0ea5e9';

export function AppModeToggle() {
  const { mode, setMode } = useAppMode();

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#1e1e2e',
      borderRadius: 99,
      padding: 3,
    }}>
      <TouchableOpacity
        onPress={() => setMode('zk6')}
        activeOpacity={0.8}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 99,
          backgroundColor: mode === 'zk6' ? PURPLE : 'transparent',
        }}
      >
        <Text style={{
          fontSize: 12,
          fontWeight: '800',
          color: mode === 'zk6' ? '#fff' : PURPLE + '80',
          letterSpacing: 0.5,
        }}>
          ZK6
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setMode('zk30')}
        activeOpacity={0.8}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 99,
          backgroundColor: mode === 'zk30' ? BLUE : 'transparent',
        }}
      >
        <Text style={{
          fontSize: 12,
          fontWeight: '800',
          color: mode === 'zk30' ? '#fff' : BLUE + '80',
          letterSpacing: 0.5,
        }}>
          ZK30
        </Text>
      </TouchableOpacity>
    </View>
  );
}
