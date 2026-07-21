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

interface HomeServiceRow {
  id: number;
  customer_name: string;
  contact_number: string;
  address: string;
  vehicle_type: string;
  service_type: string;
  status: string;
  price: number | null;
  scheduled_date: string;
  scheduled_time: string;
  payment_status: string | null;
  payment_method: string | null;
}

const money = (v: number) =>
  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FilterKey = '7d' | '30d' | 'all';

export default function HomeServiceEarningsReport() {
  const [rows, setRows] = useState<HomeServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('30d');

  const fetchData = useCallback(async () => {
    const { data: shop } = await supabase
      .from('shop_profile_setup')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const shopId = shop?.id ?? null;
    if (!shopId) {
      setRows([]);
      return;
    }

    let query = supabase
      .from('home_service')
      .select(
        'id, customer_name, contact_number, address, vehicle_type, service_type, status, price, scheduled_date, scheduled_time, payment_status, payment_method'
      )
      .eq('shop_id', shopId)
      .eq('status', 'Completed')
      .order('scheduled_date', { ascending: false });

    if (filter !== 'all') {
      const days = filter === '7d' ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      query = query.gte('scheduled_date', cutoff.toISOString().split('T')[0]);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching home service earnings:', error);
      return;
    }
    setRows((data as HomeServiceRow[]) ?? []);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const total = rows.reduce((sum, r) => sum + (r.price ?? 0), 0);
  const paidTotal = rows
    .filter((r) => r.payment_status === 'Paid')
    .reduce((sum, r) => sum + (r.price ?? 0), 0);
  const unpaidTotal = total - paidTotal;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Home Service Earnings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.filterRow}>
        {(['7d', '30d', 'all'] as FilterKey[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === '7d' ? 'Last 7 Days' : f === '30d' ? 'Last 30 Days' : 'All Time'}
            </Text>
          </TouchableOpacity>
        ))}
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
            <Text style={styles.summaryLabel}>Total Home Service Earnings</Text>
            <Text style={styles.summaryAmount}>{money(total)}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Paid</Text>
                <Text style={styles.summaryPillValue}>{money(paidTotal)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Unpaid</Text>
                <Text style={styles.summaryPillValue}>{money(unpaidTotal)}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Transactions</Text>
          {rows.length === 0 ? (
            <Text style={styles.emptyText}>No completed home service jobs in this range.</Text>
          ) : (
            rows.map((r) => (
              <View key={r.id} style={styles.txnCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnTitle}>{r.customer_name}</Text>
                  <Text style={styles.txnSubtitle}>{r.vehicle_type} • {r.service_type}</Text>
                  <Text style={styles.txnAddress} numberOfLines={1}>{r.address}</Text>
                  <Text style={styles.txnDate}>
                    {new Date(r.scheduled_date).toLocaleDateString('en-PH')} • {r.scheduled_time}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.txnPrice}>{money(r.price ?? 0)}</Text>
                  <View
                    style={[
                      styles.payBadge,
                      { backgroundColor: r.payment_status === 'Paid' ? '#DCFCE7' : '#FEE2E2' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.payBadgeText,
                        { color: r.payment_status === 'Paid' ? '#16A34A' : '#DC2626' },
                      ]}
                    >
                      {r.payment_status ?? 'Unpaid'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
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
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 16 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: { backgroundColor: '#FACC15', borderColor: '#FACC15' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterChipTextActive: { color: '#0F172A' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  summaryCard: { backgroundColor: '#3B1F6A', borderRadius: 18, padding: 20, marginBottom: 20 },
  summaryLabel: { color: '#DDD6FE', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryAmount: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryPill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10 },
  summaryPillLabel: { color: '#E9D5FF', fontSize: 11, fontWeight: '600' },
  summaryPillValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
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
  txnTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  txnSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  txnAddress: { fontSize: 11, color: '#94A3B8', marginTop: 3, maxWidth: 200 },
  txnDate: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  txnPrice: { fontSize: 15, fontWeight: '800', color: '#111827' },
  payBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  payBadgeText: { fontSize: 10, fontWeight: '700' },
});