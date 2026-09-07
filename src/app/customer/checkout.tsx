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
import QRCode from 'react-native-qrcode-svg';
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


const GCASH_BLUE = '#007DFE';

// "Cash on Hand" inalis na -- prepaid (via GCash) at non-refundable na ang
// lahat ng reservation. Kapag na-void ang isang bayad na reservation, ang
// halaga nito ay ibinabalik bilang STORE CREDIT (voucher) na pwedeng
// i-apply sa susunod na booking, gaya ng voucher sa Shopee checkout.
type PaymentMethod = 'GCash' | 'Store Credit';

type GcashStage = 'confirm' | 'processing' | 'success';

interface ReceiptData {
  refNumber: string;
  dateTime: string;
  scheduledDateLabel: string;
  scheduledTime: string;
  shopId: string;
  shopName: string;
  packageName: string;
  vehicleType: string;
  price: string;
  qrValue: string;
  paymentMethod: string;
  paymentStatusLabel: string;
  // Ipinapakita lang kapag may na-redeem na store credit sa booking na ito.
  voucherAppliedLabel?: string;
  amountPaidLabel?: string;
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
    scheduledDate?: string;
    scheduledTime?: string;
    scheduledAt?: string;
  }>();

  const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId ?? '';
  const shopName = Array.isArray(params.shopName) ? params.shopName[0] : params.shopName ?? '—';
  const packageName = params.package ?? '—';
  const vehicleType = params.vehicleType ?? '—';
  const rawPrice = params.price ?? '0';
  const scheduledDate = params.scheduledDate ?? '';
  const scheduledTime = params.scheduledTime ?? '';
  const scheduledAt = params.scheduledAt ?? '';

  const scheduledDateLabel = scheduledDate
    ? new Date(`${scheduledDate}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '—';

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
  // email + mobile -- gagamitin para sa confirmation email / SMS pagkatapos
  // ng matagumpay na reservation (send-reservation-confirmation edge fn).
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');

  // Terms & Conditions modal (voucher / no-show policy).
  const [termsVisible, setTermsVisible] = useState(false);

  // Store credit / voucher balance ng customer (galing sa mga na-void na
  // bayad na reservation). Kino-consume ito Shopee-style dito sa checkout.
  const [voucherBalance, setVoucherBalance] = useState(0);
  const [applyVoucher, setApplyVoucher] = useState(false);

  // Shopee-style "My Vouchers" picker -- tinatap ang "Apply Voucher" row
  // para makita ng customer kung ANO ang available niyang store credit at
  // ang recent na galaw nito (nakuha mula sa mga na-void na booking, at
  // nagamit sa mga bagong booking). Pag naubos na (balance = 0), wala nang
  // lalabas dito na pwedeng i-apply.
  const [voucherModalVisible, setVoucherModalVisible] = useState(false);
  const [voucherTxns, setVoucherTxns] = useState<
    { amount: number; reason: string; created_at: string }[]
  >([]);

  // NEW: kailangang tickan muna ng customer na nabasa niya ang no-refund
  // policy bago paganahin ang "Reserve Now" -- walang refund-request
  // feature na, ito na lang ang paraan para ma-set ang expectation.
  const [refundPolicyAcknowledged, setRefundPolicyAcknowledged] = useState(false);

  const [gcashModalVisible, setGcashModalVisible] = useState(false);
  const [gcashStage, setGcashStage] = useState<GcashStage>('confirm');
  const [gcashRefNumber, setGcashRefNumber] = useState('');

 
  const [infoModal, setInfoModal] = useState<InfoModalData | null>(null);

  const showInfoModal = (data: InfoModalData) => setInfoModal(data);
  const closeInfoModal = () => setInfoModal(null);

  // price column sa DB ay float4 (number), kaya kailangang i-convert.
  // Kung ranged price (e.g. "300-350"), kunin yung unang number bilang base price.
  const numericPrice = parseFloat(rawPrice.split('-')[0]);

  // Shopee-style na pag-apply ng store credit: hindi hihigit sa balance,
  // hindi rin hihigit sa presyo ng serbisyo. `netPayable` na ang aktwal na
  // sisingilin sa GCash (0 = bayad na lahat gamit ang credit).
  const voucherApplied = applyVoucher ? Math.min(voucherBalance, numericPrice) : 0;
  const netPayable = Math.max(0, numericPrice - voucherApplied);
  const netPayableLabel = `₱${netPayable}`;
  const voucherAppliedLabel = `₱${voucherApplied}`;
  const voucherBalanceLabel = `₱${voucherBalance}`;

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
        .select('full_name, email_address, mobile')
        .eq('id', session.user.id)
        .single();
      setCustomerName(data?.full_name ?? '');
      setCustomerEmail(data?.email_address ?? session.user.email ?? '');
      setCustomerMobile(data?.mobile ?? '');

      // Kasalukuyang store credit -- galing sa mga na-void na bayad na
      // reservation (tingnan ang issue_voucher_on_void trigger sa
      // supabase/sql/2026-09_reservation_voucher_credit.sql).
      const { data: voucherRow } = await supabase
        .from('customer_voucher')
        .select('balance')
        .eq('customer_id', session.user.id)
        .maybeSingle();
      setVoucherBalance(Number(voucherRow?.balance ?? 0));

      // Recent voucher ledger -- ipinapakita sa "My Vouchers" modal para
      // makita ng customer kung SAAN galing ang credit niya (na-void na
      // booking) at kung ALIN na ang nagamit na (na-redeem sa ibang
      // booking). RLS: sarili niyang rows lang ang mababasa.
      const { data: txnRows } = await supabase
        .from('voucher_transaction')
        .select('amount, reason, created_at')
        .eq('customer_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(12);
      setVoucherTxns(
        (txnRows ?? []).map((t: any) => ({
          amount: Number(t.amount ?? 0),
          reason: String(t.reason ?? ''),
          created_at: String(t.created_at ?? ''),
        }))
      );
    })();
  }, []);

  // NEW: talagang i-tatawag na dito ang RPC at ise-set ang receipt --
  // ginagamit ito ng dalawang path: (1) Store Credit, diretso kapag sapat
  // ang voucher para mabuo ang bayad; at (2) GCash, pagkatapos ng
  // simulated payment success.
  //
  // FIX: ang reference number ay ginagawa na NGAYON bago pa man tawagin
  // ang RPC, at ipinapasa bilang p_payment_reference para ito mismo ang
  // ma-SAVE sa reservation row -- dati, ginagawa lang ito PAGKATAPOS ng
  // matagumpay na RPC call at direkta sa setReceiptData(), kaya nasa
  // memory lang ito ng receipt modal na iyon at nawawala habambuhay sa
  // sandaling isara ito ng customer. Ngayon, makikita na rin ito ulit sa
  // customer/history.tsx kahit pagkatapos pa ng ilang araw.
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

    const refNumber = extra?.gcashRef ?? generateRefNumber();

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
      //   1) i-check ang per-slot capacity (bilang ng existing reservation
      //      para sa parehong shop+date+time-slot kumpara sa total_bays),
      //      naka-advisory-lock para hindi magkasabay maka-book nang lagpas
      //      sa available na slots.
      //   2) huwag munang mag-assign/mag-lock ng specific na bay dito --
      //      priority queue slot lang ito. Ang bay mismo ay ita-tag lang
      //      pag na-scan na ang QR ng customer pagdating niya (tingnan
      //      ang confirm_reservation_arrival RPC), para hindi mabara ang
      //      bay sa mga walk-in bago pa man dumating ang reserved customer.
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
        p_scheduled_date: scheduledDate,
        p_scheduled_time: scheduledTime,
        p_scheduled_at: scheduledAt,
        p_payment_reference: refNumber,
        // Store credit na i-a-apply -- kino-clamp pa rin ng RPC sa aktwal
        // na balance at sa presyo, at ang totoong na-redeem ay ibinabalik
        // bilang `voucher_redeemed`.
        p_voucher_amount: voucherApplied,
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

      const qrToken: string | undefined = data?.[0]?.qr_token;
      const redeemed: number = Number(data?.[0]?.voucher_redeemed ?? 0);
      const amountPaid = Math.max(0, numericPrice - redeemed);

      const now = new Date();
      setReceiptData({
        refNumber,
        dateTime: now.toLocaleString('en-PH', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        scheduledDateLabel,
        scheduledTime,
        shopId,
        shopName,
        packageName,
        vehicleType,
        price: displayPrice,
        // Prefixed so the staff scanner can reject an obviously-foreign QR
        // (someone's boarding pass, a menu QR, etc.) before even hitting
        // the confirm_reservation_arrival RPC.
        qrValue: `ICW-RES:${qrToken ?? ''}`,
        paymentMethod: method,
        paymentStatusLabel: paymentStatus === 'paid' ? 'Paid' : 'Unpaid',
        voucherAppliedLabel: redeemed > 0 ? `−₱${redeemed}` : undefined,
        amountPaidLabel: redeemed > 0 ? `₱${amountPaid}` : undefined,
      });
      setReceiptVisible(true);
      // I-reflect agad ang nagamit na credit para tama ang balance kung
      // babalik pa ang customer sa checkout ng ibang booking, at para sa
      // "My Vouchers" modal -- lumalabas agad ang ginamit na credit bilang
      // isang redeemed entry, at kapag naubos, wala nang applyable voucher.
      if (redeemed > 0) {
        setVoucherBalance((b) => Math.max(0, b - redeemed));
        setVoucherTxns((prev) => [
          { amount: -redeemed, reason: 'reservation_redeemed', created_at: new Date().toISOString() },
          ...prev,
        ]);
      }

      // Fire-and-forget: confirmation email + SMS sa customer. HINDI dapat
      // ma-block o mabigo ang receipt kung sakaling hindi pa naka-setup ang
      // edge function o wala pang API keys -- kaya naka-catch lang lahat.
      supabase.functions
        .invoke('send-reservation-confirmation', {
          body: {
            email: customerEmail || null,
            mobile: customerMobile || null,
            customerName: customerName || 'Customer',
            shopName,
            packageName,
            vehicleType,
            scheduledDateLabel,
            scheduledTime,
            refNumber,
            servicePrice: displayPrice,
            voucherApplied: redeemed,
            amountPaid,
            paymentMethod: method,
          },
        })
        .then(({ data: fnData, error: fnError }) => {
          if (fnError) {
            console.warn('[checkout] confirmation notify error:', fnError.message);
          } else {
            // fnData = { email: {...}, sms: {...} } -- kitang-kita dito sa
            // console kung na-skip (walang API key) o may provider error.
            console.log('[checkout] confirmation notify result:', JSON.stringify(fnData));
          }
        })
        .catch((e) => console.warn('[checkout] confirmation notify threw:', e?.message ?? e));
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

  // NEW: pinakaunang pinipindot ng customer -- dito sina-check ang mga
  // pre-condition bago mag-proceed sa GCash payment (o dumiretso na kung
  // sapat ang store credit para mabayaran lahat).
  const handleReserveNow = () => {
    if (!shopId) {
      showInfoModal({
        type: 'warning',
        title: 'Missing Shop',
        message: 'Please select a shop before reserving.',
      });
      return;
    }

    if (!refundPolicyAcknowledged) {
      showInfoModal({
        type: 'warning',
        title: 'Non-Refundable Policy',
        message: 'Please check the box confirming you understand reservations are non-refundable before proceeding.',
      });
      return;
    }

    // Kung sapat ang store credit para mabuo ang bayad, wala nang GCash
    // step -- diretsong ma-book na bilang 'paid'.
    if (netPayable <= 0) {
      finalizeReservation('Store Credit', 'paid');
      return;
    }

    // May natitirang babayaran -- ipapakita muna ang simulated GCash
    // payment modal. Sa 'success' stage doon saka tatawagin ang
    // finalizeReservation() bilang 'paid'.
    setGcashStage('confirm');
    setGcashRefNumber('');
    setGcashModalVisible(true);
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

          {/* Paraan ng bayad -- GCash na lang (inalis na ang Cash on Hand,
              at wala pang Credit/Debit Card at Cash on Arrival na feature
              sa backend, kaya iisa lang ang laman ng card na ito). Card
              row style, kagaya ng ibang payment method list -- may icon,
              title, subtitle, at radio indicator sa kanan. */}
          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={styles.paymentMethodCard}>
            <View style={styles.paymentMethodRow}>
              <View style={styles.paymentMethodIconWrap}>
                <Ionicons name="phone-portrait-outline" size={20} color={GCASH_BLUE} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.paymentMethodTitle}>GCash</Text>
                <Text style={styles.paymentMethodSubtitle}>Pay using your GCash account</Text>
              </View>
              <View style={styles.radioOuter}>
                <View style={styles.radioInner} />
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Payment Summary</Text>
          <View style={styles.formCard}>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Service Fee</Text>
              <Text style={styles.paymentValue}>{displayPrice}</Text>
            </View>
            {voucherApplied > 0 && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Store Credit</Text>
                <Text style={[styles.paymentValue, { color: COLORS.blue }]}>−{voucherAppliedLabel}</Text>
              </View>
            )}
            <View style={styles.paymentDivider} />
            <View style={styles.paymentRow}>
              <Text style={styles.paymentTotalLabel}>
                {voucherApplied > 0 ? 'Amount to Pay' : 'Total Amount'}
              </Text>
              <Text style={styles.paymentTotalValue}>{netPayableLabel}</Text>
            </View>
            <Text style={styles.payNote}>
              {netPayable <= 0
                ? 'Fully covered by your store credit — no GCash payment needed.'
                : 'Payment is confirmed via GCash before your slot is booked.'}
            </Text>
          </View>

          {/* NEW: no-refund warning -- kailangan munang tickan ng customer
              bago paganahin ang "Reserve Now". Kapalit ito ng dating
              request-refund feature na inalis na. */}
          <View style={styles.refundWarningBox}>
            <Ionicons name="warning" size={18} color="#B45309" />
            <Text style={styles.refundWarningText}>
              Reservations are non-refundable once confirmed. Please make sure your details are
              correct before proceeding.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.ackRow}
            onPress={() => setRefundPolicyAcknowledged((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, refundPolicyAcknowledged && styles.checkboxChecked]}>
              {refundPolicyAcknowledged && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.ackText}>I understand this reservation is non-refundable.</Text>
          </TouchableOpacity>

          {/* Blue na "Terms & Conditions" link -- pag pinindot, lalabas ang
              buong voucher / no-show policy. */}
          <TouchableOpacity
            style={styles.termsLinkWrap}
            onPress={() => setTermsVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={14} color={COLORS.blue} />
            <Text style={styles.termsLink}>View Terms &amp; Conditions</Text>
          </TouchableOpacity>

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          {/* VOUCHER / STORE CREDIT -- Shopee-style na "Apply Voucher" row,
              inilipat dito sa itaas mismo ng Total / RESERVE NOW para agad
              makita ng customer bago pindutin ang button. LAGING nakikita
              ito, hindi na naka-condition sa balance > 0 -- kung wala pang
              store credit, isang info modal na lang ang lalabas pag
              pinindot, sa halip na itago na lang ang buong row. */}
          <TouchableOpacity
            style={styles.voucherRow}
            activeOpacity={0.85}
            onPress={() => setVoucherModalVisible(true)}
          >
            <View style={styles.voucherIconWrapSmall}>
              <Ionicons name="pricetag" size={15} color={COLORS.danger} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.voucherRowTitle}>Apply Voucher</Text>
              <Text style={styles.voucherRowSubtitle}>
                {voucherBalance <= 0
                  ? 'No store credit available'
                  : applyVoucher
                  ? `${voucherAppliedLabel} applied · ${voucherBalanceLabel} available`
                  : `${voucherBalanceLabel} available`}
              </Text>
            </View>
            {voucherBalance > 0 && applyVoucher ? (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.blue} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={COLORS.gray} />
            )}
          </TouchableOpacity>

          <View style={styles.bottomTotalRow}>
            <View>
              <Text style={styles.bottomLabel}>{voucherApplied > 0 ? 'To Pay' : 'Total'}</Text>
              <Text style={styles.bottomTotal}>{voucherApplied > 0 ? netPayableLabel : displayPrice}</Text>
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
            {gcashStage === 'confirm' && (
              <>
                <Text style={styles.gcashAmount}>{netPayableLabel}</Text>
                {voucherApplied > 0 && (
                  <Text style={styles.gcashCreditNote}>
                    {voucherAppliedLabel} of store credit already applied to your {displayPrice}{' '}
                    booking.
                  </Text>
                )}
                <Text style={styles.gcashDesc}>
                  Tap below to simulate authorizing this payment via GCash. This will not charge
                  any real money.
                </Text>
                <TouchableOpacity style={styles.gcashPrimaryBtn} onPress={startGcashSimulation}>
                  <Text style={styles.gcashPrimaryBtnText}>Open Gcash</Text>
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
              Show this QR code to staff when you arrive to confirm your slot.
            </Text>

            {receiptData?.qrValue ? (
              <View style={styles.qrWrap}>
                <QRCode value={receiptData.qrValue} size={140} />
              </View>
            ) : null}

            <Text style={styles.receiptAmount}>{receiptData?.price}</Text>

            <View style={styles.dashedDivider} />

            <View style={styles.receiptDetailsBlock}>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Reference No.</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.refNumber}</Text>
              </View>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Booked On</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.dateTime}</Text>
              </View>
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Reserved Slot</Text>
                <Text style={styles.receiptDetailValue}>
                  {receiptData?.scheduledDateLabel} • {receiptData?.scheduledTime}
                </Text>
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

              {/* Paraan ng bayad -- GCash (simulated) o Store Credit kapag
                  buo ang bayad gamit ang voucher. */}
              <View style={styles.receiptDetailRow}>
                <Text style={styles.receiptDetailLabel}>Payment Method</Text>
                <Text style={styles.receiptDetailValue}>{receiptData?.paymentMethod}</Text>
              </View>

              {receiptData?.voucherAppliedLabel && (
                <View style={styles.receiptDetailRow}>
                  <Text style={styles.receiptDetailLabel}>Store Credit</Text>
                  <Text style={[styles.receiptDetailValue, { color: COLORS.blue }]}>
                    {receiptData.voucherAppliedLabel}
                  </Text>
                </View>
              )}
              {receiptData?.amountPaidLabel && (
                <View style={styles.receiptDetailRow}>
                  <Text style={styles.receiptDetailLabel}>Amount Paid</Text>
                  <Text style={styles.receiptDetailValue}>{receiptData.amountPaidLabel}</Text>
                </View>
              )}
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

      {/* MY VOUCHERS — Shopee-style picker na binubuksan ng "Apply Voucher"
          row. Dito nakikita ng customer ang available niyang store credit,
          kung magkano ang mapupunta sa order na ito, at ang recent na
          galaw ng credit (nakuha / nagamit). Kapag naubos na ang balance,
          wala nang applyable na voucher na lalabas. */}
      <Modal
        animationType="slide"
        transparent
        visible={voucherModalVisible}
        onRequestClose={() => setVoucherModalVisible(false)}
      >
        <View style={styles.voucherSheetOverlay}>
          <View style={styles.voucherSheet}>
            <View style={styles.voucherSheetHandle} />
            <View style={styles.voucherSheetHeader}>
              <Text style={styles.voucherSheetTitle}>My Vouchers</Text>
              <TouchableOpacity onPress={() => setVoucherModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.voucherSheetSectionLabel}>Available</Text>

              {voucherBalance > 0 ? (
                <TouchableOpacity
                  style={[styles.voucherCardBig, applyVoucher && styles.voucherCardBigActive]}
                  activeOpacity={0.85}
                  onPress={() => setApplyVoucher((v) => !v)}
                >
                  <View style={styles.voucherCardBigLeft}>
                    <Ionicons name="pricetag" size={18} color={COLORS.danger} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.voucherCardBigTitle}>Store Credit</Text>
                    <Text style={styles.voucherCardBigAmount}>{voucherBalanceLabel}</Text>
                    <Text style={styles.voucherCardBigNote}>
                      No expiry · keeps its full peso value · usable on any booking
                    </Text>
                    {numericPrice > 0 && (
                      <Text style={styles.voucherCardBigApplyNote}>
                        {applyVoucher
                          ? `−${voucherAppliedLabel} will be applied to this order`
                          : `Up to −₱${Math.min(voucherBalance, numericPrice)} can be applied to this order`}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.voucherRadio, applyVoucher && styles.voucherRadioOn]}>
                    {applyVoucher && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.voucherEmpty}>
                  <Ionicons name="pricetags-outline" size={26} color={COLORS.grayLight} />
                  <Text style={styles.voucherEmptyTitle}>No vouchers available</Text>
                  <Text style={styles.voucherEmptyText}>
                    Store credit is issued automatically when a paid reservation is cancelled or
                    missed. It shows up here for your next booking.
                  </Text>
                </View>
              )}

              {voucherTxns.length > 0 && (
                <>
                  <Text style={[styles.voucherSheetSectionLabel, { marginTop: 18 }]}>Recent activity</Text>
                  {voucherTxns.map((t, idx) => {
                    const isCredit = t.amount >= 0;
                    const dateLabel = t.created_at
                      ? new Date(t.created_at).toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '';
                    return (
                      <View key={`${t.created_at}-${idx}`} style={styles.voucherTxnRow}>
                        <View
                          style={[
                            styles.voucherTxnIcon,
                            { backgroundColor: isCredit ? '#DCFCE7' : COLORS.blueTint },
                          ]}
                        >
                          <Ionicons
                            name={isCredit ? 'arrow-down' : 'arrow-up'}
                            size={13}
                            color={isCredit ? '#16A34A' : COLORS.blue}
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.voucherTxnTitle}>
                            {isCredit ? 'Credit from cancelled booking' : 'Used on a booking'}
                          </Text>
                          {!!dateLabel && <Text style={styles.voucherTxnDate}>{dateLabel}</Text>}
                        </View>
                        <Text
                          style={[
                            styles.voucherTxnAmount,
                            { color: isCredit ? '#16A34A' : COLORS.blue },
                          ]}
                        >
                          {isCredit ? '+' : '−'}₱{Math.abs(t.amount)}
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.voucherSheetDoneBtn}
              onPress={() => setVoucherModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.voucherSheetDoneBtnText}>
                {voucherBalance > 0 && applyVoucher ? 'APPLY VOUCHER' : 'DONE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TERMS & CONDITIONS — voucher / no-show policy */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={termsVisible}
        onRequestClose={() => setTermsVisible(false)}
      >
        <View style={styles.receiptOverlay}>
          <View style={styles.termsCard}>
            <View style={styles.termsHeader}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.blue} />
              <Text style={styles.termsTitle}>Terms &amp; Conditions</Text>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.termsHeading}>Non-refundable, but not lost</Text>
              <Text style={styles.termsBody}>
                Your payment for this reservation is non-refundable. However, if you are unable to
                arrive on time or your booking does not push through, the amount you paid is
                automatically converted into a{' '}
                <Text style={styles.termsBold}>voucher (store credit)</Text> that you can use on
                your next reservation.
              </Text>

              <Text style={styles.termsHeading}>How the voucher works</Text>
              <Text style={styles.termsBody}>
                The voucher keeps its full peso value —{' '}
                <Text style={styles.termsBold}>a ₱300 voucher is still worth ₱300</Text>. On your
                next booking it is deducted from the total. For example, if your next reservation
                costs <Text style={styles.termsBold}>₱400</Text> and you hold a{' '}
                <Text style={styles.termsBold}>₱300</Text> voucher, you only pay the remaining{' '}
                <Text style={styles.termsBold}>₱100</Text> via GCash.
              </Text>

              <Text style={styles.termsHeading}>Confirmation</Text>
              <Text style={styles.termsBody}>
                After a successful reservation you will receive a confirmation{' '}
                <Text style={styles.termsBold}>email</Text> and an automated{' '}
                <Text style={styles.termsBold}>SMS</Text> with your booking reference and slot
                details.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.termsCloseBtn}
              onPress={() => setTermsVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.termsCloseBtnText}>GOT IT</Text>
            </TouchableOpacity>
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

  // ---------- Payment Method card (Shopee/GCash-app style row list) ----------
  paymentMethodCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
    overflow: 'hidden',
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  paymentMethodIconWrap: {
    backgroundColor: '#EAF4FF',
    padding: 10,
    borderRadius: 12,
  },
  paymentMethodTitle: { fontSize: 15, fontWeight: '800', color: COLORS.black },
  paymentMethodSubtitle: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: COLORS.blue,
  },

  // Voucher / store credit card (Shopee-style na "apply voucher" row)
  voucherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  voucherIconWrap: {
    backgroundColor: '#FEE2E2',
    padding: 9,
    borderRadius: 10,
  },
  voucherTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.black },
  voucherSubtitle: { fontSize: 11.5, color: COLORS.gray, marginTop: 2 },
  voucherBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.blue,
    backgroundColor: COLORS.white,
  },
  voucherBtnActive: { backgroundColor: COLORS.blue },
  voucherBtnText: { fontSize: 11.5, fontWeight: '800', color: COLORS.blue, letterSpacing: 0.4 },
  voucherBtnTextActive: { color: COLORS.white },
  gcashCreditNote: {
    fontSize: 11.5,
    color: COLORS.blueDark,
    textAlign: 'center',
    marginBottom: 8,
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

  refundWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  refundWarningText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 17,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  checkboxChecked: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  ackText: {
    flex: 1,
    fontSize: 12.5,
    color: COLORS.black,
    fontWeight: '600',
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
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  voucherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 10,
  },
  voucherIconWrapSmall: {
    backgroundColor: '#FEE2E2',
    padding: 7,
    borderRadius: 9,
  },
  voucherRowTitle: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  voucherRowSubtitle: { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  bottomTotalRow: {
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
  qrWrap: {
    marginTop: 16,
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
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

  // ---------- TERMS & CONDITIONS ----------
  termsLinkWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  termsLink: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.blue,
    textDecorationLine: 'underline',
  },
  termsCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 22,
  },
  termsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
  },
  termsHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.blueDark,
    marginTop: 12,
    marginBottom: 4,
  },
  termsBody: {
    fontSize: 12.5,
    color: COLORS.gray,
    lineHeight: 19,
  },
  termsBold: {
    fontWeight: '800',
    color: COLORS.black,
  },
  termsCloseBtn: {
    backgroundColor: COLORS.blue,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  termsCloseBtnText: {

    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ---------- MY VOUCHERS (bottom-sheet picker) ----------
  voucherSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  voucherSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  voucherSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.grayLight,
    marginBottom: 14,
  },
  voucherSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  voucherSheetTitle: { fontSize: 17, fontWeight: '800', color: COLORS.black },
  voucherSheetSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  voucherCardBig: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
  },
  voucherCardBigActive: {
    borderColor: COLORS.blue,
    backgroundColor: COLORS.blueTint,
  },
  voucherCardBigLeft: {
    backgroundColor: '#FEE2E2',
    padding: 9,
    borderRadius: 10,
  },
  voucherCardBigTitle: { fontSize: 12, fontWeight: '800', color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 0.4 },
  voucherCardBigAmount: { fontSize: 22, fontWeight: '900', color: COLORS.black, marginTop: 2 },
  voucherCardBigNote: { fontSize: 11, color: COLORS.gray, marginTop: 4, lineHeight: 15 },
  voucherCardBigApplyNote: { fontSize: 11.5, color: COLORS.blueDark, fontWeight: '700', marginTop: 6 },
  voucherRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  voucherRadioOn: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  voucherEmpty: {
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 16,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
  },
  voucherEmptyTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.black, marginTop: 8 },
  voucherEmptyText: {
    fontSize: 11.5,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  voucherTxnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  voucherTxnIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voucherTxnTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.black },
  voucherTxnDate: { fontSize: 11, color: COLORS.gray, marginTop: 1 },
  voucherTxnAmount: { fontSize: 13.5, fontWeight: '900' },
  voucherSheetDoneBtn: {
    backgroundColor: COLORS.blue,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  voucherSheetDoneBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});