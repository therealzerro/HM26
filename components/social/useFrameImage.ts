/**
 * useFrameImage — the anchor frame as an <Image> source, capture-safe
 * (extracted from BriefFrameCard for the weekly receipts card, MKT-83).
 *
 * html-to-image embeds <img> sources by URL and kept serving the FIRST
 * frame's pixels for a second frame captured in the same page (10/10, even
 * with a per-frame query string). On web the frame is therefore decoded to a
 * DATA URL first — nothing to cache, nothing to fetch at capture time — and
 * `loaded` only turns true once the image has actually painted, so a phone
 * never captures an empty frame. A fetch/decode failure is REPORTED
 * (`error`) rather than swallowed (BUG-183).
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { BRIEF_FRAME_IMAGES, type BriefFrame } from '@/lib/social/briefFrames';

export function useFrameImage(frame: BriefFrame | null | undefined) {
  const [uri, setUri] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(Platform.OS !== 'web');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUri(null); setLoaded(Platform.OS !== 'web'); setError(null);
    if (!frame || Platform.OS !== 'web') return;
    const u = Asset.fromModule(BRIEF_FRAME_IMAGES[frame.key]).uri;
    fetch(`${u}${u.includes('?') ? '&' : '?'}hmframe=${frame.key}&t=${Date.now()}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${frame.file}`); return r.blob(); })
      .then(b => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error(`decode failed for ${frame.file}`)); fr.readAsDataURL(b); }))
      .then(d => { if (alive) setUri(d); })
      .catch((e: any) => { if (alive) { setUri(null); setError(String(e?.message ?? e)); } });
    return () => { alive = false; };
  }, [frame?.key, frame?.file]);
  const source = !frame ? null : Platform.OS === 'web' ? (uri ? { uri } : null) : BRIEF_FRAME_IMAGES[frame.key];
  return { source, loaded, error, onLoad: () => setLoaded(true) };
}
