// All display is in the ride's own time zone. Storage is ISO 8601 UTC.

export const TZ = "Europe/London";

export function nowIso(): string {
  return new Date().toISOString();
}

/** YYYY-MM-DD in London for a given instant (default now). */
export function londonDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days between an ISO instant and now, in London calendar days. */
export function daysSince(iso: string): number {
  const a = londonDate(new Date(iso));
  const b = londonDate();
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function daysUntil(dateYmd: string): number {
  return Math.round((Date.parse(dateYmd) - Date.parse(londonDate())) / 86_400_000);
}

/** "13 Oct" from YYYY-MM-DD. */
export function fmtDay(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = new Date(ymd + "T12:00:00Z");
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
}

/** "Sun 19 Oct" */
export function fmtDayLong(ymd: string): string {
  const d = new Date(ymd + "T12:00:00Z");
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(d);
}

/** "14:32" in London from an ISO instant. */
export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Mon 12 Oct, 14:32" */
export function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
}

export function ago(iso: string): string {
  const m = minutesSince(iso);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function isValidYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
