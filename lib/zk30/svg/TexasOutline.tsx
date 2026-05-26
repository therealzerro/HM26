// lib/zk30/svg/TexasOutline.tsx
//
// Texas state silhouette — simplified outline normalized to a 100x100 viewBox.
// Used as the ZK30 masthead watermark behind the picks grid.
//
// This is a hand-simplified approximation: the canonical TX boundary has
// hundreds of points along the Rio Grande, which a watermark doesn't need.
// The shape preserves the four recognizable features:
//   • panhandle rectangle (top-left)
//   • Oklahoma border (top-right slope)
//   • Gulf coast curve (south-east)
//   • Brownsville point (south tip)
// If you want a more cartographically accurate path later, swap the `d`
// attribute with the standard SVG from e.g. wikipedia commons (normalized
// to the same 100x100 viewBox).

import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size: number;
  color?: string;       // fill color (defaults to sky-500)
  opacity?: number;     // 0..1 (defaults to 0.06 per ARCH-09 spec)
}

const TX_PATH =
  'M22,18 L22,7 L46,7 L46,18 L82,18 L84,23 L89,27 L91,33 L89,40 L92,46 L89,54 L86,62 L79,72 L69,80 L60,82 L55,78 L50,82 L42,78 L32,72 L22,64 L15,54 L11,44 L13,32 L18,24 Z';

export function TexasOutline({ size, color = '#0ea5e9', opacity = 0.06 }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      // pointerEvents handled at the call site via the wrapping <View>.
    >
      <Path d={TX_PATH} fill={color} opacity={opacity} />
    </Svg>
  );
}
