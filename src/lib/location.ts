// Location rule: a customer can only book (shop visit or home service) at a
// branch in the SAME PROVINCE they are in right now, from the phone's GPS.
// e.g. someone in Nasugbu, Batangas sees Batangas branches only -- not
// Cavite, Manila or Sorsogon.
//
// The province comes from reverse-geocoding the GPS position. On Android in
// the Philippines the geocoder usually puts the REGION in `region`
// ("Calabarzon") and the PROVINCE in `subregion` ("Batangas"), so every
// returned name is kept and a shop matches if its province is any of them.

import * as Location from 'expo-location';

export interface CustomerArea {
  // Province to show the customer, e.g. "Batangas".
  label: string;
  // Every place name the geocoder returned, normalized for matching.
  names: string[];
  // false when the geocoder gave no province (subregion) -- some Android
  // phones only return the region ("Calabarzon") and town. Then a branch is
  // matched by distance to its saved GPS spot instead.
  provinceKnown: boolean;
  lat: number;
  lng: number;
}

// Fallback radius when the province is unknown: close enough to be the same
// area, small enough not to reach the next province over.
const FALLBACK_RADIUS_KM = 25;

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

    // Prefer the province (subregion) for display; fall back to region/city.
    const label = address.subregion || address.region || address.city || 'your area';
    const result: AreaResult = {
      status: 'ok',
      area: {
        label,
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

// Is this branch in the customer's province?
export function isShopInArea(
  shop: {
    province?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  area: CustomerArea
): boolean {
  // Exact match only -- "quezon" (Quezon City, NCR) must not match Quezon province.
  const matches = (place: string) => !!place && area.names.some((n) => n === place);

  const province = normalizePlace(shop.province);
  const isNcrShop = !province || NCR_NAMES.some((n) => province.includes(n));

  const byName = isNcrShop
    ? // Metro Manila has no province in PSGC -- match the region, or the city.
      area.names.some((n) => NCR_NAMES.some((ncr) => n.includes(ncr))) || matches(normalizePlace(shop.city))
    : matches(province) || matches(normalizePlace(shop.city));
  if (byName) return true;

  // The phone didn't tell us the province: fall back to distance from the
  // branch's saved GPS spot (set by the admin in Shop Setup).
  if (!area.provinceKnown && shop.latitude != null && shop.longitude != null) {
    return distanceKm(area.lat, area.lng, shop.latitude, shop.longitude) <= FALLBACK_RADIUS_KM;
  }
  return false;
}

// Friendly title/message for when the location can't be used, shared by the
// dashboard and the home-service screen so the wording stays the same.
export function areaProblemMessage(result: Exclude<AreaResult, { status: 'ok' }>) {
  switch (result.status) {
    case 'denied':
      return {
        title: 'Location Needed',
        message: result.canAskAgain
          ? 'We use your location to show car wash branches in your province. Please tap “Allow” when asked.'
          : 'Location is blocked for I-CarWash. Open your phone’s Settings → Apps → I-CarWash → Permissions, allow Location, then come back.',
      };
    case 'off':
      return {
        title: 'Turn On Location',
        message: 'Your phone’s Location (GPS) is off. Please turn it on so we can show branches in your province.',
      };
    default:
      return {
        title: 'Can’t Find Your Location',
        message: 'We couldn’t check where you are right now. Make sure you have internet and Location is on, then try again.',
      };
  }
}
