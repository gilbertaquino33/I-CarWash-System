// "How's your experience?" pop-up. Right after a customer books (shop visit
// or home service), ask them once to share feedback about THAT shop;
// "Give feedback" opens its review form on the website
// (WEBSITE_URL/shops/<id>#review).
//
// Mounted on the customer dashboard, which checkout returns to after a
// booking. Each booking is only asked about once (remembered on the phone in
// AsyncStorage), and only for bookings made in the last 2 hours.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WEBSITE_URL } from '../lib/config';
import { supabase } from '../lib/supabase';

const PROMPTED_KEY = 'experience-prompted-bookings';
const RECENT_MS = 2 * 60 * 60 * 1000;

interface RecentBooking {
  key: string; // "res-12" / "home-5" -- reservation and home_service ids overlap
  shop_id: number;
  shop_name: string | null;
  created_at: string;
}

async function readPrompted(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PROMPTED_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

async function markPrompted(key: string) {
  const keys = await readPrompted();
  await AsyncStorage.setItem(PROMPTED_KEY, JSON.stringify([...keys, key].slice(-50))).catch(() => {});
}

export function ExperiencePrompt() {
  const [booking, setBooking] = useState<RecentBooking | null>(null);
  const enabled = /^https?:\/\//.test(WEBSITE_URL);

  const check = useCallback(async () => {
    if (!enabled) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const since = new Date(Date.now() - RECENT_MS).toISOString();
    const [resRes, homeRes] = await Promise.all([
      supabase
        .from('reservation')
        .select('id, shop_id, shop_name, created_at, status')
        .eq('customer_id', session.user.id)
        .gte('created_at', since)
        .not('status', 'in', '(Cancelled,Voided)')
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('home_service')
        .select('id, shop_id, shop_name, created_at, status')
        .eq('user_id', session.user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const recent: RecentBooking[] = [
      ...((resRes.data ?? []) as any[]).map((r) => ({ ...r, key: `res-${r.id}` })),
      ...((homeRes.data ?? []) as any[])
        .filter((h) => !['Cancelled', 'Voided'].includes(h.status))
        .map((h) => ({ ...h, key: `home-${h.id}` })),
    ]
      .filter((b) => b.shop_id != null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const prompted = await readPrompted();
    const next = recent.find((b) => !prompted.includes(b.key));
    // Let the dashboard settle first so the pop-up doesn't flash in.
    if (next) setTimeout(() => setBooking(next), 800);
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      check();
    }, [check])
  );

  const close = async () => {
    if (booking) await markPrompted(booking.key);
    setBooking(null);
  };

  const giveFeedback = async () => {
    if (!booking) return;
    const url = `${WEBSITE_URL}/shops/${booking.shop_id}#review`;
    await close();
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal visible={!!booking} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="star" size={28} color="#F59E0B" />
          </View>
          <Text style={styles.title}>How’s your experience?</Text>
          <Text style={styles.message}>
            Thanks for booking{booking?.shop_name ? ` at ${booking.shop_name}` : ''}! Tell us how it went — your
            feedback helps the shop and other customers. It only takes a minute.
          </Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons key={n} name="star" size={22} color="#FCD34D" />
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={giveFeedback} activeOpacity={0.85}>
            <Ionicons name="chatbubble-ellipses-outline" size={17} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Give feedback</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.laterBtn} onPress={close} activeOpacity={0.85}>
            <Text style={styles.laterBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#1A1D21', textAlign: 'center' },
  message: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 19 },
  stars: { flexDirection: 'row', gap: 4, marginTop: 14 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: 20,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#2563EB',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  laterBtn: { alignSelf: 'stretch', marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  laterBtnText: { color: '#6B7280', fontSize: 13.5, fontWeight: '700' },
});
