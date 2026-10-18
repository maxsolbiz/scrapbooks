const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_KEYS = 10_000;

type Entry = { count: number; resetAt: number };

const attempts = new Map<string, Entry>();

export function loginAttemptKey(ip: string, email: string): string {
  return `${ip}|${email.trim().toLowerCase()}`;
}

export function isLocked(key: string): boolean {
  const e = attempts.get(key);
  if (!e) return false;
  if (Date.now() > e.resetAt) {
    attempts.delete(key);
    return false;
  }
  return e.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  if (attempts.size > MAX_KEYS) attempts.clear();
  const now = Date.now();
  const e = attempts.get(key);
  if (!e || now > e.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  e.count += 1;
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}

export function secondsUntilUnlock(key: string): number {
  const e = attempts.get(key);
  if (!e) return 0;
  return Math.max(0, Math.ceil((e.resetAt - Date.now()) / 1000));
}
