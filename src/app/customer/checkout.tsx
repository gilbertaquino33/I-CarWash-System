import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

interface ReceiptData {
  refNumber: string;
  dateTime: string;
  shopId: string;
  shopName: string;
  packageName: string;
  vehicleType: string;
  price: string;
}

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
      Alert.alert('Missing Shop', 'Please select a shop before reserving.');
      return;
    }

    setIsPlacingOrder(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Session Expired', 'Please log in again to continue.');
        router.replace('/customer/customer-registration');
        return;
      }

      const { error } = await supabase
        .from('reservation')
        .insert({
          user_id: session.user.id,
          shop_id: Number(shopId),
          shop_name: shopName,
          reservation_date: new Date().toISOString().split('T')[0],
          vehicle_type: vehicleType,
          service_type: packageName,
          price: numericPrice,
          status: 'Waiting',
        });

      if (error) throw error;

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
      });
      setReceiptVisible(true);
    } catch (err: any) {
      console.error('Error placing reservation:', err);
      Alert.alert('Reservation Failed', err?.message ?? 'Something went wrong while placing your reservation.');
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
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Order</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <Text style={styles.sectionLabel}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryItemRow}>
              <View style={styles.summaryIconWrap}>
                <Ionicons name="water-outline" size={22} color="#0F172A" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.itemTitle}>{packageName}</Text>
                <Text style={styles.itemSubtitle}>{vehicleType}</Text>
              </View>
              <Text style={styles.itemPrice}>{displayPrice}</Text>
            </View>

            {isRangedPrice && (
              <View style={styles.noticeBox}>
                <Ionicons name="information-circle-outline" size={16} color="#92400E" />
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
            <View style={styles.paymentDivider} />
            <View style={styles.paymentRow}>
              <Text style={styles.paymentTotalLabel}>Total Amount</Text>
              <Text style={styles.paymentTotalValue}>{displayPrice}</Text>
            </View>
            <Text style={styles.payNote}>Payment will be collected on-site upon completion of service.</Text>
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
              <ActivityIndicator size="small" color="#0F172A" />
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
              <Ionicons name="checkmark" size={36} color="#fff" />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backBtn: { padding: 8, backgroundColor: '#F1F5F9', borderRadius: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  content: { flex: 1, padding: 16 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 12,
  },

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIconWrap: {
    backgroundColor: '#FEFCE8',
    padding: 10,
    borderRadius: 12,
  },
  itemTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  itemSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: '800', color: '#0F172A' },

  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
  },

  formCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  paymentLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  paymentValue: { fontSize: 13, color: '#0F172A', fontWeight: '700' },
  paymentDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  paymentTotalLabel: { fontSize: 14, color: '#0F172A', fontWeight: '800' },
  paymentTotalValue: { fontSize: 16, color: '#0F172A', fontWeight: '900' },
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
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  bottomTotal: { fontSize: 18, color: '#0F172A', fontWeight: '900' },
  reserveButton: {
    backgroundColor: '#F5C518',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  reserveButtonText: {
    color: '#0F172A',
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
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  successIconWrap: {
    backgroundColor: '#10B981',
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
    color: '#0F172A',
    textAlign: 'center',
  },
  receiptSuccessSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  receiptAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 18,
  },
  dashedDivider: {
    width: '100%',
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
    fontWeight: '700',
  },
  statusPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  doneButton: {
    backgroundColor: '#0F172A',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#F5C518',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});