import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
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

// ---------- SHARED BRAND COLORS (Blue / White / Black lang) ----------
const BRAND_BLUE = '#2563EB';
const INK = '#111827';
// NEW: GCash brand accent, used only for the GCash payment card/chip
const GCASH_BLUE = '#007DFE';
// NEW: colors reserved for the in-app MessageModal (warning/error states)
const WARNING_AMBER = '#F59E0B';
const ERROR_RED = '#EF4444';

// Dinagdagan pa ang listahan ng vehicle types
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

// NEW: Idinagdag ang GCash bilang online payment option kasama ng
// Cash on Hand. Kung magdaragdag pa ng ibang method (hal. Maya) sa
// hinaharap, dito na lang idadagdag sa listahan.
const PAYMENT_METHODS = ['Cash on Hand', 'GCash'];

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

function buildDateOptions(base: Date) {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = d.toISOString().split('T')[0];
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
    case 'Waiting': return '#F59E0B';
    case 'On the Way': return '#8B5CF6';
    case 'Washing': return BRAND_BLUE;
    case 'Completed': return '#22C55E';
    default: return '#64748B';
  }
};

const getPaymentStatusColor = (status: string | null) => {
  switch (status) {
    case 'Paid': return '#22C55E';
    case 'Unpaid': return '#F59E0B';
    default: return '#64748B';
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
    { label: 'Payment Method', value: service.payment_method || 'Cash on Hand' },
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
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openDropdown} style={styles.dropdownIconBtn} disabled={disabled || loading}>
            {loading ? (
              <ActivityIndicator size="small" color={BRAND_BLUE} />
            ) : (
              <Ionicons name="chevron-down" size={18} color="#64748B" />
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
              <TouchableOpacity onPress={() => setVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={INK} />
              </TouchableOpacity>
            </View>

            <View style={styles.dropdownSearchBox}>
              <Ionicons name="search" size={16} color="#94A3B8" />
              <TextInput
                style={styles.dropdownSearchInput}
                placeholder="Maghanap..."
                placeholderTextColor="#94A3B8"
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
  const isOversizeVanNote = vehicleType === 'Van' && serviceType === 'Basic Wash';
  const isGCashSelected = paymentMethod === 'GCash';

  const fetchServices = async (uid: string) => {
    const { data, error } = await supabase
      .from('home_service')
      .select(
        'id, shop_id, shop_name, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_method, payment_status, price, paymongo_source_id, paymongo_payment_id'
      )
      .eq('user_id', uid)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('Error fetching home service bookings:', error);
    } else {
      setServices((data as HomeServiceRow[]) ?? []);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = () => {
    if (!userId) return;
    setRefreshing(true);
    fetchServices(userId);
  };

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

    if (isGCashSelected && estimatedPrice === null) {
      return showMessage(
        'GCash Unavailable',
        'Walang fixed price ang kombinasyong ito, kaya hindi pa puwedeng GCash. Piliin muna ang Cash on Hand, o pumili ng ibang vehicle/service type.'
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
  const startGcashCheckout = async (bookingId: number, amount: number) => {
    setPayingViaGcash(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-gcash-source', {
        body: { bookingId, amount },
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
        showMessage(
          'Payment Error',
          'Hindi ma-start ang GCash payment. Naka-book pa rin ang service mo, puwede kang magbayad sa staff sa halip.',
          'error'
        );
        return;
      }

      const redirectUrl = Linking.createURL('payment-return', {
        queryParams: { bookingId: String(bookingId) },
      });
      await WebBrowser.openAuthSessionAsync(data.checkoutUrl, redirectUrl);
    } catch (e) {
      console.log('[PayMongo] gcash checkout error:', e);
      showMessage(
        'Payment Error',
        'May problema sa pagbukas ng GCash. Naka-book pa rin ang service mo, puwede kang magbayad sa staff sa halip.',
        'error'
      );
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
        price: estimatedPrice,
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
    if (isGCashSelected && estimatedPrice != null) {
      await startGcashCheckout(inserted.id, estimatedPrice);
    }

    setSubmitting(false);
    setConfirmBookingVisible(false);

    setBookingVisible(false);
    resetForm();
    setActiveTab('Upcoming');
    if (userId) fetchServices(userId);
    setSuccessVisible(true);
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
                    <Ionicons name="location-outline" size={16} color="#64748B" />
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoText}>{service.address}</Text>
                    </View>
                  </View>

                  <View style={styles.vehicleRow}>
                    <View style={styles.infoRow}>
                      <Ionicons name="car-outline" size={16} color="#64748B" />
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
                        color="#64748B"
                      />
                      <Text style={styles.infoText}>
                        {service.payment_method || 'Cash on Hand'}
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
                <Ionicons name="car-outline" size={48} color="#64748B" />
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
              placeholderTextColor="#94A3B8"
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
                  Hindi ma-load ang PSGC address data. I-check ang internet connection.
                </Text>
                <TouchableOpacity onPress={fetchAddressReferenceData}>
                  <Text style={styles.retryText}>Subukan ulit</Text>
                </TouchableOpacity>
              </View>
            )}

            {!addressDataError && (
              <>
                <PsgcDropdown
                  label="Region"
                  placeholder="Piliin ang rehiyon"
                  value={selectedRegion}
                  options={regions}
                  onSelect={onSelectRegion}
                  loading={loadingAddressData}
                />

                {selectedRegion && !isNCR(selectedRegion) && provincesInRegion.length > 0 && (
                  <PsgcDropdown
                    label="Province "
                    placeholder="Piliin ang probinsya"
                    value={selectedProvince}
                    options={provincesInRegion}
                    onSelect={onSelectProvince}
                    onClear={onClearProvince}
                  />
                )}

                {selectedRegion && (
                  <PsgcDropdown
                    label="City / Municipality"
                    placeholder="Piliin ang lungsod/munisipyo"
                    value={selectedCity}
                    options={cityOptions}
                    onSelect={onSelectCity}
                  />
                )}

                {selectedCity && (
                  <PsgcDropdown
                    label="Barangay"
                    placeholder="Piliin ang barangay"
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
              placeholder="hal. Blk 5 Lot 12, malapit sa Purok 3 Chapel"
              placeholderTextColor="#94A3B8"
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
                {estimatedPrice !== null ? (
                  <>
                    <Text style={styles.priceLabel}>Estimated Price</Text>
                    <Text style={styles.priceValue}>{formatPeso(estimatedPrice)}</Text>
                    {isOversizeVanNote && (
                      <Text style={styles.priceNote}>
                        Puwedeng tumaas ang bayad (hanggang ₱300–₱350) kung malaki/oversize ang van.
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.priceNote}>
                   There is no set fixed price for {vehicleType} + {serviceType}. Shop staff will just ask for the exact price.
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
                    color={paymentMethod === p ? '#fff' : '#334155'}
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
                  After you confirm the booking, you'll be taken straight to GCash to authorize the
                  payment{estimatedPrice !== null ? ` of ${formatPeso(estimatedPrice)}` : ''}. Your
                  booking's payment status updates automatically once GCash confirms it.
                </Text>
                {estimatedPrice === null && (
                  <Text style={[styles.gcashHint, { color: '#B91C1C', marginTop: 6 }]}>
                    Note: GCash needs a fixed price up front, so it's unavailable for this vehicle/service
                    combo until staff assesses the price. Use Cash on Hand instead.
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.paymentHint}>
                Babayaran mo ito directly sa staff pagdating o pagkatapos ng home service.
              </Text>
            )}

            {/* ---------- REAL-TIME DATE & TIME (via Time API) ---------- */}
            <View style={styles.clockRow}>
              <Ionicons name="time-outline" size={14} color={timeSynced ? '#16A34A' : '#F59E0B'} />
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
                <Text style={styles.noSlotsText}>Wala nang available na oras ngayong araw. Pumili ng ibang date.</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={promptConfirmBooking}
            >
              <Text style={styles.submitBtnText}>Confirm Booking</Text>
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
          estimatedPrice !== null ? ` · ${formatPeso(estimatedPrice)}` : ''
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
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
  tabText: { color: '#64748B', fontSize: 14, fontWeight: '500' },
  activeTabText: { color: INK, fontWeight: '700' },
  listContainer: { flex: 1, paddingHorizontal: 16 },

  // ---------- Transaction history summary (Completed tab) ----------
  historySummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
  },
  historySummaryItem: { flex: 1, alignItems: 'center' },
  historySummaryDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 8 },
  historySummaryLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  historySummaryValue: { fontSize: 18, color: INK, fontWeight: '800' },
  historyHint: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginBottom: 8, textAlign: 'center' },

  serviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  customerInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerDetails: { justifyContent: 'center' },
  customerName: { color: INK, fontSize: 16, fontWeight: '600' },
  customerPhone: { color: '#64748B', fontSize: 12, marginTop: 2 },
  scheduledTime: { color: INK, fontSize: 14, fontWeight: '500' },
  cardBody: {},
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoTextContainer: { flex: 1 },
  infoText: { color: INK, fontSize: 14 },
  infoSubText: { color: '#64748B', fontSize: 12, marginTop: 2 },
  vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: '#64748B', fontSize: 16, marginTop: 12 },

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
  subLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 10, marginBottom: 8 },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    marginBottom: 8,
  },
  errorText: { color: '#B91C1C', fontSize: 12, marginBottom: 6 },
  retryText: { color: BRAND_BLUE, fontSize: 12, fontWeight: '700' },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: INK,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  chipActive: { backgroundColor: BRAND_BLUE, borderColor: BRAND_BLUE },
  // NEW: distinct active state for the GCash chip
  chipActiveGCash: { backgroundColor: GCASH_BLUE, borderColor: GCASH_BLUE },
  chipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  chipTextActive: { color: '#fff' },
  paymentHint: { fontSize: 12, color: '#64748B', marginTop: 2, fontStyle: 'italic' },

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
    color: '#475569',
    lineHeight: 17,
  },

  priceBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 14,
    marginTop: 14,
  },
  priceLabel: { fontSize: 12, fontWeight: '600', color: '#1D4ED8' },
  priceValue: { fontSize: 22, fontWeight: '800', color: '#1D4ED8', marginTop: 2 },
  priceNote: { fontSize: 12, color: '#475569', marginTop: 4 },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    paddingLeft: 14,
  },
  dropdownFieldDisabled: { opacity: 0.6 },
  dropdownFieldMain: { flex: 1, paddingVertical: 13 },
  dropdownFieldText: { fontSize: 14, color: INK, fontWeight: '500' },
  dropdownPlaceholderText: { color: '#94A3B8', fontWeight: '400' },
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
  dropdownSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    borderBottomColor: '#F1F5F9',
  },
  dropdownOptionText: { fontSize: 14, color: INK, flex: 1, marginRight: 8 },
  dropdownEmptyText: { textAlign: 'center', color: '#94A3B8', fontSize: 13, paddingVertical: 24 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  clockText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  noSlotsText: { fontSize: 12, color: '#EF4444', fontStyle: 'italic', paddingVertical: 4 },
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
  receiptLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', width: 110 },
  receiptValue: { fontSize: 13, color: INK, fontWeight: '600', flex: 1, textAlign: 'right' },
  receiptDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  receiptTotalLabel: { fontSize: 14, color: INK, fontWeight: '800' },
  receiptTotalValue: { fontSize: 18, color: BRAND_BLUE, fontWeight: '800' },
});