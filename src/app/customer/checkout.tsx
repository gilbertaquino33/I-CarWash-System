import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

// ---------- THEME: Blue / White / Black lang ang combination ----------
const COLORS = {
  blue: '#2563EB',
  blueDark: '#1D4ED8',
  blueTint: '#EFF6FF',
  white: '#FFFFFF',
  black: '#0F172A',
  gray: '#64748B',
  grayLight: '#E2E8F0',
  bg: '#F8FAFC',
  danger: '#EF4444',
  gcash: '#007DFE',
};

interface ReceiptData {
  refNumber: string;
  dateTime: string;
  shopId: string;
  shopName: string;
  packageName: string;
  vehicleType: string;
  price: string;
  bayName?: string;
  // NEW: payment info shown on the receipt
  paymentMethod: string;
  gcashRefNumber?: string;
}

type InfoModalType = 'warning' | 'error' | 'info';

interface InfoModalData {
  type: InfoModalType;
  title: string;
  message: string;
  // Kung meron nito, ipapakita namin as secondary action button
  // (hal. "Go to Login" pag session expired)
  onConfirm?: () => void;
  confirmLabel?: string;
}

// Pinanatili nating pula ang "error" para malinaw pa rin agad kung may
// problema, pero yung "warning" at "info" ay ginawa nang blue para
// manatili sa blue/white/black palette ng app.
const INFO_MODAL_STYLES: Record<InfoModalType, { icon: keyof typeof Ionicons.glyphMap; bg: string }> = {
  warning: { icon: 'alert-circle', bg: COLORS.blue },
  error: { icon: 'close-circle', bg: COLORS.danger },
  info: { icon: 'information-circle', bg: COLORS.blue },
};

// NOTE: Replace these with your shop's real GCash details, or fetch them
// per-shop from the DB if different branches have different GCash accounts.
const GCASH_ACCOUNT_NAME = 'iCarWash Services';
const GCASH_ACCOUNT_NUMBER = '0917-000-0000';

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    shopId?: string | string[];
    shopName?: string | string[];
    package?: string;
    vehicleType?: string;
    price?: string;
    // NEW: forwarded from reserve.tsx
    paymentMethod?: string;
  }>();

  const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId ?? '';
  const shopName = Array.isArray(params.shopName) ? params.shopName[0] : params.shopName ?? '—';
  const packageName = params.package ?? '—';
  const vehicleType = params.vehicleType ?? '—';
  const rawPrice = params.price ?? '0';
  // NEW: default to Cash if not provided (e.g. deep link without the param)
  const paymentMethod = params.paymentMethod === 'GCash' ? 'GCash' : 'Cash';
  const isGCash = paymentMethod === 'GCash';

  const isRangedPrice = rawPrice.includes('-');
  const displayPrice = isRangedPrice
    ? `₱${rawPrice.replace('-', '–₱')}`
    : `₱${rawPrice}`;

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // NEW: customer's GCash reference number after they send payment
  const [gcashRefInput, setGcashRefInput] = useState('');

  // Pinalitan natin ang lahat ng Alert.alert() ng custom in-app modal
  // (mas consistent ang look kaysa sa native OS alert, at pwede pa natin
  // i-istilo ayon sa design ng app). Isang state lang ang ginagamit para
  // sa lahat ng info/warning/error messages.
  const [infoModal, setInfoModal] = useState<InfoModalData | null>(null);

  const showInfoModal = (data: InfoModalData) => setInfoModal(data);
  const closeInfoModal = () => setInfoModal(null);

  // price column sa DB ay float4 (number), kaya kailangang i-convert.
  // Kung ranged price (e.g. "300-350"), kunin yung unang number bilang base price.
  const numericPrice = parseFloat(rawPrice.split('-')[0]);

  const generateRefNumber = () => {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ICW-${timestamp}${random}`;
  };

  const handleReserveNow = async () => {
    if (!shopId) {
      showInfoModal({
        type: 'warning',
        title: 'Missing Shop',
        message: 'Please select a shop before reserving.',
      });
      return;
    }

    // NEW: require the customer's GCash reference number before proceeding
    if (isGCash && gcashRefInput.trim().length === 0) {
      showInfoModal({
        type: 'warning',
        title: 'GCash Reference Needed',
        message: 'Please enter your GCash reference number after sending payment.',
      });
      return;
    }

    setIsPlacingOrder(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showInfoModal({
          type: 'warning',
          title: 'Session Expired',
          message: 'Please log in again to continue.',
          confirmLabel: 'Go to Login',
          onConfirm: () => router.replace('/customer/customer-registration'),
        });
        return;
      }

      // Gumagamit tayo ng "create_customer_reservation" RPC (Postgres function)
      // sa halip na direktang .insert() -- dahil kailangan nating:
      //   1) atomic na mag-assign ng isang SPECIFIC na available bay (para
      //      kahit magsabay mag-book ang dalawang customer, hindi sila
      //      magkakapatong sa parehong bay -- ginagamit ng function ang
      //      "FOR UPDATE SKIP LOCKED" para dito)
      //   2) i-mark agad ang napiling bay bilang "reserved" para makita agad
      //      ng ibang customer (at ng camera.py) na hindi na ito available,
      //      kahit wala pang physical na kotseng dumating doon.
      //
      // NOTE: payment_method / GCash ref are NOT yet sent to this RPC --
      // the current function signature (as used before this change) doesn't
      // accept them. If you want these persisted in the DB, the RPC needs
      // a p_payment_method / p_gcash_ref parameter added on the Postgres
      // side first; otherwise this data only shows on the local receipt.
      const { data, error } = await supabase.rpc('create_customer_reservation', {
        p_customer_id: session.user.id,
        p_shop_id: Number(shopId),
        p_shop_name: shopName,
        p_vehicle_type: vehicleType,
        p_service_type: packageName,
        p_price: numericPrice,
      });

      if (error) {
        // Ang RPC ay nagra-raise ng exception na may message na "NO_SLOT_AVAILABLE"
        // kapag naubusan ng bay habang nagpapatuloy ang customer sa checkout
        // (hal. may nauna palang nag-book o may bagong walk-in na pumasok).
        if (error.message?.includes('NO_SLOT_AVAILABLE')) {
          showInfoModal({
            type: 'error',
            title: 'No Slot Available',
            message: 'This branch has run out of available bays. Please choose another branch or try again later.',
          });
          return;
        }
        throw error;
      }

      const assignedBayName: string | undefined = data?.[0]?.assigned_bay_name;

      const now = new Date();
      setReceiptData({
        refNumber: generateRefNumber(),
        dateTime: now.toLocaleString('en-PH', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        shopId,
        shopName,
        packageName,
        vehicleType,
        price: displayPrice,
        bayName: assignedBayName,
        paymentMethod,
        gcashRefNumber: isGCash ? gcashRefInput.trim() : undefined,
      });
      setReceiptVisible(true);
    } catch (err: any) {
      console.error('Error placing reservation:', err);
      showInfoModal({
        type: 'error',
        title: 'Reservation Failed',
        message: err?.message ?? 'Something went wrong while placing your reservation.',
      });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleDoneReceipt = () => {
    setReceiptVisible(false);
    router.replace('/customer/dashboard' as any);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Order</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <Text style={styles.sectionLabel}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryItemRow}>
              <View style={styles.summaryIconWrap}>
                <Ionicons name="water-outline" size={22} color={COLORS.blue} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.itemTitle}>{packageName}</Text>
                <Text style={styles.itemSubtitle}>{vehicleType}</Text>
              </View>
              <Text style={styles.itemPrice}>{displayPrice}</Text>
            </View>

            {isRangedPrice && (
              <View style={styles.noticeBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.blueDark} />
                <Text style={styles.noticeText}>
                  Final price for this vehicle size will be confirmed by staff upon arrival.
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>Payment Summary</Text>
          <View style={styles.formCard}>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Service Fee</Text>
              <Text style={styles.paymentValue}>{displayPrice}</Text>
            </View>
            {/* NEW: show chosen payment method */}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment Method</Text>
              <View style={styles.paymentMethodPill}>
                <Ionicons
                  name={isGCash ? 'phone-portrait-outline' : 'cash-outline'}
                  size={13}
                  color={isGCash ? COLORS.gcash : COLORS.blueDark}
                />
                <Text style={[styles.paymentMethodPillText, isGCash && { color: COLORS.gcash }]}>
                  {paymentMethod}
                </Text>
              </View>
            </View>
            <View style={styles.paymentDivider} />
            <View style={styles.paymentRow}>
              <Text style={styles.paymentTotalLabel}>Total Amount</Text>
              <Text style={styles.paymentTotalValue}>{displayPrice}</Text>
            </View>
            <Text style={styles.payNote}>
              {isGCash
                ? 'Send payment via GCash below, then enter your reference number.'
                : 'Payment will be collected on-site upon completion of service.'}
            </Text>
          </View>

          {/* NEW: GCash payment instructions + reference number input */}
          {isGCash && (
            <>
              <Text style={styles.sectionLabel}>GCash Payment</Text>
              <View style={styles.gcashCard}>
                <View style={styles.gcashHeaderRow}>
                  <Ionicons name="phone-portrait-outline" size={20} color={COLORS.gcash} />
                  <Text style={styles.gcashHeaderText}>Send Payment To</Text>
                </View>
                <View style={styles.gcashDetailRow}>
                  <Text style={styles.gcashDetailLabel}>Account Name</Text>
                  <Text style={styles.gcashDetailValue}>{GCASH_ACCOUNT_NAME}</Text>
                </View>
                <View style={styles.gcashDetailRow}>
                  <Text style={styles.gcashDetailLabel}>GCash Number</Text>
                  <Text style={styles.gcashDetailValue}>{GCASH_ACCOUNT_NUMBER}</Text>
                </View>
                <View style={styles.gcashDetailRow}>
                  <Text style={styles.gcashDetailLabel}>Amount</Text>
                  <Text style={styles.gcashDetailValue}>{displayPrice}</Text>
                </View>

                <Text style={styles.gcashInputLabel}>GCash Reference Number</Text>
                <TextInput
                  style={styles.gcashInput}
                  placeholder="e.g. 1234567890123"
                  placeholderTextColor="#94A3B8"
                  value={gcashRefInput}
                  onChangeText={setGcashRefInput}
                  keyboardType="default"
                  autoCapitalize="characters"
                />
                <Text style={styles.gcashHint}>
                  You'll find this in your GCash app under the transaction receipt.
                </Text>
              </View>
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <View>
            <Text style={styles.bottomLabel}>Total</Text>
            <Text style={styles.bottomTotal}>{displayPrice}</Text>
          </View>
          <TouchableOpacity
            style={[styles.reserveButton, isPlacingOrder && { opacity: 0.6 }]}
            onPress={handleReserveNow}
            disabled={isPlacingOrder}
          >
            {isPlacingOrder ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.reserveButtonText}>RESERVE NOW</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* SUCCESS MODAL / DIGITAL RECEIPT */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={receiptVisible}
        onRequestClose={handleDoneReceipt}
      >
        <View style={styles.receiptOverlay}>
          <View style={styles.receiptCard}>

            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={36} color={COLORS.white} />
            </View>

            <Text style={styles.receiptSuccessTitle}>Reservation Successful!</Text>
            <Text style={styles.receiptSuccessSubtitle}>
              Your slot has been booked. Please wait for staff to confirm your queue number.
            </Text>

            <Text style={styles.receiptAmount}>{receiptData?.price}</Text>

            <View style={styles.dashedDivider} />

            <View style={styles.receiptDetailsBlock}>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Reference No.</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.refNumber}</Text>
              </View>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Date & Time</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.dateTime}</Text>
              </View>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Shop</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.shopName}</Text>
              </View>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Package</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.packageName}</Text>
              </View>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Vehicle Type</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.vehicleType}</Text>
              </View>
              {/* NEW: payment method + GCash ref on receipt */}
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Payment Method</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.paymentMethod}</Text>
              </View>
              {receiptData?.gcashRefNumber ? (
                <View style={styles.receiptDetailRow}>
                  <Text style={styles.receiptDetailLabel}>GCash Ref.</Text>
                  <Text style={styles.receiptDetailValue}>{receiptData?.gcashRefNumber}</Text>
                </View>
              ) : null}
              {receiptData?.bayName ? (
                <View style={styles.receiptDetailRow}>
                  <Text style={styles.receiptDetailLabel}>Assigned Bay</Text>
                  <Text style={styles.receiptDetailValue}>{receiptData?.bayName}</Text>
                </View>
              ) : null}
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Status</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>Waiting</Text>
                </View>
              </View>
            </View>

            <View style={styles.dashedDivider} />

            <TouchableOpacity style={styles.doneButton} onPress={handleDoneReceipt}>
              <Text style={styles.doneButtonText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* GENERIC INFO / WARNING / ERROR MODAL — kapalit ng Alert.alert() */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!infoModal}
        onRequestClose={closeInfoModal}
      >
        <View style={styles.receiptOverlay}>
          <View style={styles.infoModalCard}>
            {infoModal && (
              <>
                <View
                  style={[
                    styles.infoIconWrap,
                    { backgroundColor: INFO_MODAL_STYLES[infoModal.type].bg },
                  ]}
                >
                  <Ionicons
                    name={INFO_MODAL_STYLES[infoModal.type].icon}
                    size={32}
                    color={COLORS.white}
                  />
                </View>

                <Text style={styles.infoModalTitle}>{infoModal.title}</Text>
                <Text style={styles.infoModalMessage}>{infoModal.message}</Text>

                <TouchableOpacity
                  style={styles.infoModalButton}
                  onPress={() => {
                    const { onConfirm } = infoModal;
                    closeInfoModal();
                    onConfirm?.();
                  }}
                >
                  <Text style={styles.infoModalButtonText}>
                    {infoModal.confirmLabel ?? 'OK'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderColor: COLORS.grayLight,
  },
  backBtn: { padding: 8, backgroundColor: '#F1F5F9', borderRadius: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.black },
  content: { flex: 1, padding: 16 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 12,
  },

  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  summaryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIconWrap: {
    backgroundColor: COLORS.blueTint,
    padding: 10,
    borderRadius: 12,
  },
  itemTitle: { fontSize: 15, fontWeight: '700', color: COLORS.black },
  itemSubtitle: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: '800', color: COLORS.black },

  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.blueTint,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 11.5,
    color: COLORS.blueDark,
    lineHeight: 16,
  },

  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },

  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  paymentLabel: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  paymentValue: { fontSize: 13, color: COLORS.black, fontWeight: '700' },
  // NEW: small pill showing the selected payment method
  paymentMethodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.blueTint,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paymentMethodPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.blueDark,
  },
  paymentDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  paymentTotalLabel: { fontSize: 14, color: COLORS.black, fontWeight: '800' },
  paymentTotalValue: { fontSize: 16, color: COLORS.black, fontWeight: '900' },
  payNote: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 10,
    lineHeight: 15,
  },

  // ---------- NEW: GCash payment card ----------
  gcashCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFE0FF',
  },
  gcashHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  gcashHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.gcash,
  },
  gcashDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gcashDetailLabel: { fontSize: 12.5, color: COLORS.gray, fontWeight: '500' },
  gcashDetailValue: { fontSize: 12.5, color: COLORS.black, fontWeight: '700' },
  gcashInputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  gcashInput: {
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  gcashHint: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 6,
    lineHeight: 14,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderColor: COLORS.grayLight,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  bottomTotal: { fontSize: 18, color: COLORS.black, fontWeight: '900' },
  reserveButton: {
    backgroundColor: COLORS.blue,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  reserveButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ---------- DIGITAL RECEIPT (PayMaya / GCash style) ----------
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  successIconWrap: {
    backgroundColor: COLORS.blue,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  receiptSuccessTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
  },
  receiptSuccessSubtitle: {
    fontSize: 12.5,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  receiptAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.black,
    marginTop: 18,
  },
  dashedDivider: {
    width: '100%',
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.grayLight,
    marginVertical: 18,
  },
  receiptDetailsBlock: {
    width: '100%',
  },
  receiptDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  receiptDetailLabel: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontWeight: '500',
  },
  receiptDetailValue: {
    fontSize: 12.5,
    color: COLORS.black,
    fontWeight: '700',
  },
  statusPill: {
    backgroundColor: COLORS.blueTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.blueDark,
  },
  doneButton: {
    backgroundColor: COLORS.black,
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ---------- GENERIC INFO / WARNING / ERROR MODAL ----------
  infoModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  infoIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  infoModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
  },
  infoModalMessage: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  infoModalButton: {
    backgroundColor: COLORS.black,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 22,
  },
  infoModalButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
