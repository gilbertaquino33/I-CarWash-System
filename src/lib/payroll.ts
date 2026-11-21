// Shared staff payroll math, used by the admin Staff Payroll Report and the
// staff's own payslip so both always show the same numbers.
//
// The unit of payment is ONE DAY. A payout (daily, weekly or monthly) pays
// every day inside its period -- but only days up to the date it was paid,
// so paying a week early never swallows days that haven't happened yet.
// For any period you look at:
//   share     = the staff member's 40%-pool share of every day in it
//   paid      = the share of the days already covered by a payout
//   remaining = the share of the days nobody has paid yet
// So a day paid on the Daily tab is already deducted on the Weekly and
// Monthly tabs, and a month paid on the Monthly tab shows every day in it
// as paid.

export const STAFF_SHARE_PERCENT = 0.4;

export interface PayrollJob {
  reservation_date: string; // YYYY-MM-DD
  price: number | null;
}

export interface PayrollPayout {
  id: string;
  staff_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  amount: number;
  paid_at: string; // ISO timestamp
}

export interface StaffPayBreakdown<P extends PayrollPayout = PayrollPayout> {
  share: number;
  paid: number;
  remaining: number;
  /** Nothing left to pay, and at least part of the period was paid. */
  isPaid: boolean;
  /** The payouts that cover some day of this period, newest first. */
  payouts: P[];
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  const [y, m, d] = start.split('-').map(Number);
  const cur = new Date(y, m - 1, d);
  for (let guard = 0; guard < 400; guard++) {
    const iso = localDate(cur);
    if (iso > end) break;
    days.push(iso);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Last day a payout can cover: its period end, or the day it was paid if earlier. */
function coveredUntil(p: PayrollPayout): string {
  const paidDay = localDate(new Date(p.paid_at));
  return paidDay < p.period_end ? paidDay : p.period_end;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Where a new payout for [start, end] should begin: the first day of the
 * period no payout covers yet. Paying the rest of a month that was already
 * partly paid then records [first unpaid day, end] instead of repeating the
 * exact same period (which the database rejects as a duplicate).
 */
export function firstUnpaidDay(staffPayouts: PayrollPayout[], start: string, end: string): string {
  for (const day of eachDay(start, end)) {
    if (!staffPayouts.some((p) => p.period_start <= day && day <= coveredUntil(p))) return day;
  }
  return start;
}

export function computeStaffPay<P extends PayrollPayout>(
  jobs: PayrollJob[],
  staffCount: number,
  staffPayouts: P[],
  start: string,
  end: string
): StaffPayBreakdown<P> {
  const revenueByDay = new Map<string, number>();
  for (const j of jobs) {
    if (!j.reservation_date) continue;
    revenueByDay.set(j.reservation_date, (revenueByDay.get(j.reservation_date) ?? 0) + (j.price ?? 0));
  }

  const relevant = staffPayouts.filter((p) => p.period_start <= end && coveredUntil(p) >= start);

  let share = 0;
  let paid = 0;
  for (const day of eachDay(start, end)) {
    const dayShare = staffCount > 0 ? ((revenueByDay.get(day) ?? 0) * STAFF_SHARE_PERCENT) / staffCount : 0;
    share += dayShare;
    if (relevant.some((p) => p.period_start <= day && day <= coveredUntil(p))) paid += dayShare;
  }

  share = round2(share);
  paid = round2(paid);
  const remaining = round2(Math.max(share - paid, 0));

  return {
    share,
    paid,
    remaining,
    isPaid: remaining <= 0 && relevant.length > 0,
    payouts: [...relevant].sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1)),
  };
}
