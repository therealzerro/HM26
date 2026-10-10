/* ============================================================================
   BriefFrameCard — the ANCHOR presents the Pro brief (MKT-82 Phase 2, 10/10)
   ----------------------------------------------------------------------------
   A generated anchor frame (static PNG, blank glowing screen — registry in
   lib/social/briefFrames.ts) with the day's brief rendered BY CODE into the
   frame's measured screen rectangle. Exact digits, branded frame; the image
   generator never carries a digit.

   Same model + same lint + same fit assert as the plain card: the strings
   come from buildBriefModel() (Pro), lintBrief() has already passed before
   this mounts, and `onFit` reports whether the screen content fit its rect.

   Logical 540×675 → captured at pixelRatio 2 = 1080×1350 (4:5). The frame's
   928×1152 source is drawn with `cover`, which crops 3 source px per side —
   exactly the 4:5 crop the gate measured, so outputRect() lands on the glass.
   Digit floor (F6): ≥ 31.5 px at 1080 → 17 pt logical here = 34 px.
   ============================================================================ */

import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Platform, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Asset } from 'expo-asset';
import type { SocialBriefData } from '@/lib/social/socialBrief';
import { buildBriefModel, BRIEF_COPY, setBraces, type BriefRow, type BriefSession } from '@/lib/social/briefCopy';
import { BRIEF_FRAME_IMAGES, outputRect, type BriefFrame } from '@/lib/social/briefFrames';
import type { BriefFit } from '@/components/social/SocialBriefCard';

const C = {
  purpleSoft: '#C084FC', gold: '#FBBF24', goldSoft: '#FCD34D', cyan: '#06B6D4', cyanSoft: '#67E8F9', green: '#34D399',
  text: '#FFFFFF', textDim: 'rgba(255,255,255,0.70)', textFaint: 'rgba(255,255,255,0.45)', hair: 'rgba(255,255,255,0.10)',
  glass: 'rgba(10,8,22,0.55)', tile: 'rgba(168,85,247,0.14)', tileEdge: 'rgba(168,85,247,0.35)',
};
const MONO = 'monospace';
const LOGICAL_W = 540, LOGICAL_H = 675;   // ×2 = 1080×1350

export interface BriefFrameCardProps {
  data: SocialBriefData;
  frame: BriefFrame;
  /** ET date "YYYY-MM-DD" for the header ("SAT · OCT 10"). */
  dateISO: string;
  onFit?: (fit: BriefFit) => void;
}

export function headerDate(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const mo = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${wd} · ${mo} ${d.getDate()}`;
}

function tagColor(tag: BriefRow['tag']): string {
  if (tag === 'STRAIGHT MATCH') return C.goldSoft;
  if (tag === 'BOX MATCH') return C.green;
  return C.textFaint;
}

export const BriefFrameCard = forwardRef<View, BriefFrameCardProps>(function BriefFrameCard({ data, frame, dateISO, onFit }, ref) {
  const model = useMemo(() => buildBriefModel(data, 'group', 'pro'), [data]);
  // html-to-image embeds <img> sources by URL and kept serving the FIRST
  // frame's pixels for a second frame captured in the same page (10/10, even
  // with a per-frame query string). On web the frame is therefore decoded to
  // a DATA URL first — nothing to cache, nothing to fetch at capture time —
  // and the fit is only reported once the image has actually loaded, so a
  // phone never captures an empty frame.
  const [frameUri, setFrameUri] = useState<string | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(Platform.OS !== 'web');
  useEffect(() => {
    let alive = true;
    setFrameUri(null); setFrameLoaded(Platform.OS !== 'web');
    if (Platform.OS !== 'web') return;
    const uri = Asset.fromModule(BRIEF_FRAME_IMAGES[frame.key]).uri;
    fetch(`${uri}${uri.includes('?') ? '&' : '?'}hmframe=${frame.key}&t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.blob())
      .then(b => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); }))
      .then(d => { if (alive) setFrameUri(d); })
      .catch(() => { if (alive) setFrameUri(null); });
    return () => { alive = false; };
  }, [frame.key]);
  const frameSource = Platform.OS === 'web' ? (frameUri ? { uri: frameUri } : null) : BRIEF_FRAME_IMAGES[frame.key];
  const r = outputRect(frame);
  const screen = { left: r.x / 2, top: r.y / 2, width: r.w / 2, height: r.h / 2 };

  const [bandH, setBandH] = useState<number | null>(null);
  const [contentH, setContentH] = useState<number | null>(null);
  const naturalRef = useRef<number | null>(null);
  useEffect(() => {
    if (bandH == null || contentH == null) return;
    if (naturalRef.current == null) naturalRef.current = contentH;
    if (!frameLoaded) return;   // the frame pixels must be on screen before a capture is allowed
    onFit?.({ ok: naturalRef.current <= bandH + 0.5, contentH: naturalRef.current, bandH });
  }, [bandH, contentH, frameLoaded, onFit]);

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {frameSource ? <Image source={frameSource} style={styles.frame} resizeMode="cover" onLoad={() => setFrameLoaded(true)} /> : null}
      {/* the glass: measured rect, clipped, slightly inset from the glow line */}
      <View style={[styles.screen, screen]} onLayout={(e: LayoutChangeEvent) => setBandH(e.nativeEvent.layout.height - 2 * PAD)}>
        <View style={styles.glassTint} pointerEvents="none" />
        <View style={styles.content} onLayout={(e: LayoutChangeEvent) => setContentH(e.nativeEvent.layout.height)}>
          <View style={styles.header}>
            <Text style={styles.brand}>{BRIEF_COPY.brand} <Text style={{ color: C.cyan }}>{BRIEF_COPY.brandAccent}</Text></Text>
            <Text style={styles.kicker}>{BRIEF_COPY.kickerPro}</Text>
            <Text style={styles.date}>{headerDate(dateISO)}</Text>
          </View>

          <Text style={styles.section}>{model.todayLabel}</Text>
          {(model.sessions ?? []).map((s, i) => <Session key={i} s={s} />)}

          <Text style={[styles.section, { marginTop: 3 }]}>{model.yesterdayLabel}</Text>
          {(model.yesterdayRows ?? []).map((row, i) => (
            <View key={i} style={styles.yRow}>
              <Text style={styles.yScope}>{row.scopeLabel}</Text>
              <Text style={[styles.yTag, { color: tagColor(row.tag) }]}>{row.tag}</Text>
              <Text style={styles.yChips} numberOfLines={1}>{row.chips.join('  ')}</Text>
            </View>
          ))}

          <Text style={styles.footer}>{model.footer}</Text>
        </View>
        {/* 2.5: faint scanlines so it reads as ON the screen — 4% lines, no contrast loss */}
        <View style={styles.scanlines} pointerEvents="none">
          {Array.from({ length: Math.floor(screen.height / 3) }, (_, i) => <View key={i} style={styles.scanline} />)}
        </View>
      </View>
    </View>
  );
});

function Session({ s }: { s: BriefSession }) {
  return (
    <View style={styles.session}>
      <View style={styles.sessionHead}>
        <Text style={styles.sessionScope}>{s.scopeLabel.toUpperCase()}</Text>
        {s.state && <Text style={[styles.sessionState, { color: s.resolved ? (s.resolved.tag === 'STRAIGHT MATCH' ? C.goldSoft : C.green) : C.cyanSoft }]}>{s.state}</Text>}
      </View>
      {s.resolved ? (
        <Text style={[styles.resolved, { color: s.resolved.tag === 'STRAIGHT MATCH' ? C.goldSoft : C.green }]}>{s.resolved.tag}  <Text style={styles.resolvedChips}>{s.resolved.chips.join('  ')}</Text></Text>
      ) : s.miss || s.none ? (
        <Text style={styles.miss}>{s.miss ?? s.none}</Text>
      ) : (
        <View style={styles.signalRow}>
          {(s.signals ?? []).map((g, i) => (
            <View key={i} style={styles.signal}>
              <Text style={styles.digits}>{g.digits}</Text>
              <Text style={styles.set}>{setBraces(g.set)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const PAD = 6;

const styles = StyleSheet.create({
  card: { width: LOGICAL_W, height: LOGICAL_H, backgroundColor: '#0A0A0F', overflow: 'hidden' },
  frame: { position: 'absolute', left: 0, top: 0, width: LOGICAL_W, height: LOGICAL_H },
  screen: { position: 'absolute', overflow: 'hidden', padding: PAD, borderRadius: 2 },
  glassTint: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: C.glass },
  content: { flexShrink: 0 },
  scanlines: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, gap: 2 },
  scanline: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)' },

  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 },
  brand: { color: C.text, fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8 },
  kicker: { color: C.purpleSoft, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 2 },
  date: { color: C.textDim, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 1.5, fontFamily: MONO },
  section: { color: C.textFaint, fontSize: 6.5, lineHeight: 8, fontWeight: '800', letterSpacing: 2, marginBottom: 1 },

  session: { marginBottom: 2 },
  sessionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionScope: { color: C.cyanSoft, fontSize: 7, lineHeight: 9, fontWeight: '900', letterSpacing: 1.6 },
  sessionState: { fontSize: 6.5, lineHeight: 9, fontWeight: '900', letterSpacing: 0.8, fontFamily: MONO },
  signalRow: { flexDirection: 'row', gap: 3, marginTop: 1 },
  signal: { flex: 1, alignItems: 'center', backgroundColor: C.tile, borderWidth: 0.5, borderColor: C.tileEdge, borderRadius: 4, paddingVertical: 1 },
  // 17 pt logical = 34 px at 1080 ≥ the 31.5 px floor (F6)
  digits: { color: C.text, fontSize: 17, lineHeight: 19, fontWeight: '900', fontFamily: MONO, letterSpacing: 1.2 },
  set: { color: C.textFaint, fontSize: 7, lineHeight: 8, fontFamily: MONO },
  resolved: { fontSize: 9, lineHeight: 12, fontWeight: '900', fontFamily: MONO, letterSpacing: 0.4, marginTop: 1 },
  resolvedChips: { color: C.green, fontWeight: '700' },
  miss: { color: C.textFaint, fontSize: 8, lineHeight: 11, fontStyle: 'italic', marginTop: 1 },

  yRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 0.5, borderTopWidth: 0.5, borderTopColor: C.hair },
  yScope: { width: 42, color: C.purpleSoft, fontSize: 8, lineHeight: 11, fontWeight: '800' },
  yTag: { width: 78, fontSize: 7.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.4, fontFamily: MONO },
  yChips: { flex: 1, color: C.green, fontSize: 7.5, lineHeight: 11, fontFamily: MONO, fontWeight: '700' },

  footer: { color: C.textFaint, fontSize: 6, lineHeight: 8.5, fontWeight: '700', marginTop: 3 },
});
