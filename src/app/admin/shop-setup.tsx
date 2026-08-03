import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

interface GeoItem {
  code: string;
  name: string;
}

// Shape of the row as stored in Supabase
interface ShopProfileRow {
  id: number;
  shop_name: string;
  province: string;
  city: string;
  barangay: string;
  total_bays: number;
  owner_id: string | null;
}

// Shape of a row in the "bays" table
interface BayRow {
  bay_name: string;
  shop_id: number | null;
  occupied: boolean;
  reserved: boolean;
  created_at?: string;
}

type StatusModalType = 'success' | 'warning' | 'error';

interface StatusModalState {
  visible: boolean;
  type: StatusModalType;
  title: string;
  message: string;
}

const initialStatusModal: StatusModalState = {
  visible: false,
  type: 'success',
  title: '',
  message: '',
};

// ─────────────────────────────────────────
//  REUSABLE STATUS MODAL -- kapalit ng Alert.alert. Ginagamit para sa
//  success (na-save), warning (may kulang / partial success), at
//  error (nag-fail ang save) states. Sinusunod ang parehong yellow/
//  black theme ng Shop Setup screen (accent buttons #FACC15).
// ─────────────────────────────────────────
function StatusModal({ state, onClose }: { state: StatusModalState; onClose: () => void }) {
  const iconConfig: Record<StatusModalType, { icon: keyof typeof Ionicons.glyphMap; bg: string; color: string }> = {
    success: { icon: 'checkmark-circle', bg: '#FEF9C3', color: '#CA8A04' },
    warning: { icon: 'alert-circle', bg: '#FEF3C7', color: '#D97706' },
    error: { icon: 'close-circle', bg: '#FEE2E2', color: '#DC2626' },
  };

  const { icon, bg, color } = iconConfig[state.type];

  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.statusOverlay}>
        <View style={styles.statusCard}>
          <View style={[styles.statusIconWrap, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={30} color={color} />
          </View>
          <Text style={styles.statusTitle}>{state.title}</Text>
          <Text style={styles.statusMessage}>{state.message}</Text>
          <TouchableOpacity style={styles.statusOkButton} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.statusOkButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ShopSetupScreen() {
  // ---------- VIEW / EDIT MODE ----------
  // 'view'  = read-only, data populated, shows Edit button
  // 'edit'  = form is editable, shows Apply/Save button
  const [mode, setMode] = useState<'view' | 'edit'>('edit');

  // Current logged-in admin's user id (owner_id). Kailangan ito bago
  // tayo mag-fetch/mag-save ng kahit anong shop profile, dahil bawat
  // admin ay dapat may SARILI lang na shop record.
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Holds the row currently saved in the DB (null if none yet)
  const [savedProfile, setSavedProfile] = useState<ShopProfileRow | null>(null);
  const [isFetchingProfile, setIsFetchingProfile] = useState(true);

  const [shopName, setShopName] = useState('');
  const [totalBays, setTotalBays] = useState('4');

  const [selectedProvince, setSelectedProvince] = useState<GeoItem | null>(null);
  const [selectedCity, setSelectedCity] = useState<GeoItem | null>(null);
  const [selectedBarangay, setSelectedBarangay] = useState<GeoItem | null>(null);

  const [provinces, setProvinces] = useState<GeoItem[]>([]);
  const [cities, setCities] = useState<GeoItem[]>([]);
  const [barangays, setBarangays] = useState<GeoItem[]>([]);

  const [activeDropdown, setActiveDropdown] = useState<'province' | 'city' | 'barangay' | null>(null);
  const [isLoading, setIsLoading] = useState({ provinces: false, cities: false, barangays: false });
  const [isSaving, setIsSaving] = useState(false);

  // ---------- STATUS MODAL (success / warning / error) ----------
  const [statusModal, setStatusModal] = useState<StatusModalState>(initialStatusModal);

  const showStatus = (type: StatusModalType, title: string, message: string) => {
    setStatusModal({ visible: true, type, title, message });
  };

  const closeStatus = () => setStatusModal((s) => ({ ...s, visible: false }));

  // ---------- -1. Get the logged-in admin's session/user id first ----------
  useEffect(() => {
    const loadSession = async () => {
      setIsCheckingSession(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Walang naka-login -- huwag payagang gumawa/makakita ng shop.
        setIsCheckingSession(false);
        setIsFetchingProfile(false);
        showStatus('error', 'Not Logged In', 'Please log in as an admin to set up your shop.');
        return;
      }

      setOwnerId(session.user.id);
      setIsCheckingSession(false);
    };

    loadSession();
  }, []);

  // ---------- 0. Fetch existing saved profile for THIS admin only ----------
  useEffect(() => {
    if (isCheckingSession) return; // hintayin munang matapos mag-check ng session
    if (!ownerId) {
      setIsFetchingProfile(false);
      return;
    }

    const fetchExistingProfile = async () => {
      setIsFetchingProfile(true);
      try {
        const { data, error } = await supabase
          .from('shop_profile_setup')
          .select('id, shop_name, province, city, barangay, total_bays, owner_id')
          .eq('owner_id', ownerId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setSavedProfile(data as ShopProfileRow);
          setShopName(data.shop_name);
          setSelectedProvince({ code: '', name: data.province });
          setSelectedCity({ code: '', name: data.city });
          setSelectedBarangay({ code: '', name: data.barangay });
          setTotalBays(String(data.total_bays ?? '4'));
          setMode('view');
        } else {
          // Walang shop pa ang admin na ito -- panahon na para mag-setup.
          setSavedProfile(null);
          setShopName('');
          setSelectedProvince(null);
          setSelectedCity(null);
          setSelectedBarangay(null);
          setTotalBays('4');
          setMode('edit');
        }
      } catch (error) {
        console.error('Error fetching existing shop profile:', error);
      } finally {
        setIsFetchingProfile(false);
      }
    };

    fetchExistingProfile();
  }, [ownerId, isCheckingSession]);

  // ---------- 1. Fetch Provinces (only needed in edit mode) ----------
  useEffect(() => {
    if (mode !== 'edit') return;
    const fetchProvinces = async () => {
      setIsLoading(prev => ({ ...prev, provinces: true }));
      try {
        const response = await fetch('https://psgc.gitlab.io/api/provinces.json');
        const data = await response.json();
        const sorted = data.sort((a: GeoItem, b: GeoItem) => a.name.localeCompare(b.name));
        setProvinces(sorted);
      } catch (error) {
        console.error('Error fetching provinces:', error);
      } finally {
        setIsLoading(prev => ({ ...prev, provinces: false }));
      }
    };
    fetchProvinces();
  }, [mode]);

  // ---------- 2. Fetch Cities whenever Province changes ----------
  useEffect(() => {
    if (mode !== 'edit' || !selectedProvince || !selectedProvince.code) {
      return;
    }
    const fetchCities = async () => {
      setIsLoading(prev => ({ ...prev, cities: true }));
      try {
        const response = await fetch(`https://psgc.gitlab.io/api/provinces/${selectedProvince.code}/cities-municipalities.json`);
        const data = await response.json();
        const sorted = data.sort((a: GeoItem, b: GeoItem) => a.name.localeCompare(b.name));
        setCities(sorted);
      } catch (error) {
        console.error('Error fetching cities:', error);
      } finally {
        setIsLoading(prev => ({ ...prev, cities: false }));
      }
    };
    fetchCities();
  }, [selectedProvince, mode]);

  // ---------- 3. Fetch Barangays whenever City changes ----------
  useEffect(() => {
    if (mode !== 'edit' || !selectedCity || !selectedCity.code) {
      return;
    }
    const fetchBarangays = async () => {
      setIsLoading(prev => ({ ...prev, barangays: true }));
      try {
        const response = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${selectedCity.code}/barangays.json`);
        const data = await response.json();
        const sorted = data.sort((a: GeoItem, b: GeoItem) => a.name.localeCompare(b.name));
        setBarangays(sorted);
      } catch (error) {
        console.error('Error fetching barangays:', error);
      } finally {
        setIsLoading(prev => ({ ...prev, barangays: false }));
      }
    };
    fetchBarangays();
  }, [selectedCity, mode]);

  // ─────────────────────────────────────────────────────────────
  //  BAY AUTO-SYNC
  //
  //  "bays" table ay HIWALAY sa "shop_profile_setup" -- ang total_bays
  //  column dun ay isang bilang lang, hindi kusang gumagawa ng bay
  //  rows. Kaya dito, tuwing mag-Apply/Save si Admin ng shop profile,
  //  ise-sync natin ang bilang ng ACTUAL na bay rows sa "bays" table
  //  para tumugma sa binigay na total_bays:
  //
  //   - Kung tumaas ang bilang -> mag-INSERT ng bagong bay rows.
  //   - Kung bumaba ang bilang -> mag-DELETE ng extra bays, PERO
  //     hindi galawin ang mga bay na "occupied" o "reserved" (may
  //     aktwal o naka-book na kotse). Kung hindi kasya ang bilang ng
  //     "safe to remove" na bays sa kailangang tanggalin, i-block ang
  //     buong operation at sabihin kay Admin kung ilan ang naka-block.
  //
  //  FIX #1 (deletion order): laging kinukuha muna ang bays na
  //  PINAKABAGONG NA-CREATE (created_at DESC) bago tanggalin -- ibig
  //  sabihin, "last in, first out": ang mga huling idinagdag na bay ang
  //  unang matatanggal kapag binawasan ang total_bays, hindi ang mga
  //  orihinal.
  //
  //  FIX #2 (naming): gumagamit na ng simpleng "Bay N" na pattern
  //  (dati'y "Shop{shopId}-Bay-{n}"), dahil ito ang inaasahang display
  //  name sa New Walk-in screen ("Bay 1", "Bay 2", hindi "Shop1-Bay-1").
  //
  //  FIX #3 (global uniqueness): "bay_name" ang PRIMARY KEY ng "bays"
  //  table (globally unique sa BUONG table, hindi lang per-shop) kahit
  //  may unique(shop_id, bay_name) pang constraint. Kaya bago mag-insert
  //  ng "Bay N", kino-check muna natin kung ginagamit na ito ng IBANG
  //  shop, para maiwasan ang primary-key violation.
  //
  //  IMPORTANT: Kung nakakakuha ka ng error na
  //  "new row violates row-level security policy for table bays",
  //  hindi ito bug dito sa code -- kulang ng RLS POLICY ang "bays"
  //  table sa Supabase. Patakbuhin ang fix-bays-rls.sql sa Supabase
  //  SQL Editor para payagan ang insert/update/delete dito.
  // ─────────────────────────────────────────────────────────────
  const syncBaysForShop = async (shopId: number, newTotalBays: number) => {
    const { data: existingBaysData, error: fetchError } = await supabase
      .from('bays')
      .select('bay_name, shop_id, occupied, reserved, created_at')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false }); // newest first

    if (fetchError) throw fetchError;

    const existingBays = (existingBaysData as BayRow[]) ?? [];
    const currentCount = existingBays.length;

    if (newTotalBays === currentCount) {
      return { added: 0, removed: 0 };
    }

    if (newTotalBays > currentCount) {
      // ---- ADD missing bays ----
      const existingNames = new Set(existingBays.map((b) => b.bay_name));
      const rowsToInsert: { bay_name: string; shop_id: number; occupied: boolean; reserved: boolean }[] = [];
      let n = 1;
      const bayCountNeeded = newTotalBays - currentCount;
      let guard = 0;

      while (rowsToInsert.length < bayCountNeeded && guard < bayCountNeeded + 200) {
        guard++;
        const candidateName = `Bay ${n}`;
        n++;

        if (existingNames.has(candidateName)) continue;

        // Check the WHOLE table (not just this shop) since bay_name is
        // the global primary key.
        const { data: clash } = await supabase
          .from('bays')
          .select('bay_name')
          .eq('bay_name', candidateName)
          .maybeSingle();

        if (clash) continue;

        rowsToInsert.push({
          bay_name: candidateName,
          shop_id: shopId,
          occupied: false,
          reserved: false,
        });
        existingNames.add(candidateName);
      }

      if (rowsToInsert.length < bayCountNeeded) {
        throw new Error(
          `Hindi nakagawa ng sapat na bagong bay names ("Bay N"). Maaaring naka-conflict sa ibang shop. Suriin ang "bays" table sa Supabase.`
        );
      }

      const { error: insertError } = await supabase.from('bays').insert(rowsToInsert);
      if (insertError) {
        // Give a clearer hint specifically for the RLS case.
        if (insertError.message?.toLowerCase().includes('row-level security')) {
          throw new Error(
            'Naka-block ng Row Level Security ang pag-add ng bays sa Supabase. Patakbuhin muna ang fix-bays-rls.sql (o gumawa ng INSERT policy) sa "bays" table sa Supabase Dashboard.'
          );
        }
        throw insertError;
      }

      return { added: rowsToInsert.length, removed: 0 };
    }

    // ---- REMOVE excess bays ----
    const removeCount = currentCount - newTotalBays;

    // Prioritize removing bays that are free (not occupied, not reserved)
    // so we never delete a bay that's currently in use by a customer.
    // Dahil "newest first" na ang pagkaka-order ng existingBays (created_at
    // DESC), ang unang matatanggal ay ang mga PINAKABAGONG idinagdag na
    // bay -- hindi ang mga orihinal na bay ng shop.
    const removableBays = existingBays.filter((b) => !b.occupied && !b.reserved);

    if (removableBays.length < removeCount) {
      const blockedCount = removeCount - removableBays.length;
      throw new Error(
        `Hindi maaaring bawasan sa ${newTotalBays} bays ngayon. May ${blockedCount} bay(s) na kasalukuyang occupied o reserved. Hintayin munang ma-free ang mga ito bago bawasan ang total bays.`
      );
    }

    const bayNamesToRemove = removableBays.slice(0, removeCount).map((b) => b.bay_name);

    const { error: deleteError } = await supabase
      .from('bays')
      .delete()
      .eq('shop_id', shopId)
      .in('bay_name', bayNamesToRemove);

    if (deleteError) {
      if (deleteError.message?.toLowerCase().includes('row-level security')) {
        throw new Error(
          'Naka-block ng Row Level Security ang pag-remove ng bays sa Supabase. Patakbuhin muna ang fix-bays-rls.sql (o gumawa ng DELETE policy) sa "bays" table sa Supabase Dashboard.'
        );
      }
      throw deleteError;
    }

    return { added: 0, removed: bayNamesToRemove.length };
  };

  const handleSaveSetup = async () => {
    if (!ownerId) {
      showStatus('error', 'Not Logged In', 'Please log in as an admin to set up your shop.');
      return;
    }

    if (!shopName.trim() || !selectedProvince || !selectedCity || !selectedBarangay) {
      showStatus('warning', 'Missing Information', 'Please complete the physical shop profile address (Province, City, and Barangay).');
      return;
    }

    const parsedBays = parseInt(totalBays, 10);
    if (!totalBays.trim() || isNaN(parsedBays) || parsedBays <= 0) {
      showStatus('warning', 'Missing Information', 'Please enter a valid number of wash bays (at least 1).');
      return;
    }

    const fullAddress = `${selectedBarangay.name}, ${selectedCity.name}, ${selectedProvince.name}`;

    setIsSaving(true);
    try {
      const payload = {
        shop_name: shopName.trim(),
        province: selectedProvince.name,
        city: selectedCity.name,
        barangay: selectedBarangay.name,
        total_bays: parsedBays,
        owner_id: ownerId,
      };

      let savedRow: ShopProfileRow | null = null;

      if (savedProfile?.id) {
        // Already has a record -> UPDATE instead of inserting a new one.
        // Naka-scope pa rin sa owner_id bilang extra safety net kasabay
        // ng RLS policy sa Supabase.
        const { data, error } = await supabase
          .from('shop_profile_setup')
          .update(payload)
          .eq('id', savedProfile.id)
          .eq('owner_id', ownerId)
          .select('id, shop_name, province, city, barangay, total_bays, owner_id')
          .single();

        if (error) throw error;
        savedRow = data as ShopProfileRow;
      } else {
        // No record yet -> INSERT new one, naka-link sa owner_id ng
        // kasalukuyang admin na naka-login.
        const { data, error } = await supabase
          .from('shop_profile_setup')
          .insert(payload)
          .select('id, shop_name, province, city, barangay, total_bays, owner_id')
          .single();

        if (error) throw error;
        savedRow = data as ShopProfileRow;
      }

      // ---- Sync the "bays" table to match the newly saved total_bays ----
      // Ginagawa ito PAGKATAPOS ma-save ang profile dahil kailangan
      // natin ang totoong "id" (shop_id) mula sa savedRow, lalo na
      // kapag bagong INSERT ito (wala pang id noon).
      let bayWarning: string | null = null;
      if (savedRow?.id) {
        try {
          await syncBaysForShop(savedRow.id, parsedBays);
        } catch (bayErr: any) {
          // Hindi natin i-re-revert ang profile save (naka-save na ang
          // shop info), pero babalaan si Admin na hindi na-sync ang
          // bilang ng bays.
          bayWarning = bayErr?.message ?? 'Could not sync the bays table with the new total bays.';
        }
      }

      setSavedProfile(savedRow);
      setTotalBays(String(savedRow?.total_bays ?? parsedBays));
      setMode('view'); // lock the form, show populated read-only view

      if (bayWarning) {
        showStatus('warning', 'Profile Saved, May Warning', bayWarning);
      } else {
        showStatus(
          'success',
          'Profile Setup Deployed!',
          `Shop Name: ${shopName}\nLocation: ${fullAddress}\nTotal Bays: ${parsedBays}\n\nBays table has been synced.`
        );
      }
    } catch (err: any) {
      console.error('Error saving shop profile:', err);
      showStatus('error', 'Save Failed', err?.message ?? 'Something went wrong while saving your shop profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditPress = () => {
    setActiveDropdown(null);
    setMode('edit');
  };

  if (isCheckingSession || isFetchingProfile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#FACC15" />
      </View>
    );
  }

  const isViewMode = mode === 'view';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER NAVIGATION */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={22} color="#111827" />
            </TouchableOpacity>
            <View style={styles.headerTextFlex}>
              <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>Shop Profile Setup</Text>
              <Text style={styles.headerSubtitle}>
                {isViewMode ? 'Saved profile · tap Edit to make changes' : 'Configure verified localized rules & branch states'}
              </Text>
            </View>

            {isViewMode && (
              <TouchableOpacity style={styles.editIconButton} onPress={handleEditPress}>
                <Ionicons name="create-outline" size={20} color="#0F172A" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color="#1E3A5F" style={styles.infoIconSpacing} />
            <Text style={styles.infoText}>
              {isViewMode
                ? 'This shop profile is currently active. Tap Edit to update the registered name, bay count, or branch address.'
                : 'This is YOUR shop profile as the business owner/admin. Cascading address deployment guarantees correct customer mapping metrics within the live dashboard engine. Changing Total Wash Bays will automatically add or remove bay records.'}
            </Text>
          </View>

          {/* FORM MAIN CARD */}
          <View style={styles.formCard}>
            {/* SHOP NAME */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Shop Registered Name</Text>
              {isViewMode ? (
                <View style={styles.readOnlyField}>
                  <Ionicons name="business-outline" size={18} color="#64748B" style={styles.inputIcon} />
                  <Text style={styles.readOnlyText}>{shopName || '—'}</Text>
                </View>
              ) : (
                <View style={styles.editableInputWrapper}>
                  <Ionicons name="business-outline" size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputField}
                    value={shopName}
                    onChangeText={setShopName}
                    placeholder="Enter shop name"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              )}
            </View>

            {/* TOTAL BAYS */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Total Wash Bays</Text>
              {isViewMode ? (
                <View style={styles.readOnlyField}>
                  <Ionicons name="car-outline" size={18} color="#64748B" style={styles.inputIcon} />
                  <Text style={styles.readOnlyText}>{totalBays || '—'}</Text>
                </View>
              ) : (
                <View style={styles.editableInputWrapper}>
                  <Ionicons name="car-outline" size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputField}
                    value={totalBays}
                    onChangeText={(text) => setTotalBays(text.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 4"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
              )}
            </View>

            <Text style={styles.sectionDividerTitle}>Branch Operations Location</Text>

            {/* PROVINCE */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Province</Text>
              {isViewMode ? (
                <View style={styles.readOnlyField}>
                  <Ionicons name="map-outline" size={18} color="#64748B" />
                  <Text style={[styles.readOnlyText, { marginLeft: 8 }]}>
                    {selectedProvince ? selectedProvince.name : '—'}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.dropdownSelector}
                  onPress={() => setActiveDropdown(activeDropdown === 'province' ? null : 'province')}
                >
                  <View style={styles.selectorLeftWrapper}>
                    <Ionicons name="map-outline" size={18} color="#64748B" />
                    <Text style={styles.selectorText} numberOfLines={1}>
                      {selectedProvince ? selectedProvince.name : 'Select Province'}
                    </Text>
                  </View>
                  {isLoading.provinces ? <ActivityIndicator size="small" color="#FACC15" /> : <Ionicons name="chevron-down" size={16} color="#64748B" />}
                </TouchableOpacity>
              )}
            </View>

            {/* CITY */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>City / Municipality</Text>
              {isViewMode ? (
                <View style={styles.readOnlyField}>
                  <Ionicons name="location-outline" size={18} color="#64748B" />
                  <Text style={[styles.readOnlyText, { marginLeft: 8 }]}>
                    {selectedCity ? selectedCity.name : '—'}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.dropdownSelector, !selectedProvince && styles.disabledSelector]}
                  disabled={!selectedProvince}
                  onPress={() => setActiveDropdown(activeDropdown === 'city' ? null : 'city')}
                >
                  <View style={styles.selectorLeftWrapper}>
                    <Ionicons name="location-outline" size={18} color="#64748B" />
                    <Text style={styles.selectorText} numberOfLines={1}>
                      {selectedCity ? selectedCity.name : 'Select City/Municipality'}
                    </Text>
                  </View>
                  {isLoading.cities ? <ActivityIndicator size="small" color="#FACC15" /> : <Ionicons name="chevron-down" size={16} color="#64748B" />}
                </TouchableOpacity>
              )}
            </View>

            {/* BARANGAY */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Barangay</Text>
              {isViewMode ? (
                <View style={styles.readOnlyField}>
                  <Ionicons name="pin-outline" size={18} color="#64748B" />
                  <Text style={[styles.readOnlyText, { marginLeft: 8 }]}>
                    {selectedBarangay ? selectedBarangay.name : '—'}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.dropdownSelector, !selectedCity && styles.disabledSelector]}
                  disabled={!selectedCity}
                  onPress={() => setActiveDropdown(activeDropdown === 'barangay' ? null : 'barangay')}
                >
                  <View style={styles.selectorLeftWrapper}>
                    <Ionicons name="pin-outline" size={18} color="#64748B" />
                    <Text style={styles.selectorText} numberOfLines={1}>
                      {selectedBarangay ? selectedBarangay.name : 'Select Barangay'}
                    </Text>
                  </View>
                  {isLoading.barangays ? <ActivityIndicator size="small" color="#FACC15" /> : <Ionicons name="chevron-down" size={16} color="#64748B" />}
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.hintTitle}>System Rules Based on Setup:</Text>
            <View style={styles.hintItem}>
              <View style={[styles.bulletPoint, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.hintText}>
                Washing operational threshold capacity state is currently assigned to lock access at <Text style={{ fontWeight: '700' }}>{totalBays || '0'}</Text> active tracking bays.
              </Text>
            </View>

            <View style={styles.hintItem}>
              <View style={[styles.bulletPoint, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.hintText}>
                Customer search indexing localization tag will register target operations within <Text style={{ fontWeight: '700', color: '#1E3A5F' }}>{selectedCity ? selectedCity.name : 'Selected Location'}</Text>.
              </Text>
            </View>
          </View>

          {/* ACTION BUTTON: Apply (edit mode) vs Edit (view mode) */}
          {isViewMode ? (
            <TouchableOpacity style={styles.saveButton} onPress={handleEditPress}>
              <Ionicons name="create-outline" size={22} color="#0F172A" />
              <Text style={styles.saveButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
              onPress={handleSaveSetup}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <Ionicons name="checkmark-done-circle-outline" size={22} color="#0F172A" />
              )}
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Apply'}</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {mode === 'edit' && activeDropdown === 'province' && provinces.length > 0 && (
          <View style={[styles.floatingDropdownCard, { top: Platform.OS === 'ios' ? 368 : 348 }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {provinces.map((item) => (
                <TouchableOpacity
                  key={item.code}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setSelectedProvince(item);
                    setSelectedCity(null);
                    setSelectedBarangay(null);
                    setActiveDropdown('city');
                  }}
                >
                  <Text style={styles.dropdownOptionText}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {mode === 'edit' && activeDropdown === 'city' && cities.length > 0 && (
          <View style={[styles.floatingDropdownCard, { top: Platform.OS === 'ios' ? 450 : 430 }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {cities.map((item) => (
                <TouchableOpacity
                  key={item.code}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setSelectedCity(item);
                    setSelectedBarangay(null);
                    setActiveDropdown('barangay');
                  }}
                >
                  <Text style={styles.dropdownOptionText}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {mode === 'edit' && activeDropdown === 'barangay' && barangays.length > 0 && (
          <View style={[styles.floatingDropdownCard, { top: Platform.OS === 'ios' ? 532 : 512 }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {barangays.map((item) => (
                <TouchableOpacity
                  key={item.code}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setSelectedBarangay(item);
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={styles.dropdownOptionText}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <StatusModal state={statusModal} onClose={closeStatus} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: '4%',
  },
  header: {
    marginTop: Platform.OS === 'ios' ? 60 : 40,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  headerTextFlex: {
    flex: 1,
    marginLeft: 12,
  },
  backButton: {
    backgroundColor: '#E2E8F0',
    padding: 10,
    borderRadius: 10,
  },
  editIconButton: {
    backgroundColor: '#FACC15',
    padding: 10,
    borderRadius: 10,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  infoBox: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: '4%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  infoIconSpacing: {
    marginRight: 10,
  },
  infoText: {
    color: '#1E3A5F',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: '5%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    width: '100%',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  editableInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    width: '100%',
  },
  readOnlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    width: '100%',
  },
  readOnlyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    height: '100%',
  },
  sectionDividerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 12,
  },
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    width: '100%',
  },
  selectorLeftWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  disabledSelector: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.6,
  },
  selectorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginLeft: 8,
  },

  floatingDropdownCard: {
    position: 'absolute',
    left: '9%',
    right: '9%',
    maxHeight: 210,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 9999,
  },
  dropdownOption: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  hintTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginTop: 16,
    marginBottom: 10,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  hintText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
    lineHeight: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FACC15',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    width: '100%',
    marginBottom: 20,
  },
  saveButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 15,
  },

  // ===== STATUS MODAL (success / warning / error) =====
  statusOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  statusCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  statusIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  statusOkButton: {
    backgroundColor: '#FACC15',
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOkButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
});