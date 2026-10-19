/** Human-readable date and time for emails and notifications, in the interview's own time zone. */
export function formatInterviewTime(startsAt: Date, timezone: string) {
  const tz = isValidZone(timezone) ? timezone : 'UTC';
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(startsAt);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(startsAt);
  return { date, time };
}

export function isValidZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

export const overlaps = (aStart: Date, aMinutes: number, bStart: Date, bMinutes: number) =>
  +aStart < +bStart + bMinutes * 60_000 && +bStart < +aStart + aMinutes * 60_000;
