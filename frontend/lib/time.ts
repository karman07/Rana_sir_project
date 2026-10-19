/** Offset (ms) of `tz` from UTC at the given instant: positive when the zone is ahead of UTC. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - utcMs;
}

/** "2026-10-15" + "11:00" as wall-clock time in `tz` -> the real instant (handles daylight saving). */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffsetMs(guess, tz);
  return new Date(guess - tzOffsetMs(first, tz));
}

/** Splits an instant into the date and time inputs it shows in `tz`. */
export function utcToZonedParts(iso: string | Date, tz: string) {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Zones people actually pick. Browsers list some under older names (e.g. Asia/Calcutta), so make sure the modern ones are always offered. */
const COMMON_ZONES = ["UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];

export function timezones(): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([browserZone(), ...COMMON_ZONES, ...all])].sort();
}

export const formatWhen = (iso: string, tz?: string) => {
  const d = new Date(iso);
  const opts = tz ? { timeZone: tz } : {};
  return {
    date: new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", ...opts }).format(d),
    time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short", ...opts }).format(d),
  };
};

/** A standards-compliant .ics file so an interview can go into any calendar app. */
export function buildIcs(e: { id: string; title: string; startsAt: string; minutes: number; description?: string; location?: string; url?: string }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const start = new Date(e.startsAt);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Talentbridge//Interviews//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${e.id}@talentbridge`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(+start + e.minutes * 60_000))}`,
    `SUMMARY:${esc(e.title)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), ...(e.url ? [`URL:${e.url}`] : []),
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Interview in 30 minutes", "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function downloadIcs(name: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name}.ics`; a.click();
  URL.revokeObjectURL(url);
}
