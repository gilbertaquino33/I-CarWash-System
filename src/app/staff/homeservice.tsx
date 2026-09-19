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
  on_the_way_at?: string | null;
  washing_at?: string | null;
  completed_at?: string | null;
}

const NAVY = '#1A1D21';
const BLUE = '#2563EB';
const ERROR = '#DC2626';
const SUCCESS = '#16A34A';

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
  Upcoming: 'Mark as On the Way',
  'On the Way': 'Start Washing',
  Washing: 'Complete & Collect Payment',
};

// Ang tatlong status timestamps ay idinadagdag ng
// supabase/sql/2026-09_home_service_status_timestamps.sql. HANGGANG hindi pa
// na-run ang SQL na iyon sa Supabase, wala pa ang mga column -- at ang buong
// query ay babagsak ("column home_service.on_the_way_at does not exist",
// Postgres error 42703), kaya WALANG kahit anong booking na makikita.
//
// Kaya hiwalay ang listahan: sinusubukan muna ang bagong columns, at kapag
// wala pa ang mga ito sa database ay inuulit ang query gamit ang lumang
// listahan. Gumagana pa rin ang buong screen; "Pending" lang muna ang
// ipapakita ng timeline hanggang sa ma-apply ang SQL.
const STAMP_COLUMNS = 'on_the_way_at, washing_at, completed_at';

// Dalawang magkaibang anyo ang dating ng "wala ang column na ito":
//
//   42703  -- galing mismo sa Postgres, kapag SELECT ang tinatakbo
//   PGRST204 -- galing sa PostgREST, kapag INSERT/UPDATE: "Could not find
//               the 'on_the_way_at' column of 'home_service' in the schema
//               cache". Lumalabas din ito kung NAKA-APPLY na ang SQL pero
//               LUMA pa ang schema cache ng PostgREST (kailangan ng
//               "notify pgrst, 'reload schema';" o ilang segundo).
//
// Dapat nahuhuli ang PAREHO, kung hindi ay babagsak pa rin ang buong query.
const isMissingColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const message = error.message ?? '';
  return /does not exist/i.test(message) || /schema cache/i.test(message);
};

const BASE_COLUMNS =
  'id, shop_id, shop_name, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_method, payment_status, price, paid_at';

// Anong timestamp column ang sini-stamp kapag umabante sa status na ito.
// Dito nanggagaling ang "kailan ito naging X" na ipinapakita sa timeline.
const STATUS_STAMP: Record<string, 'on_the_way_at' | 'washing_at' | 'completed_at'> = {
  'On the Way': 'on_the_way_at',
  Washing: 'washing_at',
  Completed: 'completed_at',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Manu-manong format -- iniiwasan ang Intl/toLocaleString na hindi
// pare-pareho ang resulta sa Hermes sa iba't ibang Android device.
function formatStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  const hour = d.getHours() % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${hour}:${mins} ${ampm}`;
}

// User-friendly copy para sa confirmation modal ng bawat status bump.
const ADVANCE_CONFIRM: Partial<Record<TabName, { title: string; message: (name: string) => string }>> = {
  Upcoming: {
    title: 'On the Way?',
    message: (name) => `${name} will be notified that you are heading to their location.`,
  },
  'On the Way': {
    title: 'Start Washing?',
    message: (name) => `Begin the wash for ${name}'s vehicle.`,
  },
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Waiting': return '#B7791F';
    case 'On the Way': return '#8B5CF6';
    case 'Washing': return BLUE;
    case 'Completed': return '#16A34A';
    default: return '#6B7280';
  }
};

const getPaymentStatusColor = (status: string | null) => {
  switch (status) {
    case 'Paid': return '#16A34A';
    case 'Unpaid': return '#B7791F';
    default: return '#6B7280';
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
          <View style={[styles.confirmIconWrap, { backgroundColor: '#E4EDFF' }]}>
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
              <Text style={[styles.confirmBtnText, { color: '#6B7280' }]}>Cancel</Text>
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

// ===== STATUS TIMELINE =====
// Ipinapakita kung KAILAN naganap ang bawat hakbang ng booking. Ang hakbang
// na wala pang timestamp ay "Pending" -- kaya makikita agad kung saan na
// nakarating ang booking at kung anong oras nangyari ang bawat parte.
// Pagkakasunod-sunod ng status -- dito sinusukat kung gaano na kalayo
// ang booking, kaya umuusad ang progress kahit walang naka-save na oras.
const STATUS_ORDER = ['Waiting', 'On the Way', 'Washing', 'Completed'];

const TIMELINE_STEPS = [
  { key: 'on_the_way_at', label: 'On the Way', color: '#8B5CF6' },
  { key: 'washing_at', label: 'Washing', color: BLUE },
  { key: 'completed_at', label: 'Completed', color: SUCCESS },
] as const;

function StatusTimeline({ service }: { service: HomeServiceRow }) {
  // BUG FIX: dati, umiilaw lang ang isang hakbang kapag may TIMESTAMP ito.
  // Kapag wala pa ang timestamp columns sa database (o lumang booking bago
  // pa naidagdag ang mga ito), hindi kailanman na-save ang oras -- kaya
  // naka-"Pending" ang lahat kahit Washing o Completed na ang status.
  // Ngayon ang STATUS ang nagdedesisyon kung naabot na ang hakbang; ang
  // timestamp ay dagdag na impormasyon lang (kung kailan eksakto).
  const currentIndex = STATUS_ORDER.indexOf(service.status);

  const steps = TIMELINE_STEPS.map((step, i) => {
    const stepIndex = i + 1; // 0 = Waiting, kaya nagsisimula sa 1 ang mga hakbang
    const reached = currentIndex >= stepIndex;
    const isCurrent = currentIndex === stepIndex && step.key !== 'completed_at';
    // Fallback sa paid_at para sa completed rows na walang completed_at.
    const at = formatStamp(
      step.key === 'completed_at' ? service.completed_at ?? service.paid_at : service[step.key]
    );
    return {
      ...step,
      reached,
      caption: at ?? (isCurrent ? 'In progress' : reached ? 'Done' : 'Pending'),
    };
  });

  return (
    <View style={styles.timeline}>
      <Text style={styles.timelineHeading}>Progress</Text>
      {steps.map((step, i) => (
        <View key={step.key} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View
              style={[
                styles.timelineDot,
                step.reached
                  ? { backgroundColor: step.color, borderColor: step.color }
                  : { backgroundColor: '#FFFFFF', borderColor: '#D1D5DB' },
              ]}
            >
              {step.reached && <Ionicons name="checkmark" size={9} color="#FFFFFF" />}
            </View>
            {i < steps.length - 1 && (
              // Kinukulayan ang linya kapag naabot na ang SUSUNOD na hakbang.
              <View
                style={[styles.timelineLine, steps[i + 1].reached && { backgroundColor: step.color }]}
              />
            )}
          </View>
          <View style={styles.timelineText}>
            <Text style={[styles.timelineLabel, !step.reached && styles.timelinePendingLabel]}>
              {step.label}
            </Text>
            <Text
              style={[
                styles.timelineTime,
                !step.reached && styles.timelinePendingTime,
                step.caption === 'In progress' && { color: step.color, fontWeight: '700' },
              ]}
            >
              {step.caption}
            </Text>
          </View>
        </View>
      ))}
    </View>
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
              { backgroundColor: state.type === 'success' ? '#E7F6EC' : '#FCECEC' },
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
            // NOTE: kailangan i-override ang `flex: 1` ng confirmBtn dito --
            // COLUMN ang parent (confirmCard), kaya ang flex: 1 ay nangangahulugang
            // flexBasis: 0 sa HEIGHT, na nagko-collapse sa button at nagtatago sa
            // "OK" na label. flex: 0 = flexBasis auto, kaya sumusukat ito sa content.
            style={[styles.confirmBtn, styles.confirmConfirmBtn, { width: '100%', flex: 0 }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>OK</Text>
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

  // FIX: kailangan malaman muna kung ANONG shop ang assigned sa
  // kasalukuyang naka-login na staff (galing sa "profiles.shop_id") --
  // ito ang gagamitin para i-scope ang fetchServices() sa SARILING
  // shop lang ng staff na ito. Dati, WALANG shop_id filter ang query,
  // kaya nakikita (at napo-process!) ng staff ang home service bookings
  // ng LAHAT ng shop sa buong system. Resulta: kapag na-"Complete" ng
  // staff ang isang booking na hindi pala sa sariling shop niya
  // nanggaling, matagumpay itong na-uupdate sa DB (walang error), pero
  // hindi ito lumalabas sa Earnings widget ng Staff/Admin Dashboard --
  // dahil naka-filter yun sa SARILING shop_id lang ng staff.
  const [assignedShopId, setAssignedShopId] = useState<number | null>(null);
  const [shopResolved, setShopResolved] = useState(false);

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

  // FIX: kunin muna ang shop_id ng naka-login na staff BAGO tumawag ng
  // fetchServices() -- kailangan ito bilang batayan ng shop-scoping.
  useEffect(() => {
    const resolveAssignedShop = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShopResolved(true);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('shop_id')
        .eq('id', session.user.id)
        .single();

      setAssignedShopId(data?.shop_id ? Number(data.shop_id) : null);
      setShopResolved(true);
    };
    resolveAssignedShop();
  }, []);

  // FIX: idinagdag ang ".eq('shop_id', shopId)" -- ito ang dating
  // kulang, kaya lahat ng shops' home service bookings ang nakikita
  // (at napo-process) ng bawat staff kahit iba ang shop nila.
  const fetchServices = async (shopId: number | null) => {
    if (!shopId) {
      setServices([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const run = (columns: string) =>
      supabase
        .from('home_service')
        .select(columns)
        .eq('shop_id', shopId)
        .order('scheduled_at', { ascending: true });

    let { data, error } = await run(`${BASE_COLUMNS}, ${STAMP_COLUMNS}`);

    if (isMissingColumnError(error)) {
      console.warn(
        'home_service status timestamps are missing -- run supabase/sql/2026-09_home_service_status_timestamps.sql'
      );
      ({ data, error } = await run(BASE_COLUMNS));
    }

    if (error) {
      console.error('Error fetching home service bookings:', error);
    } else {
      setServices((data as unknown as HomeServiceRow[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!shopResolved) return;
    fetchServices(assignedShopId);

    const channel = supabase
      .channel('home-service-staff-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_service' },
        () => fetchServices(assignedShopId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopResolved, assignedShopId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchServices(assignedShopId);
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

    const copy = ADVANCE_CONFIRM[activeTab];

    // Show confirmation first
    setConfirmation({
      visible: true,
      title: copy?.title ?? 'Confirm?',
      message:
        copy?.message(service.customer_name) ??
        `Update ${service.customer_name}'s booking to "${nextStatus}".`,
      confirmText: 'Confirm',
      onConfirm: async () => {
        setUpdatingId(service.id);
        // Kasabay ng status, sini-stamp din ang EKSAKTONG oras ng pagbabago
        // para may permanenteng record kung kailan naganap ang hakbang na ito.
        const stampColumn = STATUS_STAMP[nextStatus];
        const patch: Record<string, unknown> = { status: nextStatus };
        if (stampColumn) patch[stampColumn] = new Date().toISOString();

        const runUpdate = (body: Record<string, unknown>) =>
          supabase.from('home_service').update(body).eq('id', service.id).select();

        let { data, error } = await runUpdate(patch);

        // Kung wala pa ang timestamp column sa database, huwag ipatumba ang
        // status update -- ang status ang mahalaga, ang stamp ay bonus.
        if (isMissingColumnError(error)) {
          ({ data, error } = await runUpdate({ status: nextStatus }));
        }
        setUpdatingId(null);

        if (error) {
          showFeedback('Something Went Wrong', error.message, 'error');
          return;
        }

        if (!data || data.length === 0) {
          showFeedback(
            'Not Saved',
            'The booking was not updated. Please try again or check your connection.',
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
          'Success!',
          `${service.customer_name}'s booking is now "${nextStatus}".`,
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
      title: 'Finish Booking?',
      message: `The wash for ${service.customer_name} is done. Next step is collecting the payment.`,
      confirmText: 'Confirm',
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
    const now = new Date().toISOString();
    const basePatch = {
      price: amount,
      payment_status: 'Paid',
      status: 'Completed',
      paid_at: now,
    };

    const runUpdate = (body: Record<string, unknown>) =>
      supabase.from('home_service').update(body).eq('id', selectedService.id).select();

    let { data, error } = await runUpdate({ ...basePatch, completed_at: now });

    // Gaya sa handleAdvance: kung wala pa ang completed_at column, huwag
    // hayaang mabigo ang pag-collect ng bayad dahil lang doon.
    if (isMissingColumnError(error)) {
      ({ data, error } = await runUpdate(basePatch));
    }
    setSavingPayment(false);

    if (error) {
      showFeedback('Something Went Wrong', error.message, 'error');
      return;
    }

    if (!data || data.length === 0) {
      showFeedback(
        'Not Saved',
        'The booking was not updated. Please try again or check your connection.',
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
      'Payment Collected!',
      `${formatPeso(amount)} received. This booking is now completed.`,
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
        ) : !assignedShopId ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>No shop assigned yet. Contact your admin or re-login.</Text>
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
                    <Ionicons name="location-outline" size={16} color="#6B7280" />
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoText}>{service.address}</Text>
                    </View>
                  </View>

                  <View style={styles.vehicleRow}>
                    <View style={styles.infoRow}>
                      <Ionicons name="car-outline" size={16} color="#6B7280" />
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
                      <Ionicons name="cash-outline" size={16} color="#6B7280" />
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

                  <StatusTimeline service={service} />

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
                <Ionicons name="car-outline" size={48} color="#6B7280" />
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
              <TouchableOpacity
                style={styles.headerCloseBtn}
                onPress={() => setPaymentModalVisible(false)}
                hitSlop={8}
                disabled={savingPayment}
              >
                <Ionicons name="close" size={16} color="#1A1D21" />
                <Text style={styles.headerCloseBtnText}>Close</Text>
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
              placeholderTextColor="#9AA1AC"
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
  container: { flex: 1, backgroundColor: '#F4F5F7' },
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
  headerSubtitle: { color: '#9AA1AC', fontSize: 12, marginTop: 3 },
  headerSpacer: { width: 40 },
  tabScroll: { flexGrow: 0, marginTop: 16, marginBottom: 8 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, marginRight: 8 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: BLUE },
  tabText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  activeTabText: { color: '#1A1D21', fontWeight: '700' },
  listContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  historySummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEEF1',
    padding: 16,
    marginBottom: 12,
  },
  historySummaryItem: { flex: 1, alignItems: 'center' },
  historySummaryDivider: { width: 1, backgroundColor: '#ECEEF1', marginHorizontal: 8 },
  historySummaryLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  historySummaryValue: { fontSize: 18, color: '#1A1D21', fontWeight: '800' },

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
    backgroundColor: '#E4EDFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerDetails: { justifyContent: 'center' },
  customerName: { color: '#1A1D21', fontSize: 16, fontWeight: '700' },
  customerPhone: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  scheduledTime: { color: '#1A1D21', fontSize: 14, fontWeight: '600' },
  cardBody: {},
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoTextContainer: { flex: 1 },
  infoText: { color: '#3A3F47', fontSize: 14 },
  vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: '#6B7280', fontSize: 16, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 },
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
  dropdownSheetTitle: { fontSize: 16, fontWeight: '800', color: '#1A1D21' },
  headerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F7F8FA',
  },
  headerCloseBtnText: { fontSize: 12.5, fontWeight: '700', color: '#1A1D21' },
  paymentSubtext: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginTop: 6, marginBottom: 8 },
  amountInput: {
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1D21',
    borderWidth: 1,
    borderColor: '#ECEEF1',
    marginBottom: 8,
  },
  paymentHint: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 4 },
  submitBtn: {
    marginTop: 16,
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ===== Status Timeline Styles =====
  timeline: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
  },
  timelineHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineRail: {
    width: 18,
    alignItems: 'center',
  },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flexGrow: 1,
    minHeight: 12,
    backgroundColor: '#E5E7EB',
    marginVertical: 2,
  },
  timelineText: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    paddingLeft: 10,
  },
  timelineLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: NAVY,
  },
  timelinePendingLabel: {
    color: '#9CA3AF',
    fontWeight: '600',
  },
  timelineTime: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  timelinePendingTime: {
    color: '#C3C8D0',
    fontWeight: '500',
  },

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
    color: '#4B5563',
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
    backgroundColor: '#F7F8FA',
  },
  confirmConfirmBtn: {
    backgroundColor: BLUE,
  },
  confirmBtnText: {
    fontWeight: '800',
    fontSize: 13.5,
  },
});