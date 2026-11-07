// One rule for every earnings number in the app (dashboards, Daily / Monthly
// Sales, Profit & Loss, Payroll, Walk-in and Home Service reports):
//
//   money only counts once it is PAID, and never for a cancelled job.
//
// An unpaid walk-in (the red UNPAID tag in staff Reservations) or an unpaid
// home service must not show up in any total until staff mark it paid.

import { supabase } from './supabase';

const CANCELLED = new Set(['cancelled', 'voided']);

// reservation uses 'paid'; home_service uses 'Paid'.
export function isPaid(paymentStatus: string | null | undefined): boolean {
  return (paymentStatus ?? '').toLowerCase() === 'paid';
}

export function isCancelled(status: string | null | undefined): boolean {
  return CANCELLED.has((status ?? '').toLowerCase());
}

export function countsAsEarning(row: { payment_status?: string | null; status?: string | null }): boolean {
  return isPaid(row.payment_status) && !isCancelled(row.status);
}

// walkin_transactions has no payment status of its own -- it lives on the
// reservation it was synced from. Keep only rows whose reservation is paid
// and not cancelled.
export async function keepPaidWalkins<T extends { reservation_id: number | null }>(rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r.reservation_id).filter((id): id is number => id != null))];
  if (ids.length === 0) return [];

  const ok = new Set<number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('reservation')
      .select('id, payment_status, status')
      .in('id', ids.slice(i, i + 200));
    if (error) {
      console.log('[earnings] could not check walk-in payments:', error.message);
      continue;
    }
    (data ?? []).forEach((r: { id: number; payment_status: string | null; status: string | null }) => {
      if (countsAsEarning(r)) ok.add(r.id);
    });
  }
  return rows.filter((r) => r.reservation_id != null && ok.has(r.reservation_id));
}
