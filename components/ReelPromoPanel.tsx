// MKT-11 — rotating promo panel at the foot of the pick-detail modal.
//
// APP-WIDE: every user sees it, free and subscribed. It is a product surface,
// not a marketing overlay — the slot is destined to carry ads for free users
// and in-house panels for subscribers, so the component is deliberately dumb
// about tier and just renders whatever the rotation selects for this pick.
//
// Artwork is fetched from the public `app-panels` bucket rather than bundled:
// no app-size cost, works on web and native, and artwork can be swapped without
// an app release. A failure to load renders nothing — never a broken frame.
import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { panelForRank, panelUrl } from '@/constants/reelPanels';

interface ReelPromoPanelProps {
  /** Pick rank 1-6 — selects which panel in the day's rotation. */
  rank: number;
  /** Slate date (YYYY-MM-DD) the rotation is derived from. */
  dateISO: string;
  style?: StyleProp<ViewStyle>;
}

export function ReelPromoPanel({ rank, dateISO, style }: ReelPromoPanelProps) {
  const panel = panelForRank(dateISO, rank);
  const uri = panel ? panelUrl(panel.file) : null;
  const [ratio, setRatio] = useState<number | null>(null);

  // Panel band aspects differ per file (measured 2.97:1 to 4.40:1), so the
  // height is derived from the image rather than assumed — a fixed height would
  // letterbox some and crop others. Until it resolves, render nothing: a
  // guessed height would make the modal jump when the real one arrives.
  useEffect(() => {
    if (!uri) return;
    let alive = true;
    setRatio(null);
    Image.getSize(uri, (w, h) => { if (alive && h > 0) setRatio(w / h); }, () => { /* unreachable artwork — stay hidden */ });
    return () => { alive = false; };
  }, [uri]);

  if (!uri || !ratio) return null;

  return (
    <View style={[{ marginTop: 18 }, style]} pointerEvents="none">
      <Image
        source={{ uri }}
        style={{ width: '100%', aspectRatio: ratio }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
