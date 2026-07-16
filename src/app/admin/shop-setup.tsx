import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
}

export default function ShopSetupScreen() {
  // ---------- VIEW / EDIT MODE ----------
  // 'view'  = read-only, data populated, shows Edit button
  // 'edit'  = form is editable, shows Apply/Save button
  const [mode, setMode] = useState<'view' | 'edit'>('edit');

  // Holds the row currently saved in the DB (null if none yet)
  const [savedProfile, setSavedProfile] = useState<ShopProfileRow | null>(null);
  const [isFetchingProfile, setIsFetchingProfile] = useState(true);

  const [shopName, setShopName] = useState('I-CarWash Main Branch');
  const [totalBays, setTotalBays] = useState('4');

  const [selectedProvince, setSelectedProvince] = useState<GeoItem | null>({ code: '041000000', name: 'Batangas' });
  const [selectedCity, setSelectedCity] = useState<GeoItem | null>({ code: '041014000', name: 'Lipa City' });
  const [selectedBarangay, setSelectedBarangay] = useState<GeoItem | null>(null);

  const [provinces, setProvinces] = useState<GeoItem[]>([]);
  const [cities, setCities] = useState<GeoItem[]>([]);
  const [barangays, setBarangays] = useState<GeoItem[]>([]);

  const [activeDropdown, setActiveDropdown] = useState<'province' | 'city' | 'barangay' | null>(null);
  const [isLoading, setIsLoading] = useState({ provinces: false, cities: false, barangays: false });
  const [isSaving, setIsSaving] = useState(false);

  // ---------- 0. Fetch existing saved profile on mount ----------
  useEffect(() => {
    const fetchExistingProfile = async () => {
      setIsFetchingProfile(true);
      try {
        const { data, error } = await supabase
          .from('shop_profile_setup')
          .select('id, shop_name, province, city, barangay')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setSavedProfile(data as ShopProfileRow);
          setShopName(data.shop_name);
          setSelectedProvince({ code: '', name: data.province });
          setSelectedCity({ code: '', name: data.city });
          setSelectedBarangay({ code: '', name: data.barangay });
          setMode('view'); 
        } else {
          setMode('edit');
        }
      } catch (error) {
        console.error('Error fetching existing shop profile:', error);
      } finally {
        setIsFetchingProfile(false);
      }
    };

    fetchExistingProfile();
  }, []);

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

  const handleSaveSetup = async () => {
    if (!shopName.trim() || !selectedProvince || !selectedCity || !selectedBarangay) {
      Alert.alert('Missing Information', 'Please complete the physical shop profile address (Province, City, and Barangay).');
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
      };

      let savedRow: ShopProfileRow | null = null;

      if (savedProfile?.id) {
        // Already has a record -> UPDATE instead of inserting a new one
        const { data, error } = await supabase
          .from('shop_profile_setup')
          .update(payload)
          .eq('id', savedProfile.id)
          .select('id, shop_name, province, city, barangay')
          .single();

        if (error) throw error;
        savedRow = data as ShopProfileRow;
      } else {
        // No record yet -> INSERT new one
        const { data, error } = await supabase
          .from('shop_profile_setup')
          .insert(payload)
          .select('id, shop_name, province, city, barangay')
          .single();

        if (error) throw error;
        savedRow = data as ShopProfileRow;
      }

      setSavedProfile(savedRow);
      setMode('view'); // lock the form, show populated read-only view

      Alert.alert(
        'Profile Setup Deployed! 🎉',
        `Shop Name: ${shopName}\nLocation: ${fullAddress}`
      );
    } catch (err: any) {
      console.error('Error saving shop profile:', err);
      Alert.alert('Save Failed', err?.message ?? 'Something went wrong while saving your shop profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditPress = () => {
    setActiveDropdown(null);
    setMode('edit');
  };

  if (isFetchingProfile) {
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
                ? 'This shop profile is currently active. Tap Edit to update the registered name or branch address.'
                : 'Cascading address deployment guarantees correct customer mapping metrics within the live dashboard engine.'}
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
});