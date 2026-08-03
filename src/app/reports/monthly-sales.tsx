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

const money = (v: number) =>
  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface DayBucket {
  day: number;
  earnings: number;
  count: number;
}

export default function MonthlySalesReport() {
  const [refDate, setRefDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buckets, setBuckets] = useState<DayBucket[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [txnCount, setTxnCount] = useState(0);

  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = refDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const isCurrentMonth =
    year === new Date().getFullYear() && month === new Date().getMonth();

  const fetchData = useCallback(async () => {
    const { data: shop } = await supabase
      .from('shop_profile_setup')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const shopId = shop?.id ?? null;

    const dayBuckets: DayBucket[] = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      earnings: 0,
      count: 0,
    }));

    if (!shopId) {
      setBuckets(dayBuckets);
      setGrandTotal(0);
      setTxnCount(0);
      return;
    }

    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // 3 SOURCES ng Monthly Sales:
    //   1. reservation (source='app', status='Completed') -- mga nagpa-reserve
    //      gamit ang customer app (hindi pa laman ng walkin_transactions dahil
    //      hindi ito walk-in booking, kundi app reservation).
    //   2. walkin_transactions -- lahat ng walk-in (auto-synced na mula sa
    //      reservation table via trg_sync_walkin_transaction trigger).
    //   3. home_service (status='Completed') -- home service bookings.
    const [appRes, walkinRes, homeRes] = await Promise.all([
      supabase
        .from('reservation')
        .select('reservation_date, price, status, source')
        .eq('shop_id', shopId)
        .eq('status', 'Completed')
        .eq('source', 'app')
        .gte('reservation_date', startStr)
        .lte('reservation_date', endStr),
      supabase
        .from('walkin_transactions')
        .select('reservation_date, price')
        .eq('shop_id', shopId)
        .gte('reservation_date', startStr)
        .lte('reservation_date', endStr),
      supabase
        .from('home_service')
        .select('scheduled_date, price, status')
        .eq('shop_id', shopId)
        .eq('status', 'Completed')
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr),
    ]);

    let total = 0;
    let count = 0;

    const addRow = (dateStr: string, price: number | null) => {
      const d = new Date(dateStr).getDate();
      const idx = d - 1;
      if (dayBuckets[idx]) {
        dayBuckets[idx].earnings += price ?? 0;
        dayBuckets[idx].count += 1;
      }
      total += price ?? 0;
      count += 1;
    };

    (appRes.data ?? []).forEach((row: any) => addRow(row.reservation_date, row.price));
    (walkinRes.data ?? []).forEach((row: any) => addRow(row.reservation_date, row.price));
    (homeRes.data ?? []).forEach((row: any) => addRow(row.scheduled_date, row.price));

    setBuckets(dayBuckets);
    setGrandTotal(total);
    setTxnCount(count);
  }, [year, month, daysInMonth]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const changeMonth = (offset: number) => {
    const next = new Date(refDate);
    next.setMonth(next.getMonth() + offset, 1);
    setRefDate(next);
  };

  const maxDayEarning = Math.max(1, ...buckets.map((b) => b.earnings));
  const activeDays = buckets.filter((b) => b.earnings > 0);
  const avgPerActiveDay = activeDays.length ? grandTotal / activeDays.length : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Monthly Sales Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={18} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.dateNavText}>{monthLabel}</Text>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeMonth(1)} disabled={isCurrentMonth}>
          <Ionicons name="chevron-forward" size={18} color={isCurrentMonth ? '#CBD5E1' : '#111827'} />
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
            <Text style={styles.summaryLabel}>Total Earnings This Month</Text>
            <Text style={styles.summaryAmount}>{money(grandTotal)}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{txnCount}</Text>
              <Text style={styles.statLabel}>Completed Jobs</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{money(avgPerActiveDay)}</Text>
              <Text style={styles.statLabel}>Avg / Active Day</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Daily Breakdown</Text>
          <View style={styles.dailyCard}>
            {buckets.map((b) => (
              <View key={b.day} style={styles.dayRow}>
                <Text style={styles.dayLabel}>{b.day}</Text>
                <View style={styles.dayBarTrack}>
                  <View
                    style={[
                      styles.dayBarFill,
                      { width: `${Math.max(4, (b.earnings / maxDayEarning) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.dayValue}>{b.earnings > 0 ? money(b.earnings) : '—'}</Text>
              </View>
            ))}
          </View>
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
  dateNavText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  summaryCard: { backgroundColor: '#111827', borderRadius: 18, padding: 20, marginBottom: 14 },
  summaryLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryAmount: { color: '#FACC15', fontSize: 30, fontWeight: '800' },
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
  statNumber: { fontSize: 18, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  dailyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  dayLabel: { width: 22, fontSize: 12, fontWeight: '700', color: '#64748B' },
  dayBarTrack: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  dayBarFill: { height: '100%', backgroundColor: '#FACC15', borderRadius: 4 },
  dayValue: { width: 78, fontSize: 11, fontWeight: '700', color: '#111827', textAlign: 'right' },
});