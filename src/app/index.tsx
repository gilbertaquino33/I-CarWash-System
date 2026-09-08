import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { C, F, R, S } from '../theme/design';

const TERMS_KEY = 'icarwash_terms_accepted_v1';

/**
 * DrivingCarIntro
 * ───────────────
 * Small "road" strip with a car icon that drives across it, wheels
 * bouncing, before the main mark settles in. Purely decorative.
 */
function DrivingCarIntro({ roadOpacity, carProgress, wheelBounce }: {
  roadOpacity: Animated.Value;
  carProgress: Animated.Value;
  wheelBounce: Animated.Value;
}) {
  const carTranslateX = carProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-125, 125],
  });
  const carTranslateY = carProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [8, -10, 8],
  });
  const wheelY = wheelBounce.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const exhaustOpacity = carProgress.interpolate({
    inputRange: [0, 0.08, 0.92, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View style={[styles.roadWrap, { opacity: roadOpacity }]} pointerEvents="none">
      <View style={styles.roadBar}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.roadDash, { left: 14 + i * 46 }]} />
        ))}
      </View>

      <Animated.View
        style={[
          styles.carPuff,
          { opacity: exhaustOpacity, transform: [{ translateX: carTranslateX }, { translateY: 4 }] },
        ]}
      />

      <Animated.View
        style={[
          styles.carBadge,
          { transform: [{ translateX: carTranslateX }, { translateY: Animated.add(carTranslateY, wheelY) }] },
        ]}
      >
        <Ionicons name="car-sport" size={22} color={C.accent} />
      </Animated.View>
    </Animated.View>
  );
}

function SplashOverlay({ onDone }: { onDone: () => void }) {
  const roadOpacity = useRef(new Animated.Value(0)).current;
  const carProgress = useRef(new Animated.Value(0)).current;
  const wheelBounce = useRef(new Animated.Value(0)).current;

  const iconScale = useRef(new Animated.Value(0.5)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(14)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const bubble1 = useRef(new Animated.Value(0)).current;
  const bubble2 = useRef(new Animated.Value(0)).current;
  const bubble3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const floatLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: 1400,
            delay,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();

    floatLoop(bubble1, 0);
    floatLoop(bubble2, 220);
    floatLoop(bubble3, 440);

    const wheelLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(wheelBounce, {
          toValue: 1,
          duration: 130,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(wheelBounce, {
          toValue: 0,
          duration: 130,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    wheelLoop.start();

    Animated.sequence([
      Animated.timing(roadOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(carProgress, {
        toValue: 1,
        duration: 950,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(roadOpacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(700),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      wheelLoop.stop();
      onDone();
    });
  }, []);

  const bubbleStyle = (val: Animated.Value, distance: number) => ({
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.7] }),
    transform: [
      {
        translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }),
      },
    ],
  });

  return (
    <Animated.View style={[styles.splashRoot, { opacity: overlayOpacity }]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} />

      <Animated.View style={[styles.bubble, { top: '30%', left: '22%' }, bubbleStyle(bubble1, 12)]}>
        <Ionicons name="water" size={16} color={C.borderStrong} />
      </Animated.View>
      <Animated.View style={[styles.bubble, { top: '24%', right: '20%' }, bubbleStyle(bubble2, 16)]}>
        <Ionicons name="sparkles" size={14} color={C.borderStrong} />
      </Animated.View>
      <Animated.View style={[styles.bubble, { bottom: '30%', right: '26%' }, bubbleStyle(bubble3, 10)]}>
        <Ionicons name="water" size={12} color={C.borderStrong} />
      </Animated.View>

      <DrivingCarIntro roadOpacity={roadOpacity} carProgress={carProgress} wheelBounce={wheelBounce} />

      <View style={styles.splashCenter}>
        <Animated.View
          style={[
            styles.mark,
            { opacity: iconOpacity, transform: [{ scale: iconScale }] },
          ]}
        >
          <Ionicons name="car-sport" size={38} color={C.white} />
        </Animated.View>

        <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textY }] }}>
          <Text style={styles.splashTitle}>I-CarWash</Text>
          <Text style={styles.splashTagline}>Sparkling clean, every time.</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export default function LandingScreen() {
  const [, setCheckingStorage] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

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
    <View style={styles.container}>
      {/* Decorative background accents */}
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <Animated.View
        style={[
          styles.contentWrap,
          { opacity: contentOpacity, transform: [{ translateY: contentY }] },
        ]}
      >
        <View style={styles.mark}>
          <Ionicons name="car-sport" size={40} color={C.white} />
        </View>

        <Text style={styles.title}>I-CarWash</Text>
        <Text style={styles.tagline}>Sparkling clean, every time.</Text>
        <Text style={styles.subtitle}>Choose your portal to continue</Text>

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
    justifyContent: 'center',
    alignItems: 'center',
    padding: S.xxl,
    backgroundColor: C.bg,
  },
  bgCircleTop: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: C.accentSoft,
  },
  bgCircleBottom: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: C.surfaceAlt,
  },
  contentWrap: {
    width: '100%',
    alignItems: 'center',
  },

  // Clean flat mark (kept, minimal — no gradient)
  mark: {
    width: 84,
    height: 84,
    borderRadius: R.xl,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: S.xl,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: F.body,
    color: C.accent,
    fontWeight: '600',
    marginTop: S.xs,
  },
  subtitle: {
    fontSize: F.subtitle,
    color: C.textSecondary,
    marginBottom: 36,
    marginTop: S.sm,
  },

  button: {
    width: '100%',
    minHeight: 52,
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
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  staffBtnText: {
    color: C.textSecondary,
    fontWeight: '600',
    fontSize: F.body,
  },
  footerNote: {
    marginTop: S.md,
    color: C.textMuted,
    fontSize: F.caption,
  },

  // ===== Splash =====
  splashRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  splashCenter: {
    alignItems: 'center',
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: S.xl,
  },
  splashTagline: {
    fontSize: F.body,
    color: C.accent,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: S.xs,
  },
  bubble: {
    position: 'absolute',
  },

  // ===== Driving car intro =====
  roadWrap: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    width: 280,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  roadBar: {
    width: 240,
    height: 10,
    borderRadius: 6,
    backgroundColor: C.borderStrong,
    overflow: 'hidden',
  },
  roadDash: {
    position: 'absolute',
    top: 4,
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.white,
    opacity: 0.9,
  },
  carBadge: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  carPuff: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.borderStrong,
    right: 120,
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
