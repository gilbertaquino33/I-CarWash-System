import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_TINT = '#EFF6FF';
const GREEN = '#16A34A';
const GREEN_TINT = '#DCFCE7';
const AMBER = '#D97706';
const AMBER_TINT = '#FEF3C7';
const RED = '#DC2626';
const RED_TINT = '#FEE2E2';
const GRAY = '#64748B';
const GRAY_TINT = '#F1F5F9';


const ARRIVAL_ALLOTMENT_MINUTES = 30;

type reservationtatus = 'Waiting' | 'Washing' | 'Completed' | 'Voided';
type PaymentStatus = 'paid' | 'unpaid';

interface ReservationRow {
  id: number; 

  customer_id: string; 
  shop_id: number;
  customer_name: string | null; 
  vehicle_type: string;
  service_type: string;
  status: reservationtatus;
  payment_status: PaymentStatus | null;
  created_at: string;
  reservation_date: string;
  price: number | null;
}

type TabKey = 'New' | 'Washing' | 'Completed' | 'Voided';

const TABS: { key: TabKey; statuses: reservationtatus[]; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'New', statuses: ['Waiting'], icon: 'time-outline' },
  { key: 'Washing', statuses: ['Washing'], icon: 'water-outline' },
  { key: 'Completed', statuses: ['Completed'], icon: 'checkmark-circle-outline' },
  { key: 'Voided', statuses: ['Voided'], icon: 'close-circle-outline' },
];

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function msRemaining(createdAt: string) {
  const expiresAt = new Date(createdAt).getTime() + ARRIVAL_ALLOTMENT_MINUTES * 60000;
  return expiresAt - Date.now();
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// FIX: para hindi ma-treat as "same day / kanina lang" ang mga stale
// o test-seeded na reservation na galing pa sa ibang araw (hal. kahapon),
// kinukumpara natin ang reservation_date sa TALAGANG kasalukuyang araw
// (local date, YYYY-MM-DD) bago i-allow ang auto-void countdown dito.
// Kung galing sa ibang araw ang reservation pero "Waiting" pa rin ito,
// itinuturing na nating abnormal/stale na case -- kailangan na ng staff
// mismo ang mag-desisyon dito (manual Void), hindi na ito dapat
// awtomatikong ma-void ng background timer.
function isFromToday(reservationDate: string) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  return reservationDate === todayStr;
}


interface ConfirmState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
}
const initialConfirm: ConfirmState = {
  visible: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  confirmColor: BLUE,
  onConfirm: () => {},
};

interface FeedbackState {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'error';
}
const initialFeedback: FeedbackState = { visible: false, title: '', message: '', type: 'error' };

function createFreshChannel(channelName: string) {
  const topic = `realtime:${channelName}`;
  const existing = supabase.getChannels().find((ch) => ch.topic === topic);
  if (existing) supabase.removeChannel(existing);
  return supabase.channel(channelName);
}

export default function StaffreservationScreen() {
  const [assignedShopId, setAssignedShopId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reservation, setreservation] = useState<ReservationRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('New');
  const [, setTick] = useState(0); // ginagamit lang para mag-re-render ang countdown bawat segundo
  const [busyId, setBusyId] = useState<number | null>(null); // FIX: id-based na, hindi customer_id

  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string, type: 'success' | 'error' = 'error') =>
    setFeedback({ visible: true, title, message, type });

  // FIX: hawak natin dito ang PINAKABAGONG "reservation" array sa isang
  // ref, para hindi na kailangang i-recreate/restart ang 15-second
  // auto-void interval tuwing nag-uupdate ang listahan (dati, kada
  // pag-refresh ng "reservation" state ay nire-restart din ang buong
  // setInterval dahil kasama ito sa dependency array).
  const reservationRef = useRef<ReservationRow[]>([]);
  useEffect(() => {
    reservationRef.current = reservation;
  }, [reservation]);

  // ---------- Auth / shop resolution ----------
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('shop_id')
        .eq('id', session.user.id)
        .single();
      if (isMounted) setAssignedShopId(data?.shop_id ? Number(data.shop_id) : null);
    })();
    return () => { isMounted = false; };
  }, []);

  // ---------- Fetch today's reservation for this shop ----------
  const fetchreservation = useCallback(async (shopId: number | null) => {
    if (!shopId) {
      setreservation([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    
    const { data, error } = await supabase
      .from('reservation')

      .select('id, customer_id, shop_id, customer_name, vehicle_type, service_type, status, payment_status, created_at, reservation_date, price')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      
      .limit(300);

    if (error) {
      showFeedback('Failed to Load', error.message);
    } else {
      setreservation((data ?? []) as ReservationRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!assignedShopId) return;
    fetchreservation(assignedShopId);
    
    const channel = createFreshChannel('staff-reservation-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservation', filter: `shop_id=eq.${assignedShopId}` },
        () => fetchreservation(assignedShopId)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [assignedShopId, fetchreservation]);

  useFocusEffect(useCallback(() => { fetchreservation(assignedShopId); }, [assignedShopId, fetchreservation]));

  // ---------- Countdown ticker ----------
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ---------- Void a reservation (manual or auto-expired) ----------
  const handleVoid = useCallback(async (row: ReservationRow, silent = false) => {
   
    const { error } = await supabase
      .from('reservation')
      .update({ status: 'Voided' })
      .eq('id', row.id);

    if (error && !silent) {
      showFeedback('Void Failed', error.message);
      return;
    }
    setreservation((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: 'Voided' } : r))
    );
  }, []);

  // FIX: ang auto-void check ngayon ay:
  //   1) tumatakbo lang minsan sa buong lifetime ng screen (empty dependency
  //      array + reservationRef) sa halip na paulit-ulit na nase-setup at
  //      nase-teardown tuwing nag-uupdate ang "reservation" state, at
  //   2) ino-only apply ang 30-minute auto-void sa mga reservation na
  //      TALAGANG kanina/ngayong araw lang ginawa (isFromToday), para
  //      hindi awtomatikong ma-void ang mga stale/luma na "Waiting" rows
  //      (hal. galing pa sa nakaraang araw dahil test data o hindi
  //      na-clean up) sa sandaling mag-load lang ang screen.
  useEffect(() => {
    const check = setInterval(() => {
      reservationRef.current
        .filter(
          (r) =>
            r.status === 'Waiting' &&
            isFromToday(r.reservation_date) &&
            msRemaining(r.created_at) <= 0
        )
        .forEach((r) => handleVoid(r, true));
    }, 15000);
    return () => clearInterval(check);
  }, [handleVoid]);

  // ---------- Actions (silent -- tinatawag lang matapos mag-confirm) ----------
  const updateStatus = async (row: ReservationRow, newStatus: reservationtatus) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from('reservation')
      .update({ status: newStatus })
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      showFeedback('Update Failed', error.message);
      return;
    }
    setreservation((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r))
    );
  };

  const togglePaid = async (row: ReservationRow) => {
    const next: PaymentStatus = row.payment_status === 'paid' ? 'unpaid' : 'paid';
    setBusyId(row.id);
    const { error } = await supabase
      .from('reservation')
      .update({ payment_status: next })
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      showFeedback('Could Not Update Payment', error.message);
      return;
    }
    setreservation((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, payment_status: next } : r))
    );
  };

  
  const handleCompleteAndMarkPaid = useCallback(async (row: ReservationRow) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from('reservation')
      .update({ status: 'Completed', payment_status: 'paid' })
      .eq('id', row.id);
    setBusyId(null);

    if (error) {
      showFeedback('Update Failed', error.message);
      return;
    }

    setreservation((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, status: 'Completed', payment_status: 'paid' }
          : r
      )
    );
    showFeedback(
      'Marked as Completed',
      `${row.vehicle_type} (${row.service_type}) is now Completed and marked as PAID.`,
      'success'
    );
  }, []);

 
  const confirmStartWashing = (row: ReservationRow) => {
    setConfirm({
      visible: true,
      title: 'Start Washing?',
      message: `Confirm that ${row.vehicle_type} (${row.service_type}) has arrived and is now starting service. This moves it to the Washing tab.`,
      confirmLabel: 'Start Washing',
      confirmColor: BLUE,
      onConfirm: () => {
        closeConfirm();
        updateStatus(row, 'Washing');
      },
    });
  };

  const confirmVoid = (row: ReservationRow) => {
    setConfirm({
      visible: true,
      title: 'Void This Reservation?',
      message: `This will free up the bay for ${row.vehicle_type} (${row.service_type}). Use this if the customer didn't show up.`,
      confirmLabel: 'Void',
      confirmColor: RED,
      onConfirm: () => {
        closeConfirm();
        handleVoid(row);
      },
    });
  };

  // confirmation bago i-mark ang isang "Washing" reservation bilang
  // "Completed" -- malinaw dito sa message na ito rin ay awtomatikong
  // magma-mark ng payment status bilang PAID.
  const confirmComplete = (row: ReservationRow) => {
    setConfirm({
      visible: true,
      title: 'Mark as Completed?',
      message: `This will mark ${row.vehicle_type} (${row.service_type}) as Completed and automatically set its payment status to PAID. Continue?`,
      confirmLabel: 'Mark Completed',
      confirmColor: GREEN,
      onConfirm: () => {
        closeConfirm();
        handleCompleteAndMarkPaid(row);
      },
    });
  };

  
  const confirmTogglePaid = (row: ReservationRow) => {
    const isMarkingPaid = row.payment_status !== 'paid';
    setConfirm({
      visible: true,
      title: isMarkingPaid ? 'Mark as Paid?' : 'Mark as Unpaid?',
      message: isMarkingPaid
        ? `Confirm that payment for ${row.vehicle_type} (${row.service_type}) has been received.`
        : `This will revert ${row.vehicle_type} (${row.service_type}) back to UNPAID. Use this only if marked paid by mistake.`,
      confirmLabel: isMarkingPaid ? 'Mark Paid' : 'Mark Unpaid',
      confirmColor: isMarkingPaid ? GREEN : AMBER,
      onConfirm: () => {
        closeConfirm();
        togglePaid(row);
      },
    });
  };

  const visiblereservation = reservation.filter((r) =>
    TABS.find((t) => t.key === activeTab)!.statuses.includes(r.status)
  );
  const newCount = reservation.filter((r) => r.status === 'Waiting').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>reservation</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? '#fff' : GRAY} />
              <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>{tab.key}</Text>
              {tab.key === 'New' && newCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{newCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="small" color={BLUE} style={{ marginTop: 40 }} />
        ) : visiblereservation.length === 0 ? (
          <Text style={styles.emptyText}>No {activeTab.toLowerCase()} reservation right now.</Text>
        ) : (
          visiblereservation.map((row) => {
            const remaining = row.status === 'Waiting' ? msRemaining(row.created_at) : null;
            const isUrgent = remaining !== null && remaining <= 5 * 60000;
            const isPaid = row.payment_status === 'paid';
            const isBusy = busyId === row.id;

            return (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{row.vehicle_type}</Text>
                    <Text style={styles.cardSubtitle}>{row.service_type}</Text>

                    {/* pangalan ng customer na nag-reserve, laging visible sa
                        card para makilala agad ng staff kung sino ang
                        hinihintay nila. */}
                    {row.customer_name ? (
                      <View style={styles.customerRow}>
                        <Ionicons name="person-outline" size={12} color={GRAY} />
                        <Text style={styles.customerName}>{row.customer_name}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Shopee-rider style tag: laging visible, hindi kailangang
                      i-tap para malaman. FIX: dumadaan na muna sa
                      confirmTogglePaid() bago mag-update, hindi na diretso. */}
                  <TouchableOpacity
                    style={[styles.payTag, isPaid ? styles.payTagPaid : styles.payTagUnpaid]}
                    onPress={() => confirmTogglePaid(row)}
                    disabled={isBusy}
                  >
                    <Ionicons
                      name={isPaid ? 'checkmark-circle' : 'time-outline'}
                      size={13}
                      color={isPaid ? GREEN : AMBER}
                    />
                    <Text style={[styles.payTagText, { color: isPaid ? GREEN : AMBER }]}>
                      {isPaid ? 'PAID' : 'UNPAID'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.cardMetaRow}>
                  <Text style={styles.cardPrice}>{row.price ? formatPeso(row.price) : '—'}</Text>
                  {remaining !== null && isFromToday(row.reservation_date) && (
                    <View style={[styles.countdownPill, isUrgent && styles.countdownPillUrgent]}>
                      <Ionicons name="hourglass-outline" size={12} color={isUrgent ? RED : BLUE} />
                      <Text style={[styles.countdownText, { color: isUrgent ? RED : BLUE }]}>
                        {formatCountdown(remaining)} left to arrive
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardActions}>
                  {row.status === 'Waiting' && (
                    <>
                      {/* FIX: "Customer Arrived — Start" ay dumadaan na rin
                          muna sa confirmation modal (confirmStartWashing),
                          hindi na diretso tumatawag sa updateStatus. */}
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPrimary]}
                        onPress={() => confirmStartWashing(row)}
                        disabled={isBusy}
                      >
                        <Text style={styles.actionBtnPrimaryText}>Customer Arrived — Start</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnGhost]}
                        onPress={() => confirmVoid(row)}
                        disabled={isBusy}
                      >
                        <Text style={styles.actionBtnGhostText}>Void</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {row.status === 'Washing' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnPrimary, { flex: 1 }]}
                      onPress={() => confirmComplete(row)}
                      disabled={isBusy}
                    >
                      <Text style={styles.actionBtnPrimaryText}>Mark as Completed</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      
      <Modal visible={confirm.visible} transparent animationType="fade" onRequestClose={closeConfirm}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{confirm.title}</Text>
            <Text style={styles.modalMessage}>{confirm.message}</Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={closeConfirm}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: confirm.confirmColor }]}
                onPress={confirm.onConfirm}
              >
                <Text style={styles.modalBtnText}>{confirm.confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FEEDBACK MODAL */}
      <Modal visible={feedback.visible} transparent animationType="fade" onRequestClose={closeFeedback}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{feedback.title}</Text>
            <Text style={styles.modalMessage}>{feedback.message}</Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: feedback.type === 'success' ? GREEN : BLUE, width: '100%' }]}
              onPress={closeFeedback}
            >
              <Text style={styles.modalBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: NAVY,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },

  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },
  tabBtnActive: { backgroundColor: BLUE, borderColor: BLUE },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: GRAY },
  tabBtnTextActive: { color: '#fff' },
  tabBadge: { backgroundColor: RED, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 2 },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  emptyText: { textAlign: 'center', color: GRAY, marginTop: 40, fontSize: 13 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: NAVY },
  cardSubtitle: { fontSize: 12, color: GRAY, marginTop: 2 },

  // pangalan ng customer sa ilalim ng vehicle/service type
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  customerName: { fontSize: 12, color: GRAY, fontWeight: '600' },

  payTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  payTagPaid: { backgroundColor: GREEN_TINT, borderColor: '#BBF7D0' },
  payTagUnpaid: { backgroundColor: AMBER_TINT, borderColor: '#FDE68A' },
  payTagText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },

  cardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  cardPrice: { fontSize: 16, fontWeight: '900', color: NAVY },
  countdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BLUE_TINT, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  countdownPillUrgent: { backgroundColor: RED_TINT },
  countdownText: { fontSize: 11, fontWeight: '700' },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: BLUE, flex: 2 },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  actionBtnGhost: { backgroundColor: GRAY_TINT, flex: 1 },
  actionBtnGhostText: { color: GRAY, fontWeight: '800', fontSize: 12.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,18,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 20, padding: 22, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: NAVY, marginBottom: 6, textAlign: 'center' },
  modalMessage: { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  modalBtnRow: { flexDirection: 'row', width: '100%', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: GRAY_TINT },
  modalBtnGhostText: { color: GRAY, fontWeight: '700', fontSize: 13 },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});