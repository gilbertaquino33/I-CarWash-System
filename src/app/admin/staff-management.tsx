import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import {
  formatClock,
  formatMinutes,
  formatShiftDay,
  minutesSince,
  SHIFT_COLUMNS,
  shiftMinutes,
  startOfToday,
  startOfWeek,
  timedOutAway,
  type Shift,
} from '../../lib/attendance';
import { supabase } from '../../lib/supabase';

type StaffMember = {
  id: string;
  full_name: string;
  email_address: string;
  role: string;
  mobile: string;
  avatar_url?: string | null;
  created_at?: string;
};

const roleColors: Record<string, string> = {
  staff: '#2563EB',
  admin: '#B7791F',
  customer: '#16A34A',
};

export default function StaffManagement() {
  const [activeTab, setActiveTab] = useState<'Staff List' | 'Attendance'>(
    'Staff List'
  );

  const [staffData, setStaffData] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Staff details modal -- ipinapakita kapag tinap ang isang staff card
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  // ─────────────────────────────────────────────────────────────
  //  SHOP SCOPING
  //  An admin only owns ONE shop (shop_profile_setup.owner_id === the
  //  admin's auth id). Staff shown here MUST be filtered to that
  //  shop_id -- otherwise this screen would list every staff account
  //  across every branch instead of just the ones this admin manages.
  // ─────────────────────────────────────────────────────────────
  const [shopId, setShopId] = useState<number | null>(null);
  const [shopLoading, setShopLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShopLoading(false);
        setLoading(false);
        return;
      }

      const { data: shopRow, error: shopError } = await supabase
        .from('shop_profile_setup')
        .select('id')
        .eq('owner_id', session.user.id)
        .single();

      if (shopError) {
        console.error('Error fetching shop for admin:', shopError);
        setShopLoading(false);
        setLoading(false);
        return;
      }

      setShopId(shopRow?.id ?? null);
      setShopLoading(false);
    };

    init();
  }, []);

  useEffect(() => {
    if (shopId) {
      fetchStaff(shopId);
    }
  }, [shopId]);

  const fetchStaff = async (currentShopId: number) => {
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'staff')
      .eq('shop_id', currentShopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.log(error);
    } else {
      setStaffData(data || []);
    }

    setLoading(false);
  };

  // ---------- Attendance (staff_attendance) ----------
  // Last 14 days covers "today", "this week" and the recent log. Live via
  // realtime so a staff Time In / Time Out shows up right away.
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [, setTick] = useState(0);

  const fetchShifts = useCallback(async (currentShopId: number) => {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('staff_attendance')
      .select(SHIFT_COLUMNS)
      .eq('shop_id', currentShopId)
      .gte('time_in', since)
      .order('time_in', { ascending: false });
    if (!error) setShifts((data as Shift[]) ?? []);
  }, []);

  useEffect(() => {
    if (!shopId) return;
    fetchShifts(shopId);
    const channel = supabase
      .channel(`shop-attendance-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_attendance', filter: `shop_id=eq.${shopId}` },
        () => fetchShifts(shopId)
      )
      .subscribe();
    const tick = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [shopId, fetchShifts]);

  const openShiftOf = (staffId: string) => shifts.find((s) => s.staff_id === staffId && !s.time_out) ?? null;
  const shiftsOf = (staffId: string) => shifts.filter((s) => s.staff_id === staffId);
  const nameOf = (staffId: string) => staffData.find((s) => s.id === staffId)?.full_name ?? 'Staff';
  const onDutyCount = staffData.filter((s) => openShiftOf(s.id)).length;

  const isLoadingAnything = shopLoading || loading;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Staff Management
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* TABS */}
      <View style={styles.tabRow}>
        {(['Staff List', 'Attendance'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={tab === 'Staff List' ? 'people-outline' : 'time-outline'}
                size={15}
                color={active ? '#FFFFFF' : '#6B7280'}
              />
              <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{tab}</Text>
              {tab === 'Attendance' && onDutyCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{onDutyCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* STAFF LIST */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'Staff List' && (
          <>
            {isLoadingAnything ? (
              <Text style={{ textAlign: 'center', marginTop: 30 }}>
                Loading...
              </Text>
            ) : !shopId ? (
              <Text style={{ textAlign: 'center', marginTop: 30 }}>
                No shop is linked to this admin account yet.
              </Text>
            ) : staffData.length === 0 ? (
              <Text style={{ textAlign: 'center', marginTop: 30 }}>
                No staff found for this shop.
              </Text>
            ) : (
              staffData.map((staff) => (
                <TouchableOpacity
                  key={staff.id}
                  style={styles.staffCard}
                  activeOpacity={0.7}
                  onPress={() => setSelectedStaff(staff)}
                >
                  <View
                    style={[
                      styles.avatarCircle,
                      {
                        backgroundColor:
                          (roleColors[staff.role] || '#6B7280') + '20',
                      },
                    ]}
                  >
                    {staff.avatar_url ? (
                      <Image
                        source={{ uri: staff.avatar_url }}
                        style={styles.avatarCircleImg}
                      />
                    ) : (
                      <Ionicons
                        name="person"
                        size={24}
                        color={roleColors[staff.role] || '#6B7280'}
                      />
                    )}
                  </View>

                  <View style={styles.staffInfo}>
                    <Text style={styles.staffName}>
                      {staff.full_name}
                    </Text>

                    <View style={styles.roleRow}>
                      <View
                        style={[
                          styles.roleBadge,
                          {
                            backgroundColor:
                              (roleColors[staff.role] || '#6B7280') + '20',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleText,
                            {
                              color:
                                roleColors[staff.role] || '#6B7280',
                            },
                          ]}
                        >
                          {staff.role}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.staffSalary}>
                      {staff.email_address}
                    </Text>

                    <Text
                      style={{
                        color: '#6B7280',
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {staff.mobile}
                    </Text>

                    {openShiftOf(staff.id) ? (
                      <View style={[styles.dutyPill, styles.dutyPillOn]}>
                        <View style={styles.dutyDot} />
                        <Text style={[styles.dutyPillText, { color: '#16A34A' }]}>
                          On duty since {formatClock(openShiftOf(staff.id)!.time_in)}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.dutyPill}>
                        <Text style={styles.dutyPillText}>Off duty</Text>
                      </View>
                    )}
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#D5D8DE"
                  />
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {activeTab === 'Attendance' && (
          <>
            {isLoadingAnything ? (
              <Text style={{ textAlign: 'center', marginTop: 30 }}>Loading...</Text>
            ) : staffData.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>No staff found for this shop.</Text>
              </View>
            ) : (
              <>
                <View style={styles.attSummary}>
                  <Ionicons name="people" size={20} color="#16A34A" />
                  <Text style={styles.attSummaryText}>
                    <Text style={{ fontWeight: '800' }}>{onDutyCount}</Text> of {staffData.length} staff on duty
                    right now
                  </Text>
                </View>

                {/* Per staff: status + hours today / this week */}
                {staffData.map((staff) => {
                  const open = openShiftOf(staff.id);
                  const own = shiftsOf(staff.id);
                  return (
                    <View key={staff.id} style={styles.attCard}>
                      <View style={styles.attCardTop}>
                        <Text style={styles.attName}>{staff.full_name}</Text>
                        <View style={[styles.dutyPill, open && styles.dutyPillOn, { marginTop: 0 }]}>
                          {open && <View style={styles.dutyDot} />}
                          <Text style={[styles.dutyPillText, open && { color: '#16A34A' }]}>
                            {open ? `In since ${formatClock(open.time_in)}` : 'Off duty'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.attStatsRow}>
                        <View style={styles.attStat}>
                          <Text style={styles.attStatValue}>{formatMinutes(minutesSince(own, startOfToday()))}</Text>
                          <Text style={styles.attStatLabel}>Today</Text>
                        </View>
                        <View style={styles.attStatDivider} />
                        <View style={styles.attStat}>
                          <Text style={styles.attStatValue}>{formatMinutes(minutesSince(own, startOfWeek()))}</Text>
                          <Text style={styles.attStatLabel}>This week</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Recent log */}
                <Text style={styles.attSectionTitle}>Recent Time In / Time Out</Text>
                {shifts.length === 0 ? (
                  <Text style={styles.attEmpty}>No time records in the last 14 days yet.</Text>
                ) : (
                  shifts.slice(0, 30).map((s) => (
                    <View key={s.id} style={styles.attLogRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.attLogName}>{nameOf(s.staff_id)}</Text>
                        <Text style={styles.attLogTime}>
                          {formatShiftDay(s.time_in)} · {formatClock(s.time_in)} –{' '}
                          {s.time_out ? formatClock(s.time_out) : 'still on duty'}
                        </Text>
                        {s.auto_closed && (
                          <Text style={styles.attLogFlag}>
                            ⚠ Forgot to time out — timed out automatically at 7:00 PM closing.
                          </Text>
                        )}
                        {timedOutAway(s) && (
                          <Text style={styles.attLogFlag}>
                            ⚠ Timed out{' '}
                            {s.time_out_distance_m == null
                              ? 'without a verified location'
                              : `${(s.time_out_distance_m / 1000).toFixed(1)} km away from the shop`}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.attLogHours,
                          s.auto_closed && { color: '#B7791F' },
                          !s.time_out && { color: '#16A34A' },
                        ]}
                      >
                        {formatMinutes(shiftMinutes(s))}
                      </Text>
                    </View>
                  ))
                )}
                <Text style={styles.attFootnote}>
                  Working hours are 7:00 AM – 7:00 PM. Staff can only time in at the shop (checked by GPS)
                  within those hours. If a staff forgets to time out, the shift ends automatically at 7:00 PM.
                  Times come from the server, not the staff’s phone.
                </Text>
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* STAFF DETAILS MODAL */}
      <Modal
        visible={!!selectedStaff}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedStaff(null)}
      >
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <TouchableOpacity
              style={styles.detailCloseBtn}
              onPress={() => setSelectedStaff(null)}
            >
              <Ionicons name="close" size={16} color="#4B5563" />
              <Text style={styles.detailCloseBtnText}>Close</Text>
            </TouchableOpacity>

            <View style={styles.detailAvatarWrap}>
              {selectedStaff?.avatar_url ? (
                <Image source={{ uri: selectedStaff.avatar_url }} style={styles.detailAvatarImg} />
              ) : (
                <View
                  style={[
                    styles.detailAvatarFallback,
                    { backgroundColor: (roleColors[selectedStaff?.role ?? ''] || '#6B7280') + '20' },
                  ]}
                >
                  <Ionicons name="person" size={36} color={roleColors[selectedStaff?.role ?? ''] || '#6B7280'} />
                </View>
              )}
            </View>

            <Text style={styles.detailName}>{selectedStaff?.full_name}</Text>

            <View
              style={[
                styles.roleBadge,
                {
                  backgroundColor: (roleColors[selectedStaff?.role ?? ''] || '#6B7280') + '20',
                  alignSelf: 'center',
                  marginTop: 4,
                },
              ]}
            >
              <Text style={[styles.roleText, { color: roleColors[selectedStaff?.role ?? ''] || '#6B7280' }]}>
                {selectedStaff?.role}
              </Text>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <Ionicons name="mail-outline" size={18} color="#6B7280" />
              <Text style={styles.detailRowText}>{selectedStaff?.email_address || 'No email on file'}</Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="call-outline" size={18} color="#6B7280" />
              <Text style={styles.detailRowText}>{selectedStaff?.mobile || 'No mobile number on file'}</Text>
            </View>

            {selectedStaff?.created_at && (
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                <Text style={styles.detailRowText}>
                  Joined {new Date(selectedStaff.created_at).toLocaleDateString('en-PH', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </View>
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
    backgroundColor: '#F4F5F7',
  },

  header: {
    backgroundColor: '#1A1D21',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  headerSpacer: {
    width: 40,
  },

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },
  tabBtnActive: { backgroundColor: '#1A1D21', borderColor: '#1A1D21' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  tabBtnTextActive: { color: '#FFFFFF' },
  tabBadge: { backgroundColor: '#16A34A', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },

  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#F1F2F4',
  },
  dutyPillOn: { backgroundColor: '#E7F6EC' },
  dutyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  dutyPillText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },

  attSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#E7F6EC',
    marginBottom: 12,
  },
  attSummaryText: { flex: 1, fontSize: 13, color: '#1A1D21' },
  attCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },
  attCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  attName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#1A1D21' },
  attStatsRow: { flexDirection: 'row', marginTop: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F7F8FA' },
  attStat: { flex: 1, alignItems: 'center' },
  attStatDivider: { width: 1, backgroundColor: '#ECEEF1' },
  attStatValue: { fontSize: 15, fontWeight: '800', color: '#1A1D21' },
  attStatLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  attSectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1D21', marginTop: 12, marginBottom: 8 },
  attEmpty: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingVertical: 20 },
  attLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },
  attLogName: { fontSize: 13, fontWeight: '700', color: '#1A1D21' },
  attLogTime: { fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  attLogHours: { fontSize: 13, fontWeight: '800', color: '#1A1D21' },
  attLogFlag: { fontSize: 11, fontWeight: '700', color: '#B7791F', marginTop: 3 },
  attFootnote: { fontSize: 11, color: '#9AA1AC', marginTop: 8, lineHeight: 15 },

  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  staffCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },

  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },

  avatarCircleImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },

  staffInfo: {
    flex: 1,
  },

  staffName: {
    color: '#1A1D21',
    fontSize: 15,
    fontWeight: '700',
  },

  roleRow: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 4,
  },

  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },

  roleText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  staffSalary: {
    color: '#6B7280',
    fontSize: 13,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 12,
  },

  // ── STAFF DETAILS MODAL ───────────────────────────────────────
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  detailCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  detailCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#F7F8FA',
  },
  detailCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  detailAvatarWrap: {
    marginBottom: 12,
  },
  detailAvatarImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  detailAvatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1D21',
    textAlign: 'center',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#ECEEF1',
    width: '100%',
    marginVertical: 18,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 8,
  },
  detailRowText: {
    fontSize: 13.5,
    color: '#3A3F47',
    flex: 1,
  },
});