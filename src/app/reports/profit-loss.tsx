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

export default function ProfitLossReport() {
  const [refDate, setRefDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walkinRevenue, setWalkinRevenue] = useState(0);
  const [homeRevenue, setHomeRevenue] = useState(0);
  const [jobCount, setJobCount] = useState(0);

  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const monthLabel = refDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const fetchData = useCallback(async () => {
    const { data: shop } = await supabase
      .from('shop_profile_setup')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const shopId = shop?.id ?? null;
    if (!shopId) {
      setWalkinRevenue(0);
      setHomeRevenue(0);
      setJobCount(0);
      return;
    }

    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [walkinRes, homeRes] = await Promise.all([
      supabase
        .from('reservation')
        .select('price')
        .eq('shop_id', shopId)
        .eq('status', 'Completed')
        .gte('reservation_date', startStr)
        .lte('reservation_date', endStr),
      supabase
        .from('home_service')
        .select('price')
        .eq('shop_id', shopId)
        .eq('status', 'Completed')
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr),
    ]);

    const wSum = (walkinRes.data ?? []).reduce((s: number, r: any) => s + (r.price ?? 0), 0);
    const hSum = (homeRes.data ?? []).reduce((s: number, r: any) => s + (r.price ?? 0), 0);

    setWalkinRevenue(wSum);
    setHomeRevenue(hSum);
    setJobCount((walkinRes.data?.length ?? 0) + (homeRes.data?.length ?? 0));
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

  const grossRevenue = walkinRevenue + homeRevenue;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profit / Loss Report</Text>
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
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={20} color="#92400E" />
            <Text style={styles.noticeText}>
              This report currently shows gross revenue only. The database doesn't track expenses yet
              (supplies, utilities, rent, salaries), so Net Profit here equals Gross Revenue. Ask your
              developer to add an expense-tracking table for a true profit/loss computation.
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Gross Revenue</Text>
            <Text style={styles.summaryAmount}>{money(grossRevenue)}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Walk-in</Text>
                <Text style={styles.summaryPillValue}>{money(walkinRevenue)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Home Service</Text>
                <Text style={styles.summaryPillValue}>{money(homeRevenue)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.plRow}>
            <View style={styles.plCard}>
              <Text style={styles.plLabel}>Total Revenue</Text>
              <Text style={[styles.plValue, { color: '#16A34A' }]}>{money(grossRevenue)}</Text>
            </View>
            <View style={styles.plCard}>
              <Text style={styles.plLabel}>Total Expenses</Text>
              <Text style={[styles.plValue, { color: '#94A3B8' }]}>Not tracked</Text>
            </View>
            <View style={styles.plCard}>
              <Text style={styles.plLabel}>Net (Revenue - Expenses)</Text>
              <Text style={[styles.plValue, { color: '#111827' }]}>{money(grossRevenue)}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{jobCount}</Text>
              <Text style={styles.statLabel}>Completed Jobs</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {jobCount > 0 ? money(grossRevenue / jobCount) : money(0)}
              </Text>
              <Text style={styles.statLabel}>Avg Revenue / Job</Text>
            </View>
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
  noticeBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  noticeText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  summaryCard: { backgroundColor: '#111827', borderRadius: 18, padding: 20, marginBottom: 20 },
  summaryLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryAmount: { color: '#FACC15', fontSize: 30, fontWeight: '800', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryPill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 },
  summaryPillLabel: { color: '#CBD5E1', fontSize: 11, fontWeight: '600' },
  summaryPillValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 2 },
  plRow: { gap: 10, marginBottom: 20 },
  plCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  plLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  plValue: { fontSize: 15, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 12 },
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
});