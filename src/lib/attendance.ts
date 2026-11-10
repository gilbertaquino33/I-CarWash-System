// Staff Time In / Time Out helpers, shared by the staff dashboard (clocking)
// and the admin Staff Management screen (who's on duty, hours worked).
// Server side: supabase/sql/2026-11_staff_attendance.sql.

import * as Location from 'expo-location';
import { friendlyAuthError } from './authErrors';
import { supabase } from './supabase';

export interface Shift {
  id: number;
  staff_id: string;
  shop_id: number;
  time_in: string;
  time_out: string | null;
  auto_closed: boolean;
  time_in_distance_m: number | null;
  time_out_distance_m: number | null;
}

export const SHIFT_COLUMNS =
  'id, staff_id, shop_id, time_in, time_out, auto_closed, time_in_distance_m, time_out_distance_m';

// Time Out with no verified location (no GPS / fake GPS) or far from the shop.
export function timedOutAway(s: Shift): boolean {
  return !!s.time_out && !s.auto_closed && (s.time_out_distance_m == null || s.time_out_distance_m > AWAY_FROM_SHOP_M);
}

// Minutes worked in a shift; an open shift counts up to `now`. A forgotten
// shift is auto timed out by the server at the shop's standard shift length
// (auto_closed) and counts those hours until the admin corrects it.
export function shiftMinutes(s: Shift, now = Date.now()): number {
  const end = s.time_out ? new Date(s.time_out).getTime() : now;
  return Math.max(0, Math.round((end - new Date(s.time_in).getTime()) / 60000));
}

// "7h 45m", "45m", "0m"
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export function formatShiftDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday 00:00 of this week (local time).
export function startOfWeek(): Date {
  const d = startOfToday();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

export function minutesSince(shifts: Shift[], since: Date, now = Date.now()): number {
  return shifts
    .filter((s) => new Date(s.time_in).getTime() >= since.getTime())
    .reduce((sum, s) => sum + shiftMinutes(s, now), 0);
}

// Beyond this, a Time Out is shown to the admin as "away from the shop".
export const AWAY_FROM_SHOP_M = 200;

type Fix =
  | { ok: true; lat: number; lng: number; accuracy: number | null; mocked: boolean }
  | { ok: false; title: string; message: string };

// A fresh, accurate GPS fix (no cached position -- the staff must be at the
// shop NOW). Also used by the admin to save the shop's location.
export async function getPreciseFix(): Promise<Fix> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      return {
        ok: false,
        title: 'Location Needed',
        message: perm.canAskAgain
          ? 'We need your location to confirm you’re at the shop. Please tap “Allow” when asked.'
          : 'Location is blocked for I-CarWash. Open Settings → Apps → I-CarWash → Permissions, allow Location, then try again.',
      };
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      return { ok: false, title: 'Turn On Location', message: 'Your phone’s Location (GPS) is off. Please turn it on, then try again.' };
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      ok: true,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      mocked: !!pos.mocked,
    };
  } catch {
    return {
      ok: false,
      title: 'Can’t Find Your Location',
      message: 'We couldn’t get your GPS location. Step outside or near a window, make sure Location is on, then try again.',
    };
  }
}

// Shop working hours (same as shop_profile_setup.open_time / close_time on the
// server, which is what actually enforces them). Time In only 7 AM - 7 PM; an
// open shift is timed out automatically at 7 PM.
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 19;
export const WORK_HOURS_LABEL = '7:00 AM – 7:00 PM';

export function isWithinWorkHours(d = new Date()): boolean {
  const h = d.getHours();
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
}

// Calls staff_time_in / staff_time_out (with the phone's GPS) and turns
// failures into a friendly title + message for the modal. `endedAtClosing`
// = the Time Out was tapped after 7 PM, so it was recorded as 7 PM.
export async function clockShift(
  action: 'in' | 'out'
): Promise<
  { ok: true; at: string; endedAtClosing: boolean } | { ok: false; title: string; message: string }
> {
  if (action === 'in' && !isWithinWorkHours()) {
    return new Date().getHours() < OPEN_HOUR
      ? { ok: false, title: 'Too Early to Time In', message: `Time In opens at 7:00 AM. Working hours are ${WORK_HOURS_LABEL}.` }
      : { ok: false, title: 'Time In Is Closed', message: `You can no longer time in after 7:00 PM. Working hours are ${WORK_HOURS_LABEL}.` };
  }

  const fix = await getPreciseFix();
  // Time In must have a location; Time Out still works without one.
  if (!fix.ok && action === 'in') return fix;

  try {
    const { data, error } = await supabase.rpc(action === 'in' ? 'staff_time_in' : 'staff_time_out', {
      p_lat: fix.ok ? fix.lat : null,
      p_lng: fix.ok ? fix.lng : null,
      p_accuracy: fix.ok ? fix.accuracy : null,
      p_mocked: fix.ok ? fix.mocked : false,
    });
    if (error) throw error;
    const at = String(data);
    return {
      ok: true,
      at,
      endedAtClosing: action === 'out' && Date.now() - new Date(at).getTime() > 2 * 60 * 1000,
    };
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (msg.includes('TOO_EARLY')) {
      return { ok: false, title: 'Too Early to Time In', message: `Time In opens at 7:00 AM. Working hours are ${WORK_HOURS_LABEL}.` };
    }
    if (msg.includes('TOO_LATE_TODAY')) {
      return { ok: false, title: 'Time In Is Closed', message: `You can no longer time in after 7:00 PM. Working hours are ${WORK_HOURS_LABEL}.` };
    }
    const tooFar = msg.match(/TOO_FAR:(\d+)/);
    if (tooFar) {
      const m = Number(tooFar[1]);
      return {
        ok: false,
        title: 'You’re Not at the Shop',
        message: `You seem to be ${m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`} away from the shop. You can only time in when you’re at the shop.`,
      };
    }
    if (msg.includes('MOCK_LOCATION')) {
      return {
        ok: false,
        title: 'Fake Location Detected',
        message: 'Your phone is using a fake GPS / mock location app. Please turn it off to time in.',
      };
    }
    if (msg.includes('SHOP_LOCATION_NOT_SET')) {
      return {
        ok: false,
        title: 'Shop Location Not Set',
        message: 'Your admin needs to set the shop’s location first (Shop Setup → Use My Current Location) before staff can time in.',
      };
    }
    if (msg.includes('LOCATION_REQUIRED')) {
      return { ok: false, title: 'Location Needed', message: 'Please turn on Location so we can confirm you’re at the shop.' };
    }
    // RPC or table missing = the attendance SQL hasn't been applied yet.
    if (e?.code === 'PGRST202' || e?.code === '42P01' || /could not find the function|does not exist/i.test(msg)) {
      return {
        ok: false,
        title: 'Time In Not Set Up Yet',
        message: 'Attendance isn’t set up on the server yet. Please tell your admin.',
      };
    }
    if (msg.includes('ALREADY_TIMED_OUT_TODAY')) {
      return {
        ok: false,
        title: 'Shift Already Done Today',
        message: 'You already timed out today, so you can’t time in again until tomorrow. If this was a mistake, please tell your admin.',
      };
    }
    if (msg.includes('ALREADY_TIMED_IN')) {
      return { ok: false, title: 'Already Timed In', message: 'You’re already on duty. Tap Time Out when your shift ends.' };
    }
    if (msg.includes('NOT_TIMED_IN')) {
      return { ok: false, title: 'Not Timed In', message: 'You haven’t timed in yet. Tap Time In when you start your shift.' };
    }
    if (msg.includes('NO_SHOP')) {
      return { ok: false, title: 'No Branch Assigned', message: 'Your account isn’t assigned to a branch yet. Please ask your admin.' };
    }
    if (msg.includes('NOT_STAFF')) {
      return { ok: false, title: 'Staff Only', message: 'Only staff accounts can time in and out.' };
    }
    const f = friendlyAuthError(e, action === 'in' ? 'Could Not Time In' : 'Could Not Time Out');
    return { ok: false, title: f.title, message: f.message };
  }
}
