import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

/**
 * HitMaster brand mark — wraps the icon asset for consistent in-app
 * placements. The icon ships as a square PNG at 1024×1024 and gets
 * downscaled by RN to whatever `size` is requested.
 *
 * Two canonical sizes ship today:
 *   - `sm` (32px)  — Home header next to the title (subtle daily presence)
 *   - `lg` (88px)  — Paywall hero (the brand at the conversion moment)
 *
 * Add a `xl` / `xs` only if a new screen specifically needs it. Don't
 * scatter arbitrary sizes — keep the brand expression consistent.
 */

type Size = 'sm' | 'lg';

const PX: Record<Size, number> = {
  sm: 32,
  lg: 88,
};

interface Props {
  size?: Size;
  style?: StyleProp<ImageStyle>;
}

const SOURCE = require('@/assets/images/icon.png');

export function BrandMark({ size = 'sm', style }: Props) {
  const px = PX[size];
  return (
    <Image
      source={SOURCE}
      style={[{ width: px, height: px, borderRadius: 8 }, style]}
      resizeMode="cover"
      accessible
      accessibilityLabel="HitMaster"
    />
  );
}
