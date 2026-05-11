import React, { Component } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '@/constants/theme';

// ─── Error Boundary ───────────────────────────────────────────────────────────
export class ErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: string },
  { error: Error | null }
> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 28, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#ef4444', marginBottom: 8, textAlign: 'center' }}>
            {this.props.fallback ?? 'Something went wrong'}
          </Text>
          <Text style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', fontFamily: 'Courier' }}>
            {this.state.error.message}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#3b82f6', borderRadius: 10 }}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>↺ Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ImportRecord {
  id: string; type: string; class_id: number | null; horizon_label: string | null;
  scope: string; status: string; accepted: number; rejected: number; fixed: number;
  warnings: string[]; created_at: string; p99: number | null;
  first_seen: string | null; last_seen: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const HORIZONS = ['H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y'];

export const MOCK_IMPORTS: ImportRecord[] = [
  { id:'i1', type:'box_history', class_id:1, horizon_label:'H01Y', scope:'midday', status:'completed', accepted:847, rejected:3, fixed:12, warnings:['3 rows had DS<0, auto-set to 0'], created_at:'2026-04-12T10:31:00', p99:287, first_seen:'2025-01-01', last_seen:'2026-04-12' },
  { id:'i2', type:'pair_history', class_id:2, horizon_label:'H01Y', scope:'midday', status:'completed', accepted:612, rejected:0, fixed:4, warnings:[], created_at:'2026-04-12T10:35:00', p99:198, first_seen:'2025-01-01', last_seen:'2026-04-12' },
  { id:'i3', type:'pair_history', class_id:3, horizon_label:'H01Y', scope:'midday', status:'completed', accepted:608, rejected:1, fixed:2, warnings:['1 pair key zero-padded'], created_at:'2026-04-12T10:38:00', p99:201, first_seen:'2025-01-01', last_seen:'2026-04-12' },
  { id:'i4', type:'box_history', class_id:1, horizon_label:'H01Y', scope:'evening', status:'completed', accepted:831, rejected:5, fixed:9, warnings:['5 rows rejected: invalid date format'], created_at:'2026-04-11T18:20:00', p99:312, first_seen:'2025-01-02', last_seen:'2026-04-11' },
  { id:'i5', type:'ledger', class_id:null, horizon_label:null, scope:'allday', status:'completed', accepted:1240, rejected:0, fixed:0, warnings:[], created_at:'2026-04-11T09:00:00', p99:null, first_seen:'2024-01-01', last_seen:'2026-04-11' },
  { id:'i6', type:'daily_input', class_id:null, horizon_label:null, scope:'midday', status:'completed', accepted:22, rejected:0, fixed:0, warnings:[], created_at:'2026-04-13T14:00:00', p99:null, first_seen:null, last_seen:null },
  { id:'i7', type:'box_history', class_id:1, horizon_label:'H02Y', scope:'allday', status:'failed', accepted:0, rejected:0, fixed:0, warnings:['Schema error: missing DrawsSince column'], created_at:'2026-04-10T11:00:00', p99:null, first_seen:null, last_seen:null },
];

export const IMPORT_TYPES = [
  { id:'box_history', icon:'📦', label:'Box History', desc:'Unordered combo frequency data.\nOne file per scope × horizon (H01Y–H10Y).', color:theme.colors.primary, headers:['Combo','Times Drawn','Expected','Last Seen','Draws Since'] },
  { id:'pair_history', icon:'🔗', label:'Pair History', desc:'Pair class frequency data.\nClasses 2–11, one file per class × scope × horizon.', color:theme.colors.primary, headers:['Pair','TimesDrawn','LastSeen','DrawsSince'] },
  { id:'daily_input', icon:'📅', label:'Daily Input', desc:'Today\'s draw results for DrawsSince rescoring.\nSame shape as Box History.', color:theme.colors.gold, headers:['Combo','ComboSet','TimesDrawn','LastSeen','DrawsSince'] },
  { id:'ledger', icon:'📋', label:'Results Ledger', desc:'Paste raw results from lotterypost.com.\nAuto-parses state names, dates, and digits.', color:theme.colors.success, headers:['State Name (header)', 'Game\tDate\tResult (rows)'] },
];

export const PAIR_CLASSES = [
  {id:2, label:'Front Pair Straight (AB)'}, {id:3, label:'Back Pair Straight (BC)'}, {id:4, label:'Split Pair Straight (AC)'},
  {id:5, label:'Front Pair Box {A,B}'}, {id:6, label:'Back Pair Box {B,C}'}, {id:7, label:'Split Pair Box {A,C}'},
  {id:8, label:'Front from Box Sort'}, {id:9, label:'Back from Box Sort'}, {id:10, label:'Split from Box Sort'},
  {id:11, label:'Any Position Box'},
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '30' }}>
      <Text style={{ fontSize: 9, fontWeight: '800', color }}>{label}</Text>
    </View>
  );
}
export function SectionTitle({ children }: { children: string }) {
  return <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, marginTop: 20 }}>{children}</Text>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.soft }, style]}>{children}</View>;
}
export function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
export const st = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  optBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1.5, borderColor: theme.colors.border },
  optBtnOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  optBtnText: { fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary },
  optBtnTextOn: { color: theme.colors.primary, fontWeight: '700' },
  btnPrimary: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnGhost: { backgroundColor: theme.colors.surfaceLight, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnGhostText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 12 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'transparent' },
  filterBtnOn: { backgroundColor: theme.colors.primary },
  filterBtnText: { fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary },
  csvInput: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 10, padding: 12, fontSize: 11, color: theme.colors.text, backgroundColor: theme.colors.surface, height: 160, fontFamily: 'Courier' },
});
