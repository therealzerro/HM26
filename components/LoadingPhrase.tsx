import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const DEFAULT_PHRASES = [
  '⚡ Consulting the data oracle…',
  '⚡ Sifting through historical draws…',
  '⚡ Running cooldown checks…',
  '⚡ Weighing 4 signal channels…',
  '⚡ Filtering for box-set conviction…',
  '⚡ Cross-checking yesterday\'s hits…',
  '⚡ Tuning rail constraints…',
  '⚡ Picking from 1,000 candidates…',
];

interface Props {
  style?: StyleProp<TextStyle>;
  intervalMs?: number;
  phrases?: string[];
}

/**
 * Rotates through playful loading phrases. Respects reduce-motion: when
 * the OS asks for reduced motion, the rotation pauses and a single phrase
 * is shown statically (chosen randomly per mount so the user still gets
 * variety across sessions).
 */
export function LoadingPhrase({ style, intervalMs = 2200, phrases = DEFAULT_PHRASES }: Props) {
  const reduceMotion = useReduceMotion();
  const startRef = useRef<number>(Math.floor(Math.random() * phrases.length));
  const [idx, setIdx] = useState(startRef.current);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setIdx(i => (i + 1) % phrases.length), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, phrases.length, reduceMotion]);

  return <Text style={style}>{phrases[idx]}</Text>;
}
