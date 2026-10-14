import { describe, expect, it } from 'vitest';
import { ALMATY, PRAGUE, addDays, addMonths, dayKey, startOfWeek, tzOffsetMinutes, utcToZoned, weekday, zonedToUtc } from './time';

describe('time zones', () => {
  it('Prague winter (CET, +1) and summer (CEST, +2)', () => {
    expect(zonedToUtc('2026-01-15', '18:00', PRAGUE)).toBe('2026-01-15T17:00:00.000Z');
    expect(zonedToUtc('2026-07-15', '18:00', PRAGUE)).toBe('2026-07-15T16:00:00.000Z');
  });

  it('Almaty is UTC+5 all year', () => {
    expect(zonedToUtc('2026-01-15', '18:00', ALMATY)).toBe('2026-01-15T13:00:00.000Z');
    expect(zonedToUtc('2026-07-15', '18:00', ALMATY)).toBe('2026-07-15T13:00:00.000Z');
  });

  it('handles the DST switch days in Prague', () => {
    // 29 Mar 2026: 02:00 → 03:00. Before: +1, after: +2.
    expect(zonedToUtc('2026-03-29', '01:30', PRAGUE)).toBe('2026-03-29T00:30:00.000Z');
    expect(zonedToUtc('2026-03-29', '04:00', PRAGUE)).toBe('2026-03-29T02:00:00.000Z');
    // 25 Oct 2026: 03:00 → 02:00.
    expect(zonedToUtc('2026-10-25', '12:00', PRAGUE)).toBe('2026-10-25T11:00:00.000Z');
    expect(zonedToUtc('2026-10-24', '12:00', PRAGUE)).toBe('2026-10-24T10:00:00.000Z');
  });

  it('round-trips through utcToZoned', () => {
    for (const [d, t] of [['2026-03-29', '04:15'], ['2026-10-25', '23:59'], ['2026-12-31', '00:00']]) {
      const iso = zonedToUtc(d, t, PRAGUE);
      expect(utcToZoned(iso, PRAGUE)).toEqual({ date: d, time: t });
    }
  });

  it('shows the same instant in Prague and Almaty', () => {
    const iso = zonedToUtc('2026-10-20', '18:00', PRAGUE); // CEST
    expect(utcToZoned(iso, ALMATY)).toEqual({ date: '2026-10-20', time: '21:00' });
    const winter = zonedToUtc('2026-11-20', '18:00', PRAGUE); // CET
    expect(utcToZoned(winter, ALMATY)).toEqual({ date: '2026-11-20', time: '22:00' });
    expect(tzOffsetMinutes(new Date(winter), PRAGUE)).toBe(60);
    expect(tzOffsetMinutes(new Date(winter), ALMATY)).toBe(300);
  });

  it('day keys use the zone, not UTC', () => {
    // 23:30 UTC on 14 Oct is already 15 Oct in Prague (summer time).
    expect(dayKey('2026-10-14T23:30:00Z', PRAGUE)).toBe('2026-10-15');
    expect(dayKey('2026-10-14T23:30:00Z', 'UTC')).toBe('2026-10-14');
  });

  it('calendar arithmetic', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(weekday('2026-10-12')).toBe(0); // Monday
    expect(weekday('2026-10-18')).toBe(6); // Sunday
    expect(startOfWeek('2026-10-14')).toBe('2026-10-12');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
  });
});
