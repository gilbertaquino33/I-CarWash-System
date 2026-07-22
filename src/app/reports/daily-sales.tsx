import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

interface WalkinRow {
  id: number;
  reservation_id: number;
  vehicle_type: string | null;
  service_type: string | null;
  bay_name: string | null;
  price: number | null;
  service_timer: string | null;
  reservation_date: string | null;
  completed_at: string;
}

interface HomeServiceRow {
  id: number;
  customer_name: string;
  vehicle_type: string;
  service_type: string;
  status: string;
  price: number | null;
  scheduled_time: string;
}

type Txn = {
  key: string;
  source: 'Walk-in' | 'Home Service';
  title: string;
  subtitle: string;
  status: string;
  price: number;
};

const money = (v: number) =>
  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

export default function DailySalesReport() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [walkins, setWalkins] = useState<WalkinRow[]>([]);
  const [homeServices, setHomeServices] = useState<HomeServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateStr = toDateStr(selectedDate);
  const isToday = dateStr === toDateStr(new Date());

  const fetchData = useCallback(async () => {
    const { data: shop } = await supabase
      .from('shop_profile_setup')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentShopId = shop?.id ?? null;

    if (!currentShopId) {
      setWalkins([]);
      setHomeServices([]);
      return;
    }

    const [walkinRes, homeRes] = await Promise.all([
      supabase
        .from('walkin_transactions')
        .select('id, reservation_id, vehicle_type, service_type, bay_name, price, service_timer, reservation_date, completed_at')
        .eq('shop_id', currentShopId)
        .eq('reservation_date', dateStr)
        .order('completed_at', { ascending: false }),
      supabase
        .from('home_service')
        .select('id, customer_name, vehicle_type, service_type, status, price, scheduled_time')
        .eq('shop_id', currentShopId)
        .eq('scheduled_date', dateStr)
        .order('scheduled_time', { ascending: false }),
    ]);

    setWalkins((walkinRes.data as WalkinRow[]) ?? []);
    setHomeServices((homeRes.data as HomeServiceRow[]) ?? []);
  }, [dateStr]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const changeDay = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    setSelectedDate(next);
  };

  const transactions: Txn[] = [
    ...walkins.map((w) => ({
      key: `w-${w.id}`,
      source: 'Walk-in' as const,
      title: w.vehicle_type ?? 'Vehicle',
      subtitle: `${w.service_type ?? 'Service'} • ${w.bay_name ?? 'No bay'}`,
      status: 'Completed',
      price: w.price ?? 0,
    })),
    ...homeServices.map((h) => ({
      key: `h-${h.id}`,
      source: 'Home Service' as const,
      title: `${h.customer_name} • ${h.vehicle_type}`,
      subtitle: `${h.service_type} • ${h.scheduled_time}`,
      status: h.status,
      price: h.price ?? 0,
    })),
  ];

  const completedTxns = transactions.filter((t) => t.status === 'Completed');
  const totalEarnings = completedTxns.reduce((sum, t) => sum + t.price, 0);
  const walkinEarnings = walkins.reduce((sum, w) => sum + (w.price ?? 0), 0);
  const homeEarnings = homeServices
    .filter((h) => h.status === 'Completed')
    .reduce((sum, h) => sum + (h.price ?? 0), 0);

  const statusColor = (status: string) =>
    status === 'Completed'
      ? { bg: '#DCFCE7', text: '#16A34A' }
      : status === 'Washing'
      ? { bg: '#DBEAFE', text: '#2563EB' }
      : { bg: '#FEF3C7', text: '#D97706' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Sales Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDay(-1)}>
          <Ionicons name="chevron-back" size={18} color="#111827" />
        </TouchableOpacity>
        <View style={styles.dateNavCenter}>
          <Text style={styles.dateNavText}>
            {selectedDate.toLocaleDateString('en-PH', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
          {!isToday && (
            <TouchableOpacity onPress={() => setSelectedDate(new Date())}>
              <Text style={styles.todayLink}>Jump to Today</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDay(1)} disabled={isToday}>
          <Ionicons name="chevron-forward" size={18} color={isToday ? '#CBD5E1' : '#111827'} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FACC15" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Earnings (Completed)</Text>
            <Text style={styles.summaryAmount}>{money(totalEarnings)}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Walk-in</Text>
                <Text style={styles.summaryPillValue}>{money(walkinEarnings)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Home Service</Text>
                <Text style={styles.summaryPillValue}>{money(homeEarnings)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{transactions.length}</Text>
              <Text style={styles.statLabel}>Total Transactions</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{completedTxns.length}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Transactions</Text>
          {transactions.length === 0 ? (
            <Text style={styles.emptyText}>No transactions recorded for this date.</Text>
          ) : (
            transactions.map((t) => {
              const sc = statusColor(t.status);
              return (
                <View key={t.key} style={styles.txnCard}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.txnSourceRow}>
                      <View
                        style={[
                          styles.sourceTag,
                          { backgroundColor: t.source === 'Walk-in' ? '#EFF6FF' : '#F5F3FF' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sourceTagText,
                            { color: t.source === 'Walk-in' ? '#2563EB' : '#7C3AED' },
                          ]}
                        >
                          {t.source}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.txnTitle}>{t.title}</Text>
                    <Text style={styles.txnSubtitle}>{t.subtitle}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.txnPrice}>{money(t.price)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: sc.text }]}>{t.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#0F172A',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  headerSpacer: { width: 40 },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavCenter: { alignItems: 'center', flex: 1 },
  dateNavText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  todayLink: { fontSize: 11, color: '#2563EB', fontWeight: '700', marginTop: 2 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  summaryCard: { backgroundColor: '#111827', borderRadius: 18, padding: 20, marginBottom: 14 },
  summaryLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryAmount: { color: '#FACC15', fontSize: 30, fontWeight: '800', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryPill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 },
  summaryPillLabel: { color: '#CBD5E1', fontSize: 11, fontWeight: '600' },
  summaryPillValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 20 },
  txnCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  txnSourceRow: { flexDirection: 'row', marginBottom: 6 },
  sourceTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  sourceTagText: { fontSize: 10, fontWeight: '800' },
  txnTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  txnSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  txnPrice: { fontSize: 15, fontWeight: '800', color: '#111827' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
});