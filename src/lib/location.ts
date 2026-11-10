// Location rule: a customer only sees and books (shop visit or home service)
// branches in the SAME TOWN / CITY they are in right now, from the phone's
// GPS. e.g. someone in Nasugbu, Batangas sees Nasugbu branches only -- not
// Balayan, Lian or Tuy -- and someone in Balayan sees Balayan branches only.
//
// The town comes from reverse-geocoding the GPS position (`city`, e.g.
// "Nasugbu") and is matched to the branch's City / Municipality from Shop
// Setup. If the phone gives no town, the branch's saved GPS spot is used
// instead (within a few km).

import * as Location from 'expo-location';

export interface CustomerArea {
  // Where the customer is, e.g. "Nasugbu, Batangas".
  label: string;
  // Just the town / city, e.g. "Nasugbu".
  townLabel: string;
  // Normalized town / city for matching ("nasugbu"); '' when unknown.
  town: string;
  // Every place name the geocoder returned, normalized for matching.
  names: string[];
  // false when the geocoder gave no province (subregion).
  provinceKnown: boolean;
  lat: number;
  lng: number;
}

// Fallback radius when the phone gives no town name (or the branch has no
// town set): about one town's size, small enough not to reach the next town.
const FALLBACK_RADIUS_KM = 8;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export type AreaResult =
  | { status: 'ok'; area: CustomerArea }
  | { status: 'denied'; canAskAgain: boolean } // location permission refused
  | { status: 'off' } // phone's Location / GPS switched off
  | { status: 'failed' }; // no fix or no address (often no internet)

const CACHE_MS = 10 * 60 * 1000;
let cached: { at: number; result: AreaResult } | null = null;

// "Province of Batangas" -> "batangas", "City of Manila" -> "manila"
export function normalizePlace(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(province of|city of|municipality of)\b/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Town / city for matching: also drops a trailing "city", so "Batangas City",
// "City of Batangas" and "Batangas" all match each other.
export function normalizeTown(name: string | null | undefined): string {
  return normalizePlace(name).replace(/\s+city$/, '').trim();
}

const NCR_NAMES = ['metro manila', 'ncr', 'national capital region'];

export async function getCustomerArea(options: { force?: boolean } = {}): Promise<AreaResult> {
  if (!options.force && cached && Date.now() - cached.at < CACHE_MS && cached.result.status === 'ok') {
    return cached.result;
  }

  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { status: 'denied', canAskAgain: perm.canAskAgain };

    if (!(await Location.hasServicesEnabledAsync())) return { status: 'off' };

    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: CACHE_MS, requiredAccuracy: 3000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));

    const [address] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    if (!address) return { status: 'failed' };

    const raw = [address.subregion, address.region, address.city, address.district];
    const names = raw.map(normalizePlace).filter(Boolean);
    if (names.length === 0) return { status: 'failed' };

    // "Nasugbu, Batangas" -- town first, then province.
    const label =
      [address.city, address.subregion].filter(Boolean).join(', ') || address.region || 'your area';
    const result: AreaResult = {
      status: 'ok',
      area: {
        label,
        townLabel: address.city || label,
        town: normalizeTown(address.city),
        names,
        provinceKnown: !!address.subregion,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      },
    };
    cached = { at: Date.now(), result };
    return result;
  } catch (e) {
    console.log('[location] could not get area:', e);
    return { status: 'failed' };
  }
}

// Is this branch in the customer's town / city?
export function isShopInArea(
  shop: {
    province?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  area: CustomerArea
): boolean {
  const shopTown = normalizeTown(shop.city);

  // Normal case: the phone told us the town and the branch has one set.
  if (area.town && shopTown) return shopTown === area.town;

  // Otherwise: distance from the branch's saved GPS spot (Shop Setup).
  if (shop.latitude != null && shop.longitude != null) {
    return distanceKm(area.lat, area.lng, shop.latitude, shop.longitude) <= FALLBACK_RADIUS_KM;
  }

  // No town and no GPS spot to compare -- last resort: same province.
  // Exact match only -- "quezon" (Quezon City, NCR) must not match Quezon province.
  const province = normalizePlace(shop.province);
  const isNcrShop = !province || NCR_NAMES.some((n) => province.includes(n));
  return isNcrShop
    ? area.names.some((n) => NCR_NAMES.some((ncr) => n.includes(ncr)))
    : area.names.some((n) => n === province);
}

// Friendly title/message for when the location can't be used, shared by the
// dashboard and the home-service screen so the wording stays the same.
export function areaProblemMessage(result: Exclude<AreaResult, { status: 'ok' }>) {
  switch (result.status) {
    case 'denied':
      return {
        title: 'Location Needed',
        message: result.canAskAgain
          ? 'We use your location to show car wash branches in your town. Please tap “Allow” when asked.'
          : 'Location is blocked for I-CarWash. Open your phone’s Settings → Apps → I-CarWash → Permissions, allow Location, then come back.',
      };
    case 'off':
      return {
        title: 'Turn On Location',
        message: 'Your phone’s Location (GPS) is off. Please turn it on so we can show branches in your town.',
      };
    default:
      return {
        title: 'Can’t Find Your Location',
        message: 'We couldn’t check where you are right now. Make sure you have internet and Location is on, then try again.',
      };
  }
}
