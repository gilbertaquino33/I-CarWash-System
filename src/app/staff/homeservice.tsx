import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  paid_at: string | null;
}

const NAVY = '#0F172A';
const BLUE = '#2563EB';
const ERROR = '#DC2626';
const SUCCESS = '#22C55E';

const TAB_ORDER = ['Upcoming', 'On the Way', 'Washing', 'Completed'] as const;
type TabName = (typeof TAB_ORDER)[number];

const TAB_STATUS: Record<TabName, string> = {
  Upcoming: 'Waiting',
  'On the Way': 'On the Way',
  Washing: 'Washing',
  Completed: 'Completed',
};

const NEXT_STATUS: Partial<Record<TabName, string>> = {
  Upcoming: 'On the Way',
  'On the Way': 'Washing',
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
    case 'Washing': return BLUE;
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

interface FeedbackState {
  visible: boolean;
  title: string;
  message: string;
  type?: 'error' | 'success';
}

const initialFeedback: FeedbackState = { visible: false, title: '', message: '' };

// ===== CONFIRMATION MODAL =====
interface ConfirmationState {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  serviceId?: number;
}

const initialConfirmation: ConfirmationState = {
  visible: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  onConfirm: () => {},
};

function ConfirmationModal({
  state,
  onClose,
}: {
  state: ConfirmationState;
  onClose: () => void;
}) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: '#DBEAFE' }]}>
            <Ionicons name="alert-circle" size={26} color={BLUE} />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmCancelBtn]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={[styles.confirmBtnText, { color: '#64748B' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmConfirmBtn]}
              onPress={() => {
                state.onConfirm();
                onClose();
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>
                {state.confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ===== FEEDBACK MODAL =====
function FeedbackModal({ state, onClose }: { state: FeedbackState; onClose: () => void }) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View
            style={[
              styles.confirmIconWrap,
              { backgroundColor: state.type === 'success' ? '#DCFCE7' : '#FEE2E2' },
            ]}
          >
            <Ionicons
              name={state.type === 'success' ? 'checkmark-circle' : 'close'}
              size={26}
              color={state.type === 'success' ? SUCCESS : ERROR}
            />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <TouchableOpacity
            style={[styles.confirmBtn, styles.confirmConfirmBtn, { width: '100%' }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>
              {state.type === 'success' ? 'Done' : 'OK'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function StaffHomeServiceScreen() {
  const [activeTab, setActiveTab] = useState<TabName>('Upcoming');
  const [services, setServices] = useState<HomeServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // ---------- Confirmation modal state ----------
  const [confirmation, setConfirmation] = useState<ConfirmationState>(initialConfirmation);
  const closeConfirmation = () => setConfirmation((c) => ({ ...c, visible: false }));

  // ---------- Payment / Complete modal ----------
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<HomeServiceRow | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // ---------- Feedback modal ----------
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string, type: 'error' | 'success' = 'error') =>
    setFeedback({ visible: true, title, message, type });

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from('home_service')
      .select(
        'id, shop_id, shop_name, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_method, payment_status, price, paid_at'
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

  const filteredServices = services
    .filter((s) => s.status === TAB_STATUS[activeTab])
    .sort((a, b) => (activeTab === 'Completed' ? b.id - a.id : 0));

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const completedTodayServices = useMemo(
    () =>
      services.filter(
        (s) => s.status === 'Completed' && !!s.paid_at && s.paid_at.split('T')[0] === todayStr
      ),
    [services, todayStr]
  );
  const completedTodayCount = completedTodayServices.length;
  const todayHomeServiceEarnings = useMemo(
    () => completedTodayServices.reduce((sum, s) => sum + (s.price ?? 0), 0),
    [completedTodayServices]
  );

  // ---------- Status bump with confirmation ----------
  const handleAdvance = async (service: HomeServiceRow) => {
    const nextStatus = NEXT_STATUS[activeTab];
    if (!nextStatus) return;

    // Show confirmation first
    setConfirmation({
      visible: true,
      title: `Confirm ${nextStatus}?`,
      message: `Are you sure you want to mark "${service.customer_name}"'s booking as "${nextStatus}"?`,
      confirmText: `Confirm ${nextStatus}`,
      onConfirm: async () => {
        setUpdatingId(service.id);
        const { data, error } = await supabase
          .from('home_service')
          .update({ status: nextStatus })
          .eq('id', service.id)
          .select();
        setUpdatingId(null);

        if (error) {
          showFeedback('Failed', error.message, 'error');
          return;
        }

        if (!data || data.length === 0) {
          showFeedback(
            'Not Saved',
            'No row was updated. Possible RLS permission issue.',
            'error'
          );
          return;
        }

        // NOTE: We rely solely on this local state update + the realtime
        // subscription for refreshing the list. We intentionally do NOT
        // call fetchServices() here as well — doing so created a race
        // between this update and the realtime-triggered refetch, which
        // could momentarily re-render a card with a stale/mismatched
        // status before the second fetch resolved (the "blank button"
        // bug on the On the Way tab).
        const updatedRow = data[0] as HomeServiceRow;
        setServices((prev) => prev.map((s) => (s.id === updatedRow.id ? updatedRow : s)));
        showFeedback(
          'Success! ',
          `Booking marked as "${nextStatus}" successfully.`,
          'success'
        );
      },
      serviceId: service.id,
    });
  };

  const handleCompletePress = (service: HomeServiceRow) => {
    // Show confirmation first before opening payment modal
    setConfirmation({
      visible: true,
      title: 'Complete Booking?',
      message: `Are you sure you want to complete "${service.customer_name}"'s booking?\n\nThis will require payment confirmation.`,
      confirmText: 'Proceed to Payment',
      onConfirm: () => {
        setSelectedService(service);
        setAmountInput(service.price != null ? String(service.price) : '');
        setPaymentModalVisible(true);
      },
      serviceId: service.id,
    });
  };

  const handleConfirmPayment = async () => {
    if (!selectedService) return;

    const cleaned = amountInput.trim();
    const amount = Number(cleaned);
    if (!cleaned || isNaN(amount) || amount <= 0) {
      showFeedback('Invalid Amount', 'Please enter a valid payment amount.', 'error');
      return;
    }

    setSavingPayment(true);
    const { data, error } = await supabase
      .from('home_service')
      .update({
        price: amount,
        payment_status: 'Paid',
        status: 'Completed',
        paid_at: new Date().toISOString(),
      })
      .eq('id', selectedService.id)
      .select();
    setSavingPayment(false);

    if (error) {
      showFeedback('Failed', error.message, 'error');
      return;
    }

    if (!data || data.length === 0) {
      showFeedback(
        'Not Saved',
        'No row was updated. Possible RLS permission issue.',
        'error'
      );
      return;
    }

    // Same reasoning as handleAdvance: local state update + realtime
    // subscription is enough. No extra fetchServices() call here.
    const updatedRow = data[0] as HomeServiceRow;
    setServices((prev) => prev.map((s) => (s.id === updatedRow.id ? updatedRow : s)));

    setPaymentModalVisible(false);
    setSelectedService(null);
    setAmountInput('');
    setActiveTab('Completed');
    showFeedback(
      'Payment Collected! ',
      `Booking marked as "Completed" with payment of ${formatPeso(amount)}.`,
      'success'
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Home Service</Text>
          <Text style={styles.headerSubtitle}>Manage scheduled home wash bookings</Text>
        </View>

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

      {/* Service List */}
      <ScrollView
        style={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={BLUE} />
          </View>
        ) : (
          <>
            {/* Today's Earnings Summary */}
            {activeTab === 'Completed' && completedTodayCount > 0 && (
              <View style={styles.historySummaryCard}>
                <View style={styles.historySummaryItem}>
                  <Text style={styles.historySummaryLabel}>Completed Today</Text>
                  <Text style={styles.historySummaryValue}>{completedTodayCount}</Text>
                </View>
                <View style={styles.historySummaryDivider} />
                <View style={styles.historySummaryItem}>
                  <Text style={styles.historySummaryLabel}>Today's Earnings</Text>
                  <Text style={styles.historySummaryValue}>{formatPeso(todayHomeServiceEarnings)}</Text>
                </View>
              </View>
            )}

            {filteredServices.map((service) => (
              <View key={service.id} style={styles.serviceCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.customerInfo}>
                    <View style={styles.avatarCircle}>
                      <Ionicons name="person" size={20} color={BLUE} />
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

                  {/* Action button - always has a fallback label so it never renders blank */}
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
                        <Text style={styles.actionBtnText}>
                          {ACTION_LABEL[activeTab] ?? 'Update Status'}
                        </Text>
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

      {/* Payment / Complete Modal */}
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
                <Ionicons name="close" size={22} color="#0F172A" />
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
              This will mark the booking as "Completed" with "Paid" status.
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

      {/* Confirmation Modal */}
      <ConfirmationModal state={confirmation} onClose={closeConfirmation} />

      {/* Feedback Modal */}
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: NAVY,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerText: { flex: 1, marginLeft: 8 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  headerSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  headerSpacer: { width: 40 },
  tabScroll: { flexGrow: 0, marginTop: 16, marginBottom: 8 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, marginRight: 8 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: BLUE },
  tabText: { color: '#64748B', fontSize: 14, fontWeight: '500' },
  activeTabText: { color: '#1E293B', fontWeight: '700' },
  listContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  historySummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
  },
  historySummaryItem: { flex: 1, alignItems: 'center' },
  historySummaryDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 8 },
  historySummaryLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  historySummaryValue: { fontSize: 18, color: '#1E293B', fontWeight: '800' },

  serviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
  customerName: { color: '#1E293B', fontSize: 16, fontWeight: '700' },
  customerPhone: { color: '#64748B', fontSize: 12, marginTop: 2 },
  scheduledTime: { color: '#1E293B', fontSize: 14, fontWeight: '600' },
  cardBody: {},
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoTextContainer: { flex: 1 },
  infoText: { color: '#334155', fontSize: 14 },
  vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: '#64748B', fontSize: 16, marginTop: 12 },
  actionBtn: {
    marginTop: 14,
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 13,
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
  dropdownSheetTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
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
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ===== Confirmation Modal Styles =====
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 6,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  confirmConfirmBtn: {
    backgroundColor: BLUE,
  },
  confirmBtnText: {
    fontWeight: '800',
    fontSize: 13.5,
  },
});