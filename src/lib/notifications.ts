// In-app reminder notifications for customer reservations (Facebook-style
// device notifications). LOCAL scheduled notifications via
// expo-notifications -- no server, no push tokens.
//
// IMPORTANT: expo-notifications' native module ("ExpoPushTokenManager") is
// NOT present in Expo Go on iOS (SDK 53+) -- even importing the package
// throws there. So it is loaded DEFENSIVELY below: if it's unavailable,
// every function here quietly no-ops and the app keeps working (the
// server-side reminder EMAILS still cover the customer). It works fully in
// Expo Go on Android and in any dev/preview build.
//
// For a 7:00 AM slot the customer gets a notification at 6:00 AM (1 hour
// before) and 6:30 AM (30 min before).

import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let Notifications: NotificationsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications') as NotificationsModule;
} catch {
  Notifications = null;
}

const AVAILABLE = !!Notifications;

// How long before the slot each nudge fires, in minutes.
export const REMINDER_OFFSETS_MIN = [60, 30];

const ANDROID_CHANNEL_ID = 'reservation-reminders';

// Show the notification even while the app is in the foreground.
if (AVAILABLE) {
  try {
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // ignore -- handler is best-effort
  }
}

function isGranted(p: { granted?: boolean; status?: string } | undefined): boolean {
  if (!p) return false;
  return !!p.granted || p.status === 'granted';
}

let cachedGranted: boolean | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!AVAILABLE) return false;
  if (cachedGranted === true) return true;
  try {
    const current = await Notifications!.getPermissionsAsync();
    if (isGranted(current)) {
      cachedGranted = true;
      return true;
    }
    if (current.canAskAgain === false) {
      cachedGranted = false;
      return false;
    }
    const asked = await Notifications!.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    cachedGranted = isGranted(asked);
    return cachedGranted;
  } catch (e) {
    console.warn('[notifications] permission check failed:', e);
    return false;
  }
}

async function ensureAndroidChannel() {
  if (!AVAILABLE || Platform.OS !== 'android') return;
  try {
    await Notifications!.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Reservation reminders',
      importance: Notifications!.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch (e) {
    console.warn('[notifications] channel setup failed:', e);
  }
}

interface ScheduleOpts {
  reservationId: number | string;
  scheduledAtISO: string;
  shopName?: string | null;
  scheduledTimeLabel?: string | null;
}

// Schedules the pre-slot reminders for one reservation. Safe to call
// fire-and-forget; a no-op where expo-notifications is unavailable.
export async function scheduleReservationReminders(
  opts: ScheduleOpts,
): Promise<string[]> {
  if (!AVAILABLE) return [];
  const granted = await ensureNotificationPermission();
  if (!granted) return [];
  await ensureAndroidChannel();

  const slotMs = new Date(opts.scheduledAtISO).getTime();
  if (!Number.isFinite(slotMs)) return [];

  await cancelReservationReminders(opts.reservationId);

  const timeSuffix = opts.scheduledTimeLabel ? ` at ${opts.scheduledTimeLabel}` : '';
  const shop = opts.shopName || 'I-CarWash';
  const ids: string[] = [];

  for (const offMin of REMINDER_OFFSETS_MIN) {
    const fireAt = new Date(slotMs - offMin * 60000);
    if (fireAt.getTime() <= Date.now() + 10_000) continue;

    const isHour = offMin >= 60;
    try {
      const id = await Notifications!.scheduleNotificationAsync({
        content: {
          title: isHour
            ? 'Your car wash is in 1 hour'
            : 'Your car wash is in 30 minutes',
          body: `${shop}${timeSuffix}. Head out soon so you arrive on time — a no-show turns your payment into store credit.`,
          data: {
            kind: 'reservation-reminder',
            reservationId: String(opts.reservationId),
            offsetMin: offMin,
          },
        },
        trigger: {
          type: Notifications!.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
      ids.push(id);
    } catch (e) {
      console.warn('[notifications] schedule failed:', e);
    }
  }
  return ids;
}

// Cancels every still-pending reminder tied to a reservation.
export async function cancelReservationReminders(
  reservationId: number | string,
): Promise<void> {
  if (!AVAILABLE) return;
  const target = String(reservationId);
  try {
    const all = await Notifications!.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => {
          const d = n.content?.data as Record<string, unknown> | undefined;
          return d?.kind === 'reservation-reminder' && String(d?.reservationId) === target;
        })
        .map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (e) {
    console.warn('[notifications] cancel failed:', e);
  }
}

// Registers a "reminder notification tapped" callback. Returns something
// with .remove(); a harmless no-op where notifications are unavailable.
export function addReminderTapListener(onTap: () => void): { remove: () => void } {
  if (!AVAILABLE) return { remove: () => {} };
  try {
    return Notifications!.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      if (data?.kind === 'reservation-reminder') onTap();
    });
  } catch {
    return { remove: () => {} };
  }
}
