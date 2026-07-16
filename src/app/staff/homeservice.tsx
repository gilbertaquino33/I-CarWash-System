import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface HomeServiceRow {
  id: number;
  shop_id: number | null;
  shop_name: string | null;
  customer_name: string;
  contact_number: string;
  address: string;
  vehicle_type: string;
  service_type: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string;
  payment_method: string | null;
  payment_status: string | null;
  price: number | null;
}

// ---------- SHARED BRAND COLOR (dapat kaparehas ng customer app) ----------
const BRAND_BLUE = '#2563EB';

// Tab -> DB status mapping. Dapat EXACTLY kaparehas ng customer app.
// Status flow: Waiting -> On the Way -> Washing -> Completed
const TAB_ORDER = ['Upcoming', 'On the Way', 'Washing', 'Completed'] as const;
type TabName = (typeof TAB_ORDER)[number];

const TAB_STATUS: Record<TabName, string> = {
  Upcoming: 'Waiting',
  'On the Way': 'On the Way',
  Washing: 'Washing',
  Completed: 'Completed',
};

// Anong susunod na status pag pinindot ng staff ang action button, per tab.
const NEXT_STATUS: Partial<Record<TabName, string>> = {
  Upcoming: 'On the Way',
  'On the Way': 'Washing',
  // 'Washing' -> 'Completed' ay hindi dito, dahil kailangan munang mag-input
  // ng staff ng amount bago maging Completed (see handleCompletePress).
};

const ACTION_LABEL: Partial<Record<TabName, string>> = {
  Upcoming: 'Confirm: On the Way',
  'On the Way': 'Start Washing',
  Washing: 'Complete & Collect Payment',
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Waiting': return '#F59E0B';
    case 'On the Way': return '#8B5CF6';
    case 'Washing': return BRAND_BLUE;
    case 'Completed': return '#22C55E';
    default: return '#64748B';
  }
};

const getPaymentStatusColor = (status: string | null) => {
  switch (status) {
    case 'Paid': return '#22C55E';
    case 'Unpaid': return '#F59E0B';
    default: return '#64748B';
  }
};

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH')}`;
}

export default function StaffHomeServiceScreen() {
  const [activeTab, setActiveTab] = useState<TabName>('Upcoming');
  const [services, setServices] = useState<HomeServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // ---------- Payment / Complete modal ----------
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<HomeServiceRow | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // NOTE: staff app ang dapat na makakakita ng LAHAT ng bookings mula sa
  // lahat ng customer -- walang .eq('user_id', ...) filter dito, kaibahan
  // sa customer-side screen.
  const fetchServices = async () => {
    const { data, error } = await supabase
      .from('home_service')
      .select(
        'id, shop_id, shop_name, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_method, payment_status, price'
      )
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('Error fetching home service bookings:', error);
    } else {
      setServices((data as HomeServiceRow[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchServices();

    const channel = supabase
      .channel('home-service-staff-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_service' },
        () => fetchServices()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchServices();
  };

  const filteredServices = services.filter((s) => s.status === TAB_STATUS[activeTab]);

  // ---------- Simple status bump: Waiting -> On the Way -> Washing ----------
  // Walang add/edit ng booking details dito -- ang tanging ginagawa ng staff
  // ay i-confirm na tumuloy sa susunod na stage.
  const handleAdvance = async (service: HomeServiceRow) => {
    const nextStatus = NEXT_STATUS[activeTab];
    if (!nextStatus) return;

    setUpdatingId(service.id);
    const { data, error } = await supabase
      .from('home_service')
      .update({ status: nextStatus })
      .eq('id', service.id)
      .select();
    setUpdatingId(null);

    if (error) {
      Alert.alert('Failed', error.message);
      return;
    }

    if (!data || data.length === 0) {
      Alert.alert(
        'Hindi Na-save',
        'Walang na-update na row. Posibleng blocked ito ng database permissions (RLS).'
      );
      return;
    }

    const updatedRow = data[0] as HomeServiceRow;
    setServices((prev) => prev.map((s) => (s.id === updatedRow.id ? updatedRow : s)));
    fetchServices();
  };

  // ---------- Washing -> Completed (kailangan munang i-input ang amount) ----------
  const handleCompletePress = (service: HomeServiceRow) => {
    setSelectedService(service);
    // Prefill sa estimated price kung meron, para hindi na kailangan i-type
    // ulit ng staff kung tama naman ang estimate.
    setAmountInput(service.price != null ? String(service.price) : '');
    setPaymentModalVisible(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedService) return;

    const cleaned = amountInput.trim();
    const amount = Number(cleaned);
    if (!cleaned || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Ilagay ang tamang halagang binayad ng customer.');
      return;
    }

    setSavingPayment(true);
    // Isang update lang: dito sabay na-se-set ang final price, "Paid", at
    // "Completed" -- kaya imposibleng maging Completed ang isang session na
    // walang naka-record na bayad.
    // IMPORTANT: chinain ang .select() para makita natin ang totoong nabago
    // sa DB. Kung walang error PERO walang laman ang "data" (0 rows), ibig
    // sabihin hindi tinamaan ng update ang row -- karaniwang dahil sa RLS
    // policy, hindi silent na "success" kahit walang error object.
    const { data, error } = await supabase
      .from('home_service')
      .update({
        price: amount,
        payment_status: 'Paid',
        status: 'Completed',
      })
      .eq('id', selectedService.id)
      .select();
    setSavingPayment(false);

    if (error) {
      Alert.alert('Failed', error.message);
      return;
    }

    if (!data || data.length === 0) {
      Alert.alert(
        'Hindi Na-save',
        'Walang na-update na row. Posibleng blocked ito ng database permissions (RLS). I-check ang UPDATE policy ng home_service table para sa staff role.'
      );
      return;
    }

    // Agad i-reflect sa local state ang totoong laman ng na-update na row
    // (galing mismo sa DB response), imbes na umasa lang sa realtime
    // subscription -- para instant ang lipat ng card papuntang Completed
    // kahit hindi pa dumating o na-enable ang realtime event.
    const updatedRow = data[0] as HomeServiceRow;
    setServices((prev) => prev.map((s) => (s.id === updatedRow.id ? updatedRow : s)));

    setPaymentModalVisible(false);
    setSelectedService(null);
    setAmountInput('');
    setActiveTab('Completed');
    fetchServices();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Home Service</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        {TAB_ORDER.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Service List -- NO add/floating button dito, view + confirm lang */}
      <ScrollView
        style={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={BRAND_BLUE} />
          </View>
        ) : (
          <>
            {filteredServices.map((service) => (
              <View key={service.id} style={styles.serviceCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.customerInfo}>
                    <View style={styles.avatarCircle}>
                      <Ionicons name="person" size={20} color={BRAND_BLUE} />
                    </View>
                    <View style={styles.customerDetails}>
                      <Text style={styles.customerName}>{service.customer_name}</Text>
                      <Text style={styles.customerPhone}>{service.contact_number}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.scheduledTime}>{service.scheduled_time}</Text>
                    <Text style={styles.customerPhone}>{service.scheduled_date}</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={16} color="#64748B" />
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoText}>{service.address}</Text>
                    </View>
                  </View>

                  <View style={styles.vehicleRow}>
                    <View style={styles.infoRow}>
                      <Ionicons name="car-outline" size={16} color="#64748B" />
                      <Text style={styles.infoText}>
                        {service.vehicle_type} · {service.service_type}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(service.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(service.status) }]}>
                        {service.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.paymentRow}>
                    <View style={styles.infoRow}>
                      <Ionicons name="cash-outline" size={16} color="#64748B" />
                      <Text style={styles.infoText}>
                        {service.payment_method || 'Cash on Hand'}
                        {service.price != null ? ` · ${formatPeso(service.price)}` : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getPaymentStatusColor(service.payment_status) + '20' },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: getPaymentStatusColor(service.payment_status) }]}>
                        {service.payment_status || 'Unpaid'}
                      </Text>
                    </View>
                  </View>

                  {/* Action button -- iisa lang depende sa kasalukuyang tab.
                      Walang action sa Completed tab (view-only na). */}
                  {activeTab !== 'Completed' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, updatingId === service.id && { opacity: 0.6 }]}
                      disabled={updatingId === service.id}
                      onPress={() =>
                        activeTab === 'Washing'
                          ? handleCompletePress(service)
                          : handleAdvance(service)
                      }
                    >
                      {updatingId === service.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.actionBtnText}>{ACTION_LABEL[activeTab]}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {filteredServices.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="car-outline" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No services found</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* PAYMENT / COMPLETE MODAL -- kinakailangan bago maging Completed */}
      <Modal
        visible={paymentModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.paymentOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.dropdownOverlayTouchable}
            activeOpacity={1}
            onPress={() => !savingPayment && setPaymentModalVisible(false)}
          />
          <View style={styles.paymentSheet}>
            <View style={styles.dropdownSheetHeader}>
              <Text style={styles.dropdownSheetTitle}>Collect Payment</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)} hitSlop={8} disabled={savingPayment}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            {selectedService && (
              <Text style={styles.paymentSubtext}>
                {selectedService.customer_name} · {selectedService.vehicle_type} ·{' '}
                {selectedService.service_type}
              </Text>
            )}

            <Text style={styles.subLabel}>Amount Collected (₱)</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
              autoFocus
            />

            <Text style={styles.paymentHint}>
              Ito ang ilalagay na final price ng session na ito at magmamarka ng payment bilang
              "Paid". Awtomatiko na itong mapupunta sa Completed tab.
            </Text>

            <TouchableOpacity
              style={[styles.submitBtn, savingPayment && { opacity: 0.6 }]}
              onPress={handleConfirmPayment}
              disabled={savingPayment}
            >
              {savingPayment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Mark as Paid & Complete</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSpacer: { width: 40 },
  tabScroll: { flexGrow: 0, marginBottom: 16 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, marginRight: 8 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: BRAND_BLUE },
  tabText: { color: '#64748B', fontSize: 14, fontWeight: '500' },
  activeTabText: { color: '#111827', fontWeight: '700' },
  listContainer: { flex: 1, paddingHorizontal: 16 },
  serviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  customerInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerDetails: { justifyContent: 'center' },
  customerName: { color: '#111827', fontSize: 16, fontWeight: '600' },
  customerPhone: { color: '#64748B', fontSize: 12, marginTop: 2 },
  scheduledTime: { color: '#111827', fontSize: 14, fontWeight: '500' },
  cardBody: {},
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoTextContainer: { flex: 1 },
  infoText: { color: '#111827', fontSize: 14 },
  vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: '#64748B', fontSize: 16, marginTop: 12 },
  actionBtn: {
    marginTop: 14,
    backgroundColor: BRAND_BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  paymentOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  dropdownOverlayTouchable: { flex: 1 },
  paymentSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  dropdownSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  dropdownSheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  paymentSubtext: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 6, marginBottom: 8 },
  amountInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  paymentHint: { fontSize: 12, color: '#64748B', fontStyle: 'italic', marginBottom: 4 },
  submitBtn: {
    marginTop: 16,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});