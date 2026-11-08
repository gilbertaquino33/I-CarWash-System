// Offline support for the staff Reservations screen.
//
// While the phone has internet, the shop's reservation list is saved on the
// phone. When the internet drops (brownout, Wi-Fi down), staff can still scan
// a customer's QR, check them in, mark them paid and finish the wash -- each
// action is saved in a queue here and uploaded automatically, in order, once
// the phone is back online (supabase/sql/2026-11_offline_manual_checkin.sql).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOfflineError } from './authErrors';
import { supabase } from './supabase';

const SHOP_KEY = 'staff-shop-id-v1';
const QUEUE_KEY = 'staff-offline-queue-v1';
const cacheKey = (shopId: number) => `staff-reservations-cache-v1:${shopId}`;

interface OpBase {
  id: string;
  at: string; // when staff really did it (phone clock, ISO)
  reservationId: number;
  label: string; // "Juan Dela Cruz" -- shown if the upload is rejected
}
export type OfflineOp =
  | (OpBase & { kind: 'checkin'; token: string })
  | (OpBase & { kind: 'finish' })
  | (OpBase & { kind: 'paid'; paid: boolean });

type NewOp =
  | Omit<Extract<OfflineOp, { kind: 'checkin' }>, 'id' | 'at'>
  | Omit<Extract<OfflineOp, { kind: 'finish' }>, 'id' | 'at'>
  | Omit<Extract<OfflineOp, { kind: 'paid' }>, 'id' | 'at'>;

export { isOfflineError };

// ---------- shop id + reservation list cache ----------
export async function saveShopId(shopId: number) {
  try { await AsyncStorage.setItem(SHOP_KEY, String(shopId)); } catch {}
}
export async function loadShopId(): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(SHOP_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export async function cacheRows(shopId: number, rows: unknown[]) {
  try { await AsyncStorage.setItem(cacheKey(shopId), JSON.stringify(rows)); } catch {}
}
export async function loadCachedRows<T>(shopId: number): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(shopId));
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

// ---------- queue ----------
export async function getQueue(): Promise<OfflineOp[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineOp[]) : [];
  } catch {
    return [];
  }
}
async function setQueue(q: OfflineOp[]) {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

export async function enqueue(op: NewOp): Promise<OfflineOp> {
  const full = {
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  } as OfflineOp;
  const q = await getQueue();
  q.push(full);
  await setQueue(q);
  return full;
}

// Shows queued (not yet uploaded) actions on top of the saved list, so the
// screen looks the way it will once everything is uploaded.
export function applyQueue<
  T extends {
    id: number;
    status: string;
    arrived_at: string | null;
    washing_started_at: string | null;
    completed_at: string | null;
    payment_status: string | null;
    paid_at: string | null;
    manual_mode?: boolean;
    pending_upload?: boolean;
  },
>(rows: T[], queue: OfflineOp[]): T[] {
  if (queue.length === 0) return rows;
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  for (const op of queue) {
    const r = byId.get(op.reservationId);
    if (!r) continue;
    r.pending_upload = true;
    if (op.kind === 'checkin' && !r.arrived_at) {
      r.status = 'Washing';
      r.arrived_at = op.at;
      r.washing_started_at = op.at;
      r.manual_mode = true;
    } else if (op.kind === 'finish') {
      r.status = 'Completed';
      r.completed_at = op.at;
      r.manual_mode = true;
    } else if (op.kind === 'paid') {
      r.payment_status = op.paid ? 'paid' : 'unpaid';
      r.paid_at = op.paid ? op.at : null;
    }
    byId.set(r.id, r);
  }
  return rows.map((r) => byId.get(r.id) ?? r);
}

// ---------- upload ----------
const REJECT_REASONS: Record<string, string> = {
  QR_NOT_FOUND: 'the QR code no longer matches a reservation',
  WRONG_SHOP: 'the reservation is for a different branch',
  NOT_TODAY: 'the reservation wasn’t scheduled for that day',
  RESERVATION_INACTIVE: 'the booking was already cancelled',
  NOT_WASHING: 'the wash wasn’t started (its check-in didn’t go through)',
  NOT_STAFF: 'only staff accounts can do this',
};

export interface FlushResult {
  synced: number;
  failed: { label: string; reason: string }[];
  remaining: number;
  offline: boolean;
}

let flushing: Promise<FlushResult> | null = null;

// Uploads queued actions in order. Stops (keeping the rest) as soon as the
// phone turns out to still be offline. An action the server rejects is
// dropped and reported in `failed`.
export function flushQueue(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const queue = await getQueue();
    const result: FlushResult = { synced: 0, failed: [], remaining: queue.length, offline: false };

    while (queue.length > 0) {
      const op = queue[0];
      let error: { message?: string } | null = null;
      try {
        if (op.kind === 'checkin') {
          ({ error } = await supabase.rpc('staff_manual_check_in', {
            p_qr_token: op.token,
            p_at: op.at,
            p_offline: true,
          }));
        } else if (op.kind === 'finish') {
          ({ error } = await supabase.rpc('staff_finish_wash', {
            p_reservation_id: op.reservationId,
            p_at: op.at,
            p_offline: true,
          }));
        } else {
          ({ error } = await supabase
            .from('reservation')
            .update({ payment_status: op.paid ? 'paid' : 'unpaid', paid_at: op.paid ? op.at : null })
            .eq('id', op.reservationId));
        }
      } catch (e) {
        error = e as { message?: string };
      }

      if (error && isOfflineError(error)) {
        result.offline = true;
        break;
      }
      if (error) {
        const key = Object.keys(REJECT_REASONS).find((k) => error?.message?.includes(k));
        result.failed.push({ label: op.label, reason: key ? REJECT_REASONS[key] : error.message ?? 'unknown error' });
      } else {
        result.synced += 1;
      }
      queue.shift();
      await setQueue(queue);
    }

    result.remaining = queue.length;
    return result;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
