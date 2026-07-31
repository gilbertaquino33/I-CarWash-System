// CustomerReservation.tsx
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type ReservationRow = {
  customer_id: number;
  shop_id?: number | null;
  vehicle_type?: string | null;
  service_type?: string | null;
  customer_name?: string | null;
  service_tier?: string | null;
  address?: string | null;
  customer_phone?: string | null;
  status: string;
  created_at: string;
  reservation_date: string;
  price?: number | null;
  payment_method?: string | null;
};

export default function CustomerReservation({
  visible,
  onClose,
  assignedShopId,
  reservationSource,
}: {
  visible: boolean;
  onClose: () => void;
  assignedShopId?: number | null;
  reservationSource?: string | null;
}) {
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queue, setQueue] = useState<ReservationRow[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'onTheWay' | 'washing' | 'completed'>('upcoming');
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const [savingPriceFor, setSavingPriceFor] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const showFeedback = (title: string, message: string) => {
    // Minimal feedback — replace with modal in caller if needed
    console.warn(title, message);
  };

  const fetchQueue = async (shopId?: number | null) => {
    setLoadingQueue(true);
    setFetchError(null);
    const today = new Date().toISOString().split('T')[0];
    const tableCandidates = ['reservation', 'reservations'];
    const selectVariants = [
      'customer_id, shop_id, vehicle_type, service_type, service_tier, customer_name, status, created_at, reservation_date, price, payment_method, address, customer_phone',
      'customer_id, shop_id, vehicle_type, service_type, status, created_at, reservation_date, price, payment_method, address, customer_phone',
      '*',
    ];

    let lastError: any = null;

    for (const table of tableCandidates) {
      for (const cols of selectVariants) {
        try {
          let query: any = supabase.from(table).select(cols).eq('reservation_date', today).order('created_at', {
            ascending: false,
          });
          if (shopId) query = query.eq('shop_id', shopId);
          const { data, error } = await query;
          if (error) {
            lastError = error;
            continue;
          }
          setQueue((data as ReservationRow[]) ?? []);
          setLoadingQueue(false);
          return;
        } catch (err: any) {
          lastError = err;
          continue;
        }
      }
    }

    setQueue([]);
    setLoadingQueue(false);
    setFetchError(lastError?.message ?? 'Could not fetch reservations');
    showFeedback('Error fetching reservations', lastError?.message ?? 'Could not fetch reservations');
  };

  useEffect(() => {
    if (visible) fetchQueue(assignedShopId);
  }, [visible, assignedShopId, reservationSource]);

  const updateStatus = async (customerId: number, payload: Record<string, any>) => {
    const table = reservationSource || 'reservation';
    const { data, error } = await supabase.from(table).update(payload).eq('customer_id', customerId).select();
    if (error) {
      showFeedback('Action Failed', error.message);
      setFetchError(String(error.message ?? error));
      return false;
    }
    setQueue((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, ...payload } : r)));
    return true;
  };

  const handleAcceptReservation = (customerId: number) => updateStatus(customerId, { status: 'For Payment' });
  const handleDenyReservation = (customerId: number) => updateStatus(customerId, { status: 'Denied' });
  const handleConfirmGcash = (customerId: number) => updateStatus(customerId, { status: 'Upcoming', payment_method: 'GCash' });
  const handleConfirmOnTheWay = (customerId: number) => updateStatus(customerId, { status: 'On the Way' });
  const handleStartWashing = (customerId: number) => updateStatus(customerId, { status: 'Washing' });
  const handleMarkComplete = (customerId: number) => updateStatus(customerId, { status: 'Completed' });

  const handleSavePrice = async (customerId: number) => {
    const raw = priceInputs[customerId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const value = trimmed === '' ? 0 : parseFloat(trimmed);
    if (isNaN(value) || value < 0) {
      showFeedback('Invalid Price', 'Enter a valid number (e.g. 150 or 150.00).');
      return;
    }
    setSavingPriceFor(customerId);
    const table = reservationSource || 'reservation';
    const { data, error } = await supabase.from(table).update({ price: value }).eq('customer_id', customerId).select();
    setSavingPriceFor(null);
    if (error) {
      showFeedback('Price Not Saved', error.message);
      setFetchError(String(error.message ?? error));
      return;
    }
    setQueue((prev) => prev.map((it) => (it.customer_id === customerId ? { ...it, price: value } : it)));
    setPriceInputs((prev) => {
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
  };

  const filtered = queue.filter((item) => {
    if (tab === 'upcoming') return ['Pending', 'For Payment', 'Upcoming'].includes(item.status);
    if (tab === 'onTheWay') return item.status === 'On the Way';
    if (tab === 'washing') return item.status === 'Washing';
    return item.status === 'Completed';
  });

  const screenWidth = Dimensions.get('window').width;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={screenStyles.safe}>
        {/* Header (Customer Reservation) */}
        <View style={screenStyles.header}>
          <TouchableOpacity style={screenStyles.headerLeft} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={screenStyles.headerCenter}>
            <Text style={screenStyles.headerTitle}>Customer Reservation</Text>
            <Text style={screenStyles.headerSubtitle}>Manage scheduled wash bookings</Text>
          </View>
          <TouchableOpacity style={screenStyles.headerRight} onPress={() => console.log('settings pressed')}>
            <View style={screenStyles.settingsCircle}>
              <Ionicons name="settings" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={screenStyles.tabsRow}>
          {[
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'onTheWay', label: 'On the Way' },
            { key: 'washing', label: 'Washing' },
            { key: 'completed', label: 'Completed' },
          ].map((t) => {
            const active = tab === (t.key as any);
            return (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key as any)} style={screenStyles.tabBtn} activeOpacity={0.85}>
                <Text style={[screenStyles.tabText, active && screenStyles.tabTextActive]}>{t.label}</Text>
                {active && <View style={screenStyles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 16 }}>
          {fetchError ? (
            <View style={{ paddingVertical: 12 }}>
              <Text style={{ color: '#DC2626' }}>Error: {fetchError}</Text>
            </View>
          ) : null}

          {loadingQueue ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0F172A" />
              <Text style={{ color: '#64748B', marginTop: 8 }}>Loading...</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ height: 280, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="car-outline" size={48} color="#94A3B8" />
              <Text style={{ marginTop: 12, color: '#64748B', fontSize: 16 }}>No services found</Text>
            </View>
          ) : (
            filtered.map((item) => {
              const name =
                (item as any).customer_name ??
                (item as any).name ??
                (item as any).full_name ??
                (item as any).customer?.full_name ??
                (item as any).customer?.name ??
                `Guest #${item.customer_id ?? '—'}`;
              const phone = item.customer_phone ?? '';
              const addr = item.address ?? '';
              const serviceTier = item.service_tier ?? item.service_type ?? 'Service';
              const vehicle = item.vehicle_type ?? '';
              const modeOfPayment = (item as any).payment_method ?? (item as any).mode ?? 'GCash';
              const priceText = item.price != null ? formatPeso(item.price) : '—';
              const paid = !!item.payment_method || modeOfPayment === 'GCash' || item.status === 'Upcoming';

              // primary action labels
              let primaryLabel = '';
              let primaryAction: (() => void) | null = null;
              if (['Pending', 'For Payment', 'Upcoming'].includes(item.status)) {
                primaryLabel = 'Confirm: On the Way';
                primaryAction = () => handleConfirmOnTheWay(item.customer_id);
              } else if (item.status === 'On the Way') {
                primaryLabel = 'Confirm: Start Washing';
                primaryAction = () => handleStartWashing(item.customer_id);
              } else if (item.status === 'Washing') {
                primaryLabel = 'Mark Complete';
                primaryAction = () => handleMarkComplete(item.customer_id);
              }

              const currentPriceText = priceInputs[item.customer_id] ?? (item.price != null && item.price !== 0 ? String(item.price) : '');

              return (
                <View key={`${item.customer_id}-${item.created_at}`} style={[screenStyles.card, { width: screenWidth - 32 }]}>
                  <View style={screenStyles.cardTop}>
                    <View style={screenStyles.avatarWrap}>
                      <Ionicons name="person" size={20} color="#fff" />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={screenStyles.cardName}>{name}</Text>
                      {!!phone && <Text style={screenStyles.cardPhone}>{phone}</Text>}
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={screenStyles.timeText}>{new Date(item.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</Text>
                      <Text style={screenStyles.dateText}>{new Date(item.reservation_date).toLocaleDateString('en-PH')}</Text>
                    </View>
                  </View>

                  {!!addr && <Text style={screenStyles.cardAddress}>{addr}</Text>}

                  <View style={screenStyles.infoRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="car-outline" size={16} color="#475569" />
                      <Text style={screenStyles.infoText}>{vehicle ? `${vehicle} · ` : ''}{serviceTier}</Text>
                    </View>
                    <View>
                      <View style={[screenStyles.smallBadge, { backgroundColor: statusColor(item.status) + '15' }]}>
                        <Text style={[screenStyles.smallBadgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={[screenStyles.infoRow, { marginTop: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="card-outline" size={16} color="#475569" />
                      <Text style={screenStyles.infoText}>{modeOfPayment}{item.price != null ? ` · ${priceText}` : ''}</Text>
                    </View>
                    <View>
                      <View style={paid ? screenStyles.paidPill : screenStyles.unpaidPill}>
                        <Text style={paid ? screenStyles.paidPillText : screenStyles.unpaidPillText}>{paid ? 'Paid' : 'Unpaid'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Price input and save */}
                  <View style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>₱</Text>
                      <TextInput
                        style={screenStyles.priceInputSmall}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#94A3B8"
                        value={currentPriceText}
                        onChangeText={(text) => setPriceInputs((prev) => ({ ...prev, [item.customer_id]: text }))}
                      />
                      {!!(priceInputs[item.customer_id]) && (
                        <TouchableOpacity style={screenStyles.priceSaveBtnSmall} onPress={() => handleSavePrice(item.customer_id)} disabled={savingPriceFor === item.customer_id}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>{savingPriceFor === item.customer_id ? '...' : 'Save'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {primaryAction && (
                    <TouchableOpacity style={screenStyles.primaryBtn} onPress={primaryAction} activeOpacity={0.85}>
                      <Text style={screenStyles.primaryBtnText}>{primaryLabel}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function formatPeso(value: number) {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function statusColor(status: string) {
  switch (status) {
    case 'Pending': return '#F59E0B';
    case 'For Payment': return '#F59E0B';
    case 'Upcoming': return '#60A5FA';
    case 'On the Way': return '#60A5FA';
    case 'Waiting': return '#F59E0B';
    case 'Washing': return '#3B82F6';
    case 'Completed': return '#10B981';
    case 'Denied': return '#DC2626';
    default: return '#94A3B8';
  }
}

const screenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#0F172A',
    paddingTop: 48,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'flex-start', paddingLeft: 8 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSubtitle: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  headerRight: { width: 54, alignItems: 'flex-end' },
  settingsCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },

  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabBtn: { flex: 1, alignItems: 'center' },
  tabText: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: '#0F172A' },
  tabUnderline: { height: 3, backgroundColor: '#2563EB', width: '70%', marginTop: 8, borderRadius: 3 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatarWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E6EEF9', alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  cardPhone: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  timeText: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  dateText: { fontSize: 11, color: '#94A3B8' },

  cardAddress: { color: '#475569', marginTop: 6, lineHeight: 18 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  infoText: { marginLeft: 8, color: '#475569' },

  smallBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12 },
  smallBadgeText: { fontSize: 12, fontWeight: '700' },

  paidPill: { backgroundColor: '#ECFDF5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#BBF7D0' },
  unpaidPill: { backgroundColor: '#FFFBEB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#FDE68A' },
  paidPillText: { color: '#16A34A', fontWeight: '700' },
  unpaidPillText: { color: '#92400E', fontWeight: '700' },

  primaryBtn: { marginTop: 14, backgroundColor: '#2563EB', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  priceInputSmall: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: '#1E293B', width: 90, marginLeft: 8, backgroundColor: '#F8FAFC' },
  priceSaveBtnSmall: { backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 8 },
});