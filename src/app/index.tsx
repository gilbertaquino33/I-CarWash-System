import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const TERMS_KEY = 'icarwash_terms_accepted_v1';

export default function LandingScreen() {
  const [checkingStorage, setCheckingStorage] = useState(true);
  const [showTerms, setShowTerms] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const accepted = await AsyncStorage.getItem(TERMS_KEY);
        if (accepted !== 'true') {
          setShowTerms(true);
        }
      } catch (e) {
        // Kung sakaling mag-error yung storage, ipakita na lang ang terms para safe.
        setShowTerms(true);
      } finally {
        setCheckingStorage(false);
      }
    })();
  }, []);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 24;
    if (isCloseToBottom) setHasScrolledToEnd(true);
  };

  const handleAgree = async () => {
    try {
      await AsyncStorage.setItem(TERMS_KEY, 'true');
    } catch (e) {
      // ok lang kahit mabigo mag-save, mawawala lang next app open
    }
    setShowTerms(false);
  };

  if (checkingStorage) {
    // Ayaw natin mag-flash ng landing screen bago pa man ma-check yung storage.
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      {/* Decorative background accents */}
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <View style={styles.iconWrap}>
        <Ionicons name="car-sport" size={56} color="#FFFFFF" />
      </View>

      <Text style={styles.title}>I-CarWash</Text>
      <Text style={styles.tagline}>Sparkling clean, every time.</Text>
      <Text style={styles.subtitle}>Choose your portal to continue</Text>

      {/* BUTTON PARA SA CUSTOMER */}
      <TouchableOpacity
        style={[styles.button, styles.customerBtn]}
        activeOpacity={0.85}
        onPress={() => router.replace('/customer/customer-registration')}
      >
        <Ionicons name="person" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.customerBtnText}>CONTINUE AS CUSTOMER</Text>
      </TouchableOpacity>

      {/* LINK/BUTTON PARA SA ADMIN O STAFF */}
      <TouchableOpacity
        style={[styles.button, styles.staffBtn]}
        activeOpacity={0.85}
        onPress={() => router.replace('/auth')}
      >
        <Ionicons name="shield-checkmark-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
        <Text style={styles.staffBtnText}>Staff & Admin Portal</Text>
      </TouchableOpacity>

      <Text style={styles.footerNote}>By continuing, you agree to our Terms & Conditions</Text>

      {/* ===== TERMS & CONDITIONS MODAL ===== */}
      <Modal visible={showTerms} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="document-text-outline" size={26} color="#2563EB" />
              <Text style={styles.modalTitle}>Terms & Conditions</Text>
            </View>

            <ScrollView
              style={styles.termsScroll}
              contentContainerStyle={{ paddingBottom: 8 }}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.termsParagraph}>
                Welcome to I-CarWash! Please read the following Terms and Conditions carefully
                before using this application.
              </Text>

              <Text style={styles.termsHeading}>1. Acceptance of Terms</Text>
              <Text style={styles.termsParagraph}>
                By tapping "I Agree," you confirm that you have read, understood, and agree to be
                bound by these Terms and Conditions and our Privacy Policy.
              </Text>

              <Text style={styles.termsHeading}>2. Use of Service</Text>
              <Text style={styles.termsParagraph}>
                I-CarWash provides car wash booking and management services. You agree to provide
                accurate information when registering and booking services through the app.
              </Text>

              <Text style={styles.termsHeading}>3. Booking & Payments</Text>
              <Text style={styles.termsParagraph}>
                All bookings are subject to availability. Payment terms, cancellation policies, and
                pricing will be indicated within the app and may change from time to time.
              </Text>

              <Text style={styles.termsHeading}>4. User Responsibilities</Text>
              <Text style={styles.termsParagraph}>
                You are responsible for maintaining the confidentiality of your account and for all
                activities that occur under your account.
              </Text>

              <Text style={styles.termsHeading}>5. Privacy</Text>
              <Text style={styles.termsParagraph}>
                We collect and use your information in accordance with our Privacy Policy to
                provide and improve our services.
              </Text>

              <Text style={styles.termsHeading}>6. Limitation of Liability</Text>
              <Text style={styles.termsParagraph}>
                I-CarWash is not liable for damages resulting from misuse of the app or services
                beyond our reasonable control.
              </Text>

              <Text style={styles.termsHeading}>7. Changes to Terms</Text>
              <Text style={styles.termsParagraph}>
                We may update these Terms from time to time. Continued use of the app after changes
                means you accept the updated Terms.
              </Text>

              <Text style={[styles.termsParagraph, { marginBottom: 4 }]}>
                Scroll to the end to enable the "I Agree" button below.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.agreeButton,
                !hasScrolledToEnd && styles.agreeButtonDisabled,
              ]}
              activeOpacity={0.85}
              disabled={!hasScrolledToEnd}
              onPress={handleAgree}
            >
              <Text style={styles.agreeButtonText}>
                {hasScrolledToEnd ? 'I AGREE' : 'SCROLL TO CONTINUE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const NAVY = '#0B1120';       // background
const NAVY_CARD = '#0F1B2E';  // slightly lighter panel
const BLUE = '#2563EB';       // primary accent (hindi masakit sa mata)
const BLUE_DARK = '#1D4ED8';
const SLATE_BORDER = '#1E2D45';
const TEXT_MAIN = '#F8FAFC';  // white
const TEXT_MUTED = '#94A3B8'; // soft gray-blue

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  bgCircleTop: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#12213D',
  },
  bgCircleBottom: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#0E1A30',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: BLUE,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_MAIN,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    color: BLUE,
    fontWeight: '600',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_MUTED,
    marginBottom: 40,
    marginTop: 10,
  },
  button: {
    width: '100%',
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  customerBtn: {
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  customerBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },
  staffBtn: {
    backgroundColor: NAVY_CARD,
    borderWidth: 1,
    borderColor: SLATE_BORDER,
  },
  staffBtnText: {
    color: TEXT_MUTED,
    fontWeight: '600',
    fontSize: 15,
  },
  footerNote: {
    position: 'absolute',
    bottom: 28,
    color: '#475569',
    fontSize: 12,
  },

  // ===== Modal styles =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0B1120',
    marginLeft: 8,
  },
  termsScroll: {
    marginBottom: 16,
  },
  termsHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: BLUE_DARK,
    marginTop: 14,
    marginBottom: 4,
  },
  termsParagraph: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#334155',
  },
  agreeButton: {
    backgroundColor: BLUE,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  agreeButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  agreeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
  },
});