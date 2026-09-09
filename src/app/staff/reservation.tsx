// ============================================================
// FILE: app/staff/reservation.tsx (UPDATED -- receipt-style arrival
// confirmation after QR scan)
// ============================================================
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const NAVY = '#1A1D21';
const BLUE = '#2563EB';
const BLUE_TINT = '#EEF4FF';
const GREEN = '#16A34A';
const GREEN_TINT = '#E7F6EC';
const AMBER = '#B7791F';
const AMBER_TINT = '#FBF0DE';
const RED = '#DC2626';
const RED_TINT = '#FCECEC';
const GRAY = '#6B7280';
const GRAY_TINT = '#F7F8FA';

// Arrival is now confirmed via QR scan (confirm_reservation_arrival RPC),
// which computes lateness itself using a 15-minute grace period from
// scheduled_at. This constant is display-only, for the "time left" pill
// shown before the customer has scanned in.
const GRACE_PERIOD_MINUTES = 15;

// The camera heartbeat (cv_heartbeat.updated_at, pinged every ~10s by
// backend/camera.py) must be newer than this for CV to count as "online".
// A reserved check-in relies on CV to detect wash start/end, so we refuse
// to check a customer in when the camera isn't running.
const CAMERA_ONLINE_WINDOW_MS = 90_000;
// No-show auto-cancel is now server-authoritative: the sweep_no_show_reservations()
// DB function voids any reservation that is never scanned in once this same
// 15-minute grace period after its slot has elapsed (see
// supabase/sql/2026-09_reservation_no_show_autocancel.sql). It runs from a
// pg_cron job every minute; this screen just calls it too so the Cancelled
// tab updates live while staff are looking at it. No staff tap needed.

type reservationtatus = 'Waiting' | 'Washing' | 'Completed' | 'Voided';
type PaymentStatus = 'paid' | 'unpaid';

interface ReservationRow {
  id: number;

  customer_id: string;
  shop_id: number;
  bay_name: string | null;
  customer_name: string | null;
  vehicle_type: string;
  service_type: string;
  status: reservationtatus;
  payment_status: PaymentStatus | null;
  paid_at: string | null;
  created_at: string;
  reservation_date: string;
  price: number | null;
  // Advance date/time-slot booking + QR arrival fields. Walk-in rows
  // (created directly by backend/camera.py) never have these set.
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_at: string | null;
  arrived_at: string | null;
  is_late: boolean;
  // Bay-entry (CV-confirmed wash start) and bay-exit (CV-confirmed
  // departure) timestamps -- set by backend/camera.py, not the app.
  washing_started_at: string | null;
  completed_at: string | null;
  // Customer's mobile number, merged in from `profiles` after the fetch --
  // so staff can call/text a reserved customer who hasn't shown up yet.
  customer_mobile: string | null;
}

// FIX: "Voided" tab removed from the UI per request -- voided reservations
// simply drop out of view once voided (the Void action itself is untouched
// and still works from the New tab). TabKey no longer includes 'Voided'
// since it can never be selected.
type TabKey = 'New' | 'Washing' | 'Completed' | 'Cancelled';

const TABS: { key: TabKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'New', icon: 'time-outline' },
  { key: 'Washing', icon: 'water-outline' },
  { key: 'Completed', icon: 'checkmark-circle-outline' },
  { key: 'Cancelled', icon: 'close-circle-outline' },
];

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function msUntilGraceEnd(scheduledAt: string) {
  const graceEndsAt = new Date(scheduledAt).getTime() + GRACE_PERIOD_MINUTES * 60000;
  return graceEndsAt - Date.now();
}

// Buong date + time (hal. "Sep 5, 8:02 AM") -- hindi lang oras, dahil
// kailangang makita rin kung ANONG ARAW na-scan/na-detect, hindi lang
// ang oras.
function formatDateTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    return `${datePart}, ${timePart}`;
  } catch {
    return '—';
  }
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Local YYYY-MM-DD for a given Date -- shared by "today" checks and by
// the date-filter strip below, so both always agree on what "today" means.
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayKey() {
  return toDateKey(new Date());
}

// The day a row belongs to, as a clean local YYYY-MM-DD. Uses the booked
// SLOT date (scheduled_date) when present, else the walk-in day
// (reservation_date). Robust to values that come back with a time part
// or as a full timestamp -- the old code compared the raw string with
// `=== effectiveDate`, so a "2026-09-08T00:00:00+00:00" (or any tz-shifted
// value) silently matched nothing and past days looked empty.
function rowDayKey(r: { scheduled_date?: string | null; reservation_date?: string | null }) {
  const raw = r.scheduled_date || r.reservation_date || '';
  if (!raw) return '';
  const head = String(raw).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? String(raw) : toDateKey(d);
}

// FIX: para hindi ma-treat as "same day / kanina lang" ang mga stale
// o test-seeded na reservation na galing pa sa ibang araw (hal. kahapon),
// kinukumpara natin ang petsa sa TALAGANG kasalukuyang araw (local date,
// YYYY-MM-DD) bago i-allow ang countdown/no-show logic dito.
function isFromToday(dateStr: string) {
  return rowDayKey({ scheduled_date: dateStr }) === getTodayKey();
}

// "Sun, Sep 8 · 10:00 AM" -- the customer's chosen slot, spelled out so
// staff see at a glance WHEN this booking is for.
function formatSlot(dayKey: string, time: string | null) {
  let dayLabel = dayKey;
  try {
    const [y, m, d] = dayKey.split('-').map(Number);
    dayLabel = new Date(y, m - 1, d).toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    /* keep raw */
  }
  return time ? `${dayLabel} · ${time}` : dayLabel;
}

function formatDateLabel(dateKey: string) {
  if (dateKey === getTodayKey()) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === toDateKey(yesterday)) return 'Yesterday';
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateKey;
  }
}

interface CalendarCell {
  day: number;
  dateKey: string;
}

// FIX (new): builds the day-grid for a real calendar month view -- leading
// blanks so day 1 lands on the correct weekday column, then one cell per
// day of the month. `viewDate` only needs its year/month to matter.
function buildCalendarCells(viewDate: Date): (CalendarCell | null)[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const numDays = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday

  const cells: (CalendarCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= numDays; day++) {
    cells.push({ day, dateKey: toDateKey(new Date(year, month, day)) });
  }
  return cells;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface ConfirmState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
}
const initialConfirm: ConfirmState = {
  visible: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  confirmColor: BLUE,
  onConfirm: () => {},
};

interface FeedbackState {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'error';
}
const initialFeedback: FeedbackState = { visible: false, title: '', message: '', type: 'error' };

// NEW: buong detalye ng reservation na kinukuha pagkatapos ma-scan ang QR
// -- ito na ang binubuo bilang isang "receipt-style" confirmation card sa
// halip na plain text lang, para malinaw na makita ng staff KUNG SINO at
// ANO ang che-check in niya bago pa man i-confirm.
interface ArrivalPreview {
  token: string;
  customer_name: string | null;
  vehicle_type: string;
  service_type: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  price: number | null;
  payment_status: PaymentStatus | null;
}

function createFreshChannel(channelName: string) {
  const topic = `realtime:${channelName}`;
  const existing = supabase.getChannels().find((ch) => ch.topic === topic);
  if (existing) supabase.removeChannel(existing);
  return supabase.channel(channelName);
}

export default function StaffreservationScreen() {
  const [assignedShopId, setAssignedShopId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reservation, setreservation] = useState<ReservationRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('New');
  const [, setTick] = useState(0); // ginagamit lang para mag-re-render ang countdown bawat segundo
  const [busyId, setBusyId] = useState<number | null>(null); // FIX: id-based na, hindi customer_id

  // null = not checked yet; true/false = backend/camera.py detection loop
  // is running / not. A reserved check-in needs CV to detect wash
  // start/end, so we block it (with a warning modal) when this is false.
  const [cameraOnline, setCameraOnline] = useState<boolean | null>(null);

  // FIX (new): date filter. null = "live/today" -- auto-advances at
  // midnight since it's re-derived from the real clock every render
  // instead of being frozen at whatever "today" was when picked. A
  // non-null value means the staff explicitly chose a past day to browse
  // (e.g. to check what was Completed last Tuesday), and it stays fixed
  // until they tap back to "Today".
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayKey = getTodayKey();
  const effectiveDate = selectedDate ?? todayKey;
  const isViewingToday = effectiveDate === todayKey;

  // FIX: date filter is now a real calendar (month grid + nav arrows)
  // opened from a button placed inline right after the "Completed" tab.
  const [dateDropdownVisible, setDateDropdownVisible] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(new Date());
  const calendarCells = useMemo(() => buildCalendarCells(calendarViewDate), [calendarViewDate]);

  const openDateDropdown = () => {
    const [y, m, d] = effectiveDate.split('-').map(Number);
    setCalendarViewDate(new Date(y, m - 1, d));
    setDateDropdownVisible(true);
  };

  const shiftCalendarMonth = (delta: number) => {
    setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  // FIX: future dates are no longer selectable -- staff can only view
  // today or a past day, never a day that hasn't happened yet.
  const isFutureDate = (dateKey: string) => dateKey > todayKey;
  const todayDate = new Date();
  const isViewingCurrentOrFutureMonth =
    calendarViewDate.getFullYear() > todayDate.getFullYear() ||
    (calendarViewDate.getFullYear() === todayDate.getFullYear() &&
      calendarViewDate.getMonth() >= todayDate.getMonth());

  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string, type: 'success' | 'error' = 'error') =>
    setFeedback({ visible: true, title, message, type });

  // NEW: hawak ang buong detalye ng reservation na kaka-scan lang, para
  // maipakita bilang receipt-style card. null = walang bukas na preview.
  const [arrivalPreview, setArrivalPreview] = useState<ArrivalPreview | null>(null);
  const closeArrivalPreview = () => setArrivalPreview(null);

  // ---------- QR scanner (arrival confirmation) ----------
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const scanLockRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  const syncBayAvailability = useCallback(async (row: ReservationRow, occupied: boolean, reserved: boolean) => {
    if (!row.bay_name) return;

    const { error } = await supabase
      .from('bays')
      .update({ occupied, reserved })
      .eq('shop_id', row.shop_id)
      .eq('bay_name', row.bay_name);

    if (error) {
      console.log('[Reservation] bay sync error:', error.message);
    }
  }, []);

  // Called whenever a bay is freed (Void, Complete) -- gives the oldest
  // arrived-but-unassigned reserved customer first claim on this bay
  // before it's opened back up to walk-ins. No-op if the row never had a
  // bay to begin with (e.g. voiding a reservation that never arrived).
  const freeOrClaimBay = useCallback(async (row: ReservationRow) => {
    if (!row.bay_name) return;

    const { error } = await supabase.rpc('claim_bay_for_reserved_or_free', {
      p_bay_name: row.bay_name,
      p_shop_id: row.shop_id,
    });

    if (error) {
      console.log('[Reservation] free/claim bay error:', error.message);
    }
  }, []);

  // FIX: hawak natin dito ang PINAKABAGONG "reservation" array sa isang
  // ref, para hindi na kailangang i-recreate/restart ang auto-void
  // interval tuwing nag-uupdate ang listahan (dati, kada pag-refresh ng
  // "reservation" state ay nire-restart din ang buong setInterval dahil
  // kasama ito sa dependency array).
  const reservationRef = useRef<ReservationRow[]>([]);
  useEffect(() => {
    reservationRef.current = reservation;
  }, [reservation]);

  // FIX: "Can't perform a React state update on an unmounted component"
  // console warning. Marami tayong async na Supabase call dito (fetch,
  // RPC, .update) na kaya pang mag-resolve MATAPOS nang umalis/mag-unmount
  // ang screen (hal. mabilis na pag-navigate papuntang detail o pag-logout).
  // Bawat setState na susunod sa isang `await` ay dapat munang tingnan ito.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ---------- Auth / shop resolution ----------
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('shop_id')
        .eq('id', session.user.id)
        .single();
      if (isMounted) setAssignedShopId(data?.shop_id ? Number(data.shop_id) : null);
    })();
    return () => { isMounted = false; };
  }, []);

  // ---------- Fetch today's reservation for this shop ----------
  const fetchreservation = useCallback(async (shopId: number | null) => {
    if (!shopId) {
      setreservation([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('reservation')
      .select(
        'id, customer_id, shop_id, bay_name, customer_name, vehicle_type, service_type, status, payment_status, paid_at, created_at, reservation_date, price, scheduled_date, scheduled_time, scheduled_at, arrived_at, is_late, washing_started_at, completed_at'
      )
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(300);

    // Umalis na ang staff sa screen habang nag-fe-fetch pa -- huwag nang
    // mag-setState (iiwas sa unmounted-component warning).
    if (!isMountedRef.current) return;

    if (error) {
      showFeedback('Failed to Load', error.message);
    } else {
      const next = (data ?? []).map((r: any) => ({
        ...r,
        customer_mobile: null,
      })) as ReservationRow[];

      // Merge in each reserved customer's mobile number from `profiles`
      // (one batched lookup) so staff can call/text a no-show.
      const customerIds = [
        ...new Set(next.map((r) => r.customer_id).filter(Boolean)),
      ];
      if (customerIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, mobile')
          .in('id', customerIds);
        const mobileById = new Map((profs ?? []).map((p: any) => [p.id, p.mobile ?? null]));
        next.forEach((r) => {
          r.customer_mobile = mobileById.get(r.customer_id) ?? null;
        });
      }
      if (!isMountedRef.current) return;

      // Realtime-diff toast: kapag may reserved customer (may arrived_at
      // na, wala pang bay) na bigla nang naka-assign ng bay, ibig sabihin
      // awtomatiko siyang na-claim ng isang kakalibreng bay (via
      // claim_bay_for_reserved_or_free) -- ipinapaalam natin ito sa staff.
      const prevById = new Map(reservationRef.current.map((r) => [r.id, r]));
      next.forEach((r) => {
        const prev = prevById.get(r.id);
        if (prev && !prev.bay_name && prev.arrived_at && r.bay_name) {
          showFeedback(
            'Bay Assigned',
            `${r.bay_name} was auto-assigned to ${r.customer_name ?? 'a reserved customer'}.`,
            'success'
          );
        }
      });

      setreservation(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!assignedShopId) return;
    fetchreservation(assignedShopId);

    const channel = createFreshChannel('staff-reservation-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservation', filter: `shop_id=eq.${assignedShopId}` },
        () => fetchreservation(assignedShopId)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [assignedShopId, fetchreservation]);

  useFocusEffect(useCallback(() => { fetchreservation(assignedShopId); }, [assignedShopId, fetchreservation]));

  // ---------- Camera / CCTV liveness ----------
  // Fresh DB check of the CV heartbeat. Returns true only if camera.py has
  // pinged within CAMERA_ONLINE_WINDOW_MS. Also updates `cameraOnline` for
  // the offline banner.
  const checkCameraFresh = useCallback(async (): Promise<boolean> => {
    if (!assignedShopId) return false;
    try {
      const { data } = await supabase
        .from('cv_heartbeat')
        .select('updated_at')
        .eq('shop_id', assignedShopId)
        .maybeSingle();
      const fresh =
        !!data?.updated_at &&
        Date.now() - new Date(data.updated_at).getTime() < CAMERA_ONLINE_WINDOW_MS;
      if (isMountedRef.current) setCameraOnline(fresh);
      return fresh;
    } catch {
      if (isMountedRef.current) setCameraOnline(false);
      return false;
    }
  }, [assignedShopId]);

  useEffect(() => {
    if (!assignedShopId) return;
    checkCameraFresh();
    const t = setInterval(checkCameraFresh, 15000);
    return () => clearInterval(t);
  }, [assignedShopId, checkCameraFresh]);

  // ---------- Countdown ticker ----------
  // FIX: this same 1-second tick is also what makes "Today" in the date
  // filter (and the default un-filtered view) roll over automatically at
  // midnight -- getTodayKey()/buildCalendarCells() are recomputed on every
  // render, and this interval is what keeps the component re-rendering.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ---------- Void a reservation (manual "Void" button only) ----------
  // No-show voiding is handled by sweep_no_show_reservations() in the DB,
  // not here -- see the sweepNoShows effect below.
  const handleVoid = useCallback(async (row: ReservationRow, silent = false) => {
    const { error } = await supabase
      .from('reservation')
      .update({ status: 'Voided' })
      .eq('id', row.id);

    if (!isMountedRef.current) return;

    if (error && !silent) {
      showFeedback('Void Failed', error.message);
      return;
    }

    await freeOrClaimBay(row);

    if (!isMountedRef.current) return;

    setreservation((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: 'Voided' } : r))
    );
  }, [freeOrClaimBay]);

  // No-show auto-cancel. The rule lives entirely in the DB function
  // sweep_no_show_reservations() (voids any never-scanned-in reservation
  // once its 15-minute grace period has passed, which fires the
  // store-credit trigger). A pg_cron job runs it every minute regardless
  // of whether any app is open; here we just call it on mount and every
  // 60s so the Cancelled tab reflects it live -- no staff tap involved.
  const sweepNoShows = useCallback(async () => {
    const { error } = await supabase.rpc('sweep_no_show_reservations');
    if (!isMountedRef.current) return;
    if (error) {
      console.log('[Reservation] no-show sweep error:', error.message);
      return;
    }
    fetchreservation(assignedShopId);
  }, [assignedShopId, fetchreservation]);

  useEffect(() => {
    sweepNoShows();
    const check = setInterval(sweepNoShows, 60000);
    return () => clearInterval(check);
  }, [sweepNoShows]);

  // ---------- QR scan handler ----------
  const openScanner = () => {
    scanLockRef.current = false;
    setScannerVisible(true);
  };

  // FIX: scanning a QR code no longer immediately marks the customer as
  // arrived. It first looks up the FULL reservation details (read-only)
  // and shows them as a receipt-style confirmation card (see
  // ArrivalPreview / the new modal below) so staff can see WHO and WHAT
  // they're about to check in -- customer, package, vehicle, schedule,
  // price, and payment status -- all at a glance. Only tapping "Confirm
  // Arrival" there actually calls confirm_reservation_arrival and commits
  // the check-in. This avoids accidentally checking in the wrong customer
  // from a mis-scan, and gives staff a clear, friendly moment to
  // double-check before it's final.
  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setScannerVisible(false);

      if (!data.startsWith('ICW-RES:')) {
        showFeedback(
          'That Didn\u2019t Look Right',
          'This QR code isn\u2019t a valid I-CarWash reservation code. Please scan the code shown on the customer\u2019s booking.'
        );
        return;
      }
      const token = data.slice('ICW-RES:'.length);

      setScanBusy(true);
      const { data: preview, error: previewError } = await supabase
        .from('reservation')
        .select('customer_name, vehicle_type, service_type, scheduled_date, scheduled_time, price, payment_status, status')
        .eq('qr_token', token)
        .maybeSingle();

      if (!isMountedRef.current) return;
      setScanBusy(false);

      if (previewError || !preview) {
        showFeedback(
          'QR Code Not Found',
          'We couldn\u2019t match this to any reservation. It may be expired, already used, or from a different branch.'
        );
        return;
      }

      // 1) Cancelled / voided booking -> reservation failure, stop here.
      if (preview.status === 'Voided' || preview.status === 'Cancelled') {
        showFeedback('Reservation Cancelled', 'This booking was already cancelled and can no longer be checked in.');
        return;
      }

      // 2) QR is still valid, but the wash can't be tracked without the
      //    camera -> show "CCTV not connected" and don't open the preview.
      const camOk = await checkCameraFresh();
      if (!isMountedRef.current) return;
      if (!camOk) {
        showFeedback(
          'CCTV Not Connected',
          'The camera isn’t running right now, so the wash can’t be tracked automatically. Reconnect the CCTV / start the camera, then scan the QR again.'
        );
        return;
      }

      setArrivalPreview({
        token,
        customer_name: preview.customer_name,
        vehicle_type: preview.vehicle_type,
        service_type: preview.service_type,
        scheduled_date: preview.scheduled_date,
        scheduled_time: preview.scheduled_time,
        price: preview.price,
        payment_status: preview.payment_status,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Actually commits the arrival -- only called after the staff taps
  // "Confirm Arrival" on the receipt-style preview card above.
  const finalizeArrival = useCallback(
    async (token: string) => {
      setScanBusy(true);

      // The reserved flow depends on the camera to auto-start and auto-end
      // the wash. If the CCTV / camera.py isn't running, checking the
      // customer in would strand them in "Washing" forever -- refuse it.
      const camOk = await checkCameraFresh();
      if (!isMountedRef.current) return;
      if (!camOk) {
        setScanBusy(false);
        showFeedback(
          'CCTV Not Connected',
          'The camera isn’t running right now, so the wash can’t be tracked automatically. Reconnect the CCTV / start the camera, then scan the QR again.'
        );
        return;
      }

      const { data: result, error } = await supabase.rpc('confirm_reservation_arrival', {
        p_qr_token: token,
      });

      if (!isMountedRef.current) return;
      setScanBusy(false);

      if (error) {
        const friendly: Record<string, string> = {
          QR_NOT_FOUND: 'This QR code no longer matches any reservation.',
          WRONG_SHOP: 'This reservation is for a different branch.',
          NOT_TODAY: 'This reservation isn\u2019t scheduled for today.',
          RESERVATION_INACTIVE: 'This reservation was already cancelled or voided.',
          NOT_STAFF: 'Only staff accounts can check customers in.',
        };
        const key = Object.keys(friendly).find((k) => error.message?.includes(k));
        showFeedback('Check-In Failed', key ? friendly[key] : error.message);
        return;
      }

      const row = result?.[0];
      if (!row) return;

      const lateNote = row.is_late
        ? ' They arrived a little after the grace period, but that\u2019s okay \u2014 still honored.'
        : '';

      // Hindi na binabanggit kung anong bay -- basta matagumpay ang
      // check-in, tapos na. Ang "next in line" lang ang pinapanatili
      // para hindi mag-abang ng bay ang staff kung wala pa.
      showFeedback(
        'Customer Checked In',
        row.waiting_for_bay
          ? `Check-in successful. This customer is next in line for a bay.${lateNote}`
          : `Check-in successful.${lateNote}`,
        'success'
      );

      fetchreservation(assignedShopId);
    },
    [assignedShopId, fetchreservation, checkCameraFresh]
  );

  // NEW: pinipindot mula sa receipt-style preview card -- isasara ang
  // preview at saka pa lang talaga isasagawa ang check-in.
  const confirmArrivalFromPreview = () => {
    if (!arrivalPreview) return;
    const token = arrivalPreview.token;
    setArrivalPreview(null);
    finalizeArrival(token);
  };

  // ---------- Actions (silent -- tinatawag lang matapos mag-confirm) ----------
  const updateStatus = async (row: ReservationRow, newStatus: reservationtatus) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from('reservation')
      .update({ status: newStatus })
      .eq('id', row.id);

    if (!isMountedRef.current) return;
    setBusyId(null);
    if (error) {
      showFeedback('Update Failed', error.message);
      return;
    }

    if (newStatus === 'Washing') {
      await syncBayAvailability(row, true, false);
    }

    if (!isMountedRef.current) return;
    setreservation((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r))
    );
  };

  const togglePaid = async (row: ReservationRow) => {
    const next: PaymentStatus = row.payment_status === 'paid' ? 'unpaid' : 'paid';
    const nextPaidAt = next === 'paid' ? new Date().toISOString() : null;
    setBusyId(row.id);
    const { error } = await supabase
      .from('reservation')
      .update({ payment_status: next, paid_at: nextPaidAt })
      .eq('id', row.id);

    if (!isMountedRef.current) return;
    setBusyId(null);
    if (error) {
      showFeedback('Could Not Update Payment', error.message);
      return;
    }
    setreservation((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, payment_status: next, paid_at: nextPaidAt } : r))
    );
  };

  const confirmStartWashing = (row: ReservationRow) => {
    setConfirm({
      visible: true,
      title: 'Start Washing?',
      message: `Confirm that ${row.vehicle_type} (${row.service_type}) has arrived and is now starting service. This moves it to the Washing tab.`,
      confirmLabel: 'Start Washing',
      confirmColor: BLUE,
      onConfirm: () => {
        closeConfirm();
        updateStatus(row, 'Washing');
      },
    });
  };

  const confirmVoid = (row: ReservationRow) => {
    setConfirm({
      visible: true,
      title: 'Void This Reservation?',
      message: `This will free up the bay for ${row.vehicle_type} (${row.service_type}). Use this if the customer didn't show up.`,
      confirmLabel: 'Void',
      confirmColor: RED,
      onConfirm: () => {
        closeConfirm();
        handleVoid(row);
      },
    });
  };

  const confirmTogglePaid = (row: ReservationRow) => {
    const isMarkingPaid = row.payment_status !== 'paid';
    setConfirm({
      visible: true,
      title: isMarkingPaid ? 'Mark as Paid?' : 'Mark as Unpaid?',
      message: isMarkingPaid
        ? `Confirm that payment for ${row.vehicle_type} (${row.service_type}) has been received.`
        : `This will revert ${row.vehicle_type} (${row.service_type}) back to UNPAID. Use this only if marked paid by mistake.`,
      confirmLabel: isMarkingPaid ? 'Mark Paid' : 'Mark Unpaid',
      confirmColor: isMarkingPaid ? GREEN : AMBER,
      onConfirm: () => {
        closeConfirm();
        togglePaid(row);
      },
    });
  };

  // NEW: pag-tap ng card -- pumupunta sa hiwalay na detail screen
  // (app/staff/reservation-detail.tsx), na naglalaman ng buong info ng
  // reservation (Status box, Vehicle Details, disabled QR box, atbp.),
  // gaya ng ginagawa ngayon ng listahan pero mas detalyado.
  const openDetail = (row: ReservationRow) => {
    router.push(`/staff/reservation-detail?id=${row.id}`);
  };

  // FIX (new): rows are now scoped to `effectiveDate` (reservation_date)
  // in addition to the active tab. With no date explicitly picked, that's
  // "today", so a Completed row quietly drops out of view once its day is
  // over instead of piling up forever -- exactly like the 24-hour reset
  // that was asked for, except it resets cleanly at midnight rather than
  // partway through a shift. Picking an older day from the strip below
  // reveals that day's rows in whichever tab is open, so nothing is
  // actually lost -- it's just not cluttering the default view.
  const visiblereservation = reservation.filter((r) => {
    if (rowDayKey(r) !== effectiveDate) return false;
    switch (activeTab) {
      case 'New':
        return r.status === 'Waiting';
      case 'Washing':
        return r.status === 'Washing';
      case 'Completed':
        return r.status === 'Completed';
      case 'Cancelled':
        return r.status === 'Voided';

      default:
        return true;
    }
  });

  // "New" badge always reflects TODAY's pending queue regardless of which
  // day is being browsed -- browsing history shouldn't make the live
  // pending count disappear or look wrong.
  const newCount = reservation.filter((r) => r.status === 'Waiting' && rowDayKey(r) === todayKey).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>reservation</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? '#fff' : GRAY} />
              <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>{tab.key}</Text>
              {tab.key === 'New' && newCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{newCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* FIX (new): calendar date filter, placed right next to the
            Completed tab in the same row per request, instead of on its
            own row below. Opens a real month-grid calendar modal. */}
        <TouchableOpacity style={styles.dateDropdownBtn} onPress={openDateDropdown}>
          <Ionicons name="calendar-outline" size={15} color={NAVY} />
          <Text style={styles.dateDropdownBtnText}>{formatDateLabel(effectiveDate)}</Text>
        </TouchableOpacity>
      </ScrollView>

      {activeTab === 'New' && isViewingToday && cameraOnline === false && (
        <View style={styles.cctvOfflineBanner}>
          <Ionicons name="videocam-off-outline" size={18} color="#8A5A12" />
          <Text style={styles.cctvOfflineText}>
            CCTV / camera not connected. Check-ins are paused until it’s back online — the wash
            can’t be tracked without it.
          </Text>
        </View>
      )}

      {activeTab === 'New' && isViewingToday && (
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner} disabled={scanBusy}>
          {scanBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={18} color="#fff" />
              <Text style={styles.scanBtnText}>Scan QR to Confirm Arrival</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <ScrollView style={{ flex: 1, padding: 16 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="small" color={BLUE} style={{ marginTop: 40 }} />
        ) : visiblereservation.length === 0 ? (
          <Text style={styles.emptyText}>
            No {activeTab.toLowerCase()} reservations for {formatDateLabel(effectiveDate).toLowerCase()}.
          </Text>
        ) : (
          visiblereservation.map((row) => {
            // Reserved-but-not-yet-arrived rows have no bay yet -- these
            // are the ones that go through the QR scanner. Walk-in rows
            // (bay_name already set by backend/camera.py's detection) keep
            // the original "Customer Arrived -- Start" flow untouched.
            const isPendingReserved = row.status === 'Waiting' && !row.bay_name;
            const hasArrived = !!row.arrived_at;
            const graceRemaining =
              isPendingReserved && !hasArrived && row.scheduled_at ? msUntilGraceEnd(row.scheduled_at) : null;
            const isPaid = row.payment_status === 'paid';
            const isBusy = busyId === row.id;
            // No-show risk: reserved, still not checked in, and the grace
            // period after the slot has already passed. Card turns red;
            // the server-side sweep will auto-cancel it into the
            // Cancelled tab shortly after.
            const noShowRisk =
              graceRemaining !== null &&
              graceRemaining <= 0 &&
              !!row.scheduled_date &&
              isFromToday(row.scheduled_date);

            return (
              // NEW: buong card ay TouchableOpacity na ngayon -- tinatap
              // dito (labas sa mismong Void/Start/PAID buttons) ang
              // nagbubukas ng detail screen. Gumagana pa rin nang normal
              // ang mga button sa loob dahil kinukuha ng nested
              // TouchableOpacity ang tap event bago pa ito umabot sa
              // outer card.
              <TouchableOpacity
                key={row.id}
                style={[styles.card, noShowRisk && styles.cardNoShowRisk]}
                activeOpacity={0.7}
                onPress={() => openDetail(row)}
              >
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{row.vehicle_type}</Text>
                    <Text style={styles.cardSubtitle}>{row.service_type}</Text>

                    {/* FIX: always show a customer identifier, even for
                        walk-ins that have no logged-in customer account --
                        this was previously hidden entirely when
                        customer_name was null, which is exactly the case
                        for most walk-in rows in the Completed tab. */}
                    <View style={styles.customerRow}>
                      <Ionicons name="person-outline" size={12} color={GRAY} />
                      <Text style={styles.customerName}>{row.customer_name ?? 'Walk-in customer'}</Text>
                    </View>

                    {isPendingReserved && row.scheduled_time && (
                      <View style={styles.slotTag}>
                        <Ionicons name="calendar" size={12} color={BLUE} />
                        <Text style={styles.slotTagText}>
                          Reserved for {formatSlot(rowDayKey(row), row.scheduled_time)}
                        </Text>
                      </View>
                    )}

                    {/* Contact the reserved customer -- call / text to
                        remind them or ask if they're still coming. */}
                    {isPendingReserved && !hasArrived && row.customer_mobile ? (
                      <View style={styles.contactRow}>
                        <Ionicons name="call-outline" size={12} color={GRAY} />
                        <Text style={styles.customerName}>{row.customer_mobile}</Text>
                        <TouchableOpacity
                          style={styles.contactBtn}
                          onPress={() => Linking.openURL(`tel:${row.customer_mobile}`)}
                        >
                          <Ionicons name="call" size={11} color={BLUE} />
                          <Text style={styles.contactBtnText}>Call</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.contactBtn}
                          onPress={() => Linking.openURL(`sms:${row.customer_mobile}`)}
                        >
                          <Ionicons name="chatbubble-ellipses" size={11} color={BLUE} />
                          <Text style={styles.contactBtnText}>Text</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={[styles.payTag, isPaid ? styles.payTagPaid : styles.payTagUnpaid]}
                    onPress={() => confirmTogglePaid(row)}
                    disabled={isBusy}
                  >
                    <Ionicons
                      name={isPaid ? 'checkmark-circle' : 'time-outline'}
                      size={13}
                      color={isPaid ? GREEN : AMBER}
                    />
                    <Text style={[styles.payTagText, { color: isPaid ? GREEN : AMBER }]}>
                      {isPaid ? 'PAID' : 'UNPAID'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* NEW: "tap hint" row -- price/countdown sa kaliwa, at
                    isang chevron-forward icon sa kanan, para malinaw sa
                    baguhan na tap-able ang buong card. Ito lang ang
                    idinagdag; walang binago sa logic. */}
                <View style={styles.cardMetaRow}>
                  <View style={styles.cardMetaLeft}>
                    <Text style={styles.cardPrice}>{row.price ? formatPeso(row.price) : '—'}</Text>

                    {isPendingReserved && hasArrived ? (
                      <View style={[styles.countdownPill, row.is_late && styles.countdownPillUrgent]}>
                        <Ionicons name="hourglass-outline" size={12} color={row.is_late ? RED : BLUE} />
                        <Text style={[styles.countdownText, { color: row.is_late ? RED : BLUE }]}>
                          Waiting for next available bay{row.is_late ? ' • Late arrival' : ''}
                        </Text>
                      </View>
                    ) : graceRemaining !== null && row.scheduled_date && isFromToday(row.scheduled_date) ? (
                      <View style={[styles.countdownPill, graceRemaining <= 0 && styles.countdownPillUrgent]}>
                        <Ionicons name="hourglass-outline" size={12} color={graceRemaining <= 0 ? RED : BLUE} />
                        <Text style={[styles.countdownText, { color: graceRemaining <= 0 ? RED : BLUE }]}>
                          {graceRemaining > 0
                            ? `${formatCountdown(graceRemaining)} grace period left`
                            : 'Grace period ended • no-show risk'}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Ionicons name="chevron-forward" size={20} color="#D5D8DE" />
                </View>

                <View style={styles.cardActions}>
                  {isPendingReserved && isViewingToday && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnGhost, { flex: 1 }]}
                      onPress={() => confirmVoid(row)}
                      disabled={isBusy}
                    >
                      <Text style={styles.actionBtnGhostText}>Void</Text>
                    </TouchableOpacity>
                  )}

                  {!isPendingReserved && row.status === 'Waiting' && isViewingToday && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPrimary]}
                        onPress={() => confirmStartWashing(row)}
                        disabled={isBusy}
                      >
                        <Text style={styles.actionBtnPrimaryText}>Customer Arrived — Start</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnGhost]}
                        onPress={() => confirmVoid(row)}
                        disabled={isBusy}
                      >
                        <Text style={styles.actionBtnGhostText}>Void</Text>
                      </TouchableOpacity>
                    </>
                  )}

                </View>

                {/*
                  FIX: "Entered bay: ..." (washing_started_at) row removed
                  entirely per request -- it duplicated what the Washing
                  status/tab already communicates and wasn't adding
                  anything the staff needed to act on.
                  "Arrived (QR scanned)" simplified to "Checked in" -- easier
                  to read at a glance than the old parenthetical.
                */}
                {(row.arrived_at || row.completed_at || row.status === 'Washing') && (
                  <View style={styles.metaFooter}>
                    {row.arrived_at && (
                      <View style={styles.metaFooterRow}>
                        <Ionicons name="checkmark-done-outline" size={13} color={GRAY} />
                        <Text style={styles.metaFooterText}>Checked in: {formatDateTime(row.arrived_at)}</Text>
                      </View>
                    )}
                    {row.completed_at && (
                      <View style={styles.metaFooterRow}>
                        <Ionicons name="log-out-outline" size={13} color={GRAY} />
                        <Text style={styles.metaFooterText}>Left bay: {formatDateTime(row.completed_at)}</Text>
                      </View>
                    )}

                    {row.status === 'Washing' && (
                      <View style={styles.metaFooterRow}>
                        <Ionicons name="videocam-outline" size={13} color={BLUE} />
                        <Text style={[styles.metaFooterText, { color: BLUE }]}>
                          Auto-completes once the camera detects the vehicle has left the bay.
                        </Text>
                      </View>
                    )}

                    {row.status === 'Washing' && row.is_late && (
                      <View style={styles.metaFooterRow}>
                        <Ionicons name="alert-circle-outline" size={13} color={AMBER} />
                        <Text style={[styles.metaFooterText, { color: AMBER }]}>
                          Arrived after the grace period
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* QR SCANNER MODAL */}
      <Modal
        visible={scannerVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setScannerVisible(false)}
      >
        <View style={styles.scannerContainer}>
          {!permission?.granted ? (
            <View style={styles.scannerPermissionBox}>
              <Ionicons name="camera-outline" size={40} color="#fff" />
              <Text style={styles.scannerPermissionText}>
                Camera access is needed to scan reservation QR codes.
              </Text>
              <TouchableOpacity style={styles.scannerPermissionBtn} onPress={requestPermission}>
                <Text style={styles.scannerPermissionBtnText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
          )}
          <TouchableOpacity style={styles.scannerCloseBtn} onPress={() => setScannerVisible(false)}>
            <Ionicons name="close" size={18} color="#fff" />
            <Text style={styles.scannerCloseBtnText}>Close</Text>
          </TouchableOpacity>
          <View style={styles.scannerHintBox}>
            <Text style={styles.scannerHintText}>Point the camera at the customer's reservation QR code</Text>
          </View>
        </View>
      </Modal>

      {/* NEW: RECEIPT-STYLE ARRIVAL CONFIRMATION MODAL
          Lumalabas agad pagkatapos ma-scan ang QR, bago pa man ma-commit
          ang check-in. Buong detalye ng reservation ang nakalagay dito
          (customer, package, vehicle, schedule, presyo, payment status),
          parang resibo, para malinaw sa staff kung sino/ano ang
          kinu-confirm bago pindutin ang "Confirm Arrival". */}
      <Modal
        visible={!!arrivalPreview}
        transparent
        animationType="fade"
        onRequestClose={closeArrivalPreview}
      >
        <View style={styles.modalOverlay}>
          {arrivalPreview && (
            <View style={styles.previewCard}>
              <View style={styles.previewIconWrap}>
                <Ionicons name="qr-code" size={26} color="#fff" />
              </View>
              <Text style={styles.previewTitle}>Reservation Found</Text>
              <Text style={styles.previewSubtitle}>
                Please confirm these details before checking the customer in.
              </Text>

              <View style={styles.previewAmountWrap}>
                <Text style={styles.previewAmount}>
                  {arrivalPreview.price ? formatPeso(arrivalPreview.price) : '—'}
                </Text>
                <View
                  style={[
                    styles.previewPayPill,
                    arrivalPreview.payment_status === 'paid' ? styles.payTagPaid : styles.payTagUnpaid,
                  ]}
                >
                  <Ionicons
                    name={arrivalPreview.payment_status === 'paid' ? 'checkmark-circle' : 'time-outline'}
                    size={12}
                    color={arrivalPreview.payment_status === 'paid' ? GREEN : AMBER}
                  />
                  <Text
                    style={[
                      styles.previewPayPillText,
                      { color: arrivalPreview.payment_status === 'paid' ? GREEN : AMBER },
                    ]}
                  >
                    {arrivalPreview.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                  </Text>
                </View>
              </View>

              <View style={styles.previewDashedDivider} />

              <View style={styles.previewDetailsBlock}>
                <View style={styles.previewDetailRow}>
                  <Text style={styles.previewDetailLabel}>Customer</Text>
                  <Text style={styles.previewDetailValue}>
                    {arrivalPreview.customer_name ?? 'Walk-in customer'}
                  </Text>
                </View>
                <View style={styles.previewDetailRow}>
                  <Text style={styles.previewDetailLabel}>Package</Text>
                  <Text style={styles.previewDetailValue}>{arrivalPreview.service_type}</Text>
                </View>
                <View style={styles.previewDetailRow}>
                  <Text style={styles.previewDetailLabel}>Vehicle Type</Text>
                  <Text style={styles.previewDetailValue}>{arrivalPreview.vehicle_type}</Text>
                </View>
                <View style={styles.previewDetailRow}>
                  <Text style={styles.previewDetailLabel}>Scheduled Slot</Text>
                  <Text style={styles.previewDetailValue}>
                    {arrivalPreview.scheduled_date ? formatDateLabel(arrivalPreview.scheduled_date) : '—'}
                    {arrivalPreview.scheduled_time ? ` • ${arrivalPreview.scheduled_time}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.previewDashedDivider} />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={closeArrivalPreview}
                  disabled={scanBusy}
                >
                  <Text style={styles.modalBtnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: BLUE }]}
                  onPress={confirmArrivalFromPreview}
                  disabled={scanBusy}
                >
                  {scanBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnText}>Confirm</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* DATE FILTER: CALENDAR MODAL */}
      <Modal
        visible={dateDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDateDropdownVisible(false)}
        >
          <View style={styles.calendarCard} onStartShouldSetResponder={() => true}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => shiftCalendarMonth(-1)} style={styles.calendarNavBtn}>
                <Ionicons name="chevron-back" size={18} color={NAVY} />
              </TouchableOpacity>
              <Text style={styles.calendarHeaderText}>
                {calendarViewDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => shiftCalendarMonth(1)} style={styles.calendarNavBtn} disabled={isViewingCurrentOrFutureMonth}>
                <Ionicons name="chevron-forward" size={18} color={isViewingCurrentOrFutureMonth ? '#D5D8DE' : NAVY} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {WEEKDAY_LABELS.map((wd) => (
                <Text key={wd} style={styles.calendarWeekDayText}>{wd}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return <View key={`blank-${idx}`} style={styles.calendarDayCell} />;
                }
                const isSelected = cell.dateKey === effectiveDate;
                const isToday = cell.dateKey === todayKey;
                const isFuture = isFutureDate(cell.dateKey);
                return (
                  <TouchableOpacity
                    key={cell.dateKey}
                    disabled={isFuture}
                    style={[
                      styles.calendarDayCell,
                      isSelected && styles.calendarDayCellSelected,
                      !isSelected && isToday && styles.calendarDayCellToday,
                    ]}
                    onPress={() => {
                      setSelectedDate(cell.dateKey === todayKey ? null : cell.dateKey);
                      setDateDropdownVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isSelected && styles.calendarDayTextSelected,
                        isFuture && styles.calendarDayTextDisabled,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.calendarTodayBtn}
              onPress={() => {
                setSelectedDate(null);
                setCalendarViewDate(new Date());
                setDateDropdownVisible(false);
              }}
            >
              <Text style={styles.calendarTodayBtnText}>Jump to Today</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={confirm.visible} transparent animationType="fade" onRequestClose={closeConfirm}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{confirm.title}</Text>
            <Text style={styles.modalMessage}>{confirm.message}</Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={closeConfirm}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: confirm.confirmColor }]}
                onPress={confirm.onConfirm}
              >
                <Text style={styles.modalBtnText}>{confirm.confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FEEDBACK MODAL */}
      <Modal visible={feedback.visible} transparent animationType="fade" onRequestClose={closeFeedback}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{feedback.title}</Text>
            <Text style={styles.modalMessage}>{feedback.message}</Text>
            <TouchableOpacity
              style={[styles.modalBtnBlock, { backgroundColor: feedback.type === 'success' ? GREEN : BLUE }]}
              onPress={closeFeedback}
            >
              <Text style={styles.modalBtnBlockText}>
                {feedback.type === 'success' ? 'DONE' : 'OK'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    backgroundColor: NAVY,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },

  tabScroll: { flexGrow: 0 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 8 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF1',
  },
  tabBtnActive: { backgroundColor: BLUE, borderColor: BLUE },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: GRAY },
  tabBtnTextActive: { color: '#fff' },
  tabBadge: { backgroundColor: RED, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 2 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // ===== Date filter calendar (new) =====
  dateDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },
  dateDropdownBtnText: { fontSize: 12, fontWeight: '700', color: NAVY },
  calendarCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarNavBtn: { padding: 6 },
  calendarHeaderText: { fontSize: 14, fontWeight: '800', color: NAVY },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calendarWeekDayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: GRAY,
  },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginBottom: 2,
  },
  calendarDayCellSelected: { backgroundColor: BLUE },
  calendarDayCellToday: { borderWidth: 1.5, borderColor: BLUE },
  calendarDayText: { fontSize: 13, fontWeight: '600', color: NAVY },
  calendarDayTextSelected: { color: '#fff', fontWeight: '800' },
  calendarDayTextDisabled: { color: '#D5D8DE' },
  calendarTodayBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: GRAY_TINT,
  },
  calendarTodayBtnText: { fontSize: 12.5, fontWeight: '700', color: NAVY },

  cctvOfflineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: AMBER_TINT,
    borderWidth: 1,
    borderColor: '#EAD9AE',
  },
  cctvOfflineText: { flex: 1, color: '#8A5A12', fontSize: 12, fontWeight: '600', lineHeight: 16 },

  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BLUE,
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
  },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  emptyText: { textAlign: 'center', color: GRAY, marginTop: 40, fontSize: 13 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#ECEEF1',
  },
  // Reserved customer past their grace period and still not checked in.
  cardNoShowRisk: {
    borderColor: RED,
    borderLeftWidth: 4,
    backgroundColor: RED_TINT,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: NAVY },
  cardSubtitle: { fontSize: 12, color: GRAY, marginTop: 2 },

  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  customerName: { fontSize: 12, color: GRAY, fontWeight: '600' },
  slotTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: BLUE_TINT,
  },
  slotTagText: { fontSize: 11.5, color: BLUE, fontWeight: '800' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: 1, borderColor: BLUE_TINT, backgroundColor: BLUE_TINT,
  },
  contactBtnText: { fontSize: 10.5, fontWeight: '800', color: BLUE },

  payTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  payTagPaid: { backgroundColor: GREEN_TINT, borderColor: '#BBF7D0' },
  payTagUnpaid: { backgroundColor: AMBER_TINT, borderColor: '#EAD9AE' },
  payTagText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },

  // NEW: cardMetaRow now has three "columns" -- left group (price +
  // countdown), and a chevron on the far right. cardMetaLeft holds the
  // price/countdown so they stay together while the chevron sits at the
  // card's edge.
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  cardMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardPrice: { fontSize: 16, fontWeight: '900', color: NAVY },
  countdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BLUE_TINT, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  countdownPillUrgent: { backgroundColor: RED_TINT },
  countdownText: { fontSize: 11, fontWeight: '700' },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: BLUE, flex: 2 },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  actionBtnGhost: { backgroundColor: GRAY_TINT, flex: 1 },
  actionBtnGhostText: { color: GRAY, fontWeight: '800', fontSize: 12.5 },

  metaFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F7F8FA',
    gap: 6,
  },
  metaFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaFooterText: { fontSize: 11.5, color: GRAY, fontWeight: '700', flex: 1 },

  // ===== QR scanner modal =====
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerPermissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  scannerPermissionText: { color: '#fff', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  scannerPermissionBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  scannerPermissionBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  scannerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerCloseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scannerHintBox: {
    position: 'absolute',
    bottom: 50,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  scannerHintText: { color: '#fff', textAlign: 'center', fontSize: 12.5, fontWeight: '600' },

  // ===== NEW: receipt-style arrival confirmation card =====
  previewCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  previewIconWrap: {
    backgroundColor: BLUE,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  previewTitle: { fontSize: 16, fontWeight: '800', color: NAVY, textAlign: 'center' },
  previewSubtitle: {
    fontSize: 12,
    color: GRAY,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  previewAmountWrap: { alignItems: 'center', marginTop: 16, gap: 8 },
  previewAmount: { fontSize: 28, fontWeight: '900', color: NAVY },
  previewPayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  previewPayPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  previewDashedDivider: {
    width: '100%',
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#ECEEF1',
    marginVertical: 16,
  },
  previewDetailsBlock: { width: '100%' },
  previewDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewDetailLabel: { fontSize: 12.5, color: '#9AA1AC', fontWeight: '500' },
  previewDetailValue: { fontSize: 12.5, color: NAVY, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,18,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 20, padding: 22, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: NAVY, marginBottom: 6, textAlign: 'center' },
  modalMessage: { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  modalBtnRow: { flexDirection: 'row', width: '100%', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: GRAY_TINT },
  modalBtnGhostText: { color: GRAY, fontWeight: '700', fontSize: 13 },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  // Full-width na single button (feedback modal) -- HINDI gumagamit ng
  // `flex: 1` kasi direct column child ito ng modalCard, at dun nagko-
  // collapse sa 0 ang taas kaya "nawawala" ang label. Explicit na taas.
  modalBtnBlock: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalBtnBlockText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
});