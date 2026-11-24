import { addDays, formatVnd, parseLocalDate, parseVnd, recommendSavings, todayInVietnam } from '../src/savings/goal';

describe('recommendSavings', () => {
  it('matches the plan golden case: 30 days and 25,000 VND per day', () => {
    const plan = recommendSavings({ targetVnd: 2_000_000, savedVnd: 1_250_000, today: '2026-07-12', deadline: '2026-08-11' });
    expect(plan).toEqual({
      status: 'on_track',
      remainingVnd: 750_000,
      savingDays: 30,
      dailyVnd: 25_000,
      thirtyDayVnd: 750_000,
      progressPercent: 62,
    });
  });

  it('rounds the daily amount up and caps the 30-day projection at the remaining target', () => {
    const plan = recommendSavings({ targetVnd: 100_000, savedVnd: 0, today: '2026-11-18', deadline: '2026-11-21' });
    expect(plan.dailyVnd).toBe(33_334);
    expect(plan.thirtyDayVnd).toBe(100_000);
  });

  it('never divides by zero or a negative day count', () => {
    const base = { targetVnd: 500_000, savedVnd: 100_000, today: '2026-11-18' };
    expect(recommendSavings({ ...base, deadline: '2026-11-18' })).toMatchObject({ status: 'due_today', dailyVnd: 400_000 });
    expect(recommendSavings({ ...base, deadline: '2026-11-17' })).toMatchObject({ status: 'overdue', dailyVnd: null, savingDays: -1 });
  });

  it('treats a reached target as completed even after the deadline', () => {
    const plan = recommendSavings({ targetVnd: 500_000, savedVnd: 600_000, today: '2026-11-18', deadline: '2026-11-01' });
    expect(plan).toMatchObject({ status: 'completed', remainingVnd: 0, dailyVnd: null, progressPercent: 100 });
  });

  it('counts days across a month boundary and a leap day', () => {
    expect(recommendSavings({ targetVnd: 29, savedVnd: 0, today: '2028-02-01', deadline: '2028-03-01' }).savingDays).toBe(29);
  });
});

describe('date and money helpers', () => {
  it('rejects impossible or malformed dates', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('18/11/2026')).toBeNull();
    expect(parseLocalDate('2026-11-18')).not.toBeNull();
  });

  it('uses the Vietnam calendar day', () => {
    expect(todayInVietnam(new Date('2026-11-18T17:30:00Z'))).toBe('2026-11-19');
    expect(todayInVietnam(new Date('2026-11-18T16:59:59Z'))).toBe('2026-11-18');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('parses only positive integer VND within bounds', () => {
    expect(parseVnd('2.000.000')).toBe(2_000_000);
    expect(parseVnd('1 500 000')).toBe(1_500_000);
    for (const bad of ['', '0', '-5', '12.5abc', '1e6', '10000000000000']) expect(parseVnd(bad)).toBeNull();
  });

  it('formats VND with dot grouping', () => {
    expect(formatVnd(1_250_000)).toBe('1.250.000 ₫');
    expect(formatVnd(0)).toBe('0 ₫');
    expect(formatVnd(-45_000)).toBe('-45.000 ₫');
  });
});
