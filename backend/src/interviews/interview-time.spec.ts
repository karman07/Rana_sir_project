import { formatInterviewTime, isValidZone, overlaps } from './interview-time';

describe('interview time helpers', () => {
  const start = new Date('2026-10-15T05:30:00Z');

  it('formats in the interview time zone', () => {
    expect(formatInterviewTime(start, 'Asia/Kolkata')).toEqual({ date: 'Thursday, 15 October 2026', time: expect.stringMatching(/^11:00 AM (GMT\+5:30|IST)$/) });
    expect(formatInterviewTime(start, 'America/New_York').time).toMatch(/^1:30 AM/);
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(isValidZone('Mars/Olympus')).toBe(false);
    expect(formatInterviewTime(start, 'Mars/Olympus').time).toMatch(/5:30 AM/);
  });

  it('detects overlapping slots but allows back-to-back ones', () => {
    const s = new Date('2026-10-15T10:00:00Z');
    expect(overlaps(s, 60, new Date('2026-10-15T10:30:00Z'), 30)).toBe(true);
    expect(overlaps(s, 60, new Date('2026-10-15T09:30:00Z'), 45)).toBe(true);
    expect(overlaps(s, 60, new Date('2026-10-15T11:00:00Z'), 30)).toBe(false);
    expect(overlaps(s, 60, new Date('2026-10-15T09:00:00Z'), 60)).toBe(false);
  });
});
