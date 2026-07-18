import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

interface ShopBranch {
  id: number;
  shop_name: string;
  province: string;
  city: string;
  barangay: string;
}

// ─────────────────────────────────────────
//  THEME (blue + black/white — consistent sa Landing screen)
// ─────────────────────────────────────────
const NAVY = '#0B1120';
const BLUE = '#2563EB';
const BLUE_DARK = '#1D4ED8';
const BLUE_LIGHT = '#60A5FA';
const SLATE_BORDER = '#1E2D45';
const TEXT_MAIN = '#F8FAFC';
const TEXT_MUTED = '#94A3B8';
const SUCCESS = '#2563EB';
const ERROR = '#DC2626';

// NOTE: i-adjust ito kung iba yung route path ng landing screen mo.
const LANDING_ROUTE = '/';

type FeedbackType = 'success' | 'error';

interface FeedbackState {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

const initialFeedback: FeedbackState = {
  visible: false,
  type: 'error',
  title: '',
  message: '',
};

// ─────────────────────────────────────────
//  REUSABLE: Success / Error Modal
// ─────────────────────────────────────────
function FeedbackModal({ state, onClose }: { state: FeedbackState; onClose: () => void }) {
  const isSuccess = state.type === 'success';
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.feedbackCard}>
          <View style={[styles.feedbackIconWrap, { backgroundColor: isSuccess ? SUCCESS : ERROR }]}>
            <Ionicons name={isSuccess ? 'checkmark' : 'close'} size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.feedbackTitle}>{state.title}</Text>
          <Text style={styles.feedbackMessage}>{state.message}</Text>
          <TouchableOpacity
            style={[styles.feedbackBtn, { backgroundColor: isSuccess ? SUCCESS : BLUE }]}
            activeOpacity={0.85}
            onPress={() => {
              state.onConfirm ? state.onConfirm() : onClose();
            }}
          >
            <Text style={styles.feedbackBtnText}>{state.confirmLabel ?? 'OK'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────
//  REUSABLE: Full-screen loading overlay
// ─────────────────────────────────────────
function LoadingOverlay({ visible, label }: { visible: boolean; label: string }) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.loadingCard}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
//  REUSABLE: Back-to-landing button
// ─────────────────────────────────────────
function BackToLandingButton({ topInset }: { topInset: number }) {
  return (
    <TouchableOpacity
      style={[styles.backBtn, { top: topInset + 10 }]}
      onPress={() => router.replace(LANDING_ROUTE)}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}
    >
      <Ionicons name="arrow-back" size={22} color={TEXT_MAIN} />
    </TouchableOpacity>
  );
}


function LoginScreen({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < 360;

  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showError = (title: string, message: string) =>
    setFeedback({ visible: true, type: 'error', title, message, confirmLabel: 'OK', onConfirm: closeFeedback });

  const handleLogin = async () => {
    if (!email || !password) {
      showError('Missing Fields', 'Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setIsSubmitting(false);
      showError('Login Failed', error.message);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    setIsSubmitting(false);

    if (profileError) {
      showError('Profile Error', profileError.message ?? 'Something went wrong while loading your profile.');
      return;
    }

    if (!profile) {
      showError('Error', 'Profile not found.');
      return;
    }

    const role = profile.role?.toLowerCase();
    const destinations: Record<string, string> = {
      staff: '/staff/staff-dashboard',
      customer: '/customer',
      admin: '/admin/dashboard',
    };
    const destination = destinations[role];

    if (!destination) {
      showError('Error', 'Unknown role: ' + role);
      return;
    }

    setFeedback({
      visible: true,
      type: 'success',
      title: 'Welcome back!',
      message: 'You have successfully logged in.',
      confirmLabel: 'Continue',
      onConfirm: () => {
        closeFeedback();
        router.replace(destination as any);
      },
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <BackToLandingButton topInset={insets.top} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Ionicons name="car-sport-outline" size={22} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { fontSize: isSmall ? 26 : 30 }]}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your I-CarWash account</Text>
        </View>

        {/* CARD */}
        <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* TABS */}
            <View style={styles.tabContainer}>
              <TouchableOpacity style={styles.tabInactive} onPress={onSwitchToRegister}>
                <Text style={styles.tabInactiveText}>Sign Up</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tabActive}>
                <Text style={styles.tabActiveText}>Login</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="you@example.com"
                placeholderTextColor={TEXT_MUTED}
                style={styles.inputField}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isSubmitting}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="Enter your password"
                placeholderTextColor={TEXT_MUTED}
                secureTextEntry={!showPassword}
                style={[styles.inputField, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                editable={!isSubmitting}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotRow}>
              <Text style={styles.forgot}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* LOGIN BUTTON */}
            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.buttonText}>LOGIN</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </>
              )}
            </TouchableOpacity>

            {/* DIVIDER */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* REGISTER LINK */}
            <TouchableOpacity style={styles.linkContainer} onPress={onSwitchToRegister}>
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isSubmitting} label="Signing you in..." />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

// ─────────────────────────────────────────
//  REGISTER SCREEN
// ─────────────────────────────────────────
function RegisterScreen({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Staff');
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [selectedShopName, setSelectedShopName] = useState('');
  const [shops, setShops] = useState<ShopBranch[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < 360;

  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showError = (title: string, message: string) =>
    setFeedback({ visible: true, type: 'error', title, message, confirmLabel: 'OK', onConfirm: closeFeedback });

  useEffect(() => {
    const fetchShops = async () => {
      setIsLoadingShops(true);
      const { data, error } = await supabase
        .from('shop_profile_setup')
        .select('id, shop_name, province, city, barangay')
        .order('id', { ascending: false });

      if (error) {
        console.error('Error fetching shops for staff registration:', error);
      } else {
        const loadedShops = (data as ShopBranch[]) ?? [];
        setShops(loadedShops);
        if (!selectedShopId && loadedShops.length > 0) {
          setSelectedShopId(loadedShops[0].id);
          setSelectedShopName(loadedShops[0].shop_name);
        }
      }

      setIsLoadingShops(false);
    };

    fetchShops();
  }, []);

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      showError('Missing Fields', 'Please fill in all fields.');
      return;
    }

    if (role.toLowerCase() === 'staff' && !selectedShopId) {
      showError('Missing Shop', 'Please choose the shop where this staff account will apply.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          email_address: cleanEmail,
          role: role.toLowerCase(),
          mobile: mobile.trim(),
          shop_id: role.toLowerCase() === 'staff' ? selectedShopId : null,
          shop_name: role.toLowerCase() === 'staff' ? selectedShopName : '',
        },
      },
    });

    setIsSubmitting(false);

    if (error) {
      showError('Registration Failed', error.message);
      return;
    }

    if (data.user && data.user.identities?.length === 0) {
      showError('Already Registered', 'This email is already registered. Please login instead.');
      return;
    }

    setFeedback({
      visible: true,
      type: 'success',
      title: 'Account Created!',
      message: 'Your account has been successfully created.',
      confirmLabel: 'Go to Login',
      onConfirm: () => {
        closeFeedback();
        onSwitchToLogin();
      },
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <BackToLandingButton topInset={insets.top} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Ionicons name="person-add-outline" size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { fontSize: isSmall ? 26 : 30 }]}>Create Account</Text>
          <Text style={styles.subtitle}>Join I-CarWash and manage your experience</Text>
        </View>

        {/* CARD */}
        <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          {/* TABS */}
          <View style={styles.tabContainer}>
            <TouchableOpacity style={styles.tabActive}>
              <Text style={styles.tabActiveText}>Sign Up</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabInactive} onPress={onSwitchToLogin}>
              <Text style={styles.tabInactiveText}>Login</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* FULL NAME */}
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="Juan dela Cruz"
                placeholderTextColor={TEXT_MUTED}
                style={styles.inputField}
                value={fullName}
                onChangeText={setFullName}
                editable={!isSubmitting}
              />
            </View>

            {/* ROLE */}
            <Text style={styles.label}>Role</Text>
            <View style={styles.pickerWrapper}>
              <Ionicons name="shield-checkmark-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <Picker
                selectedValue={role}
                onValueChange={(v) => setRole(v)}
                style={styles.picker}
                dropdownIconColor={TEXT_MUTED}
                enabled={!isSubmitting}
              >
                <Picker.Item label="Staff" value="Staff" />
                <Picker.Item label="Admin" value="Admin" />
              </Picker>
            </View>

            {role === 'Staff' && (
              <>
                <Text style={styles.label}>Assigned Shop</Text>
                <View style={styles.pickerWrapper}>
                  {isLoadingShops ? (
                    <ActivityIndicator size="small" color={BLUE} style={styles.inputIcon} />
                  ) : (
                    <Ionicons name="business-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
                  )}
                  <Picker
                    selectedValue={selectedShopId ? String(selectedShopId) : ''}
                    onValueChange={(value) => {
                      const shop = shops.find((item) => String(item.id) === String(value));
                      setSelectedShopId(shop ? shop.id : null);
                      setSelectedShopName(shop?.shop_name ?? '');
                    }}
                    style={styles.picker}
                    dropdownIconColor={TEXT_MUTED}
                    enabled={!isLoadingShops && !isSubmitting}
                  >
                    <Picker.Item label={isLoadingShops ? 'Loading shops...' : 'Select a shop'} value="" />
                    {shops.map((shop) => {
                      const location = [shop.barangay, shop.city, shop.province].filter(Boolean).join(', ');
                      return (
                        <Picker.Item
                          key={shop.id}
                          label={location ? `${shop.shop_name} • ${location}` : shop.shop_name}
                          value={String(shop.id)}
                        />
                      );
                    })}
                  </Picker>
                </View>
                <Text style={styles.helperText}>
                  {selectedShopId ? `Will sync to branch ID ${selectedShopId}` : 'Choose a shop from the branch list.'}
                </Text>
              </>
            )}

            {/* EMAIL */}
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="you@example.com"
                placeholderTextColor={TEXT_MUTED}
                style={styles.inputField}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isSubmitting}
              />
            </View>

            {/* MOBILE */}
            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="+63 9XX XXX XXXX"
                placeholderTextColor={TEXT_MUTED}
                style={styles.inputField}
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
                editable={!isSubmitting}
              />
            </View>

            {/* PASSWORD */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="Create a strong password"
                placeholderTextColor={TEXT_MUTED}
                secureTextEntry={!showPassword}
                style={[styles.inputField, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                editable={!isSubmitting}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            {/* CONFIRM PASSWORD */}
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-open-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="Re-enter your password"
                placeholderTextColor={TEXT_MUTED}
                secureTextEntry={!showConfirmPassword}
                style={[styles.inputField, { flex: 1 }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!isSubmitting}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            {/* BUTTON */}
            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleRegister}
              activeOpacity={0.85}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.buttonText}>CREATE ACCOUNT</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </>
              )}
            </TouchableOpacity>

            {/* DIVIDER */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* LOGIN LINK */}
            <TouchableOpacity style={styles.linkContainer} onPress={onSwitchToLogin}>
              <Text style={styles.linkText}>
                Already have an account? <Text style={styles.linkBold}>Login</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isSubmitting} label="Creating your account..." />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

export default function AuthScreen() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  if (activeTab === 'register') {
    return <RegisterScreen onSwitchToLogin={() => setActiveTab('login')} />;
  }

  return <LoginScreen onSwitchToRegister={() => setActiveTab('register')} />;
}

const pickerHeight = Platform.select({ ios: 150, android: 52 }) ?? 52;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: SLATE_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: { paddingHorizontal: 28, paddingTop: 56, paddingBottom: 28 },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: BLUE,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT_MAIN,
    letterSpacing: -0.5,
  },
  subtitle: { marginTop: 6, fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 50,
    padding: 4,
    marginBottom: 24,
  },
  tabActive: {
    flex: 1,
    backgroundColor: NAVY,
    borderRadius: 50,
    paddingVertical: 11,
    alignItems: 'center',
  },
  tabInactive: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  tabActiveText: { color: BLUE_LIGHT, fontWeight: '700', fontSize: 14 },
  tabInactiveText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  inputField: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#0F172A' },
  eyeBtn: { padding: 4, marginLeft: 6 },
  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 18,
    paddingLeft: 14,
  },
  picker: {
    flex: 1,
    color: '#0F172A',
    height: pickerHeight,
  },
  button: {
    backgroundColor: BLUE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 20,
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#93B5F5',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  forgotRow: { alignItems: 'flex-end', marginBottom: 24, marginTop: -6 },
  forgot: { color: BLUE, fontSize: 13, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 12, color: TEXT_MUTED, fontSize: 13 },
  linkContainer: { alignItems: 'center', marginBottom: 8 },
  linkText: { color: '#64748B', fontSize: 14 },
  linkBold: { color: NAVY, fontWeight: '800' },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: -8,
    marginBottom: 14,
  },

  // ===== Overlay shared by loading + feedback modal =====
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(2, 6, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // ===== Loading overlay =====
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#334155',
    fontWeight: '600',
    fontSize: 14,
  },

  // ===== Feedback (success / error) modal =====
  feedbackCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  feedbackIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 8,
    textAlign: 'center',
  },
  feedbackMessage: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  feedbackBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  feedbackBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});