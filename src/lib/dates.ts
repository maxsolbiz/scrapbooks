const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

export function utcMidnightOfDubaiDate(instant: Date): Date {
  return new Date(`${dubaiDateString(instant)}T00:00:00Z`);
}

export function todayDubai(): Date {
  return utcMidnightOfDubaiDate(new Date());
}

export function dubaiDateString(instant: Date): string {
  return new Date(instant.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}
