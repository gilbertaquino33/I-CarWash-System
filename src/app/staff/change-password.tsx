import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
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

// ── Palette — same as staff_forgot_password.tsx / auth.tsx ──────────
const CREAM_TOP = '#FFFFFF';
const CREAM_MID = '#F7F8FA';
const CREAM_BOTTOM = '#F4F5F7';
const BLUE = '#2563EB';
const BLUE_DARK = '#1D4ED8';
const TEXT_DARK = '#1A1D21';
const TEXT_MUTED = '#6B7280';
const INPUT_BG = '#F7F8FA';
const INPUT_BORDER = '#ECEEF1';
const ERROR = '#DC2626';

const LOGIN_ROUTE = '/auth';
const DASHBOARD_ROUTE = '/staff/staff-dashboard';
const MIN_PASSWORD_LENGTH = 8;

// Ipinapakita ito ng staff/_layout.tsx guard sa staff na bagong gawa ng admin
// (may `must_change_password` flag) hanggang makapagpalit sila ng password.
export default function StaffChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const insets = useSafeAreaInsets();

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setErrorMsg('Please fill in both password fields.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    // Isang call: bagong password + patay ang flag, para hindi mauwi sa
    // "napalitan ang password pero nakakulong pa rin sa screen na ito".
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });

    setIsSubmitting(false);

    if (error) {
      // Kasama dito ang "New password should be different from the old password."
      setErrorMsg(error.message);
      return;
    }

    setDone(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace(LOGIN_ROUTE as any);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM_TOP} translucent />
      <LinearGradient colors={[CREAM_TOP, CREAM_MID, CREAM_BOTTOM]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <LinearGradient colors={[BLUE, BLUE_DARK]} style={StyleSheet.absoluteFill} />
            <Ionicons name="key-outline" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Set Your Password</Text>
          <Text style={styles.subtitle}>
            Your account was created by your shop admin with a temporary password. For your security,
            choose your own password before you continue.
          </Text>
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
                style={styles.inputField}
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!isSubmitting}
                autoCapitalize="none"
                autoFocus
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
                style={styles.inputField}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!isSubmitting}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={TEXT_MUTED}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters, and different from your temporary password.</Text>

            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleChangePassword}
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

            <TouchableOpacity style={styles.linkContainer} onPress={handleLogout} disabled={isSubmitting}>
              <Text style={styles.linkText}>
                Not you? <Text style={styles.linkBold}>Log out</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={done} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.feedbackCard}>
            <View style={[styles.feedbackIconWrap, { backgroundColor: BLUE }]}>
              <Ionicons name="checkmark" size={30} color="#FFFFFF" />
            </View>
            <Text style={styles.feedbackTitle}>Password Updated!</Text>
            <Text style={styles.feedbackMessage}>Your new password is set. You can now use the staff dashboard.</Text>
            <TouchableOpacity
              style={[styles.feedbackBtn, { backgroundColor: BLUE }]}
              activeOpacity={0.85}
              onPress={() => {
                setDone(false);
                router.replace(DASHBOARD_ROUTE as any);
              }}
            >
              <Text style={styles.feedbackBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

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
    paddingTop: 28,
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

  hint: { fontSize: 12, color: TEXT_MUTED, marginBottom: 14, lineHeight: 17 },
  errorText: { fontSize: 13, color: ERROR, fontWeight: '600', marginBottom: 14, lineHeight: 18 },

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
