// Staff Time In / Time Out (staff_attendance) for the admin Attendance page.
// Same rules as src/lib/attendance.ts in the mobile app. The web server runs
// in UTC, so days are computed in Philippine time.

export interface Shift {
  id: number;
  staff_id: string;
  shop_id: number;
  time_in: string;
  time_out: string | null;
  auto_closed: boolean;
  time_in_distance_m: number | null;
  time_out_distance_m: number | null;
  edited_by_admin: boolean;
  admin_note: string | null;
}

export const SHIFT_COLUMNS =
  "id, staff_id, shop_id, time_in, time_out, auto_closed, time_in_distance_m, time_out_distance_m, edited_by_admin, admin_note";

const TZ = "Asia/Manila";
const DAY_MS = 86400000;

// Time In is GPS-checked on the server; Time Out isn't blocked, so flag one
// done far from the shop or without a verified location.
export const AWAY_FROM_SHOP_M = 200;
export function timedOutAway(s: Shift): boolean {
  return (
    !!s.time_out &&
    !s.auto_closed &&
    !s.edited_by_admin &&
    (s.time_out_distance_m == null || s.time_out_distance_m > AWAY_FROM_SHOP_M)
  );
}

// An open shift counts up to now. A forgotten one was auto timed out by the
// server at the shop's standard shift length and counts those hours until the
// admin corrects it.
export function shiftMinutes(s: Shift, now = Date.now()): number {
  const end = s.time_out ? new Date(s.time_out).getTime() : now;
  return Math.max(0, Math.round((end - new Date(s.time_in).getTime()) / 60000));
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

export function formatShiftDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
}

// "YYYY-MM-DD" of today in the Philippines.
export function phToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

// PH midnight of a YYYY-MM-DD day, and the next midnight.
export function phDayRange(ymd: string) {
  const start = new Date(`${ymd}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  return phToday(new Date(d.getTime() + days * DAY_MS));
}

// Monday 00:00 (PH) of the week containing `ymd`.
export function phWeekStart(ymd: string): Date {
  const { start } = phDayRange(ymd);
  const weekday = new Date(`${ymd}T12:00:00+08:00`).getUTCDay(); // 0 = Sunday
  return new Date(start.getTime() - (weekday === 0 ? 6 : weekday - 1) * DAY_MS);
}

export function formatLongDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function minutesBetween(shifts: Shift[], from: Date, to: Date, now = Date.now()): number {
  return shifts
    .filter((s) => {
      const t = new Date(s.time_in).getTime();
      return t >= from.getTime() && t < to.getTime();
    })
    .reduce((sum, s) => sum + shiftMinutes(s, now), 0);
}
