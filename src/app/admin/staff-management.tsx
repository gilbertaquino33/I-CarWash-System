import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

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
          <View style={styles.emptyState}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color="#6B7280"
            />
            <Text style={styles.emptyText}>
              Attendance records coming soon
            </Text>
          </View>
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