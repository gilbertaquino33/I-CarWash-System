import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// ---------- THEME: Exact Blue / White / Black Palette (Gaya ng Admin & Staff) ----------
const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#60A5FA';
const BLUE_TINT = '#EFF6FF';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';
const GRAY_LIGHT = '#E2E8F0';
const BG = '#F8FAFC';
const DANGER = '#EF4444';

interface ShopBranch {
  id: number;
  shop_name: string;
  province: string;
  city: string;
  barangay: string;
  totalBays: number;
  occupiedBays: number;
}

type InfoModalType = 'warning' | 'error';

interface InfoModalData {
  type: InfoModalType;
  title: string;
  message: string;
}

export default function CustomerDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);

  // States para sa Menu Modal at Active Booking Control
  const [menuVisible, setMenuVisible] = useState(false);
  const [hasPaidBooking, setHasPaidBooking] = useState(false); // Magiging true lang kapag paid na

  // Real carwash branches galing sa shop_profile_setup table
  const [shops, setShops] = useState<ShopBranch[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // States para sa Booking Confirmation Modal
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [selectedShop, setSelectedShop] = useState<ShopBranch | null>(null);

  // State para sa Logout Confirmation Modal
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Generic Info/Warning/Error Modal
  const [infoModal, setInfoModal] = useState<InfoModalData | null>(null);
  const showInfoModal = (data: InfoModalData) => setInfoModal(data);
  const closeInfoModal = () => setInfoModal(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/customer/customer-registration');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .single();

      if (!data || data.role !== 'customer') {
        await supabase.auth.signOut();
        router.replace('/customer/customer-registration');
        return;
      }
      setProfile(data);
    };
    checkAuth();
    fetchShops();

    const bayTopic = 'realtime:bays-live';
    const shopConfigTopic = 'realtime:shop-config-live';

    const existingBayChannel = supabase.getChannels().find((c) => c.topic === bayTopic);
    if (existingBayChannel) {
      supabase.removeChannel(existingBayChannel);
    }

    const existingShopConfigChannel = supabase.getChannels().find((c) => c.topic === shopConfigTopic);
    if (existingShopConfigChannel) {
      supabase.removeChannel(existingShopConfigChannel);
    }

    // Live update: kapag nag-detect ng car (o umalis) ang camera.py
    const bayChannel = supabase
      .channel('bays-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bays' },
        () => {
          fetchShops();
        }
      )
      .subscribe();

    // Live update din kapag nag-Apply ng bagong total_bays si Admin sa Shop Setup.
    const shopConfigChannel = supabase
      .channel('shop-config-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shop_profile_setup' },
        () => {
          fetchShops();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bayChannel);
      supabase.removeChannel(shopConfigChannel);
    };
  }, []);

  const fetchShops = async () => {
    try {
      const { data: shopRows, error: shopError } = await supabase
        .from('shop_profile_setup')
        .select('id, shop_name, province, city, barangay, total_bays')
        .order('id', { ascending: false });

      if (shopError) throw shopError;

      const baseShops = (shopRows as (Omit<ShopBranch, 'totalBays' | 'occupiedBays'> & { total_bays: number | null })[]) ?? [];

      if (baseShops.length === 0) {
        setShops([]);
        return;
      }

      const shopIds = baseShops.map((s) => s.id);

      const { data: bayRows, error: bayError } = await supabase
        .from('bays')
        .select('shop_id, occupied, reserved')
        .in('shop_id', shopIds);

      if (bayError) throw bayError;

      const occupiedCounts: Record<number, number> = {};
      (bayRows ?? []).forEach((row: { shop_id: number; occupied: boolean; reserved: boolean }) => {
        if (row.occupied || row.reserved) {
          occupiedCounts[row.shop_id] = (occupiedCounts[row.shop_id] ?? 0) + 1;
        }
      });

      const merged: ShopBranch[] = baseShops.map((s) => ({
        ...s,
        totalBays: s.total_bays ?? 0,
        occupiedBays: occupiedCounts[s.id] ?? 0,
      }));

      setShops(merged);
    } catch (error) {
      console.error('Error fetching carwash branches:', error);
    } finally {
      setIsLoadingShops(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchShops();
  };

  const handleLogout = () => {
    setMenuVisible(false);
    setLogoutModalVisible(true);
  };

  const handleCancelLogout = () => {
    setLogoutModalVisible(false);
  };

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.replace('/customer/customer-registration');
    } finally {
      setIsLoggingOut(false);
      setLogoutModalVisible(false);
    }
  };

  const getAvailableSlots = (shop: ShopBranch) => shop.totalBays - shop.occupiedBays;
  const isShopFull = (shop: ShopBranch) => shop.totalBays > 0 && getAvailableSlots(shop) <= 0;

  const handleSelectBranch = (shop: ShopBranch) => {
    if (shop.totalBays === 0) {
      showInfoModal({
        type: 'warning',
        title: 'Not Available',
        message: 'This branch has not set up its bays yet. Please check back later.',
      });
      return;
    }

    if (isShopFull(shop)) {
      showInfoModal({
        type: 'error',
        title: 'No Slot Available',
        message: `${shop.shop_name} is currently full (${shop.occupiedBays}/${shop.totalBays} bays occupied). Please try again later or choose another branch.`,
      });
      return;
    }

    setSelectedShop(shop);
    setBookingModalVisible(true);
  };

  const handleConfirmBooking = () => {
    if (!selectedShop) return;

    if (isShopFull(selectedShop)) {
      setBookingModalVisible(false);
      showInfoModal({
        type: 'error',
        title: 'No Slot Available',
        message: `${selectedShop.shop_name} just got fully booked. Please choose another branch.`,
      });
      setSelectedShop(null);
      return;
    }

    setBookingModalVisible(false);
    router.push({
      pathname: '/customer/reserve' as any,
      params: { shopId: String(selectedShop.id), shopName: selectedShop.shop_name },
    } as any);
    setSelectedShop(null);
  };

  const handleCancelBooking = () => {
    setBookingModalVisible(false);
    setSelectedShop(null);
  };

  const selectedShopLocation = selectedShop
    ? [selectedShop.barangay, selectedShop.city, selectedShop.province].filter(Boolean).join(', ')
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* TOP BAR / APP HEADER (Exact pattern from Staff Dashboard) */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileTouchable}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarInitial}>
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Welcome Back! ✨</Text>
              <Text style={styles.name}>{profile?.full_name ?? 'Loading...'}</Text>
              <View style={styles.roleContainer}>
                <View style={styles.onlineDot} />
                <Text style={styles.role}>Customer</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* BURGER MENU BUTTON */}
          <TouchableOpacity
            style={styles.burgerBtn}
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="menu-outline" size={26} color={WHITE} />
          </TouchableOpacity>
        </View>

        {/* HOME SERVICE QUICK ACCESS */}
        <TouchableOpacity
          style={styles.homeServiceBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/customer/homeservice' as any)}
        >
          <View style={styles.homeServiceIconContainer}>
            <Ionicons name="home" size={22} color={WHITE} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.homeServiceTitle}>Home Service</Text>
            <Text style={styles.homeServiceSubtitle}>Book a wash sa bahay mo o i-track ang request mo</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={GRAY} />
        </TouchableOpacity>

        {/* CONDITION 1: QUEUE ACCESSIBILITY AFTER PAYMENT */}
        {hasPaidBooking && (
          <>
            {/* LIVE NOTIFICATION ALERT BANNER */}
            <View style={styles.notificationBanner}>
              <Ionicons name="notifications" size={20} color={BLUE} />
              <Text style={styles.notificationText}>
                Your slot is next in line! Estimated wait time: <Text style={{fontWeight: '700'}}>12 mins</Text>
              </Text>
            </View>

            {/* QUICK STATUS / MY QUEUE */}
            <Text style={styles.sectionTitle}>🎫 Your Active Queue</Text>
            <View style={styles.queueCard}>
              <View style={styles.queueHeader}>
                <Text style={styles.queueNumber}>#042</Text>
                <View style={[styles.badge, { backgroundColor: BLUE_TINT }]}>
                  <Text style={[styles.badgeText, { color: BLUE }]}>On Deck</Text>
                </View>
              </View>
              <View style={styles.dividerLine} />
              <View style={styles.queueDetailsRow}>
                <View>
                  <Text style={styles.detailLabel}>VEHICLE</Text>
                  <Text style={styles.detailValue}>SUV (ABC 1234)</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.detailLabel}>DURATION</Text>
                  <Text style={styles.detailValue}>~45 Mins</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* MAIN CARWASH LISTINGS — REAL DATA FROM shop_profile_setup + bays */}
        <Text style={styles.sectionTitle}>🏪 Available Carwash Branches</Text>

        {isLoadingShops ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={BLUE} />
          </View>
        ) : shops.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={28} color={GRAY} />
            <Text style={styles.emptyStateText}>No carwash branches available yet.</Text>
          </View>
        ) : (
          shops.map((shop) => {
            const location = [shop.barangay, shop.city, shop.province].filter(Boolean).join(', ');
            const noBaysConfigured = shop.totalBays === 0;
            const full = isShopFull(shop);
            const available = getAvailableSlots(shop);

            let badgeColor = BLUE;
            let badgeText = `${available}/${shop.totalBays} Slot${shop.totalBays === 1 ? '' : 's'}`;

            if (noBaysConfigured) {
              badgeColor = GRAY;
              badgeText = 'N/A';
            } else if (full) {
              badgeColor = DANGER;
              badgeText = 'Full';
            }

            return (
              <TouchableOpacity
                key={shop.id}
                style={[styles.taskRow, full && styles.taskRowDisabled]}
                activeOpacity={0.7}
                onPress={() => handleSelectBranch(shop)}
              >
                <View style={styles.taskIconContainer}>
                  <Ionicons name="business-outline" size={24} color="#4B5563" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.taskName}>{shop.shop_name}</Text>
                  <Text style={styles.taskDate}>{location || 'Location not set'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: `${badgeColor}15` }]}>
                  <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ACCOUNT MENU MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={menuVisible}
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Account Menu</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Ionicons name="close" size={24} color={NAVY} />
              </TouchableOpacity>
            </View>

            {/* PROFILE LINK */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('customer/profile' as any); }}>
              <Ionicons name="person-circle-outline" size={22} color={NAVY} />
              <Text style={styles.menuItemText}>Edit Profile</Text>
            </TouchableOpacity>

            {/* HISTORY LINK */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('customer/history' as any); }}>
              <Ionicons name="time-outline" size={22} color={NAVY} />
              <Text style={styles.menuItemText}>Transaction History</Text>
            </TouchableOpacity>

            <View style={styles.modalDivider} />

            {/* LOGOUT BUTTON */}
            <TouchableOpacity style={[styles.menuItem, { marginTop: 'auto' }]} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color={DANGER} />
              <Text style={[styles.menuItemText, { color: DANGER }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PROCEED TO BOOKING MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={bookingModalVisible}
        onRequestClose={handleCancelBooking}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bookingModalContainer}>
            <View style={styles.bookingIconWrap}>
              <Ionicons name="business" size={28} color={BLUE} />
            </View>

            <Text style={styles.bookingModalTitle}>Proceed to Booking</Text>
            <Text style={styles.bookingModalSubtitle}>
              Do you want to reserve a slot at{' '}
              <Text style={{ fontWeight: '700', color: NAVY }}>{selectedShop?.shop_name}</Text>?
            </Text>

            {selectedShop ? (
              <Text style={styles.bookingSlotsText}>
                {getAvailableSlots(selectedShop)}/{selectedShop.totalBays} slot
                {selectedShop.totalBays === 1 ? '' : 's'} available
              </Text>
            ) : null}

            {selectedShopLocation ? (
              <View style={styles.bookingLocationRow}>
                <Ionicons name="location-outline" size={16} color={GRAY} />
                <Text style={styles.bookingLocationText}>{selectedShopLocation}</Text>
              </View>
            ) : null}

            <View style={styles.bookingModalActions}>
              <TouchableOpacity
                style={[styles.bookingModalBtn, styles.bookingModalBtnCancel]}
                onPress={handleCancelBooking}
                activeOpacity={0.8}
              >
                <Text style={styles.bookingModalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bookingModalBtn, styles.bookingModalBtnConfirm]}
                onPress={handleConfirmBooking}
                activeOpacity={0.8}
              >
                <Text style={styles.bookingModalBtnConfirmText}>Yes, Book Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* LOGOUT CONFIRMATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={logoutModalVisible}
        onRequestClose={handleCancelLogout}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bookingModalContainer}>
            <View style={[styles.bookingIconWrap, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="log-out-outline" size={28} color={DANGER} />
            </View>

            <Text style={styles.bookingModalTitle}>Logout</Text>
            <Text style={styles.bookingModalSubtitle}>
              Are you sure you want to sign out?
            </Text>

            <View style={styles.bookingModalActions}>
              <TouchableOpacity
                style={[styles.bookingModalBtn, styles.bookingModalBtnCancel]}
                onPress={handleCancelLogout}
                activeOpacity={0.8}
                disabled={isLoggingOut}
              >
                <Text style={styles.bookingModalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bookingModalBtn, styles.logoutModalBtnConfirm]}
                onPress={handleConfirmLogout}
                activeOpacity={0.8}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <Text style={styles.bookingModalBtnConfirmText}>Logout</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* GENERIC INFO / WARNING / ERROR MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!infoModal}
        onRequestClose={closeInfoModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bookingModalContainer}>
            {infoModal && (
              <>
                <View
                  style={[
                    styles.bookingIconWrap,
                    { backgroundColor: infoModal.type === 'error' ? '#FEF2F2' : BLUE_TINT },
                  ]}
                >
                  <Ionicons
                    name={infoModal.type === 'error' ? 'close-circle' : 'alert-circle'}
                    size={28}
                    color={infoModal.type === 'error' ? DANGER : BLUE}
                  />
                </View>

                <Text style={styles.bookingModalTitle}>{infoModal.title}</Text>
                <Text style={styles.bookingModalSubtitle}>{infoModal.message}</Text>

                <TouchableOpacity
                  style={styles.infoModalOkBtn}
                  onPress={closeInfoModal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.bookingModalBtnConfirmText}>OK</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: BG 
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
    color: WHITE,
    fontSize: 18,
    fontWeight: '800',
  },
  greeting: { 
    color: '#94A3B8', 
    fontSize: 13, 
    fontWeight: '500' 
  },
  name: { 
    color: WHITE, 
    fontSize: 20, 
    fontWeight: '700', 
    marginTop: 2 
  },
  roleContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 4 
  },
  onlineDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: '#10B981', 
    marginRight: 6 
  },
  role: { 
    color: BLUE_LIGHT, 
    fontSize: 12, 
    fontWeight: '600' 
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
  },
  homeServiceBtn: {
    backgroundColor: WHITE,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  homeServiceIconContainer: {
    backgroundColor: BLUE,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeServiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  homeServiceSubtitle: {
    fontSize: 11,
    color: GRAY,
    marginTop: 2,
  },
  notificationBanner: {
    backgroundColor: NAVY,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: BLUE,
  },
  notificationText: { 
    color: '#E2E8F0', 
    fontSize: 13, 
    marginLeft: 10, 
    flex: 1, 
    lineHeight: 18 
  },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#1E293B', 
    paddingHorizontal: 16, 
    paddingTop: 20, 
    paddingBottom: 10 
  },
  queueCard: {
    backgroundColor: WHITE,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  queueHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  queueNumber: { 
    fontSize: 32, 
    fontWeight: '900', 
    color: NAVY, 
    letterSpacing: -0.5, 
    flex: 1 
  },
  queueDetailsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginTop: 12 
  },
  detailLabel: { 
    fontSize: 10, 
    fontWeight: '700', 
    color: '#94A3B8', 
    letterSpacing: 0.5 
  },
  detailValue: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#1E293B', 
    marginTop: 2 
  },
  taskRow: { 
    backgroundColor: WHITE, 
    marginHorizontal: 16, 
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
  taskRowDisabled: {
    opacity: 0.55,
  },
  taskIconContainer: { 
    backgroundColor: '#F1F5F9', 
    padding: 8, 
    borderRadius: 10 
  },
  taskName: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B' 
  },
  taskDate: { 
    fontSize: 12, 
    color: GRAY, 
    marginTop: 2 
  },
  badge: { 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 10 
  },
  badgeText: { 
    fontSize: 12, 
    fontWeight: '700' 
  },
  dividerLine: { 
    height: 1, 
    backgroundColor: '#F1F5F9', 
    marginVertical: 12 
  },
  emptyState: {
    marginHorizontal: 16,
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingVertical: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GRAY_LIGHT,
    borderStyle: 'dashed',
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.4)', 
    justifyContent: 'flex-end' 
  },
  menuContainer: { 
    backgroundColor: WHITE, 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    padding: 24, 
    minHeight: 300 
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 24 
  },
  menuTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: NAVY 
  },
  menuItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9' 
  },
  menuItemText: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#334155', 
    marginLeft: 12 
  },
  modalDivider: { 
    height: 1, 
    backgroundColor: GRAY_LIGHT, 
    marginVertical: 10 
  },
  bookingModalContainer: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  bookingIconWrap: {
    backgroundColor: BLUE_TINT,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  bookingModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 8,
    textAlign: 'center',
  },
  bookingModalSubtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  bookingSlotsText: {
    fontSize: 13,
    fontWeight: '700',
    color: BLUE,
    marginTop: 8,
  },
  bookingLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  bookingLocationText: {
    fontSize: 12,
    color: GRAY,
    marginLeft: 4,
  },
  bookingModalActions: {
    flexDirection: 'row',
    marginTop: 22,
    width: '100%',
  },
  bookingModalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingModalBtnCancel: {
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  bookingModalBtnCancelText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
  bookingModalBtnConfirm: {
    backgroundColor: BLUE,
    marginLeft: 8,
  },
  bookingModalBtnConfirmText: {
    color: WHITE,
    fontWeight: '700',
    fontSize: 14,
  },
  logoutModalBtnConfirm: {
    backgroundColor: DANGER,
    marginLeft: 8,
  },
  infoModalOkBtn: {
    backgroundColor: NAVY,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
});