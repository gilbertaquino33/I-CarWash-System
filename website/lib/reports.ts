export type RangeKey = "today" | "7d" | "month" | "year" | "custom";

export interface ResolvedRange {
  key: RangeKey;
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  label: string;
}

export interface Bucket {
  key: string;
  label: string; // short axis label
  fullLabel: string; // tooltip label
  from: string;
  to: string;
}

export const RANGE_PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Pick dates" },
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function resolveRange(
  key: string | undefined,
  from?: string,
  to?: string
): ResolvedRange {
  const today = new Date();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;

  if (key === "custom" && from && to && isoDate.test(from) && isoDate.test(to)) {
    // Tolerate a backwards range instead of returning nothing.
    const [a, b] = from <= to ? [from, to] : [to, from];
    return {
      key: "custom",
      from: a,
      to: b,
      label: a === b ? formatDayLong(a) : `${formatDayLong(a)} – ${formatDayLong(b)}`,
    };
  }

  switch (key) {
    case "7d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { key: "7d", from: iso(start), to: iso(today), label: "Last 7 days" };
    }
    case "month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { key: "month", from: iso(start), to: iso(today), label: "This month" };
    }
    case "year": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { key: "year", from: iso(start), to: iso(today), label: "This year" };
    }
    case "today":
    default:
      return { key: "today", from: iso(today), to: iso(today), label: "Today" };
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDayLong(d: string): string {
  const dt = parseIso(d);
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function daysBetween(from: string, to: string): number {
  const ms = parseIso(to).getTime() - parseIso(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Daily buckets for short ranges, monthly once a range spans more than ~2
 * months, so the trend chart never renders hundreds of unreadable columns.
 */
export function buildBuckets(range: ResolvedRange): Bucket[] {
  const span = daysBetween(range.from, range.to);
  const buckets: Bucket[] = [];

  if (span <= 62) {
    const cursor = parseIso(range.from);
    const end = parseIso(range.to);
    while (cursor <= end) {
      const key = iso(cursor);
      buckets.push({
        key,
        label: `${MONTHS[cursor.getMonth()]} ${cursor.getDate()}`,
        fullLabel: formatDayLong(key),
        from: key,
        to: key,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  const cursor = parseIso(range.from);
  cursor.setDate(1);
  const end = parseIso(range.to);
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    buckets.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: MONTHS[month],
      fullLabel: `${MONTHS[month]} ${year}`,
      from: iso(first > parseIso(range.from) ? first : parseIso(range.from)),
      to: iso(last < end ? last : end),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

/** Which bucket a YYYY-MM-DD date falls into. */
export function bucketKeyFor(date: string, monthly: boolean): string {
  return monthly ? date.slice(0, 7) : date;
}

export function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

export function pesoCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}₱${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}₱${Math.round(abs / 1000)}K`;
  return `${sign}₱${Math.round(abs).toLocaleString("en-PH")}`;
}
