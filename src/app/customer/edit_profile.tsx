import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// ---------- THEME: Same Blue / White / Black Palette as Dashboard ----------
const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#60A5FA';
const BLUE_TINT = '#EFF6FF';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';
const GRAY_LIGHT = '#E2E8F0';
const BG = '#F8FAFC';
const DANGER = '#EF4444';
const SUCCESS = '#16A34A';

interface ProfileData {
  id: string;
  full_name: string;
  email_address: string;
  mobile: string | null;
}

type InfoModalType = 'success' | 'error';
interface InfoModalData {
  type: InfoModalType;
  title: string;
  message: string;
}

export default function CustomerProfile() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');

  const [infoModal, setInfoModal] = useState<InfoModalData | null>(null);
  const showInfoModal = (data: InfoModalData) => setInfoModal(data);
  const closeInfoModal = () => {
    const wasSuccess = infoModal?.type === 'success';
    setInfoModal(null);
    if (wasSuccess) {
      router.back();
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/customer/customer-registration');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email_address, mobile')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      setProfile(data as ProfileData);
      setFullName(data?.full_name ?? '');
      setMobile(data?.mobile ?? '');
    } catch (error) {
      console.error('Error fetching profile:', error);
      showInfoModal({
        type: 'error',
        title: 'Unable to Load Profile',
        message: 'Something went wrong while loading your profile. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const validate = (): string | null => {
    if (!fullName.trim()) {
      return 'Full name cannot be empty.';
    }
    if (mobile.trim() && !/^[0-9+\-\s()]{7,15}$/.test(mobile.trim())) {
      return 'Please enter a valid mobile number.';
    }
    return null;
  };

  const handleSave = async () => {
    if (!profile) return;

    const validationError = validate();
    if (validationError) {
      showInfoModal({ type: 'error', title: 'Invalid Details', message: validationError });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          mobile: mobile.trim() || null,
        })
        .eq('id', profile.id);

      if (error) throw error;

      showInfoModal({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile changes have been saved.',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      showInfoModal({
        type: 'error',
        title: 'Update Failed',
        message: 'We could not save your changes. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    profile && (fullName.trim() !== (profile.full_name ?? '') || mobile.trim() !== (profile.mobile ?? ''));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          {/* AVATAR */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {fullName?.charAt(0)?.toUpperCase() ?? '?'}
              </Text>
            </View>
          </View>

          {/* FORM CARD */}
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={GRAY} />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <Text style={styles.fieldLabel}>Mobile Number</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={18} color={GRAY} />
              <TextInput
                style={styles.input}
                value={mobile}
                onChangeText={setMobile}
                placeholder="e.g. 09XX XXX XXXX"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />
            </View>

            <Text style={styles.fieldLabel}>Email Address</Text>
            <View style={[styles.inputWrap, styles.inputWrapDisabled]}>
              <Ionicons name="mail-outline" size={18} color={GRAY} />
              <TextInput
                style={[styles.input, { color: GRAY }]}
                value={profile?.email_address ?? ''}
                editable={false}
              />
            </View>
            <Text style={styles.helperText}>Email address cannot be changed here.</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (!hasChanges || saving) && styles.saveBtnDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={WHITE} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={WHITE} />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* INFO / SUCCESS / ERROR MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!infoModal}
        onRequestClose={closeInfoModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.infoModalContainer}>
            {infoModal && (
              <>
                <View
                  style={[
                    styles.infoIconWrap,
                    { backgroundColor: infoModal.type === 'error' ? '#FEF2F2' : '#F0FDF4' },
                  ]}
                >
                  <Ionicons
                    name={infoModal.type === 'error' ? 'close-circle' : 'checkmark-circle'}
                    size={28}
                    color={infoModal.type === 'error' ? DANGER : SUCCESS}
                  />
                </View>
                <Text style={styles.infoModalTitle}>{infoModal.title}</Text>
                <Text style={styles.infoModalMessage}>{infoModal.message}</Text>
                <TouchableOpacity style={styles.infoModalOkBtn} onPress={closeInfoModal} activeOpacity={0.8}>
                  <Text style={styles.infoModalOkBtnText}>OK</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: NAVY,
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: { color: WHITE, fontSize: 17, fontWeight: '700' },
  avatarSection: { alignItems: 'center', marginTop: 24, marginBottom: 8 },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: BLUE_TINT,
    borderWidth: 2,
    borderColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 32, fontWeight: '800', color: BLUE },
  formCard: {
    backgroundColor: WHITE,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 14 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: GRAY_LIGHT,
    gap: 10,
  },
  inputWrapDisabled: { backgroundColor: '#F1F5F9' },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#1E293B' },
  helperText: { fontSize: 11, color: '#94A3B8', marginTop: 6 },
  saveBtn: {
    backgroundColor: BLUE,
    marginHorizontal: 16,
    marginTop: 22,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: { backgroundColor: '#93C5FD' },
  saveBtnText: { color: WHITE, fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' },
  infoModalContainer: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'center',
    width: '85%',
  },
  infoIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  infoModalTitle: { fontSize: 18, fontWeight: '800', color: NAVY, marginBottom: 8, textAlign: 'center' },
  infoModalMessage: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20 },
  infoModalOkBtn: {
    backgroundColor: NAVY,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  infoModalOkBtnText: { color: WHITE, fontWeight: '700', fontSize: 14 },
});