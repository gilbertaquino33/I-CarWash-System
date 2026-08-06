import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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

export default function CustomerHistoryScreen() {
  const router = useRouter();

  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Active' | 'Completed' | 'Cancelled'>('All');

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
            'id, shop_name, vehicle_type, service_type, status, price, reservation_date, service_timer, created_at, bay_name'
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
    //
    // Sinusunod ang parehong "remove stale channel before resubscribing"
    // guard na ginamit sa Dashboard, dahil hindi nag-uunmount ang mga
    // screen sa Expo Router stack navigation kapag `push()` -- posibleng
    // may naiwang lumang channel na naka-subscribe na sa parehong topic.
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

  const filteredTransactions = transactions.filter((r) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Active') return r.status === STATUS_WAITING || r.status === STATUS_WASHING;
    if (activeFilter === 'Completed') return r.status === STATUS_COMPLETED;
    if (activeFilter === 'Cancelled') return r.status === STATUS_CANCELLED || r.status === STATUS_VOIDED;
    return true;
  });

  const filters: Array<'All' | 'Active' | 'Completed' | 'Cancelled'> = ['All', 'Active', 'Completed', 'Cancelled'];

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
      <View style={styles.filterRow}>
        {filters.map((f) => {
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
      </View>

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
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
});