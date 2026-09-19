import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
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
import { PH_MOBILE_DIGITS_LENGTH, toPHMobileE164, toPHMobileInput } from '../lib/phone';

interface ShopBranch {
  id: number;
  shop_name: string;
  province: string;
  city: string;
  barangay: string;
}

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

const ALLOWED_STAFF_ADMIN_EMAILS = [
  'icarwash2026@gmail.com',
  'carwashstaff@gmail.com',
];

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

/** Sliding pill used behind the active Sign Up / Login tab. */
function TabSwitcher({
  active,
  onSelectLogin,
  onSelectRegister,
  disabled,
}: {
  active: 'login' | 'register';
  onSelectLogin: () => void;
  onSelectRegister: () => void;
  disabled?: boolean;
}) {
  const anim = useRef(new Animated.Value(active === 'register' ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: active === 'register' ? 0 : 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active]);

  const pillLeft = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '50%'] });

  return (
    <View style={styles.tabContainer}>
      <Animated.View style={[styles.tabPill, { left: pillLeft }]}>
        <LinearGradient colors={[BLUE_LIGHT, BLUE, BLUE_DARK]} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <TouchableOpacity style={styles.tabTouchable} onPress={onSelectRegister} disabled={disabled}>
        <Text style={active === 'register' ? styles.tabActiveText : styles.tabInactiveText}>Sign Up</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabTouchable} onPress={onSelectLogin} disabled={disabled}>
        <Text style={active === 'login' ? styles.tabActiveText : styles.tabInactiveText}>Login</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Header illustration shared by both screens — now a real car-wash photo
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

function LoginScreen({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);

  const insets = useSafeAreaInsets();

  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const switchToRegister = () => {
    Keyboard.dismiss();
    onSwitchToRegister();
  };
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
    const destination = destinations[role];

    if (!destination) {
      showError('Error', 'Unknown role: ' + role);
      return;
    }

    setFeedback({
      visible: true,
      type: 'success',
      title: 'Welcome back!',
      message: 'You have successfully logged in.',
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
        <AuthHeader icon="car-sport-outline" title="Welcome Back" subtitle="Sign in to your I-CarWash account" />

        <AnimatedCard style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TabSwitcher
              active="login"
              onSelectLogin={() => {}}
              onSelectRegister={switchToRegister}
              disabled={isSubmitting}
            />

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

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>I-CarWash</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.linkContainer} onPress={switchToRegister}>
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </AnimatedCard>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isSubmitting} label="Signing you in..." />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

function RegisterScreen({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Staff');
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [selectedShopName, setSelectedShopName] = useState('');
  const [shops, setShops] = useState<ShopBranch[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const switchToLogin = () => {
    Keyboard.dismiss();
    onSwitchToLogin();
  };

  const insets = useSafeAreaInsets();

  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showError = (title: string, message: string) =>
    setFeedback({ visible: true, type: 'error', title, message, confirmLabel: 'OK', onConfirm: closeFeedback });

  useEffect(() => {
    const fetchShops = async () => {
      setIsLoadingShops(true);
      const { data, error } = await supabase
        .from('shop_profile_setup')
        .select('id, shop_name, province, city, barangay')
        .order('id', { ascending: false });

      if (error) {
        console.error('Error fetching shops for staff registration:', error);
      } else {
        const loadedShops = (data as ShopBranch[]) ?? [];
        setShops(loadedShops);
        if (!selectedShopId && loadedShops.length > 0) {
          setSelectedShopId(loadedShops[0].id);
          setSelectedShopName(loadedShops[0].shop_name);
        }
      }

      setIsLoadingShops(false);
    };

    fetchShops();
  }, []);

  const syncShopIdToProfile = async (userId: string, shopId: number) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: updateData, error: syncError } = await supabase
        .from('profiles')
        .update({ shop_id: shopId })
        .eq('id', userId)
        .select();

      if (!syncError && updateData && updateData.length > 0) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return false;
  };

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      showError('Missing Fields', 'Please fill in all fields.');
      return;
    }

    const cleanMobile = toPHMobileE164(mobile);
    if (!cleanMobile) {
      showError('Invalid Mobile Number', 'Enter a valid Philippine mobile number with 10 digits after +63.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

  
    if (!ALLOWED_STAFF_ADMIN_EMAILS.includes(cleanEmail)) {
      showError(
        'Unauthorized Email',
        'This email is not authorized to register as a Staff or Admin. Contact shop management if you need access.'
      );
      return;
    }

    if (role.toLowerCase() === 'staff' && !selectedShopId) {
      showError('Missing Shop', 'Please choose the shop where this staff account will apply.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          email_address: cleanEmail,
          role: role.toLowerCase(),
          mobile: cleanMobile,
          shop_id: role.toLowerCase() === 'staff' ? selectedShopId : null,
          shop_name: role.toLowerCase() === 'staff' ? selectedShopName : '',
        },
      },
    });

    if (error) {
      setIsSubmitting(false);
      showError('Registration Failed', toFriendlyAuthError(error.message));
      return;
    }

    if (data.user && data.user.identities?.length === 0) {
      setIsSubmitting(false);
      showError('Already Registered', 'This email is already registered. Please login instead.');
      return;
    }

    let shopSyncWarning: string | null = null;
    if (data.user && data.session && role.toLowerCase() === 'staff' && selectedShopId) {
      const synced = await syncShopIdToProfile(data.user.id, selectedShopId);
      if (!synced) {
        shopSyncWarning =
          'Account created, but we could not confirm the shop assignment right away. Please check the staff\'s shop assignment in Supabase, or have them log out and log back in.';
        console.warn('Could not confirm shop_id sync for new staff account:', data.user.id);
      }
    }

    setIsSubmitting(false);

    const needsEmailConfirmation = !!data.user && !data.session;

    setFeedback({
      visible: true,
      type: shopSyncWarning ? 'error' : 'success',
      title: shopSyncWarning ? 'Account Created, With a Warning' : 'Account Created!',
      message:
        shopSyncWarning ??
        (needsEmailConfirmation
          ? 'Your account has been created. Please check your email to confirm before logging in.'
          : 'Your account has been successfully created.'),
      confirmLabel: 'Go to Login',
      onConfirm: () => {
        closeFeedback();
        switchToLogin();
      },
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={CREAM_TOP} translucent />
      <LinearGradient colors={[CREAM_TOP, CREAM_MID, CREAM_BOTTOM]} style={StyleSheet.absoluteFill} />
      <BackToLandingButton topInset={insets.top} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <AuthHeader icon="person-add-outline" title="Create Account" subtitle="Join I-CarWash and manage your experience" />

        <AnimatedCard style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <TabSwitcher
            active="register"
            onSelectLogin={switchToLogin}
            onSelectRegister={() => {}}
            disabled={isSubmitting}
          />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="Juan dela Cruz"
                placeholderTextColor={TEXT_MUTED}
                style={styles.inputField}
                value={fullName}
                onChangeText={setFullName}
                editable={!isSubmitting}
              />
            </View>

            <Text style={styles.label}>Role</Text>
            <View style={styles.pickerWrapper}>
              <Ionicons name="shield-checkmark-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <Picker
                selectedValue={role}
                onValueChange={(v) => setRole(v)}
                style={styles.picker}
                dropdownIconColor={TEXT_MUTED}
                enabled={!isSubmitting}
              >
                <Picker.Item label="Staff" value="Staff" />
                <Picker.Item label="Admin" value="Admin" />
              </Picker>
            </View>

            {role === 'Staff' && (
              <>
                <Text style={styles.label}>Assigned Shop</Text>
                <View style={styles.pickerWrapper}>
                  {isLoadingShops ? (
                    <ActivityIndicator size="small" color={BLUE} style={styles.inputIcon} />
                  ) : (
                    <Ionicons name="business-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
                  )}
                  <Picker
                    selectedValue={selectedShopId ? String(selectedShopId) : ''}
                    onValueChange={(value) => {
                      const shop = shops.find((item) => String(item.id) === String(value));
                      setSelectedShopId(shop ? shop.id : null);
                      setSelectedShopName(shop?.shop_name ?? '');
                    }}
                    style={styles.picker}
                    dropdownIconColor={TEXT_MUTED}
                    enabled={!isLoadingShops && !isSubmitting}
                  >
                    <Picker.Item label={isLoadingShops ? 'Loading shops...' : 'Select a shop'} value="" />
                    {shops.map((shop) => {
                      const location = [shop.barangay, shop.city, shop.province].filter(Boolean).join(', ');
                      return (
                        <Picker.Item
                          key={shop.id}
                          label={location ? `${shop.shop_name} • ${location}` : shop.shop_name}
                          value={String(shop.id)}
                        />
                      );
                    })}
                  </Picker>
                </View>
                <Text style={styles.helperText}>
                  {selectedShopId ? `Will be locked to branch ID ${selectedShopId} only` : 'Choose a shop from the branch list.'}
                </Text>
              </>
            )}

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

            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <Text style={styles.countryCode}>+63</Text>
              <TextInput
                placeholder="9XX XXX XXXX"
                placeholderTextColor={TEXT_MUTED}
                style={styles.inputField}
                value={mobile}
                onChangeText={(value) => setMobile(toPHMobileInput(value))}
                keyboardType="phone-pad"
                maxLength={PH_MOBILE_DIGITS_LENGTH}
                editable={!isSubmitting}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="Create a strong password"
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

            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-open-outline" size={18} color={TEXT_MUTED} style={styles.inputIcon} />
              <TextInput
                placeholder="Re-enter your password"
                placeholderTextColor={TEXT_MUTED}
                secureTextEntry={!showConfirmPassword}
                style={[styles.inputField, { flex: 1 }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!isSubmitting}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleRegister}
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
                    <Text style={styles.buttonText}>CREATE ACCOUNT</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>I-CarWash</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.linkContainer} onPress={switchToLogin}>
              <Text style={styles.linkText}>
                Already have an account? <Text style={styles.linkBold}>Login</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </AnimatedCard>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={isSubmitting} label="Creating your account..." />
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
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  if (activeTab === 'register') {
    return <RegisterScreen onSwitchToLogin={() => setActiveTab('login')} />;
  }

  return <LoginScreen onSwitchToRegister={() => setActiveTab('register')} />;
}

const pickerHeight = Platform.select({ ios: 150, android: 52 }) ?? 52;

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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F7F8FA',
    borderRadius: 50,
    padding: 4,
    marginBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  tabPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '50%',
    borderRadius: 50,
    overflow: 'hidden',
  },
  tabTouchable: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    zIndex: 1,
  },
  tabActiveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  tabInactiveText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },
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
  countryCode: { fontSize: 15, fontWeight: '700', color: '#1A1D21' },
  eyeBtn: { padding: 4, marginLeft: 6 },
  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: INPUT_BORDER,
    marginBottom: 18,
    paddingLeft: 14,
  },
  picker: {
    flex: 1,
    color: '#1A1D21',
    height: pickerHeight,
  },
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: INPUT_BORDER },
  dividerText: { marginHorizontal: 12, color: TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  linkContainer: { alignItems: 'center', marginBottom: 8 },
  linkText: { color: '#6B7280', fontSize: 14 },
  linkBold: { color: BLUE, fontWeight: '800' },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: -8,
    marginBottom: 14,
  },
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