import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../../lib/supabase';

type StaffMember = {
  id: string;
  full_name: string;
  email_address: string;
  role: string;
  mobile: string;
};

const roleColors: Record<string, string> = {
  staff: '#3B82F6',
  admin: '#F59E0B',
  customer: '#22C55E',
};

export default function StaffManagement() {
  const [activeTab, setActiveTab] = useState<'Staff List' | 'Attendance'>(
    'Staff List'
  );

  const [staffData, setStaffData] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'staff')
      .order('created_at', { ascending: false });

    if (error) {
      console.log(error);
    } else {
      setStaffData(data || []);
    }

    setLoading(false);
  };

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
            {loading ? (
              <Text style={{ textAlign: 'center', marginTop: 30 }}>
                Loading...
              </Text>
            ) : staffData.length === 0 ? (
              <Text style={{ textAlign: 'center', marginTop: 30 }}>
                No staff found.
              </Text>
            ) : (
              staffData.map((staff) => (
                <View
                  key={staff.id}
                  style={styles.staffCard}
                >
                  <View
                    style={[
                      styles.avatarCircle,
                      {
                        backgroundColor:
                          (roleColors[staff.role] || '#64748B') + '20',
                      },
                    ]}
                  >
                    <Ionicons
                      name="person"
                      size={24}
                      color={roleColors[staff.role] || '#64748B'}
                    />
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
                              (roleColors[staff.role] || '#64748B') + '20',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleText,
                            {
                              color:
                                roleColors[staff.role] || '#64748B',
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
                        color: '#64748B',
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
                    color="#CBD5E1"
                  />
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'Attendance' && (
          <View style={styles.emptyState}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color="#64748B"
            />
            <Text style={styles.emptyText}>
              Attendance records coming soon
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

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
    borderColor: '#E2E8F0',
  },

  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  staffInfo: {
    flex: 1,
  },

  staffName: {
    color: '#0F172A',
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
    color: '#64748B',
    fontSize: 13,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  emptyText: {
    color: '#64748B',
    fontSize: 16,
    marginTop: 12,
  },
});