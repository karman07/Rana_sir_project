import { priorityFor } from './approvals.service';

describe('priorityFor', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const ago = (h: number) => new Date(now - h * 3_600_000);

  it('escalates with waiting time', () => {
    expect(priorityFor(ago(2), false, now)).toBe('NORMAL');
    expect(priorityFor(ago(30), false, now)).toBe('MEDIUM');
    expect(priorityFor(ago(80), false, now)).toBe('HIGH');
  });

  it('escalates urgent items sooner', () => {
    expect(priorityFor(ago(2), true, now)).toBe('MEDIUM');
    expect(priorityFor(ago(30), true, now)).toBe('HIGH');
  });
});
