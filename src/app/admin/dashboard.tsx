import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface ReservationRow {
  customer_id: string;
  shop_id: number;
  vehicle_type: string;
  service_type: string;
  status: string;
  created_at: string;
  reservation_date: string;
  price: number | null;
}

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// Maintain original promo slides content structure
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

  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);


  const [shopSetup, setShopSetup] = useState({
    shopId: null as number | null,
    shopName: 'I-CarWash System',
    location: 'Not Configured Yet',
    totalBays: 0,
  });

  const [occupiedBaysCount, setOccupiedBaysCount] = useState(0);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [shops, setShops] = useState<{ id: number; name: string }[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [reservationDrawerOpen, setReservationDrawerOpen] = useState(false);

  // Responsive breakpoints (Maintained)
  const isSmall = width < 360;
  const isMedium = width >= 360 && width < 414;

  const greetingSize = isSmall ? 13 : isMedium ? 15 : 18;
  const systemTextSize = isSmall ? 10 : 12;
  const logoSize = isSmall ? 34 : 42;
  const logoIconSize = isSmall ? 16 : 22;

  const startAutoScroll = () => {
    autoScrollTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % PROMO_SLIDES.length;
        scrollRef.current?.scrollTo({ x: next * CARD_WIDTH, animated: true });
        return next;
      });
    }, 3000);
  };

  useEffect(() => {
    startAutoScroll();
    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [CARD_WIDTH]);

  const handleScrollEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    setActiveIndex(index);
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    startAutoScroll();
  };

  const cardWidth = (width - 32 - 12) / 2;


  const shopReservationsToday = reservations.filter((r) => r.shop_id === shopSetup.shopId);
  const totalCarsToday = shopReservationsToday.length;
  const queueCount = shopReservationsToday.filter((r) => r.status === 'Waiting').length;
  const todayEarnings = shopReservationsToday
    .filter((r) => r.status === 'Completed')
    .reduce((sum, r) => sum + (r.price ?? 0), 0);
  const occupiedBays = occupiedBaysCount;
  const totalBays = shopSetup.totalBays;

  // Dynamic status validation helper
  const isShopFullyBooked = totalBays > 0 && occupiedBays >= totalBays;

  // Pulls the latest shop configuration (name, location, total bays) set by Admin in Shop Setup
  const fetchShopConfig = async () => {
    const { data, error } = await supabase
      .from('shop_profile_setup')
      .select('id, shop_name, city, total_bays')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching shop config:', error);
      return;
    }

    if (data) {
      setShopSetup((prev) => ({
        ...prev,
        shopId: data.id ?? prev.shopId,
        shopName: data.shop_name ?? prev.shopName,
        location: data.city ?? prev.location,
        totalBays: data.total_bays ?? prev.totalBays,
      }));
    }
  };

 
  const fetchBaysStatus = async (shopId: number | null) => {
    if (!shopId) {
      setOccupiedBaysCount(0);
      return;
    }

    const { data, error } = await supabase
      .from('bays')
      .select('occupied, reserved')
      .eq('shop_id', shopId);

    if (error) {
      console.error('Error fetching bays status:', error);
      return;
    }

    const occupied = (data ?? []).filter(
      (row: { occupied: boolean; reserved: boolean }) => row.occupied || row.reserved
    ).length;
    setOccupiedBaysCount(occupied);
  };

  const fetchReservations = async () => {
    setLoadingReservations(true);

    const todayStr = new Date().toISOString().split('T')[0];
    const startOfTodayIso = `${todayStr}T00:00:00.000Z`;
    const startOfTomorrowIso = new Date(
      new Date(startOfTodayIso).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    const [reservationResult, shopResult] = await Promise.all([
      supabase
        .from('reservation')
        .select(`
          customer_id,
          shop_id,
          vehicle_type,
          service_type,
          status,
          created_at,
          reservation_date,
          price
        `)
       
        .or(
          `reservation_date.eq.${todayStr},and(created_at.gte.${startOfTodayIso},created_at.lt.${startOfTomorrowIso})`
        )
        .order('created_at', { ascending: false }),
      supabase.from('shop_profile_setup').select('id, shop_name').order('id', { ascending: false }),
    ]);

    console.log('TODAY:', todayStr);
    console.log('RESERVATION RESULT:', reservationResult);

    if (reservationResult.error) {
      console.error(reservationResult.error);
    } else {
      console.log('DATA:', reservationResult.data);
      setReservations((reservationResult.data as ReservationRow[]) ?? []);
    }

    if (shopResult.error) {
      console.error('Error fetching shop list:', shopResult.error);
    } else {
      setShops((shopResult.data as { id: number; shop_name: string }[]).map((shop) => ({ id: shop.id, name: shop.shop_name })) ?? []);
    }

    setLoadingReservations(false);
  };

  useEffect(() => {
    fetchReservations();

    const channel = supabase
      .channel('admin-reservation-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservation' },
        () => {
          fetchReservations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    fetchShopConfig();

    const configChannel = supabase
      .channel('admin-shop-config-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shop_profile_setup' },
        () => {
          fetchShopConfig();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(configChannel);
    };
  }, []);

  // Live update ng occupied bays count -- kapag may kotseng na-detect
  // (o umalis) ang camera.py, o may na-reserve sa app, agad mag-re-refresh
  // ito nang hindi na kailangan mag pull-to-refresh ang admin.
  useEffect(() => {
    fetchBaysStatus(shopSetup.shopId);

    const bayChannel = supabase
      .channel('admin-bays-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bays' },
        () => {
          fetchBaysStatus(shopSetup.shopId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bayChannel);
    };
  }, [shopSetup.shopId]);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={[styles.profileRow, { flex: 1, marginRight: 8 }]}>
          <View
            style={[
              styles.logoCircle,
              { width: logoSize, height: logoSize, borderRadius: logoSize / 2, marginRight: 8 },
            ]}
          >
            <Ionicons name="car-sport-outline" size={logoIconSize} color="#F5C518" />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.greeting, { fontSize: greetingSize }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Good Morning, Admin
            </Text>
            <Text
              style={[styles.systemText, { fontSize: systemTextSize }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {shopSetup.shopName} • {shopSetup.location}
            </Text>
          </View>
        </View>

        {/* Logout button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => router.push('/auth')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="log-out-outline" size={16} color="#0F172A" />
          {!isSmall && (
            <Text style={styles.logoutText}>Logout</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* EMERGENCY WORKSPACE INDICATOR */}
      <View style={[styles.statusBanner, isShopFullyBooked ? styles.statusBannerFull : styles.statusBannerOpen]}>
        <Ionicons
          name={isShopFullyBooked ? "alert-circle-outline" : "checkmark-circle-outline"}
          size={18}
          color={isShopFullyBooked ? "#EF4444" : "#22C55E"}
        />
        <Text style={[styles.statusBannerText, { color: isShopFullyBooked ? "#EF4444" : "#22C55E" }]}>
          {isShopFullyBooked
            ? "SHOP LIVE STATUS: FULL (Reservations Auto-Disabled)"
            : `SHOP LIVE STATUS: AVAILABLE (${totalBays - occupiedBays} Bays Left)`}
        </Text>
      </View>

      {/* SLIDING BANNER */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        snapToInterval={CARD_WIDTH}
        decelerationRate="fast"
        style={{ marginBottom: 12 }}
      >
        {PROMO_SLIDES.map((slide) => (
          <View
            key={slide.id}
            style={[styles.banner, { backgroundColor: slide.color, width: CARD_WIDTH }]}
          >
            <Text style={[styles.bannerLabel, { color: slide.accentColor }]}>
              {slide.label}
            </Text>
            <Text style={styles.bannerTitle}>{slide.title}</Text>

            <View style={styles.bannerItems}>
              {slide.items.map((item, i) => (
                <View key={i} style={styles.bannerItem}>
                  <View
                    style={[
                      styles.bannerIconBox,
                      { backgroundColor: slide.accentColor + '25' },
                    ]}
                  >
                    <Ionicons name={item.icon as any} size={20} color={slide.accentColor} />
                  </View>
                  <Text style={styles.bannerItemText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* DOTS */}
      <View style={styles.dotsRow}>
        {PROMO_SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === activeIndex ? '#111827' : '#CBD5E1' },
            ]}
          />
        ))}
      </View>

      {/* QUICK STATS -- REAL DATA na, galing mismo sa "reservation" at
          "bays" tables (hindi na hardcoded placeholder numbers) */}
      <View style={styles.statsGrid}>
        {[
          { number: `${totalCarsToday}`, label: 'Total Cars', trend: 'Recorded today' },
          { number: `${occupiedBays} / ${totalBays}`, label: 'Active Bays', trend: isShopFullyBooked ? 'FULLY OCCUPIED' : 'Bays Running' },
          { number: `₱${todayEarnings.toLocaleString()}`, label: 'Earnings', trend: 'Today' },
          { number: `${queueCount}`, label: 'Queue', trend: 'Waiting' },
        ].map((s, i) => (
          <View key={i} style={[styles.statCard, { width: cardWidth }]}>
            <Text style={[styles.statNumber, { fontSize: isSmall ? 16 : 20 }]} numberOfLines={1} adjustsFontSizeToFit>
              {s.number}
            </Text>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={[styles.statTrend, s.trend === 'FULLY OCCUPIED' && { color: '#EF4444' }]}>{s.trend}</Text>
          </View>
        ))}
      </View>

      {/* CATEGORIES */}
      <Text style={styles.sectionTitle}>Categories</Text>

      <View style={styles.categoryGrid}>
        {[
          { icon: 'business-outline', color: '#3B82F6', label: 'Shop Profile Setup', route: 'admin/shop-setup' },
          { icon: 'people-outline', color: '#22C55E', label: 'Staff', route: 'admin/staff-management' },
          { icon: 'bar-chart-outline', color: '#F59E0B', label: 'Reports', route: 'admin/reports' },
        ].map((cat, i) => {
          // Compute full width option if items are uneven, otherwise use balanced card width
          const isFullWidthControl = cat.route === 'admin/shop-setup';
          const calculatedWidth = isFullWidthControl ? (width - 32) : cardWidth;

          return (
            <TouchableOpacity
              key={i}
              style={[styles.categoryCard, { width: calculatedWidth }]}
              onPress={() => router.push(cat.route as any)}
            >
              <View style={[styles.iconBox, { backgroundColor: cat.color + '20' }]}>
                <Ionicons name={cat.icon as any} size={isSmall ? 22 : 28} color={cat.color} />
              </View>
              <Text style={[styles.categoryText, { fontSize: isSmall ? 11 : 13 }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* LIVE RESERVATIONS - now opens in a drawer */}
      <Text style={styles.sectionTitle}>Live Reservations</Text>

      <TouchableOpacity style={styles.queueOpenBtn} onPress={() => setReservationDrawerOpen(true)}>
        <View style={styles.queueOpenLeft}>
          <Ionicons name="receipt-outline" size={20} color="#1E293B" />
          <Text style={styles.queueOpenText}>View Live Reservations</Text>
        </View>
        <View style={styles.queueCountBadge}>
          <Text style={styles.queueCountText}>{reservations.length}</Text>
        </View>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>

      {/* DRAWER FOR LIVE RESERVATIONS */}
      <Modal
        visible={reservationDrawerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setReservationDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setReservationDrawerOpen(false)} />

          <View style={styles.drawerPanel}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Live Reservations</Text>
              <TouchableOpacity onPress={() => setReservationDrawerOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {loadingReservations ? (
                <Text style={{ paddingHorizontal: 16, color: '#64748B' }}>Loading reservations...</Text>
              ) : reservations.length === 0 ? (
                <Text style={{ paddingHorizontal: 16, color: '#64748B' }}>No reservations recorded yet.</Text>
              ) : (
                reservations.map((item) => (
                  <View key={`${item.customer_id}-${item.created_at}`} style={styles.reservationCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reservationTitle}>{item.vehicle_type}</Text>
                      <Text style={styles.reservationMeta}>{item.service_type}</Text>
                      <Text style={styles.reservationShop}>
                        {shops.find((shop) => shop.id === item.shop_id)?.name ?? `Shop ID ${item.shop_id}`}
                      </Text>
                    </View>
                    <View style={[styles.reservationBadge, { backgroundColor: item.status === 'Completed' ? '#DCFCE7' : item.status === 'Washing' ? '#DBEAFE' : '#FEF3C7' }]}>
                      <Text style={[styles.reservationBadgeText, { color: item.status === 'Completed' ? '#16A34A' : item.status === 'Washing' ? '#2563EB' : '#D97706' }]}>
                        {item.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
  },

  header: {
    marginTop: 50,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoCircle: {
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  greeting: {
    fontWeight: '700',
    color: '#111827',
  },

  systemText: {
    color: '#64748B',
    marginTop: 2,
  },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FACC15',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    flexShrink: 0,
  },

  logoutText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },

  /* MONITORING ALERTS */
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
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
    letterSpacing: 0.3,
  },

  /* BANNER */
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
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  bannerItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },

  /* DOTS */
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
    marginTop: 10,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  /* STATS */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },

  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  statNumber: {
    fontWeight: '800',
    color: '#111827',
  },

  statLabel: {
    color: '#64748B',
    marginTop: 2,
    fontSize: 13,
  },

  statTrend: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },

  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  categoryText: {
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 18,
  },

  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  /* LIVE RESERVATIONS OPEN BUTTON */
  queueOpenBtn: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
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
    backgroundColor: '#4F46E5',
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

  /* DRAWER */
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  drawerPanel: {
    width: '82%',
    maxWidth: 360,
    backgroundColor: '#F8FAFC',
    paddingTop: 60,
    paddingBottom: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },

  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },

  reservationTitle: {
    fontSize: 15,
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
    marginTop: 3,
  },

  reservationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },

  reservationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});