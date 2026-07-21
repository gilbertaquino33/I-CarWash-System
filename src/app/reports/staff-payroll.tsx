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

interface StaffRow {
  id: string;
  full_name: string;
  email_address: string;
  mobile: string | null;
  created_at: string | null;
}

export default function StaffPayrollReport() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email_address, mobile, created_at')
      .eq('role', 'staff')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('Error fetching staff:', error);
      return;
    }
    setStaff((data as StaffRow[]) ?? []);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Payroll Report</Text>
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
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={20} color="#92400E" />
            <Text style={styles.noticeText}>
              Payroll amounts aren't available yet — the database doesn't track staff pay rates, hours,
              or shift assignments. Shown below is the current staff directory only. Let your developer
              know if you'd like a payroll module added (rate per hour/day + shift logging).
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Staff Directory ({staff.length})</Text>
          {staff.length === 0 ? (
            <Text style={styles.emptyText}>No staff accounts found.</Text>
          ) : (
            staff.map((s) => (
              <View key={s.id} style={styles.staffCard}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{s.full_name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffName}>{s.full_name}</Text>
                  <Text style={styles.staffMeta}>{s.email_address}</Text>
                  {!!s.mobile && <Text style={styles.staffMeta}>{s.mobile}</Text>}
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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 20 },
  staffCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#FACC15', fontWeight: '800', fontSize: 16 },
  staffName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  staffMeta: { fontSize: 12, color: '#64748B', marginTop: 1 },
});