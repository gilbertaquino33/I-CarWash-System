import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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


const FALLBACK_BAYS = ['Bay 1', 'Bay 2'];


const NAVY = '#1A1D21';
const BLUE = '#2563EB';
const ERROR = '#DC2626';


type PriceEntry = number | [number, number];

// Price list update: +₱50 across the board, except Motorcycle (+₱10 only).
const BASIC_WASH_PRICING: Record<string, PriceEntry> = {
  Motorcycle: 110,
  Micro: 170,
  Hatchback: 180,
  Sedan: 200,
  Coupe: 200,
  Convertible: 220,
  Cabriolet: 220,
  Wagon: 210,
  SUV: 240,
  Pickup: 240,
  Crossover: 240,
  Sport: 250,
  Muscle: 250,
  Roadster: 250,
  'Off-road': 270,
  Van: 300,
  Limousine: 370,
  'Oversize Van': [350, 400],
};

const PREMIUM_WASH_PRICING: Record<string, PriceEntry> = {
  Motorcycle: 160,
  'Big Bike': 300,
  Micro: 280,
  Hatchback: 310,
  Sedan: 350,
  Coupe: 350,
  Convertible: 390,
  Cabriolet: 390,
  Wagon: 360,
  Sport: 430,
  Muscle: 430,
  Roadster: 430,
  SUV: 450,
  Crossover: 430,
  'Off-road': 470,
  Pickup: 440,
  Van: 500,
  Limousine: 600,
};


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


function getPriceEntry(vehicleType: string, type: ServiceType): PriceEntry {
  const table = type === 'BASIC' ? BASIC_WASH_PRICING : PREMIUM_WASH_PRICING;
  return table[vehicleType] ?? table['Sedan'] ?? 150;
}


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
  payment_method: string | null;
  payment_status: string | null;
  // Added by staff while the CCTV was offline -- ended with Finish Wash.
  manual_mode?: boolean;
  created_at?: string;
};

// Vehicles offered in the manual Add Walk-in sheet (every priced type).
const MANUAL_VEHICLES = Array.from(
  new Set([...Object.keys(BASIC_WASH_PRICING), ...Object.keys(PREMIUM_WASH_PRICING)])
);

type BayCard = {
  bayName: string;
  expanded: boolean;
  reservation: BayReservation | null; // null = vacant
  elapsedSeconds: number;
};



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
          <View style={[styles.confirmIconWrap, { backgroundColor: state.destructive ? '#FCECEC' : '#E4EDFF' }]}>
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
          <View style={[styles.confirmIconWrap, { backgroundColor: '#FCECEC' }]}>
            <Ionicons name="close" size={26} color={ERROR} />
          </View>
          <Text style={styles.confirmTitle}>{state.title}</Text>
          <Text style={styles.confirmMessage}>{state.message}</Text>
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: BLUE, flex: 0, alignSelf: 'stretch' }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.confirmBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// The camera heartbeat (cv_heartbeat.updated_at) must be newer than this
// for the camera to count as "online". backend/camera.py pings every 10s.
const CAMERA_ONLINE_WINDOW_MS = 90_000;

export default function NewWalkin(): ReactElement {
  const [bays, setBays] = useState<string[]>([]);
  const [bayCards, setBayCards] = useState<Record<string, BayCard>>({});
  const [loadingBays, setLoadingBays] = useState(true);

  // null = not checked yet; true/false = camera.py detection loop is
  // running / not. When it's not, this screen shows NO live Washing/timer
  // state -- a stopped camera can't leave a phantom timer on screen.
  const [cameraOnline, setCameraOnline] = useState<boolean | null>(null);

  // Bays the camera sees a car in RIGHT NOW (bays.cv_occupied, written only
  // by backend/camera.py). With the camera on, a bay shows a car only if
  // it's in this set -- so the screen matches the live CCTV view exactly.
  const [liveBays, setLiveBays] = useState<Set<string>>(new Set());

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

  async function syncBayAvailability(bayName: string, occupied: boolean, reserved: boolean) {
    if (!shopId) return;

    const { error } = await supabase
      .from('bays')
      .update({ occupied, reserved })
      .eq('shop_id', shopId)
      .eq('bay_name', bayName);

    if (error) {
      console.log('[NewWalkin] bay sync error:', error.message);
    }
  }

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

    async function fetchCameraStatus() {
      // Ask the DB (shop_cctv_online): staff can't SELECT cv_heartbeat
      // directly (RLS), and the server clock avoids a wrong phone clock.
      const { data, error } = await supabase.rpc('shop_cctv_online', { p_shop_id: shopId });
      if (!isMounted) return;
      if (!error) {
        setCameraOnline(data === true);
        return;
      }
      // Older DB without the function -- fall back to reading the heartbeat.
      const { data: hb } = await supabase
        .from('cv_heartbeat')
        .select('updated_at')
        .eq('shop_id', shopId)
        .maybeSingle();
      if (!isMounted) return;
      setCameraOnline(
        !!hb?.updated_at && Date.now() - new Date(hb.updated_at).getTime() < CAMERA_ONLINE_WINDOW_MS
      );
    }

    async function fetchActiveForAllBays() {
      await fetchCameraStatus();

      const { data: cvRows, error: cvError } = await supabase
        .from('bays')
        .select('bay_name, cv_occupied')
        .eq('shop_id', shopId as number);
      if (!isMounted) return;
      if (!cvError) {
        setLiveBays(new Set((cvRows ?? []).filter((b: any) => b.cv_occupied).map((b: any) => b.bay_name)));
      }

      const baseColumns =
        'id, bay_name, vehicle_type, status, occupied, service_type, price, washing_started_at, payment_method, payment_status, created_at';
      const fetchActive = (columns: string) =>
        supabase
          .from('reservation')
          .select(columns)
          .in('status', [STATUS_WAITING, STATUS_WASHING])
          .eq('occupied', true)
          .eq('shop_id', shopId as number)
          .in('bay_name', bays)
          .order('id', { ascending: false });
      let result = await fetchActive(`${baseColumns}, manual_mode`);
      // manual_mode not in the DB yet (SQL not applied) -- fall back.
      if (result.error?.code === '42703') result = await fetchActive(baseColumns);
      const { data, error } = result as unknown as { data: BayReservation[] | null; error: { message: string } | null };

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

        // Only today's cars. A walk-in left Waiting/Washing from an earlier
        // day (camera was off when the car left) is a ghost, not a car in
        // the bay right now.
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        (data ?? []).forEach((row) => {
          if (!row.bay_name || !next[row.bay_name]) return;
          if (row.created_at && new Date(row.created_at) < startOfToday) return;
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
      // Camera flips bays.cv_occupied the moment a car enters / leaves.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bays' }, () => {
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

  // Washing sessions now end on their own (camera detects the vehicle
  // leaving the bay), so leaving this screen is always safe -- no
  // navigation block, no manual "End Session".
  function handleBackPress() {
    router.back();
  }

  // ---------------------------------------------------------------
  // 4. MANUAL MODE (CCTV offline): staff add the walk-in themselves and end
  //    it with Finish Wash -- the camera can't see the car come or go.
  // ---------------------------------------------------------------
  const [manualBay, setManualBay] = useState<string | null>(null);
  const [manualVehicle, setManualVehicle] = useState<string | null>(null);
  const [manualService, setManualService] = useState<ServiceType | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [finishingBay, setFinishingBay] = useState<string | null>(null);

  const manualPriceFor = (vehicle: string | null, type: ServiceType): PriceEntry | null => {
    if (!vehicle) return null;
    const table = type === 'BASIC' ? BASIC_WASH_PRICING : PREMIUM_WASH_PRICING;
    return table[vehicle] ?? null;
  };
  const manualEntry = manualService ? manualPriceFor(manualVehicle, manualService) : null;
  const manualPrice = manualEntry != null ? toChargeableAmount(manualEntry) : null;

  function openAddWalkin(bayName: string) {
    setManualBay(bayName);
    setManualVehicle(null);
    setManualService(null);
  }
  function closeAddWalkin() {
    if (manualBusy) return;
    setManualBay(null);
  }
  function pickManualVehicle(vehicle: string) {
    setManualVehicle(vehicle);
    // Keep the service only if this vehicle offers it.
    setManualService((s) => (s && manualPriceFor(vehicle, s) != null ? s : null));
  }

  // Same confirmation step as picking a service for a camera walk-in.
  function confirmManualWalkin() {
    if (!manualBay || !manualVehicle || !manualService || manualPrice == null) return;
    const bay = manualBay;
    const vehicle = manualVehicle;
    const service = manualService;
    const price = manualPrice;
    const label = service === 'BASIC' ? 'Basic Wash' : 'Premium Wash';
    setManualBay(null); // close the sheet so the confirm modal is on top
    setConfirm({
      visible: true,
      title: `Start ${label}?`,
      message: `${bay}  •  ${vehicle.toUpperCase()}  •  ${label}  •  ₱${price} (Cash)\n\nThis records ₱${price} cash paid and starts the timer. Tap Finish Wash when the car leaves the bay.`,
      confirmLabel: 'Start Wash',
      onConfirm: () => {
        closeConfirm();
        startManualWalkin(bay, vehicle, service, price);
      },
    });
  }

  async function startManualWalkin(bay: string, vehicle: string, service: ServiceType, price: number) {
    setManualBusy(true);
    const { error } = await supabase.rpc('staff_start_manual_walkin', {
      p_bay_name: bay,
      p_vehicle_type: vehicle,
      p_service_type: service,
      p_price: price,
    });
    setManualBusy(false);

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('CCTV_ONLINE')) {
        showFeedback('CCTV Is Back Online', 'The camera is running again, so it will detect the car in the bay automatically. Pick the service from the bay card once it shows up.');
      } else if (msg.includes('BAY_BUSY')) {
        showFeedback('Bay Already in Use', `${bay} already has a car. Please choose a free bay.`);
      } else if (/network|fetch/i.test(msg)) {
        showFeedback('No Internet', 'Couldn’t save the walk-in. Please check the Wi-Fi or mobile data, then try again.');
      } else {
        showFeedback('Couldn’t Add Walk-in', msg);
      }
    }
  }

  function confirmFinishWash(bayName: string, reservation: BayReservation) {
    setConfirm({
      visible: true,
      title: 'Finish Wash?',
      message: `${(reservation.vehicle_type || 'Vehicle').toUpperCase()} in ${bayName} is done and has left the bay. This frees the bay and records the wash as completed.`,
      confirmLabel: 'Finish Wash',
      onConfirm: () => {
        closeConfirm();
        finishWash(bayName, reservation);
      },
    });
  }

  async function finishWash(bayName: string, reservation: BayReservation) {
    setFinishingBay(bayName);
    const { error } = await supabase.rpc('staff_finish_wash', { p_reservation_id: reservation.id });
    setFinishingBay(null);
    if (error) {
      const msg = error.message ?? '';
      showFeedback(
        'Couldn’t Finish Wash',
        msg.includes('CCTV_ONLINE')
          ? 'The CCTV is running and tracking this wash — it will end automatically once the car leaves the bay.'
          : /network|fetch/i.test(msg)
            ? 'No internet right now. Please check the Wi-Fi or mobile data, then try again.'
            : msg
      );
      return;
    }
    // Clear the bay right away; realtime/poll confirms it.
    setBayCards((prev) => ({
      ...prev,
      [bayName]: { ...prev[bayName], expanded: false, reservation: null, elapsedSeconds: 0 },
    }));
  }

  function toggleExpand(bayName: string) {
    setBayCards((prev) => {
      const card = prev[bayName];
      if (!card || !card.reservation) return prev; // can't expand a vacant bay
      return { ...prev, [bayName]: { ...card, expanded: !card.expanded } };
    });
  }

  // Tapping a service now opens a confirmation modal first -- one tap to
  // pick, one tap to confirm, and that's it. After OK the timer starts and
  // it will END AUTOMATICALLY when the camera detects the vehicle has left
  // the bay (finalize_vehicle in backend/camera.py). No "End Session".
  function handleSelectService(bayName: string, type: ServiceType) {
    const card = bayCards[bayName];
    if (!card || !card.reservation || card.reservation.status !== STATUS_WAITING) return;

    const vehicleType = card.reservation.vehicle_type;
    const priceEntry = getPriceEntry(vehicleType, type);
    const price = toChargeableAmount(priceEntry);
    const label = type === 'BASIC' ? 'Basic Wash' : 'Premium Wash';

    setConfirm({
      visible: true,
      title: `Start ${label}?`,
      message: `${(vehicleType || 'Vehicle').toUpperCase()}  •  ${label}  •  ₱${price} (Cash)\n\nThis records ₱${price} cash paid. The timer starts now and ends automatically once the vehicle leaves the bay.`,
      confirmLabel: 'Start Wash',
      onConfirm: () => {
        closeConfirm();
        commitService(bayName, type, price);
      },
    });
  }

  async function commitService(bayName: string, type: ServiceType, price: number) {
    const card = bayCards[bayName];
    if (!card || !card.reservation || card.reservation.status !== STATUS_WAITING) return;

    const reservationId = card.reservation.id;

    const washingStartedAt = new Date().toISOString();

    // A walk-in customer is physically at the shop and pays CASH on the
    // spot -- there is no "unpaid" walk-in. So the moment staff pick the
    // (auto-priced) service, mark it paid via Cash on Hand. This is what
    // makes it count in the dashboard's Today's Earnings and stop showing
    // up as UNPAID.
    //
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
        payment_method: 'Cash on Hand',
        payment_status: 'paid',
        paid_at: washingStartedAt,
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

    await syncBayAvailability(bayName, true, false);

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
          payment_method: 'Cash on Hand',
          payment_status: 'paid',
        },
      },
    }));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>New Walk-in</Text>
          <Text style={styles.headerSubtitle}>Vehicle Detection & Auto Pricing System</Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {cameraOnline === false && (
          <View style={styles.cameraOfflineBanner}>
            <Ionicons name="videocam-off-outline" size={18} color="#B7791F" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cameraOfflineText, { fontWeight: '800' }]}>CCTV offline — Manual mode</Text>
              <Text style={styles.cameraOfflineText}>
                Tap “Add Walk-in” on a free bay to record a walk-in customer, then tap “Finish Wash” when
                the car leaves.
              </Text>
            </View>
          </View>
        )}

        {loadingBays ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#6B7280" />
            <Text style={styles.loadingText}>Loading bays...</Text>
          </View>
        ) : (
          bays.map((bayName) => {
            const card = bayCards[bayName];
            // A stopped camera can't have a live vehicle in a bay. Ignore
            // any leftover reservation rows until the heartbeat is fresh.
            // Manual walk-ins (added by staff) always show -- staff end them.
            // With the camera on, a car shows ONLY if the camera sees it in
            // this bay right now (cv_occupied) -- no leftover/ghost rows.
            const seenByCamera = cameraOnline === true && liveBays.has(bayName);
            const reservation =
              seenByCamera || card?.reservation?.manual_mode ? (card?.reservation ?? null) : null;
            const isManual = !!reservation?.manual_mode;
            const canAddManual = cameraOnline === false && !reservation;
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
                        color="#6B7280"
                      />
                    )}
                  </View>
                </TouchableOpacity>

                {canAddManual && (
                  <TouchableOpacity
                    style={styles.addWalkinBtn}
                    activeOpacity={0.85}
                    onPress={() => openAddWalkin(bayName)}
                  >
                    <Ionicons name="add-circle" size={18} color={BLUE} />
                    <Text style={styles.addWalkinText}>Add Walk-in</Text>
                  </TouchableOpacity>
                )}

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
                        <Text style={styles.labelText}>Tap a service to start</Text>

                        <View style={styles.dropdownAlternative}>
                          <TouchableOpacity
                            style={styles.selectorOption}
                            onPress={() => handleSelectService(bayName, 'BASIC')}
                          >
                            <Ionicons name="radio-button-off" size={18} color="#6B7280" />
                            <Text style={styles.optionText}>
                              Basic Wash — {basicEntry ? formatPriceEntry(basicEntry) : '-'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.selectorOption}
                            onPress={() => handleSelectService(bayName, 'PREMIUM')}
                          >
                            <Ionicons name="radio-button-off" size={18} color="#6B7280" />
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

                        {isManual ? (
                          <>
                            <View style={[styles.autoEndNote, styles.manualNote]}>
                              <Ionicons name="hand-left-outline" size={16} color="#B7791F" />
                              <Text style={[styles.autoEndText, { color: '#8A5A12' }]}>
                                Manual mode — tap Finish Wash when the car leaves the bay.
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.finishBtn, finishingBay === bayName && { opacity: 0.6 }]}
                              activeOpacity={0.85}
                              disabled={finishingBay === bayName}
                              onPress={() => reservation && confirmFinishWash(bayName, reservation)}
                            >
                              {finishingBay === bayName ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                                  <Text style={styles.finishBtnText}>Finish Wash</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View style={styles.autoEndNote}>
                            <Ionicons name="videocam-outline" size={16} color={BLUE} />
                            <Text style={styles.autoEndText}>
                              Ends automatically when the camera detects the vehicle has left the bay.
                            </Text>
                          </View>
                        )}
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

      {/* ADD WALK-IN (manual mode) -- bottom sheet: vehicle -> service -> start */}
      <Modal visible={!!manualBay} transparent animationType="slide" onRequestClose={closeAddWalkin} statusBarTranslucent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeAddWalkin} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Add Walk-in</Text>
                <Text style={styles.sheetSubtitle}>{manualBay} · Cash payment</Text>
              </View>
              <TouchableOpacity onPress={closeAddWalkin} style={styles.sheetClose} disabled={manualBusy}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.sheetStep}>1. Vehicle type</Text>
              <View style={styles.chipWrap}>
                {MANUAL_VEHICLES.map((v) => {
                  const selected = manualVehicle === v;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => pickManualVehicle(v)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{v}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.sheetStep, !manualVehicle && { color: '#C2C7CF' }]}>2. Service</Text>
              <View style={styles.serviceRow}>
                {(['BASIC', 'PREMIUM'] as ServiceType[]).map((type) => {
                  const entry = manualPriceFor(manualVehicle, type);
                  const unavailable = !manualVehicle || entry == null;
                  const selected = manualService === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.serviceCard, selected && styles.serviceCardSelected, unavailable && styles.serviceCardDisabled]}
                      disabled={unavailable}
                      onPress={() => setManualService(type)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={type === 'PREMIUM' ? 'sparkles-outline' : 'water-outline'}
                        size={20}
                        color={selected ? BLUE : unavailable ? '#C2C7CF' : '#6B7280'}
                      />
                      <Text style={[styles.serviceName, selected && { color: BLUE }, unavailable && { color: '#C2C7CF' }]}>
                        {type === 'BASIC' ? 'Basic Wash' : 'Premium Wash'}
                      </Text>
                      <Text style={[styles.servicePrice, selected && { color: BLUE }, unavailable && { color: '#C2C7CF' }]}>
                        {!manualVehicle ? '—' : entry == null ? 'Not offered' : formatPriceEntry(entry)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <View>
                <Text style={styles.sheetTotalLabel}>Total (cash)</Text>
                <Text style={styles.sheetTotal}>{manualPrice != null ? `₱${manualPrice}` : '—'}</Text>
              </View>
              <TouchableOpacity
                style={[styles.sheetStartBtn, (manualPrice == null || manualBusy) && styles.sheetStartBtnDisabled]}
                disabled={manualPrice == null || manualBusy}
                onPress={confirmManualWalkin}
                activeOpacity={0.85}
              >
                {manualBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.sheetStartText}>Start Wash</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal state={confirm} onCancel={closeConfirm} />
      <FeedbackModal state={feedback} onClose={closeFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
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
    color: '#9AA1AC',
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
    color: '#6B7280',
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
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vacantText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  detectedBadge: {
    backgroundColor: '#E7F6EC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detectedText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },
  washingBadge: {
    backgroundColor: '#E4EDFF',
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
    borderTopColor: '#ECEEF1',
  },
  infoBox: {
    backgroundColor: '#F4F5F7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },
  label: {
    color: '#6B7280',
    fontSize: 12,
  },
  labelText: {
    color: '#4B5563',
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
    backgroundColor: '#F4F5F7',
    borderWidth: 1,
    borderColor: '#ECEEF1',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  sessionBox: {
    backgroundColor: '#FBF7EE',
    borderWidth: 1,
    borderColor: '#EAD9AE',
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
    color: '#B7791F',
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
  cameraOfflineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FBF0DE',
    borderWidth: 1,
    borderColor: '#EAD9AE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  cameraOfflineText: {
    flex: 1,
    color: '#8A5A12',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  autoEndNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4EDFF',
    borderWidth: 1,
    borderColor: '#C7D9FB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 8,
  },
  autoEndText: {
    flex: 1,
    color: '#1E40AF',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 16,
  },

  // ===== Manual mode (CCTV offline) =====
  addWalkinBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#9DB8F5',
    backgroundColor: '#F5F8FF',
  },
  addWalkinText: { color: BLUE, fontWeight: '800', fontSize: 14 },
  manualNote: { backgroundColor: '#FBF0DE', borderColor: '#EAD9AE' },
  finishBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#16A34A',
  },
  finishBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: NAVY },
  sheetSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  sheetClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  sheetStep: { fontSize: 12, fontWeight: '800', color: '#4B5563', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 14, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: { borderColor: BLUE, backgroundColor: '#EEF4FF' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextSelected: { color: BLUE, fontWeight: '800' },
  serviceRow: { flexDirection: 'row', gap: 10 },
  serviceCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 4,
  },
  serviceCardSelected: { borderColor: BLUE, backgroundColor: '#EEF4FF' },
  serviceCardDisabled: { backgroundColor: '#F9FAFB' },
  serviceName: { fontSize: 14, fontWeight: '800', color: NAVY, marginTop: 4 },
  servicePrice: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F1F3',
  },
  sheetTotalLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  sheetTotal: { fontSize: 24, fontWeight: '800', color: NAVY },
  sheetStartBtn: {
    minWidth: 150,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: BLUE,
  },
  sheetStartBtnDisabled: { backgroundColor: '#B6C8F2' },
  sheetStartText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

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
    color: '#4B5563',
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
    backgroundColor: '#F7F8FA',
  },
  confirmBtnGhostText: {
    color: '#4B5563',
    fontWeight: '700',
    fontSize: 13.5,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
});