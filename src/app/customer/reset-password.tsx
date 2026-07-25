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
  va
              <Text style={[s
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
