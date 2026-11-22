/**
 * India Standard Time is a fixed UTC+5:30 offset with no daylight saving,
 * so converting a wall-clock IST date/time to a UTC instant is pure
 * arithmetic — no IANA timezone database lookup needed. This is the one
 * place that conversion happens; everything else in the system stores and
 * compares UTC instants (see docs/ARCHITECTURE.md Section 1).
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** `dateYYYYMMDD` e.g. "2026-11-25", `timeHHmm` e.g. "09:30" — both read as IST wall-clock. */
export function istToUtc(dateYYYYMMDD: string, timeHHmm: string): Date {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  const [hh, mm] = timeHHmm.split(":").map(Number);
  const utcMillis = Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMillis);
}

/** The IST weekday (0=Sunday..6=Saturday) for a UTC instant. */
export function istWeekday(utcDate: Date): number {
  const istMillis = utcDate.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(istMillis).getUTCDay();
}

/** The IST calendar date (as a UTC-midnight Date, for @db.Date comparisons) for a UTC instant. */
export function istDateOnly(utcDate: Date): Date {
  const istMillis = utcDate.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const ist = new Date(istMillis);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
