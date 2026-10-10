/* ============================================================================
   /brief-capture — headless capture harness for the SOCIAL BRIEF (MKT-82)
   ----------------------------------------------------------------------------
   Mounts the SAME exporter the Admin → 🎬 Reels screen uses (SocialBriefExport:
   buildSocialBrief → lintBrief → fit assert → html-to-image ×2 → download), so
   scripts/render-social-brief.ts can drive it with Playwright and hand the
   operator the real PNGs. Read-only: the exporter performs no write, which is
   why it can sit outside the SEC-05 ops-key gate (that gate guards writes).
   Admin role only (the rig sets it in localStorage before load); everyone else
   sees one line. Not linked from any tab.
   ============================================================================ */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { SocialBriefExport } from '@/components/admin/ReelsView';

export default function BriefCaptureScreen() {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F' }}>
        <Text style={{ color: '#888', fontSize: 12 }}>operator only</Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0A0A0F' }} contentContainerStyle={{ padding: 12 }}>
      <Text style={{ color: '#67E8F9', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 }}>
        SOCIAL BRIEF — CAPTURE HARNESS (same exporter as Admin → Reels)
      </Text>
      <SocialBriefExport />
    </ScrollView>
  );
}
