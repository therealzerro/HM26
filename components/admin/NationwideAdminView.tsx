import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { SectionTitle, Card, useSt } from './AdminShared';

// ─── Nationwide Admin View ────────────────────────────────────────────────────
export default function NationwideAdminView() {
  const { colors } = useTheme();
  const st = useSt();
  const [url, setUrl] = useState('https://www.thelotter.com');
  const [note, setNote] = useState('Legal lottery concierge service — buy tickets in 40+ states from home.');
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  const SERVICES = [
    ['TheLotter', 'https://www.thelotter.com', 'Largest multi-state lottery concierge, 40+ US states'],
    ['Jackpot.com', 'https://www.jackpot.com', 'US-focused, easy interface, multiple states'],
    ['LottoMaster', 'https://www.lottomaster.com', 'Specialty Pick 3/4 focus'],
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 }}>🌎 Nationwide Play Admin</Text>
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>Configure the secret Pro feature — legal nationwide lottery access</Text>
      <Card style={{ padding: 14, marginBottom: 14, backgroundColor: colors.successLight, borderColor: colors.success + '33' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.success, marginBottom: 6 }}>ℹ️ What This Feature Does</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 19 }}>Pro subscribers gain access to a curated guide showing how to legally play Pick 3 across multiple US states. Third-party lottery concierge services purchase tickets on the player's behalf.</Text>
      </Card>
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Enable for Pro subscribers</Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>If OFF, the Learn screen hides the nationwide play section</Text>
          </View>
          <TouchableOpacity onPress={() => setEnabled(e => !e)} style={{ width: 42, height: 22, borderRadius: 11, backgroundColor: enabled ? colors.success : colors.surfaceMuted, justifyContent: 'center', paddingHorizontal: 3 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: enabled ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
      </Card>
      <SectionTitle>SERVICE URL</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Nationwide Play URL</Text>
        <TextInput style={[st.csvInput, { height: 44, fontFamily: theme.typography.fontFamily.mono, fontSize: 12, color: colors.primary, textAlignVertical: 'center' }]} value={url} onChangeText={setUrl} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1, marginBottom: 6, marginTop: 10, textTransform: 'uppercase' }}>Description for Pro users</Text>
        <TextInput style={[st.csvInput, { height: 72 }]} value={note} onChangeText={setNote} multiline textAlignVertical="top" />
      </Card>
      <SectionTitle>RECOMMENDED SERVICES</SectionTitle>
      <Card style={{ padding: 0 }}>
        {SERVICES.map(([name, link, desc], i) => (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: i < SERVICES.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{name}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>{desc}</Text>
            </View>
            <TouchableOpacity style={[st.btnGhost, { borderWidth: 1, borderColor: url === link ? colors.primary : colors.border, backgroundColor: url === link ? colors.primaryLight : 'transparent' }]} onPress={() => setUrl(link)}>
              <Text style={[st.btnGhostText, url === link && { color: colors.primary }]}>{url === link ? '✓ Selected' : 'Use'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Card>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <TouchableOpacity style={[st.btnPrimary, { flex: 1 }]} onPress={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}>
          <Text style={st.btnPrimaryText}>{saved ? '✓ Saved!' : '💾 Save Settings'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
