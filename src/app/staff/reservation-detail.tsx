// ============================================================
// FILE: app/staff/reservation-detail.tsx (UPDATED -- inalis ang
// Status box at QR Code Disabled box)
// ============================================================
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_TINT = '#EFF6FF';
const GREEN = '#16A34A';
const GREEN_TINT = '#DCFCE7';
const AMBER = '#D97706';
const AMBER_TINT = '#FEF3C7';
const RED = '#DC2626';
const RED_TINT = '#FEE2E2';
const GRAY = '#64748B';
const GRAY_TINT = '#F1F5F9';

interface ReservationDetailRow {
  id: number;
  vehicle_type: string;
  service_type: string;
  status: 'Waiting' | 'Washing' | 'Completed' | 'Voided';
  customer_name: string | null;
  reservation_date: string;
  scheduled_time: string | null;
  scheduled_at: string | null;
  arrived_at: string | null;
  bay_name: string | null;
  price: number | null;
  payment_method: string | null;
  payment_status: 'paid' | 'unpaid' | null;
}

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// "Sep 5, 2026" -- ginagamit sa ilalim ng "Today"/"Yesterday" label sa
// Reservation Date box, para makita pa rin ang eksaktong petsa kahit
// pinapalitan ng "Today" ang malaking text sa itaas nito.
function formatFullDate(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateKey: string) {
  const todayKey = toDateKey(new Date());
  if (dateKey === todayKey) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === toDateKey(yesterday)) return 'Yesterday';
  return formatFullDate(dateKey);
}

// Window ng pagdating -- 5 minuto bago at 5 minuto pagkatapos ng eksaktong
// oras, para gabayan lang ang staff/customer sa saklaw ng pagdating.
// Display-only; ang totoong grace period logic (15 min) ay nasa listahan.
function formatArrivalWindow(scheduledAt: string) {
  try {
    const d = new Date(scheduledAt);
    const before = new Date(d.getTime() - 5 * 60000);
    const after = new Date(d.getTime() + 5 * 60000);
    const fmt = (x: Date) => x.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    return `${fmt(before)} - ${fmt(after)}`;
  } catch {
    return '';
  }
}

function formatTime(t: string | null) {
  if (!t) return '—';
  // scheduled_time is often stored as "HH:MM:SS" -- render as "8:15 PM".
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

// Iisang lugar ang nagpapasya kung ano ang IPAPAKITANG status sa customer
// -- kahit "Voided" pa rin ang laman ng DB column, "Cancelled" pa rin ang
// lalabas dito, gaya ng ginawa na natin sa customer/history.tsx.
//
// FIX: pinaikli ang return shape -- title/description ay hindi na
// ginagamit dahil tinanggal na ang Status info box; label/color/bg/icon
// na lang ang kailangan para sa status pill sa itaas.
function getStatusInfo(row: ReservationDetailRow) {
  if (row.status === 'Voided') {
    return { label: 'Not Arrived', color: RED, bg: RED_TINT, icon: 'close-circle' as const };
  }
  if (row.status === 'Completed') {
    return { label: 'Completed', color: GREEN, bg: GREEN_TINT, icon: 'checkmark-circle' as const };
  }
  if (row.status === 'Washing') {
    return { label: 'Washing', color: BLUE, bg: BLUE_TINT, icon: 'water' as const };
  }
  // status === 'Waiting'
  if (row.arrived_at && !row.bay_name) {
    return { label: 'Waiting for Bay', color: BLUE, bg: BLUE_TINT, icon: 'hourglass' as const };
  }
  return { label: 'Not Arrived', color: AMBER, bg: AMBER_TINT, icon: 'time' as const };
}

export default function ReservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<ReservationDetailRow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('reservation')
      .select(
        'id, vehicle_type, service_type, status, customer_name, reservation_date, scheduled_time, scheduled_at, arrived_at, bay_name, price, payment_method, payment_status'
      )
      .eq('id', Number(id))
      .maybeSingle();

    if (!error && data) {
      setRow(data as ReservationDetailRow);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchDetail();
    }, [fetchDetail])
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>reservation</Text>
          <View style={{ width: 36 }} />
        </View>
        <ActivityIndicator size="small" color={BLUE} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>reservation</Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={styles.emptyText}>Reservation not found.</Text>
      </View>
    );
  }

  const statusInfo = getStatusInfo(row);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>reservation</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }} showsVerticalScrollIndicator={false}>
        {/* Top summary card -- vehicle icon, vehicle/service, customer,
            status badge, matching the list card's top row. Ito na lang
            ang tanging lugar kung saan ipinapakita ang status -- tinanggal
            na ang hiwalay na "Status" info box sa ibaba dahil doble na. */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name="bicycle-outline" size={26} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>{row.vehicle_type}</Text>
            <Text style={styles.summarySubtitle}>{row.service_type}</Text>
            <View style={styles.customerRow}>
              <Ionicons name="person-outline" size={12} color={GRAY} />
              <Text style={styles.customerName}>{row.customer_name ?? 'Walk-in customer'}</Text>
            </View>
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusInfo.bg }]}>
            <Ionicons name={statusInfo.icon} size={13} color={statusInfo.color} />
            <Text style={[styles.statusPillText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>

        {/* Info grid: Reservation Date / Arrival Time / Total Price */}
        <View style={styles.infoGrid}>
          <View style={styles.infoGridCell}>
            <Ionicons name="calendar-outline" size={16} color={GRAY} style={{ marginBottom: 6 }} />
            <Text style={styles.infoGridLabel}>Reservation Date</Text>
            <Text style={styles.infoGridValue}>{formatDateLabel(row.reservation_date)}</Text>
            <Text style={styles.infoGridSubvalue}>{formatFullDate(row.reservation_date)}</Text>
          </View>
          <View style={styles.infoGridDivider} />
          <View style={styles.infoGridCell}>
            <Ionicons name="time-outline" size={16} color={GRAY} style={{ marginBottom: 6 }} />
            <Text style={styles.infoGridLabel}>Arrival Time</Text>
            <Text style={styles.infoGridValue}>{formatTime(row.scheduled_time)}</Text>
            {row.scheduled_at ? (
              <Text style={styles.infoGridSubvalue}>(Window: {formatArrivalWindow(row.scheduled_at)})</Text>
            ) : null}
          </View>
          <View style={styles.infoGridDivider} />
          <View style={styles.infoGridCell}>
            <Ionicons name="pricetag-outline" size={16} color={GRAY} style={{ marginBottom: 6 }} />
            <Text style={styles.infoGridLabel}>Total Price</Text>
            <Text style={styles.infoGridValue}>{row.price ? formatPeso(row.price) : '—'}</Text>
          </View>
        </View>

        {/* Vehicle Details */}
        <View style={styles.detailsSection}>
          <View style={styles.detailsSectionHeader}>
            <Ionicons name="car-outline" size={16} color={NAVY} />
            <Text style={styles.detailsSectionTitle}>Vehicle Details</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Vehicle Type</Text>
            <Text style={styles.detailValue}>{row.vehicle_type}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Service</Text>
            <Text style={styles.detailValue}>{row.service_type}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment Method</Text>
            <Text style={styles.detailValue}>{row.payment_method ?? '—'}</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: NAVY,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },

  emptyText: { textAlign: 'center', color: GRAY, marginTop: 60, fontSize: 13 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BLUE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  summarySubtitle: { fontSize: 12.5, color: GRAY, marginTop: 2 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  customerName: { fontSize: 12, color: GRAY, fontWeight: '600' },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 11.5, fontWeight: '800' },

  infoGrid: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoGridCell: { flex: 1 },
  infoGridDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 10 },
  infoGridLabel: { fontSize: 10.5, color: GRAY, fontWeight: '700' },
  infoGridValue: { fontSize: 14, fontWeight: '800', color: NAVY, marginTop: 3 },
  infoGridSubvalue: { fontSize: 10, color: '#94A3B8', marginTop: 2 },

  detailsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailsSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  detailsSectionTitle: { fontSize: 14, fontWeight: '800', color: NAVY },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailLabel: { fontSize: 12.5, color: GRAY, fontWeight: '600' },
  detailValue: { fontSize: 12.5, color: NAVY, fontWeight: '700' },
});