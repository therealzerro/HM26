export function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function getYesterdayET(): string {
  return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function getTomorrowET(): string {
  return new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// N calendar days before today, ET. getDaysAgoET(1) === getYesterdayET().
export function getDaysAgoET(n: number): string {
  return new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function getETHour(): number {
  return parseInt(
    new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }),
    10,
  );
}

export function getETMinutes(): number {
  return parseInt(
    new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      minute: 'numeric',
    }),
    10,
  );
}

export function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(m, 10) - 1] + ' ' + parseInt(d, 10) + ', ' + y;
}

export function getDateLabel(dateStr: string): string {
  const today = getTodayET();
  const yesterday = getYesterdayET();
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const [, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(m, 10) - 1] + ' ' + parseInt(d, 10);
}

// ─── Tier utilities ───────────────────────────────────────────────────────────

export function isPremium(tier: string | undefined | null): boolean {
  return tier === 'PRO' || tier === 'PLUS' || tier === 'ADMIN' ||
    tier === 'premium' || tier === 'admin';
}

export function isAdmin(tier: string | undefined | null): boolean {
  return tier === 'ADMIN' || tier === 'admin';
}

// ─── Date array helpers ───────────────────────────────────────────────────────

export function isETDateToday(dateStr: string): boolean {
  return dateStr === getTodayET();
}

export function getLast30DaysET(): string[] {
  const today = getTodayET();
  const days: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  }
  return days;
}
