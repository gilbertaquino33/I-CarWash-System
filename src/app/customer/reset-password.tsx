import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const NAVY = '#0B1120';
const BLUE = '#2563EB';
const TEXT_MAIN = '#F8FAFC';
const TEXT_MUTED = '#94A3B8';
const SUCCESS = '#2563EB';
const ERROR = '#DC2626';

// NOTE: i-adjust ito kung iba yung actual filename ng login screen mo
// sa src/app/customer/.
const LOGIN_ROUTE = '/customer/customer-registration';

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
//  Success / Error Modal (same pattern as customer-registration.tsx)
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
            onPress={() => (state.onConfirm ? state.onConfirm() : onClose())}
          >
            <Text style={styles.feedbackBtnText}>{state.confirmLabel ?? 'OK'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

type SessionStatus = 'checking' | 'ready' | 'invalid';

export default function ResetPasswordScreen() {
  // Supabase can send either:
  //  - PKCE flow (current default): ?code=xxxxx
  //  - Implicit flow (older projects): ?access_token=xxx&refresh_token=xxx
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
  }>();

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const insets = useSafeAreaInsets();

  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showError = (title: string, message: string) =>
    setFeedback({ visible: true, type: 'error', title, message, confirmLabel: 'OK', onConfirm: closeFeedback });

  // Establish the recovery session from the link params as soon as the screen mounts.
  useEffect(() => {
    const establishSession = async () => {
      try {
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
          setSessionStatus('ready');
          return;
        }

        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;
          setSessionStatus('ready');
          return;
        }

        // Fallback: maybe a session already exists in this app instance
        // (e.g. Supabase auto-detected the URL on mount).
        const { data } = await supabase.auth.getSession();
        setSessionStatus(data.session ? 'ready' : 'invalid');
      } catch (err) {
        setSessionStatus('invalid');
      }
    };

    establishSession();
  }, [params.code, params.access_token, params.refresh_token]);

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

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setIsSubmitting(false);

    if (error) {
      showError('Update Failed', error.message);
      return;
    }

    // Sign out of the temporary recovery session so the user logs in fresh
    // with their new password.
    await supabase.auth.signOut();

    setFeedback({
      visible: true,
      type: 'success',
      title: 'Password Updated!',
      message: 'Your password has been reset. Please log in with your new password.',
      confirmLabel: 'Go to Login',
      onConfirm: () => {
        closeFeedback();
        router.replace(LOGIN_ROUTE);
      },
    });
  };

  // ── Still verifying the link ──
  if (sessionStatus === 'checking') {
    return (
      <View style={[styles.root, styles.centerFill, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.checkingText}>Verifying your link...</Text>
      </View>
    );
  }

  // ── Link expired, already used, or malformed ──
  if (sessionStatus === 'invalid') {
    return (
      <View style={[styles.root, styles.centerFill, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={styles.invalidIconWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={ERROR} />
        </View>
        <Text style={styles.invalidTitle}>Link Invalid or Expired</Text>
        <Text style={styles.invalidMessage}>
          This password reset link is no longer valid. Please request a new one from the login screen.
        </Text>
        <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={() => router.replace(LOGIN_ROUTE)}>
          <Text style={styles.buttonText}>BACK TO LOGIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Ready: show the new-password form ──
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Ionicons name="key-outline" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>Choose a new password for your account</Text>
        </View>

        <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
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
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  centerFill: { justifyContent: 'center', alignItems: 'center' },
  checkingText: { marginTop: 14, color: TEXT_MUTED, fontSize: 14, fontWeight: '600' },

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
  title: { fontSize: 28, fontWeight: '800', color: TEXT_MAIN, letterSpacing: -0.5 },
  subtitle: { marginTop: 6, fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },

  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
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
    marginTop: 8,
    marginBottom: 20,
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonDisabled: { backgroundColor: '#93B5F5', shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },

  // ── Invalid link state ──
  invalidIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  invalidTitle: { fontSize: 20, fontWeight: '800', color: TEXT_MAIN, marginBottom: 10, textAlign: 'center' },
  invalidMessage: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },

  // ── Feedback modal (same pattern as customer-registration.tsx) ──
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
  feedbackTitle: { fontSize: 18, fontWeight: '800', color: NAVY, marginBottom: 8, textAlign: 'center' },
  feedbackMessage: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  feedbackBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  feedbackBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});
