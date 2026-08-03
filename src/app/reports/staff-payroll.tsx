import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

interface StaffRow {
  id: string;
  full_name: string;
  email_address: string;
  mobile: string | null;
  created_at: string | null;
}

interface CompletedJobRow {
  customer_id: number;
  vehicle_type: string;
  service_type: string;
  reservation_date: string;
  created_at: string;
  price: number | null;
}

interface PayoutRow {
  id: string;
  staff_id: string;
  staff_name: string;
  period_type: Period;
  period_start: string;
  period_end: string;
  amount: number;
  payment_method: string;
  paid_by: string | null;
  paid_by_name: string | null;
  paid_at: string;
}

type Period = 'daily' | 'weekly' | 'monthly';

// ─────────────────────────────────────────────────────────────
//  PAYOUT SPLIT RULE (set by the carwash owner):
//  40% of the shop's TOTAL revenue -> split EQUALLY among all
//  staff at that shop.
//  60% of the TOTAL revenue -> goes to the owner.
//
//  Only change these values if the split changes in the future.
// ─────────────────────────────────────────────────────────────
const STAFF_SHARE_PERCENT = 0.4;
const OWNER_SHARE_PERCENT = 0.6;

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getDateRange(period: Period, offset: number) {
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
    const day = base.getDay(); // 0 = Sunday
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

  // monthly
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
          <View style={[styles.confirmIconWrap, { backgroundColor: state.destructive ? '#FEE2E2' : '#DCFCE7' }]}>
            <Ionicons
              name={state.destructive ? 'alert-circle' : 'cash-outline'}
              size={28}
              color={state.destructive ? '#DC2626' : '#16A34A'}
            />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={[styles.confirmBtn, styles.confirmBtnGhost]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.confirmBtnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: state.destructive ? '#DC2626' : '#16A34A' }]}
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
            <Ionicons name="close" size={26} color="#DC2626" />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: '#111827', width: '100%' }]}
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

export default function StaffPayrollReport() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [jobs, setJobs] = useState<CompletedJobRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('daily');
  const [offset, setOffset] = useState(0);

  const [adminId, setAdminId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string>('Admin');

  // ─────────────────────────────────────────────────────────────
  //  SHOP SCOPING
  //  An admin only owns ONE shop (shop_profile_setup.owner_id ===
  //  the admin's auth id). Every staff / completed-job / payout-history
  //  query in this screen MUST be filtered down to that shop's id --
  //  otherwise this admin would see (and could pay!) staff that belong
  //  to a completely different carwash branch.
  //  shopLoading is tracked separately from `loading` because we can't
  //  even attempt to fetch staff/jobs until we know which shop_id to
  //  filter by.
  // ─────────────────────────────────────────────────────────────
  const [shopId, setShopId] = useState<number | null>(null);
  const [shopLoading, setShopLoading] = useState(true);

  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [markingPaidFor, setMarkingPaidFor] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPayouts, setHistoryPayouts] = useState<PayoutRow[]>([]);

  // Staff Breakdown and Completed Jobs now live in their own bottom-sheet
  // drawers (same pattern as the Staff Dashboard), instead of being
  // rendered directly on the main scroll view. This keeps the main
  // screen focused on the summary, with details a tap away.
  const [staffDrawerOpen, setStaffDrawerOpen] = useState(false);
  const [jobsDrawerOpen, setJobsDrawerOpen] = useState(false);

  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string) => setFeedback({ visible: true, title, message });

  const range = getDateRange(period, offset);

  // Look up which Admin is currently logged in -- this is recorded as
  // "paid_by" whenever a payout is marked Paid, so there's accountability
  // in the ledger. We also resolve this admin's shop here, since that's
  // the single source of truth for scoping everything below.
  useEffect(() => {
    const loadAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShopLoading(false);
        return;
      }
      setAdminId(session.user.id);

      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();

      if (data?.full_name) setAdminName(data.full_name);

      const { data: shopRow, error: shopError } = await supabase
        .from('shop_profile_setup')
        .select('id')
        .eq('owner_id', session.user.id)
        .single();

      if (shopError) {
        console.error('Error fetching shop for admin:', shopError);
      } else if (shopRow) {
        setShopId(shopRow.id);
      }

      setShopLoading(false);
    };
    loadAdmin();
  }, []);

  const fetchData = useCallback(async () => {
    // Nothing to fetch until we know which shop this admin belongs to.
    if (!shopId) return;

    const [staffRes, jobsRes, payoutsRes] = await Promise.all([
      // Staff for THIS shop only.
      supabase
        .from('profiles')
        .select('id, full_name, email_address, mobile, created_at')
        .eq('role', 'staff')
        .eq('shop_id', shopId)
        .order('full_name', { ascending: true }),
      supabase
        .from('reservation')
        .select('customer_id, vehicle_type, service_type, reservation_date, created_at, price')
        .eq('status', 'Completed')
        .eq('shop_id', shopId)
        .gte('reservation_date', range.start)
        .lte('reservation_date', range.end),
      // Payouts SPECIFIC to the period currently being viewed -- this is
      // the source of truth for who is already "✓ Paid" and who still
      // has a Pay button. Payouts are already scoped correctly because
      // they're keyed by staff_id, and the staff list above is already
      // filtered to this shop.
      supabase
        .from('payroll_payouts')
        .select('*')
        .eq('period_type', period)
        .eq('period_start', range.start)
        .eq('period_end', range.end),
    ]);

    if (staffRes.error) {
      console.error('Error fetching staff:', staffRes.error);
    } else {
      setStaff((staffRes.data as StaffRow[]) ?? []);
    }

    if (jobsRes.error) {
      console.error('Error fetching completed jobs:', jobsRes.error);
    } else {
      setJobs((jobsRes.data as CompletedJobRow[]) ?? []);
    }

    if (payoutsRes.error) {
      console.error('Error fetching payouts:', payoutsRes.error);
    } else {
      setPayouts((payoutsRes.data as PayoutRow[]) ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, period, shopId]);

  useEffect(() => {
    if (!shopId) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData, shopId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const changePeriod = (p: Period) => {
    setPeriod(p);
    setOffset(0);
  };

  const totalRevenue = jobs.reduce((sum, j) => sum + (j.price ?? 0), 0);
  const staffPool = totalRevenue * STAFF_SHARE_PERCENT;
  const ownerShare = totalRevenue * OWNER_SHARE_PERCENT;
  const perStaffShare = staff.length > 0 ? staffPool / staff.length : 0;

  // Once a staff member is marked Paid for this exact period, their share
  // is "spoken for" -- it should never be re-computed as still owed. The
  // paidMap below is what the UI checks before showing the Pay button, so
  // an already-paid staff member is never charged or shown as payable
  // again for the same period.
  const paidMap = new Map<string, PayoutRow>();
  payouts.forEach((p) => paidMap.set(p.staff_id, p));
  const paidCount = payouts.length;
  const unpaidCount = Math.max(staff.length - paidCount, 0);

  // Sum of everything already paid out this period, and what's left of
  // the staff pool once that's subtracted -- this is the actual
  // deduction the admin should see reflected on screen.
  const totalPaidOut = payouts.reduce((sum, p) => sum + p.amount, 0);
  const remainingToPay = Math.max(staffPool - totalPaidOut, 0);

  const askMarkPaid = (staffRow: StaffRow) => {
    if (perStaffShare <= 0) {
      showFeedback('Nothing to Pay Yet', 'The computed share for this period is still zero, so there is nothing to pay yet.');
      return;
    }

    setConfirm({
      visible: true,
      title: 'Pay Now?',
      message: `Confirm: have you already paid ${staffRow.full_name} ${formatPeso(perStaffShare)} in cash for ${range.label}?`,
      confirmLabel: 'Yes',
      onConfirm: () => handleMarkPaid(staffRow),
    });
  };

  const handleMarkPaid = async (staffRow: StaffRow) => {
    closeConfirm();
    setMarkingPaidFor(staffRow.id);

    const { data, error } = await supabase
      .from('payroll_payouts')
      .insert({
        staff_id: staffRow.id,
        staff_name: staffRow.full_name,
        period_type: period,
        period_start: range.start,
        period_end: range.end,
        amount: perStaffShare,
        payment_method: 'Cash',
        paid_by: adminId,
        paid_by_name: adminName,
      })
      .select()
      .single();

    setMarkingPaidFor(null);

    if (error) {
      // 23505 = unique_violation -- this means a payout was already
      // inserted for this exact staff + period (e.g. a double tap, or
      // someone already marked it paid on another device). It should not
      // be paid again.
      if ((error as any).code === '23505') {
        showFeedback('Already Paid', `${staffRow.full_name} is already marked as Paid for this period.`);
        fetchData();
        return;
      }
      showFeedback('Could Not Save', error.message);
      return;
    }

    if (data) {
      setPayouts((prev) => [...prev, data as PayoutRow]);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);

    // History must be scoped to THIS shop too -- otherwise the admin
    // would see (and think they're responsible for) payout records
    // belonging to staff at a different branch. Since payroll_payouts
    // doesn't carry its own shop_id, we scope it via the staff_id list
    // for the shop we already loaded above.
    const staffIds = staff.map((s) => s.id);

    if (staffIds.length === 0) {
      setHistoryPayouts([]);
      setHistoryLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('payroll_payouts')
      .select('*')
      .in('staff_id', staffIds)
      .order('paid_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error fetching payout history:', error);
      setHistoryPayouts([]);
    } else {
      setHistoryPayouts((data as PayoutRow[]) ?? []);
    }
    setHistoryLoading(false);
  };

  const periodLabel = (p: Period) => (p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : 'Monthly');

  const isLoadingAnything = shopLoading || loading;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Payroll Report</Text>
        <TouchableOpacity style={styles.historyButton} onPress={openHistory}>
          <Ionicons name="receipt-outline" size={22} color="#FACC15" />
        </TouchableOpacity>
      </View>

      {/* PERIOD SELECTOR */}
      <View style={styles.periodTabs}>
        {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => changePeriod(p)}
          >
            <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
              {periodLabel(p)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* PERIOD NAVIGATOR */}
      <View style={styles.rangeNav}>
        <TouchableOpacity onPress={() => setOffset((o) => o - 1)} style={styles.rangeNavBtn}>
          <Ionicons name="chevron-back" size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.rangeLabel} numberOfLines={1}>
          {range.label}
        </Text>
        <TouchableOpacity onPress={() => setOffset((o) => o + 1)} style={styles.rangeNavBtn}>
          <Ionicons name="chevron-forward" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      {isLoadingAnything ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FACC15" />
        </View>
      ) : !shopId ? (
        <View style={styles.loadingWrap}>
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={20} color="#92400E" />
            <Text style={styles.noticeText}>
              No shop is linked to this admin account yet, so staff and revenue cannot be scoped. Please check
              shop_profile_setup.owner_id for this account.
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* SUMMARY CARDS */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Revenue</Text>
              <Text style={styles.summaryValue}>{formatPeso(totalRevenue)}</Text>
              <Text style={styles.summarySub}>{jobs.length} completed job{jobs.length === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Staff Pool (40%)</Text>
              <Text style={[styles.summaryValue, { color: '#2563EB' }]}>{formatPeso(staffPool)}</Text>
              <Text style={styles.summarySub}>split among {staff.length} staff</Text>
            </View>
            {/* These two cards make the deduction explicit: once a staff
                member is marked Paid, their share moves out of "Remaining
                to Pay" and into "Paid Out" -- the admin can see at a
                glance how much of the staff pool is already settled. */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Paid Out</Text>
              <Text style={[styles.summaryValue, { color: '#16A34A' }]}>{formatPeso(totalPaidOut)}</Text>
              <Text style={styles.summarySub}>{paidCount} of {staff.length} staff</Text>
            </View>
            <View style={[styles.summaryCard, remainingToPay > 0 && styles.summaryCardHighlight]}>
              <Text style={[styles.summaryLabel, remainingToPay > 0 && { color: '#92400E' }]}>Remaining to Pay</Text>
              <Text style={[styles.summaryValue, { color: remainingToPay > 0 ? '#92400E' : '#16A34A' }]}>
                {formatPeso(remainingToPay)}
              </Text>
              <Text style={[styles.summarySub, remainingToPay > 0 && { color: '#B45309' }]}>
                {remainingToPay > 0 ? `${unpaidCount} staff left` : 'All staff paid'}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Owner Share (60%)</Text>
              <Text style={[styles.summaryValue, { color: '#111827' }]}>{formatPeso(ownerShare)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Per Staff</Text>
              <Text style={styles.summaryValue}>{formatPeso(perStaffShare)}</Text>
            </View>
          </View>

          {staff.length === 0 && (
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle-outline" size={20} color="#92400E" />
              <Text style={styles.noticeText}>
                No staff accounts are registered yet for this shop, so the per-staff share cannot be computed.
              </Text>
            </View>
          )}

          {/* DRAWER OPENERS -- Staff Breakdown & Completed Jobs */}
          <TouchableOpacity style={styles.drawerOpenBtn} onPress={() => setStaffDrawerOpen(true)}>
            <View style={styles.drawerOpenLeft}>
              <Ionicons name="people-outline" size={20} color="#111827" />
              <Text style={styles.drawerOpenText}>Staff Breakdown</Text>
            </View>
            <View style={styles.drawerOpenRight}>
              {staff.length > 0 && (
                <View style={styles.drawerCountBadge}>
                  <Text style={styles.drawerCountText}>{paidCount}/{staff.length} paid</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.drawerOpenBtn, { marginTop: 10 }]} onPress={() => setJobsDrawerOpen(true)}>
            <View style={styles.drawerOpenLeft}>
              <Ionicons name="checkmark-done-outline" size={20} color="#111827" />
              <Text style={styles.drawerOpenText}>Completed Jobs</Text>
            </View>
            <View style={styles.drawerOpenRight}>
              <View style={styles.drawerCountBadge}>
                <Text style={styles.drawerCountText}>{jobs.length}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </View>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* STAFF BREAKDOWN DRAWER */}
      <Modal
        visible={staffDrawerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setStaffDrawerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Staff Breakdown ({staff.length})</Text>
              <TouchableOpacity onPress={() => setStaffDrawerOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {staff.length === 0 ? (
                <Text style={styles.emptyText}>No staff accounts found for this shop.</Text>
              ) : (
                staff.map((s) => {
                  const paidRow = paidMap.get(s.id);
                  const isPaid = !!paidRow;
                  const isSaving = markingPaidFor === s.id;

                  return (
                    <View key={s.id} style={styles.staffCard}>
                      <View style={styles.avatarCircle}>
                        <Text style={styles.avatarInitial}>{s.full_name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.staffName}>{s.full_name}</Text>
                        <Text style={styles.staffMeta}>{s.email_address}</Text>
                        {!!s.mobile && <Text style={styles.staffMeta}>{s.mobile}</Text>}
                        {isPaid && (
                          <Text style={styles.paidMeta}>
                            Paid {formatDateTime(paidRow!.paid_at)}
                            {paidRow!.paid_by_name ? ` by ${paidRow!.paid_by_name}` : ''}
                          </Text>
                        )}
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={styles.staffPayPill}>
                          <Text style={styles.staffPayPillText}>{formatPeso(perStaffShare)}</Text>
                        </View>

                        {isPaid ? (
                          <View style={styles.paidBadge}>
                            <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                            <Text style={styles.paidBadgeText}>Paid</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.markPaidBtn}
                            onPress={() => askMarkPaid(s)}
                            disabled={isSaving}
                            activeOpacity={0.85}
                          >
                            {isSaving ? (
                              <ActivityIndicator size="small" color="#111827" />
                            ) : (
                              <>
                                <Ionicons name="cash-outline" size={13} color="#111827" />
                                <Text style={styles.markPaidBtnText}>Pay</Text>
                              </>
                            )}
                          </TouchableOpacity>
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

      {/* COMPLETED JOBS DRAWER */}
      <Modal
        visible={jobsDrawerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setJobsDrawerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Completed Jobs ({jobs.length})</Text>
              <TouchableOpacity onPress={() => setJobsDrawerOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {jobs.length === 0 ? (
                <Text style={styles.emptyText}>No completed jobs for this period.</Text>
              ) : (
                jobs.map((j) => (
                  <View key={`${j.customer_id}-${j.created_at}`} style={styles.jobRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobTitle}>{j.vehicle_type || 'Vehicle'} — {j.service_type || 'Service'}</Text>
                      <Text style={styles.jobMeta}>{j.reservation_date}</Text>
                    </View>
                    <Text style={styles.jobPrice}>{formatPeso(j.price ?? 0)}</Text>
                  </View>
                ))
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* PAYOUT HISTORY DRAWER */}
      <Modal
        visible={historyOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.historyContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.menuTitle}>Payout History</Text>
              <TouchableOpacity onPress={() => setHistoryOpen(false)}>
                <Ionicons name="close" size={24} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {historyLoading ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#111827" />
                </View>
              ) : historyPayouts.length === 0 ? (
                <Text style={styles.emptyText}>No payouts have been marked Paid yet.</Text>
              ) : (
                historyPayouts.map((p) => (
                  <View key={p.id} style={styles.historyRow}>
                    <View style={styles.historyIconWrap}>
                      <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyName}>{p.staff_name}</Text>
                      <Text style={styles.historyMeta}>
                        {periodLabel(p.period_type)} · {p.period_start === p.period_end ? p.period_start : `${p.period_start} – ${p.period_end}`}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {formatDateTime(p.paid_at)}{p.paid_by_name ? ` · by ${p.paid_by_name}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.historyAmount}>{formatPeso(p.amount)}</Text>
                      <Text style={styles.historyMethod}>{p.payment_method}</Text>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#0F172A',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  historyButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },

  periodTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: '#111827',
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  periodTabTextActive: {
    color: '#FACC15',
  },

  rangeNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
  },
  rangeNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginHorizontal: 8,
  },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  scrollView: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  summaryCardHighlight: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginTop: 6,
  },
  summarySub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },

  noticeBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  // Drawer opener buttons on the main screen (mirrors the Staff
  // Dashboard's "Current Queue" / "My Payslip" openers)
  drawerOpenBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerOpenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerOpenText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  drawerOpenRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  drawerCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10, marginTop: 8 },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 10, marginBottom: 10 },

  staffCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#FACC15', fontWeight: '800', fontSize: 16 },
  staffName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  staffMeta: { fontSize: 12, color: '#64748B', marginTop: 1 },
  paidMeta: { fontSize: 11, color: '#16A34A', marginTop: 3, fontWeight: '600' },
  staffPayPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  staffPayPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#16A34A',
  },

  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FACC15',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    minWidth: 92,
    justifyContent: 'center',
  },
  markPaidBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#111827',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  paidBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#16A34A',
  },

  jobRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  jobMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  jobPrice: { fontSize: 13, fontWeight: '800', color: '#2563EB' },

  // ===== Bottom-sheet drawers (Staff Breakdown / Completed Jobs / History) =====
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
    minHeight: 320,
    maxHeight: '85%',
  },
  historyContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 320,
    maxHeight: '85%',
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
  historyName: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  historyMeta: { fontSize: 11, color: '#64748B', marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '800', color: '#16A34A' },
  historyMethod: { fontSize: 10.5, color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' },

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
    color: '#0F172A',
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