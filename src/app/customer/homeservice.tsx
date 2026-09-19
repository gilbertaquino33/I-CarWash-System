import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, usePathname } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface HomeServiceRow {
  id: number;
  shop_id: number | null;
  shop_name: string | null;
  customer_name: string;
  contact_number: string;
  address: string;
  vehicle_type: string;
  service_type: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string;
  payment_method: string | null;
  payment_status: string | null;
  price: number | null;
  // NEW: PayMongo tracking fields (added via SQL migration -- see notes)
  paymongo_source_id?: string | null;
  paymongo_payment_id?: string | null;
  // Status timestamps -- kailan naganap ang bawat hakbang ng booking.
  paid_at?: string | null;
  on_the_way_at?: string | null;
  washing_at?: string | null;
  completed_at?: string | null;
}

interface ShopBranch {
  id: number;
  shop_name: string;
}

// PSGC (Philippine Standard Geographic Code) item -- ginagamit sa
// Region / Province / City-Municipality / Barangay dropdowns.
interface PsgcItem {
  code: string;
  name: string;
  kind?: 'City' | 'Municipality';
}

const BRAND_BLUE = '#2563EB';
const INK = '#15171B';
// NEW: GCash brand accent, used only for the GCash payment card/chip
const GCASH_BLUE = '#007DFE';
// NEW: colors reserved for the in-app MessageModal (warning/error states)
const WARNING_AMBER = '#B7791F';
const ERROR_RED = '#DC2626';

const VEHICLE_TYPES = [
  'Sedan',
  'Hatchback',
  'SUV',
  'Crossover',
  'MPV/AUV',
  'Pickup',
  'Van',
  'Truck',
  'Coupe',
  'Motorcycle',
  'Big Bike',
  'Tricycle',
  'Jeepney',
  'Wagon',
  'E-Bike/Scooter',
];

const SERVICE_TYPES = ['Basic Wash', 'Premium Wash', '3-in-1 w/ Wax (Back to Zero)'];

const PAYMENT_METHODS = ['GCash'];
const HOME_SERVICE_FEE = 100;

// NEW: Deep link scheme for returning to the app after GCash checkout.
// This MUST match the "scheme" value in your app.json / app.config.
const APP_SCHEME = 'icarwash';

// ---------- PRICING (base sa official price list) ----------
const PRICE_MATRIX: Record<string, Record<string, number | null>> = {
  'Basic Wash': {
    Sedan: 150,
    Hatchback: null,
    SUV: 190,
    Crossover: null,
    'MPV/AUV': null,
    Pickup: 190,
    Van: 250,
    Truck: null,
    Coupe: null,
    Motorcycle: 150,
    'Big Bike': null,
    Tricycle: null,
    Jeepney: null,
    Wagon: null,
    'E-Bike/Scooter': null,
  },
  'Premium Wash': {
    Sedan: 390,
    Hatchback: null,
    SUV: null,
    Crossover: null,
    'MPV/AUV': null,
    Pickup: 390,
    Van: 450,
    Truck: null,
    Coupe: null,
    Motorcycle: 250,
    'Big Bike': 300,
    Tricycle: null,
    Jeepney: null,
    Wagon: null,
    'E-Bike/Scooter': null,
  },
  '3-in-1 w/ Wax (Back to Zero)': {
    Sedan: 500,
    Hatchback: null,
    SUV: 550,
    Crossover: null,
    'MPV/AUV': null,
    Pickup: 550,
    Van: 600,
    Truck: null,
    Coupe: null,
    Motorcycle: null,
    'Big Bike': null,
    Tricycle: null,
    Jeepney: null,
    Wagon: null,
    'E-Bike/Scooter': null,
  },
};

function getServicePrice(serviceType: string, vehicleType: string): number | null {
  if (!serviceType || !vehicleType) return null;
  return PRICE_MATRIX[serviceType]?.[vehicleType] ?? null;
}

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH')}`;
}

const TIME_SLOTS = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM'];

const TIME_API_URL = 'https://time.now/developer/api/timezone/Asia/Manila';

const PSGC_API = {
  regions: 'https://psgc.cloud/api/regions',
  provinces: 'https://psgc.cloud/api/provinces',
  cities: 'https://psgc.cloud/api/cities',
  municipalities: 'https://psgc.cloud/api/municipalities',
  barangays: (cityMunicipalityCode: string) =>
    `https://psgc.cloud/api/cities-municipalities/${cityMunicipalityCode}/barangays`,
};

// LOCAL na date key (YYYY-MM-DD), hindi UTC -- `toISOString().split('T')[0]`
// ang dating gamit dito, pero UTC ang calendar date na kinukuha noon. Sa
// Philippine time (UTC+8), tuwing 12:00AM-7:59AM local, isang araw na
// nakaraan pa ang UTC date, kaya ang scheduled_date na naka-save ay isang
// araw na maaga kaysa sa aktwal na local na petsa -- ito ang dahilan kung
// bakit hindi lumalabas ang bagong booking sa "Today" tab ng
// customer/history.tsx (LOCAL date ang ginagamit doon).
function toLocalDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildDateOptions(base: Date) {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = toLocalDateKey(d);
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    days.push({ iso, label });
  }
  return days;
}

function normalizePsgcList(json: any): PsgcItem[] {
  const list = Array.isArray(json) ? json : json?.data ?? json?.results ?? [];
  return list.map((item: any) => ({
    code: String(item.code ?? ''),
    name: item.name ?? 'Unknown',
  }));
}

const isNCR = (region: PsgcItem | null) => !!region && /ncr|national capital region/i.test(region.name);

// Tab -> DB status mapping. Dapat EXACTLY kaparehas ng staff app para
// magkatugma yung dalawang side (parehong 4 tabs, parehong status flow):
// Waiting -> On the Way -> Washing -> Completed
const TAB_ORDER = ['Upcoming', 'On the Way', 'Washing', 'Completed'] as const;
type TabName = (typeof TAB_ORDER)[number];

const TAB_STATUS: Record<TabName, string> = {
  Upcoming: 'Waiting',
  'On the Way': 'On the Way',
  Washing: 'Washing',
  Completed: 'Completed',
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Waiting': return '#B7791F';
    case 'On the Way': return '#8B5CF6';
    case 'Washing': return BRAND_BLUE;
    case 'Completed': return '#16A34A';
    default: return '#6B7280';
  }
};

const getPaymentStatusColor = (status: string | null) => {
  switch (status) {
    case 'Paid': return '#16A34A';
    case 'Unpaid': return '#B7791F';
    default: return '#6B7280';
  }
};

// ---------- Reusable Confirm Modal (Blue / White / Black) ----------
function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Yes, Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          <View style={styles.confirmButtonRow}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnCancel]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={styles.confirmBtnCancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnConfirm, loading && { opacity: 0.6 }]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBtnConfirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------- Reusable Success Modal (same design language as ConfirmModal) ----------
// Ginagamit ito bilang kapalit ng Alert.alert() para consistent ang
// look (Blue / White / Black) sa buong app, hindi yung native OS alert.
function SuccessModal({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </View>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          <View style={styles.confirmButtonRow}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnConfirm, { flex: 1 }]}
              onPress={onClose}
            >
              <Text style={styles.confirmBtnConfirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------- NEW: Reusable Message Modal (kapalit ng Alert.alert sa LAHAT) ----------
// Ito ang gamit para sa "Missing Info", "Payment Error", "Failed to Book",
// atbp. -- iisang consistent na Blue/White/Black modal design, iisang
// component, dalawang lang variant ng accent color: warning (amber) para
// sa mga validation/missing-info reminders, at error (red) para sa mga
// totoong failure (hal. failed booking, payment error).
function MessageModal({
  visible,
  variant = 'warning',
  title,
  message,
  confirmLabel = 'OK',
  onClose,
}: {
  visible: boolean;
  variant?: 'warning' | 'error';
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
}) {
  const accentColor = variant === 'error' ? ERROR_RED : WARNING_AMBER;
  const iconName = variant === 'error' ? 'close' : 'alert';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.successIconCircle, { backgroundColor: accentColor }]}>
            <Ionicons name={iconName as any} size={26} color="#fff" />
          </View>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          <View style={styles.confirmButtonRow}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnConfirm, { flex: 1, backgroundColor: accentColor }]}
              onPress={onClose}
            >
              <Text style={styles.confirmBtnConfirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Ang tatlong status timestamps ay idinadagdag ng
// supabase/sql/2026-09_home_service_status_timestamps.sql. HANGGANG hindi pa
// na-run ang SQL na iyon sa Supabase, wala pa ang mga column -- at ang buong
// query ay babagsak ("column home_service.on_the_way_at does not exist",
// Postgres error 42703), kaya WALANG kahit anong booking na makikita.
//
// Kaya hiwalay ang listahan: sinusubukan muna ang bagong columns, at kapag
// wala pa ang mga ito sa database ay inuulit ang query gamit ang lumang
// listahan. Gumagana pa rin ang buong screen; "Pending" lang muna ang
// ipapakita ng timeline hanggang sa ma-apply ang SQL.
const STAMP_COLUMNS = 'on_the_way_at, washing_at, completed_at';

// Dalawang magkaibang anyo ang dating ng "wala ang column na ito":
//
//   42703  -- galing mismo sa Postgres, kapag SELECT ang tinatakbo
//   PGRST204 -- galing sa PostgREST, kapag INSERT/UPDATE: "Could not find
//               the 'on_the_way_at' column of 'home_service' in the schema
//               cache". Lumalabas din ito kung NAKA-APPLY na ang SQL pero
//               LUMA pa ang schema cache ng PostgREST (kailangan ng
//               "notify pgrst, 'reload schema';" o ilang segundo).
//
// Dapat nahuhuli ang PAREHO, kung hindi ay babagsak pa rin ang buong query.
const isMissingColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const message = error.message ?? '';
  return /does not exist/i.test(message) || /schema cache/i.test(message);
};

const BASE_COLUMNS =
  'id, shop_id, shop_name, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_method, payment_status, price, paymongo_source_id, paymongo_payment_id, paid_at';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Manu-manong format -- iniiwasan ang Intl/toLocaleString na hindi
// pare-pareho ang resulta sa Hermes sa iba't ibang Android device.
function formatStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  const hour = d.getHours() % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${hour}:${mins} ${ampm}`;
}

// ---------- Status Timeline ----------
// Para malinaw sa customer kung KAILAN eksakto umalis papunta sa kanila ang
// staff, kailan nagsimula ang hugas, at kailan ito natapos. Ang hakbang na
// hindi pa naaabot ay "Pending".
// Pagkakasunod-sunod ng status -- dito sinusukat kung gaano na kalayo
// ang booking, kaya umuusad ang progress kahit walang naka-save na oras.
const STATUS_ORDER = ['Waiting', 'On the Way', 'Washing', 'Completed'];

const TIMELINE_STEPS = [
  { key: 'on_the_way_at', label: 'On the Way', color: '#8B5CF6' },
  { key: 'washing_at', label: 'Washing', color: BRAND_BLUE },
  { key: 'completed_at', label: 'Completed', color: '#16A34A' },
] as const;

function StatusTimeline({ service }: { service: HomeServiceRow }) {
  // BUG FIX: dati, umiilaw lang ang isang hakbang kapag may TIMESTAMP ito.
  // Kapag wala pa ang timestamp columns sa database (o lumang booking bago
  // pa naidagdag ang mga ito), hindi kailanman na-save ang oras -- kaya
  // naka-"Pending" ang lahat kahit Washing o Completed na ang status.
  // Ngayon ang STATUS ang nagdedesisyon kung naabot na ang hakbang; ang
  // timestamp ay dagdag na impormasyon lang (kung kailan eksakto).
  const currentIndex = STATUS_ORDER.indexOf(service.status);

  const steps = TIMELINE_STEPS.map((step, i) => {
    const stepIndex = i + 1; // 0 = Waiting, kaya nagsisimula sa 1 ang mga hakbang
    const reached = currentIndex >= stepIndex;
    const isCurrent = currentIndex === stepIndex && step.key !== 'completed_at';
    // Fallback sa paid_at para sa completed rows na walang completed_at.
    const at = formatStamp(
      step.key === 'completed_at' ? service.completed_at ?? service.paid_at : service[step.key]
    );
    return {
      ...step,
      reached,
      caption: at ?? (isCurrent ? 'In progress' : reached ? 'Done' : 'Pending'),
    };
  });

  return (
    <View style={styles.timeline}>
      <Text style={styles.timelineHeading}>Progress</Text>
      {steps.map((step, i) => (
        <View key={step.key} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View
              style={[
                styles.timelineDot,
                step.reached
                  ? { backgroundColor: step.color, borderColor: step.color }
                  : { backgroundColor: '#FFFFFF', borderColor: '#D1D5DB' },
              ]}
            >
              {step.reached && <Ionicons name="checkmark" size={9} color="#FFFFFF" />}
            </View>
            {i < steps.length - 1 && (
              // Kinukulayan ang linya kapag naabot na ang SUSUNOD na hakbang.
              <View
                style={[styles.timelineLine, steps[i + 1].reached && { backgroundColor: step.color }]}
              />
            )}
          </View>
          <View style={styles.timelineText}>
            <Text style={[styles.timelineLabel, !step.reached && styles.timelinePendingLabel]}>
              {step.label}
            </Text>
            <Text
              style={[
                styles.timelineTime,
                !step.reached && styles.timelinePendingTime,
                step.caption === 'In progress' && { color: step.color, fontWeight: '700' },
              ]}
            >
              {step.caption}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------- Transaction History Receipt Modal (Blue / White / Black) ----------
// Lumalabas ito kapag tinap ng customer ang isang booking card -- nagbibigay
// ng buong "resibo" ng transaction (para sa lahat ng tabs, pero pinaka-useful
// sa Completed tab bilang transaction history).
function ReceiptModal({
  visible,
  service,
  onClose,
}: {
  visible: boolean;
  service: HomeServiceRow | null;
  onClose: () => void;
}) {
  if (!service) return null;

  const rows: { label: string; value: string }[] = [
    { label: 'Shop Branch', value: service.shop_name || 'Carwash' },
    { label: 'Date', value: service.scheduled_date },
    { label: 'Time', value: service.scheduled_time },
    { label: 'Vehicle Type', value: service.vehicle_type },
    { label: 'Service Type', value: service.service_type },
    { label: 'Address', value: service.address },
    { label: 'Payment Method', value: service.payment_method || 'GCash' },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.confirmOverlay}>
        <View style={[styles.confirmCard, styles.receiptCard]}>
          <View style={styles.receiptHeader}>
            <View style={styles.receiptIconCircle}>
              <Ionicons name="receipt-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.confirmTitle}>Transaction Details</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(service.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(service.status) }]}>{service.status}</Text>
            </View>
          </View>

          <ScrollView style={styles.receiptBody} showsVerticalScrollIndicator={false}>
            {rows.map((row) => (
              <View key={row.label} style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>{row.label}</Text>
                <Text style={styles.receiptValue} numberOfLines={3}>
                  {row.value}
                </Text>
              </View>
            ))}

            <View style={styles.receiptDivider} />

            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Payment Status</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getPaymentStatusColor(service.payment_status) + '20' },
                ]}
              >
                <Text style={[styles.statusText, { color: getPaymentStatusColor(service.payment_status) }]}>
                  {service.payment_status || 'Unpaid'}
                </Text>
              </View>
            </View>

            <StatusTimeline service={service} />

            <View style={styles.receiptTotalRow}>
              <Text style={styles.receiptTotalLabel}>Total Amount</Text>
              <Text style={styles.receiptTotalValue}>
                {service.price != null ? formatPeso(service.price) : 'To be assessed'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.confirmButtonRow}>
            <TouchableOpacity style={[styles.confirmBtn, styles.confirmBtnConfirm, { flex: 1 }]} onPress={onClose}>
              <Text style={styles.confirmBtnConfirmText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------- Reusable searchable dropdown para sa PSGC selectors ----------
function PsgcDropdown({
  label,
  placeholder,
  value,
  options,
  onSelect,
  onClear,
  disabled,
  loading,
}: {
  label: string;
  placeholder: string;
  value: PsgcItem | null;
  options: PsgcItem[];
  onSelect: (item: PsgcItem) => void;
  onClear?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  const openDropdown = () => {
    if (disabled || loading) return;
    setSearch('');
    setVisible(true);
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={[styles.dropdownField, (disabled || loading) && styles.dropdownFieldDisabled]}>
        <TouchableOpacity style={styles.dropdownFieldMain} onPress={openDropdown} activeOpacity={0.7}>
          <Text
            style={[styles.dropdownFieldText, !value && styles.dropdownPlaceholderText]}
            numberOfLines={1}
          >
            {loading ? 'Loading...' : value ? value.name : placeholder}
          </Text>
        </TouchableOpacity>

        {value && onClear ? (
          <TouchableOpacity onPress={onClear} style={styles.dropdownIconBtn} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#9AA1AC" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openDropdown} style={styles.dropdownIconBtn} disabled={disabled || loading}>
            {loading ? (
              <ActivityIndicator size="small" color={BRAND_BLUE} />
            ) : (
              <Ionicons name="chevron-down" size={18} color="#6B7280" />
            )}
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity style={styles.dropdownOverlayTouchable} activeOpacity={1} onPress={() => setVisible(false)} />
          <View style={styles.dropdownSheet}>
            <View style={styles.dropdownSheetHeader}>
              <Text style={styles.dropdownSheetTitle}>{label}</Text>
              <TouchableOpacity style={styles.headerCloseBtn} onPress={() => setVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={16} color={INK} />
                <Text style={styles.headerCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dropdownSearchBox}>
              <Ionicons name="search" size={16} color="#9AA1AC" />
              <TextInput
                style={styles.dropdownSearchInput}
                placeholder="Maghanap..."
                placeholderTextColor="#9AA1AC"
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>

            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.dropdownOption}
                  onPress={() => {
                    onSelect(item);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.dropdownOptionText}>{item.name}</Text>
                  {value?.code === item.code && <Ionicons name="checkmark" size={18} color={BRAND_BLUE} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.dropdownEmptyText}>Wala nahanap.</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function HomeServiceScreen() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<TabName>('Upcoming');
  const [services, setServices] = useState<HomeServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');

  const [bookingVisible, setBookingVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shops, setShops] = useState<ShopBranch[]>([]);

  // ---------- "Are you sure?" confirmation bago i-submit ang booking ----------
  const [confirmBookingVisible, setConfirmBookingVisible] = useState(false);

  // ---------- Success modal (kapalit ng Alert.alert pagkatapos mag-book) ----------
  const [successVisible, setSuccessVisible] = useState(false);

  // ---------- NEW: Message modal (kapalit ng Alert.alert para sa Missing
  // Info, Payment Error, at Failed to Book -- consistent na Blue/White/Black
  // modal design sa buong screen na 'to, walang native Alert.alert na
  // matitira). ----------
  const [messageModal, setMessageModal] = useState<{
    title: string;
    message: string;
    variant: 'warning' | 'error';
  } | null>(null);

  const showMessage = (title: string, message: string, variant: 'warning' | 'error' = 'warning') => {
    setMessageModal({ title, message, variant });
  };

  // ---------- Transaction history receipt modal ----------
  const [selectedReceipt, setSelectedReceipt] = useState<HomeServiceRow | null>(null);

  // ---------- NEW: GCash checkout in-progress state (via PayMongo) ----------
  const [payingViaGcash, setPayingViaGcash] = useState(false);

  // ---------- REAL-TIME CLOCK (via Time API) ----------
  const [serverNow, setServerNow] = useState<Date>(new Date());
  const [timeSynced, setTimeSynced] = useState(false);

  const fetchServerTime = async () => {
    try {
      const res = await fetch(TIME_API_URL);
      const json = await res.json();
      if (json?.datetime) {
        setServerNow(new Date(json.datetime));
        setTimeSynced(true);
      }
    } catch (e) {
      console.log('[TimeAPI] hindi na-fetch ang real time, device clock na lang muna:', e);
      setServerNow(new Date());
      setTimeSynced(false);
    }
  };

  useEffect(() => {
    fetchServerTime();
    const tick = setInterval(() => {
      setServerNow((prev) => new Date(prev.getTime() + 1000));
    }, 1000);
    const resync = setInterval(fetchServerTime, 5 * 60 * 1000);
    return () => {
      clearInterval(tick);
      clearInterval(resync);
    };
  }, []);

  const dateOptions = buildDateOptions(serverNow);

  // ---------- PSGC ADDRESS (Region / Province / City / Barangay) ----------
  const [regions, setRegions] = useState<PsgcItem[]>([]);
  const [provinces, setProvinces] = useState<PsgcItem[]>([]);
  const [citiesMunicipalities, setCitiesMunicipalities] = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);

  const [loadingAddressData, setLoadingAddressData] = useState(false);
  const [addressDataError, setAddressDataError] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const [selectedRegion, setSelectedRegion] = useState<PsgcItem | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<PsgcItem | null>(null);
  const [selectedCity, setSelectedCity] = useState<PsgcItem | null>(null);
  const [selectedBarangay, setSelectedBarangay] = useState<PsgcItem | null>(null);
  const [streetAddress, setStreetAddress] = useState('');

  const fetchAddressReferenceData = async () => {
    setLoadingAddressData(true);
    setAddressDataError(false);
    try {
      const [regionsRes, provincesRes, citiesRes, municipalitiesRes] = await Promise.all([
        fetch(PSGC_API.regions),
        fetch(PSGC_API.provinces),
        fetch(PSGC_API.cities),
        fetch(PSGC_API.municipalities),
      ]);
      const [regionsJson, provincesJson, citiesJson, municipalitiesJson] = await Promise.all([
        regionsRes.json(),
        provincesRes.json(),
        citiesRes.json(),
        municipalitiesRes.json(),
      ]);

      setRegions(normalizePsgcList(regionsJson));
      setProvinces(normalizePsgcList(provincesJson));
      setCitiesMunicipalities([
        ...normalizePsgcList(citiesJson).map((c) => ({ ...c, kind: 'City' as const })),
        ...normalizePsgcList(municipalitiesJson).map((m) => ({ ...m, kind: 'Municipality' as const })),
      ]);
    } catch (e) {
      console.log('[PSGC] hindi na-fetch ang address reference data:', e);
      setAddressDataError(true);
    }
    setLoadingAddressData(false);
  };

  useEffect(() => {
    if (bookingVisible && regions.length === 0 && !loadingAddressData) {
      fetchAddressReferenceData();
    }
  }, [bookingVisible]);

  const provincesInRegion = useMemo(() => {
    if (!selectedRegion) return [];
    return provinces.filter((p) => p.code.slice(0, 2) === selectedRegion.code.slice(0, 2));
  }, [provinces, selectedRegion]);

  const provincePrefixesInRegion = useMemo(
    () => new Set(provincesInRegion.map((p) => p.code.slice(0, 4))),
    [provincesInRegion]
  );

  const citiesInRegion = useMemo(() => {
    if (!selectedRegion) return [];
    return citiesMunicipalities.filter((c) => c.code.slice(0, 2) === selectedRegion.code.slice(0, 2));
  }, [citiesMunicipalities, selectedRegion]);

  const cityOptions = useMemo(() => {
    if (!selectedRegion) return [];
    if (!selectedProvince) return citiesInRegion;
    return citiesInRegion.filter((c) => {
      const prefix4 = c.code.slice(0, 4);
      const isIndependentCity = !provincePrefixesInRegion.has(prefix4);
      return isIndependentCity || prefix4 === selectedProvince.code.slice(0, 4);
    });
  }, [citiesInRegion, selectedProvince, provincePrefixesInRegion]);

  const fetchBarangays = async (cityMunicipalityCode: string) => {
    setLoadingBarangays(true);
    setBarangays([]);
    try {
      const res = await fetch(PSGC_API.barangays(cityMunicipalityCode));
      const json = await res.json();
      setBarangays(normalizePsgcList(json));
    } catch (e) {
      console.log('[PSGC] barangays fetch error:', e);
    }
    setLoadingBarangays(false);
  };

  const onSelectRegion = (region: PsgcItem) => {
    setSelectedRegion(region);
    setSelectedProvince(null);
    setSelectedCity(null);
    setSelectedBarangay(null);
    setBarangays([]);
  };

  const onSelectProvince = (province: PsgcItem) => {
    setSelectedProvince(province);
    setSelectedCity(null);
    setSelectedBarangay(null);
    setBarangays([]);
  };

  const onClearProvince = () => {
    setSelectedProvince(null);
    setSelectedCity(null);
    setSelectedBarangay(null);
    setBarangays([]);
  };

  const onSelectCity = (city: PsgcItem) => {
    setSelectedCity(city);
    setSelectedBarangay(null);
    fetchBarangays(city.code);
  };

  // Booking form state
  const [contactNumber, setContactNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [selectedShop, setSelectedShop] = useState<ShopBranch | null>(null);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].iso);
  const [selectedTime, setSelectedTime] = useState('');

  const estimatedPrice = useMemo(
    () => getServicePrice(serviceType, vehicleType),
    [serviceType, vehicleType]
  );
  const totalPrice = estimatedPrice === null ? null : estimatedPrice + HOME_SERVICE_FEE;
  const isOversizeVanNote = vehicleType === 'Van' && serviceType === 'Basic Wash';
  const isGCashSelected = paymentMethod === 'GCash';

  // BUG FIX: ang listahan ay nag-re-refresh DATI lang sa mount at sa
  // realtime event. Kapag hindi dumating ang realtime event (hindi naka-add
  // ang home_service sa supabase_realtime publication, na-drop ang socket
  // habang naka-background ang app, o bumalik galing GCash browser tab),
  // HINDI na kailanman nag-refetch ang screen -- kaya nananatili sa lumang
  // tab ang booking kahit na-Completed na ito ng staff. Tatlong layer ngayon
  // ang refresh: (1) realtime, (2) tuwing nagiging focused ang screen, at
  // (3) tuwing papalit ng tab.
  const fetchServices = async (uid: string) => {
    const run = (columns: string) =>
      supabase
        .from('home_service')
        .select(columns)
        .eq('user_id', uid)
        .order('scheduled_at', { ascending: true });

    let { data, error } = await run(`${BASE_COLUMNS}, ${STAMP_COLUMNS}`);

    if (isMissingColumnError(error)) {
      console.warn(
        'home_service status timestamps are missing -- run supabase/sql/2026-09_home_service_status_timestamps.sql'
      );
      ({ data, error } = await run(BASE_COLUMNS));
    }

    if (error) {
      console.error('Error fetching home service bookings:', error);
    } else {
      setServices((data as unknown as HomeServiceRow[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const fetchShops = async () => {
    const { data, error } = await supabase
      .from('shop_profile_setup')
      .select('id, shop_name')
      .order('id', { ascending: false });

    if (!error) setShops((data as ShopBranch[]) ?? []);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/customer/customer-registration' as any);
        return;
      }
      setUserId(session.user.id);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      setFullName(profileData?.full_name ?? '');

      await fetchServices(session.user.id);
      await fetchShops();
    };
    init();

    // FIX: Linisin muna ang anumang natirang channel na may parehong
    // pangalan bago gumawa ng bago -- iniiwasan nito ang
    // "cannot add postgres_changes callbacks... after subscribe()" error
    // na lumalabas kapag nabalik ang app sa page na ito nang mas mabilis
    // kaysa sa pag-clean up ng dating subscription (madalas mangyari
    // pagkatapos ng GCash redirect papunta sa app).
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === 'realtime:home-service-customer-changes') {
        supabase.removeChannel(ch);
      }
    });

    const channel = supabase
      .channel('home-service-customer-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'home_service' },
        () => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) fetchServices(session.user.id);
          });
        }
      )
      .subscribe((status) => {
        // Sa tuwing (muling) kumokonekta ang socket, mag-refetch agad --
        // anumang status change na na-miss habang disconnected ay
        // maaabutan pa rin nito.
        if (status === 'SUBSCRIBED') {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) fetchServices(session.user.id);
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = () => {
    if (!userId) return;
    setRefreshing(true);
    fetchServices(userId);
  };

  // Refetch tuwing bumabalik ang customer sa screen na ito (halimbawa,
  // pagkatapos mag-switch ng app habang nagse-serbisyo ang staff) -- ito ang
  // sumasalo kapag hindi dumating ang realtime event.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  useFocusEffect(
    useCallback(() => {
      const uid = userIdRef.current;
      if (uid) fetchServices(uid);
    }, [])
  );

  // Refetch din sa bawat palit ng tab, para laging sariwa ang nakikita --
  // lalo na ang Completed tab pagkatapos mag-collect ng bayad ang staff.
  // Nilalaktawan ang unang takbo -- kumukuha na ang init() at ang focus
  // effect sa mount, kaya doble-dobleng fetch lang ito doon.
  const tabSwitchedRef = useRef(false);
  useEffect(() => {
    if (!tabSwitchedRef.current) {
      tabSwitchedRef.current = true;
      return;
    }
    if (userId) fetchServices(userId);
  }, [activeTab]);

  const filteredServices = services.filter((s) => s.status === TAB_STATUS[activeTab]);

  // ---------- Transaction History summary (Completed tab) ----------
  const completedServices = useMemo(
    () => services.filter((s) => s.status === 'Completed'),
    [services]
  );
  const totalCompletedCount = completedServices.length;
  const totalSpent = useMemo(
    () => completedServices.reduce((sum, s) => sum + (s.price ?? 0), 0),
    [completedServices]
  );

  const getAvailableTimeSlots = () => {
    const isToday = selectedDate === dateOptions[0].iso;
    if (!isToday) return TIME_SLOTS;
    return TIME_SLOTS.filter((slot) => {
      const [time, meridiem] = slot.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (meridiem === 'PM' && h !== 12) h += 12;
      if (meridiem === 'AM' && h === 12) h = 0;
      const slotDate = new Date(serverNow);
      slotDate.setHours(h, m, 0, 0);
      return slotDate.getTime() - serverNow.getTime() >= 60 * 60 * 1000;
    });
  };

  const availableTimeSlots = getAvailableTimeSlots();

  useEffect(() => {
    if (selectedTime && !getAvailableTimeSlots().includes(selectedTime)) {
      setSelectedTime('');
    }
  }, [selectedDate]);

  const resetForm = () => {
    setContactNumber('');
    setVehicleType('');
    setServiceType('');
    setPaymentMethod('');
    setSelectedShop(null);
    setSelectedDate(dateOptions[0].iso);
    setSelectedTime('');
    setSelectedRegion(null);
    setSelectedProvince(null);
    setSelectedCity(null);
    setSelectedBarangay(null);
    setBarangays([]);
    setStreetAddress('');
  };

  // Ran validation lang -- kapag pumasa, saka pa lang lalabas ang
  // "Are you sure?" confirmation modal bago talaga mag-submit sa DB.
  // NOTE: lahat ng "Missing Info" reminders ay gumagamit na ng
  // MessageModal (consistent Blue/White/Black modal) sa halip na
  // native Alert.alert.
  const promptConfirmBooking = () => {
    if (!contactNumber.trim()) return showMessage('Missing Info', 'Enter your contact number.');
    if (!selectedShop) return showMessage('Missing Info', 'Choose a shop branch.');
    if (!selectedRegion) return showMessage('Missing Info', 'Choose a region.');
    if (!selectedCity) return showMessage('Missing Info', 'Choose a city/municipality.');
    if (!selectedBarangay) return showMessage('Missing Info', 'Choose a barangay.');
    if (!streetAddress.trim()) return showMessage('Missing Info', 'Enter your street address.');
    if (!vehicleType) return showMessage('Missing Info', 'Choose a vehicle type.');
    if (!serviceType) return showMessage('Missing Info', 'Choose a service type.');
    if (!paymentMethod) return showMessage('Missing Info', 'Choose a payment method.');

    if (isGCashSelected && totalPrice === null) {
      return showMessage(
        'GCash Unavailable',
        'This vehicle and service combination has no fixed price. Please choose another combination.'
      );
    }
    // Ito na yung dating "naka-plain lang, hindi naka modal" -- ngayon
    // gamit na rin ang parehong MessageModal, consistent na sa lahat.
    if (!selectedTime) return showMessage('Missing Info', 'Choose a time slot');

    setConfirmBookingVisible(true);
  };

  // NEW: Kicks off the PayMongo GCash checkout -- creates a Source tied to
  // this booking, then opens the real GCash authorization page. The actual
  // payment_status flip to "Paid" happens server-side via the
  // paymongo-webhook Edge Function once GCash confirms the charge; the
  // realtime subscription above then reflects it here automatically.
  const startGcashCheckout = async (bookingId: number, amount: number): Promise<boolean> => {
    setPayingViaGcash(true);
    try {
      // Proteksyon laban sa dobleng bayad: posibleng bayad na pala ito sa
      // PayMongo pero "Unpaid" pa rin sa DB (hal. hindi dumating ang
      // webhook). Kumpirmahin muna bago gumawa ng bagong GCash source.
      const { data: verified } = await supabase.functions.invoke('verify-gcash-payment', {
        body: { bookingId },
      });
      if (verified?.paymentStatus === 'Paid') {
        if (userId) fetchServices(userId);
        router.push({
          pathname: '/payment-return',
          params: { bookingId: String(bookingId), status: 'success' },
        } as any);
        return true;
      }

      const redirectUrl = Linking.createURL('payment-return', {
        queryParams: { bookingId: String(bookingId) },
      });
      const { data, error } = await supabase.functions.invoke('create-gcash-source', {
        body: { bookingId, amount, returnUrl: redirectUrl },
      });

      console.log('=== GCASH DEBUG ===');
      console.log('data:', JSON.stringify(data));
      console.log('error:', JSON.stringify(error));

      if (error && error.context) {
        try {
          const bodyText = await error.context.text();
          console.log('error body:', bodyText);
        } catch (e) {
          console.log('could not read error body:', e);
        }
      }
      console.log('===================');

      if (error || !data?.checkoutUrl) {
        const details = data?.details?.[0]?.detail ?? data?.error ?? error?.message;
        showMessage(
          'Payment Error',
          details
            ? `We could not start the GCash payment: ${details}`
            : 'We could not start the GCash payment. Your booking was created and can be retried from your bookings list.',
          'error'
        );
        return false;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.checkoutUrl, redirectUrl);

      // MAHALAGA: ang deep link na binabalik ng auth session ay HINDI
      // awtomatikong dumadaan sa Linking listeners ng expo-router -- tayo
      // mismo ang dapat mag-route papunta sa payment-return receipt screen.
      // Kapag "cancel"/"dismiss" (isinara ang GCash tab), wala tayong status
      // kaya hahayaan natin ang payment-return na mag-poll muna sa DB bago
      // magdesisyon kung Paid ba talaga o hindi.
      let returnedStatus = '';
      if (result?.type === 'success' && result.url) {
        const parsedStatus = Linking.parse(result.url).queryParams?.status;
        returnedStatus = Array.isArray(parsedStatus)
          ? parsedStatus[0] ?? 'success'
          : (parsedStatus as string) ?? 'success';
      }

      // Kung nabuksan na ng OS ang deep link mula sa in-app browser ng
      // GCash, nasa payment-return na tayo -- `replace` para hindi dumoble
      // ang receipt screen sa stack.
      const receiptRoute = {
        pathname: '/payment-return',
        params: { bookingId: String(bookingId), status: returnedStatus },
      } as any;
      if (pathname === '/payment-return') router.replace(receiptRoute);
      else router.push(receiptRoute);
      return true;
    } catch (e) {
      console.log('[PayMongo] gcash checkout error:', e);
      showMessage(
        'Payment Error',
        'There was a problem opening GCash. Your booking was created and can be retried from your bookings list.',
        'error'
      );
      return false;
    } finally {
      setPayingViaGcash(false);
    }
  };

  const handleBookingSubmit = async () => {
    if (!userId || !selectedShop) return;

    setSubmitting(true);

    const [time, meridiem] = selectedTime.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    const fullAddress = [
      streetAddress.trim(),
      `Brgy. ${selectedBarangay!.name}`,
      selectedCity!.name,
      selectedProvince ? selectedProvince.name : null,
      selectedRegion!.name,
    ]
      .filter(Boolean)
      .join(', ');

    // Palaging "Waiting" ang initial status ng bagong booking. Susunod na
    // status flow (ginagawa ng staff app): Waiting -> On the Way -> Washing -> Completed
    const { data: inserted, error } = await supabase
      .from('home_service')
      .insert({
        user_id: userId,
        shop_id: selectedShop.id,
        shop_name: selectedShop.shop_name,
        customer_name: fullName || 'Customer',
        contact_number: contactNumber.trim(),
        address: fullAddress,
        vehicle_type: vehicleType,
        service_type: serviceType,
        status: 'Waiting',
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        scheduled_at: scheduledAt.toISOString(),
        payment_method: paymentMethod,
        payment_status: 'Unpaid',
        price: totalPrice,
      })
      .select()
      .single();

    if (error || !inserted) {
      setSubmitting(false);
      showMessage('Failed to Book', error?.message ?? 'Please try again.', 'error');
      return;
    }

    // NEW: If GCash, immediately send the customer into the real GCash
    // authorization flow via PayMongo before closing out the modal.
    if (isGCashSelected && totalPrice != null) {
      const paymentStarted = await startGcashCheckout(inserted.id, totalPrice);
      if (!paymentStarted) {
        setSubmitting(false);
        setConfirmBookingVisible(false);
        setBookingVisible(false);
        if (userId) fetchServices(userId);
        return;
      }
    }

    setSubmitting(false);
    setConfirmBookingVisible(false);

    setBookingVisible(false);
    resetForm();
    setActiveTab('Upcoming');
    if (userId) fetchServices(userId);
    // Sa GCash, nakabukas na ang payment-return receipt screen mula sa
    // startGcashCheckout -- huwag nang dagdagan pa ng success modal.
    if (!isGCashSelected) setSuccessVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Home Service</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        {TAB_ORDER.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Service List */}
      <ScrollView
        style={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={BRAND_BLUE} />
          </View>
        ) : (
          <>
            {/* ---------- TRANSACTION HISTORY SUMMARY (Completed tab lang) ---------- */}
            {activeTab === 'Completed' && totalCompletedCount > 0 && (
              <View style={styles.historySummaryCard}>
                <View style={styles.historySummaryItem}>
                  <Text style={styles.historySummaryLabel}>Completed Services</Text>
                  <Text style={styles.historySummaryValue}>{totalCompletedCount}</Text>
                </View>
                <View style={styles.historySummaryDivider} />
                <View style={styles.historySummaryItem}>
                  <Text style={styles.historySummaryLabel}>Total Spent</Text>
                  <Text style={styles.historySummaryValue}>{formatPeso(totalSpent)}</Text>
                </View>
              </View>
            )}

            {activeTab === 'Completed' && filteredServices.length > 0 && (
              <Text style={styles.historyHint}>Tap a transaction to view the full receipt.</Text>
            )}

            {filteredServices.map((service) => (
              <TouchableOpacity
                key={service.id}
                style={styles.serviceCard}
                activeOpacity={0.7}
                onPress={() => setSelectedReceipt(service)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.customerInfo}>
                    <View style={styles.avatarCircle}>
                      <Ionicons name="business" size={20} color={BRAND_BLUE} />
                    </View>
                    <View style={styles.customerDetails}>
                      <Text style={styles.customerName}>{service.shop_name || 'Carwash'}</Text>
                      <Text style={styles.customerPhone}>{service.scheduled_date}</Text>
                    </View>
                  </View>
                  <Text style={styles.scheduledTime}>{service.scheduled_time}</Text>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={16} color="#6B7280" />
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoText}>{service.address}</Text>
                    </View>
                  </View>

                  <View style={styles.vehicleRow}>
                    <View style={styles.infoRow}>
                      <Ionicons name="car-outline" size={16} color="#6B7280" />
                      <Text style={styles.infoText}>
                        {service.vehicle_type} · {service.service_type}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(service.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(service.status) }]}>
                        {service.status}
                      </Text>
                    </View>
                  </View>

                  {/* Payment info -- naglalaman ng payment method at kung
                      na-confirm na ng staff/PayMongo (Paid) o hindi pa (Unpaid). */}
                  <View style={styles.paymentRow}>
                    <View style={styles.infoRow}>
                      <Ionicons
                        name={service.payment_method === 'GCash' ? 'phone-portrait-outline' : 'cash-outline'}
                        size={16}
                        color="#6B7280"
                      />
                      <Text style={styles.infoText}>
                        {service.payment_method || 'GCash'}
                        {service.price != null ? ` · ${formatPeso(service.price)}` : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getPaymentStatusColor(service.payment_status) + '20' },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: getPaymentStatusColor(service.payment_status) }]}>
                        {service.payment_status || 'Unpaid'}
                      </Text>
                    </View>
                  </View>

                  <StatusTimeline service={service} />

                  {/* NEW: quick "pay now" retry if a GCash booking is still Unpaid */}
                  {service.payment_method === 'GCash' &&
                    service.payment_status !== 'Paid' &&
                    service.price != null && (
                      <TouchableOpacity
                        style={styles.payNowBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          startGcashCheckout(service.id, service.price as number);
                        }}
                      >
                        <Ionicons name="phone-portrait-outline" size={14} color="#fff" />
                        <Text style={styles.payNowBtnText}>Pay with GCash</Text>
                      </TouchableOpacity>
                    )}
                </View>
              </TouchableOpacity>
            ))}

            {filteredServices.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="car-outline" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>
                  {activeTab === 'Completed' ? 'No transaction history yet' : 'No services found'}
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FLOATING BOOK BUTTON */}
      <TouchableOpacity style={styles.addButton} onPress={() => setBookingVisible(true)}>
        <Text style={styles.addButtonText}>+ Book Home Service</Text>
      </TouchableOpacity>

      {/* BOOKING MODAL */}
      <Modal visible={bookingVisible} animationType="slide" onRequestClose={() => setBookingVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setBookingVisible(false)} style={styles.backButton}>
              <Ionicons name="close" size={24} color={INK} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Book Home Service</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Carwash Branch</Text>
            <View style={styles.chipRow}>
              {shops.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, selectedShop?.id === s.id && styles.chipActive]}
                  onPress={() => setSelectedShop(s)}
                >
                  <Text style={[styles.chipText, selectedShop?.id === s.id && styles.chipTextActive]}>
                    {s.shop_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Contact Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Contact number"
              placeholderTextColor="#9AA1AC"
              keyboardType="phone-pad"
              value={contactNumber}
              onChangeText={setContactNumber}
            />

            <View style={styles.addressHeaderRow}>
              <Text style={styles.sectionLabel}>Complete Address</Text>
              {loadingAddressData && <ActivityIndicator size="small" color={BRAND_BLUE} />}
            </View>

            {addressDataError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  We could not load the address data. Please check your internet connection.
                </Text>
                <TouchableOpacity onPress={fetchAddressReferenceData}>
                  <Text style={styles.retryText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {!addressDataError && (
              <>
                <PsgcDropdown
                  label="Region"
                  placeholder="Select a region"
                  value={selectedRegion}
                  options={regions}
                  onSelect={onSelectRegion}
                  loading={loadingAddressData}
                />

                {selectedRegion && !isNCR(selectedRegion) && provincesInRegion.length > 0 && (
                  <PsgcDropdown
                    label="Province "
                    placeholder="Select a province"
                    value={selectedProvince}
                    options={provincesInRegion}
                    onSelect={onSelectProvince}
                    onClear={onClearProvince}
                  />
                )}

                {selectedRegion && (
                  <PsgcDropdown
                    label="City / Municipality"
                    placeholder="Select a city or municipality"
                    value={selectedCity}
                    options={cityOptions}
                    onSelect={onSelectCity}
                  />
                )}

                {selectedCity && (
                  <PsgcDropdown
                    label="Barangay"
                    placeholder="Select a barangay"
                    value={selectedBarangay}
                    options={barangays}
                    onSelect={setSelectedBarangay}
                    loading={loadingBarangays}
                  />
                )}
              </>
            )}

            <Text style={styles.subLabel}>House No. / Street / Landmark</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Block 5 Lot 12, near the community chapel"
              placeholderTextColor="#9AA1AC"
              multiline
              numberOfLines={2}
              value={streetAddress}
              onChangeText={setStreetAddress}
            />

            <Text style={styles.sectionLabel}>Vehicle Type</Text>
            <View style={styles.chipRow}>
              {VEHICLE_TYPES.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.chip, vehicleType === v && styles.chipActive]}
                  onPress={() => setVehicleType(v)}
                >
                  <Text style={[styles.chipText, vehicleType === v && styles.chipTextActive]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Service Type</Text>
            <View style={styles.chipRow}>
              {SERVICE_TYPES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, serviceType === s && styles.chipActive]}
                  onPress={() => setServiceType(s)}
                >
                  <Text style={[styles.chipText, serviceType === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(vehicleType && serviceType) && (
              <View style={styles.priceBox}>
                {totalPrice !== null ? (
                  <>
                    <Text style={styles.priceSummaryTitle}>Order Summary</Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Service fee</Text>
                      <Text style={styles.priceRowValue}>{formatPeso(estimatedPrice ?? 0)}</Text>
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Shipping fee</Text>
                      <Text style={styles.priceRowValue}>{formatPeso(HOME_SERVICE_FEE)}</Text>
                    </View>
                    <View style={styles.priceDivider} />
                    <View style={styles.priceTotalRow}>
                      <Text style={styles.priceTotalLabel}>Total to pay</Text>
                      <Text style={styles.priceTotalValue}>{formatPeso(totalPrice)}</Text>
                    </View>
                    {isOversizeVanNote && (
                      <Text style={styles.priceNote}>
                        The service fee may be higher for oversized vans, up to ₱300–₱350.
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.priceNote}>
                    No fixed price is available for this vehicle and service combination. Staff will confirm the final price.
                  </Text>
                )}
              </View>
            )}

            <Text style={styles.sectionLabel}>Payment Method</Text>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.chip,
                    paymentMethod === p && (p === 'GCash' ? styles.chipActiveGCash : styles.chipActive),
                  ]}
                  onPress={() => setPaymentMethod(p)}
                >
                  <Ionicons
                    name={p === 'GCash' ? 'phone-portrait-outline' : 'cash-outline'}
                    size={13}
                    color={paymentMethod === p ? '#fff' : '#3A3F47'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.chipText, paymentMethod === p && styles.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* GCash: since payment now happens through PayMongo's real
                checkout page (redirects into GCash to authorize), we just
                show a short explainer here instead of collecting a manual
                reference number. */}
            {isGCashSelected ? (
              <View style={styles.gcashCard}>
                <View style={styles.gcashHeaderRow}>
                  <Ionicons name="phone-portrait-outline" size={18} color={GCASH_BLUE} />
                  <Text style={styles.gcashHeaderText}>Pay via GCash</Text>
                </View>
                <Text style={styles.gcashHint}>
                  After you confirm, you'll be redirected to GCash to authorize your payment
                  {totalPrice !== null ? ` of ${formatPeso(totalPrice)}` : ''}. Your booking status
                  will update automatically after payment is confirmed.
                </Text>
                {estimatedPrice === null && (
                  <Text style={[styles.gcashHint, { color: '#B91C1C', marginTop: 6 }]}>
                    GCash requires a fixed price. Please choose another vehicle and service combination.
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.paymentHint}>
               You will pay this directly to the staff upon arrival or after the home service.
              </Text>
            )}

            {/* ---------- REAL-TIME DATE & TIME (via Time API) ---------- */}
            <View style={styles.clockRow}>
              <Ionicons name="time-outline" size={14} color={timeSynced ? '#16A34A' : '#B7791F'} />
              <Text style={styles.clockText}>
                {timeSynced ? 'Real-time' : 'Device time (unverified)'} ·{' '}
                {serverNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {dateOptions.map((d, idx) => (
                <TouchableOpacity
                  key={d.iso}
                  style={[styles.dateChip, selectedDate === d.iso && styles.chipActive]}
                  onPress={() => setSelectedDate(d.iso)}
                >
                  <Text style={[styles.chipText, selectedDate === d.iso && styles.chipTextActive]}>
                    {idx === 0 ? 'Today' : d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.sectionLabel}>Time</Text>
            <View style={styles.chipRow}>
              {availableTimeSlots.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, selectedTime === t && styles.chipActive]}
                  onPress={() => setSelectedTime(t)}
                >
                  <Text style={[styles.chipText, selectedTime === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
              {availableTimeSlots.length === 0 && (
                <Text style={styles.noSlotsText}>No time slots are available today. Please choose another date.</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={promptConfirmBooking}
            >
              <Text style={styles.submitBtnText}>Confirm</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* FINAL "ARE YOU SURE?" CONFIRMATION BAGO MAG-SUBMIT SA DB */}
      <ConfirmModal
        visible={confirmBookingVisible}
        title="Confirm Booking?"
        message={`${selectedShop?.shop_name ?? ''} · ${vehicleType} · ${serviceType}${
          totalPrice !== null ? ` · ${formatPeso(totalPrice)}` : ''
        }${isGCashSelected ? '\n\nYou will be redirected to GCash to pay.' : ''}\n\nAre you sure you want to book this service?`}
        confirmLabel={payingViaGcash ? 'Opening GCash...' : 'Yes, Book Now'}
        onCancel={() => setConfirmBookingVisible(false)}
        onConfirm={handleBookingSubmit}
        loading={submitting || payingViaGcash}
      />

      <SuccessModal
        visible={successVisible}
        title="Booking Confirmed!"
        message="Your home service request has been submitted."
        onClose={() => setSuccessVisible(false)}
      />

      {/* NEW: MISSING INFO / PAYMENT ERROR / FAILED-TO-BOOK MODAL -- iisa
          na lang, consistent na Blue/White/Black design, ginagamit sa lahat
          ng dating Alert.alert() calls sa screen na 'to. */}
      <MessageModal
        visible={!!messageModal}
        variant={messageModal?.variant ?? 'warning'}
        title={messageModal?.title ?? ''}
        message={messageModal?.message ?? ''}
        onClose={() => setMessageModal(null)}
      />

      {/* TRANSACTION HISTORY RECEIPT MODAL */}
      <ReceiptModal
        visible={!!selectedReceipt}
        service={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: INK },
  headerSpacer: { width: 40 },
  tabScroll: { flexGrow: 0, marginBottom: 16 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, marginRight: 8 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: BRAND_BLUE },
  tabText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  activeTabText: { color: INK, fontWeight: '700' },
  listContainer: { flex: 1, paddingHorizontal: 16 },

  // ---------- Transaction history summary (Completed tab) ----------
  historySummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEEF1',
    padding: 16,
    marginBottom: 12,
  },
  historySummaryItem: { flex: 1, alignItems: 'center' },
  historySummaryDivider: { width: 1, backgroundColor: '#ECEEF1', marginHorizontal: 8 },
  historySummaryLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  historySummaryValue: { fontSize: 18, color: INK, fontWeight: '800' },
  historyHint: { fontSize: 12, color: '#9AA1AC', fontStyle: 'italic', marginBottom: 8, textAlign: 'center' },

  serviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  customerInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4EDFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerDetails: { justifyContent: 'center' },
  customerName: { color: INK, fontSize: 16, fontWeight: '600' },
  customerPhone: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  scheduledTime: { color: INK, fontSize: 14, fontWeight: '500' },
  cardBody: {},
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoTextContainer: { flex: 1 },
  infoText: { color: INK, fontSize: 14 },
  infoSubText: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: '#6B7280', fontSize: 16, marginTop: 12 },

  // ---------- NEW: inline "Pay with GCash" retry button on a booking card ----------
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: GCASH_BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  payNowBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ---------- BUTTONS: Blue / White / Black lang ----------
  addButton: {
    position: 'absolute',
    bottom: 30,
    left: 16,
    right: 16,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  formContainer: { flex: 1, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: INK, marginTop: 20, marginBottom: 10 },
  addressHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 4 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginTop: 10, marginBottom: 8 },
  errorBox: {
    backgroundColor: '#FDF4F4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    marginBottom: 8,
  },
  errorText: { color: '#B91C1C', fontSize: 12, marginBottom: 6 },
  retryText: { color: BRAND_BLUE, fontSize: 12, fontWeight: '700' },
  input: {
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: INK,
    borderWidth: 1,
    borderColor: '#ECEEF1',
    marginBottom: 10,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F4F5F7',
    borderWidth: 1,
    borderColor: '#ECEEF1',
    marginBottom: 8,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F4F5F7',
    borderWidth: 1,
    borderColor: '#ECEEF1',
    marginRight: 8,
  },
  chipActive: { backgroundColor: BRAND_BLUE, borderColor: BRAND_BLUE },
  // NEW: distinct active state for the GCash chip
  chipActiveGCash: { backgroundColor: GCASH_BLUE, borderColor: GCASH_BLUE },
  chipText: { fontSize: 13, fontWeight: '600', color: '#3A3F47' },
  chipTextActive: { color: '#fff' },
  paymentHint: { fontSize: 12, color: '#6B7280', marginTop: 2, fontStyle: 'italic' },

  // ---------- GCash explainer card (mirrors checkout.tsx styling) ----------
  gcashCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFE0FF',
    marginTop: 10,
  },
  gcashHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  gcashHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: GCASH_BLUE,
  },
  gcashHint: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
  },

  priceBox: {
    backgroundColor: '#EEF4FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D9FB',
    padding: 14,
    marginTop: 14,
  },
  priceSummaryTitle: { fontSize: 15, fontWeight: '800', color: INK, marginBottom: 12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel: { fontSize: 12, fontWeight: '600', color: '#1D4ED8' },
  priceRowValue: { fontSize: 13, fontWeight: '700', color: INK },
  priceDivider: { height: 1, backgroundColor: '#C7D9FB', marginVertical: 4 },
  priceTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  priceTotalLabel: { fontSize: 14, fontWeight: '800', color: INK },
  priceTotalValue: { fontSize: 20, fontWeight: '900', color: BRAND_BLUE },
  priceNote: { fontSize: 12, color: '#4B5563', marginTop: 4 },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECEEF1',
    marginBottom: 10,
    paddingLeft: 14,
  },
  dropdownFieldDisabled: { opacity: 0.6 },
  dropdownFieldMain: { flex: 1, paddingVertical: 13 },
  dropdownFieldText: { fontSize: 14, color: INK, fontWeight: '500' },
  dropdownPlaceholderText: { color: '#9AA1AC', fontWeight: '400' },
  dropdownIconBtn: { paddingHorizontal: 12, paddingVertical: 13 },
  dropdownOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  dropdownOverlayTouchable: { flex: 1 },
  dropdownSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight: '80%',
  },
  dropdownSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dropdownSheetTitle: { fontSize: 16, fontWeight: '700', color: INK },
  headerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F7F8FA',
  },
  headerCloseBtnText: { fontSize: 12.5, fontWeight: '700', color: INK },
  dropdownSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F4F5F7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ECEEF1',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dropdownSearchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: INK },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F8FA',
  },
  dropdownOptionText: { fontSize: 14, color: INK, flex: 1, marginRight: 8 },
  dropdownEmptyText: { textAlign: 'center', color: '#9AA1AC', fontSize: 13, paddingVertical: 24 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  clockText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  noSlotsText: { fontSize: 12, color: '#DC2626', fontStyle: 'italic', paddingVertical: 4 },
  submitBtn: {
    marginTop: 24,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ---------- CONFIRM / SUCCESS / RECEIPT MODALS (Blue / White / Black) ----------
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: INK,
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  confirmButtonRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnCancel: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: INK,
  },
  confirmBtnCancelText: { color: INK, fontSize: 14, fontWeight: '700' },
  confirmBtnConfirm: { backgroundColor: BRAND_BLUE },
  confirmBtnConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  successIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },

  // ---------- Receipt modal specifics ----------
  receiptCard: { maxWidth: 380 },
  receiptHeader: { alignItems: 'center', marginBottom: 12 },
  receiptIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  receiptBody: { maxHeight: 320, marginBottom: 16 },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  receiptLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', width: 110 },
  receiptValue: { fontSize: 13, color: INK, fontWeight: '600', flex: 1, textAlign: 'right' },
  // ---------- Status Timeline ----------
  timeline: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
  },
  timelineHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineRail: {
    width: 18,
    alignItems: 'center',
  },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    width: 2,
    flexGrow: 1,
    minHeight: 12,
    backgroundColor: '#E5E7EB',
    marginVertical: 2,
  },
  timelineText: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    paddingLeft: 10,
  },
  timelineLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: INK,
  },
  timelinePendingLabel: {
    color: '#9CA3AF',
    fontWeight: '600',
  },
  timelineTime: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  timelinePendingTime: {
    color: '#C3C8D0',
    fontWeight: '500',
  },

  receiptDivider: { height: 1, backgroundColor: '#ECEEF1', marginVertical: 8 },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECEEF1',
  },
  receiptTotalLabel: { fontSize: 14, color: INK, fontWeight: '800' },
  receiptTotalValue: { fontSize: 18, color: BRAND_BLUE, fontWeight: '800' },
});