import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// ---------- THEME ----------
const NAVY = '#0F172A';
const BLUE = '#2563EB';
const BLUE_TINT = '#EFF6FF';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';
const GRAY_LIGHT = '#E2E8F0';
const BG = '#F8FAFC';
const DANGER = '#EF4444';

// Preset icons/colors lang ang pwedeng piliin ni Admin, para safe
// laging valid na Ionicons name at readable na kulay.
const ICON_OPTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'water-outline', label: 'Water' },
  { icon: 'sparkles-outline', label: 'Sparkles' },
  { icon: 'diamond-outline', label: 'Diamond' },
  { icon: 'car-outline', label: 'Car' },
  { icon: 'brush-outline', label: 'Brush' },
  { icon: 'shield-checkmark-outline', label: 'Shield' },
  { icon: 'leaf-outline', label: 'Leaf' },
  { icon: 'flash-outline', label: 'Flash' },
];

const COLOR_OPTIONS: string[] = [
  '#2563EB', // Blue
  '#D97706', // Gold
  '#10B981', // Green
  '#7C3AED', // Purple
  '#EF4444', // Red
  '#0891B2', // Teal
];

interface ServicePackageRow {
  id: number;
  shop_id: number;
  label: string;
  tagline: string | null;
  icon: string;
  color: string;
  inclusions: string[];
  display_order: number;
  is_active: boolean;
}

interface FormState {
  id: number | null;
  label: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  inclusions: string[];
  display_order: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  id: null,
  label: '',
  tagline: '',
  icon: 'water-outline',
  color: BLUE,
  inclusions: [],
  display_order: '0',
  is_active: true,
};

interface ConfirmState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

const initialConfirm: ConfirmState = {
  visible: false,
  title: '',
  message: '',
  confirmLabel: 'OK',
  onConfirm: () => {},
};

function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: state.destructive ? '#FEE2E2' : BLUE_TINT }]}>
            <Ionicons
              name={state.destructive ? 'alert-circle' : 'help-circle'}
              size={28}
              color={state.destructive ? DANGER : BLUE}
            />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={[styles.confirmBtn, styles.confirmBtnGhost]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.confirmBtnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: state.destructive ? DANGER : BLUE }]}
              onPress={state.onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>{state.confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ServicesManagementScreen() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<number | null>(null);
  const [shopName, setShopName] = useState<string>('');

  const [packages, setPackages] = useState<ServicePackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [newInclusionText, setNewInclusionText] = useState('');

  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));

  // ---------- LOAD ADMIN'S SHOP ----------
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth' as any);
        return;
      }
      setOwnerId(session.user.id);

      const { data, error } = await supabase
        .from('shop_profile_setup')
        .select('id, shop_name')
        .eq('owner_id', session.user.id)
        .maybeSingle();

      if (!error && data) {
        setShopId(data.id);
        setShopName(data.shop_name ?? '');
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ---------- LOAD PACKAGES FOR THIS SHOP ----------
  const fetchPackages = useCallback(async (currentShopId: number) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('service_packages')
      .select('id, shop_id, label, tagline, icon, color, inclusions, display_order, is_active')
      .eq('shop_id', currentShopId)
      .order('display_order', { ascending: true });

    if (!error) {
      setPackages((data as ServicePackageRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!shopId) return;
    fetchPackages(shopId);

    const topic = 'realtime:admin-service-packages-live';
    const existing = supabase.getChannels().find((c) => c.topic === topic);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel('admin-service-packages-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_packages', filter: `shop_id=eq.${shopId}` },
        () => fetchPackages(shopId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, fetchPackages]);

  // ---------- FORM HELPERS ----------
  const openAddForm = () => {
    setFormMode('add');
    setForm({ ...emptyForm, display_order: String(packages.length + 1) });
    setNewInclusionText('');
    setFormVisible(true);
  };

  const openEditForm = (pkg: ServicePackageRow) => {
    setFormMode('edit');
    setForm({
      id: pkg.id,
      label: pkg.label,
      tagline: pkg.tagline ?? '',
      icon: (pkg.icon as keyof typeof Ionicons.glyphMap) ?? 'water-outline',
      color: pkg.color,
      inclusions: [...pkg.inclusions],
      display_order: String(pkg.display_order ?? 0),
      is_active: pkg.is_active,
    });
    setNewInclusionText('');
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
  };

  const handleAddInclusion = () => {
    const trimmed = newInclusionText.trim();
    if (!trimmed) return;
    setForm((f) => ({ ...f, inclusions: [...f.inclusions, trimmed] }));
    setNewInclusionText('');
  };

  const handleRemoveInclusion = (index: number) => {
    setForm((f) => ({ ...f, inclusions: f.inclusions.filter((_, i) => i !== index) }));
  };

  // ---------- SAVE (INSERT OR UPDATE) ----------
  const handleSave = async () => {
    if (!shopId) return;

    if (!form.label.trim()) {
      setConfirm({
        visible: true,
        title: 'Missing Label',
        message: 'Please enter a package name (e.g. Basic Wash).',
        confirmLabel: 'OK',
        onConfirm: closeConfirm,
      });
      return;
    }

    if (form.inclusions.length === 0) {
      setConfirm({
        visible: true,
        title: 'No Inclusions Yet',
        message: 'Add at least one inclusion so customers know what this package covers.',
        confirmLabel: 'OK',
        onConfirm: closeConfirm,
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        shop_id: shopId,
        label: form.label.trim(),
        tagline: form.tagline.trim() || null,
        icon: form.icon,
        color: form.color,
        inclusions: form.inclusions,
        display_order: parseInt(form.display_order, 10) || 0,
        is_active: form.is_active,
      };

      if (formMode === 'add') {
        const { error } = await supabase.from('service_packages').insert(payload);
        if (error) throw error;
      } else if (form.id) {
        const { error } = await supabase.from('service_packages').update(payload).eq('id', form.id);
        if (error) throw error;
      }

      setFormVisible(false);
      fetchPackages(shopId);
    } catch (error: any) {
      setConfirm({
        visible: true,
        title: 'Save Failed',
        message: error?.message ?? 'Something went wrong while saving. Please try again.',
        confirmLabel: 'OK',
        onConfirm: closeConfirm,
      });
    } finally {
      setSaving(false);
    }
  };

  // ---------- DELETE ----------
  const handleDeletePress = (pkg: ServicePackageRow) => {
    setConfirm({
      visible: true,
      title: 'Delete Package',
      message: `Are you sure you want to delete "${pkg.label}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        closeConfirm();
        const { error } = await supabase.from('service_packages').delete().eq('id', pkg.id);
        if (!error && shopId) fetchPackages(shopId);
      },
    });
  };

  // ---------- TOGGLE ACTIVE ----------
  const handleToggleActive = async (pkg: ServicePackageRow) => {
    const { error } = await supabase
      .from('service_packages')
      .update({ is_active: !pkg.is_active })
      .eq('id', pkg.id);
    if (!error && shopId) fetchPackages(shopId);
  };

  // ---------- NO SHOP YET ----------
  if (!loading && !shopId) {
    return (
      <View style={styles.centerScreen}>
        <Ionicons name="business-outline" size={40} color={GRAY} />
        <Text style={styles.noShopText}>You need to set up your shop first before adding service packages.</Text>
        <TouchableOpacity style={styles.noShopBtn} onPress={() => router.push('admin/shop-setup' as any)}>
          <Text style={styles.noShopBtnText}>Go to Shop Setup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={WHITE} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Service Packages</Text>
          {shopName ? <Text style={styles.headerSubtitle}>{shopName}</Text> : null}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color={WHITE} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.helperText}>
          These packages appear on the Customer app so people know what's included in each wash
          (e.g. Basic Wash, Premium Wash). Tap a package to edit it, or use the switch to hide it
          from customers without deleting it.
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={BLUE} />
          </View>
        ) : packages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetags-outline" size={28} color={GRAY} />
            <Text style={styles.emptyStateText}>No service packages yet. Tap + to add one.</Text>
          </View>
        ) : (
          packages.map((pkg) => (
            <View key={pkg.id} style={styles.pkgCard}>
              <TouchableOpacity
                style={styles.pkgCardMain}
                activeOpacity={0.8}
                onPress={() => openEditForm(pkg)}
              >
                <View style={[styles.pkgIconWrap, { backgroundColor: `${pkg.color}15` }]}>
                  <Ionicons name={pkg.icon as any} size={20} color={pkg.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pkgLabel}>{pkg.label}</Text>
                  {pkg.tagline ? <Text style={styles.pkgTagline}>{pkg.tagline}</Text> : null}
                  <Text style={styles.pkgInclusionsCount}>
                    {pkg.inclusions.length} inclusion{pkg.inclusions.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={GRAY} />
              </TouchableOpacity>

              <View style={styles.pkgCardFooter}>
                <TouchableOpacity
                  style={styles.pkgToggleRow}
                  onPress={() => handleToggleActive(pkg)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={pkg.is_active ? 'eye-outline' : 'eye-off-outline'}
                    size={16}
                    color={pkg.is_active ? '#10B981' : GRAY}
                  />
                  <Text style={[styles.pkgToggleText, { color: pkg.is_active ? '#10B981' : GRAY }]}>
                    {pkg.is_active ? 'Visible to customers' : 'Hidden'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleDeletePress(pkg)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="trash-outline" size={18} color={DANGER} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ADD / EDIT FORM MODAL */}
      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={closeForm}>
        <KeyboardAvoidingView
          style={styles.formOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.formSheet}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{formMode === 'add' ? 'Add Package' : 'Edit Package'}</Text>
              <TouchableOpacity onPress={closeForm}>
                <Ionicons name="close" size={24} color={NAVY} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Package Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Basic Wash"
                placeholderTextColor="#94A3B8"
                value={form.label}
                onChangeText={(text) => setForm((f) => ({ ...f, label: text }))}
              />

              <Text style={styles.fieldLabel}>Short Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Exterior wash only, quick and simple"
                placeholderTextColor="#94A3B8"
                value={form.tagline}
                onChangeText={(text) => setForm((f) => ({ ...f, tagline: text }))}
              />

              <Text style={styles.fieldLabel}>Icon</Text>
              <View style={styles.pickerRow}>
                {ICON_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.icon}
                    style={[
                      styles.iconOption,
                      form.icon === opt.icon && { borderColor: form.color, backgroundColor: `${form.color}15` },
                    ]}
                    onPress={() => setForm((f) => ({ ...f, icon: opt.icon }))}
                  >
                    <Ionicons name={opt.icon} size={20} color={form.icon === opt.icon ? form.color : GRAY} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.pickerRow}>
                {COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorOption,
                      { backgroundColor: c },
                      form.color === c && styles.colorOptionSelected,
                    ]}
                    onPress={() => setForm((f) => ({ ...f, color: c }))}
                  >
                    {form.color === c ? <Ionicons name="checkmark" size={16} color={WHITE} /> : null}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Inclusions (what's included)</Text>
              <View style={styles.inclusionInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="e.g. Car wax"
                  placeholderTextColor="#94A3B8"
                  value={newInclusionText}
                  onChangeText={setNewInclusionText}
                  onSubmitEditing={handleAddInclusion}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.addInclusionBtn} onPress={handleAddInclusion}>
                  <Ionicons name="add" size={20} color={WHITE} />
                </TouchableOpacity>
              </View>

              {form.inclusions.map((item, idx) => (
                <View key={idx} style={styles.inclusionChip}>
                  <Ionicons name="checkmark-circle" size={16} color={form.color} />
                  <Text style={styles.inclusionChipText}>{item}</Text>
                  <TouchableOpacity onPress={() => handleRemoveInclusion(idx)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={16} color={GRAY} />
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.fieldLabel}>Display Order</Text>
              <TextInput
                style={styles.input}
                placeholder="1"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                value={form.display_order}
                onChangeText={(text) => setForm((f) => ({ ...f, display_order: text.replace(/[^0-9]/g, '') }))}
              />
              <Text style={styles.fieldHint}>Lower numbers show first (e.g. Basic = 1, Premium = 2).</Text>

              <TouchableOpacity
                style={styles.visibilityToggle}
                onPress={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={form.is_active ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={form.is_active ? '#10B981' : GRAY}
                />
                <Text style={styles.visibilityToggleText}>
                  {form.is_active ? 'Visible to customers' : 'Hidden from customers'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: form.color }]}
                onPress={handleSave}
                activeOpacity={0.85}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <Text style={styles.saveBtnText}>{formMode === 'add' ? 'Add Package' : 'Save Changes'}</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal state={confirm} onCancel={closeConfirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  centerScreen: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  noShopText: {
    fontSize: 14,
    color: GRAY,
    textAlign: 'center',
  },
  noShopBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  noShopBtnText: {
    color: WHITE,
    fontWeight: '700',
    fontSize: 14,
  },
  header: {
    backgroundColor: NAVY,
    padding: 20,
    paddingTop: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {
    fontSize: 12,
    color: GRAY,
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingVertical: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GRAY_LIGHT,
    borderStyle: 'dashed',
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  pkgCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    overflow: 'hidden',
  },
  pkgCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  pkgIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pkgLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  pkgTagline: {
    fontSize: 12,
    color: GRAY,
    marginTop: 2,
  },
  pkgInclusionsCount: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    fontWeight: '600',
  },
  pkgCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  pkgToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pkgToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  formOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  formSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: NAVY,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 12,
  },
  fieldHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: GRAY_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: GRAY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: NAVY,
  },
  inclusionInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addInclusionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inclusionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  inclusionChipText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  visibilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
  },
  visibilityToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  saveBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: WHITE,
    fontWeight: '800',
    fontSize: 14,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: WHITE,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 6,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  confirmBtnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnGhost: {
    backgroundColor: '#F1F5F9',
  },
  confirmBtnGhostText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13.5,
  },
  confirmBtnText: {
    color: WHITE,
    fontWeight: '800',
    fontSize: 13.5,
  },
});