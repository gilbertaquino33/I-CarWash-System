import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface ReservationRow {
  customer_id: number;
  shop_id: number;
  vehicle_type: string;
  service_type: string;
  status: string;
  created_at: string;
  reservation_date: string;
  price: number | null;
}

interface WalkinRow {
  id: number;
  reservation_id: number;
  shop_id: number;
  shop_name: string | null;
  vehicle_type: string | null;
  service_type: string | null;
  bay_name: string | null;
  price: number | null;
  service_timer: string | null;
  reservation_date: string | null;
  completed_at: string;
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

const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#60A5FA';
const ERROR = '#DC2626';
const GOLD = '#F59E0B';

// ─────────────────────────────────────────────────────────────
//  FIX: dating "avatars" ang bucket name na ginagamit sa code,
//  pero ang aktwal na bucket sa Supabase Storage ay "Staff Profile"
//  (tingnan sa dashboard: Storage > Files > Buckets). Kaya lagi
//  "Bucket not found" ang error tuwing mag-uupload ng photo.
//  Ginawa itong constant para isang lugar na lang babaguhin kung
//  sakaling i-rename ang bucket sa hinaharap.
// ─────────────────────────────────────────────────────────────
const AVATAR_BUCKET = 'Staff Profile';

const STAFF_SHARE_PERCENT = 0.4;

type PayPeriod = 'daily' | 'weekly' | 'monthly';

const formatPeso = (amount: number) => {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

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
    payout.period_start === payout.period_end
      ? payout.period_start
      : `${payout.period_start} – ${payout.period_end}`;

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

// Helper: decode a base64 string into a Uint8Array. Pure JS implementation
// (walang Buffer/atob dependency) para hindi kailangan ng @types/node at
// gumana consistently sa React Native / Hermes.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '=') break;
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue;

    buffer = (buffer << 6) | value;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }

  return new Uint8Array(bytes);
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
  type: 'success' | 'error';
}

const initialFeedback: FeedbackState = { visible: false, title: '', message: '', type: 'error' };

function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: state.destructive ? '#FEE2E2' : '#DBEAFE' }]}>
            <Ionicons
              name={state.destructive ? 'alert-circle' : 'help-circle'}
              size={28}
              color={state.destructive ? ERROR : BLUE}
            />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={[styles.confirmBtn, styles.confirmBtnGhost]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.confirmBtnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: state.destructive ? ERROR : BLUE }]}
              onPress={state.onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>{state.confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FeedbackModal({ state, onClose }: { state: FeedbackState; onClose: () => void }) {
  
  const isSuccess = state.type === 'success';
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View
            style={[
              styles.confirmIconWrap,
              { backgroundColor: isSuccess ? '#DCFCE7' : '#FEE2E2' },
            ]}
          >
            <Ionicons
              name={isSuccess ? 'checkmark-circle' : 'close-circle'}
              size={28}
              color={isSuccess ? '#16A34A' : ERROR}
            />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: isSuccess ? '#16A34A' : BLUE, width: '100%' }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Dynamic Banner Slides
const PROMO_SLIDES = [
  {
    id: '1',
    label: 'STAFF BULLETIN',
    title: 'Active Operations',
    color: '#111827',
    accentColor: '#F5C518',
    items: [
      { icon: 'car-outline', text: 'Monitor incoming vehicles' },
      { icon: 'people-outline', text: 'Queue updates in real-time' },
    ],
  },
  {
    id: '2',
    label: 'SERVICE PROMO',
    title: 'Full Wash ₱199',
    color: '#1E3A5F',
    accentColor: '#60A5FA',
    items: [
      { icon: 'water-outline', text: 'Exterior + Interior Vacuum' },
      { icon: 'star-outline', text: 'Promote to walk-in customers' },
    ],
  },
  {
    id: '3',
    label: 'ADD-ON SERVICE',
    title: 'Engine Degreasing',
    color: '#3B1F6A',
    accentColor: '#C084FC',
    items: [
      { icon: 'build-outline', text: 'Deep cleaning engine bay' },
      { icon: 'pricetag-outline', text: 'Standard price ₱350' },
    ],
  },
];

export default function StaffDashboard() {
  const { width } = useWindowDimensions();
  const CARD_WIDTH = width - 32;
  const DRAWER_WIDTH = width * 0.8;

  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [assignedShopId, setAssignedShopId] = useState<number | null>(null);
  const [assignedShopName, setAssignedShopName] = useState('');

  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [queue, setQueue] = useState<ReservationRow[]>([]);
  const [walkinQueue, setWalkinQueue] = useState<WalkinRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Drawer Visible States
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [payslipOpen, setPayslipOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Animated Values for Horizontal Drawer Slide from Right
  const menuAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const queueAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const profileAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const overlayFadeAnim = useRef(new Animated.Value(0)).current;

  // Confirm and Feedback Modals
  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string, type: 'success' | 'error' = 'error') =>
    setFeedback({ visible: true, title, message, type });

  // Price modification states
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const [savingPriceFor, setSavingPriceFor] = useState<number | null>(null);

  const [homeServiceEarningsToday, setHomeServiceEarningsToday] = useState(0);

  // Payslip & History states
  const [payslipPeriod, setPayslipPeriod] = useState<PayPeriod>('daily');
  const [payslipOffset, setPayslipOffset] = useState(0);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [payslipRevenue, setPayslipRevenue] = useState(0);
  const [payslipJobsCount, setPayslipJobsCount] = useState(0);
  const [payslipPayout, setPayslipPayout] = useState<PayoutRow | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPayouts, setHistoryPayouts] = useState<PayoutRow[]>([]);
  const [generatingReceiptFor, setGeneratingReceiptFor] = useState<string | null>(null);

  // Smooth Drawer Animators
  const animateDrawer = (animVar: Animated.Value, toValue: number, callback?: () => void) => {
    Animated.parallel([
      Animated.timing(animVar, {
        toValue,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayFadeAnim, {
        toValue: toValue === 0 ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (callback) callback();
    });
  };

  const openMenu = () => {
    setMenuDrawerOpen(true);
    animateDrawer(menuAnim, 0);
  };

  const closeMenu = (callback?: () => void) => {
    animateDrawer(menuAnim, DRAWER_WIDTH, () => {
      setMenuDrawerOpen(false);
      if (callback) callback();
    });
  };

  const openQueue = () => {
    setQueueDrawerOpen(true);
    animateDrawer(queueAnim, 0);
  };

  const closeQueue = () => {
    animateDrawer(queueAnim, DRAWER_WIDTH, () => {
      setQueueDrawerOpen(false);
    });
  };

  const openProfile = () => {
    setProfileDrawerOpen(true);
    animateDrawer(profileAnim, 0);
  };

  const closeProfile = (callback?: () => void) => {
    animateDrawer(profileAnim, DRAWER_WIDTH, () => {
      setProfileDrawerOpen(false);
      if (callback) callback();
    });
  };

  // Carousel Auto Scroll
  useEffect(() => {
    autoScrollTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % PROMO_SLIDES.length;
        scrollRef.current?.scrollTo({ x: next * CARD_WIDTH, animated: true });
        return next;
      });
    }, 3000);

    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [CARD_WIDTH]);

  const handleScrollEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    setActiveIndex(index);
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
  };

  // Auth & Profile Check
  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (isMounted) router.replace('/auth');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role, shop_id, avatar_url, mobile')
        .eq('id', session.user.id)
        .single();

      if (!data || data.role !== 'staff') {
        await supabase.auth.signOut();
        if (isMounted) router.replace('/auth');
        return;
      }

      if (isMounted) {
        setProfile(data);
        setStaffId(session.user.id);
        setAssignedShopId(data.shop_id ? Number(data.shop_id) : null);
        setAvatarUrl(data.avatar_url ?? null);
        setEditName(data.full_name ?? '');
        setEditMobile(data.mobile ?? '');

        if (data.shop_id) {
          const { data: shopData } = await supabase
            .from('shop_profile_setup')
            .select('shop_name')
            .eq('id', data.shop_id)
            .single();
          setAssignedShopName(shopData?.shop_name ?? '');
        }
      }
    };

    checkAuth();
    return () => { isMounted = false; };
  }, []);

  // ─────────────────────────────────────────────────────────────
  //  FIX: hindi na kukuha ng data kung walang shopId (hindi na
  //  mag-fetch ng LAHAT ng reservations/walk-ins sa buong system).
  //  Dati, kapag "shopId" ay null/undefined, wala talagang .eq()
  //  filter na naitatapon sa query, kaya nakukuha lahat ng shops.
  // ─────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async (shopId?: number | null) => {
    if (!shopId) {
      setQueue([]);
      setWalkinQueue([]);
      setLoadingQueue(false);
      return;
    }

    setLoadingQueue(true);
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
      .from('reservation')
      .select('customer_id, shop_id, vehicle_type, service_type, status, created_at, reservation_date, price')
      .eq('reservation_date', today)
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    setQueue(data ?? []);

    const { data: walkinData } = await supabase
      .from('walkin_transactions')
      .select('*')
      .eq('reservation_date', today)
      .eq('shop_id', shopId)
      .order('completed_at', { ascending: false });
    setWalkinQueue(walkinData ?? []);

    setLoadingQueue(false);
  }, []);

  const fetchHomeServiceEarningsToday = useCallback(async (shopId: number | null) => {
    if (!shopId) {
      setHomeServiceEarningsToday(0);
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const startOfTodayIso = `${todayStr}T00:00:00.000Z`;
    const startOfTomorrowIso = new Date(new Date(startOfTodayIso).getTime() + 86400000).toISOString();

    const { data } = await supabase
      .from('home_service')
      .select('price, payment_status, status, paid_at')
      .eq('shop_id', shopId)
      .eq('status', 'Completed')
      .ilike('payment_status', 'paid')
      .gte('paid_at', startOfTodayIso)
      .lt('paid_at', startOfTomorrowIso)
      .not('price', 'is', null);

    const total = (data ?? []).reduce((sum: number, row: any) => sum + (row.price ?? 0), 0);
    setHomeServiceEarningsToday(total);
  }, []);

  // ─────────────────────────────────────────────────────────────
  //  FIX: pinaka-ROOT CAUSE ng bug -- dati walang .eq('shop_id', ...)
  //  filter dito, kaya kinukuha LAHAT ng staff sa BUONG system
  //  (lahat ng shops), hindi lang yung staff ng sariling shop.
  //  Ito rin ang dahilan kung bakit mali ang "Estimated Share"
  //  computation sa Payslip modal (staffList.length ay dating
  //  bilang ng lahat ng staff, hindi lang ng sariling shop).
  // ─────────────────────────────────────────────────────────────
  const fetchStaffList = useCallback(async (shopId?: number | null) => {
    if (!shopId) {
      setStaffList([]);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, mobile, role, created_at')
      .eq('role', 'staff')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    setStaffList((data as StaffRow[]) ?? []);
  }, []);

  useEffect(() => {
    fetchQueue(assignedShopId);
    fetchStaffList(assignedShopId);

    const channel = createFreshChannel('staff-queue-and-walkin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation' }, () => fetchQueue(assignedShopId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkin_transactions' }, () => fetchQueue(assignedShopId))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [assignedShopId, fetchQueue, fetchStaffList]);

  useEffect(() => {
    fetchHomeServiceEarningsToday(assignedShopId);
    const channel = createFreshChannel('staff-home-service')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_service' }, () => fetchHomeServiceEarningsToday(assignedShopId))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [assignedShopId, fetchHomeServiceEarningsToday]);

  // Live-update ng staff roster kapag may bagong staff na nag-register
  // o may lumipat ng shop -- dinagdag dahil "profiles" table ay hindi
  // pa dating na-subscribe sa realtime.
  useEffect(() => {
    if (!assignedShopId) return;
    const channel = createFreshChannel('staff-roster-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchStaffList(assignedShopId))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [assignedShopId, fetchStaffList]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (isActive) {
        fetchQueue(assignedShopId);
        fetchHomeServiceEarningsToday(assignedShopId);
        fetchStaffList(assignedShopId);
      }

      // ─────────────────────────────────────────────────────────
      //  FIX: dati hindi kasama ang editProfileOpen / payslipOpen /
      //  historyOpen sa back-button handling, kaya pag naka-open
      //  ang mga modal na iyon at pinindot ang back (o ang "X" sa
      //  itaas), tumutuloy pa rin ito sa "Exit App?" confirm dialog
      //  imbes na isara lang ang modal -- kaya mukhang sira/"ekis"
      //  ang behavior. Idinagdag dito para tama na ang pagsara.
      // ─────────────────────────────────────────────────────────
      const onBackPress = () => {
        if (editProfileOpen) {
          setEditProfileOpen(false);
          return true;
        }
        if (historyOpen) {
          setHistoryOpen(false);
          return true;
        }
        if (payslipOpen) {
          setPayslipOpen(false);
          return true;
        }
        if (queueDrawerOpen) {
          closeQueue();
          return true;
        }
        if (profileDrawerOpen) {
          closeProfile();
          return true;
        }
        if (menuDrawerOpen) {
          closeMenu();
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
      return () => {
        isActive = false;
        subscription.remove();
      };
    }, [
      assignedShopId,
      fetchQueue,
      fetchHomeServiceEarningsToday,
      fetchStaffList,
      queueDrawerOpen,
      profileDrawerOpen,
      menuDrawerOpen,
      editProfileOpen,
      payslipOpen,
      historyOpen,
    ])
  );

  const handleUpdateStatus = async (customerId: number, newStatus: string) => {
    const { data, error } = await supabase
      .from('reservation')
      .update({ status: newStatus })
      .eq('customer_id', customerId)
      .select();

    if (error) {
      showFeedback('Update Failed', error.message);
      return;
    }

    if (!data || data.length === 0) {
      showFeedback('Status Not Saved', 'Nothing was updated in the database. Check database RLS permissions.');
      return;
    }

    setQueue((prev) =>
      prev.map((item) => (item.customer_id === customerId ? { ...item, status: newStatus } : item))
    );
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
    const { data, error } = await supabase
      .from('reservation')
      .update({ price: value })
      .eq('customer_id', customerId)
      .select();
    setSavingPriceFor(null);

    if (error || !data || data.length === 0) {
      showFeedback('Price Not Saved', error?.message ?? 'Could not save price. RLS might be restricting updates.');
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

    let query = supabase
      .from('reservation')
      .select('price')
      .eq('status', 'Completed')
      .gte('reservation_date', range.start)
      .lte('reservation_date', range.end);

    if (assignedShopId) query = query.eq('shop_id', assignedShopId);
    const { data, error } = await query;

    if (!error) {
      const rows = data ?? [];
      setPayslipRevenue(rows.reduce((sum: number, r: any) => sum + (r.price ?? 0), 0));
      setPayslipJobsCount(rows.length);
    }

    if (staffId) {
      const { data: payoutData } = await supabase
        .from('payroll_payouts')
        .select('*')
        .eq('staff_id', staffId)
        .eq('period_type', payslipPeriod)
        .eq('period_start', range.start)
        .eq('period_end', range.end)
        .maybeSingle();

      setPayslipPayout((payoutData as PayoutRow) ?? null);
    }
    setPayslipLoading(false);
  }, [payslipPeriod, payslipOffset, assignedShopId, staffId]);

  useEffect(() => {
    if (payslipOpen) fetchPayslip();
  }, [payslipOpen, fetchPayslip]);

  const openHistoryModal = async () => {
    setHistoryOpen(true);
    if (!staffId) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from('payroll_payouts')
      .select('*')
      .eq('staff_id', staffId)
      .order('paid_at', { ascending: false })
      .limit(100);

    setHistoryPayouts((data as PayoutRow[]) ?? []);
    setHistoryLoading(false);
  };

  const handleDownloadReceipt = async (payout: PayoutRow) => {
    setGeneratingReceiptFor(payout.id);
    try {
      const html = buildReceiptHtml(payout, assignedShopName);
      const { base64 } = await Print.printToFileAsync({ html, base64: true });

      if (!base64) {
        throw new Error('Failed to generate PDF content.');
      }

      const safeFileName = `receipt-${payout.staff_name.replace(/[^a-zA-Z0-9]/g, '_')}-${payout.id}.pdf`;
      const destinationUri = `${FileSystem.cacheDirectory}${safeFileName}`;

      const existingFileInfo = await FileSystem.getInfoAsync(destinationUri);
      if (existingFileInfo.exists) {
        await FileSystem.deleteAsync(destinationUri, { idempotent: true });
      }

      await FileSystem.writeAsStringAsync(destinationUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(destinationUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Payroll Receipt',
          UTI: 'com.adobe.pdf',
        });
      } else {
        showFeedback('Receipt Ready', `Saved to: ${destinationUri}`, 'success');
      }
    } catch (err: any) {
      showFeedback('Could Not Generate Receipt', err?.message ?? 'Failed to create PDF.');
    } finally {
      setGeneratingReceiptFor(null);
    }
  };

  // Pumili ng photo mula sa gallery at i-upload sa Supabase Storage
  // (bucket: "Staff Profile" -- dapat tugma sa aktwal na pangalan ng
  // bucket sa Supabase Dashboard), tapos i-save ang public URL sa
  // profiles.avatar_url
  const pickAndUploadAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showFeedback('Permission Needed', 'Please allow photo library access to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    const pickedAsset = result.assets?.[0];
    const base64Data = pickedAsset?.base64;
    if (result.canceled || !pickedAsset || !base64Data || !staffId) return;

    setUploadingAvatar(true);
    try {
      const asset = pickedAsset;
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${staffId}/avatar.${ext}`;

      const arrayBuffer = decodeBase64(base64Data);

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, arrayBuffer, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      const newUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`; // cache-bust

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newUrl })
        .eq('id', staffId);

      if (updateError) throw updateError;

      setAvatarUrl(newUrl);
      showFeedback('Photo Updated', 'Your profile picture has been updated.', 'success');
    } catch (err: any) {
      showFeedback('Upload Failed', err?.message ?? 'Could not upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!staffId) return;
    if (!editName.trim()) {
      showFeedback('Name Required', 'Please enter your full name.');
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: editName.trim(), mobile: editMobile.trim() })
        .eq('id', staffId);

      if (error) {
        showFeedback('Update Failed', error.message);
        return;
      }

      setProfile((prev) => (prev ? { ...prev, full_name: editName.trim() } : prev));
      setEditProfileOpen(false);
      showFeedback('Profile Updated', 'Your details have been saved.', 'success');
    } catch (err: any) {
      
      
      showFeedback('Update Failed', err?.message ?? 'Could not save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = () => {
    setConfirm({
      visible: true,
      title: 'Logout Confirmation',
      message: 'Are you sure you want to log out of your account?',
      confirmLabel: 'Logout',
      destructive: true,
      onConfirm: async () => {
        closeConfirm();
        await supabase.auth.signOut();
        router.replace('/auth');
      },
    });
  };

  const waitingCount = queue.filter((q) => q.status === 'Waiting').length;
  const washingCount = queue.filter((q) => q.status === 'Washing').length;
  const completedCount = queue.filter((q) => q.status === 'Completed').length;

  const reservationEarningsToday = queue
    .filter((q) => q.status === 'Completed')
    .reduce((sum, q) => sum + (q.price ?? 0), 0);
  const walkinEarningsToday = walkinQueue.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const todayEarnings = reservationEarningsToday + homeServiceEarningsToday + walkinEarningsToday;

  const payslipShare = staffList.length > 0 ? (payslipRevenue * STAFF_SHARE_PERCENT) / staffList.length : 0;
  const isPayslipPaid = !!payslipPayout;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileTouchable}
            onPress={openProfile}
            activeOpacity={0.8}
          >
            <View style={styles.headerAvatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.headerAvatarImg} />
              ) : (
                <Text style={styles.headerAvatarInitial}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Good Morning,</Text>
              <Text style={styles.name}>{profile?.full_name ?? 'Staff User'}</Text>
              <View style={styles.roleContainer}>
                <View style={styles.onlineDot} />
                <Text style={styles.role}>Service Staff</Text>
              </View>
              <Text style={styles.shopName} numberOfLines={1}>
                {assignedShopName || 'Assigned Branch'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* BURGER MENU BUTTON */}
          <TouchableOpacity
            style={styles.burgerBtn}
            onPress={openMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="menu-outline" size={26} color="#fff" />
            {queue.length > 0 && <View style={styles.burgerBadgeDot} />}
          </TouchableOpacity>
        </View>

        {/* NO SHOP ASSIGNED WARNING */}
        {!assignedShopId && (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <View style={[styles.statusBanner, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
              <Text style={[styles.statusBannerText, { color: '#B45309' }]}>
                No shop assigned yet. Contact your admin or re-login.
              </Text>
            </View>
          </View>
        )}

        {/* STATUS BANNER */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <View style={[styles.statusBanner, styles.statusBannerOpen]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#22C55E" />
            <Text style={[styles.statusBannerText, { color: '#22C55E' }]}>
              STAFF ACTIVE • {waitingCount} Vehicles Waiting in Line
            </Text>
          </View>
        </View>

        {/* PROMO CAROUSEL */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          snapToInterval={CARD_WIDTH}
          decelerationRate="fast"
          style={{ paddingHorizontal: 16, marginBottom: 12 }}
        >
          {PROMO_SLIDES.map((slide) => (
            <View key={slide.id} style={[styles.banner, { backgroundColor: slide.color, width: CARD_WIDTH }]}>
              <Text style={[styles.bannerLabel, { color: slide.accentColor }]}>{slide.label}</Text>
              <Text style={styles.bannerTitle}>{slide.title}</Text>
              <View style={styles.bannerItems}>
                {slide.items.map((item, i) => (
                  <View key={i} style={styles.bannerItem}>
                    <View style={[styles.bannerIconBox, { backgroundColor: slide.accentColor + '25' }]}>
                      <Ionicons name={item.icon as any} size={20} color={slide.accentColor} />
                    </View>
                    <Text style={styles.bannerItemText}>{item.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dotsRow}>
          {PROMO_SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === activeIndex ? '#111827' : '#CBD5E1' }]} />
          ))}
        </View>

        {/* DASHBOARD OVERVIEW */}
        <Text style={styles.sectionTitle}>Dashboard Overview</Text>

        <View style={styles.cardsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="car-outline" size={26} color={BLUE} style={styles.cardIcon} />
            <Text style={styles.statValue}>{queue.length}</Text>
            <Text style={styles.statLabel}>Cars Today</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={26} color="#F59E0B" style={styles.cardIcon} />
            <Text style={styles.statValue}>{waitingCount}</Text>
            <Text style={styles.statLabel}>Waiting Queue</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="water-outline" size={26} color={BLUE_LIGHT} style={styles.cardIcon} />
            <Text style={styles.statValue}>{washingCount}</Text>
            <Text style={styles.statLabel}>Currently Washing</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle-outline" size={26} color="#10B981" style={styles.cardIcon} />
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statLabel}>Completed Today</Text>
          </View>
        </View>

        {/* TODAY'S EARNINGS CARD */}
        <View style={styles.earningsCard}>
          <View style={styles.earningsCardLeft}>
            <View style={styles.earningsIconWrap}>
              <Ionicons name="cash-outline" size={22} color="#16A34A" />
            </View>

            <View style={{ flexShrink: 1, width: '100%' }}>
              <Text style={styles.earningsLabel}>Today's Earnings Summary</Text>

              <View style={styles.breakdownContainer}>
                <View style={styles.earningsRow}>
                  <Text style={styles.earningsSubLabel}>Reservations</Text>
                  <Text style={styles.earningsSubValue}>{formatPeso(reservationEarningsToday)}</Text>
                </View>

                <View style={styles.earningsRow}>
                  <Text style={styles.earningsSubLabel}>Home Service</Text>
                  <Text style={styles.earningsSubValue}>{formatPeso(homeServiceEarningsToday)}</Text>
                </View>

                <View style={styles.earningsRow}>
                  <Text style={styles.earningsSubLabel}>Walk-ins</Text>
                  <Text style={styles.earningsSubValue}>{formatPeso(walkinEarningsToday)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.totalDivider} />

          <View style={styles.earningsRow}>
            <Text style={styles.earningsTotalLabel}>Total Cash Collected</Text>
            <Text style={styles.earningsValue}>{formatPeso(todayEarnings)}</Text>
          </View>
        </View>

        {/* QUICK ACTIONS & CATEGORIES */}
        <Text style={styles.sectionTitle}>Categories & Actions</Text>

        <View style={styles.cardsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/staff/new-walkin' as any)}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: BLUE + '15' }]}>
              <Ionicons name="add-circle-outline" size={24} color={BLUE} />
            </View>
            <Text style={styles.actionLabel}>New Walk-in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/staff/homeservice' as any)}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: BLUE_LIGHT + '15' }]}>
              <Ionicons name="home-outline" size={24} color={BLUE_LIGHT} />
            </View>
            <Text style={styles.actionLabel}>Home Service</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { width: '100%' }]}
            onPress={() => {
              setPayslipPeriod('daily');
              setPayslipOffset(0);
              setPayslipOpen(true);
            }}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#F59E0B15' }]}>
              <Ionicons name="cash-outline" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.actionLabel}>View My Payslip & Commissions</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* BURGER MENU DRAWER */}
      <Modal
        visible={menuDrawerOpen}
        animationType="none"
        transparent
        onRequestClose={() => closeMenu()}
      >
        <View style={styles.drawerOverlay}>
          <Animated.View style={[styles.drawerBackdrop, { opacity: overlayFadeAnim }]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeMenu()} />
          </Animated.View>

          <Animated.View
            style={[
              styles.rightDrawerContainer,
              { width: DRAWER_WIDTH, transform: [{ translateX: menuAnim }] },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Navigation Menu</Text>
              <TouchableOpacity onPress={() => closeMenu()}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.drawerMenuItem}
              onPress={() => {
                closeMenu(() => openQueue());
              }}
            >
              <View style={styles.drawerMenuIconBox}>
                <Ionicons name="list-outline" size={20} color={BLUE} />
              </View>
              <Text style={styles.drawerMenuText}>Current Queue</Text>
              <View style={styles.drawerCountBadge}>
                <Text style={styles.drawerCountText}>{queue.length}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.drawerMenuItem}
              onPress={() => {
                closeMenu(() => {
                  setPayslipPeriod('daily');
                  setPayslipOffset(0);
                  setPayslipOpen(true);
                });
              }}
            >
              <View style={[styles.drawerMenuIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="cash-outline" size={20} color="#D97706" />
              </View>
              <Text style={styles.drawerMenuText}>My Payslip</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.drawerMenuItem}
              onPress={() => {
                closeMenu(() => openHistoryModal());
              }}
            >
              <View style={[styles.drawerMenuIconBox, { backgroundColor: '#E0E7FF' }]}>
                <Ionicons name="receipt-outline" size={20} color="#4338CA" />
              </View>
              <Text style={styles.drawerMenuText}>Payment History</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.drawerMenuItem}
              onPress={() => {
                closeMenu(() => openProfile());
              }}
            >
              <View style={[styles.drawerMenuIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="person-outline" size={20} color="#16A34A" />
              </View>
              <Text style={styles.drawerMenuText}>Staff Profile</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.drawerMenuItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                closeMenu(() => handleLogout());
              }}
            >
              <View style={[styles.drawerMenuIconBox, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={20} color={ERROR} />
              </View>
              <Text style={[styles.drawerMenuText, { color: ERROR }]}>Logout</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* LIVE QUEUE DRAWER */}
      <Modal
        visible={queueDrawerOpen}
        animationType="none"
        transparent
        onRequestClose={() => closeQueue()}
      >
        <View style={styles.drawerOverlay}>
          <Animated.View style={[styles.drawerBackdrop, { opacity: overlayFadeAnim }]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeQueue()} />
          </Animated.View>

          <Animated.View
            style={[
              styles.rightDrawerContainer,
              { width: DRAWER_WIDTH, transform: [{ translateX: queueAnim }] },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Live Queue Management</Text>
              <TouchableOpacity onPress={() => closeQueue()}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {loadingQueue ? (
                <Text style={{ color: '#64748B' }}>Loading queue list...</Text>
              ) : queue.length === 0 ? (
                <Text style={{ color: '#64748B' }}>No queued reservations for today.</Text>
              ) : (
                queue.map((item) => {
                  const currentPriceText =
                    priceInputs[item.customer_id] ??
                    (item.price != null && item.price !== 0 ? String(item.price) : '');
                  const isDirty = priceInputs[item.customer_id] !== undefined;

                  return (
                    <View key={`${item.customer_id}-${item.created_at}`} style={styles.reservationCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reservationTitle}>{item.vehicle_type || 'Vehicle'}</Text>
                        <Text style={styles.reservationMeta}>{item.service_type || 'General Wash'}</Text>

                        {/* PRICE EDIT FIELD */}
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

                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View
                          style={[
                            styles.reservationBadge,
                            {
                              backgroundColor:
                                item.status === 'Completed'
                                  ? '#DCFCE7'
                                  : item.status === 'Washing'
                                  ? '#DBEAFE'
                                  : '#FEF3C7',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.reservationBadgeText,
                              {
                                color:
                                  item.status === 'Completed'
                                    ? '#16A34A'
                                    : item.status === 'Washing'
                                    ? '#2563EB'
                                    : '#D97706',
                              },
                            ]}
                          >
                            {item.status}
                          </Text>
                        </View>

                        {item.status === 'Washing' && (
                          <TouchableOpacity
                            style={styles.actionBtnSmall}
                            onPress={() => handleUpdateStatus(item.customer_id, 'Completed')}
                          >
                            <Text style={styles.actionBtnSmallText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* STAFF PROFILE DRAWER */}
      <Modal
        visible={profileDrawerOpen}
        animationType="none"
        transparent
        onRequestClose={() => closeProfile()}
      >
        <View style={styles.drawerOverlay}>
          <Animated.View style={[styles.drawerBackdrop, { opacity: overlayFadeAnim }]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeProfile()} />
          </Animated.View>

          <Animated.View
            style={[
              styles.rightDrawerContainer,
              { width: DRAWER_WIDTH, transform: [{ translateX: profileAnim }] },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Staff Profile</Text>
              <TouchableOpacity onPress={() => closeProfile()}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileCard}>
              <TouchableOpacity onPress={pickAndUploadAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
                <View style={styles.profileCardAvatar}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.profileCardAvatarImg} />
                  ) : (
                    <Text style={styles.headerAvatarInitial}>
                      {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                  )}
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                </View>
              </TouchableOpacity>
              <Text style={styles.profileCardName}>{profile?.full_name ?? 'Staff Member'}</Text>
              <Text style={styles.profileCardRole}>{assignedShopName || 'Service Station'}</Text>
            </View>

            {/*
              FIX: dating plain lang ang icon (walang background box),
              kaya mukhang parang text link lang na "blue" ang itsura
              imbes na proper button. Ginawan na ng colored icon box
              gaya ng ibang menu items para mas obvious na tappable
              button ito.
            */}
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setEditName(profile?.full_name ?? '');
                setEditProfileOpen(true);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.drawerMenuIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="create-outline" size={20} color={BLUE} />
              </View>
              <Text style={styles.profileMenuItemText}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.profileMenuItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                closeProfile(() => handleLogout());
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.drawerMenuIconBox, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={20} color={ERROR} />
              </View>
              <Text style={[styles.profileMenuItemText, { color: ERROR }]}>Logout</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* EDIT PROFILE MODAL */}
      <Modal
        visible={editProfileOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setEditProfileOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { maxWidth: 380, width: '100%', alignItems: 'stretch' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditProfileOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Full name"
              placeholderTextColor="#94A3B8"
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Mobile Number</Text>
            <TextInput
              style={styles.fieldInput}
              value={editMobile}
              onChangeText={setEditMobile}
              placeholder="09XX XXX XXXX"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                styles.saveProfileBtn,
                savingProfile && { opacity: 0.7 },
              ]}
              onPress={handleSaveProfile}
              disabled={savingProfile}
              activeOpacity={0.85}
            >
              <View style={styles.saveProfileBtnContent}>
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                )}
                <Text style={styles.confirmBtnText}>
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PAYSLIP MODAL */}
      <Modal
        visible={payslipOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPayslipOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { maxWidth: 380, width: '100%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>My Payslip & Share</Text>
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

            <ScrollView style={{ width: '100%', maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {payslipLoading ? (
                <Text style={{ color: '#64748B', textAlign: 'center', marginVertical: 20 }}>Calculating...</Text>
              ) : (
                <>
                  {isPayslipPaid ? (
                    <View style={[styles.payslipHighlightCard, styles.payslipHighlightCardPaid]}>
                      <Text style={[styles.payslipHighlightLabel, { color: '#166534' }]}>Already Paid</Text>
                      <Text style={[styles.payslipHighlightValue, { color: '#166534' }]}>
                        {formatPeso(payslipPayout!.amount)}
                      </Text>
                      <TouchableOpacity
                        style={styles.receiptBtn}
                        onPress={() => handleDownloadReceipt(payslipPayout!)}
                        disabled={generatingReceiptFor === payslipPayout!.id}
                      >
                        {generatingReceiptFor === payslipPayout!.id ? (
                          <ActivityIndicator size="small" color="#16A34A" />
                        ) : (
                          <Text style={styles.receiptBtnText}>Download PDF Receipt</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.payslipHighlightCard}>
                      <Text style={styles.payslipHighlightLabel}>Your Estimated Share</Text>
                      <Text style={styles.payslipHighlightValue}>{formatPeso(payslipShare)}</Text>
                      <Text style={styles.payslipHighlightSub}>
                        Split equally among {staffList.length} staff
                      </Text>
                    </View>
                  )}

                  <View style={styles.earningsRow}>
                    <Text style={styles.earningsSubLabel}>Total Shop Revenue</Text>
                    <Text style={styles.earningsSubValue}>{formatPeso(payslipRevenue)}</Text>
                  </View>
                  <View style={styles.earningsRow}>
                    <Text style={styles.earningsSubLabel}>Staff Pool (40%)</Text>
                    <Text style={styles.earningsSubValue}>{formatPeso(payslipRevenue * STAFF_SHARE_PERCENT)}</Text>
                  </View>
                  <View style={styles.earningsRow}>
                    <Text style={styles.earningsSubLabel}>Completed Jobs</Text>
                    <Text style={styles.earningsSubValue}>{payslipJobsCount}</Text>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* PAYMENT HISTORY MODAL */}
      <Modal
        visible={historyOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { maxWidth: 380, width: '100%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Payment History</Text>
              <TouchableOpacity onPress={() => setHistoryOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%', maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {historyLoading ? (
                <ActivityIndicator size="small" color={NAVY} style={{ marginVertical: 20 }} />
              ) : historyPayouts.length === 0 ? (
                <Text style={{ color: '#64748B', textAlign: 'center', marginVertical: 20 }}>
                  No payment records found.
                </Text>
              ) : (
                historyPayouts.map((p) => (
                  <View key={p.id} style={styles.reservationCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reservationTitle}>{formatPeso(p.amount)}</Text>
                      <Text style={styles.reservationMeta}>
                        {periodLabel(p.period_type)} ({p.period_start})
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.actionBtnSmall}
                      onPress={() => handleDownloadReceipt(p)}
                      disabled={generatingReceiptFor === p.id}
                    >
                      <Text style={styles.actionBtnSmallText}>PDF</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CONFIRMATION & FEEDBACK MODALS */}
      <ConfirmModal state={confirm} onCancel={closeConfirm} />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
    overflow: 'hidden',
  },
  headerAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  headerAvatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  greeting: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  name: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
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
    fontSize: 12,
    fontWeight: '600',
  },
  shopName: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
  burgerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    position: 'relative',
  },
  burgerBadgeDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusBannerOpen: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  banner: {
    borderRadius: 20,
    padding: 20,
  },
  bannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  bannerItems: {
    gap: 10,
  },
  bannerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerItemText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
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
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  earningsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  earningsCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  earningsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  breakdownContainer: {
    gap: 4,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  earningsSubLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  earningsSubValue: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  earningsTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  earningsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16A34A',
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
  drawerOverlay: {
    flex: 1,
    position: 'relative',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  rightDrawerContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    padding: 24,
    paddingTop: 50,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  drawerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  drawerMenuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerMenuText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  drawerCountBadge: {
    backgroundColor: BLUE,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  drawerCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  reservationCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  reservationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  reservationMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  reservationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  reservationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
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
    position: 'relative',
    overflow: 'visible',
  },
  profileCardAvatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
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
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
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
    paddingVertical: 4,
    fontSize: 13,
    color: '#1E293B',
    width: 70,
    backgroundColor: '#FFFFFF',
  },
  priceSaveBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 4,
  },
  priceSaveBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnSmall: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnSmallText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  payslipTabs: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    width: '100%',
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
    fontSize: 12,
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
    width: '100%',
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
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  payslipHighlightCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  payslipHighlightCardPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  payslipHighlightLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  payslipHighlightValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#92400E',
    marginTop: 4,
  },
  payslipHighlightSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  receiptBtn: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  receiptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
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
  saveProfileBtn: {
    backgroundColor: BLUE,
    marginTop: 20,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  saveProfileBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 18,
  },
});