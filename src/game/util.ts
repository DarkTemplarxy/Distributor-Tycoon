// ============================================================================
// Small shared helpers: ids, RNG, time math and formatting.
// ============================================================================

import { DAYS_PER_WEEK, MONTHS_PER_YEAR, WEEKS_PER_MONTH, WEEKS_PER_QUARTER, WEEKS_PER_YEAR } from './constants';

let idCounter = 0;
export function uid(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// --- Time helpers -----------------------------------------------------------

export function weekOf(totalDays: number): number {
  return Math.floor(totalDays / DAYS_PER_WEEK);
}

/** Day of week 0-6 (0 = Monday). */
export function dayOfWeek(totalDays: number): number {
  return Math.floor(totalDays) % DAYS_PER_WEEK;
}

/** Fraction of the current day elapsed (0..1). */
export function dayFraction(totalDays: number): number {
  return totalDays - Math.floor(totalDays);
}

export function hourOf(totalDays: number): number {
  return dayFraction(totalDays) * 24;
}

export function quarterOf(week: number): number {
  return Math.floor((week % WEEKS_PER_YEAR) / WEEKS_PER_QUARTER); // 0..3
}

export function yearOf(week: number): number {
  return Math.floor(week / WEEKS_PER_YEAR);
}

/** Absolute month index since game start (0-based). */
export function monthOf(week: number): number {
  return Math.floor(week / WEEKS_PER_MONTH);
}

/** Week within the current month, 0-based (0..3). */
export function weekOfMonth(week: number): number {
  return week % WEEKS_PER_MONTH;
}

/** Month within the current year, 0-based (0..11). */
export function monthOfYear(week: number): number {
  return monthOf(week) % MONTHS_PER_YEAR;
}

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export function dayName(totalDays: number): string {
  return DAY_NAMES[dayOfWeek(totalDays)];
}

export function formatClock(totalDays: number): string {
  const h = Math.floor(hourOf(totalDays));
  const m = Math.floor((hourOf(totalDays) - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// --- Formatting -------------------------------------------------------------

export function euro(n: number): string {
  const rounded = Math.round(n);
  return `€${rounded.toLocaleString('de-DE')}`;
}

export function euro2(n: number): string {
  return `€${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
