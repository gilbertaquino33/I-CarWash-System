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
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

// ── Palette (light / warm) ──────────────────────────────────────
const CREAM_TOP = '#FFFFFF';
const CREAM_MID = '#F7F8FA';
const CREAM_BOTTOM = '#F4F5F7';
const BLUE = '#2563EB';
const BLUE_DARK = '#1D4ED8';
const BLUE_LIGHT = '#93B4FB';
const TEXT_DARK = '#1A1D21';
const TEXT_MUTED = '#6B7280';
const CARD_WHITE = '#FFFFFF';
const BORDER_SOFT = '#ECEEF1';
const INPUT_BG = '#F4F5F7';
const INPUT_BORDER = '#ECEEF1';
const SUCCESS = BLUE;
const ERROR = '#DC2626';

const LANDING_ROUTE = '/';


const FORGOT_PASSWORD_ROUTE = '/staff/staff_forgot_password';


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

function BackToLandingButton({ topInset }: { topInset: number }) {
  return (
    <TouchableOpacity
      style={[styles.backBtn, { top: topInset + 10 }]}
      onPress={() => router.replace(LANDING_ROUTE)}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}
    >
      <Ionicons name="arrow-back" size={22} color={TEXT_DARK} />
    </TouchableOpacity>
  );
}

/** Header illustration for the login screen — a real car-wash photo
 *  behind the logo chip, matching the reference video's hero-image intro. */
function AuthHeader({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Image source={{ uri: CARWASH_HERO_IMAGE }} style={styles.headerImage} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(15,23,42,0.05)', 'rgba(15,23,42,0.35)', 'rgba(15,23,42,0.6)']}
        style={styles.headerScrim}
      />
      <View style={styles.headerContent}>
        <View style={styles.logoMark}>
          <LinearGradient colors={[BLUE_LIGHT, BLUE, BLUE_DARK]} style={StyleSheet.absoluteFill} />
          <Ionicons name={icon} size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

/** Wrapper that fades + slides the white card in on mount. */
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

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const insets = useSafeAreaInsets();

  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showError = (title: string, message: string) =>
    setFeedback({ visible: true, type: 'error', title, message, confirmLabel: 'OK', onConfirm: closeFeedback });

  // Just navigates to the dedicated forgot-password screen (email -> code -> new password).
  // We do NOT call supabase here and we do NOT sign the user in — that flow lives entirely
  // in the forgot-password screen itself, same pattern as the customer side.
  const handleForgotPasswordPress = () => {
    router.push({
      pathname: FORGOT_PASSWORD_ROUTE,
      params: { email: email.trim() },
    } as any);
  };

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
      showError('Login Failed', toFriendlyAuthError(error.message));
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

    if (role === 'customer') {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      showError('Access Denied', 'This login portal is strictly for staff and admin accounts only.');
      return;
    }

    const destinations: Record<string, string> = {
      staff: '/staff/staff-dashboard',
      customer: '/customer',
      admin: '/admin/dashboard',
    };

    // Staff na bagong gawa ng admin: kailangan munang magpalit ng temporary
    // password bago makapasok sa staff dashboard.
    const mustChangePassword =
      role === 'staff' && data.user.user_metadata?.must_change_password === true;
    const destination = mustChangePassword ? '/staff/change-password' : destinations[role];

    if (!destination) {
      showError('Error', 'Unknown role: ' + role);
      return;
    }

    setFeedback({
      visible: true,
      type: 'success',
      title: mustChangePassword ? 'Welcome!' : 'Welcome back!',
      message: mustChangePassword
        ? 'For your security, please set your own password before you continue.'
        : 'You have successfully logged in.',
      confirmLabel: 'Continue',
      onConfirm: () => {
        closeFeedback();
        router.replace(destination as any);
      },
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={CREAM_TOP} translucent />
      <LinearGradient colors={[CREAM_TOP, CREAM_MID, CREAM_BOTTOM]} style={StyleSheet.absoluteFill} />
      <BackToLandingButton topInset={insets.top} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <AuthHeader icon="car-sport-outline" title="Welcome Back" subtitle="Sign in to your staff or admin account" />

        <AnimatedCard style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

            <TouchableOpacity style={styles.forgotRow} onPress={handleForgotPasswordPress}>
              <Text style={styles.forgot}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleLogin}
              disabled={isSubmitting}
            >
              <LinearGradient
                colors={isSubmitting ? ['#93B5F5', '#93B5F5'] : [BLUE_LIGHT, BLUE, BLUE_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.button}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>LOGIN</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.linkText}>
              Accounts are created by your shop admin. If you don't have one yet, please contact them.
            </Text>
          </ScrollView>
        </AnimatedCard>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isSubmitting} label="Signing you in..." />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

// Ang mga network error (walang internet, DNS na hindi maka-resolve sa
// supabase.co, timeout) ay hindi mali ng email/password -- ipakita ang
// malinaw na mensahe imbes na raw "java.net.UnknownHostException".
const toFriendlyAuthError = (message: string) =>
  /fetch failed|network request failed|UnknownHost|resolve host|timed? ?out|ECONN|ENOTFOUND/i.test(message)
    ? 'Cannot connect to the server. Please check your internet connection (try switching between Wi-Fi and mobile data) and try again.'
    : message;

export default function AuthScreen() {
  return <LoginScreen />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CARD_WHITE,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    minHeight: 200,
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
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  card: {
    flex: 1,
    backgroundColor: CARD_WHITE,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    marginTop: -20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: INPUT_BORDER,
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  inputField: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#1A1D21' },
  eyeBtn: { padding: 4, marginLeft: 6 },
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 20,
    shadowColor: BLUE,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  forgotRow: { alignItems: 'flex-end', marginBottom: 24, marginTop: -6 },
  forgot: { color: BLUE, fontSize: 13, fontWeight: '600' },
  linkText: { color: '#6B7280', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 8 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#3A3F47',
    fontWeight: '600',
    fontSize: 14,
  },
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
    color: TEXT_DARK,
    marginBottom: 8,
    textAlign: 'center',
  },
  feedbackMessage: {
    fontSize: 14,
    color: '#4B5563',
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