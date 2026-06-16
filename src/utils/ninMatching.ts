const NIN_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const NIN_RETRY_COOLDOWN_HOURS = 24;

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

export function getNinLockExpiry(lastFailedAt?: Date | null): Date | null {
  if (!lastFailedAt) return null;
  return new Date(lastFailedAt.getTime() + NIN_RETRY_COOLDOWN_MS);
}

export function isNinLocked(lockedUntil?: Date | null): boolean {
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > Date.now();
}

export function getNinRetryRemainingMs(lockedUntil?: Date | null): number {
  if (!lockedUntil) return 0;
  return Math.max(0, lockedUntil.getTime() - Date.now());
}
