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
  vehicle_type: string;
  service_type: string | null;
  status: string;
  price: number | null;
  bay_name: string | null;
  reservation_date: string;
  created_at: string;
}

const money = (v: number) =>
  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FilterKey = '7d' | '30d' | 'all';

export default function WalkinEarningsReport() {
  const [rows, setRows] = useState<WalkinRow[]>([]);
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
      .from('reservation')
      .select('id, vehicle_type, service_type, status, price, bay_name, reservation_date, created_at')
      .eq('shop_id', shopId)
      .eq('status', 'Completed')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      const days = filter === '7d' ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      query = query.gte('reservation_date', cutoff.toISOString().split('T')[0]);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching walk-in earnings:', error);
      return;
    }
    setRows((data as WalkinRow[]) ?? []);
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

  const byService: Record<string, { count: number; total: number }> = {};
  rows.forEach((r) => {
    const key = r.service_type ?? 'Other';
    if (!byService[key]) byService[key] = { count: 0, total: 0 };
    byService[key].count += 1;
    byService[key].total += r.price ?? 0;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Walk-in Earnings</Text>
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
            <Text style={styles.summaryLabel}>Total Walk-in Earnings</Text>
            <Text style={styles.summaryAmount}>{money(total)}</Text>
            <Text style={styles.summarySub}>{rows.length} completed wash{rows.length === 1 ? '' : 'es'}</Text>
          </View>

          {Object.keys(byService).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>By Service Type</Text>
              <View style={styles.breakdownCard}>
                {Object.entries(byService)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([name, v]) => (
                    <View key={name} style={styles.breakdownRow}>
                      <Text style={styles.breakdownName}>{name}</Text>
                      <Text style={styles.breakdownCount}>{v.count}x</Text>
                      <Text style={styles.breakdownTotal}>{money(v.total)}</Text>
                    </View>
                  ))}
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>Transactions</Text>
          {rows.length === 0 ? (
            <Text style={styles.emptyText}>No completed walk-in transactions in this range.</Text>
          ) : (
            rows.map((r) => (
              <View key={r.id} style={styles.txnCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnTitle}>{r.vehicle_type}</Text>
                  <Text style={styles.txnSubtitle}>
                    {r.service_type ?? 'Service'} • {r.bay_name ?? 'No bay'}
                  </Text>
                  <Text style={styles.txnDate}>{new Date(r.reservation_date).toLocaleDateString('en-PH')}</Text>
                </View>
                <Text style={styles.txnPrice}>{money(r.price ?? 0)}</Text>
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
  summaryCard: { backgroundColor: '#1E3A5F', borderRadius: 18, padding: 20, marginBottom: 20 },
  summaryLabel: { color: '#BFDBFE', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryAmount: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  summarySub: { color: '#93C5FD', fontSize: 12, marginTop: 6, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 20 },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 20,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  breakdownName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' },
  breakdownCount: { fontSize: 12, color: '#64748B', marginRight: 12 },
  breakdownTotal: { fontSize: 13, fontWeight: '800', color: '#111827' },
  txnCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txnTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  txnSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  txnDate: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  txnPrice: { fontSize: 15, fontWeight: '800', color: '#111827' },
});