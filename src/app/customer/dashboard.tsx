import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface ShopBranch {
  id: number;
  shop_name: string;
  province: string;
  city: string;
  barangay: string;
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
  }, []);

  const fetchShops = async () => {
    try {
      const { data, error } = await supabase
        .from('shop_profile_setup')
        .select('id, shop_name, province, city, barangay')
        .order('id', { ascending: false });

      if (error) throw error;
      setShops((data as ShopBranch[]) ?? []);
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
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        router.replace('/customer/customer-registration');
      }},
    ]);
  };

  const handleSelectBranch = (shop: ShopBranch) => {
    const location = [shop.barangay, shop.city, shop.province].filter(Boolean).join(', ');

    Alert.alert('Proceed to Booking', `Do you want to reserve a slot at ${shop.shop_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Book Now',
        onPress: () => router.push({ pathname: '/customer/reserve' as any, params: { shopId: String(shop.id), shopName: shop.shop_name } } as any),
      }
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* TOP BAR / APP HEADER (Patterned exactly after Staff Dashboard) */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome Back! ✨</Text>
            <Text style={styles.name}>{profile?.full_name ?? 'Loading...'}</Text>
            <View style={styles.roleContainer}>
              <View style={styles.onlineDot} />
              <Text style={styles.role}>Customer</Text>
            </View>
          </View>

          {/* MENU BURGER BUTTON */}
          <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuVisible(true)}>
            <Ionicons name="menu-outline" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* HOME SERVICE QUICK ACCESS */}
        <TouchableOpacity
          style={styles.homeServiceBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/customer/homeservice' as any)}
        >
          <View style={styles.homeServiceIconContainer}>
            <Ionicons name="home" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.homeServiceTitle}>Home Service</Text>
            <Text style={styles.homeServiceSubtitle}>Book a wash sa bahay mo o i-track ang request mo</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* CONDITION 1: QUEUE ACCESSIBILITY AFTER PAYMENT */}
        {hasPaidBooking && (
          <>
            {/* LIVE NOTIFICATION ALERT BANNER */}
            <View style={styles.notificationBanner}>
              <Ionicons name="notifications" size={20} color="#F5C518" />
              <Text style={styles.notificationText}>
                Your slot is next in line! Estimated wait time: <Text style={{fontWeight: '700'}}>12 mins</Text>
              </Text>
            </View>

            {/* QUICK STATUS / MY QUEUE */}
            <Text style={styles.sectionTitle}>🎫 Your Active Queue</Text>
            <View style={styles.queueCard}>
              <View style={styles.queueHeader}>
                <Text style={styles.queueNumber}>#042</Text>
                <View style={[styles.badge, { backgroundColor: '#10B98115' }]}>
                  <Text style={[styles.badgeText, { color: '#10B981' }]}>On Deck</Text>
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

        {/* MAIN CARWASH LISTINGS — REAL DATA FROM shop_profile_setup */}
        <Text style={styles.sectionTitle}>🏪 Available Carwash Branches</Text>

        {isLoadingShops ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#F5C518" />
          </View>
        ) : shops.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={28} color="#94A3B8" />
            <Text style={styles.emptyStateText}>No carwash branches available yet.</Text>
          </View>
        ) : (
          shops.map((shop) => {
            const location = [shop.barangay, shop.city, shop.province].filter(Boolean).join(', ');
            return (
              <TouchableOpacity
                key={shop.id}
                style={styles.taskRow}
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
                <View style={[styles.badge, { backgroundColor: '#10B98115' }]}>
                  <Text style={[styles.badgeText, { color: '#10B981' }]}>Open</Text>
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
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            {/* PROFILE LINK */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('customer/profile' as any); }}>
              <Ionicons name="person-circle-outline" size={22} color="#0F172A" />
              <Text style={styles.menuItemText}>Edit Profile</Text>
            </TouchableOpacity>

            {/* HISTORY LINK */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('customer/history' as any); }}>
              <Ionicons name="time-outline" size={22} color="#0F172A" />
              <Text style={styles.menuItemText}>Transaction History</Text>
            </TouchableOpacity>

            <View style={styles.modalDivider} />

            {/* LOGOUT BUTTON (Matching Staff Logout Color Theme) */}
            <TouchableOpacity style={[styles.menuItem, { marginTop: 'auto' }]} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  header: { 
    backgroundColor: '#0F172A', 
    padding: 24, 
    paddingTop: 60, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  greeting: { 
    color: '#94A3B8', 
    fontSize: 13, 
    fontWeight: '500' 
  },
  name: { 
    color: '#fff', 
    fontSize: 22, 
    fontWeight: '700', 
    marginTop: 2 
  },
  roleContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 6 
  },
  onlineDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: '#10B981', 
    marginRight: 6 
  },
  role: { 
    color: '#F5C518', 
    fontSize: 13, 
    fontWeight: '600' 
  },
  menuBtn: { 
    backgroundColor: 'rgba(255, 255, 255, 0.1)', 
    borderRadius: 12, 
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  homeServiceBtn: {
    backgroundColor: '#fff',
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
    backgroundColor: '#06B6D4',
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
    color: '#64748B',
    marginTop: 2,
  },
  notificationBanner: {
    backgroundColor: '#0F172A',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#F5C518',
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
    backgroundColor: '#fff',
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
    color: '#0F172A', 
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
    backgroundColor: '#fff', 
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
    color: '#64748B', 
    marginTop: 2 
  },
  slotsText: { 
    fontSize: 12, 
    fontWeight: '700', 
    marginTop: 4 
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
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  
  // MODAL MENU DESIGN
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.4)', 
    justifyContent: 'flex-end' 
  },
  menuContainer: { 
    backgroundColor: '#fff', 
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
    color: '#0F172A' 
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

    
    backgroundColor: '#E2E8F0', 
    marginVertical: 10 
  }
});

