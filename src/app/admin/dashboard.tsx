import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface ReservationRow {
  customer_id: string | null;
  shop_id: number;
  vehicle_type: string;
  service_type: string;
  status: string;
  created_at: string;
  reservation_date: string;
  price: number | null;
}

const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#60A5FA';
const ERROR = '#DC2626';

const formatPeso = (amount: number) => {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

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

// Dynamic Banner Slides
const PROMO_SLIDES = [
  {
    id: '1',
    label: 'SYSTEM STATUS',
    title: 'Active Monitoring',
    color: '#111827',
    accentColor: '#F5C518',
    items: [
      { icon: 'car-outline', text: 'Dynamic Bays Active' },
      { icon: 'people-outline', text: 'Real-time Slots Tracking' },
    ],
  },
  {
    id: '2',
    label: 'PROMO',
    title: 'Full Wash ₱199',
    color: '#1E3A5F',
    accentColor: '#60A5FA',
    items: [
      { icon: 'water-outline', text: 'Exterior + Interior' },
      { icon: 'star-outline', text: 'Valid until July 31' },
    ],
  },
  {
    id: '3',
    label: 'NEW SERVICE',
    title: 'Engine Degreasing',
    color: '#3B1F6A',
    accentColor: '#C084FC',
    items: [
      { icon: 'build-outline', text: 'Deep clean engine bay' },
      { icon: 'pricetag-outline', text: 'Starting at ₱350' },
    ],
  },
  {
    id: '4',
    label: 'LOYALTY REWARD',
    title: '10th Wash Free!',
    color: '#14532D',
    accentColor: '#4ADE80',
    items: [
      { icon: 'gift-outline', text: 'Stamp card program' },
      { icon: 'checkmark-circle-outline', text: 'Ask staff for details' },
    ],
  },
];

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const CARD_WIDTH = width - 32;
  const DRAWER_WIDTH = width * 0.8;

  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [profile, setProfile] = useState<{ full_name: string } | null>(null);

  // Kailangan natin ang user id ng kasalukuyang naka-login na Admin
  // para malaman kung ANONG shop ang sa kanya (owner_id-based),
  // hindi na basta "pinaka-latest na shop sa buong system".
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const [shopSetup, setShopSetup] = useState({
    shopId: null as number | null,
    shopName: 'I-CarWash System',
    location: 'Not Configured Yet',
    totalBays: 0,
  });

  const [hasShop, setHasShop] = useState(true); // optimistic default habang naglo-load pa

  const [occupiedBaysCount, setOccupiedBaysCount] = useState(0);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [shops, setShops] = useState<{ id: number; name: string }[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(true);

  // Drawer Visible States
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [reservationDrawerOpen, setReservationDrawerOpen] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

  // Animated Values for Horizontal Drawer Slide from Right (Pakaliwa)
  const menuAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const reservationAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const profileAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const overlayFadeAnim = useRef(new Animated.Value(0)).current;

  const [homeServiceEarnings, setHomeServiceEarnings] = useState(0);

  // Modal States
  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));

  // Helper Smooth Drawer Animators
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

  const openReservation = () => {
    setReservationDrawerOpen(true);
    animateDrawer(reservationAnim, 0);
  };

  const closeReservation = () => {
    animateDrawer(reservationAnim, DRAWER_WIDTH, () => {
      setReservationDrawerOpen(false);
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

  // Auto Banner Scroll
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

  const shopReservationsToday = reservations.filter((r) => r.shop_id === shopSetup.shopId);
  const totalCarsToday = shopReservationsToday.length;
  const queueCount = shopReservationsToday.filter((r) => r.status === 'Waiting').length;
  const completedTodayReservations = shopReservationsToday.filter((r) => r.status === 'Completed');

  const walkInEarningsToday = completedTodayReservations
    .filter((r) => !r.customer_id)
    .reduce((sum, r) => sum + (r.price ?? 0), 0);

  const customerReservationEarningsToday = completedTodayReservations
    .filter((r) => !!r.customer_id)
    .reduce((sum, r) => sum + (r.price ?? 0), 0);

  const todayEarnings = walkInEarningsToday + customerReservationEarningsToday + homeServiceEarnings;
  const occupiedBays = occupiedBaysCount;
  const totalBays = shopSetup.totalBays;
  const isShopFullyBooked = totalBays > 0 && occupiedBays >= totalBays;

  // Profile Fetch (kunin din dito ang ownerId mula sa session, isang
  // beses lang, para magamit ng lahat ng ibang shop-related fetches)
  useEffect(() => {
    const fetchAdminProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setOwnerId(session.user.id);

        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();
        if (data) setProfile(data);
      }
    };
    fetchAdminProfile();
  }, []);

  // Kunin ang shop na PAG-AARI ng kasalukuyang naka-login na Admin
  // (owner_id-based), hindi na yung "latest shop sa buong system".
  const fetchShopConfig = useCallback(async (currentOwnerId?: string | null) => {
    const effectiveOwnerId = currentOwnerId ?? ownerId;
    if (!effectiveOwnerId) return null;

    const { data, error } = await supabase
      .from('shop_profile_setup')
      .select('id, shop_name, city, total_bays')
      .eq('owner_id', effectiveOwnerId)
      .maybeSingle();

    if (!error) {
      if (data) {
        setHasShop(true);
        setShopSetup((prev) => ({
          ...prev,
          shopId: data.id ?? prev.shopId,
          shopName: data.shop_name ?? prev.shopName,
          location: data.city ?? prev.location,
          totalBays: data.total_bays ?? prev.totalBays,
        }));
      } else {
        // Walang shop pa itong admin na ito -- panahon na para
        // pumunta sa Shop Setup at gumawa ng sarili niyang shop.
        setHasShop(false);
        setShopSetup({
          shopId: null,
          shopName: 'No Shop Yet',
          location: 'Set up your shop first',
          totalBays: 0,
        });
      }
    }
    return data;
  }, [ownerId]);

  const fetchBaysStatus = useCallback(async (shopId: number | null) => {
    if (!shopId) {
      setOccupiedBaysCount(0);
      return;
    }
    const { data } = await supabase.from('bays').select('occupied, reserved').eq('shop_id', shopId);
    const occupied = (data ?? []).filter((row: any) => row.occupied || row.reserved).length;
    setOccupiedBaysCount(occupied);
  }, []);

  const fetchReservations = useCallback(async () => {
    setLoadingReservations(true);
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfTodayIso = `${todayStr}T00:00:00.000Z`;
    const startOfTomorrowIso = new Date(new Date(startOfTodayIso).getTime() + 86400000).toISOString();

    const [reservationResult, shopResult] = await Promise.all([
      supabase
        .from('reservation')
        .select('customer_id, shop_id, vehicle_type, service_type, status, created_at, reservation_date, price')
        .or(`reservation_date.eq.${todayStr},and(created_at.gte.${startOfTodayIso},created_at.lt.${startOfTomorrowIso})`)
        .order('created_at', { ascending: false }),
      supabase.from('shop_profile_setup').select('id, shop_name').order('id', { ascending: false }),
    ]);

    if (!reservationResult.error) setReservations((reservationResult.data as ReservationRow[]) ?? []);
    if (!shopResult.error) {
      setShops((shopResult.data as any[]).map((shop) => ({ id: shop.id, name: shop.shop_name })) ?? []);
    }
    setLoadingReservations(false);
  }, []);

  const fetchHomeServiceEarnings = useCallback(async (shopId: number | null) => {
    if (!shopId) {
      setHomeServiceEarnings(0);
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
    setHomeServiceEarnings(total);
  }, []);

  useEffect(() => {
    fetchReservations();
    const channel = createFreshChannel('admin-reservation-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation' }, () => fetchReservations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReservations]);

  useEffect(() => {
    if (!ownerId) return;
    fetchShopConfig(ownerId);
    const channel = createFreshChannel('admin-shop-config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_profile_setup' }, () => fetchShopConfig(ownerId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ownerId, fetchShopConfig]);

  useEffect(() => {
    fetchBaysStatus(shopSetup.shopId);
    const channel = createFreshChannel('admin-bays-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bays' }, () => fetchBaysStatus(shopSetup.shopId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [shopSetup.shopId, fetchBaysStatus]);

  useEffect(() => {
    fetchHomeServiceEarnings(shopSetup.shopId);
    const channel = createFreshChannel('admin-home-service-earnings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_service' }, () => fetchHomeServiceEarnings(shopSetup.shopId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [shopSetup.shopId, fetchHomeServiceEarnings]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isActive || !session) return;

        if (!ownerId) setOwnerId(session.user.id);

        const config = await fetchShopConfig(session.user.id);
        if (!isActive) return;
        const shopId = config?.id ?? shopSetup.shopId;
        await fetchBaysStatus(shopId);
        await fetchReservations();
        await fetchHomeServiceEarnings(shopId);
      })();

      const onBackPress = () => {
        if (reservationDrawerOpen) {
          closeReservation();
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
    }, [ownerId, fetchShopConfig, fetchBaysStatus, fetchReservations, fetchHomeServiceEarnings, reservationDrawerOpen, profileDrawerOpen, menuDrawerOpen])
  );

  // Logout Trigger
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
              <Ionicons name="car-sport-outline" size={22} color="#F5C518" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Good Morning,</Text>
              <Text style={styles.name}>{profile?.full_name ?? 'Admin'}</Text>
              <View style={styles.roleContainer}>
                <View style={styles.onlineDot} />
                <Text style={styles.role}>System Administrator</Text>
              </View>
              <Text style={styles.shopName} numberOfLines={1}>
                {shopSetup.shopName} • {shopSetup.location}
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
            {reservations.length > 0 && <View style={styles.burgerBadgeDot} />}
          </TouchableOpacity>
        </View>

        {/* NO SHOP YET BANNER -- kapag walang shop pa itong admin na ito */}
        {!hasShop && (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <TouchableOpacity
              style={styles.noShopBanner}
              activeOpacity={0.85}
              onPress={() => router.push('admin/shop-setup' as any)}
            >
              <Ionicons name="alert-circle-outline" size={20} color="#B45309" />
              <Text style={styles.noShopBannerText}>
                You haven't set up your shop yet. Tap here to create your shop profile.
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#B45309" />
            </TouchableOpacity>
          </View>
        )}

        {/* STATUS BANNER */}
        {hasShop && (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <View style={[styles.statusBanner, isShopFullyBooked ? styles.statusBannerFull : styles.statusBannerOpen]}>
              <Ionicons
                name={isShopFullyBooked ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                size={18}
                color={isShopFullyBooked ? '#EF4444' : '#22C55E'}
              />
              <Text style={[styles.statusBannerText, { color: isShopFullyBooked ? '#EF4444' : '#22C55E' }]}>
                {isShopFullyBooked
                  ? 'SHOP LIVE STATUS: FULL (Reservations Auto-Disabled)'
                  : `SHOP LIVE STATUS: AVAILABLE (${totalBays - occupiedBays} Bays Left)`}
              </Text>
            </View>
          </View>
        )}

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
            <Text style={styles.statValue}>{totalCarsToday}</Text>
            <Text style={styles.statLabel}>Total Cars Today</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="business-outline" size={26} color="#F59E0B" style={styles.cardIcon} />
            <Text style={styles.statValue}>
              {occupiedBays} / {totalBays}
            </Text>
            <Text style={styles.statLabel}>Active Bays</Text>
          </View>

          <View style={[styles.statCard, { width: '100%' }]}>
            <Ionicons name="time-outline" size={26} color="#10B981" style={styles.cardIcon} />
            <Text style={styles.statValue}>{queueCount}</Text>
            <Text style={styles.statLabel}>Queue Status (Waiting Slots)</Text>
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
                  <Text style={styles.earningsSubValue}>{formatPeso(customerReservationEarningsToday)}</Text>
                </View>

                <View style={styles.earningsRow}>
                  <Text style={styles.earningsSubLabel}>Home Service</Text>
                  <Text style={styles.earningsSubValue}>{formatPeso(homeServiceEarnings)}</Text>
                </View>

                <View style={styles.earningsRow}>
                  <Text style={styles.earningsSubLabel}>Walk-ins</Text>
                  <Text style={styles.earningsSubValue}>{formatPeso(walkInEarningsToday)}</Text>
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
        <Text style={styles.sectionTitle}>Categories & Tools</Text>

        <View style={styles.cardsGrid}>
          {[
            { icon: 'business-outline', label: 'Shop Setup', route: 'admin/shop-setup', color: BLUE },
            { icon: 'people-outline', label: 'Staff Roster', route: 'admin/staff-management', color: '#10B981' },
            { icon: 'bar-chart-outline', label: 'Reports', route: 'admin/reports', color: '#F59E0B' },
          ].map((cat, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.actionCard, cat.route === 'admin/shop-setup' && { width: '100%' }]}
              onPress={() => router.push(cat.route as any)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: cat.color + '15' }]}>
                <Ionicons name={cat.icon as any} size={24} color={cat.color} />
              </View>
              <Text style={styles.actionLabel}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
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
                closeMenu(() => openReservation());
              }}
            >
              <View style={styles.drawerMenuIconBox}>
                <Ionicons name="receipt-outline" size={20} color={BLUE} />
              </View>
              <Text style={styles.drawerMenuText}>Live Reservations</Text>
              <View style={styles.drawerCountBadge}>
                <Text style={styles.drawerCountText}>{reservations.length}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.drawerMenuItem}
              onPress={() => {
                closeMenu(() => openProfile());
              }}
            >
              <View style={styles.drawerMenuIconBox}>
                <Ionicons name="person-outline" size={20} color="#10B981" />
              </View>
              <Text style={styles.drawerMenuText}>Admin Profile</Text>
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

      {/* LIVE RESERVATIONS DRAWER */}
      <Modal
        visible={reservationDrawerOpen}
        animationType="none"
        transparent
        onRequestClose={() => closeReservation()}
      >
        <View style={styles.drawerOverlay}>
          <Animated.View style={[styles.drawerBackdrop, { opacity: overlayFadeAnim }]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeReservation()} />
          </Animated.View>

          <Animated.View
            style={[
              styles.rightDrawerContainer,
              { width: DRAWER_WIDTH, transform: [{ translateX: reservationAnim }] },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Live Reservations</Text>
              <TouchableOpacity onPress={() => closeReservation()}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {loadingReservations ? (
                <Text style={{ color: '#64748B' }}>Loading reservations...</Text>
              ) : reservations.length === 0 ? (
                <Text style={{ color: '#64748B' }}>No reservations recorded yet.</Text>
              ) : (
                reservations.map((item) => (
                  <View key={`${item.customer_id}-${item.created_at}`} style={styles.reservationCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reservationTitle}>{item.vehicle_type}</Text>
                      <Text style={styles.reservationMeta}>{item.service_type}</Text>
                      <Text style={styles.reservationShop}>
                        {shops.find((shop) => shop.id === item.shop_id)?.name ?? `Shop ID ${item.shop_id}`}
                        {'  •  '}
                        {item.customer_id ? 'Customer Reservation' : 'Walk-in'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.reservationBadge,
                        {
                          backgroundColor:
                            item.status === 'Completed' ? '#DCFCE7' : item.status === 'Washing' ? '#DBEAFE' : '#FEF3C7',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.reservationBadgeText,
                          {
                            color:
                              item.status === 'Completed' ? '#16A34A' : item.status === 'Washing' ? '#2563EB' : '#D97706',
                          },
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* ADMIN PROFILE DRAWER */}
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
              <Text style={styles.menuTitle}>Admin Profile</Text>
              <TouchableOpacity onPress={() => closeProfile()}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileCard}>
              <View style={styles.profileCardAvatar}>
                <Ionicons name="person" size={28} color="#fff" />
              </View>
              <Text style={styles.profileCardName}>{profile?.full_name ?? 'Admin User'}</Text>
              <Text style={styles.profileCardRole}>{shopSetup.shopName}</Text>
            </View>

            <TouchableOpacity
              style={[styles.profileMenuItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                closeProfile(() => handleLogout());
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={ERROR} />
              <Text style={[styles.profileMenuItemText, { color: ERROR }]}>Logout</Text>
            </TouchableOpacity>
          </Animated.View>
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
  noShopBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  noShopBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
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
  statusBannerFull: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
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
  reservationShop: {
    fontSize: 11,
    color: '#94A3B8',
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