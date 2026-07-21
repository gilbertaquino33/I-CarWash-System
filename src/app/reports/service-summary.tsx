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

interface ServiceStat {
  name: string;
  count: number;
  revenue: number;
  walkinCount: number;
  homeCount: number;
}

export default function ServiceSummaryReport() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ServiceStat[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);

  const fetchData = useCallback(async () => {
    const { data: shop } = await supabase
      .from('shop_profile_setup')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const shopId = shop?.id ?? null;
    if (!shopId) {
      setStats([]);
      setTotalJobs(0);
      return;
    }

    const [walkinRes, homeRes] = await Promise.all([
      supabase
        .from('reservation')
        .select('service_type, price, status')
        .eq('shop_id', shopId)
        .eq('status', 'Completed'),
      supabase
        .from('home_service')
        .select('service_type, price, status')
        .eq('shop_id', shopId)
        .eq('status', 'Completed'),
    ]);

    const map: Record<string, ServiceStat> = {};
    let jobs = 0;

    (walkinRes.data ?? []).forEach((row: any) => {
      const key = row.service_type ?? 'Other';
      if (!map[key]) map[key] = { name: key, count: 0, revenue: 0, walkinCount: 0, homeCount: 0 };
      map[key].count += 1;
      map[key].revenue += row.price ?? 0;
      map[key].walkinCount += 1;
      jobs += 1;
    });

    (homeRes.data ?? []).forEach((row: any) => {
      const key = row.service_type ?? 'Other';
      if (!map[key]) map[key] = { name: key, count: 0, revenue: 0, walkinCount: 0, homeCount: 0 };
      map[key].count += 1;
      map[key].revenue += row.price ?? 0;
      map[key].homeCount += 1;
      jobs += 1;
    });

    setStats(Object.values(map).sort((a, b) => b.revenue - a.revenue));
    setTotalJobs(jobs);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const totalRevenue = stats.reduce((sum, s) => sum + s.revenue, 0);
  const maxRevenue = Math.max(1, ...stats.map((s) => s.revenue));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Summary</Text>
        <View style={styles.headerSpacer} />
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
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{totalJobs}</Text>
              <Text style={styles.statLabel}>Completed Jobs (All Time)</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{money(totalRevenue)}</Text>
              <Text style={styles.statLabel}>Total Revenue</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Revenue by Service Type</Text>
          {stats.length === 0 ? (
            <Text style={styles.emptyText}>No completed services recorded yet.</Text>
          ) : (
            stats.map((s) => (
              <View key={s.name} style={styles.serviceCard}>
                <View style={styles.serviceHeaderRow}>
                  <Text style={styles.serviceName}>{s.name}</Text>
                  <Text style={styles.serviceRevenue}>{money(s.revenue)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(s.revenue / maxRevenue) * 100}%` }]} />
                </View>
                <View style={styles.serviceMetaRow}>
                  <Text style={styles.serviceMetaText}>{s.count} job{s.count === 1 ? '' : 's'} total</Text>
                  <Text style={styles.serviceMetaText}>
                    {s.walkinCount} walk-in • {s.homeCount} home service
                  </Text>
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
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
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
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 20 },
  serviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  serviceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  serviceName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  serviceRevenue: { fontSize: 14, fontWeight: '800', color: '#111827' },
  barTrack: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  barFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 4 },
  serviceMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  serviceMetaText: { fontSize: 11, color: '#64748B' },
});