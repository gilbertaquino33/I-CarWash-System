import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
}

interface StaffRow {
  id: string;
  full_name: string;
  mobile?: string | null;
  role?: string | null;
  created_at?: string;
}

const statusColor = (status: string) => {
  switch (status) {
    case 'Waiting':
      return '#F59E0B';
    case 'Washing':
      return '#3B82F6';
    case 'Completed':
      return '#10B981';
    default:
      return '#94A3B8';
  }
};

// ─────────────────────────────────────────
//  THEME (blue + black/white — consistent sa Customer Dashboard)
// ─────────────────────────────────────────
const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#60A5FA';
const ERROR = '#DC2626';

// ─────────────────────────────────────────────────────────────
//  FIX: SAFE REALTIME CHANNEL CREATION
//
//  Ang error na "cannot add `postgres_changes` callbacks for
//  realtime:<name> after `subscribe()`" ay nangyayari kapag may
//  existing na channel pa rin sa supabase-js internal registry na
//  may parehong pangalan (galing sa dating mount / Fast Refresh /
//  mabilis na remount) bago pa na-alis ng cleanup. Kapag tumawag
//  ka ng `.channel('same-name')` habang naka-subscribe pa yung
//  dati, ibabalik nito yung DATING channel instance (hindi bago),
//  kaya pag tinawag mo ulit ang `.on()` dun -- error.
//
//  Solusyon: bago gumawa ng bagong channel, hanapin muna sa
//  `supabase.getChannels()` kung may existing na may parehong
//  topic, at i-`removeChannel` muna agad bago gumawa ng bago.
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────
//  REUSABLE: Confirm modal (replaces Alert.alert confirms)
// ─────────────────────────────────────────
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

// ─────────────────────────────────────────
//  REUSABLE: Error / notice modal (single button, replaces Alert.alert notices)
// ─────────────────────────────────────────
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
  const [assignedShopId, setAssignedShopId] = useState<number | null>(null);
  const [assignedShopName, setAssignedShopName] = useState('');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loadingStaffList, setLoadingStaffList] = useState(true);
  const [queue, setQueue] = useState<ReservationRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string) => setFeedback({ visible: true, title, message });

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
      setAssignedShopId(metaShopId ? Number(metaShopId) : null);
      setAssignedShopName(metaShopName);
    };
    checkAuth();
  }, []);

  const fetchQueue = async (shopId?: number | null) => {
    setLoadingQueue(true);
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('reservation')
      .select('customer_id, shop_id, vehicle_type, service_type, status, created_at, reservation_date')
      .eq('reservation_date', today)
      .order('created_at', { ascending: false });

    if (shopId) {
      query = query.eq('shop_id', shopId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching reservations:', error);
    } else {
      setQueue(data ?? []);
    }
    setLoadingQueue(false);
  };

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
      // Walang error, pero walang na-update na row -- ibig sabihin
      // malamang naka-block ito ng Row Level Security sa Supabase (walang
      // UPDATE policy para sa anon key sa "reservation" table). Kaya lang
      // dati, nagpapakita na "Completed" sa UI kahit "Washing" pa rin
      // talaga sa DB -- huwag i-update ang local state kung ganito.
      console.log('[StaffDashboard] update affected 0 rows -- check RLS UPDATE policy on "reservation"');
      showFeedback(
        'Hindi na-save ang status',
        'Walang na-update sa database. Malamang naka-block ito ng Row Level Security sa Supabase -- payagan ang UPDATE gamit ang anon key sa "reservation" table.'
      );
      return;
    }

    // Optimistic local update habang naghihintay ng realtime refresh
    setQueue((prev) =>
      prev.map((item) => (item.customer_id === customerId ? { ...item, status: newStatus } : item))
    );
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

  useEffect(() => {
    fetchQueue(assignedShopId);
    fetchStaffList();

    const channel = createFreshChannel('reservation-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservation' },
        () => {
          fetchQueue(assignedShopId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [assignedShopId]);

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

  const waitingCount = queue.filter((q) => q.status === 'Waiting').length;
  const washingCount = queue.filter((q) => q.status === 'Washing').length;
  const completedCount = queue.filter((q) => q.status === 'Completed').length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good day! </Text>
            <Text style={styles.name}>{profile?.full_name ?? 'Loading...'}</Text>
            <View style={styles.roleContainer}>
              <View style={styles.onlineDot} />
              <Text style={styles.role}>Staff</Text>
            </View>
            {!!assignedShopName && <Text style={styles.shopName}>{assignedShopName}</Text>}
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
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
        <View style={styles.cardsGrid}>
          {[
            { icon: 'add-circle-outline', label: 'New Walk-in', route: '/staff/new-walkin', color: BLUE },
            { icon: 'home-outline', label: 'Home Service', route: '/staff/homeservice', color: BLUE_LIGHT },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.actionCard}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon as any} size={24} color={item.color} />
              </View>
              <Text style={styles.actionLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.queueOpenBtn} onPress={() => setQueueDrawerOpen(true)}>
          <View style={styles.queueOpenLeft}>
            <Ionicons name="menu" size={20} color="#1E293B" />
            <Text style={styles.queueOpenText}>Current Queue</Text>
          </View>
          <View style={styles.queueCountBadge}>
            <Text style={styles.queueCountText}>{queue.length}</Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* CURRENT QUEUE — bottom-sheet drawer, kaparehong layout ng
          Account Menu sa customer dashboard (slide up from bottom,
          rounded top corners, parehong header style) */}
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
                queue.map((item) => (
                  <View key={`${item.customer_id}-${item.created_at}`} style={styles.taskRow}>
                    <View style={styles.taskIconContainer}>
                      <Ionicons name="car-sport-outline" size={24} color="#4B5563" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.taskName}>{item.vehicle_type || 'Vehicle'}</Text>
                      <Text style={styles.taskDate}>{item.service_type || 'No service yet'}</Text>
                      {!!item.shop_id && <Text style={styles.taskShop}>Shop ID: {item.shop_id}</Text>}
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '15' }]}>
                        <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                      </View>

                      {item.status === 'Washing' && (
                        <TouchableOpacity
                          style={[styles.actionBtnSmall, { backgroundColor: '#10B981' }]}
                          onPress={() => handleUpdateStatus(item.customer_id, 'Completed')}
                        >
                          <Text style={styles.actionBtnSmallText}>Mark Complete</Text>
                        </TouchableOpacity>
                      )}

                      {item.status === 'Waiting' && (
                        <Text style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>
                          Waiting for bay detection
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  // Bottom-sheet drawer style -- ito na ang gamit instead ng dati nang
  // drawerOverlay/drawerBackdrop/drawerPanel (side drawer). Kaparehong
  // klase ng modalOverlay/menuContainer/modalHeader sa customer dashboard.
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
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ===== Confirm / feedback modal =====
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
