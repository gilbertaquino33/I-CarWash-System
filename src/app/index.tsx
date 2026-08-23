import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
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

const TERMS_KEY = 'icarwash_terms_accepted_v1';

// ── Palette (light / warm) ──────────────────────────────────────
const CREAM_TOP = '#FFE9D6';
const CREAM_MID = '#FFF3E8';
const CREAM_BOTTOM = '#FFFBF6';
const BLUE = '#2563EB';
const BLUE_DARK = '#1D4ED8';
const BLUE_LIGHT = '#60A5FA';
const TEXT_DARK = '#0F172A';
const TEXT_MUTED = '#64748B';
const CARD_WHITE = '#FFFFFF';
const BORDER_SOFT = '#F1E4D6';
const ROAD_GRAY = '#CBD5E1';

/**
 * DrivingCarIntro
 * ───────────────
 * Small "road" strip with a car icon that drives across it, wheels
 * bouncing, before the main logo settles in. Purely decorative —
 * mirrors the moving-vehicle splash you see on the reference video.
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
        <Ionicons name="car-sport" size={22} color={BLUE_DARK} />
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
    const floatLoop = (val: Animated.Value, delay: number, distance: number) =>
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

    floatLoop(bubble1, 0, 10);
    floatLoop(bubble2, 220, 14);
    floatLoop(bubble3, 440, 8);

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
      // 1) road fades in
      Animated.timing(roadOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 2) car drives across the road
      Animated.timing(carProgress, {
        toValue: 1,
        duration: 950,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 3) road + car fade out, logo takes over
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
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] }),
    transform: [
      {
        translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }),
      },
    ],
  });

  return (
    <Animated.View style={[styles.splashRoot, { opacity: overlayOpacity }]} pointerEvents="none">
      <LinearGradient colors={[CREAM_TOP, CREAM_MID, CREAM_BOTTOM]} style={StyleSheet.absoluteFill} />

      <Animated.View style={[styles.bubble, { top: '30%', left: '22%' }, bubbleStyle(bubble1, 12)]}>
        <Ionicons name="water" size={16} color={BLUE_LIGHT} />
      </Animated.View>
      <Animated.View style={[styles.bubble, { top: '24%', right: '20%' }, bubbleStyle(bubble2, 16)]}>
        <Ionicons name="sparkles" size={14} color={BLUE_LIGHT} />
      </Animated.View>
      <Animated.View style={[styles.bubble, { bottom: '30%', right: '26%' }, bubbleStyle(bubble3, 10)]}>
        <Ionicons name="water" size={12} color={BLUE_LIGHT} />
      </Animated.View>

      <DrivingCarIntro roadOpacity={roadOpacity} carProgress={carProgress} wheelBounce={wheelBounce} />

      <View style={styles.splashCenter}>
        <Animated.View
          style={[
            styles.splashIconWrap,
            { opacity: iconOpacity, transform: [{ scale: iconScale }] },
          ]}
        >
          <LinearGradient colors={[BLUE_LIGHT, BLUE, BLUE_DARK]} style={styles.splashIconGradient}>
            <Ionicons name="car-sport" size={44} color="#FFFFFF" />
          </LinearGradient>
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
  const [checkingStorage, setCheckingStorage] = useState(true);
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
      } catch (e) {
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
    } catch (e) {
      // ok lang kahit mabigo mag-save, mawawala lang next app open
    }
    setShowTerms(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[CREAM_TOP, CREAM_MID, CREAM_BOTTOM]} style={StyleSheet.absoluteFill} />

      {/* Decorative background accents */}
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <Animated.View
        style={[
          styles.contentWrap,
          { opacity: contentOpacity, transform: [{ translateY: contentY }] },
        ]}
      >
        <View style={styles.iconWrap}>
          <LinearGradient colors={[BLUE_LIGHT, BLUE, BLUE_DARK]} style={styles.iconGradient}>
            <Ionicons name="car-sport" size={48} color="#FFFFFF" />
          </LinearGradient>
          <View style={styles.iconBadge}>
            <Ionicons name="water" size={14} color={BLUE} />
          </View>
        </View>

        <Text style={styles.title}>I-CarWash</Text>
        <Text style={styles.tagline}>Sparkling clean, every time.</Text>
        <Text style={styles.subtitle}>Choose your portal to continue</Text>

        {/* BUTTON PARA SA CUSTOMER */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.btnTouchable}
          onPress={() => router.replace('/customer/customer-registration')}
        >
          <LinearGradient
            colors={[BLUE_LIGHT, BLUE, BLUE_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, styles.customerBtn]}
          >
            <Ionicons name="person" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text
              style={styles.customerBtnText}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              CONTINUE AS CUSTOMER
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* LINK/BUTTON PARA SA ADMIN O STAFF */}
        <TouchableOpacity
          style={[styles.button, styles.staffBtn, styles.btnTouchable]}
          activeOpacity={0.85}
          onPress={() => router.replace('/auth')}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={TEXT_MUTED} style={{ marginRight: 8 }} />
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
                <Ionicons name="document-text-outline" size={22} color={BLUE} />
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
            >
              <LinearGradient
                colors={hasScrolledToEnd ? [BLUE_LIGHT, BLUE, BLUE_DARK] : ['#E2E8F0', '#E2E8F0']}
                style={styles.agreeButton}
              >
                <Text style={[styles.agreeButtonText, !hasScrolledToEnd && { color: '#94A3B8' }]}>
                  {hasScrolledToEnd ? 'I AGREE' : 'SCROLL TO CONTINUE'}
                </Text>
              </LinearGradient>
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
    padding: 24,
  },
  bgCircleTop: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(37, 99, 235, 0.07)',
  },
  bgCircleBottom: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  contentWrap: {
    width: '100%',
    alignItems: 'center',
  },

  iconWrap: {
    marginBottom: 20,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BLUE,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  iconBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: CARD_WHITE,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: CREAM_BOTTOM,
  },

  title: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_DARK,
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
  // Wrapper ensures BOTH buttons occupy the exact same width/height
  // footprint regardless of which one is a TouchableOpacity>LinearGradient
  // or a plain TouchableOpacity.
  btnTouchable: {
    width: '100%',
  },
  button: {
    width: '100%',
    minHeight: 54,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  customerBtn: {
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  customerBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.6,
  },
  staffBtn: {
    backgroundColor: CARD_WHITE,
    borderWidth: 1,
    borderColor: BORDER_SOFT,
  },
  staffBtnText: {
    color: TEXT_MUTED,
    fontWeight: '600',
    fontSize: 15,
  },
  footerNote: {
    marginTop: 12,
    color: '#B08968',
    fontSize: 12,
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
  splashIconWrap: {
    marginBottom: 22,
  },
  splashIconGradient: {
    width: 92,
    height: 92,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BLUE,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  splashTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT_DARK,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  splashTagline: {
    fontSize: 14,
    color: BLUE,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
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
    backgroundColor: ROAD_GRAY,
    overflow: 'hidden',
  },
  roadDash: {
    position: 'absolute',
    top: 4,
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
    opacity: 0.85,
  },
  carBadge: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  carPuff: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    right: 120,
  },

  // ===== Modal styles =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: CARD_WHITE,
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: TEXT_DARK,
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
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  agreeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
  },
});