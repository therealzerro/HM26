/* ============================================================================
   PublishStage — hidden 1080×1920 reel capture stage for the Publish console
   ----------------------------------------------------------------------------
   Mirrors the admin image-export stage: renders a slate composite or a single
   pick poster off-screen at exact export dimensions so html-to-image reads
   pixel-perfect output via the forwarded ref. Redaction (mosaic picks + JOIN
   FREE banner) is applied for PUBLIC / cross-post surfaces (§6); FREE/PRO get
   full fidelity.
   ============================================================================ */

import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { SlatePosterCard } from '@/components/SlatePosterCard';
import { PickPosterCard } from '@/components/PickPosterCard';
import { PublicExportBanner } from '@/components/PublicExportBanner';
import type { PickItem } from '@/components/PickCard';
import { theme } from '@/constants/theme';
import {
  EXPORT_WIDTH, EXPORT_HEIGHT,
} from '@/lib/captureExportImage';
import {
  STAGE_LOGICAL_WIDTH, STAGE_SCALE, LOGICAL_BANNER_HEIGHT, LOGICAL_SAFE_BUFFER,
  logicalPosterHeight, type SocialSession,
} from '@/lib/social/publishImages';

const SESSION_LABELS: Record<SocialSession, string> = {
  midday: 'Daytime', evening: 'Nighttime', allday: 'Continuous',
};

export interface PublishStageProps {
  mode: 'slate' | 'pick';
  picks: PickItem[] | null;
  pick: PickItem | null;
  pairScores?: { front: number; back: number; split: number } | null;
  session: SocialSession;
  slateDate: string;
  redact: boolean;
}

export const PublishStage = forwardRef<View, PublishStageProps>(function PublishStage(
  { mode, picks, pick, pairScores, session, slateDate, redact }, ref,
) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const posterH = logicalPosterHeight(redact);

  return (
    <View
      ref={ref as any}
      collapsable={false}
      style={[s.stage, { width: EXPORT_WIDTH, height: EXPORT_HEIGHT, backgroundColor: colors.background }]}
    >
      {mode === 'slate' && picks && (
        <View style={s.scaleWrap}>
          <View style={{ width: STAGE_LOGICAL_WIDTH, height: posterH, padding: 14, backgroundColor: colors.background }}>
            <View style={s.slateHeader}>
              <Text style={s.slateBrand}>HITMASTER <Text style={{ color: colors.cyan }}>ZK6</Text></Text>
              <Text style={s.slateMeta}>{SESSION_LABELS[session].toUpperCase()} · {slateDate}</Text>
            </View>
            <View style={s.slateGrid}>
              {[0, 1, 2].map(row => (
                <View key={row} style={s.slateRow}>
                  {picks.slice(row * 2, row * 2 + 2).map(p => (
                    <SlatePosterCard key={`stage-${p.rank}`} pick={p} redact={redact} />
                  ))}
                </View>
              ))}
            </View>
            <Text style={s.slateFooter}>Intelligence is your edge. Use it.</Text>
          </View>
          {redact && (
            <>
              <PublicExportBanner height={LOGICAL_BANNER_HEIGHT} />
              <View style={[s.safeBuffer, { height: LOGICAL_SAFE_BUFFER }]} />
            </>
          )}
        </View>
      )}

      {mode === 'pick' && pick && (
        <View style={s.scaleWrap}>
          <PickPosterCard
            pick={pick}
            scope={session}
            pairScores={pairScores ?? undefined}
            redact={redact}
            height={posterH}
          />
          {redact && (
            <>
              <PublicExportBanner height={LOGICAL_BANNER_HEIGHT} />
              <View style={[s.safeBuffer, { height: LOGICAL_SAFE_BUFFER }]} />
            </>
          )}
        </View>
      )}
    </View>
  );
});

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  // Laid out at the viewport origin so the browser actually paints it
  // (Chrome/Safari skip paint for elements far outside the viewport, which
  // makes html-to-image emit a BLANK image). A translate moves the painted
  // layer off-screen after paint; captureNodeToPng neutralizes the transform
  // at capture time. Identical to the admin image-export stage.
  stage: {
    position: 'absolute',
    top: 0,
    left: 0,
    transform: [{ translateX: 5000 }],
    pointerEvents: 'none',
  },
  scaleWrap: {
    width: STAGE_LOGICAL_WIDTH,
    height: EXPORT_HEIGHT / STAGE_SCALE,
    transform: [{ scale: STAGE_SCALE }] as any,
    transformOrigin: '0 0' as any,
    backgroundColor: colors.background,
  },
  slateHeader: { alignItems: 'center', gap: 3, paddingBottom: 8 },
  slateBrand: { color: colors.text, fontSize: 14, fontWeight: '900', letterSpacing: 2.4, fontFamily: theme.typography.fontFamily.monoBold },
  slateMeta: { color: colors.cyan, fontSize: 8, fontWeight: '800', letterSpacing: 1, fontFamily: theme.typography.fontFamily.mono },
  slateGrid: { flex: 1, gap: 6 },
  slateRow: { flexDirection: 'row', gap: 6, flex: 1 },
  slateFooter: { color: colors.textTertiary, fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  safeBuffer: { width: '100%', backgroundColor: colors.background },
});
