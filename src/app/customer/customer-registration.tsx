import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
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
import { supabase } from '../../lib/supabase';


const NAVY = '#0B1120';
const BLUE = '#2563EB';
const BLUE_LIGHT = '#60A5FA';
const SLATE_BORDER = '#1E2D45';
const TEXT_MAIN = '#F8FAFC';
const TEXT_MUTED = '#94A3B8';
const SUCCESS = '#2563EB';
const ERROR = '#DC2626';

// route path ng landing screen mo.
const LANDING_ROUTE = '/';


const CARWASH_HERO_IMAGE =
  'https://www.prestonmotgarage.co.uk/blog/wp-content/uploads/2023/12/Washing-Your-Car.png';



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

// ─────────────────────────────────────────
//  REUSABLE: Sliding-pill Sign Up / Login switcher
//  (same animation pattern as the staff/admin auth screen)
// ─────────────────────────────────────────
function TabSwitcher({
  active,
  onSelectLogin,
  onSelectRegister,
  disabled,
}: {
  active: 'login' | 'register';
  onSelectLogin: () => void;
  onSelectRegister: () => void;
  disabled?: boolean;
}) {
  const anim = useRef(new Animated.Value(active === 'register' ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: active === 'register' ? 0 : 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active]);

  const pillLeft = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] });

  return (
    <View style={styles.tabContainer}>
      <Animated.View style={[styles.tabPill, { left: pillLeft }]} />

      <TouchableOpacity style={styles.tabTouchable} onPress={onSelectRegister} disabled={disabled}>
        <Text style={active === 'register' ? styles.tabActiveText : styles.tabInactiveText}>Sign Up</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabTouchable} onPress={onSelectLogin} disabled={disabled}>
        <Text style={active === 'login' ? styles.tabActiveText : styles.tabInactiveText}>Login</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────
//  REUSABLE: Fade + slide-in wrapper for the white card
// ─────────────────────────────────────────
function AnimatedCard({ children, style }: { children: React.ReactNode; style?: any }) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity: cardOpacity, transform: [{ translateY: cardY }] }]}>
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────
//  REUSABLE: Photo hero behind the header —
//  same car-wash-photo treatment as the staff/admin portal,
//  blended down into the navy background.
// ─────────────────────────────────────────
function CustomerHeaderHero({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Image source={{ uri: CARWASH_HERO_IMAGE }} style={styles.headerImage} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(11,17,32,0.15)', 'rgba(11,17,32,0.55)', NAVY]}
        style={styles.headerScrim}
      />
      <View style={styles.headerContent}>
        <View style={styles.logoMark}>
          <Ionicons name={icon} size={20} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function CustomerLoginScreen({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
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

    if (profileError || !profile) {
      showError('Error', 'Could not fetch profile. Please try again.');
      return;
    }

    const role = profile.role?.toLowerCase();

    if (role === 'customer') {
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Welcome back!',
        message: 'You have successfully logged in to your Customer Hub.',
        confirmLabel: 'Continue',
        onConfirm: () => {
          closeFeedback();
          router.replace('/customer/dashboard');
        },
      });
    } else {
      await supabase.auth.signOut();
      showError('Access Denied', 'This login portal is strictly for customers only.');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} translucent />
      <BackToLandingButton topInset={insets.top} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* HEADER */}
        <CustomerHeaderHero
          icon="car-sport-outline"
          title="Customer Hub"
          subtitle="Sign in to book and track your carwash services"
        />

        {/* CARD */}
        <AnimatedCard style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* TABS */}
            <TabSwitcher
              active="login"
              onSelectLogin={() => {}}
              onSelectRegister={onSwitchToRegister}
              disabled={isSubmitting}
            />

            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="customer@example.com"
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

            <TouchableOpacity style={styles.forgotRow} onPress={() => router.push('/customer/reset-password')}>
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
                  <Text style={styles.buttonText}>CUSTOMER LOGIN</Text>
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
                New here? <Text style={styles.linkBold}>Create a Customer Account</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </AnimatedCard>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isSubmitting} label="Signing you in..." />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

// ─────────────────────────────────────────
//  CUSTOMER REGISTER SCREEN
// ─────────────────────────────────────────
function CustomerRegisterScreen({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [fullName, setFullName] = useState('');
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

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      showError('Missing Fields', 'Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();

    // Automatic 'customer' role registration
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          email_address: cleanEmail,
          role: 'customer',
          mobile: mobile.trim(),
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
      message: 'Your customer account has been successfully created.',
      confirmLabel: 'Go to Login',
      onConfirm: () => {
        closeFeedback();
        onSwitchToLogin();
      },
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} translucent />
      <BackToLandingButton topInset={insets.top} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* HEADER */}
        <CustomerHeaderHero
          icon="person-add-outline"
          title="Customer Sign Up"
          subtitle="Get access to premium carwash treatments"
        />

        {/* CARD */}
        <AnimatedCard style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          {/* TABS */}
          <TabSwitcher
            active="register"
            onSelectLogin={onSwitchToLogin}
            onSelectRegister={() => {}}
            disabled={isSubmitting}
          />

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

            {/* EMAIL */}
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="customer@example.com"
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

            {/* REGISTER BUTTON */}
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
                  <Text style={styles.buttonText}>CREATE CUSTOMER ACCOUNT</Text>
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
        </AnimatedCard>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isSubmitting} label="Creating your account..." />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

export default function CustomerAuthScreen() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  if (activeTab === 'register') {
    return <CustomerRegisterScreen onSwitchToLogin={() => setActiveTab('login')} />;
  }

  return <CustomerLoginScreen onSwitchToRegister={() => setActiveTab('register')} />;
}

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
  header: {
    minHeight: 210,
    paddingHorizontal: 28,
    paddingBottom: 22,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerContent: {
    alignItems: 'flex-start',
  },
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
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: { marginTop: 6, fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    marginTop: -20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 50,
    padding: 4,
    marginBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  tabPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '50%',
    borderRadius: 50,
    backgroundColor: NAVY,
  },
  tabTouchable: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    zIndex: 1,
  },
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