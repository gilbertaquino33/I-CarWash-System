import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

const money = (v: number) =>
  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Supplies',
  'Salaries',
  'Maintenance',
  'Marketing',
  'Other',
];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

interface CategoryTotal {
  category: string;
  amount: number;
}

export default function ProfitLossReport() {
  const [refDate, setRefDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [grossRevenue, setGrossRevenue] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [expensesByCategory, setExpensesByCategory] = useState<CategoryTotal[]>([]);

  // --- Add Expense modal state ---
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStep, setModalStep] = useState<'form' | 'success'>('form');
  const [expCategory, setExpCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(todayStr());
  const [expNotes, setExpNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ category: string; amount: number } | null>(null);

  // --- Validation Error Modal state ---
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalTitle, setErrorModalTitle] = useState('');
  const [errorModalMessage, setErrorModalMessage] = useState('');

  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const monthLabel = refDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const showError = (title: string, message: string) => {
    setErrorModalTitle(title);
    setErrorModalMessage(message);
    setErrorModalVisible(true);
  };

  const fetchData = useCallback(async () => {
    const { data: shop } = await supabase
      .from('shop_profile_setup')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    const shopId = shop?.id ?? null;
    if (!shopId) {
      setGrossRevenue(0);
      setJobCount(0);
      setTotalExpenses(0);
      setExpensesByCategory([]);
      return;
    }

    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [walkinRes, homeRes, expenseRes] = await Promise.all([
      supabase
        .from('walkin_transactions')
        .select('price')
        .eq('shop_id', shopId)
        .gte('reservation_date', startStr)
        .lte('reservation_date', endStr),
      supabase
        .from('home_service')
        .select('price')
        .eq('shop_id', shopId)
        .eq('status', 'Completed')
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr),
      supabase
        .from('expenses')
        .select('category, amount')
        .eq('shop_id', shopId)
        .gte('expense_date', startStr)
        .lte('expense_date', endStr),
    ]);

    const wSum = (walkinRes.data ?? []).reduce((s: number, r: any) => s + (r.price ?? 0), 0);
    const hSum = (homeRes.data ?? []).reduce((s: number, r: any) => s + (r.price ?? 0), 0);

    setGrossRevenue(wSum + hSum);
    setJobCount((walkinRes.data?.length ?? 0) + (homeRes.data?.length ?? 0));

    const expenseRows = expenseRes.data ?? [];
    const eSum = expenseRows.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
    setTotalExpenses(eSum);

    const categoryMap = new Map<string, number>();
    expenseRows.forEach((r: any) => {
      const cat = r.category ?? 'Other';
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + (r.amount ?? 0));
    });
    const categoryTotals = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    setExpensesByCategory(categoryTotals);
  }, [year, month, daysInMonth]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const changeMonth = (offset: number) => {
    const next = new Date(refDate);
    next.setMonth(next.getMonth() + offset, 1);
    setRefDate(next);
  };

  const resetExpenseForm = () => {
    setExpCategory(EXPENSE_CATEGORIES[0]);
    setExpAmount('');
    setExpDate(todayStr());
    setExpNotes('');
  };

  const openModal = () => {
    resetExpenseForm();
    setModalStep('form');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setModalStep('form');
    resetExpenseForm();
  };

  const handleSaveExpense = async () => {
    const parsedAmount = parseFloat(expAmount);

    if (!expAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      showError('Invalid Amount', 'Please enter a valid positive expense amount.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
      showError('Invalid Date Format', 'Please specify the expense date as YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const { data: shop, error: shopError } = await supabase
        .from('shop_profile_setup')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (shopError) throw shopError;

      const shopId = shop?.id ?? null;
      if (!shopId) {
        showError('Shop Not Configured', 'Please set up your shop profile first before logging expenses.');
        setSaving(false);
        return;
      }

      const { error: insertError } = await supabase.from('expenses').insert({
        shop_id: shopId,
        category: expCategory,
        amount: parsedAmount,
        expense_date: expDate,
        notes: expNotes.trim() || null,
      });

      if (insertError) throw insertError;

      await fetchData();
      setLastSaved({ category: expCategory, amount: parsedAmount });
      setModalStep('success');
    } catch (err: any) {
      showError('Database Error', err?.message ?? 'Something went wrong while saving the expense.');
    } finally {
      setSaving(false);
    }
  };

  const netProfit = grossRevenue - totalExpenses;
  const isProfit = netProfit >= 0;
  const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* HEADER - Unified Navy Blue Style */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profit / Loss Report</Text>
        <TouchableOpacity style={styles.addButton} onPress={openModal}>
          <Ionicons name="add" size={22} color="#FACC15" />
        </TouchableOpacity>
      </View>

      {/* DATE NAVIGATION */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={18} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.dateNavText}>{monthLabel}</Text>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeMonth(1)} disabled={isCurrentMonth}>
          <Ionicons name="chevron-forward" size={18} color={isCurrentMonth ? '#CBD5E1' : '#0F172A'} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0F172A" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* GROSS REVENUE BANNER */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Gross Revenue</Text>
            <Text style={styles.summaryAmount}>{money(grossRevenue)}</Text>
          </View>

          {/* FINANCIAL SUMMARY */}
          <View style={styles.plRow}>
            <View style={styles.plCard}>
              <Text style={styles.plLabel}>Total Revenue</Text>
              <Text style={[styles.plValue, { color: '#16A34A' }]}>{money(grossRevenue)}</Text>
            </View>
            <View style={styles.plCard}>
              <Text style={styles.plLabel}>Total Expenses</Text>
              <Text style={[styles.plValue, { color: '#DC2626' }]}>
                {totalExpenses > 0 ? `- ${money(totalExpenses)}` : money(0)}
              </Text>
            </View>
            <View style={[styles.plCard, styles.netCard, { borderColor: isProfit ? '#BBF7D0' : '#FECACA' }]}>
              <View>
                <Text style={styles.plLabel}>Net {isProfit ? 'Profit' : 'Loss'}</Text>
                <Text style={styles.plSubLabel}>
                  {grossRevenue > 0 ? `${profitMargin.toFixed(1)}% margin` : '—'}
                </Text>
              </View>
              <Text style={[styles.plValue, { color: isProfit ? '#16A34A' : '#DC2626', fontSize: 17 }]}>
                {isProfit ? '' : '- '}{money(Math.abs(netProfit))}
              </Text>
            </View>
          </View>

          {/* METRICS */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{jobCount}</Text>
              <Text style={styles.statLabel}>Completed Jobs</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {jobCount > 0 ? money(grossRevenue / jobCount) : money(0)}
              </Text>
              <Text style={styles.statLabel}>Avg Revenue / Job</Text>
            </View>
          </View>

          {/* EXPENSE CATEGORIES LIST */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Expenses by Category</Text>
            <TouchableOpacity style={styles.addExpenseLink} onPress={openModal}>
              <Ionicons name="add-circle-outline" size={18} color="#0F172A" />
              <Text style={styles.addExpenseLinkText}>Add Expense</Text>
            </TouchableOpacity>
          </View>

          {expensesByCategory.length === 0 ? (
            <TouchableOpacity style={styles.emptyCard} onPress={openModal}>
              <Ionicons name="receipt-outline" size={24} color="#94A3B8" />
              <Text style={styles.emptyText}>No expenses logged for this month.</Text>
              <Text style={styles.emptyLinkText}>Tap here to log one</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.categoryCard}>
              {expensesByCategory.map((c) => {
                const pct = totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0;
                return (
                  <View key={c.category} style={styles.categoryRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.categoryTopRow}>
                        <Text style={styles.categoryName}>{c.category}</Text>
                        <Text style={styles.categoryAmount}>{money(c.amount)}</Text>
                      </View>
                      <View style={styles.categoryBarTrack}>
                        <View style={[styles.categoryBarFill, { width: `${Math.max(4, pct)}%` }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* --- ADD EXPENSE MODAL --- */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            {modalStep === 'form' ? (
              <>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>Add New Expense</Text>
                  <TouchableOpacity onPress={closeModal}>
                    <Ionicons name="close" size={22} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.label}>Category</Text>
                  <View style={styles.chipRow}>
                    {EXPENSE_CATEGORIES.map((cat) => {
                      const active = cat === expCategory;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setExpCategory(cat)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Amount (₱)</Text>
                  <TextInput
                    style={styles.input}
                    value={expAmount}
                    onChangeText={setExpAmount}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.label}>Expense Date</Text>
                  <TextInput
                    style={styles.input}
                    value={expDate}
                    onChangeText={setExpDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.label}>Notes (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={expNotes}
                    onChangeText={setExpNotes}
                    placeholder="e.g. Wash soap supply restock"
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={3}
                  />

                  <TouchableOpacity
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    onPress={handleSaveExpense}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Expense</Text>
                    )}
                  </TouchableOpacity>
                  <View style={{ height: 10 }} />
                </ScrollView>
              </>
            ) : (
              /* SUCCESS STATE */
              <View style={styles.successWrap}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="checkmark" size={32} color="#16A34A" />
                </View>
                <Text style={styles.successTitle}>Expense Recorded!</Text>
                {lastSaved && (
                  <Text style={styles.successSubtitle}>
                    {lastSaved.category} · {money(lastSaved.amount)} has been successfully added to this month's report.
                  </Text>
                )}

                <TouchableOpacity style={styles.saveButton} onPress={closeModal}>
                  <Text style={styles.saveButtonText}>Done</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.addAnotherLink}
                  onPress={() => {
                    resetExpenseForm();
                    setModalStep('form');
                  }}
                >
                  <Text style={styles.addAnotherLinkText}>Add Another Expense</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- CUSTOM VALIDATION ALERT MODAL (Replaces Native Alert) --- */}
      <Modal
        visible={errorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorModalVisible(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <View style={styles.alertIconCircle}>
              <Ionicons name="alert-circle-outline" size={28} color="#EF4444" />
            </View>
            <Text style={styles.alertTitle}>{errorModalTitle}</Text>
            <Text style={styles.alertMessage}>{errorModalMessage}</Text>
            
            <TouchableOpacity
              style={styles.alertBtn}
              onPress={() => setErrorModalVisible(false)}
            >
              <Text style={styles.alertBtnText}>Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  /* UNIFIED NAVY HEADER */
  header: {
    backgroundColor: '#0F172A',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  addButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    borderRadius: 10,
  },

  /* DATE BAR */
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  /* SUMMARY CARDS */
  summaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
  },
  summaryLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryAmount: { color: '#FACC15', fontSize: 28, fontWeight: '800' },
  
  plRow: { gap: 10, marginBottom: 20 },
  plCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netCard: {
    borderWidth: 1.5,
  },
  plLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  plSubLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  plValue: { fontSize: 15, fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  statNumber: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2, textAlign: 'center' },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  addExpenseLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addExpenseLinkText: { fontSize: 12, fontWeight: '700', color: '#0F172A' },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyText: { fontSize: 12, color: '#94A3B8' },
  emptyLinkText: { fontSize: 12, color: '#0F172A', fontWeight: '700' },

  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  categoryRow: { flexDirection: 'row', alignItems: 'center' },
  categoryTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  categoryName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  categoryAmount: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  categoryBarTrack: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  categoryBarFill: { height: '100%', backgroundColor: '#DC2626', borderRadius: 4 },

  /* MODAL EXPENSE FORM STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 14 },
  
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  chipTextActive: { color: '#FFFFFF' },

  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: { height: 70, textAlignVertical: 'top' },

  /* PRIMARY BUTTON (Consistent Navy Blue) */
  saveButton: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    width: '100%',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  /* SUCCESS STATE */
  successWrap: { alignItems: 'center', paddingVertical: 20 },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  successSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  addAnotherLink: { marginTop: 16, alignItems: 'center' },
  addAnotherLinkText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },

  /* CUSTOM VALIDATION MODAL ALERT */
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  alertCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  alertIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  alertBtn: {
    backgroundColor: '#0F172A',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  alertBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});