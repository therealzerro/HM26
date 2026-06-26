// lib/brief/saveBrief.ts
//
// Save/share for the admin brief cards — same pipeline as the image-export
// system (lib/captureExportImage.ts), which the operator uses on the web:
//   • web         → capture card DOM to PNG, trigger a browser download
//   • web mobile  → capture, hand a File to Web Share ("Save to Photos")
//   • native      → react-native-view-shot + expo-sharing share sheet
//
// The operator runs HitMaster on the web for this, so download is the primary
// "save". Native is a graceful fallback for device builds.

import { Platform } from 'react-native';
import {
  resolveWebNode,
  captureNodeToPngNatural,
  downloadDataUrl,
  shareToPhotosAvailable,
  shareDataUrlToPhotos,
} from '@/lib/captureExportImage';
import { captureSlate, shareCapturedSlate } from '@/lib/zk30/shareSlate';

export const briefIsWeb = (): boolean => Platform.OS === 'web';
export const briefPhotosAvailable = (): boolean => shareToPhotosAvailable();

function png(name: string): string {
  return name.endsWith('.png') ? name : `${name}.png`;
}

/** Web: capture the brief card and trigger a browser download (the "save"). */
export async function downloadBriefPng(ref: { current: any }, fileName: string): Promise<void> {
  const node = resolveWebNode(ref);
  if (!node) throw new Error('Brief card is not ready to capture yet — generate first.');
  const dataUrl = await captureNodeToPngNatural(node);
  downloadDataUrl(dataUrl, png(fileName));
}

/** Web mobile: capture and route through Web Share → Save to Photos. */
export async function saveBriefToPhotos(ref: { current: any }, fileName: string): Promise<void> {
  const node = resolveWebNode(ref);
  if (!node) throw new Error('Brief card is not ready to capture yet — generate first.');
  const dataUrl = await captureNodeToPngNatural(node);
  await shareDataUrlToPhotos(dataUrl, png(fileName), 'HitMaster Brief');
}

/** Native: capture via view-shot and open the share sheet (has "Save Image"). */
export async function shareBriefNative(ref: { current: any }, fileName: string): Promise<void> {
  const uri = await captureSlate({ viewRef: ref as any, fileName });
  await shareCapturedSlate(uri);
}
