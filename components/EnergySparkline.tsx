import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';

interface Props {
  // ordered ascending by date — last entry is "today"
  series: number[];
  // optional override for the highlighted point; defaults to last value
  highlight?: number;
  // optional label suffix
  scopeLabel?: string;
  width?: number;
  height?: number;
}

export function EnergySparkline({ series, highlight, scopeLabel, width = 320, height = 48 }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const stats = useMemo(() => {
    const valid = series.filter(v => Number.isFinite(v) && v > 0);
    if (valid.length === 0) return null;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
    const today = highlight ?? series[series.length - 1] ?? 0;
    return { min, max, avg, today };
  }, [series, highlight]);

  if (!stats || series.length < 2) {
    return (
      <View style={s.empty}>
        <Text style={s.emptySub}>Not enough history yet to plot energy trend.</Text>
      </View>
    );
  }

  // Coordinate space: leave 8px padding top/bottom for stroke; chart width 100%
  const padX = 6;
  const padY = 8;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const xStep = series.length > 1 ? chartW / (series.length - 1) : 0;
  const yScale = (v: number) => {
    if (stats.max === stats.min) return padY + chartH / 2;
    return padY + (1 - (v - stats.min) / (stats.max - stats.min)) * chartH;
  };
  const points = series.map((v, i) => `${padX + i * xStep},${yScale(v || stats.min)}`).join(' ');
  const lastX = padX + (series.length - 1) * xStep;
  const lastY = yScale(series[series.length - 1] || stats.min);
  const avgY = yScale(stats.avg);

  const todayVsAvg = stats.today - stats.avg;
  const todayHotter = todayVsAvg > 0;
  const todayColor = todayHotter ? colors.hot : todayVsAvg < 0 ? colors.textTertiary : colors.cyan;

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.headerLabel}>30-DAY ENERGY{scopeLabel ? ` · ${scopeLabel}` : ''}</Text>
        <Text style={s.headerStat}>
          today <Text style={[s.headerStatNum, { color: todayColor }]}>{stats.today}</Text>
          <Text style={s.headerSep}> · </Text>
          avg <Text style={s.headerStatNum}>{stats.avg}</Text>
        </Text>
      </View>
      <Svg width={width} height={height}>
        {/* Average reference line */}
        <Line
          x1={padX} y1={avgY} x2={width - padX} y2={avgY}
          stroke={colors.border} strokeWidth={1} strokeDasharray="3 3"
        />
        {/* Polyline */}
        <Polyline
          points={points}
          fill="none"
          stroke={colors.cyan + 'AA'}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Today's marker */}
        <Circle cx={lastX} cy={lastY} r={3.5} fill={todayColor} stroke={colors.bgElevated} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 },
  headerLabel: { fontSize: 8, fontWeight: '900', color: colors.textTertiary, letterSpacing: 1.3, fontFamily: theme.typography.fontFamily.monoBold },
  headerStat: { fontSize: 9, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  headerStatNum: { fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold },
  headerSep: { color: colors.textTertiary },
  empty: { marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  emptySub: { fontSize: 11, color: colors.textTertiary, fontStyle: 'italic' },
});
