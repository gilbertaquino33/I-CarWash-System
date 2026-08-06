import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type ServiceType = 'BASIC' | 'PREMIUM';

const STATUS_WAITING = 'Waiting';
const STATUS_WASHING = 'Washing';
const STATUS_COMPLETED = 'Completed';
const STATUS_CANCELLED = 'Cancelled';

// Fallback used only if we truly can't resolve this staff account's shop
// at all (e.g. no internet, no session, or profile row missing shop_id).
const FALLBACK_BAYS = ['Bay 1', 'Bay 2'];

// ─────────────────────────────────────────
//  THEME (blue + black/white — consistent sa Staff Dashboard)
// ─────────────────────────────────────────
const NAVY = '#0F172A';
const BLUE = '#2563EB';
const ERROR = '#DC2626';


type PriceEntry = number | [number, number];

const BASIC_WASH_PRICING: Record<string, PriceEntry> = {
  Motorcycle: 100,
  Micro: 120,
  Hatchback: 130,
  Sedan: 150,
  Coupe: 150,
  Convertible: 170,
  Cabriolet: 170,
  Wagon: 160,
  SUV: 190,
  Pickup: 190,
  Crossover: 190,
  Sport: 200,
  Muscle: 200,
  Roadster: 200,
  'Off-road': 220,
  Van: 250,
  Limousine: 320,
  'Oversize Van': [300, 350],
};

const PREMIUM_WASH_PRICING: Record<string, PriceEntry> = {
  Motorcycle: 150,
  'Big Bike': 250,
  Micro: 230,
  Hatchback: 260,
  Sedan: 300,
  Coupe: 300,
  Convertible: 340,
  Cabriolet: 340,
  Wagon: 310,
  Sport: 380,
  Muscle: 380,
  Roadster: 380,
  SUV: 400,
  Crossover: 380,
  'Off-road': 420,
  Pickup: 390,
  Van: 450,
  Limousine: 550,
};

/** Turns a PriceEntry into an actual number to charge/save.
 * "Oversize Van" has a range (300-350) in the pricing table -- since the
 * database needs a single number, we charge the average of the range. */
function toChargeableAmount(entry: PriceEntry): number {
  if (Array.isArray(entry)) {
    return Math.round((entry[0] + entry[1]) / 2);
  }
  return entry;
}

function formatPriceEntry(entry: PriceEntry): string {
  if (Array.isArray(entry)) {
    return `₱${entry[0]}–₱${entry[1]}`;
  }
  return `₱${entry}`;
}

/** Looks up the price entry for a given vehicle type + service, falling
 * back to the Sedan price if the exact detected type isn't in the table
 * (e.g. an unexpected/unmapped classifier label). */
function getPriceEntry(vehicleType: string, type: ServiceType): PriceEntry {
  const table = type === 'BASIC' ? BASIC_WASH_PRICING : PREMIUM_WASH_PRICING;
  return table[vehicleType] ?? table['Sedan'] ?? 150;
}

/** Extracts the trailing number from a bay name ("Bay 12" -> 12) so bays
 * sort numerically (Bay 1, Bay 2, ... Bay 10) instead of alphabetically
 * (Bay 1, Bay 10, Bay 2, ...). */
function extractBayNumber(name: string): number {
  const match = name.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}

type BayReservation = {
  id: number;
  bay_name: string;
  vehicle_type: string;
  status: string;
  occupied: boolean;
  service_type: ServiceType | null;
  price: number | null;
  washing_started_at: string | null;
};

type BayCard = {
  bayName: string;
  expanded: boolean;
  reservation: BayReservation | null; // null = vacant
  elapsedSeconds: number;
};

// Now includes hours, so the format matches what gets saved to
// service_timer ("HH:MM:SS") once a session ends past 60 minutes.
function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const h = Math.floor(safeSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(safeSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

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

interface FeedbackState {
  visible: boolean;
  title: string;
  message: string;
}

const initialFeedback: FeedbackState = { visible: false, title: '', message: '' };

// ─────────────────────────────────────────
//  REUSABLE: Confirm modal (replaces Alert.alert confirms)
//  Kaparehong component ng ginagamit sa Staff Dashboard.
// ─────────────────────────────────────────
function ConfirmModal({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: state.destructive ? '#FEE2E2' : '#DBEAFE' }]}>
            <Ionicons
              name={state.destructive ? 'alert-circle' : 'help-circle'}
              size={28}
              color={state.destructive ? ERROR : BLUE}
            />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={[styles.confirmBtn, styles.confirmBtnGhost]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.confirmBtnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: state.destructive ? ERROR : BLUE }]}
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

// ─────────────────────────────────────────
//  REUSABLE: Error / notice modal (single button, replaces Alert.alert notices)
// ─────────────────────────────────────────
function FeedbackModal({ state, onClose }: { state: FeedbackState; onClose: () => void }) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmCard}>
          <View style={[styles.confirmIconWrap, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close" size={26} color={ERROR} />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: BLUE, width: '100%' }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.confirmBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function NewWalkin(): ReactElement {
  const navigation = useNavigation();

  const [bays, setBays] = useState<string[]>([]);
  const [bayCards, setBayCards] = useState<Record<string, BayCard>>({});
  const [loadingBays, setLoadingBays] = useState(true);

  // The shop this logged-in staff account belongs to. Resolved once from
  // their own profiles.shop_id (set at signup when they picked their
  // branch) and then reused by every other effect below, so realtime
  // updates always stay scoped to THIS shop only.
  const [shopId, setShopId] = useState<number | null>(null);

  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const closeConfirm = () => setConfirm((c) => ({ ...c, visible: false }));
  const closeFeedback = () => setFeedback((f) => ({ ...f, visible: false }));
  const showFeedback = (title: string, message: string) => setFeedback({ visible: true, title, message });

  // ---------------------------------------------------------------
  // 1. Load + AUTO-SYNC the list of bays.
  //
  //    "shop_profile_setup.total_bays" is the ACTUAL source of truth for
  //    how many bays should exist -- whatever Admin sets there (via the
  //    Apply button OR edited directly in the Supabase dashboard) is what
  //    must show up here. The "bays" table is just a materialized list
  //    that has to be kept in sync with that number.
  //
  //    IMPORTANT FIX: this now resolves the shop from the LOGGED-IN
  //    STAFF ACCOUNT's own profile (profiles.shop_id, set at signup when
  //    they picked their branch), instead of just grabbing whichever
  //    shop_profile_setup row happened to have the highest id. Every
  //    "bays" query is also scoped with .eq('shop_id', shopId). Without
  //    this, editing bay counts on one shop -- or another admin simply
  //    creating/editing THEIR shop -- could change what a completely
  //    different shop's staff saw here. Now:
  //
  //      1. Resolve THIS staff account's shop_id from their profile.
  //      2. Read that shop's real total_bays from shop_profile_setup.
  //      3. Read ONLY the "bays" rows belonging to that shop_id.
  //      4. If the count doesn't match total_bays, add/remove rows here
  //         (self-healing -- doesn't require Admin to press "Apply").
  //      5. Re-read the final list and display it, sorted numerically
  //         (Bay 1, Bay 2, ... Bay 10) so labels are always "Bay N".
  // ---------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    function fallbackToDefaultBays() {
      setBays(FALLBACK_BAYS);
      setBayCards((prev) => {
        const next = { ...prev };
        FALLBACK_BAYS.forEach((name) => {
          if (!next[name]) next[name] = { bayName: name, expanded: false, reservation: null, elapsedSeconds: 0 };
        });
        return next;
      });
      setLoadingBays(false);
    }

    async function loadAndSyncBays() {
      // 1. Figure out which shop THIS staff account belongs to. This was
      //    set once at signup (staff picked their branch), stored on
      //    their own "profiles" row as shop_id via the handle_new_user
      //    trigger. This is the only correct source of truth for "which
      //    shop is this" -- never "the shop with the highest id".
      const { data: { session } } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!session) {
        console.log('[NewWalkin] no active session, using fallback bays');
        fallbackToDefaultBays();
        return;
      }

      const { data: staffProfile, error: staffProfileError } = await supabase
        .from('profiles')
        .select('shop_id')
        .eq('id', session.user.id)
        .single();

      if (!isMounted) return;

      if (staffProfileError || !staffProfile?.shop_id) {
        console.log(
          "[NewWalkin] could not resolve this staff account's shop_id, using fallback:",
          staffProfileError?.message
        );
        fallbackToDefaultBays();
        return;
      }

      const resolvedShopId = staffProfile.shop_id as number;
      setShopId(resolvedShopId);

      // 2. Get THIS shop's own profile row -- scoped by id, not "latest
      //    row in the whole table".
      const { data: profile, error: profileError } = await supabase
        .from('shop_profile_setup')
        .select('id, total_bays')
        .eq('id', resolvedShopId)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError || !profile) {
        console.log('[NewWalkin] shop_profile_setup fetch error, using fallback:', profileError?.message);
        fallbackToDefaultBays();
        return;
      }

      const targetShopId = profile.id;
      const targetTotal = profile.total_bays ?? FALLBACK_BAYS.length;

      // 3. Get ONLY the bays that belong to this shop_id.
      const { data: existingBays, error: baysError } = await supabase
        .from('bays')
        .select('bay_name, occupied, reserved')
        .eq('shop_id', targetShopId);

      if (!isMounted) return;

      if (baysError) {
        console.log('[NewWalkin] bays fetch error:', baysError.message);
        fallbackToDefaultBays();
        return;
      }

      const rows = existingBays ?? [];

      // 4. Self-heal the "bays" table to match total_bays.
      //
      //    IMPORTANT FIX: this is now NAME-based, not just COUNT-based.
      //    The old version only checked "does the number of rows match
      //    total_bays?" -- so if this shop's rows had ever ended up as
      //    e.g. "Bay 2" and "Bay 3" (a gap at "Bay 1", from some earlier
      //    manual edit / historical bug) while total_bays = 2, the old
      //    code saw 2 rows == target of 2 and did NOTHING, even though
      //    the numbering was wrong. Now we always compute the exact
      //    target set {"Bay 1", ..., "Bay N"} and reconcile against it:
      //    anything missing from that set gets inserted, anything extra
      //    outside that set gets removed (if it's safe to remove).
      const targetNames = Array.from({ length: targetTotal }, (_, i) => `Bay ${i + 1}`);
      const targetNameSet = new Set(targetNames);
      const existingNameSet = new Set(rows.map((b) => b.bay_name));

      const missingNames = targetNames.filter((name) => !existingNameSet.has(name));
      const extraRows = rows.filter((b) => !targetNameSet.has(b.bay_name));

      if (missingNames.length > 0) {
        const toInsert = missingNames.map((name) => ({
          bay_name: name,
          shop_id: targetShopId,
          occupied: false,
          reserved: false,
        }));

        const { error: insertError } = await supabase.from('bays').insert(toInsert);
        if (insertError) {
          console.log('[NewWalkin] auto-sync insert error:', insertError.message);
        }
      }

      if (extraRows.length > 0) {
        // Never remove a bay that currently has a car in it or an app
        // reservation pending -- only ever remove "safe" (free) bays.
        const removableExtraNames = extraRows
          .filter((b) => !b.occupied && !b.reserved)
          .map((b) => b.bay_name);

        if (removableExtraNames.length > 0) {
          const { error: deleteError } = await supabase
            .from('bays')
            .delete()
            .eq('shop_id', targetShopId)
            .in('bay_name', removableExtraNames);

          if (deleteError) {
            console.log('[NewWalkin] auto-sync delete error:', deleteError.message);
          }
        }
        // If some extra rows are occupied/reserved (e.g. still washing),
        // just leave those for now -- don't force-remove a bay in use.
        // They'll get cleaned up automatically once they're freed and
        // this sync runs again.
      }

      // 5. Re-read the FINAL bays for this shop and display them.
      const { data: finalBays, error: finalError } = await supabase
        .from('bays')
        .select('bay_name')
        .eq('shop_id', targetShopId);

      if (!isMounted) return;

      let bayNames: string[];
      if (finalError || !finalBays || finalBays.length === 0) {
        bayNames = FALLBACK_BAYS;
      } else {
        bayNames = finalBays
          .map((row) => row.bay_name)
          .sort((a, b) => extractBayNumber(a) - extractBayNumber(b)); // Bay 1, Bay 2, ... Bay 10
      }

      setBays(bayNames);
      setBayCards((prev) => {
        const next = { ...prev };
        bayNames.forEach((name) => {
          if (!next[name]) {
            next[name] = { bayName: name, expanded: false, reservation: null, elapsedSeconds: 0 };
          }
        });
        return next;
      });
      setLoadingBays(false);
    }

    loadAndSyncBays();

    // Keep bay count live: if Admin changes total_bays for THIS shop
    // while this screen is open, re-sync automatically. Scoped so a
    // change on another shop's row never touches this screen.
    const shopConfigChannel = supabase
      .channel('newwalkin-shop-config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_profile_setup' }, () => {
        loadAndSyncBays();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(shopConfigChannel);
    };
  }, []);

  // ---------------------------------------------------------------
  // 2. Keep each bay's active reservation (if any) in sync. A bay is
  //    "Vacant" when there's no Waiting/Washing + occupied row for it,
  //    "Occupied" when Waiting (car detected, no service picked yet),
  //    "Washing" once a service has been picked.
  //
  //    NOTE: identified by the reservation's real "id" column (primary
  //    key), NOT "customer_id" -- walk-in reservations created by
  //    camera.py never have a customer_id (they have no app account),
  //    so using customer_id here was the root cause of the "Invalid
  //    input" error when picking a service type.
  //
  //    Also scoped by shop_id so a bay_name collision with another
  //    shop's bay (e.g. every shop having its own "Bay 1") can never
  //    pull in a reservation that isn't actually for this shop.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (bays.length === 0 || !shopId) return;
    let isMounted = true;

    async function fetchActiveForAllBays() {
      const { data, error } = await supabase
        .from('reservation')
        .select(
          'id, bay_name, vehicle_type, status, occupied, service_type, price, washing_started_at'
        )
        .in('status', [STATUS_WAITING, STATUS_WASHING])
        .eq('occupied', true)
        .eq('shop_id', shopId)
        .in('bay_name', bays)
        .order('id', { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.log('[NewWalkin] active reservations fetch error:', error.message);
        return;
      }

      setBayCards((prev) => {
        const next = { ...prev };

        bays.forEach((name) => {
          const existing = next[name];
          next[name] = {
            bayName: name,
            expanded: existing?.expanded ?? false,
            reservation: null,
            elapsedSeconds: existing?.elapsedSeconds ?? 0,
          };
        });

        (data ?? []).forEach((row) => {
          if (!row.bay_name || !next[row.bay_name]) return;
          // Rows come back newest-first; keep only the newest active
          // reservation per bay in case of any overlap.
          if (next[row.bay_name].reservation) return;

          next[row.bay_name] = {
            ...next[row.bay_name],
            reservation: row as BayReservation,
          };
        });

        return next;
      });
    }

    fetchActiveForAllBays();

    const pollInterval = setInterval(fetchActiveForAllBays, 3000);

    const channel = supabase
      .channel('newwalkin-reservation-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation' }, () => {
        fetchActiveForAllBays();
      })
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [bays, shopId]);

  // ---------------------------------------------------------------
  // 3. Tick the timer for any bay currently Washing, based on the
  //    server-side washing_started_at (not local state), so it's
  //    correct even after a refresh.
  // ---------------------------------------------------------------
  const washingKey = useMemo(
    () =>
      Object.values(bayCards)
        .filter((c) => c.reservation?.status === STATUS_WASHING)
        .map((c) => `${c.bayName}:${c.reservation?.washing_started_at}`)
        .join(','),
    [bayCards]
  );

  useEffect(() => {
    if (!washingKey) return;

    function tick() {
      setBayCards((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((name) => {
          const card = next[name];
          if (card.reservation?.status === STATUS_WASHING && card.reservation.washing_started_at) {
            const startedAt = new Date(card.reservation.washing_started_at).getTime();
            const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            if (secs !== card.elapsedSeconds) {
              next[name] = { ...card, elapsedSeconds: secs };
            }
          }
        });
        return next;
      });
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [washingKey]);

  // ---------------------------------------------------------------
  // Block navigating away while any bay is actively washing.
  // ---------------------------------------------------------------
  const anyWashing = Object.values(bayCards).some((c) => c.reservation?.status === STATUS_WASHING);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!anyWashing) return;
      e.preventDefault();
      showFeedback(
        'Unable to leave page',
        'There is currently a washing car. Finish the session ("End Session") before leaving this page.'
      );
    });
    return unsubscribe;
  }, [navigation, anyWashing]);

  function handleBackPress() {
    if (anyWashing) {
      showFeedback(
        'Unable to leave page',
        'There is currently a washing car. Finish the session ("End Session") before leaving this page.'
      );
      return;
    }
    router.back();
  }

  function toggleExpand(bayName: string) {
    setBayCards((prev) => {
      const card = prev[bayName];
      if (!card || !card.reservation) return prev; // can't expand a vacant bay
      return { ...prev, [bayName]: { ...card, expanded: !card.expanded } };
    });
  }

  async function handleSelectService(bayName: string, type: ServiceType) {
    const card = bayCards[bayName];
    if (!card || !card.reservation || card.reservation.status !== STATUS_WAITING) return;

    const reservationId = card.reservation.id;
    const vehicleType = card.reservation.vehicle_type;

    // Price now depends on the DETECTED vehicle type, not a flat rate --
    // same table as reserve.tsx.
    const priceEntry = getPriceEntry(vehicleType, type);
    const price = toChargeableAmount(priceEntry);

    const washingStartedAt = new Date().toISOString();

    // IMPORTANT: scoped by BOTH id (the reservation's real primary key)
    // AND bay_name. If the "bays" table ever has two rows pointing at the
    // same physical zone, scoping by bay_name guarantees only THIS card's
    // row gets updated.
    const { data: updateData, error } = await supabase
      .from('reservation')
      .update({
        service_type: type,
        price,
        status: STATUS_WASHING,
        washing_started_at: washingStartedAt,
      })
      .eq('id', reservationId)
      .eq('bay_name', bayName)
      .select();

    if (error) {
      console.log('[NewWalkin] update error:', error.message);
      showFeedback('Hindi na-save', error.message);
      return;
    }

    if (!updateData || updateData.length === 0) {
      console.log('[NewWalkin] update affected 0 rows -- check RLS UPDATE policy on "reservation"');
      showFeedback(
        'Hindi na-save ang serbisyo',
        'Walang na-update sa database. Malamang naka-block ito ng Row Level Security sa Supabase -- payagan ang UPDATE gamit ang anon key sa "reservation" table.'
      );
      return;
    }

    // Optimistic local update -- realtime/poll will also confirm this shortly.
    setBayCards((prev) => ({
      ...prev,
      [bayName]: {
        ...prev[bayName],
        expanded: true,
        elapsedSeconds: 0,
        reservation: {
          ...(prev[bayName].reservation as BayReservation),
          status: STATUS_WASHING,
          service_type: type,
          price,
          washing_started_at: washingStartedAt,
        },
      },
    }));
  }

  function handleEndSession(bayName: string) {
    const card = bayCards[bayName];
    if (!card || !card.reservation || card.reservation.status !== STATUS_WASHING) return;

    const reservationId = card.reservation.id;

    // Compute the final elapsed duration off of the server-side
    // washing_started_at (not the local ticking state), so what gets
    // saved to "service_timer" is accurate even if the UI timer drifted
    // or the tab was backgrounded.
    const started = new Date(card.reservation.washing_started_at!);
    const now = new Date();

    const diffSeconds = Math.floor((now.getTime() - started.getTime()) / 1000);

    const hours = String(Math.floor(diffSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(diffSeconds % 60).padStart(2, '0');

    const serviceTimer = `${hours}:${minutes}:${seconds}`;

    setConfirm({
      visible: true,
      title: 'End this session?',
      message: 'Are you sure you want to end this session?',
      confirmLabel: 'End',
      destructive: true,
      onConfirm: async () => {
        closeConfirm();

        // Same fix here: scoped by bay_name too, so ending THIS bay's
        // session can never accidentally end another bay's session.
        const { data: updateData, error } = await supabase
          .from('reservation')
          .update({
            status: STATUS_COMPLETED,
            occupied: false,
            service_timer: serviceTimer,
          })
          .eq('id', reservationId)
          .eq('bay_name', bayName)
          .select();

        if (error) {
          console.log('[NewWalkin] end session error:', error.message);
          showFeedback('Hindi na-save', error.message);
          return;
        }

        if (!updateData || updateData.length === 0) {
          console.log('[NewWalkin] end session affected 0 rows -- check RLS UPDATE policy');
          showFeedback(
            'Hindi na-end ang session',
            'Walang na-update sa database. Baka naka-block ito ng RLS UPDATE policy sa "reservation" table.'
          );
          return;
        }

        setBayCards((prev) => ({
          ...prev,
          [bayName]: { bayName, expanded: false, reservation: null, elapsedSeconds: 0 },
        }));
      },
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, anyWashing && styles.backButtonDisabled]}
          onPress={handleBackPress}
        >
          <Ionicons name="arrow-back" size={24} color={anyWashing ? '#475569' : '#FFFFFF'} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>New Walk-in</Text>
          <Text style={styles.headerSubtitle}>Vehicle Detection & Auto Pricing System</Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {loadingBays ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#64748B" />
            <Text style={styles.loadingText}>Loading bays...</Text>
          </View>
        ) : (
          bays.map((bayName) => {
            const card = bayCards[bayName];
            const reservation = card?.reservation ?? null;
            const isWaiting = reservation?.status === STATUS_WAITING;
            const isWashing = reservation?.status === STATUS_WASHING;
            const isOccupied = isWaiting || isWashing;
            const expanded = card?.expanded ?? false;

            // Per-vehicle-type prices for THIS bay's detected vehicle,
            // used to label the Basic/Premium buttons while Waiting.
            const vehicleType = reservation?.vehicle_type ?? '';
            const basicEntry = vehicleType ? getPriceEntry(vehicleType, 'BASIC') : null;
            const premiumEntry = vehicleType ? getPriceEntry(vehicleType, 'PREMIUM') : null;

            return (
              <View key={bayName} style={styles.card}>
                <TouchableOpacity
                  style={styles.bayHeaderRow}
                  activeOpacity={isOccupied ? 0.6 : 1}
                  onPress={() => toggleExpand(bayName)}
                  disabled={!isOccupied}
                >
                  <Text style={styles.bayName}>{bayName}</Text>

                  <View style={styles.bayHeaderRight}>
                    {!isOccupied && (
                      <View style={styles.vacantBadge}>
                        <Text style={styles.vacantText}>Vacant</Text>
                      </View>
                    )}

                    {isWaiting && (
                      <View style={styles.detectedBadge}>
                        <Text style={styles.detectedText}>Occupied</Text>
                      </View>
                    )}

                    {isWashing && (
                      <View style={styles.washingBadge}>
                        <Text style={styles.washingText}>Washing</Text>
                      </View>
                    )}

                    {isOccupied && (
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#64748B"
                      />
                    )}
                  </View>
                </TouchableOpacity>

                {isOccupied && expanded && (
                  <View style={styles.bayDetail}>
                    <View style={styles.infoBox}>
                      <Text style={styles.label}>Vehicle Type</Text>
                      <Text style={styles.value}>
                        {(reservation?.vehicle_type ?? '').toUpperCase() || '-'}
                      </Text>
                    </View>

                    {isWaiting && (
                      <>
                        <Text style={styles.labelText}>Tap a service to start the wash</Text>

                        <View style={styles.dropdownAlternative}>
                          <TouchableOpacity
                            style={styles.selectorOption}
                            onPress={() => handleSelectService(bayName, 'BASIC')}
                          >
                            <Ionicons name="radio-button-off" size={18} color="#64748B" />
                            <Text style={styles.optionText}>
                              Basic Wash — {basicEntry ? formatPriceEntry(basicEntry) : '-'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.selectorOption}
                            onPress={() => handleSelectService(bayName, 'PREMIUM')}
                          >
                            <Ionicons name="radio-button-off" size={18} color="#64748B" />
                            <Text style={styles.optionText}>
                              Premium Wash — {premiumEntry ? formatPriceEntry(premiumEntry) : '-'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}

                    {isWashing && (
                      <View style={styles.sessionBox}>
                        <View style={styles.priceRow}>
                          <View>
                            <Text style={styles.label}>Service</Text>
                            <Text style={styles.value}>
                              {reservation?.service_type ? `${reservation.service_type} WASH` : '-'}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.label}>Price</Text>
                            <Text style={styles.price}>
                              {reservation?.price != null ? `₱${reservation.price}` : '-'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.timerBox}>
                          <Text style={styles.timerLabel}>Elapsed Time</Text>
                          <Text style={styles.timerValue}>
                            {formatDuration(card?.elapsedSeconds ?? 0)}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.endSessionButton}
                          onPress={() => handleEndSession(bayName)}
                        >
                          <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
                          <Text style={styles.endSessionText}>End Session</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <ConfirmModal state={confirm} onCancel={closeConfirm} />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: NAVY,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonDisabled: {
    opacity: 0.5,
  },
  headerText: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bayHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bayName: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
  },
  vacantBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vacantText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  detectedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detectedText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '700',
  },
  washingBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  washingText: {
    color: BLUE,
    fontSize: 12,
    fontWeight: '700',
  },
  bayDetail: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  infoBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  label: {
    color: '#64748B',
    fontSize: 12,
  },
  labelText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
    marginTop: 4,
  },
  dropdownAlternative: {
    flexDirection: 'row',
    gap: 10,
  },
  selectorOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  sessionBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 14,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F59E0B',
    marginTop: 4,
  },
  timerBox: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  timerLabel: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timerValue: {
    fontSize: 36,
    fontWeight: '800',
    color: NAVY,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  endSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ERROR,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  endSessionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  // ===== Confirm / feedback modal (kaparehong style ng Staff Dashboard) =====
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
    backgroundColor: '#FFFFFF',
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
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
});