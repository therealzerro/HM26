// MKT-11 — rotating promo panel at the foot of the pick-detail modal.
//
// RENDERS ONLY DURING REEL CAPTURE. render-allday-body.ts drives the real app
// as a premium user, so an unconditional panel here would be a house ad inside
// a paid product for every subscriber. The renderer sets CAPTURE_FLAG_KEY in
// localStorage before the page loads; nothing else ever does, so this is null
// in the shipped app — on native the artwork is not even bundled (the panels
// are served as URIs from the web dev server, never require()d).
import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CAPTURE_FLAG_KEY, PANEL_URL_BASE, panelForRank, type ReelPanel,
} from '@/constants/reelPanels';

interface ReelPromoPanelProps {
  /** Pick rank 1-6 — selects which panel in the day's rotation. */
  rank: number;
  /** Slate date (YYYY-MM-DD) the rotation is derived from. */
  dateISO: string;
  style?: StyleProp<ViewStyle>;
}

export function ReelPromoPanel({ rank, dateISO, style }: ReelPromoPanelProps) {
  const [panel, setPanel] = useState<ReelPanel | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CAPTURE_FLAG_KEY)
      .then(v => { if (alive && v === '1') setPanel(panelForRank(dateISO, rank)); })
      .catch(() => { /* not in capture — stay hidden */ });
    return () => { alive = false; };
  }, [rank, dateISO]);

  // Panel band aspects differ per file (measured 2.97:1 to 4.40:1), so the
  // height is derived from the image rather than assumed — a fixed height would
  // letterbox some and crop others.
  useEffect(() => {
    if (!panel) return;
    let alive = true;
    const uri = `${PANEL_URL_BASE}/${panel.file}`;
    Image.getSize(uri, (w, h) => { if (alive && h > 0) setRatio(w / h); }, () => { /* leave unrendered */ });
    return () => { alive = false; };
  }, [panel]);

  if (!panel || !ratio) return null;

  return (
    <View style={[{ marginTop: 18 }, style]} pointerEvents="none">
      <Image
        source={{ uri: `${PANEL_URL_BASE}/${panel.file}` }}
        style={{ width: '100%', aspectRatio: ratio }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
