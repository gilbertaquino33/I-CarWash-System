import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

// ── Palette (light / warm) — same as staff/admin auth.tsx ──────────
const CREAM_TOP = '#FFFFFF';
const CREAM_MID = '#F7F8FA';
const CREAM_BOTTOM = '#F4F5F7';
const BLUE = '#2563EB';
const BLUE_DARK = '#1D4ED8';
const TEXT_DARK = '#1A1D21';
const TEXT_MUTED = '#6B7280';
const INPUT_BG = '#F7F8FA';
const INPUT_BORDER = '#ECEEF1';
const SUCCESS = BLUE;
const ERROR = '#DC2626';

// NOTE: i-adjust ito kung iba ang actual filename/route ng
// staff/admin login screen mo.
const LOGIN_ROUTE = '/auth';

const RESEND_COOLDOWN_SECONDS = 30;

type Step = 'email' | 'code' | 'newPassword';
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
            onPress={() => (state.onConfirm ? state.onConfirm() : onClose())}
          >
            <Text style={styles.feedbackBtnText}>{state.confirmLabel ?? 'OK'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────
//  Step indicator (1 → 2 → 3)
// ─────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const stepIndex = step === 'email' ? 0 : step === 'code' ? 1 : 2;
  return (
    <View style={styles.stepRow}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i === stepIndex && styles.stepDotActive,
            i < stepIndex && styles.stepDotDone,
          ]}
        />
      ))}
    </View>
  );
}

export default function StaffForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();

  const [step, setStep] = useState<Step>('email');

  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [cooldown, setCooldown] = useState(0);

  const codeInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showError = (title: string, message: string) =>
    setFeedback({ visible: true, type: 'error', title, message, confirmLabel: 'OK', onConfirm: closeFeedback });

  // Countdown for the "resend code" cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ── Step 1: send the code ──
  const handleSendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      showError('Missing Email', 'Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setIsSubmitting(false);

    if (error) {
      showError('Failed to Send Code', error.message);
      return;
    }

    setCooldown(RESEND_COOLDOWN_SECONDS);
    setStep('code');
    setTimeout(() => codeInputRef.current?.focus(), 300);
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;

    const trimmedEmail = email.trim().toLowerCase();

    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setIsSubmitting(false);

    if (error) {
      showError('Failed to Resend', error.message);
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  // ── Step 2: verify the code ──
  // NOTE: Supabase's email OTP length is a project-level setting
  // (GOTRUE_MAILER_OTP_LENGTH) and can be 6, 8, or something else
  // depending on the project. We don't hardcode a specific length here —
  // we just require it to be numeric and a plausible length — so the app
  // doesn't silently break if that setting differs or changes later.
  const handleVerifyCode = async () => {
    const trimmedCode = code.trim();
    if (trimmedCode.length < 4 || trimmedCode.length > 10) {
      showError('Invalid Code', 'Please enter the code sent to your email.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'recovery',
    });
    setIsSubmitting(false);

    if (error) {
      showError('Verification Failed', error.message);
      return;
    }

    // A recovery session is now active — move on to setting a new password.
    setStep('newPassword');
  };

  // ── Step 3: set the new password ──
  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      showError('Missing Fields', 'Please fill in both password fields.');
      return;
    }
    if (newPassword.length < 6) {
      showError('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    // Patayin din ang must_change_password: kapag nag-reset na sila dito, hindi na
    // nila kailangang palitan ulit ang password pagka-login.
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    setIsSubmitting(false);

    if (error) {
      showError('Update Failed', error.message);
      return;
    }

    // Sign out of the temporary recovery session so the user logs in fresh.
    await supabase.auth.signOut();

    setFeedback({
      visible: true,
      type: 'success',
      title: 'Password Updated!',
      message: 'Your password has been reset. Please log in with your new password.',
      confirmLabel: 'Go to Login',
      onConfirm: () => {
        closeFeedback();
        router.replace(LOGIN_ROUTE as any);
      },
    });
  };

  const headerCopy: Record<Step, { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }> = {
    email: {
      icon: 'mail-outline',
      title: 'Forgot Password',
      subtitle: 'Enter your staff/admin email and we\u2019ll send you a verification code',
    },
    code: {
      icon: 'keypad-outline',
      title: 'Enter Code',
      subtitle: `We sent a verification code to ${email.trim() || 'your email'}`,
    },
    newPassword: {
      icon: 'key-outline',
      title: 'Set New Password',
      subtitle: 'Choose a new password for your account',
    },
  };

  const { icon, title, subtitle } = headerCopy[step];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM_TOP} translucent />
      <LinearGradient colors={[CREAM_TOP, CREAM_MID, CREAM_BOTTOM]} style={StyleSheet.absoluteFill} />

      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 10 }]}
        onPress={() => (step === 'email' ? router.back() : setStep(step === 'code' ? 'email' : 'code'))}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={22} color={TEXT_DARK} />
      </TouchableOpacity>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <LinearGradient colors={[BLUE, BLUE_DARK]} style={StyleSheet.absoluteFill} />
            <Ionicons name={icon} size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <StepIndicator step={step} />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── STEP 1: EMAIL ── */}
            {step === 'email' && (
              <>
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
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, isSubmitting && styles.buttonDisabled]}
                  onPress={handleSendCode}
                  activeOpacity={0.85}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>SEND CODE</Text>
                      <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* ── STEP 2: CODE ── */}
            {step === 'code' && (
              <>
                <Text style={styles.label}>Verification Code</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="keypad-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
                  <TextInput
                    ref={codeInputRef}
                    placeholder="Enter code"
                    placeholderTextColor={TEXT_MUTED}
                    style={[styles.inputField, styles.codeField]}
                    value={code}
                    onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 10))}
                    keyboardType="number-pad"
                    maxLength={10}
                    editable={!isSubmitting}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, isSubmitting && styles.buttonDisabled]}
                  onPress={handleVerifyCode}
                  activeOpacity={0.85}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>VERIFY CODE</Text>
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkContainer}
                  onPress={handleResendCode}
                  disabled={cooldown > 0 || isSubmitting}
                >
                  <Text style={styles.linkText}>
                    Didn&apos;t get a code?{' '}
                    <Text style={[styles.linkBold, cooldown > 0 && styles.linkDisabled]}>
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── STEP 3: NEW PASSWORD ── */}
            {step === 'newPassword' && (
              <>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
                  <TextInput
                    placeholder="Enter new password"
                    placeholderTextColor={TEXT_MUTED}
                    secureTextEntry={!showPassword}
                    style={[styles.inputField, { flex: 1 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    editable={!isSubmitting}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={TEXT_MUTED} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Confirm New Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-open-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
                  <TextInput
                    placeholder="Re-enter new password"
                    placeholderTextColor={TEXT_MUTED}
                    secureTextEntry={!showConfirmPassword}
                    style={[styles.inputField, { flex: 1 }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!isSubmitting}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeBtn}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={TEXT_MUTED}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.button, isSubmitting && styles.buttonDisabled]}
                  onPress={handleResetPassword}
                  activeOpacity={0.85}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>UPDATE PASSWORD</Text>
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
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
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  header: { paddingHorizontal: 28, paddingTop: 56, paddingBottom: 24 },
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
  title: { fontSize: 28, fontWeight: '800', color: TEXT_DARK, letterSpacing: -0.5 },
  subtitle: { marginTop: 6, fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },

  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },

  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  stepDot: { width: 28, height: 4, borderRadius: 2, backgroundColor: '#ECEEF1' },
  stepDotActive: { backgroundColor: BLUE },
  stepDotDone: { backgroundColor: '#93B5F5' },

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
  codeField: { fontSize: 22, fontWeight: '800', letterSpacing: 8 },
  eyeBtn: { padding: 4, marginLeft: 6 },

  button: {
    backgroundColor: BLUE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonDisabled: { backgroundColor: '#93B5F5', shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },

  linkContainer: { alignItems: 'center', marginTop: 16, marginBottom: 8 },
  linkText: { color: '#6B7280', fontSize: 14 },
  linkBold: { color: BLUE, fontWeight: '800' },
  linkDisabled: { color: '#9AA1AC' },

  // ── Feedback modal ──
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
  feedbackTitle: { fontSize: 18, fontWeight: '800', color: TEXT_DARK, marginBottom: 8, textAlign: 'center' },
  feedbackMessage: { fontSize: 14, color: '#4B5563', textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  feedbackBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  feedbackBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});