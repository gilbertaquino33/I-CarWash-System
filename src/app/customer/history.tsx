import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
const STATUS_VOIDED = 'Voided';

// NEW: preset na dahilan ng refund -- default na naka-select ang unang
// option ("Hindi na ako tutuloy" -> in English) tapos titignan/papalitan
// na lang ng customer kung iba talaga ang dahilan nila. May "Other" din
// na magpapalabas ng free-text box.
type RefundReasonKey = 'not_continuing' | 'booking_mistake' | 'took_too_long' | 'other';

const REFUND_REASON_OPTIONS: { key: RefundReasonKey; label: string }[] = [
  { key: 'not_continuing', label: "I'm no longer continuing with this booking" },
  { key: 'booking_mistake', label: 'I made a mistake when booking' },
  { key: 'took_too_long', label: "I couldn't make it on time / it took too long" },
  { key: 'other', label: 'Other (please specify)' },
];

// NEW: buong lifecycle ng refund_status -- dinagdag ang 'completed'
// (= "Refund Successful" sa staff side) para sa refund na TALAGANG
// naibigay/naipadala na sa customer, hiwalay sa 'approved' na
// nangangahulugang pumayag lang ang staff pero hindi pa na-release
// ang pera.
type RefundStatusValue = 'requested' | 'approved' | 'rejected' | 'completed';

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
  // NEW: payment/refund tracking -- "reservation" lang ang may laman
  // nito para sa ngayon (may payment_method flow na si checkout.tsx).
  // Kapag "home_service" din ang na-implement na payment flow sa
  // hinaharap, dito na lang din ito idadagdag.
  payment_status: 'paid' | 'unpaid' | null;
  refund_status: RefundStatusValue | null;
  refund_reason: string | null;
  price: number | null;
  txn_date: string | null; // reservation_date (reservation) o scheduled_date (home_service)
  service_timer: string | null;
  created_at: string;
  bay_name: string | null;
  address: string | null; // home_service lang ito magkakaroon ng laman
}

// Badge styling per status -- parehong semantic colors ng ibang screens sa
// app (blue = in progress, green = tapos na, red = cancelled/voided, gray = waiting).
const STATUS_STYLE: Record<string, { bg: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  [STATUS_WAITING]: { bg: '#F1F5F9', color: '#64748B', icon: 'time-outline' },
  [STATUS_WASHING]: { bg: COLORS.blueTint, color: COLORS.blueDark, icon: 'water-outline' },
  [STATUS_COMPLETED]: { bg: '#DCFCE7', color: '#16A34A', icon: 'checkmark-circle-outline' },
  [STATUS_CANCELLED]: { bg: '#FEE2E2', color: COLORS.danger, icon: 'close-circle-outline' },
  [STATUS_VOIDED]: { bg: '#FEE2E2', color: COLORS.danger, icon: 'close-circle-outline' },
};

function formatDate(dateStr: string | null, createdAt: string) {
  const source = dateStr ?? createdAt;
  if (!source) return '—';
  try {
    const d = new Date(source);
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return source;
  }
}

function formatTime(createdAt: string) {
  try {
    const d = new Date(createdAt);
    return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatPrice(price: number | null) {
  if (price == null) return '—';
  return `₱${price}`;
}

// ─────────────────────────────────────────
//  NEW: Refund request modal state -- pinagsama na natin dito ang
//  reason-selection AT ang confirmation (isang modal na lang, dahil
//  ang pagpili ng reason + pag-tap ng Submit ay sapat na bilang
//  confirmation mismo).
// ─────────────────────────────────────────
interface RefundModalState {
  visible: boolean;
  row: TransactionRow | null;
  selectedReason: RefundReasonKey | null;
  customReason: string;
}
const initialRefundModal: RefundModalState = {
  visible: false,
  row: null,
  // naka-default sa unang option -- customer na lang ang titignan/pipili
  // kung iba talaga ang dahilan.
  selectedReason: 'not_continuing',
  customReason: '',
};

// ─────────────────────────────────────────
//  NEW: Feedback modal state (success / error)
// ─────────────────────────────────────────
interface RefundFeedbackState {
  visible: boolean;
  type: 'success' | 'error';
  title: string;
  message: string;
}
const initialRefundFeedback: RefundFeedbackState = {
  visible: false,
  type: 'success',
  title: '',
  message: '',
};

// NEW: dinagdag ang "Refunded" filter -- para makita agad ng customer
// ang lahat ng transactions na TAPOS na ang buong refund process
// (refund_status === 'completed'), hiwalay sa "Cancelled" filter na
// pinagsasama-sama pa rin ang lahat ng Voided/Cancelled kahit ano pa
// ang refund status nito.
type FilterKey = 'All' | 'Active' | 'Completed' | 'Cancelled' | 'Refunded';
const FILTERS: FilterKey[] = ['All', 'Active', 'Completed', 'Cancelled', 'Refunded'];

export default function CustomerHistoryScreen() {
  const router = useRouter();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All');

  // NEW: refund request flow states
  const [refundModal, setRefundModal] = useState<RefundModalState>(initialRefundModal);
  const [refundFeedback, setRefundFeedback] = useState<RefundFeedbackState>(initialRefundFeedback);
  const [submittingRefundId, setSubmittingRefundId] = useState<number | null>(null);

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
      //
      // NEW: dinagdag ang payment_status, refund_status, at refund_reason
      // sa "reservation" select -- kailangan natin ito para malaman kung
      // pwede nang mag-request ng refund (paid + Voided), kung meron nang
      // existing na refund request, at kung ano ang dahilan na ibinigay.
      const [reservationRes, homeServiceRes] = await Promise.all([
        supabase
          .from('reservation')
          .select(
            'id, shop_name, vehicle_type, service_type, status, price, reservation_date, service_timer, created_at, bay_name, payment_status, refund_status, refund_reason'
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
        payment_status: r.payment_status ?? null,
        refund_status: r.refund_status ?? null,
        refund_reason: r.refund_reason ?? null,
        price: r.price,
        txn_date: r.reservation_date,
        service_timer: r.service_timer,
        created_at: r.created_at,
        bay_name: r.bay_name,
        address: null,
      }));

      const homeServices: TransactionRow[] = (homeServiceRes.data ?? []).map((h: any) => ({
        id: h.id,
        kind: 'home_service' as const,
        shop_name: h.shop_name,
        vehicle_type: h.vehicle_type,
        service_type: h.service_type,
        status: h.status,
        payment_status: null,
        refund_status: null,
        refund_reason: null,
        price: h.price,
        txn_date: h.scheduled_date,
        service_timer: null,
        created_at: h.created_at,
        bay_name: null,
        address: h.address,
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
    // (hal. Waiting -> Washing -> Completed, o refund_status) samantalang
    // nakabukas ang History screen, awtomatikong mag-re-refresh nang
    // hindi na kailangan pull-to-refresh ang customer.
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

  // ─────────────────────────────────────────
  //  NEW: Refund request flow
  //  Step 1: customer taps "Request Refund" -> opens reason-picker modal
  //          (may naka-default nang napiling reason)
  //  Step 2: customer pumipili ng reason (o nagta-type kung "Other"),
  //          tapos tina-tap ang "Submit Refund Request"
  //  Step 3: i-uupdate ang refund_status = 'requested' + refund_reason
  //  Step 4: ipapakita ang success/error feedback modal
  // ─────────────────────────────────────────
  const openRefundModal = (row: TransactionRow) => {
    setRefundModal({ ...initialRefundModal, visible: true, row });
  };

  const closeRefundModal = () => setRefundModal(initialRefundModal);
  const closeRefundFeedback = () => setRefundFeedback((f) => ({ ...f, visible: false }));

  const canSubmitRefund =
    refundModal.selectedReason === 'other'
      ? refundModal.customReason.trim().length > 0
      : !!refundModal.selectedReason;

  const submitRefundRequest = async () => {
    const row = refundModal.row;
    if (!row || !canSubmitRefund) return;

    const chosenOption = REFUND_REASON_OPTIONS.find((o) => o.key === refundModal.selectedReason);
    const finalReason =
      refundModal.selectedReason === 'other'
        ? refundModal.customReason.trim()
        : chosenOption?.label ?? 'No reason provided';

    setSubmittingRefundId(row.id);
    closeRefundModal();

    const { error } = await supabase
      .from('reservation')
      .update({ refund_status: 'requested', refund_reason: finalReason })
      .eq('id', row.id);

    setSubmittingRefundId(null);

    if (error) {
      setRefundFeedback({
        visible: true,
        type: 'error',
        title: 'Refund Request Failed',
        message: error.message ?? 'Something went wrong while submitting your refund request.',
      });
      return;
    }

    // Optimistic update sa local state para agad makita ng customer ang
    // "Refund Requested" na status kahit hindi pa dumadaan sa realtime channel.
    setTransactions((prev) =>
      prev.map((t) =>
        t.kind === 'reservation' && t.id === row.id
          ? { ...t, refund_status: 'requested', refund_reason: finalReason }
          : t
      )
    );

    setRefundFeedback({
      visible: true,
      type: 'success',
      title: 'Refund Requested',
      message: 'Your refund request has been sent. Our staff will review and process it shortly.',
    });
  };

  const filteredTransactions = transactions.filter((r) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Active') return r.status === STATUS_WAITING || r.status === STATUS_WASHING;
    if (activeFilter === 'Completed') return r.status === STATUS_COMPLETED;
    if (activeFilter === 'Cancelled') return r.status === STATUS_CANCELLED || r.status === STATUS_VOIDED;
    // NEW: "Refunded" -- tanging mga transaction na TAPOS na ang buong
    // refund process (refund_status === 'completed') ang lalabas dito.
    if (activeFilter === 'Refunded') return r.kind === 'reservation' && r.refund_status === 'completed';
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
          <Text style={styles.headerSubtitle}>Lahat ng past & active bookings mo</Text>
        </View>
      </View>

      {/* FILTER TABS -- NEW: horizontal scroll na dahil limang chip na
          ngayon (dinagdag ang "Refunded"), para hindi masikip sa maliliit
          na screen. */}
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
                ? 'Wala ka pang booking history.'
                : `Walang ${activeFilter.toLowerCase()} na booking.`}
            </Text>
          </View>
        ) : (
          filteredTransactions.map((r) => {
            const statusStyle = STATUS_STYLE[r.status] ?? STATUS_STYLE[STATUS_WAITING];
            const isHomeService = r.kind === 'home_service';

            // FIX: dating "isRefundEligible" ay naka-condition sa
            // payment_status === 'paid' lang, pero pag na-APPROVE na ng
            // staff ang refund, awtomatiko itong binabago sa 'unpaid'
            // (see staff screen: handleResolveRefund). Kaya nawawala ang
            // buong refund section -- kasama na ang "Refund approved"
            // status -- sa sandaling ma-approve ito. Ngayon, hinihiwalay
            // na natin ang dalawang bagay:
            //   1) canRequestRefund -- pwede pang mag-request (wala pang
            //      refund_status) at PAID pa rin (GCash).
            //   2) hasRefundRecord -- meron nang refund_status
            //      (requested / approved / rejected / completed) kahit
            //      ano na ang kasalukuyang payment_status -- para laging
            //      makita ng customer ang status ng refund request nila,
            //      kahit matapos pa itong ma-resolve ng staff.
            const isVoidedReservation = r.kind === 'reservation' && r.status === STATUS_VOIDED;
            const canRequestRefund =
              isVoidedReservation && r.payment_status === 'paid' && !r.refund_status;
            const hasRefundRecord = isVoidedReservation && !!r.refund_status;
            const showRefundSection = canRequestRefund || hasRefundRecord;

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
                    <Text style={styles.dateText}>
                      {formatDate(r.txn_date, r.created_at)} · {formatTime(r.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Ionicons name={statusStyle.icon} size={13} color={statusStyle.color} />
                    <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{r.status}</Text>
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

                {/* NEW/FIX: Refund section -- lalabas kapag: (a) may
                    bagong pwedeng i-request na refund (Voided + Paid,
                    wala pang refund_status), o (b) may existing na
                    refund record na (requested/approved/rejected/
                    completed), kahit na "unpaid" na ang payment_status
                    dahil na-refund na. Kaya laging makikita ng customer
                    ang Voided na transaction nila kasabay ng refund
                    status nito, kahit pa tapos na (completed). */}
                {showRefundSection && (
                  <View style={styles.refundSection}>
                    {r.refund_status === 'requested' ? (
                      <>
                        <View style={styles.refundStatusRow}>
                          <Ionicons name="hourglass-outline" size={14} color={COLORS.warning} />
                          <Text style={[styles.refundStatusText, { color: '#B45309' }]}>
                            Refund requested — pending staff review
                          </Text>
                        </View>
                        {r.refund_reason ? (
                          <Text style={styles.refundReasonText}>Reason: {r.refund_reason}</Text>
                        ) : null}
                      </>
                    ) : r.refund_status === 'approved' ? (
                      <>
                        <View style={styles.refundStatusRow}>
                          <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
                          <Text style={[styles.refundStatusText, { color: '#16A34A' }]}>
                            Refund approved
                          </Text>
                        </View>
                        {r.refund_reason ? (
                          <Text style={styles.refundReasonText}>Reason: {r.refund_reason}</Text>
                        ) : null}
                        {/* NEW: note para malaman ng customer kung gaano
                            katagal bago nila matanggap ang refund. */}
                        <Text style={styles.refundNoteText}>
                          Wait 30 mins - 1 hr to receive your refund.
                        </Text>
                      </>
                    ) : r.refund_status === 'completed' ? (
                      <>
                        {/* NEW: "completed" -- kumpirmado na ng staff na
                            naibigay/naipadala na TALAGA ang refund. */}
                        <View style={styles.refundStatusRow}>
                          <Ionicons name="checkmark-done-circle-outline" size={14} color={COLORS.blueDark} />
                          <Text style={[styles.refundStatusText, { color: COLORS.blueDark }]}>
                            Refund successful
                          </Text>
                        </View>
                        {r.refund_reason ? (
                          <Text style={styles.refundReasonText}>Reason: {r.refund_reason}</Text>
                        ) : null}
                        <Text style={styles.refundNoteText}>
                          Your refund has already been sent. Thank you for your patience!
                        </Text>
                      </>
                    ) : r.refund_status === 'rejected' ? (
                      <>
                        <View style={styles.refundStatusRow}>
                          <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
                          <Text style={[styles.refundStatusText, { color: COLORS.danger }]}>
                            Refund request was declined
                          </Text>
                        </View>
                        {r.refund_reason ? (
                          <Text style={styles.refundReasonText}>Reason: {r.refund_reason}</Text>
                        ) : null}
                      </>
                    ) : canRequestRefund ? (
                      <TouchableOpacity
                        style={styles.refundBtn}
                        onPress={() => openRefundModal(r)}
                        disabled={submittingRefundId === r.id}
                        activeOpacity={0.8}
                      >
                        {submittingRefundId === r.id ? (
                          <ActivityIndicator size="small" color={COLORS.blueDark} />
                        ) : (
                          <>
                            <Ionicons name="cash-outline" size={14} color={COLORS.blueDark} />
                            <Text style={styles.refundBtnText}>Request Refund</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* NEW: REFUND REASON + CONFIRM MODAL */}
      <Modal
        visible={refundModal.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeRefundModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reasonModalCard}>
            <View style={[styles.modalIconWrap, { backgroundColor: COLORS.blue }]}>
              <Ionicons name="cash-outline" size={26} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Request a Refund</Text>
            <Text style={styles.modalMessage}>
              {refundModal.row
                ? `${refundModal.row.vehicle_type} (${refundModal.row.service_type ?? 'service'}) — ${formatPrice(
                    refundModal.row.price
                  )}`
                : ''}
            </Text>

            <Text style={styles.reasonSectionLabel}>Why are you requesting a refund?</Text>

            <View style={{ width: '100%' }}>
              {REFUND_REASON_OPTIONS.map((option) => {
                const isSelected = refundModal.selectedReason === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.reasonRow, isSelected && styles.reasonRowActive]}
                    onPress={() => setRefundModal((m) => ({ ...m, selectedReason: option.key }))}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <Text style={[styles.reasonLabel, isSelected && styles.reasonLabelActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {refundModal.selectedReason === 'other' && (
              <TextInput
                style={styles.otherInput}
                placeholder="Please tell us the reason..."
                placeholderTextColor="#94A3B8"
                value={refundModal.customReason}
                onChangeText={(text) => setRefundModal((m) => ({ ...m, customReason: text }))}
                multiline
                numberOfLines={3}
              />
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={closeRefundModal}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: canSubmitRefund ? COLORS.blue : COLORS.grayLight },
                ]}
                onPress={submitRefundRequest}
                disabled={!canSubmitRefund}
              >
                <Text style={[styles.modalBtnText, !canSubmitRefund && { color: '#94A3B8' }]}>
                  Submit Request
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* NEW: FEEDBACK MODAL -- resulta ng refund request (success/error) */}
      <Modal
        visible={refundFeedback.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeRefundFeedback}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View
              style={[
                styles.modalIconWrap,
                { backgroundColor: refundFeedback.type === 'success' ? COLORS.success : COLORS.danger },
              ]}
            >
              <Ionicons name={refundFeedback.type === 'success' ? 'checkmark' : 'close'} size={26} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{refundFeedback.title}</Text>
            <Text style={styles.modalMessage}>{refundFeedback.message}</Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: COLORS.black, width: '100%' }]}
              onPress={closeRefundFeedback}
            >
              <Text style={styles.modalBtnText}>OK</Text>
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
  // NEW: horizontal scroll wrapper para sa filter chips
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

  // ===== NEW: Refund section (inside each card) =====
  refundSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  refundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.blueTint,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  refundBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.blueDark,
  },
  refundStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refundStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  refundReasonText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 4,
    marginLeft: 20,
    lineHeight: 16,
  },
  // NEW: note text sa ilalim ng "Refund approved" / "Refund successful"
  // status (hal. gaano katagal bago matanggap, o kumpirmasyon na naipadala na).
  refundNoteText: {
    fontSize: 11.5,
    color: COLORS.blueDark,
    fontWeight: '700',
    marginTop: 6,
    marginLeft: 20,
    lineHeight: 16,
  },

  // ===== NEW: Shared modal styles (confirm + feedback) =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,18,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  // NEW: mas malaki/mas mataas na card para sa reason-picker modal
  reasonModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 20,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnGhost: {
    backgroundColor: '#F1F5F9',
  },
  modalBtnGhostText: {
    color: COLORS.gray,
    fontWeight: '700',
    fontSize: 13,
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },

  // ===== NEW: Reason picker (inside refund modal) =====
  reasonSectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 11.5,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  reasonRowActive: {
    borderColor: COLORS.blue,
    backgroundColor: COLORS.blueTint,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: COLORS.blue,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: COLORS.blue,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 17,
  },
  reasonLabelActive: {
    color: COLORS.blueDark,
    fontWeight: '700',
  },
  otherInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12.5,
    color: COLORS.black,
    textAlignVertical: 'top',
    minHeight: 70,
    marginTop: 2,
  },
});