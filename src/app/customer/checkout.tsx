import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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
};

// NEW: GCash brand accent -- ginagamit lang ito para sa GCash chip at sa
// simulated GCash payment modal, para agad makilala ito bilang GCash
// kahit nasa loob pa rin ng Blue/White/Black na app theme.
const GCASH_BLUE = '#007DFE';

type PaymentMethod = 'Cash on Hand' | 'GCash';
const PAYMENT_METHODS: PaymentMethod[] = ['Cash on Hand', 'GCash'];

type GcashStage = 'confirm' | 'processing' | 'success';

interface ReceiptData {
  refNumber: string;
  dateTime: string;
  shopId: string;
  shopName: string;
  packageName: string;
  vehicleType: string;
  price: string;
  bayName?: string;
  paymentMethod: string;
  paymentStatusLabel: string;
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

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    shopId?: string | string[];
    shopName?: string | string[];
    package?: string;
    vehicleType?: string;
    price?: string;
  }>();

  const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId ?? '';
  const shopName = Array.isArray(params.shopName) ? params.shopName[0] : params.shopName ?? '—';
  const packageName = params.package ?? '—';
  const vehicleType = params.vehicleType ?? '—';
  const rawPrice = params.price ?? '0';

  const isRangedPrice = rawPrice.includes('-');
  const displayPrice = isRangedPrice
    ? `₱${rawPrice.replace('-', '–₱')}`
    : `₱${rawPrice}`;

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // pangalan ng naka-login na customer -- kailangan ito para makita
  // ng staff kung sino ang nag-reserve, sa halip na customer_id lang.
  const [customerName, setCustomerName] = useState('');

  // NEW: pinipiling paraan ng bayad bago makapag-reserve.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');

  // NEW: state para sa simulated GCash payment modal.
  const [gcashModalVisible, setGcashModalVisible] = useState(false);
  const [gcashStage, setGcashStage] = useState<GcashStage>('confirm');
  const [gcashRefNumber, setGcashRefNumber] = useState('');

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

  // NEW: fake/simulated GCash reference number lang -- walang koneksyon
  // sa totoong GCash system, para lang magmukhang totoong resibo.
  const generateGcashRefNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(100000 + Math.random() * 900000);
    return `GC${timestamp}${random}`;
  };

  // kunin ang full_name ng naka-login na customer para maisama sa
  // reservation record -- ito ang makikita ng staff sa Reservations tab.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      setCustomerName(data?.full_name ?? '');
    })();
  }, []);

  // NEW: talagang i-tatawag na dito ang RPC at ise-set ang receipt --
  // ginagamit ito ng dalawang path: (1) Cash on Hand, diretso; at
  // (2) GCash, pagkatapos ng simulated payment success.
  const finalizeReservation = async (
    method: PaymentMethod,
    paymentStatus: 'paid' | 'unpaid',
    extra?: { gcashRef?: string }
  ) => {
    if (!shopId) {
      showInfoModal({
        type: 'warning',
        title: 'Missing Shop',
        message: 'Please select a shop before reserving.',
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
      // NEW: ipinapasa na rin dito ang p_customer_name, p_payment_method, at
      // p_payment_status -- kailangan mo munang i-update ang RPC function mo
      // sa Supabase para tanggapin ang mga bagong parameter na ito at
      // isama sa insert statement.
      const { data, error } = await supabase.rpc('create_customer_reservation', {
        p_customer_id: session.user.id,
        p_shop_id: Number(shopId),
        p_shop_name: shopName,
        p_customer_name: customerName || 'Customer',
        p_vehicle_type: vehicleType,
        p_service_type: packageName,
        p_price: numericPrice,
        p_payment_method: method,
        p_payment_status: paymentStatus,
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
        refNumber: extra?.gcashRef ?? generateRefNumber(),
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
        paymentMethod: method,
        paymentStatusLabel: paymentStatus === 'paid' ? 'Paid' : 'Unpaid',
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

  // NEW: pinakaunang pinipindot ng customer -- dito muna sina-check kung
  // may napiling payment method bago mag-proceed sa kani-kanilang flow.
  const handleReserveNow = () => {
    if (!shopId) {
      showInfoModal({
        type: 'warning',
        title: 'Missing Shop',
        message: 'Please select a shop before reserving.',
      });
      return;
    }

    if (!paymentMethod) {
      showInfoModal({
        type: 'warning',
        title: 'Choose Payment Method',
        message: 'Please select Cash on Hand or GCash before reserving your slot.',
      });
      return;
    }

    if (paymentMethod === 'GCash') {
      // Hindi pa direktang mag-re-reserve dito -- ipapakita muna ang
      // simulated GCash payment modal. Sa loob nito, sa 'success' stage
      // saka pa lang tatawagin ang finalizeReservation() bilang 'paid'.
      setGcashStage('confirm');
      setGcashRefNumber('');
      setGcashModalVisible(true);
      return;
    }

    // Cash on Hand: walang kailangang online payment step -- diretsong
    // ma-reserve ang slot bilang 'unpaid', babayaran sa shop mismo.
    finalizeReservation('Cash on Hand', 'unpaid');
  };

  // NEW: sinisimulan ang "processing" stage ng simulated GCash payment,
  // tapos pagkatapos ng ilang segundo, lilipat sa "success" stage na may
  // fake reference number -- lahat ito ay client-side lang, walang
  // totoong charge na nangyayari (wala pang connected na GCash/PayMongo API).
  const startGcashSimulation = () => {
    setGcashStage('processing');
    setTimeout(() => {
      setGcashRefNumber(generateGcashRefNumber());
      setGcashStage('success');
    }, 1800);
  };

  // NEW: pagkatapos ng "successful" simulated GCash payment, isasara ang
  // modal at saka pa lang talaga tatawagin ang RPC para i-finalize ang
  // reservation bilang 'paid'.
  const confirmGcashPaymentAndReserve = () => {
    setGcashModalVisible(false);
    finalizeReservation('GCash', 'paid', { gcashRef: gcashRefNumber });
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

          {/* NEW: PAYMENT METHOD SELECTION -- kailangan piliin bago
              maka-Reserve. Cash on Hand = babayaran sa shop; GCash =
              may simulated online payment step. */}
          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={styles.chipRow}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.chip,
                  paymentMethod === m && (m === 'GCash' ? styles.chipActiveGCash : styles.chipActive),
                ]}
                onPress={() => setPaymentMethod(m)}
              >
                <Ionicons
                  name={m === 'GCash' ? 'phone-portrait-outline' : 'cash-outline'}
                  size={14}
                  color={paymentMethod === m ? '#fff' : COLORS.gray}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.chipText, paymentMethod === m && styles.chipTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {paymentMethod === 'Cash on Hand' && (
            <View style={styles.paymentMethodHintBox}>
              <Ionicons name="cash-outline" size={16} color={COLORS.blueDark} />
              <Text style={styles.paymentMethodHintText}>
                You will pay {displayPrice} in cash directly at the shop once your service is
                completed. Please bring the exact amount if possible so staff can process your
                payment faster.
              </Text>
            </View>
          )}

          {paymentMethod === 'GCash' && (
            <View style={[styles.paymentMethodHintBox, styles.gcashHintBox]}>
              <Ionicons name="phone-portrait-outline" size={16} color={GCASH_BLUE} />
              <Text style={[styles.paymentMethodHintText, { color: GCASH_BLUE }]}>
                After tapping "Reserve Now", you'll go through a GCash payment step to confirm
                your slot. Note: this is a simulated payment for now since the real GCash API
                isn't connected yet — no actual money is charged.
              </Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Payment Summary</Text>
          <View style={styles.formCard}>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Service Fee</Text>
              <Text style={styles.paymentValue}>{displayPrice}</Text>
            </View>
            <View style={styles.paymentDivider} />
            <View style={styles.paymentRow}>
              <Text style={styles.paymentTotalLabel}>Total Amount</Text>
              <Text style={styles.paymentTotalValue}>{displayPrice}</Text>
            </View>
            <Text style={styles.payNote}>
              {paymentMethod === 'GCash'
                ? 'Payment is confirmed via GCash before your slot is booked.'
                : 'Payment will be collected on-site upon completion of service.'}
            </Text>
          </View>

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

      {/* NEW: SIMULATED GCASH PAYMENT MODAL
          3 stages: confirm -> processing -> success.
          Walang totoong API na tinatawag dito -- lahat client-side lang
          simulation gamit ang setTimeout, hanggang wala pang totoong
          GCash/PayMongo integration. */}
      <Modal
        animationType="fade"
        transparent
        visible={gcashModalVisible}
        onRequestClose={() => {
          if (gcashStage !== 'processing') setGcashModalVisible(false);
        }}
      >
        <View style={styles.receiptOverlay}>
          <View style={styles.gcashCard}>
            <View style={styles.gcashLogoWrap}>
              <Ionicons name="phone-portrait-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.gcashTitle}>GCash Payment</Text>
            <Text style={styles.gcashSimTag}>SIMULATED — NO API CONNECTED YET</Text>

            {gcashStage === 'confirm' && (
              <>
                <Text style={styles.gcashAmount}>{displayPrice}</Text>
                <Text style={styles.gcashDesc}>
                  Tap below to simulate authorizing this payment via GCash. This will not charge
                  any real money.
                </Text>
                <TouchableOpacity style={styles.gcashPrimaryBtn} onPress={startGcashSimulation}>
                  <Text style={styles.gcashPrimaryBtnText}>Simulate GCash Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.gcashSecondaryBtn}
                  onPress={() => setGcashModalVisible(false)}
                >
                  <Text style={styles.gcashSecondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {gcashStage === 'processing' && (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator size="large" color={GCASH_BLUE} />
                <Text style={[styles.gcashDesc, { marginTop: 16 }]}>
                  Processing your payment via GCash...
                </Text>
              </View>
            )}

            {gcashStage === 'success' && (
              <>
                <View style={styles.gcashSuccessIconWrap}>
                  <Ionicons name="checkmark" size={26} color="#fff" />
                </View>
                <Text style={styles.gcashSuccessTitle}>Payment Successful</Text>
                <Text style={styles.gcashDesc}>Reference No.: {gcashRefNumber}</Text>
                <Text style={[styles.gcashDesc, styles.gcashSimNote]}>
                  (Simulated payment — no real money was charged.)
                </Text>
                <TouchableOpacity style={styles.gcashPrimaryBtn} onPress={confirmGcashPaymentAndReserve}>
                  <Text style={styles.gcashPrimaryBtnText}>Continue to Book Slot</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

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
              {receiptData?.bayName ? (
                <View style={styles.receiptDetailRow}>
                  <Text style={styles.receiptDetailLabel}>Assigned Bay</Text>
                  <Text style={styles.receiptDetailValue}>{receiptData?.bayName}</Text>
                </View>
              ) : null}

              {/* NEW: ipinapakita rin ngayon ang paraan ng bayad at kung
                  Paid na (GCash, simulated) o Unpaid pa (Cash on Hand). */}
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Payment Method</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.paymentMethod}</Text>
              </View>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Payment Status</Text>
                <View
                  style={[
                    styles.statusPill,
                    receiptData?.paymentStatusLabel === 'Paid' && styles.statusPillPaid,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      receiptData?.paymentStatusLabel === 'Paid' && styles.statusPillTextPaid,
                    ]}
                  >
                    {receiptData?.paymentStatusLabel}
                  </Text>
                </View>
              </View>

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

  // NEW: chips para sa payment method selection (Cash on Hand / GCash)
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  chipActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  chipActiveGCash: { backgroundColor: GCASH_BLUE, borderColor: GCASH_BLUE },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.black },
  chipTextActive: { color: '#fff' },

  paymentMethodHintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.blueTint,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  gcashHintBox: {
    backgroundColor: '#EAF4FF',
  },
  paymentMethodHintText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.blueDark,
    lineHeight: 17,
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
    marginBottom: 4,
  },
  paymentLabel: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  paymentValue: { fontSize: 13, color: COLORS.black, fontWeight: '700' },
  paymentDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  paymentTotalLabel: { fontSize: 14, color: COLORS.black, fontWeight: '800' },
  paymentTotalValue: { fontSize: 16, color: COLORS.black, fontWeight: '900' },
  payNote: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 10,
    lineHeight: 15,
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
  statusPillPaid: {
    backgroundColor: '#DCFCE7',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.blueDark,
  },
  statusPillTextPaid: {
    color: '#16A34A',
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

  // ---------- NEW: SIMULATED GCASH PAYMENT MODAL ----------
  gcashCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  gcashLogoWrap: {
    backgroundColor: GCASH_BLUE,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  gcashTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
  },
  gcashSimTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 14,
    textAlign: 'center',
  },
  gcashAmount: {
    fontSize: 30,
    fontWeight: '900',
    color: GCASH_BLUE,
    marginBottom: 10,
  },
  gcashDesc: {
    fontSize: 12.5,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  gcashSimNote: {
    fontStyle: 'italic',
    marginTop: 4,
    fontSize: 11,
  },
  gcashPrimaryBtn: {
    backgroundColor: GCASH_BLUE,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  gcashPrimaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  gcashSecondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  gcashSecondaryBtnText: {
    color: COLORS.gray,
    fontSize: 13,
    fontWeight: '700',
  },
  gcashSuccessIconWrap: {
    backgroundColor: '#16A34A',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gcashSuccessTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 6,
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