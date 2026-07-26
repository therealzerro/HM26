import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens, type ShadowTokens } from '@/lib/theme';
import { getETHour, getETMinutes } from '@/lib/dateUtils';

interface DrawEntry {
  state: string;
  label: string;
  time: string;
  m: number;
  session: 'midday' | 'evening';
}

const DRAWS: DrawEntry[] = [
  // midday
  {state:"TN",label:"TN Morning",time:"9:53 AM",m:593,session:'midday'},
  {state:"TX",label:"TX Morning",time:"10:44 AM",m:644,session:'midday'},
  {state:"OH",label:"OH Midday",time:"12:14 PM",m:734,session:'midday'},
  {state:"GA",label:"GA Midday",time:"12:14 PM",m:734,session:'midday'},
  {state:"MI",label:"MI Midday",time:"12:24 PM",m:744,session:'midday'},
  {state:"SC",label:"SC Midday",time:"12:30 PM",m:750,session:'midday'},
  {state:"NJ",label:"NJ Midday",time:"12:40 PM",m:760,session:'midday'},
  {state:"PA",label:"PA Midday",time:"12:50 PM",m:770,session:'midday'},
  {state:"TN",label:"TN Midday",time:"12:53 PM",m:773,session:'midday'},
  {state:"IA",label:"IA Midday",time:"12:58 PM",m:778,session:'midday'},
  {state:"IN",label:"IN Midday",time:"12:59 PM",m:779,session:'midday'},
  {state:"FL",label:"FL Midday",time:"1:00 PM",m:780,session:'midday'},
  {state:"KY",label:"KY Midday",time:"1:05 PM",m:785,session:'midday'},
  {state:"TX",label:"TX Day",time:"1:10 PM",m:790,session:'midday'},
  {state:"IL",label:"IL Midday",time:"1:25 PM",m:805,session:'midday'},
  {state:"DE",label:"DE Midday",time:"1:25 PM",m:805,session:'midday'},
  {state:"MO",label:"MO Midday",time:"1:30 PM",m:810,session:'midday'},
  {state:"VA",label:"VA Midday",time:"1:38 PM",m:818,session:'midday'},
  {state:"AR",label:"AR Midday",time:"1:44 PM",m:824,session:'midday'},
  {state:"ON",label:"ON Midday",time:"1:45 PM",m:825,session:'midday'},
  {state:"DC",label:"DC Midday",time:"1:45 PM",m:825,session:'midday'},
  {state:"CT",label:"CT Midday",time:"1:45 PM",m:825,session:'midday'},
  {state:"KS",label:"KS Midday",time:"1:55 PM",m:835,session:'midday'},
  {state:"WI",label:"WI Midday",time:"2:00 PM",m:840,session:'midday'},
  {state:"NY",label:"NY Midday",time:"2:00 PM",m:840,session:'midday'},
  // AZ added a midday drawing mid-2026 (verified vs schedule capture 2026-07-26)
  {state:"AZ",label:"AZ Midday",time:"2:29 PM",m:869,session:'midday'},
  {state:"NM",label:"NM Midday",time:"2:45 PM",m:885,session:'midday'},
  {state:"NC",label:"NC Midday",time:"2:45 PM",m:885,session:'midday'},
  {state:"CO",label:"CO Midday",time:"3:10 PM",m:910,session:'midday'},
  {state:"MS",label:"MS Midday",time:"3:15 PM",m:915,session:'midday'},
  {state:"ID",label:"ID Midday",time:"3:44 PM",m:944,session:'midday'},
  {state:"CA",label:"CA Midday",time:"3:45 PM",m:945,session:'midday'},
  // evening
  {state:"PA",label:"PA Evening",time:"6:25 PM",m:1105,session:'evening'},
  {state:"SC",label:"SC Evening",time:"6:30 PM",m:1110,session:'evening'},
  {state:"WV",label:"WV Evening",time:"6:34 PM",m:1114,session:'evening'},
  {state:"GA",label:"GA Evening",time:"6:44 PM",m:1124,session:'evening'},
  {state:"TN",label:"TN Evening",time:"6:53 PM",m:1133,session:'evening'},
  {state:"MI",label:"MI Evening",time:"6:53 PM",m:1133,session:'evening'},
  {state:"MN",label:"MN Evening",time:"7:00 PM",m:1140,session:'evening'},
  {state:"DE",label:"DE Evening",time:"7:00 PM",m:1140,session:'evening'},
  {state:"OH",label:"OH Evening",time:"7:14 PM",m:1154,session:'evening'},
  {state:"AR",label:"AR Evening",time:"7:44 PM",m:1184,session:'evening'},
  {state:"DC",label:"DC Evening",time:"7:45 PM",m:1185,session:'evening'},
  // AZ evening moved 9:45 → 8:45 PM with the mid-2026 schedule change
  {state:"AZ",label:"AZ Evening",time:"8:45 PM",m:1245,session:'evening'},
  {state:"QC",label:"QC Evening",time:"8:50 PM",m:1250,session:'evening'},
  {state:"IA",label:"IA Evening",time:"8:58 PM",m:1258,session:'evening'},
  {state:"IN",label:"IN Evening",time:"8:59 PM",m:1259,session:'evening'},
  {state:"NE",label:"NE Evening",time:"9:15 PM",m:1275,session:'evening'},
  {state:"FL",label:"FL Evening",time:"9:15 PM",m:1275,session:'evening'},
  {state:"CO",label:"CO Evening",time:"9:15 PM",m:1275,session:'evening'},
  {state:"CA",label:"CA Evening",time:"9:15 PM",m:1275,session:'evening'},
  {state:"WI",label:"WI Evening",time:"9:30 PM",m:1290,session:'evening'},
  {state:"MO",label:"MO Evening",time:"9:40 PM",m:1300,session:'evening'},
  {state:"OK",label:"OK Evening",time:"9:45 PM",m:1305,session:'evening'},
  {state:"ID",label:"ID Evening",time:"9:45 PM",m:1305,session:'evening'},
  {state:"KS",label:"KS Evening",time:"9:55 PM",m:1315,session:'evening'},
  {state:"NY",label:"NY Evening",time:"10:00 PM",m:1320,session:'evening'},
  {state:"MS",label:"MS Evening",time:"10:00 PM",m:1320,session:'evening'},
  {state:"IL",label:"IL Evening",time:"10:05 PM",m:1325,session:'evening'},
  {state:"CT",label:"CT Evening",time:"10:14 PM",m:1334,session:'evening'},
  {state:"ON",label:"ON Evening",time:"10:15 PM",m:1335,session:'evening'},
  {state:"LA",label:"LA Evening",time:"10:25 PM",m:1345,session:'evening'},
  {state:"WA",label:"WA Evening",time:"10:30 PM",m:1350,session:'evening'},
  {state:"VA",label:"VA Evening",time:"10:30 PM",m:1350,session:'evening'},
  {state:"NJ",label:"NJ Evening",time:"10:40 PM",m:1360,session:'evening'},
  {state:"KY",label:"KY Evening",time:"10:45 PM",m:1365,session:'evening'},
  {state:"NC",label:"NC Evening",time:"10:50 PM",m:1370,session:'evening'},
  {state:"TX",label:"TX Night",time:"10:55 PM",m:1375,session:'evening'},
  {state:"NM",label:"NM Evening",time:"11:15 PM",m:1395,session:'evening'},
];

function getNowMinutes(): number {
  const h = getETHour();
  const m = getETMinutes();
  return h * 60 + m;
}

function getUpcoming(scope: string): DrawEntry[] {
  const nowM = getNowMinutes();
  const candidates = scope === 'midday'
    ? DRAWS.filter(d => d.session === 'midday')
    : scope === 'evening'
    ? DRAWS.filter(d => d.session === 'evening')
    : DRAWS;
  const upcoming = candidates.filter(d => d.m > nowM).sort((a, b) => a.m - b.m);
  if (upcoming.length > 0) return upcoming;
  // Past all draws today — wrap to tomorrow's first draw
  return candidates.slice().sort((a, b) => a.m - b.m);
}

function getCountdownMs(drawMinutes: number): number {
  const nowM = getNowMinutes();
  let diffM = drawMinutes - nowM;
  if (diffM <= 0) diffM += 24 * 60; // wrap to next day
  return diffM * 60 * 1000 - (new Date().getSeconds() * 1000 + new Date().getMilliseconds());
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

interface DrawTickerProps {
  scope?: string;
}

export function DrawTicker({ scope = 'allday' }: DrawTickerProps) {
  const { colors, shadows } = useTheme();
  const s = useMemo(() => makeS(colors, shadows), [colors, shadows]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const upcoming = getUpcoming(scope);
  const next = upcoming[0];
  const next2 = upcoming.slice(1, 3);

  const countdownMs = next ? getCountdownMs(next.m) : 0;
  const isEvening = next?.session === 'evening';

  return (
    <View style={s.container}>
      <View style={s.main}>
        <Text style={s.icon}>{isEvening ? '🌙' : '☀️'}</Text>
        <View style={s.centerCol}>
          <Text style={s.nextLabel}>NEXT DRAW</Text>
          <Text style={s.drawName} numberOfLines={1}>{next?.label ?? '—'}</Text>
          <Text style={s.drawTime}>{next?.time ?? ''} ET</Text>
        </View>
        <View style={s.countdownBox}>
          <Text style={s.countdownText}>{formatCountdown(countdownMs)}</Text>
        </View>
      </View>
      {next2.length > 0 && (
        <View style={s.upNextRow}>
          <Text style={s.upNextLabel}>UP NEXT </Text>
          {next2.map((d, i) => (
            <Text key={i} style={s.upNextItem}>
              {d.session === 'evening' ? '🌙' : '☀️'} {d.label} {d.time}
              {i < next2.length - 1 ? '  ·  ' : ''}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const makeS = (colors: ColorTokens, shadows: ShadowTokens) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...shadows.glow,
    gap: 6,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: { fontSize: 22 },
  centerCol: { flex: 1 },
  nextLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: 1,
  },
  drawName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  drawTime: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
  countdownBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countdownText: {
    fontSize: 20,
    color: colors.text,
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 2,
  },
  upNextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  upNextLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textTertiary,
    letterSpacing: 1.5,
  },
  upNextItem: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
