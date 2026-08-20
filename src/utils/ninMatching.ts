const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/** First failed billed attempt waits this many hours. */
export const NIN_RETRY_BASE_HOURS = 1;
/** Cap so repeated failures cannot lock an account indefinitely. */
export const NIN_RETRY_MAX_HOURS = 24;

/** @deprecated Use getNinCooldownHours — kept as the first-attempt wait. */
export const NIN_RETRY_COOLDOWN_HOURS = NIN_RETRY_BASE_HOURS;

/**
 * Escalating wait after billed verification attempts: 1h, 2h, 4h, 8h, 16h, then 24h cap.
 * `failedAttemptCount` is 1-based (first failure → 1 hour).
 */
export function getNinCooldownHours(failedAttemptCount: number): number {
  const n = Math.max(1, Math.floor(failedAttemptCount) || 1);
  return Math.min(NIN_RETRY_BASE_HOURS * 2 ** (n - 1), NIN_RETRY_MAX_HOURS);
}

export function getNinLockUntil(failedAttemptCount: number, from = new Date()): Date {
  return new Date(from.getTime() + getNinCooldownHours(failedAttemptCount) * MS_PER_HOUR);
}

export function formatNinRetryWait(remainingMs: number): string {
  const ms = Math.max(0, remainingMs);
  if (ms >= MS_PER_HOUR) {
    const hours = Math.ceil(ms / MS_PER_HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.ceil(ms / MS_PER_MINUTE));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ");
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = normalizeName(fullName).split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

export function namesMatch(
  registeredName: string,
  ninFirstName?: string,
  ninLastName?: string
): boolean {
  if (!registeredName?.trim() || !ninFirstName?.trim() || !ninLastName?.trim()) {
    return false;
  }

  const registered = normalizeName(registeredName);
  const first = normalizeName(ninFirstName);
  const last = normalizeName(ninLastName);
  const registeredParts = registered.split(" ");

  const firstOk = registeredParts.some(
    (part) => part === first || part.startsWith(first) || first.startsWith(part)
  );
  const lastOk = registeredParts.some(
    (part) => part === last || part.startsWith(last) || last.startsWith(part)
  );

  return firstOk && lastOk;
}

export function formatDateOnly(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export function dobMatch(registeredDob: Date | string, ninDob?: string): boolean {
  if (!registeredDob || !ninDob) return false;
  return formatDateOnly(registeredDob) === formatDateOnly(ninDob);
}

export function getNinLockExpiry(lastFailedAt?: Date | null, failedAttemptCount = 1): Date | null {
  if (!lastFailedAt) return null;
  return getNinLockUntil(failedAttemptCount, lastFailedAt);
}

export function isNinLocked(lockedUntil?: Date | null): boolean {
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > Date.now();
}

export function getNinRetryRemainingMs(lockedUntil?: Date | null): number {
  if (!lockedUntil) return 0;
  return Math.max(0, lockedUntil.getTime() - Date.now());
}
