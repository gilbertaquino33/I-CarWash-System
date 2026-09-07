// ============================================================
// FILE 1: app/customer/history.tsx (UPDATED)
// ============================================================
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../../lib/supabase';

// ---------- THEME: Blue / White / Black lang ang combination ----------
// Sinunod ang parehong palette ng Customer Dashboard para consistent.
const COLORS = {
  blue: '#2563EB',
  blueDark: '#1D4ED8',
  blueTint: '#EFF6FF',
  white: '#FFFFFF',
  black: '#0F172A',
  gray: '#64748B',
  grayLight: '#E2E8F0',
  bg: '#F8FAFC',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
};

const STATUS_WAITING = 'Waiting';
const STATUS_WASHING = 'Washing';
const STATUS_COMPLETED = 'Completed';
const STATUS_CANCELLED = 'Cancelled';

// NOTE: ang DB ay maaaring may mga LUMANG row na literal na "Voided" pa
// ang naka-store sa status column (bago pa na-standardize sa "Cancelled").
// Sa halip na hintayin ang DB migration, dito na natin tinuturing na
// "cancelled" ang parehong values -- para hindi na kailangang asahan pa
// na eksaktong "Cancelled" ang laman ng column bago tama ang lahat ng
// filtering, badge color, at disabled-QR behavior.
function isCancelledStatus(status: string) {
  return status === STATUS_CANCELLED || status === 'Voided';
}

// Ang TEXT na ipinapakita sa customer -- kahit "Voided" pa rin ang laman
// ng DB column, "Cancelled" pa rin ang lalabas dito.
function displayStatus(status: string) {
  return isCancelledStatus(status) ? STATUS_CANCELLED : status;
}

// NEW: isang row ay "active/upcoming" -- hindi pa tapos, buhay pa (Waiting
// o Washing). Ang mga ganitong row ay LAGING makikita kahit anong petsa
// ang reservation_date/scheduled_date nito, habang naka-view sa "Today" --
// hindi dapat sila "nawawala" lang dahil future pa ang petsa ng booking.
function isActiveStatus(status: string) {
  return status === STATUS_WAITING || status === STATUS_WASHING;
}

// UNIFIED TRANSACTION ROW -- pinagsama natin dito ang "reservation"
// (shop visit / book-a-slot) at "home_service" (pa-home service) records
// gamit ang parehong shape, para magamit sa iisang list/render lang.
// "kind" ang gagamitin natin para malaman kung saang table galing ang
// bawat row (para sa badge/label at para tama ang navigation kung
// kailangan pa sa hinaharap).
interface TransactionRow {
  id: number;
  kind: 'reservation' | 'home_service';
  shop_name: string | null;
  vehicle_type: string;
  service_type: string | null;
  status: string;
  price: number | null;
  txn_date: string | null; // reservation_date (reservation) o scheduled_date (home_service)
  // Ang SLOT na PINILI ng customer (petsa + oras ng booking). Ito ang
  // dapat ipakita sa card -- HINDI ang created_at (kung kailan siya
  // nag-book). scheduled_time ay reservation-only ('10:00 AM' na text);
  // ang home_service ay walang time slot kaya null.
  scheduled_date: string | null;
  scheduled_time: string | null;
  service_timer: string | null;
  created_at: string;
  bay_name: string | null;
  address: string | null; // home_service lang ito magkakaroon ng laman
  // reservation (shop visit) lang ito magkakaroon ng laman -- ang
  // arrived_at ay tinatakan pag na-scan ng staff ang QR ng customer, at
  // ang completed_at ay tinatakan ni backend/camera.py (CV) pag nadetect
  // nitong umalis na ang sasakyan sa bay.
  arrived_at: string | null;
  completed_at: string | null;
  // Eksaktong sandali ng pagbayad -- GCash: sabay ng booking (payment
  // happens bago pa ma-insert ang row); Cash: pag na-toggle ng staff na
  // "paid" sa staff/reservation.tsx.
  paid_at: string | null;
  // paraan ng bayad ("GCash" / "Cash on Hand") at ang reference
  // number na ginawa noong checkout -- pareho itong reservation-only
  // (home_service rows ay wala pang parehong flow).
  payment_method: string | null;
  payment_reference: string | null;
  // reservation-only -- kailangan ito para maipakita ulit ang QR
  // code sa History, sakaling na-late o nawala ang screenshot ng
  // customer noong una itong lumabas sa checkout receipt.
  qr_token: string | null;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  [STATUS_WAITING]: { bg: '#F1F5F9', color: '#64748B', icon: 'time-outline' },
  [STATUS_WASHING]: { bg: COLORS.blueTint, color: COLORS.blueDark, icon: 'water-outline' },
  [STATUS_COMPLETED]: { bg: '#DCFCE7', color: '#16A34A', icon: 'checkmark-circle-outline' },
  [STATUS_CANCELLED]: { bg: '#FEE2E2', color: COLORS.danger, icon: 'close-circle-outline' },
};

function getStatusStyle(status: string) {
  if (isCancelledStatus(status)) return STATUS_STYLE[STATUS_CANCELLED];
  return STATUS_STYLE[status] ?? STATUS_STYLE[STATUS_WAITING];
}

function formatTime(createdAt: string) {
  try {
    const d = new Date(createdAt);
    return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Buong date + time (hal. "Sep 5, 8:02 AM") -- ginagamit para sa
// arrived_at/completed_at/paid_at, dahil kailangang makita rin kung ANONG
// ARAW na-scan/na-detect/nabayaran, hindi lang ang oras.
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

function formatPrice(price: number | null) {
  if (price == null) return '—';
  return `₱${price}`;
}

// ---------- Date helpers (SAME approach as staff/reservation.tsx) ----------
// Local YYYY-MM-DD for a given Date -- shared by "today" checks and by
// the calendar filter below, so both always agree on what "today" means.
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayKey() {
  return toDateKey(new Date());
}

// Isang transaction row -> YYYY-MM-DD, gamit ang txn_date kung meron
// (reservation_date / scheduled_date), at ang created_at kung wala --
// pareho ng logic na ginamit sa pag-display (formatDate), para
// consistent ang ipinapakita at ang aktwal na ginagamit sa pag-filter.
function transactionDateKey(r: TransactionRow): string | null {
  const source = r.txn_date ?? r.created_at;
  if (!source) return null;
  try {
    return toDateKey(new Date(source));
  } catch {
    return null;
  }
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

// Builds the day-grid for a real calendar month view -- leading blanks so
// day 1 lands on the correct weekday column, then one cell per day of
// the month. `viewDate` only needs its year/month to matter.
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

type FilterKey = 'All' | 'Active' | 'Completed' | 'Cancelled';
const FILTERS: FilterKey[] = ['All', 'Active', 'Completed', 'Cancelled'];

export default function CustomerHistoryScreen() {
  const router = useRouter();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All');

  // Date filter. null = "live/today" -- auto-advances at midnight since
  // it's re-derived from the real clock every render instead of being
  // frozen at whatever "today" was when picked. A non-null value means
  // the customer explicitly chose a past day to browse, and it stays
  // fixed until they tap back to "Today".
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayKey = getTodayKey();
  const effectiveDate = selectedDate ?? todayKey;
  // NEW: kapag "Today" (default) ang view, hindi na naka-lock sa petsa
  // ang mga Waiting/Washing na row -- laging makikita sila (kahit
  // bukas o mas malayo pa ang scheduled/reservation date), para
  // makumpirma agad ng customer na "pumasok" ang bagong booking niya.
  // Pag lumipat siya sa isang SPECIFIC na past day gamit ang calendar,
  // babalik ito sa strict date-match (parang tinitingnan niya talaga
  // ang history ng araw na 'yon).
  const isViewingToday = effectiveDate === todayKey;

  // Calendar modal state (same UI pattern as staff/reservation.tsx).
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

  // NEW: hindi na "future dates" ang naka-disable sa calendar -- dati,
  // hindi mo pwedeng piliin ang bukas dahil sa palagay ay "wala pa
  // namang mangyayari doon". Pero ngayong may upcoming reservation na
  // pwedeng naka-book sa hinaharap, dapat pa rin puwedeng i-browse ang
  // mga future date para makita doon ang naka-schedule na booking.
  const isFutureDate = (_dateKey: string) => false;
  const isViewingCurrentOrFutureMonth = false;

  // NEW: which reservation's QR is currently being shown in the modal.
  const [qrModalRow, setQrModalRow] = useState<TransactionRow | null>(null);

  // Ticker lang para awtomatikong mag-roll over sa "Today" pagsapit ng
  // hatinggabi -- getTodayKey() ay kinukuha mula mismo sa oras ng
  // device tuwing tinatawag ito, at ang interval na ito ang siyang
  // nagpapa-re-render sa component kada segundo.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/customer/customer-registration');
        return;
      }

      // Kunin nang SABAY ang dalawang klase ng customer-initiated na
      // booking: (1) "reservation" -- pag-book ng slot sa shop mismo, at
      // (2) "home_service" -- pa-carwash sa bahay/lokasyon ng customer.
      // Sinasadya nating hindi isinasama ang "walkin_transactions" dahil
      // staff/walk-in ang gumagawa nito, hindi ang customer sa app.
      const [reservationRes, homeServiceRes] = await Promise.all([
        supabase
          .from('reservation')
          .select(
            'id, shop_name, vehicle_type, service_type, status, price, reservation_date, scheduled_date, scheduled_time, service_timer, created_at, bay_name, arrived_at, completed_at, paid_at, payment_method, payment_reference, qr_token'
          )
          .eq('customer_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('home_service')
          .select(
            'id, shop_name, vehicle_type, service_type, status, price, scheduled_date, created_at, address'
          )
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (reservationRes.error) throw reservationRes.error;
      if (homeServiceRes.error) throw homeServiceRes.error;

      const reservations: TransactionRow[] = (reservationRes.data ?? []).map((r: any) => ({
        id: r.id,
        kind: 'reservation' as const,
        shop_name: r.shop_name,
        vehicle_type: r.vehicle_type,
        service_type: r.service_type,
        status: r.status,
        price: r.price,
        txn_date: r.reservation_date,
        scheduled_date: r.scheduled_date,
        scheduled_time: r.scheduled_time,
        service_timer: r.service_timer,
        created_at: r.created_at,
        bay_name: r.bay_name,
        address: null,
        arrived_at: r.arrived_at,
        completed_at: r.completed_at,
        paid_at: r.paid_at,
        payment_method: r.payment_method,
        payment_reference: r.payment_reference,
        qr_token: r.qr_token,
      }));

      const homeServices: TransactionRow[] = (homeServiceRes.data ?? []).map((h: any) => ({
        id: h.id,
        kind: 'home_service' as const,
        shop_name: h.shop_name,
        vehicle_type: h.vehicle_type,
        service_type: h.service_type,
        status: h.status,
        price: h.price,
        txn_date: h.scheduled_date,
        scheduled_date: h.scheduled_date,
        scheduled_time: null,
        service_timer: null,
        created_at: h.created_at,
        bay_name: null,
        address: h.address,
        arrived_at: null,
        completed_at: null,
        paid_at: null,
        payment_method: null,
        payment_reference: null,
        qr_token: null,
      }));

      // Pinagsama at pinag-sort by created_at (pinakabago muna), dahil
      // hiwalay na table galing ang bawat isa kaya kailangan i-merge
      // muna sa isang array bago i-sort sa client side.
      const merged = [...reservations, ...homeServices].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setTransactions(merged);
    } catch (error) {
      console.error('[History] Error fetching reservation history:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    fetchHistory();

    // Live update: kapag na-update ang status ng reservation/home_service
    // (hal. Waiting -> Washing -> Completed) samantalang nakabukas ang
    // History screen, awtomatikong mag-re-refresh nang hindi na kailangan
    // pull-to-refresh ang customer.
    const topic = 'realtime:customer-history-live';
    const existingChannel = supabase.getChannels().find((c) => c.topic === topic);
    if (existingChannel) {
      supabase.removeChannel(existingChannel);
    }

    const channel = supabase
      .channel('customer-history-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation' }, () => {
        fetchHistory();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_service' }, () => {
        fetchHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  // Kailan dapat lumabas ang ACTIVE (tap-able) "Show QR" button --
  // reservation lang, may qr_token, hindi pa naka-check-in, at hindi pa
  // cancelled/voided sa alinmang spelling.
  const canShowQr = (r: TransactionRow) =>
    r.kind === 'reservation' &&
    !!r.qr_token &&
    !r.arrived_at &&
    !isCancelledStatus(r.status);

  const showDisabledQr = (r: TransactionRow) =>
    r.kind === 'reservation' && !!r.qr_token && isCancelledStatus(r.status);

  // FIX: rows are scoped to `effectiveDate` PERO may exception ngayon --
  // kapag "Today" ang view (walang explicit na pinili na past day),
  // ang mga Waiting/Washing (hindi pa tapos) na row ay LAGING kasama,
  // kahit anong petsa ang txn_date nito. Ito ang dahilan kung bakit
  // dating "nawawala" ang isang bagong reservation na naka-schedule sa
  // ibang araw (bukas o mas malayo pa) -- na-filter siya palabas ng
  // strict na "today == txn_date" check kahit buhay pa naman siya.
  // Pagpili ng specific na past day sa calendar ay bumabalik sa strict
  // date-match, dahil doon talaga naka-focus ang customer sa history
  // ng araw na 'yon.
  const filteredTransactions = transactions
    .filter((r) => {
      if (isViewingToday && isActiveStatus(r.status)) return true;
      return transactionDateKey(r) === effectiveDate;
    })
    .filter((r) => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Active') return r.status === STATUS_WAITING || r.status === STATUS_WASHING;
      if (activeFilter === 'Completed') return r.status === STATUS_COMPLETED;
      if (activeFilter === 'Cancelled') return isCancelledStatus(r.status);
      return true;
    });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Transaction History</Text>
          <Text style={styles.headerSubtitle}>Mga booking mo para sa napiling araw</Text>
        </View>
      </View>

      {/* FILTER TABS + CALENDAR BUTTON */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const isActive = activeFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{f}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Calendar date filter -- same pattern as staff/reservation.tsx.
            Defaults to Today; tapping lets the customer browse a past
            OR future day's transactions without it cluttering the
            default view. */}
        <TouchableOpacity style={styles.dateDropdownBtn} onPress={openDateDropdown}>
          <Ionicons name="calendar-outline" size={15} color={COLORS.black} />
          <Text style={styles.dateDropdownBtnText}>{formatDateLabel(effectiveDate)}</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={COLORS.blue} />
          </View>
        ) : filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
            <Text style={styles.emptyStateText}>
              {activeFilter === 'All'
                ? `No bookings on ${formatDateLabel(effectiveDate).toLowerCase()}.`
                : `No ${activeFilter.toLowerCase()} booking on ${formatDateLabel(effectiveDate).toLowerCase()}.`}
            </Text>
          </View>
        ) : (
          filteredTransactions.map((r) => {
            const statusStyle = getStatusStyle(r.status);
            const isHomeService = r.kind === 'home_service';
            const showQrButton = canShowQr(r);
            const showDisabledQrBox = showDisabledQr(r);

            return (
              <View key={`${r.kind}-${r.id}`} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.kindRow}>
                      <Ionicons
                        name={isHomeService ? 'home-outline' : 'storefront-outline'}
                        size={12}
                        color={COLORS.gray}
                      />
                      <Text style={styles.kindText}>
                        {isHomeService ? 'Home Service' : 'Shop Visit'}
                      </Text>
                    </View>
                    <Text style={styles.shopName}>{r.shop_name || 'Unknown Branch'}</Text>
                   
                    {r.kind === 'reservation' && r.scheduled_time ? (
                      <>
                        <Text style={styles.dateText}>
                          {formatDateLabel(r.scheduled_date ?? transactionDateKey(r) ?? effectiveDate)} · {r.scheduled_time}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.dateText}>
                        {formatDateLabel(transactionDateKey(r) ?? effectiveDate)} · {formatTime(r.created_at)}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Ionicons name={statusStyle.icon} size={13} color={statusStyle.color} />
                    <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>
                      {displayStatus(r.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>VEHICLE</Text>
                    <Text style={styles.detailValue}>{r.vehicle_type || '—'}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>SERVICE</Text>
                    <Text style={styles.detailValue}>
                      {r.service_type ? `${r.service_type} WASH` : '—'}
                    </Text>
                  </View>
                  <View style={[styles.detailItem, { alignItems: 'flex-end' }]}>
                    <Text style={styles.detailLabel}>PRICE</Text>
                    <Text style={styles.priceValue}>{formatPrice(r.price)}</Text>
                  </View>
                </View>

                {/* "GCash-style" payment detail block -- reference
                    number, paraan ng bayad, at eksaktong oras na
                    na-tanggap ang bayad. Ipinapakita lang kapag may
                    kahit isa man lang sa mga detalyeng ito. */}
                {(r.payment_reference || r.payment_method || r.paid_at) && (
                  <View style={styles.paymentBlock}>
                    {r.payment_reference && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Reference No.</Text>
                        <Text style={styles.paymentValue}>{r.payment_reference}</Text>
                      </View>
                    )}
                    {r.payment_method && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Payment Method</Text>
                        <Text style={styles.paymentValue}>{r.payment_method}</Text>
                      </View>
                    )}
                    {r.paid_at && (
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Paid On</Text>
                        <Text style={styles.paymentValue}>{formatDateTime(r.paid_at)}</Text>
                      </View>
                    )}
                  </View>
                )}

                {r.arrived_at && (
                  <View style={styles.timerRow}>
                    <Ionicons name="qr-code-outline" size={14} color="#64748B" />
                    <Text style={styles.timerText}>Checked in: {formatDateTime(r.arrived_at)}</Text>
                  </View>
                )}

                {r.completed_at && (
                  <View style={styles.timerRow}>
                    <Ionicons name="log-out-outline" size={14} color="#64748B" />
                    <Text style={styles.timerText}>Completed: {formatDateTime(r.completed_at)}</Text>
                  </View>
                )}

                {r.status === STATUS_COMPLETED && r.service_timer && r.service_timer !== '00:00:00' && (
                  <View style={styles.timerRow}>
                    <Ionicons name="stopwatch-outline" size={14} color="#64748B" />
                    <Text style={styles.timerText}>Service duration: {r.service_timer}</Text>
                  </View>
                )}

                {r.bay_name && (r.status === STATUS_WAITING || r.status === STATUS_WASHING) && (
                  <View style={styles.timerRow}>
                    <Ionicons name="pin-outline" size={14} color="#64748B" />
                    <Text style={styles.timerText}>{r.bay_name}</Text>
                  </View>
                )}

                {isHomeService && r.address && (
                  <View style={styles.timerRow}>
                    <Ionicons name="location-outline" size={14} color="#64748B" />
                    <Text style={styles.timerText}>{r.address}</Text>
                  </View>
                )}

                {showQrButton && (
                  <TouchableOpacity
                    style={styles.showQrBtn}
                    onPress={() => setQrModalRow(r)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="qr-code-outline" size={16} color={COLORS.blue} />
                    <Text style={styles.showQrBtnText}>Show QR Code</Text>
                  </TouchableOpacity>
                )}

                {showDisabledQrBox && (
                  <View style={styles.disabledQrBox}>
                    <Ionicons name="lock-closed-outline" size={16} color="#94A3B8" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.disabledQrTitle}>QR Code Unavailable</Text>
                      <Text style={styles.disabledQrSubtitle}>This booking has been cancelled</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* DATE FILTER: CALENDAR MODAL (same pattern as staff/reservation.tsx) */}
      <Modal
        visible={dateDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.calendarOverlay}
          activeOpacity={1}
          onPress={() => setDateDropdownVisible(false)}
        >
          <View style={styles.calendarCard} onStartShouldSetResponder={() => true}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => shiftCalendarMonth(-1)} style={styles.calendarNavBtn}>
                <Ionicons name="chevron-back" size={18} color={COLORS.black} />
              </TouchableOpacity>
              <Text style={styles.calendarHeaderText}>
                {calendarViewDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                onPress={() => shiftCalendarMonth(1)}
                style={styles.calendarNavBtn}
                disabled={isViewingCurrentOrFutureMonth}
              >
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={isViewingCurrentOrFutureMonth ? '#CBD5E1' : COLORS.black}
                />
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

      {/* QR CODE MODAL -- muling ipinapakita ang parehong QR na binuo sa
          checkout gamit ang parehong "ICW-RES:<token>" na format, para
          eksaktong ma-scan din ito ng confirm_reservation_arrival flow ng
          staff nang walang pagkakaiba sa orihinal na resibo. */}
      <Modal
        visible={!!qrModalRow}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalRow(null)}
      >
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalCard}>
            <Text style={styles.qrModalTitle}>Your Reservation QR</Text>
            <Text style={styles.qrModalSubtitle}>
              Show this to staff when you arrive to check in. If all bays are busy, you'll be
              assigned automatically to the next one that becomes available.
            </Text>

            {qrModalRow?.qr_token && (
              <View style={styles.qrWrap}>
                <QRCode value={`ICW-RES:${qrModalRow.qr_token}`} size={160} />
              </View>
            )}

            {qrModalRow && (
              <View style={styles.qrModalDetails}>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Shop</Text>
                  <Text style={styles.paymentValue}>{qrModalRow.shop_name || '—'}</Text>
                </View>
                {qrModalRow.scheduled_time && (
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentLabel}>Slot</Text>
                    <Text style={styles.paymentValue}>
                      {formatDateLabel(qrModalRow.scheduled_date ?? transactionDateKey(qrModalRow) ?? effectiveDate)}
                      {' · '}
                      {qrModalRow.scheduled_time}
                    </Text>
                  </View>
                )}
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Package</Text>
                  <Text style={styles.paymentValue}>{qrModalRow.service_type || '—'}</Text>
                </View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Vehicle</Text>
                  <Text style={styles.paymentValue}>{qrModalRow.vehicle_type || '—'}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.qrModalCloseBtn}
              onPress={() => setQrModalRow(null)}
              activeOpacity={0.85}
            >
              <Text style={styles.qrModalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: COLORS.black,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  filterScroll: { flexGrow: 0 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  filterChipActive: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  // ===== Calendar date filter button (matches staff/reservation.tsx) =====
  dateDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  dateDropdownBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.black },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,18,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
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
  calendarHeaderText: { fontSize: 14, fontWeight: '800', color: COLORS.black },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calendarWeekDayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray,
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
  calendarDayCellSelected: { backgroundColor: COLORS.blue },
  calendarDayCellToday: { borderWidth: 1.5, borderColor: COLORS.blue },
  calendarDayText: { fontSize: 13, fontWeight: '600', color: COLORS.black },
  calendarDayTextSelected: { color: '#fff', fontWeight: '800' },
  calendarDayTextDisabled: { color: '#CBD5E1' },
  calendarTodayBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  calendarTodayBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.black },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.grayLight,
    borderStyle: 'dashed',
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  kindText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  shopName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.black,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  bookedAtText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 3,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.blueDark,
    marginTop: 3,
  },
  paymentBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  paymentValue: {
    fontSize: 11.5,
    color: '#1E293B',
    fontWeight: '700',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  timerText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  showQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.blueTint,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  showQrBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.blueDark,
  },
  disabledQrBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  disabledQrTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  disabledQrSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 1,
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  qrModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
  },
  qrModalSubtitle: {
    fontSize: 12.5,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  qrWrap: {
    marginTop: 16,
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  qrModalDetails: {
    width: '100%',
    marginTop: 18,
    gap: 8,
  },
  qrModalCloseBtn: {
    backgroundColor: COLORS.black,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  qrModalCloseBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});