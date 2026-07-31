// StaffDashboard.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// NOTE: PDF receipts use `expo-print` and `expo-sharing`. If these
// aren't already in the project, install them with:
//   npx expo install expo-print expo-sharing

interface ReservationRow {
  customer_id: number;
  shop_id: number;
  vehicle_type: string;
  service_type: string;
  // NEW optional fields (many schemas name these differently; optional so code won't break)
  customer_name?: string | null;
  service_tier?: string | null;
  status: string;
  created_at: string;
  reservation_date: string;
  price: number | null;
  // Optional audit fields (enable in DB if you want to persist them)
  payment_method?: string | null;
  payment_confirmed_at?: string | null;
  payment_confirmed_by?: string | null;
  // FIX: these were used by CustomerReservation but missing from the type
  customer_phone?: string | null;
  address?: string | null;
  // NEW: optional joined customer data (if reservation table has an FK to
  // a "customers" or "profiles" table instead of a plain customer_name column)
  customers?: { full_name?: string | null; mobile?: string | null } | null;
  profiles?: { full_name?: string | null; mobile?: string | null } | null;
}

interface StaffRow {
  id: string;
  full_name: string;
  mobile?: string | null;
  role?: string | null;
  created_at?: string;
}

interface PayoutRow {
  id: string;
  staff_id: string;
  staff_name: string;
  period_type: PayPeriod;
  period_start: string;
  period_end: string;
  amount: number;
  payment_method: string;
  paid_by: string | null;
  paid_by_name: string | null;
  paid_at: string;
}

const statusColor = (status: string) => {
  switch (status) {
    case 'Pending':
      return '#F59E0B';
    case 'For Payment':
      return '#F59E0B';
    case 'Upcoming':
      return '#60A5FA';
    case 'Waiting':
      return '#F59E0B';
    case 'Washing':
      return '#3B82F6';
    case 'Completed':
      return '#10B981';
    case 'Denied':
      return '#DC2626';
    default:
      return '#94A3B8';
  }
};

// THEME
const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#60A5FA';
const ERROR = '#DC2626';
const GOLD = '#F59E0B';

// PAYOUT SPLIT RULE
const STAFF_SHARE_PERCENT = 0.4;

type PayPeriod = 'daily' | 'weekly' | 'monthly';

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getPayPeriodRange(period: PayPeriod, offset: number) {
  const now = new Date();

  if (period === 'daily') {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const iso = toISODate(d);
    return {
      start: iso,
      end: iso,
      label: d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    };
  }

  if (period === 'weekly') {
    const base = new Date(now);
    base.setDate(base.getDate() + offset * 7);
    const day = base.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: toISODate(monday),
      end: toISODate(sunday),
      label: `${monday.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString(
        'en-PH',
        { month: 'short', day: 'numeric', year: 'numeric' }
      )}`,
    };
  }

  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: toISODate(firstDay),
    end: toISODate(lastDay),
    label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
  };
}

function formatPeso(value: number) {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function periodLabel(p: PayPeriod) {
  return p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : 'Monthly';
}

function buildReceiptHtml(payout: PayoutRow, shopName: string) {
  const periodRangeText =
    payout.period_start === payout.period_end ? payout.period_start : `${payout.period_start} – ${payout.period_end}`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 32px; color: #0F172A; }
          .header { border-bottom: 2px solid #0F172A; padding-bottom: 16px; margin-bottom: 24px; }
          .shop { font-size: 20px; font-weight: 800; }
          .title { font-size: 13px; color: #64748B; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
          .amount { font-size: 36px; font-weight: 800; color: #16A34A; margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E2E8F0; }
          .label { color: #64748B; font-size: 13px; }
          .value { color: #0F172A; font-size: 13px; font-weight: 700; }
          .footer { margin-top: 32px; font-size: 11px; color: #94A3B8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop">${shopName || 'Carwash'}</div>
          <div class="title">Payroll Receipt</div>
        </div>
        <div class="amount">${formatPeso(payout.amount)}</div>
        <div class="row"><span class="label">Paid To</span><span class="value">${payout.staff_name}</span></div>
        <div class="row"><span class="label">Pay Period</span><span class="value">${periodLabel(payout.period_type)}</span></div>
        <div class="row"><span class="label">Period Range</span><span class="value">${periodRangeText}</span></div>
        <div class="row"><span class="label">Payment Method</span><span class="value">${payout.payment_method}</span></div>
        <div class="row"><span class="label">Paid By</span><span class="value">${payout.paid_by_name || '—'}</span></div>
        <div class="row"><span class="label">Date Paid</span><span class="value">${formatDateTime(payout.paid_at)}</span></div>
        <div class="footer">This receipt confirms a payroll payout recorded in the system. Generated on ${formatDateTime(new Date().toISOString())}.</div>
      </body>
    </html>
  `;
}

function createFreshChannel(channelName: string) {
  const topic = `realtime:${channelName}`;
  const existing = supabase.getChannels().find((ch) => ch.topic === topic);
  if (existing) {
    supabase.removeChannel(existing);
  }
  return supabase.channel(channelName);
}

interface ConfirmState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

const initialConfirm: ConfirmState = {
  visible: false,
  title: '',
  message: '',
  confirmLabel: 'OK',
  onConfirm: () => {},
};

interface FeedbackState {
  visible: boolean;
  title: string;
  message: string;
}

const initialFeedback: FeedbackState = { visible: false, title: '', message: '' };

function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: state.destructive ? '#FEE2E2' : '#DBEAFE' }]}>
            <Ionicons name={state.destructive ? 'alert-circle' : 'help-circle'} size={28} color={state.destructive ? ERROR : BLUE} />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={[styles.confirmBtn, styles.confirmBtnGhost]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.confirmBtnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: state.destructive ? ERROR : BLUE }]} onPress={state.onConfirm} activeOpacity={0.85}>
              <Text style={styles.confirmBtnText}>{state.confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FeedbackModal({ state, onClose }: { state: FeedbackState; onClose: () => void }) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close" size={26} color={ERROR} />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: BLUE, width: '100%' }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.confirmBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function StaffDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [assignedShopId, setAssignedShopId] = useState<number | null>(null);
  const [assignedShopName, setAssignedShopName] = useState('');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loadingStaffList, setLoadingStaffList] = useState(true);
  const [queue, setQueue] = useState<ReservationRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  // Local text of the price input before it's saved
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const [savingPriceFor, setSavingPriceFor] = useState<number | null>(null);

  // Add reservationSource so we know which table worked
  const [reservationSource, setReservationSource] = useState<string | null>(null);

  // NEW: Reservations modal state
  const [reservationsOpen, setReservationsOpen] = useState(false);
  const [customerReservationOpen, setCustomerReservationOpen] = useState(false);

  // Payslip / history state (unchanged)
  const [payslipOpen, setPayslipOpen] = useState(false);
  const [payslipPeriod, setPayslipPeriod] = useState<PayPeriod>('daily');
  const [payslipOffset, setPayslipOffset] = useState(0);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [payslipRevenue, setPayslipRevenue] = useState(0);
  const [payslipJobsCount, setPayslipJobsCount] = useState(0);
  const [payslipPayout, setPayslipPayout] = useState<PayoutRow | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPayouts, setHistoryPayouts] = useState<PayoutRow[]>([]);
  const [generatingReceiptFor, setGeneratingReceiptFor] = useState<string | null>(null);

  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string) => setFeedback({ visible: true, title, message });

  // DEBUG: verify this component/file is the one mounted and reservationSource changes
  useEffect(() => {
    console.log('[StaffDashboard] mounted — reservationSource=', reservationSource);
  }, [reservationSource]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth');
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const metaShopId = userData.user?.user_metadata?.shop_id;
      const metaShopName = userData.user?.user_metadata?.shop_name ?? '';

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .single();

      if (!data || data.role !== 'staff') {
        await supabase.auth.signOut();
        router.replace('/auth');
        return;
      }
      setProfile(data);
      setStaffId(session.user.id);
      setAssignedShopId(metaShopId ? Number(metaShopId) : null);
      setAssignedShopName(metaShopName);
    };
    checkAuth();
  }, []);

  // RESILIENT fetchQueue: try common table names & select variants
  const fetchQueue = async (shopId?: number | null) => {
    setLoadingQueue(true);
    const today = new Date().toISOString().split('T')[0];

    const tableCandidates = ['reservation', 'reservations'];
    // Try joined customer name first (covers schemas where the name lives in
    // a related "customers" or "profiles" table via customer_id FK), then
    // fall back to a plain customer_name column, then to '*'.
    const selectVariants = [
      'customer_id, shop_id, vehicle_type, service_type, service_tier, customer_name, status, created_at, reservation_date, price, payment_method, payment_confirmed_at, payment_confirmed_by, customers(full_name, mobile)',
      'customer_id, shop_id, vehicle_type, service_type, service_tier, customer_name, status, created_at, reservation_date, price, payment_method, payment_confirmed_at, payment_confirmed_by, profiles(full_name, mobile)',
      'customer_id, shop_id, vehicle_type, service_type, service_tier, customer_name, status, created_at, reservation_date, price, payment_method, payment_confirmed_at, payment_confirmed_by',
      'customer_id, shop_id, vehicle_type, service_type, status, created_at, reservation_date, price, payment_method',
      '*',
    ];

    let lastError: any = null;

    for (const table of tableCandidates) {
      for (const cols of selectVariants) {
        try {
          let query: any = supabase.from(table).select(cols).eq('reservation_date', today).order('created_at', {
            ascending: false,
          });

          if (shopId) {
            query = query.eq('shop_id', shopId);
          }

          const { data, error } = await query;

          if (error) {
            console.error(`fetchQueue: error using table="${table}" cols="${cols}"`, JSON.stringify(error, null, 2));
            lastError = error;
            continue;
          }

          // Success (even empty array)
          setQueue((data as ReservationRow[]) ?? []);
          setReservationSource(table);
          setLoadingQueue(false);
          return;
        } catch (err) {
          console.error(`fetchQueue: unexpected error using table="${table}" cols="${cols}"`, err);
          lastError = err;
          continue;
        }
      }
    }

    console.error('fetchQueue: all attempts failed. lastError:', lastError);
    showFeedback(
      'Error fetching reservations',
      lastError?.message
        ? String(lastError.message)
        : 'Could not read reservation data. Check table name and Row Level Security (RLS) policies.'
    );
    setQueue([]);
    setLoadingQueue(false);
  };

  const handleUpdateStatus = async (customerId: number, newStatus: string) => {
    const table = reservationSource || 'reservation';
    const { data, error } = await supabase
      .from(table)
      .update({ status: newStatus })
      .eq('customer_id', customerId)
      .select();

    if (error) {
      showFeedback('Update Failed', error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.log(`[StaffDashboard] update affected 0 rows -- check RLS UPDATE policy on "${table}"`);
      showFeedback(
        'Status Not Saved',
        'Nothing was updated in the database. This is likely blocked by Row Level Security in Supabase -- allow UPDATE with the anon key on the reservation table.'
      );
      return;
    }

    setQueue((prev) =>
      prev.map((item) => (item.customer_id === customerId ? { ...item, status: newStatus } : item))
    );
  };

  const handleAcceptReservation = async (customerId: number) => {
    const table = reservationSource || 'reservation';
    const { data, error } = await supabase
      .from(table)
      .update({ status: 'For Payment' })
      .eq('customer_id', customerId)
      .select();

    if (error) {
      showFeedback('Accept Failed', error.message);
      return;
    }
    setQueue((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, status: 'For Payment' } : r)));
  };

  const handleDenyReservation = async (customerId: number) => {
    const table = reservationSource || 'reservation';
    const { data, error } = await supabase
      .from(table)
      .update({ status: 'Denied' })
      .eq('customer_id', customerId)
      .select();

    if (error) {
      showFeedback('Deny Failed', error.message);
      return;
    }
    setQueue((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, status: 'Denied' } : r)));
  };

  const handleConfirmGcash = async (customerId: number) => {
    const table = reservationSource || 'reservation';
    const payload: any = { status: 'Upcoming' };
    // If DB has payment columns, you can add them here safely only if present.
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('customer_id', customerId)
      .select();

    if (error) {
      showFeedback('Confirm Payment Failed', error.message);
      return;
    }
    setQueue((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, ...payload } : r)));
  };

  const handleStartWashing = async (customerId: number) => {
    const table = reservationSource || 'reservation';
    const { data, error } = await supabase
      .from(table)
      .update({ status: 'Washing' })
      .eq('customer_id', customerId)
      .select();

    if (error) {
      showFeedback('Start Wash Failed', error.message);
      return;
    }
    setQueue((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, status: 'Washing' } : r)));
  };

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
    const { data, error } = await supabase
      .from(table)
      .update({ price: value })
      .eq('customer_id', customerId)
      .select();
    setSavingPriceFor(null);

    if (error) {
      showFeedback('Price Not Saved', error.message);
      return;
    }

    if (!data || data.length === 0) {
      showFeedback(
        'Price Not Saved',
        'Nothing was updated in the database. This is likely blocked by Row Level Security -- allow UPDATE with the anon key on the reservation table.'
      );
      return;
    }

    setQueue((prev) =>
      prev.map((item) => (item.customer_id === customerId ? { ...item, price: value } : item))
    );
    setPriceInputs((prev) => {
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
  };

  const fetchPayslip = useCallback(async () => {
    setPayslipLoading(true);
    const range = getPayPeriodRange(payslipPeriod, payslipOffset);

    const table = reservationSource || 'reservation';
    let query = supabase
      .from(table)
      .select('price')
      .eq('status', 'Completed')
      .gte('reservation_date', range.start)
      .lte('reservation_date', range.end);

    if (assignedShopId) {
      query = query.eq('shop_id', assignedShopId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching payslip data:', error);
      setPayslipRevenue(0);
      setPayslipJobsCount(0);
    } else {
      const rows = data ?? [];
      setPayslipRevenue(rows.reduce((sum: number, r: any) => sum + (r.price ?? 0), 0));
      setPayslipJobsCount(rows.length);
    }

    if (staffId) {
      const { data: payoutData, error: payoutError } = await supabase
        .from('payroll_payouts')
        .select('*')
        .eq('staff_id', staffId)
        .eq('period_type', payslipPeriod)
        .eq('period_start', range.start)
        .eq('period_end', range.end)
        .maybeSingle();

      if (payoutError) {
        console.error('Error fetching payslip payout status:', payoutError);
        setPayslipPayout(null);
      } else {
        setPayslipPayout((payoutData as PayoutRow) ?? null);
      }
    } else {
      setPayslipPayout(null);
    }

    setPayslipLoading(false);
  }, [payslipPeriod, payslipOffset, assignedShopId, staffId, reservationSource]);

  useEffect(() => {
    if (payslipOpen) {
      fetchPayslip();
    }
  }, [payslipOpen, fetchPayslip]);

  const openHistory = async () => {
    setHistoryOpen(true);
    if (!staffId) return;
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('payroll_payouts')
      .select('*')
      .eq('staff_id', staffId)
      .order('paid_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching payment history:', error);
      setHistoryPayouts([]);
    } else {
      setHistoryPayouts((data as PayoutRow[]) ?? []);
    }
    setHistoryLoading(false);
  };

  const handleDownloadReceipt = async (payout: PayoutRow) => {
    setGeneratingReceiptFor(payout.id);
    try {
      const html = buildReceiptHtml(payout, assignedShopName);
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Payroll Receipt',
          UTI: 'com.adobe.pdf',
        });
      } else {
        showFeedback('Receipt Ready', `The PDF was saved, but sharing isn't available on this device. File: ${uri}`);
      }
    } catch (err: any) {
      showFeedback('Could Not Generate Receipt', err?.message ?? 'Something went wrong while creating the PDF.');
    } finally {
      setGeneratingReceiptFor(null);
    }
  };

  const fetchStaffList = async () => {
    setLoadingStaffList(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, mobile, role, created_at')
      .eq('role', 'staff')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching staff list:', error);
    } else {
      setStaffList((data as StaffRow[]) ?? []);
    }

    setLoadingStaffList(false);
  };

  // Updated useEffect: call fetchQueue, fetchStaffList, and subscribe to realtime
  useEffect(() => {
    fetchQueue(assignedShopId);
    fetchStaffList();

    const channel = createFreshChannel('reservation-changes');

    if (reservationSource) {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: reservationSource }, () => {
          fetchQueue(assignedShopId);
        })
        .subscribe();
    } else {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation' }, () => {
          fetchQueue(assignedShopId);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
          fetchQueue(assignedShopId);
        })
        .subscribe();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [assignedShopId, reservationSource]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (queueDrawerOpen) {
          setQueueDrawerOpen(false);
          return true;
        }

        setConfirm({
          visible: true,
          title: 'Exit App?',
          message: 'Are you sure you want to exit the app?',
          confirmLabel: 'Exit',
          destructive: true,
          onConfirm: () => {
            closeConfirm();
            BackHandler.exitApp();
          },
        });
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [queueDrawerOpen])
  );

  const handleLogout = () => {
    setConfirm({
      visible: true,
      title: 'Logout',
      message: 'Are you sure?',
      confirmLabel: 'Logout',
      destructive: true,
      onConfirm: async () => {
        closeConfirm();
        await supabase.auth.signOut();
        router.replace('/auth');
      },
    });
  };

  // OPEN / CLOSE Reservations modal (refresh queue before showing)
  const openReservations = async () => {
    await fetchQueue(assignedShopId);
    setReservationsOpen(true);
  };
  const closeReservations = () => setReservationsOpen(false);

  // OPEN / CLOSE the full-screen Customer Reservation view
  const openCustomerReservation = () => setCustomerReservationOpen(true);
  const closeCustomerReservation = () => setCustomerReservationOpen(false);

  // UPDATED counts: include Pending / For Payment / Upcoming in Waiting bucket
  const waitingCount = queue.filter((q) =>
    ['Pending', 'For Payment', 'Upcoming', 'Waiting'].includes(q.status)
  ).length;
  const washingCount = queue.filter((q) => q.status === 'Washing').length;
  const completedCount = queue.filter((q) => q.status === 'Completed').length;

  const payslipShare = staffList.length > 0 ? (payslipRevenue * STAFF_SHARE_PERCENT) / staffList.length : 0;
  const isPayslipPaid = !!payslipPayout;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileTouchable}
            onPress={() => setProfileDrawerOpen(true)}
            activeOpacity={0.8}
          >
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarInitial}>
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View>
              <Text style={styles.greeting}>Good day! </Text>
              <Text style={styles.name}>{profile?.full_name ?? 'Loading...'}</Text>
              <View style={styles.roleContainer}>
                <View style={styles.onlineDot} />
                <Text style={styles.role}>Staff</Text>
              </View>
              {!!assignedShopName && <Text style={styles.shopName}>{assignedShopName}</Text>}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBtn} onPress={() => setProfileDrawerOpen(true)}>
            <Ionicons name="person-circle-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Dashboard Overview</Text>
        <View style={styles.cardsGrid}>
          {[
            { icon: 'car-outline', label: 'Cars Today', value: String(queue.length), color: BLUE },
            { icon: 'time-outline', label: 'Waiting', value: String(waitingCount), color: '#F59E0B' },
            { icon: 'water-outline', label: 'Washing', value: String(washingCount), color: '#10B981' },
            { icon: 'checkmark-circle-outline', label: 'Completed', value: String(completedCount), color: '#10B981' },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon as any} size={26} color={s.color} style={styles.cardIcon} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* QUICK ACTIONS */}
        <Text style={styles.sectionTitle}> Quick Actions</Text>

        {/* ---------- REPLACED Quick Actions: include Reservations ---------- */}
        <View style={styles.cardsGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => { console.log('Reservations pressed'); openCustomerReservation(); }}>
            <View style={[styles.actionIconContainer, { backgroundColor: GOLD + '15' }]}>
              <Ionicons name="people-outline" size={24} color={GOLD} />
            </View>
            <Text style={styles.actionLabel}>Customer Reservations</Text>
          </TouchableOpacity>

          {/* keep existing action cards too so nothing disappears */}
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/staff/new-walkin')}>
            <View style={[styles.actionIconContainer, { backgroundColor: BLUE + '15' }]}>
              <Ionicons name="add-circle-outline" size={24} color={BLUE} />
            </View>
            <Text style={styles.actionLabel}>New Walk-in</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/staff/homeservice')}>
            <View style={[styles.actionIconContainer, { backgroundColor: BLUE_LIGHT + '15' }]}>
              <Ionicons name="home-outline" size={24} color={BLUE_LIGHT} />
            </View>
            <Text style={styles.actionLabel}>Home Service</Text>
          </TouchableOpacity>
        </View>
        {/* ----------------------------------------------------------------------- */}

        <TouchableOpacity style={styles.queueOpenBtn} onPress={() => setQueueDrawerOpen(true)}>
          <View style={styles.queueOpenLeft}>
            <Ionicons name="menu" size={20} color="#1E293B" />
            <Text style={styles.queueOpenText}>Current Queue</Text>
          </View>
          <View style={styles.queueCountBadge}>
            <Text style={styles.queueCountText}>{queue.length}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.queueOpenBtn, { marginTop: 10 }]}
          onPress={() => {
            setPayslipPeriod('daily');
            setPayslipOffset(0);
            setPayslipOpen(true);
          }}
        >
          <View style={styles.queueOpenLeft}>
            <Ionicons name="cash-outline" size={20} color="#1E293B" />
            <Text style={styles.queueOpenText}>My Payslip</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.queueOpenBtn, { marginTop: 10 }]} onPress={openHistory}>
          <View style={styles.queueOpenLeft}>
            <Ionicons name="receipt-outline" size={20} color="#1E293B" />
            <Text style={styles.queueOpenText}>Payment History</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* RESERVATIONS modal (your original modal kept intact) */}
      <Modal visible={reservationsOpen} animationType="slide" transparent onRequestClose={closeReservations}>
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Reservations</Text>
              <TouchableOpacity onPress={closeReservations}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {loadingQueue ? (
                <Text style={{ color: '#64748B' }}>Loading reservations...</Text>
              ) : queue.length === 0 ? (
                <Text style={{ color: '#64748B' }}>No reservations today{assignedShopName ? ` for ${assignedShopName}.` : '.'}</Text>
              ) : (
                queue.map((item) => {
                  // Determine payment and service info (with fallbacks)
                  const customerName =
                    (item as any).customer_name ??
                    (item as any).customers?.full_name ??
                    (item as any).profiles?.full_name ??
                    `Guest #${item.customer_id}`;
                  const serviceTier =
                    (item as any).service_tier ?? item.service_type ?? 'Service';
                  // Force GCash display when payment_method missing: user requested mode of payment "gcash"
                  const modeOfPayment = (item as any).payment_method ?? 'GCash';
                  const paidViaGcash = (item as any).payment_method === 'GCash' || item.status === 'Upcoming';
                  const awaitingGcash = item.status === 'For Payment';

                  return (
                    <View key={`${item.customer_id}-${item.created_at}`} style={styles.taskRow}>
                      <View style={styles.taskIconContainer}>
                        <Ionicons name="person-circle-outline" size={28} color="#4B5563" />
                      </View>

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        {/* Customer name */}
                        <Text style={styles.taskName}>{customerName}</Text>

                        {/* Service tier / type */}
                        <Text style={styles.taskDate}>
                          {serviceTier} {item.vehicle_type ? `· ${item.vehicle_type}` : ''}
                        </Text>

                        {/* Reservation date + shop */}
                        <Text style={styles.taskShop}>Reservation: {item.reservation_date}</Text>
                        {!!item.shop_id && <Text style={styles.taskShop}>Shop ID: {item.shop_id}</Text>}

                        {/* Price */}
                        {item.price != null && (
                          <Text style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                            Price: {formatPeso(item.price)}
                          </Text>
                        )}

                        {/* Mode of payment (show GCash when missing) */}
                        <Text style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                          Mode of Payment:{' '}
                          <Text style={{ color: '#16A34A', fontWeight: '700' }}>{modeOfPayment}</Text>
                        </Text>

                        {/* Current status */}
                        <Text style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                          Payment Status:{' '}
                          {paidViaGcash ? (
                            <Text style={{ color: '#16A34A', fontWeight: '700' }}>Paid (GCash)</Text>
                          ) : awaitingGcash ? (
                            <Text style={{ color: '#F59E0B', fontWeight: '700' }}>Awaiting GCash</Text>
                          ) : (
                            <Text style={{ color: '#64748B', fontWeight: '600' }}>{item.status}</Text>
                          )}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 8 }}>
                        <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '15' }]}>
                          <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                        </View>

                        {awaitingGcash && (
                          <TouchableOpacity style={[styles.actionBtnSmall, { backgroundColor: '#10B981' }]} onPress={() => handleConfirmGcash(item.customer_id)}>
                            <Text style={styles.actionBtnSmallText}>Confirm GCash</Text>
                          </TouchableOpacity>
                        )}

                        {paidViaGcash && (
                          <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '700' }}>GCash ✓</Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CURRENT QUEUE — bottom-sheet drawer (unchanged rendering) */}
      <Modal
        visible={queueDrawerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setQueueDrawerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Current Queue</Text>
              <TouchableOpacity onPress={() => setQueueDrawerOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {loadingQueue ? (
                <Text style={{ color: '#64748B' }}>Loading queue...</Text>
              ) : queue.length === 0 ? (
                <Text style={{ color: '#64748B' }}>
                  No reservations yet{assignedShopName ? ` for ${assignedShopName}.` : '.'}
                </Text>
              ) : (
                queue.map((item) => {
                  const currentPriceText =
                    priceInputs[item.customer_id] ??
                    (item.price != null && item.price !== 0 ? String(item.price) : '');
                  const isDirty = priceInputs[item.customer_id] !== undefined;

                  return (
                    <View key={`${item.customer_id}-${item.created_at}`} style={styles.taskRow}>
                      <View style={styles.taskIconContainer}>
                        <Ionicons name="car-sport-outline" size={24} color="#4B5563" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.taskName}>{item.vehicle_type || 'Vehicle'}</Text>
                        <Text style={styles.taskDate}>{item.service_type || 'No service yet'}</Text>
                        {!!item.shop_id && <Text style={styles.taskShop}>Shop ID: {item.shop_id}</Text>}

                        {/* Price input */}
                        <View style={styles.priceRow}>
                          <Text style={styles.priceLabel}>₱</Text>
                          <TextInput
                            style={styles.priceInput}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor="#94A3B8"
                            value={currentPriceText}
                            onChangeText={(text) =>
                              setPriceInputs((prev) => ({ ...prev, [item.customer_id]: text }))
                            }
                          />
                          {isDirty && (
                            <TouchableOpacity
                              style={styles.priceSaveBtn}
                              onPress={() => handleSavePrice(item.customer_id)}
                              disabled={savingPriceFor === item.customer_id}
                            >
                              <Text style={styles.priceSaveBtnText}>
                                {savingPriceFor === item.customer_id ? '...' : 'Save'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* RIGHT-SIDE ACTIONS: show buttons depending on status */}
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '15' }]}>
                          <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                        </View>

                        {/* Pending -> Accept / Deny */}
                        {item.status === 'Pending' && (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              style={[styles.actionBtnSmall, { backgroundColor: BLUE }]}
                              onPress={() => handleAcceptReservation(item.customer_id)}
                            >
                              <Text style={styles.actionBtnSmallText}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtnSmall, { backgroundColor: '#FEE2E2' }]}
                              onPress={() => handleDenyReservation(item.customer_id)}
                            >
                              <Text style={[styles.actionBtnSmallText, { color: ERROR }]}>Deny</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* For Payment -> Confirm GCash Received */}
                        {item.status === 'For Payment' && (
                          <TouchableOpacity
                            style={[styles.actionBtnSmall, { backgroundColor: '#10B981' }]}
                            onPress={() => handleConfirmGcash(item.customer_id)}
                          >
                            <Text style={styles.actionBtnSmallText}>Confirm GCash</Text>
                          </TouchableOpacity>
                        )}

                        {/* Upcoming -> Start Washing */}
                        {item.status === 'Upcoming' && (
                          <TouchableOpacity
                            style={[styles.actionBtnSmall, { backgroundColor: '#10B981' }]}
                            onPress={() => handleStartWashing(item.customer_id)}
                          >
                            <Text style={styles.actionBtnSmallText}>Start Washing</Text>
                          </TouchableOpacity>
                        )}

                        {/* Washing -> Mark Complete */}
                        {item.status === 'Washing' && (
                          <TouchableOpacity
                            style={[styles.actionBtnSmall, { backgroundColor: '#10B981' }]}
                            onPress={() => handleUpdateStatus(item.customer_id, 'Completed')}
                          >
                            <Text style={styles.actionBtnSmallText}>Mark Complete</Text>
                          </TouchableOpacity>
                        )}

                        {/* Denied */}
                        {item.status === 'Denied' && (
                          <Text style={{ fontSize: 12, color: '#DC2626', fontStyle: 'italic' }}>Reservation denied</Text>
                        )}

                        {/* Waiting fallback (bay detection) */}
                        {item.status === 'Waiting' && (
                          <Text style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>
                            Waiting for bay detection
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MY PAYSLIP MODAL (unchanged) */}
      <Modal
        visible={payslipOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPayslipOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>My Payslip</Text>
              <TouchableOpacity onPress={() => setPayslipOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <View style={styles.payslipTabs}>
              {(['daily', 'weekly', 'monthly'] as PayPeriod[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.payslipTab, payslipPeriod === p && styles.payslipTabActive]}
                  onPress={() => {
                    setPayslipPeriod(p);
                    setPayslipOffset(0);
                  }}
                >
                  <Text style={[styles.payslipTabText, payslipPeriod === p && styles.payslipTabTextActive]}>
                    {p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : 'Monthly'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.payslipRangeNav}>
              <TouchableOpacity onPress={() => setPayslipOffset((o) => o - 1)} style={styles.payslipNavBtn}>
                <Ionicons name="chevron-back" size={18} color="#1E293B" />
              </TouchableOpacity>
              <Text style={styles.payslipRangeLabel} numberOfLines={1}>
                {getPayPeriodRange(payslipPeriod, payslipOffset).label}
              </Text>
              <TouchableOpacity onPress={() => setPayslipOffset((o) => o + 1)} style={styles.payslipNavBtn}>
                <Ionicons name="chevron-forward" size={18} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {payslipLoading ? (
                <Text style={{ color: '#64748B', marginTop: 20 }}>Calculating...</Text>
              ) : (
                <>
                  {isPayslipPaid ? (
                    <View style={[styles.payslipHighlightCard, styles.payslipHighlightCardPaid]}>
                      <View style={styles.payslipPaidIconWrap}>
                        <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
                      </View>
                      <Text style={[styles.payslipHighlightLabel, { color: '#166534' }]}>Already Paid</Text>
                      <Text style={[styles.payslipHighlightValue, { color: '#166534' }]}>{formatPeso(payslipPayout!.amount)}</Text>
                      <Text style={[styles.payslipHighlightSub, { color: '#16A34A' }]}>
                        Paid {formatDateTime(payslipPayout!.paid_at)}
                        {payslipPayout!.paid_by_name ? ` by ${payslipPayout!.paid_by_name}` : ''}
                      </Text>
                      <TouchableOpacity
                        style={styles.receiptBtn}
                        onPress={() => handleDownloadReceipt(payslipPayout!)}
                        disabled={generatingReceiptFor === payslipPayout!.id}
                        activeOpacity={0.85}
                      >
                        {generatingReceiptFor === payslipPayout!.id ? (
                          <ActivityIndicator size="small" color="#16A34A" />
                        ) : (
                          <>
                            <Ionicons name="document-text-outline" size={14} color="#16A34A" />
                            <Text style={styles.receiptBtnText}>Download PDF Receipt</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.payslipHighlightCard}>
                      <Text style={styles.payslipHighlightLabel}>Your Share</Text>
                      <Text style={styles.payslipHighlightValue}>{formatPeso(payslipShare)}</Text>
                      <Text style={styles.payslipHighlightSub}>split equally among {staffList.length} staff</Text>
                    </View>
                  )}

                  {/* Breakdown */}
                  <View style={styles.payslipRow}>
                    <Text style={styles.payslipRowLabel}>Total Shop Revenue</Text>
                    <Text style={styles.payslipRowValue}>{formatPeso(payslipRevenue)}</Text>
                  </View>
                  <View style={styles.payslipRow}>
                    <Text style={styles.payslipRowLabel}>Staff Pool (40%)</Text>
                    <Text style={styles.payslipRowValue}>{formatPeso(payslipRevenue * STAFF_SHARE_PERCENT)}</Text>
                  </View>
                  <View style={styles.payslipRow}>
                    <Text style={styles.payslipRowLabel}>Number of Staff</Text>
                    <Text style={styles.payslipRowValue}>{staffList.length}</Text>
                  </View>
                  <View style={styles.payslipRow}>
                    <Text style={styles.payslipRowLabel}>Completed Jobs</Text>
                    <Text style={styles.payslipRowValue}>{payslipJobsCount}</Text>
                  </View>

                  {staffList.length === 0 && (
                    <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 12, fontStyle: 'italic' }}>
                      No staff accounts are registered yet, so the share cannot be computed.
                    </Text>
                  )}
                </>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* HISTORY, PROFILE DRAWER, CONFIRM & FEEDBACK (unchanged) */}
      <Modal
        visible={historyOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Payment History</Text>
              <TouchableOpacity onPress={() => setHistoryOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {historyLoading ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={NAVY} />
                </View>
              ) : historyPayouts.length === 0 ? (
                <Text style={{ color: '#64748B' }}>No payouts yet. Once the admin marks you as Paid, it will show up here.</Text>
              ) : (
                historyPayouts.map((p) => (
                  <View key={p.id} style={styles.historyRow}>
                    <View style={styles.historyIconWrap}>
                      <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyAmount}>{formatPeso(p.amount)}</Text>
                      <Text style={styles.historyMeta}>
                        {periodLabel(p.period_type)} · {p.period_start === p.period_end ? p.period_start : `${p.period_start} – ${p.period_end}`}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {formatDateTime(p.paid_at)}{p.paid_by_name ? ` · by ${p.paid_by_name}` : ''}
                      </Text>
                      <TouchableOpacity
                        style={styles.receiptBtnSmall}
                        onPress={() => handleDownloadReceipt(p)}
                        disabled={generatingReceiptFor === p.id}
                        activeOpacity={0.85}
                      >
                        {generatingReceiptFor === p.id ? (
                          <ActivityIndicator size="small" color={BLUE} />
                        ) : (
                          <>
                            <Ionicons name="document-text-outline" size={13} color={BLUE} />
                            <Text style={styles.receiptBtnSmallText}>PDF Receipt</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={profileDrawerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileDrawerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Profile</Text>
              <TouchableOpacity onPress={() => setProfileDrawerOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileCard}>
              <View style={styles.profileCardAvatar}>
                <Text style={styles.headerAvatarInitial}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <Text style={styles.profileCardName}>{profile?.full_name ?? 'Loading...'}</Text>
              <Text style={styles.profileCardRole}>Staff{assignedShopName ? ` · ${assignedShopName}` : ''}</Text>
            </View>

            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setProfileDrawerOpen(false);
                setPayslipPeriod('daily');
                setPayslipOffset(0);
                setPayslipOpen(true);
              }}
            >
              <Ionicons name="cash-outline" size={20} color="#334155" />
              <Text style={styles.profileMenuItemText}>My Payslip</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setProfileDrawerOpen(false);
                openHistory();
              }}
            >
              <Ionicons name="receipt-outline" size={20} color="#334155" />
              <Text style={styles.profileMenuItemText}>Payment History</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.profileMenuItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                setProfileDrawerOpen(false);
                handleLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
              <Text style={[styles.profileMenuItemText, { color: '#DC2626' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ConfirmModal state={confirm} onCancel={closeConfirm} />
      <FeedbackModal state={feedback} onClose={closeFeedback} />

      <CustomerReservation
        visible={customerReservationOpen}
        onClose={closeCustomerReservation}
        assignedShopId={assignedShopId}
        reservationSource={reservationSource}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  actionBtnSmall: {
    backgroundColor: BLUE,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnSmallText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    backgroundColor: NAVY,
    padding: 24,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  profileTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  profileBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  greeting: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  name: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  role: {
    color: BLUE_LIGHT,
    fontSize: 13,
    fontWeight: '600',
  },
  shopName: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: '48%',
    alignItems: 'flex-start',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIcon: {
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: '48%',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIconContainer: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  queueOpenBtn: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  queueOpenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  queueOpenText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  queueCountBadge: {
    backgroundColor: BLUE,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  queueCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 300,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  staffRow: {
    backgroundColor: '#fff',
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  staffAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  staffMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  staffPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  staffPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  taskRow: {
    backgroundColor: '#fff',
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  taskIconContainer: {
    backgroundColor: '#F1F5F9',
    padding: 8,
    borderRadius: 10,
  },
  taskName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  taskDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  taskShop: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  priceInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: '#1E293B',
    width: 80,
    backgroundColor: '#F8FAFC',
  },
  priceSaveBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 4,
  },
  priceSaveBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  payslipTabs: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  payslipTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  payslipTabActive: {
    backgroundColor: NAVY,
  },
  payslipTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4B5563',
  },
  payslipTabTextActive: {
    color: GOLD,
  },
  payslipRangeNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  payslipNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payslipRangeLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginHorizontal: 8,
  },
  payslipHighlightCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  payslipHighlightCardPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  payslipPaidIconWrap: {
    marginBottom: 4,
  },
  payslipHighlightLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  payslipHighlightValue: {
    fontSize: 30,
    fontWeight: '800',
    color: '#92400E',
    marginTop: 6,
  },
  payslipHighlightSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 4,
    textAlign: 'center',
  },
  payslipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  payslipRowLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  payslipRowValue: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700',
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  receiptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  historyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16A34A',
  },
  historyMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  receiptBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  receiptBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
  },

  profileCard: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  profileCardAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  profileCardName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  profileCardRole: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  profileMenuItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },

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
  confirmBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnGhost: {
    backgroundColor: '#F1F5F9',
  },
  confirmBtnGhostText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13.5,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
});
/* ---------------------------------------------------------------------------
   Below: CustomerReservation component included inline so this file is
   self-contained. I did NOT remove any of your original code — this is an
   addition. If you want the Reservations modal replaced (so it opens this
   full-screen component instead), tell me and I'll swap the modal body.
   --------------------------------------------------------------------------- */

function CustomerReservation({
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
  const [loading, setLoading] = useState(false);
  const [queueLocal, setQueueLocal] = useState<ReservationRow[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'onTheWay' | 'washing' | 'completed'>('upcoming');
  const [priceInputsLocal, setPriceInputsLocal] = useState<Record<number, string>>({});
  const [savingPriceForLocal, setSavingPriceForLocal] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const screenWidth = Dimensions.get('window').width;

  const fetchQueueLocal = async (shopId?: number | null) => {
    setLoading(true);
    setFetchError(null);
    const today = new Date().toISOString().split('T')[0];
    const tableCandidates = ['reservation', 'reservations'];
    const selectVariants = [
      'customer_id, shop_id, vehicle_type, service_type, service_tier, customer_name, status, created_at, reservation_date, price, payment_method, address, customer_phone, customers(full_name, mobile)',
      'customer_id, shop_id, vehicle_type, service_type, service_tier, customer_name, status, created_at, reservation_date, price, payment_method, address, customer_phone, profiles(full_name, mobile)',
      'customer_id, shop_id, vehicle_type, service_type, service_tier, customer_name, status, created_at, reservation_date, price, payment_method, address, customer_phone',
      'customer_id, shop_id, vehicle_type, service_type, status, created_at, reservation_date, price, payment_method, address, customer_phone',
      '*',
    ];

    let lastError: any = null;
    for (const table of tableCandidates) {
      for (const cols of selectVariants) {
        try {
          let query: any = supabase.from(table).select(cols).eq('reservation_date', today).order('created_at', { ascending: false });
          if (shopId) query = query.eq('shop_id', shopId);
          const { data, error } = await query;
          if (error) {
            lastError = error;
            continue;
          }
          setQueueLocal((data as ReservationRow[]) ?? []);
          setLoading(false);
          return;
        } catch (err: any) {
          lastError = err;
          continue;
        }
      }
    }

    setQueueLocal([]);
    setLoading(false);
    setFetchError(lastError?.message ? String(lastError.message) : 'Could not fetch reservations');
  };

  useEffect(() => {
    if (visible) fetchQueueLocal(assignedShopId);
  }, [visible, assignedShopId, reservationSource]);

  const updateStatusLocal = async (customerId: number, payload: Record<string, any>) => {
    const table = reservationSource || 'reservation';
    try {
      const { data, error } = await supabase.from(table).update(payload).eq('customer_id', customerId).select();
      if (error) {
        setFetchError(String(error.message ?? error));
        return false;
      }
      setQueueLocal((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, ...payload } : r)));
      return true;
    } catch (err: any) {
      setFetchError(String(err.message ?? err));
      return false;
    }
  };

  const handleSavePriceLocal = async (customerId: number) => {
    const raw = priceInputsLocal[customerId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const value = trimmed === '' ? 0 : parseFloat(trimmed);
    if (isNaN(value) || value < 0) {
      setFetchError('Invalid price value');
      return;
    }
    setSavingPriceForLocal(customerId);
    const table = reservationSource || 'reservation';
    const { data, error } = await supabase.from(table).update({ price: value }).eq('customer_id', customerId).select();
    setSavingPriceForLocal(null);
    if (error) {
      setFetchError(String(error.message ?? error));
      return;
    }
    setQueueLocal((prev) => prev.map((it) => (it.customer_id === customerId ? { ...it, price: value } : it)));
    setPriceInputsLocal((prev) => {
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
  };

  const filtered = queueLocal.filter((item) => {
    const status = item.status ?? '';
    if (tab === 'upcoming') return ['Pending', 'For Payment', 'Upcoming', 'Waiting'].includes(status);
    if (tab === 'onTheWay') return status === 'On the Way';
    if (tab === 'washing') return status === 'Washing';
    return status === 'Completed';
  });

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <View style={[styles.header, { paddingTop: 20 }]}>
          <TouchableOpacity onPress={onClose} style={{ width: 36 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingLeft: 8 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Customer Reservation</Text>
            <Text style={{ color: '#CBD5E1', fontSize: 12, marginTop: 2 }}>Manage scheduled wash bookings</Text>
          </View>
          <View style={{ width: 44, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => console.log('cr settings')}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="settings" size={18} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: 'row', padding: 12, backgroundColor: '#F8FAFC' }}>
          {[
            { key: 'upcoming', label: 'Waiting' },
            { key: 'onTheWay', label: 'On the Way' },
            { key: 'washing', label: 'Washing' },
            { key: 'completed', label: 'Completed' },
          ].map((t) => {
            const active = tab === (t.key as any);
            return (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key as any)} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[{ color: '#64748B', fontWeight: '700', fontSize: 14 }, active && { color: '#0F172A' }]}>{t.label}</Text>
                {active && <View style={{ height: 3, backgroundColor: '#2563EB', width: '70%', marginTop: 8, borderRadius: 3 }} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
          {fetchError ? (
            <View style={{ paddingVertical: 8 }}>
              <Text style={{ color: '#DC2626' }}>Error: {fetchError}</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0F172A" />
              <Text style={{ color: '#64748B', marginTop: 8 }}>Loading...</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ height: 260, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="car-outline" size={48} color="#94A3B8" />
              <Text style={{ marginTop: 12, color: '#64748B', fontSize: 16 }}>No services found</Text>
            </View>
          ) : (
            filtered.map((item) => {
              const name =
                (item as any).customer_name ??
                (item as any).customers?.full_name ??
                (item as any).profiles?.full_name ??
                `Guest #${item.customer_id ?? '—'}`;
              const phone =
                item.customer_phone ??
                (item as any).customers?.mobile ??
                (item as any).profiles?.mobile ??
                '';
              const addr = item.address ?? '';
              const serviceTier = item.service_tier ?? item.service_type ?? 'Service';
              const vehicle = item.vehicle_type ?? '';
              const modeOfPayment = (item as any).payment_method ?? 'GCash';
              const priceText = item.price != null ? formatPeso(item.price) : '—';
              const paid = !!item.payment_method || modeOfPayment === 'GCash' || item.status === 'Upcoming';

              let primaryLabel = '';
              let primaryAction: (() => void) | null = null;
              if (['Pending', 'For Payment', 'Upcoming', 'Waiting'].includes(item.status)) {
                primaryLabel = 'Confirm: On the Way';
                primaryAction = () => updateStatusLocal(item.customer_id!, { status: 'On the Way' });
              } else if (item.status === 'On the Way') {
                primaryLabel = 'Confirm: Start Washing';
                primaryAction = () => updateStatusLocal(item.customer_id!, { status: 'Washing' });
              } else if (item.status === 'Washing') {
                primaryLabel = 'Mark Complete';
                primaryAction = () => updateStatusLocal(item.customer_id!, { status: 'Completed' });
              }

              const currentPriceText = priceInputsLocal[item.customer_id!] ?? (item.price != null && item.price !== 0 ? String(item.price) : '');

              return (
                <View key={`${item.customer_id}-${item.created_at ?? Math.random()}`} style={[styles.taskRow, { backgroundColor: '#fff', borderRadius: 14 }]}>
                  <View style={styles.taskIconContainer}>
                    <Ionicons name="person" size={20} color="#fff" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>{name}</Text>
                    {!!phone && <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{phone}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>{item.created_at ? new Date(item.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : ''}</Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8' }}>{item.reservation_date ?? ''}</Text>
                  </View>

                  {!!addr && <Text style={{ color: '#475569', marginTop: 6, lineHeight: 18 }}>{addr}</Text>}

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="car-outline" size={16} color="#475569" />
                      <Text style={{ marginLeft: 8, color: '#475569' }}>{vehicle ? `${vehicle} · ` : ''}{serviceTier}</Text>
                    </View>
                    <View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: statusColor(item.status) + '15' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor(item.status) }}>{item.status}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="card-outline" size={16} color="#475569" />
                      <Text style={{ marginLeft: 8, color: '#475569' }}>{modeOfPayment}{item.price != null ? ` · ${priceText}` : ''}</Text>
                    </View>
                    <View>
                      <View style={paid ? { backgroundColor: '#ECFDF5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#BBF7D0' } : { backgroundColor: '#FFFBEB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
                        <Text style={paid ? { color: '#16A34A', fontWeight: '700' } : { color: '#92400E', fontWeight: '700' }}>{paid ? 'Paid' : 'Unpaid'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Price input */}
                  <View style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>₱</Text>
                      <TextInput
                        style={[styles.priceInput, { width: 90, marginLeft: 8, backgroundColor: '#F8FAFC' }]}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#94A3B8"
                        value={currentPriceText}
                        onChangeText={(text) => setPriceInputsLocal((prev) => ({ ...prev, [item.customer_id!]: text }))}
                      />
                      {!!(priceInputsLocal[item.customer_id!]) && (
                        <TouchableOpacity style={{ backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 8 }} onPress={() => handleSavePriceLocal(item.customer_id!)} disabled={savingPriceForLocal === item.customer_id}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>{savingPriceForLocal === item.customer_id ? '...' : 'Save'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {primaryAction && (
                    <TouchableOpacity style={{ marginTop: 14, backgroundColor: '#2563EB', paddingVertical: 14, borderRadius: 10, alignItems: 'center' }} onPress={primaryAction}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{primaryLabel}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 48 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
