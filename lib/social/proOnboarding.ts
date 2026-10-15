/**
 * proOnboarding — the three Pro-room onboarding comments (MKT-86 §2.2, content
 * agent Ledger 2026-10-15), VERBATIM. Tier 4 copy: no pricing, no sales lines,
 * and the day-21 touch never mentions billing, renewal or price.
 *
 * Shared by Admin → Pro Subscribers (E3 ticks + copy buttons) and the captions
 * PDF "PRO ROOM" section, so the strings live in exactly one place.
 * Dependency-free on purpose (the PDF script runs under tsx, the app under RN).
 */

export type OnboardingTouchKey = 'day1' | 'day3' | 'day21';

export const PRO_ONBOARDING_TEMPLATES: Record<OnboardingTouchKey, string> = {
  day1: 'Welcome to Pro, {name} 💎 Your boards land here every morning — All-Day, Midday and Evening, every signal uncovered. Quick question to get you started: which state are you checking from?',
  day3: "{name}, here's the quick guide to reading your board 👉 it's pinned at the top of the group. Ask anything in the comments; we read every one.",
  day21: "{name}, three weeks in 💎 Glad you're here. Anything you'd like to see on the board or in the brief? Tell us; we read every reply.",
};

/** Day offsets since date_subscribed at which each touch is due. */
export const ONBOARDING_DUE_DAYS: Record<OnboardingTouchKey, number> = { day1: 1, day3: 3, day21: 21 };

export const ONBOARDING_TOUCH_LABEL: Record<OnboardingTouchKey, string> = { day1: 'DAY 1', day3: 'DAY 3', day21: 'DAY 21' };

/**
 * Fill {name}. An empty/absent name leaves the placeholder in place so the
 * operator sees exactly what still needs typing (never a blank or a dangling
 * comma). Only the first word of a display name is used — the comment reads
 * as a first-name greeting.
 */
export function fillName(template: string, name?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first ? template.replace(/\{name\}/g, first) : template;
}
