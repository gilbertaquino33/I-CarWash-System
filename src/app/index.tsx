import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S } from '../theme/design';

const TERMS_KEY = 'icarwash_terms_accepted_v1';

/**
 * LoadingScreen
 * ─────────────
 * Shown every time the app opens: just the logo on white with a thin progress
 * line, then it fades away to reveal the portal. White matches the native
 * splash (app.json) so the hand-off is seamless.
 */
const LOADING_MS = 1400;
const LOGO = require('../../assets/images/logo.png');
const SPLASH_LOGO = 160; // keep equal to app.json splash imageWidth

function SplashOverlay({ onDone }: { onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const barOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(barOpacity, { toValue: 1, duration: 300, delay: 150, useNativeDriver: false }).start();
    Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: LOADING_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false, // animates width
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.View style={[styles.splashRoot, { opacity: overlayOpacity }]} pointerEvents="none">
      <Image source={LOGO} style={{ width: SPLASH_LOGO, height: SPLASH_LOGO }} resizeMode="contain" />
      <Animated.View style={[styles.progressTrack, { opacity: barOpacity }]}>
        <Animated.View
          style={[
            styles.progressFill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

export default function LandingScreen() {
  const [, setCheckingStorage] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  const insets = useSafeAreaInsets();
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    (async () => {
      try {
        const accepted = await AsyncStorage.getItem(TERMS_KEY);
        setTermsAccepted(accepted === 'true');
      } catch {
        setTermsAccepted(false);
      } finally {
        setCheckingStorage(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!splashDone) return;

    if (!termsAccepted) setShowTerms(true);

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(contentY, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [splashDone, termsAccepted]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 24;
    if (isCloseToBottom) setHasScrolledToEnd(true);
  };

  const handleAgree = async () => {
    try {
      await AsyncStorage.setItem(TERMS_KEY, 'true');
    } catch {
      // ok lang kahit mabigo mag-save, mawawala lang next app open
    }
    setShowTerms(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + S.xl }]}>
      <Animated.View
        style={[
          styles.contentWrap,
          { opacity: contentOpacity, transform: [{ translateY: contentY }] },
        ]}
      >
        <View style={styles.logoArea}>
          <Image source={LOGO} style={styles.portalLogo} resizeMode="contain" />
        </View>

        <View style={styles.actions}>
          {/* BUTTON PARA SA CUSTOMER */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.button, styles.customerBtn]}
            onPress={() => router.replace('/customer/customer-registration')}
          >
            <Ionicons name="person" size={18} color={C.white} style={{ marginRight: 8 }} />
            <Text style={styles.customerBtnText} numberOfLines={1} adjustsFontSizeToFit>
              CONTINUE AS CUSTOMER
            </Text>
          </TouchableOpacity>

          {/* LINK/BUTTON PARA SA ADMIN O STAFF */}
          <TouchableOpacity
            style={[styles.button, styles.staffBtn]}
            activeOpacity={0.85}
            onPress={() => router.replace('/auth')}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={C.textSecondary} style={{ marginRight: 8 }} />
            <Text style={styles.staffBtnText} numberOfLines={1} adjustsFontSizeToFit>
              Staff & Admin Portal
            </Text>
          </TouchableOpacity>

          <Text style={styles.footerNote}>By continuing, you agree to our Terms & Conditions</Text>
        </View>
      </Animated.View>

      {!splashDone && <SplashOverlay onDone={() => setSplashDone(true)} />}

      {/* ===== TERMS & CONDITIONS MODAL ===== */}
      <Modal visible={showTerms} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="document-text-outline" size={20} color={C.accent} />
              </View>
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
              activeOpacity={0.85}
              disabled={!hasScrolledToEnd}
              onPress={handleAgree}
              style={[styles.agreeButton, !hasScrolledToEnd && styles.agreeButtonDisabled]}
            >
              <Text style={[styles.agreeButtonText, !hasScrolledToEnd && { color: C.textMuted }]}>
                {hasScrolledToEnd ? 'I AGREE' : 'SCROLL TO CONTINUE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: S.xxl,
    backgroundColor: C.white,
  },
  // Logo + buttons are one group, centered on the screen.
  contentWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 48,
  },
  portalLogo: {
    width: SPLASH_LOGO,
    height: SPLASH_LOGO,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
  },

  button: {
    width: '100%',
    minHeight: 54,
    flexDirection: 'row',
    paddingVertical: 15,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: S.md,
  },
  customerBtn: {
    backgroundColor: C.accent,
  },
  customerBtnText: {
    color: C.white,
    fontWeight: '800',
    fontSize: F.body,
    letterSpacing: 0.4,
  },
  staffBtn: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  staffBtnText: {
    color: C.textSecondary,
    fontWeight: '600',
    fontSize: F.body,
  },
  footerNote: {
    marginTop: S.sm,
    color: C.textMuted,
    fontSize: F.caption,
    textAlign: 'center',
  },

  // ===== Loading screen =====
  splashRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.white,
    zIndex: 20,
  },
  progressTrack: {
    position: 'absolute',
    bottom: '22%',
    width: 120,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E5E9F0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: C.accent,
  },

  // ===== Modal styles =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: S.xl,
  },
  modalCard: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: C.surface,
    borderRadius: R.xl,
    padding: S.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: S.md,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: S.md,
  },
  modalTitle: {
    fontSize: F.title,
    fontWeight: '800',
    color: C.text,
  },
  termsScroll: {
    marginBottom: S.lg,
  },
  termsHeading: {
    fontSize: F.small,
    fontWeight: '700',
    color: C.text,
    marginTop: S.lg,
    marginBottom: S.xs,
  },
  termsParagraph: {
    fontSize: F.small,
    lineHeight: 20,
    color: C.textSecondary,
  },
  agreeButton: {
    paddingVertical: 15,
    borderRadius: R.md,
    alignItems: 'center',
    backgroundColor: C.accent,
  },
  agreeButtonDisabled: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  agreeButtonText: {
    color: C.white,
    fontWeight: '800',
    fontSize: F.small,
    letterSpacing: 0.8,
  },
});
