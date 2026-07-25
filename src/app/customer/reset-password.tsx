import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
} from 'react-native';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export interface PasswordRequirement {
  id: string;
  label: string;
  validator: (password: string) => boolean;
}

export interface SecurityAuditLog {
  timestamp: string;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  details: string;
}

export interface ResetPasswordProps {
  navigation?: any;
  route?: {
    params?: {
      token?: string;
      email?: string;
    };
  };
}

export interface UITheme {
  primary: string;
  background: string;
  surface: string;
  text: string;
  subtext: string;
  error: string;
  success: string;
  warning: string;
  border: string;
}

// ==========================================
// CONSTANTS & DUMMY CONFIGURATIONS
// ==========================================

const LIGHT_THEME: UITheme = {
  primary: '#007AFF',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  subtext: '#8E8E93',
  error: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  border: '#C7C7CC',
};

const DARK_THEME: UITheme = {
  primary: '#0A84FF',
  background: '#000000',
  surface: '#1C1C1E',
  text: '#FFFFFF',
  subtext: '#8E8E93',
  error: '#FF453A',
  success: '#30D158',
  warning: '#FF9F0A',
  border: '#38383A',
};

const DUMMY_REQUIREMENTS: PasswordRequirement[] = [
  { id: 'length', label: 'At least 8 characters long', validator: (p) => p.length >= 8 },
  { id: 'uppercase', label: 'At least one uppercase letter (A-Z)', validator: (p) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'At least one lowercase letter (a-z)', validator: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'At least one numerical digit (0-9)', validator: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'At least one special character (!@#$%^&*)', validator: (p) => /[!@#$%^&*]/.test(p) },
];

const MOCK_CARWASH_SERVICES = [
  'Body Wash & Wax',
  'Underchassis Wash',
  'Interior Detailing',
  'Engine Bay Cleaning',
  'Ceramic Coating',
  'Tire Black & Polish',
];

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ResetPasswordScreen({ navigation, route }: ResetPasswordProps) {
  // ----------------------------------------
  // STATE MANAGEMENT
  // ----------------------------------------
  const [token, setToken] = useState<string>(route?.params?.token || '');
  const [email, setEmail] = useState<string>(route?.params?.email || '');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [passwordStrength, setPasswordStrength] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [showLogsModal, setShowLogsModal] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const currentTheme = isDarkMode ? DARK_THEME : LIGHT_THEME;

  // ----------------------------------------
  // LIFECYCLE EFFECTS
  // ----------------------------------------

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    logSecurityEvent('INIT_SCREEN', 'SUCCESS', 'Reset Password screen initialized.');
  }, []);

  useEffect(() => {
    calculatePasswordStrength(newPassword);
  }, [newPassword]);

  // ----------------------------------------
  // HELPER FUNCTIONS & LOGIC
  // ----------------------------------------

  const logSecurityEvent = (action: string, status: 'SUCCESS' | 'FAILED' | 'WARNING', details: string) => {
    const newLog: SecurityAuditLog = {
      timestamp: new Date().toISOString(),
      action,
      status,
      details,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const calculatePasswordStrength = (pass: string) => {
    if (!pass) {
      setPasswordStrength(0);
      return;
    }
    let score = 0;
    DUMMY_REQUIREMENTS.forEach((req) => {
      if (req.validator(pass)) score += 20;
    });
    setPasswordStrength(score);
  };

  const triggerShakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const triggerButtonPressAnim = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const validateForm = (): boolean => {
    setErrorMessage(null);

    if (!token.trim()) {
      setErrorMessage('Reset token is missing or invalid.');
      logSecurityEvent('VALIDATE_FORM', 'FAILED', 'Missing reset token.');
      triggerShakeAnimation();
      return false;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      logSecurityEvent('VALIDATE_FORM', 'FAILED', 'Invalid email string.');
      triggerShakeAnimation();
      return false;
    }

    if (passwordStrength < 80) {
      setErrorMessage('Password does not meet the minimum security requirements.');
      logSecurityEvent('VALIDATE_FORM', 'WARNING', 'Weak password attempt.');
      triggerShakeAnimation();
      return false;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      logSecurityEvent('VALIDATE_FORM', 'FAILED', 'Password confirmation mismatch.');
      triggerShakeAnimation();
      return false;
    }

    if (!termsAccepted) {
      setErrorMessage('You must accept the Carwash System Terms of Service.');
      logSecurityEvent('VALIDATE_FORM', 'WARNING', 'Terms not accepted.');
      triggerShakeAnimation();
      return false;
    }

    return true;
  };

  const handleResetPassword = async () => {
    triggerButtonPressAnim();

    if (!validateForm()) return;

    setIsLoading(true);
    logSecurityEvent('SUBMIT_RESET', 'SUCCESS', 'Submitting password reset payload.');

    try {
      // Mock network API request delay
      await new Promise((resolve) => setTimeout(resolve, 2500));

      setIsLoading(false);
      setSuccessMessage('Your password has been successfully updated! You can now log in.');
      logSecurityEvent('RESET_SUCCESS', 'SUCCESS', 'Password updated in database.');

      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => navigation?.navigate?.('Login') },
      ]);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'An unexpected error occurred. Please try again.');
      logSecurityEvent('RESET_ERROR', 'FAILED', err?.message || 'Network exception.');
      triggerShakeAnimation();
    }
  };

  const renderStrengthMeter = () => {
    let color = currentTheme.error;
    let label = 'Weak';

    if (passwordStrength >= 80) {
      color = currentTheme.success;
      label = 'Strong';
    } else if (passwordStrength >= 40) {
      color = currentTheme.warning;
      label = 'Moderate';
    }

    return (
      <View style={styles.strengthContainer}>
        <View style={styles.strengthHeader}>
          <Text style={[styles.labelText, { color: currentTheme.text }]}>Password Strength:</Text>
          <Text style={[styles.strengthLabel, { color }]}>{label}</Text>
        </View>
        <View style={[styles.strengthBarBackground, { backgroundColor: currentTheme.border }]}>
          <View
            style={[
              styles.strengthBarFill,
              { width: `${passwordStrength}%`, backgroundColor: color },
            ]}
          />
        </View>
      </View>
    );
  };

  // ----------------------------------------
  // RENDER UI
  // ----------------------------------------

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentTheme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Animated.View
            style={[
              styles.animatedContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateX: shakeAnim }],
              },
            ]}
          >
            {/* Header Section */}
            <View style={styles.headerContainer}>
              <Text style={[styles.systemTitle, { color: currentTheme.primary }]}>
                I-CarWash System
              </Text>
              <Text style={[styles.screenTitle, { color: currentTheme.text }]}>
                Reset Your Password
              </Text>
              <Text style={[styles.subtitle, { color: currentTheme.subtext }]}>
                Secure your account to manage carwash reservations, staff payroll, and bay status.
              </Text>
            </View>

            {/* Dark Mode Toggle */}
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: currentTheme.text }]}>Dark Mode</Text>
              <Switch
                value={isDarkMode}
                onValueChange={(val) => setIsDarkMode(val)}
                trackColor={{ false: '#767577', true: currentTheme.primary }}
              />
            </View>

            {/* Error & Success Banners */}
            {errorMessage && (
              <View style={[styles.banner, { backgroundColor: currentTheme.error + '20', borderColor: currentTheme.error }]}>
                <Text style={[styles.bannerText, { color: currentTheme.error }]}>{errorMessage}</Text>
              </View>
            )}

            {successMessage && (
              <View style={[styles.banner, { backgroundColor: currentTheme.success + '20', borderColor: currentTheme.success }]}>
                <Text style={[styles.bannerText, { color: currentTheme.success }]}>{successMessage}</Text>
              </View>
            )}

            {/* Input Form Fields */}
            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: currentTheme.text }]}>Reset Token / Code</Text>
              <TextInput
                style={[styles.textInput, { color: currentTheme.text, borderColor: currentTheme.border, backgroundColor: currentTheme.surface }]}
                placeholder="Enter reset token"
                placeholderTextColor={currentTheme.subtext}
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: currentTheme.text }]}>Account Email</Text>
              <TextInput
                style={[styles.textInput, { color: currentTheme.text, borderColor: currentTheme.border, backgroundColor: currentTheme.surface }]}
                placeholder="Enter registered email"
                placeholderTextColor={currentTheme.subtext}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: currentTheme.text }]}>New Password</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={[styles.textInput, styles.passwordInput, { color: currentTheme.text, borderColor: currentTheme.border, backgroundColor: currentTheme.surface }]}
                  placeholder="Enter new password"
                  placeholderTextColor={currentTheme.subtext}
                  secureTextEntry={!showPassword}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity
                  style={styles.showHideButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={{ color: currentTheme.primary }}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {renderStrengthMeter()}

            {/* Requirements Checklist */}
            <View style={[styles.requirementsBox, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}>
              <Text style={[styles.requirementsTitle, { color: currentTheme.text }]}>
                Password Requirements
              </Text>
              {DUMMY_REQUIREMENTS.map((req) => {
                const isValid = req.validator(newPassword);
                return (
                  <View key={req.id} style={styles.reqRow}>
                    <Text style={{ color: isValid ? currentTheme.success : currentTheme.subtext, marginRight: 8 }}>
                      {isValid ? '✓' : '○'}
                    </Text>
                    <Text style={[styles.reqText, { color: isValid ? currentTheme.text : currentTheme.subtext }]}>
                      {req.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: currentTheme.text }]}>Confirm New Password</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={[styles.textInput, styles.passwordInput, { color: currentTheme.text, borderColor: currentTheme.border, backgroundColor: currentTheme.surface }]}
                  placeholder="Re-enter new password"
                  placeholderTextColor={currentTheme.subtext}
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity
                  style={styles.showHideButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Text style={{ color: currentTheme.primary }}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Checkbox Terms */}
            <View style={styles.termsRow}>
              <TouchableOpacity
                style={[
                  styles.checkbox,
                  {
                    borderColor: currentTheme.border,
                    backgroundColor: termsAccepted ? currentTheme.primary : 'transparent',
                  },
                ]}
                onPress={() => setTermsAccepted(!termsAccepted)}
              >
                {termsAccepted && <Text style={{ color: '#FFF', fontWeight: 'bold' }}>✓</Text>}
              </TouchableOpacity>
              <Text style={[styles.termsText, { color: currentTheme.text }]}>
                I accept the{' '}
                <Text
                  style={{ color: currentTheme.primary, textDecorationLine: 'underline' }}
                  onPress={() => setShowTermsModal(true)}
                >
                  Carwash Security Policies & Terms
                </Text>
              </Text>
            </View>

            {/* Action Buttons */}
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: currentTheme.primary }]}
                onPress={handleResetPassword}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Auxiliary Tools & Debug Section */}
            <View style={styles.auxContainer}>
              <TouchableOpacity onPress={() => setShowLogsModal(true)}>
                <Text style={[styles.auxLink, { color: currentTheme.primary }]}>View Local Audit Logs ({auditLogs.length})</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => navigation?.goBack?.()}>
                <Text style={[styles.auxLink, { color: currentTheme.subtext }]}>Back to Login</Text>
              </TouchableOpacity>
            </View>

            {/* Dummy Services List Footer */}
            <View style={styles.footerInfo}>
              <Text style={[styles.footerTitle, { color: currentTheme.subtext }]}>
                Supported Carwash Services
              </Text>
              <View style={styles.badgeContainer}>
                {MOCK_CARWASH_SERVICES.map((item, index) => (
                  <View key={index} style={[styles.badge, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}>
                    <Text style={[styles.badgeText, { color: currentTheme.subtext }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ========================================== */}
      {/* AUDIT LOGS MODAL */}
      {/* ========================================== */}
      <Modal visible={showLogsModal} animationType="slide" transparent={false}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: currentTheme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: currentTheme.text }]}>Security Audit Logs</Text>
            <TouchableOpacity onPress={() => setShowLogsModal(false)}>
              <Text style={{ color: currentTheme.primary, fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            {auditLogs.map((log, index) => (
              <View key={index} style={[styles.logCard, { backgroundColor: currentTheme.surface, borderColor: currentTheme.border }]}>
                <Text style={[styles.logTime, { color: currentTheme.subtext }]}>{log.timestamp}</Text>
                <Text style={[styles.logAction, { color: currentTheme.text }]}>[{log.action}] - Status: {log.status}</Text>
                <Text style={[styles.logDetails, { color: currentTheme.subtext }]}>{log.details}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ========================================== */}
      {/* TERMS MODAL */}
      {/* ========================================== */}
      <Modal visible={showTermsModal} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: currentTheme.surface }]}>
            <Text style={[styles.modalTitle, { color: currentTheme.text }]}>System Terms of Service</Text>
            <ScrollView style={{ maxHeight: 250, marginVertical: 12 }}>
              <Text style={[styles.termsBodyText, { color: currentTheme.text }]}>
                Welcome to the I-CarWash System platform. By resetting your account password, you agree to comply with our security protocols regarding bay scheduling, employee monitoring, payment transactions, and automated vehicle identification logs.
                {'\n\n'}
                1. Account Credentials: Users are responsible for keeping passwords confidential.
                {'\n\n'}
                2. System Usage: Unauthorized access to admin or payroll tools is strictly prohibited.
                {'\n\n'}
                3. Privacy: Vehicle license photos and bay occupancy recordings are used strictly for service verification.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: currentTheme.primary }]}
              onPress={() => {
                setTermsAccepted(true);
                setShowTermsModal(false);
              }}
            >
              <Text style={styles.submitButtonText}>Accept & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ==========================================
// STYLESHEET
// ==========================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContainer: {
    paddingGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  animatedContainer: {
    flex: 1,
  },
  headerContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  systemTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  banner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerText: {
    fontSize: 14,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  passwordInputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 60,
  },
  showHideButton: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
  },
  strengthContainer: {
    marginBottom: 16,
  },
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  labelText: {
    fontSize: 13,
  },
  strengthLabel: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  strengthBarBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: '100%',
  },
  requirementsBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  reqText: {
    fontSize: 12,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  termsText: {
    fontSize: 13,
    flex: 1,
  },
  submitButton: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  auxContainer: {
    marginTop: 20,
    alignItems: 'center',
    gap: 12,
  },
  auxLink: {
    fontSize: 14,
    fontWeight: '500',
  },
  footerInfo: {
    marginTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 16,
  },
  footerTitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
  },
  modalSafeArea: {
    flex: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
  },
  logCard: {
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  logTime: {
    fontSize: 10,
    marginBottom: 2,
  },
  logAction: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  logDetails: {
    fontSize: 11,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    borderRadius: 12,
    padding: 20,
  },
  termsBodyText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
