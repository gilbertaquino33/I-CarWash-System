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

interface BayRow {
  bay_name: string;
  occupied: boolean;
  reserved: boolean;
  car_type: string | null;
  updated_at: string;
}

export default function BayUtilizationReport() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bays, setBays] = useState<BayRow[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});

  const fetchData = useCallback(async () => {
    const { data: shop } = await supabase
      .from('shop_profile_setup')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const shopId = shop?.id ?? null;
    if (!shopId) {
      setBays([]);
      setUsageCounts({});
      return;
    }

    const [bayRes, historyRes] = await Promise.all([
      supabase
        .from('bays')
        .select('bay_name, occupied, reserved, car_type, updated_at')
        .eq('shop_id', shopId)
        .order('bay_name', { ascending: true }),
      supabase
        .from('reservation')
        .select('bay_name')
        .eq('shop_id', shopId)
        .not('bay_name', 'is', null),
    ]);

    setBays((bayRes.data as BayRow[]) ?? []);

    const counts: Record<string, number> = {};
    (historyRes.data ?? []).forEach((row: any) => {
      if (!row.bay_name) return;
      counts[row.bay_name] = (counts[row.bay_name] ?? 0) + 1;
    });
    setUsageCounts(counts);
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

  const totalBays = bays.length;
  const occupiedNow = bays.filter((b) => b.occupied || b.reserved).length;
  const utilizationRate = totalBays > 0 ? Math.round((occupiedNow / totalBays) * 100) : 0;
  const maxUsage = Math.max(1, ...Object.values(usageCounts));

  const bayStatus = (b: BayRow) => {
    if (b.occupied) return { label: 'Occupied', bg: '#FEE2E2', text: '#DC2626' };
    if (b.reserved) return { label: 'Reserved', bg: '#FEF3C7', text: '#D97706' };
    return { label: 'Free', bg: '#DCFCE7', text: '#16A34A' };
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bay Utilization Report</Text>
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
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Current Utilization</Text>
            <Text style={styles.summaryAmount}>{utilizationRate}%</Text>
            <Text style={styles.summarySub}>{occupiedNow} of {totalBays} bays in use right now</Text>
          </View>

          <Text style={styles.sectionTitle}>Live Bay Status</Text>
          {bays.length === 0 ? (
            <Text style={styles.emptyText}>No bays configured yet. Set this up in Shop Profile Setup.</Text>
          ) : (
            bays.map((b) => {
              const sc = bayStatus(b);
              return (
                <View key={b.bay_name} style={styles.bayCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bayName}>{b.bay_name}</Text>
                    {!!b.car_type && <Text style={styles.bayCarType}>{b.car_type}</Text>}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: sc.text }]}>{sc.label}</Text>
                  </View>
                </View>
              );
            })
          )}

          <Text style={styles.sectionTitle}>Most Used Bays (All Time)</Text>
          {Object.keys(usageCounts).length === 0 ? (
            <Text style={styles.emptyText}>No reservation history yet.</Text>
          ) : (
            <View style={styles.usageCard}>
              {Object.entries(usageCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <View key={name} style={styles.usageRow}>
                    <Text style={styles.usageName}>{name}</Text>
                    <View style={styles.usageBarTrack}>
                      <View style={[styles.usageBarFill, { width: `${(count / maxUsage) * 100}%` }]} />
                    </View>
                    <Text style={styles.usageCount}>{count}x</Text>
                  </View>
                ))}
            </View>
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
  summaryCard: { backgroundColor: '#14532D', borderRadius: 18, padding: 20, marginBottom: 20 },
  summaryLabel: { color: '#BBF7D0', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  summarySub: { color: '#86EFAC', fontSize: 12, marginTop: 6, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10, marginTop: 4 },
  emptyText: { color: '#64748B', fontSize: 13, marginBottom: 20 },
  bayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bayName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  bayCarType: { fontSize: 11, color: '#64748B', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  usageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  usageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  usageName: { width: 60, fontSize: 12, fontWeight: '700', color: '#111827' },
  usageBarTrack: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  usageBarFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 4 },
  usageCount: { width: 34, fontSize: 11, fontWeight: '700', color: '#111827', textAlign: 'right' },
});