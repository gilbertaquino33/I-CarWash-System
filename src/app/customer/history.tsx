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
const STATUS_VOIDED = 'Voided';

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
  // NEW: paraan ng bayad ("GCash" / "Cash on Hand") at ang reference
  // number na ginawa noong checkout -- pareho itong reservation-only
  // (home_service rows ay wala pang parehong flow).
  payment_method: string | null;
  payment_reference: string | null;
  // NEW: reservation-only -- kailangan ito para maipakita ulit ang QR
  // code sa History, sakaling na-late o nawala ang screenshot ng
  // customer noong una itong lumabas sa checkout receipt.
  qr_token: string | null;
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

type FilterKey = 'All' | 'Active' | 'Completed' | 'Cancelled';
const FILTERS: FilterKey[] = ['All', 'Active', 'Completed', 'Cancelled'];

export default function CustomerHistoryScreen() {
  const router = useRouter();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All');

  // NEW: which reservation's QR is currently being shown in the modal.
  const [qrModalRow, setQrModalRow] = useState<TransactionRow | null>(null);

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
      // NEW: idinagdag ang payment_method, payment_reference, at
      // qr_token sa SELECT -- kailangan ito para maipakita ang buong
      // detalye ng pagbayad (parang resibo ng GCash) at para ma-view
      // ulit ang QR code dito sa History kung kinakailangan.
      const [reservationRes, homeServiceRes] = await Promise.all([
        supabase
          .from('reservation')
          .select(
            'id, shop_name, vehicle_type, service_type, status, price, reservation_date, service_timer, created_at, bay_name, arrived_at, completed_at, paid_at, payment_method, payment_reference, qr_token'
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

  // NEW: kailan dapat lumabas ang "Show QR" button -- reservation lang
  // (hindi home_service), may qr_token, at HINDI pa siya na-che-check-in
  // (arrived_at is null) at hindi pa Cancelled/Voided. Once na-scan na ng
  // staff (may arrived_at na) o na-void/cancel na, wala nang silbi ang
  // QR kaya itinatago na lang ito -- ang QR ay para lang sa "check-in ako
  // pagdating ko", hindi isang palagiang resibo.
  const canShowQr = (r: TransactionRow) =>
    r.kind === 'reservation' &&
    !!r.qr_token &&
    !r.arrived_at &&
    r.status !== STATUS_CANCELLED &&
    r.status !== STATUS_VOIDED;

  const filteredTransactions = transactions.filter((r) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Active') return r.status === STATUS_WAITING || r.status === STATUS_WASHING;
    if (activeFilter === 'Completed') return r.status === STATUS_COMPLETED;
    if (activeFilter === 'Cancelled') return r.status === STATUS_CANCELLED || r.status === STATUS_VOIDED;
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

      {/* FILTER TABS */}
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
            const showQrButton = canShowQr(r);

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

                {/* NEW: "GCash-style" payment detail block -- reference
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

                {/* NEW: "Show QR" -- pinapayagan tingnan ulit ang QR code
                    ng isang reservation na hindi pa naka-check-in.
                    Kapaki-pakinabang ito kung na-late ang customer o
                    nawala ang screenshot niya -- puwede pa rin niyang
                    ipa-scan ito sa staff kapag dumating na siya, at
                    isasa-assign lang siya sa unang available na bay
                    (parehong logic ng confirm_reservation_arrival RPC --
                    walang espesyal na bay na naka-reserve para sa kanya
                    hangga't hindi pa siya nag-a-arrive). */}
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
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

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
  // NEW: GCash-receipt-style payment detail block.
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
  // NEW: "Show QR Code" button on eligible reservation cards.
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
  // NEW: QR modal, reopened from History.
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