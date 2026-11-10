import type { SupabaseClient } from "@supabase/supabase-js";

// Customer-side rules shared by the website's /account pages. These MIRROR
// the mobile app so a customer sees the same prices, slots and rules on both:
//   prices        -> src/lib/pricing.ts            (+ wash_list_price in SQL)
//   home service  -> src/app/customer/homeservice.tsx
//   time slots    -> src/app/customer/reserve.tsx
//   location rule -> src/lib/location.ts           (same town / city)
// Change a value here AND in the app.

export type PriceEntry = number | [number, number];

// ---------- Shop booking (reservation) ----------
export const TIME_SLOTS = ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM", "4:00 PM", "6:00 PM"];
export const GRACE_MINUTES = 15;
export const PACKAGES = ["Basic Wash", "Premium Wash"] as const;
export type PackageType = (typeof PACKAGES)[number];

export const VEHICLE_TYPES = [
  "Motorcycle", "Big Bike", "Micro", "Hatchback", "Sedan", "Coupe", "Convertible", "Cabriolet",
  "Wagon", "Sport", "Muscle", "Roadster", "SUV", "Crossover", "Off-road", "Pickup", "Van",
  "Oversize Van", "Limousine",
];

export const BASIC_WASH_PRICING: Record<string, PriceEntry> = {
  Motorcycle: 110, Micro: 170, Hatchback: 180, Sedan: 200, Coupe: 200, Convertible: 220,
  Cabriolet: 220, Wagon: 210, SUV: 240, Pickup: 240, Crossover: 240, Sport: 250, Muscle: 250,
  Roadster: 250, "Off-road": 270, Van: 300, Limousine: 370, "Oversize Van": [350, 400],
};

export const PREMIUM_WASH_PRICING: Record<string, PriceEntry> = {
  Motorcycle: 160, "Big Bike": 300, Micro: 280, Hatchback: 310, Sedan: 350, Coupe: 350,
  Convertible: 390, Cabriolet: 390, Wagon: 360, Sport: 430, Muscle: 430, Roadster: 430, SUV: 450,
  Crossover: 430, "Off-road": 470, Pickup: 440, Van: 500, Limousine: 600,
};

export function pricingFor(pkg: PackageType | null): Record<string, PriceEntry> {
  if (pkg === "Basic Wash") return BASIC_WASH_PRICING;
  if (pkg === "Premium Wash") return PREMIUM_WASH_PRICING;
  return {};
}

// What is charged for a price entry ("Oversize Van" is a range -> midpoint,
// same as the app's checkout).
export function chargeable(entry: PriceEntry): number {
  return Array.isArray(entry) ? Math.round((entry[0] + entry[1]) / 2) : entry;
}

export function formatPriceEntry(entry: PriceEntry): string {
  return Array.isArray(entry) ? `₱${entry[0]}–₱${entry[1]}` : `₱${entry}`;
}

export function isBasicWash(serviceType: string | null | undefined) {
  return !!serviceType && serviceType.trim().toLowerCase().startsWith("basic");
}

// Extra to pay at the shop to make a Basic Wash Premium (null = not offered).
export function premiumUpgradeCost(vehicleType: string | null | undefined): number | null {
  const basic = BASIC_WASH_PRICING[vehicleType ?? ""];
  const premium = PREMIUM_WASH_PRICING[vehicleType ?? ""];
  if (typeof basic !== "number" || typeof premium !== "number") return null;
  return Math.max(0, premium - basic);
}

// ---------- Home service ----------
export const HOME_SERVICE_FEE = 100;
export const HS_SERVICE_TYPES = ["Basic Wash", "Premium Wash", "3-in-1 w/ Wax (Back to Zero)"];
export const HS_PRICE_MATRIX: Record<string, Record<string, number>> = {
  "Basic Wash": { Sedan: 200, SUV: 240, Pickup: 240, Van: 300, Motorcycle: 110 },
  "Premium Wash": { Sedan: 350, Pickup: 440, Van: 500, Motorcycle: 160, "Big Bike": 300 },
  "3-in-1 w/ Wax (Back to Zero)": { Sedan: 550, SUV: 600, Pickup: 600, Van: 650 },
};
export const HS_VEHICLE_TYPES = ["Sedan", "SUV", "Pickup", "Van", "Motorcycle", "Big Bike"];

export function hsPrice(service: string, vehicle: string): number | null {
  return HS_PRICE_MATRIX[service]?.[vehicle] ?? null;
}

// ---------- Money / dates ----------
export function peso(n: number | null | undefined) {
  return `₱${Number(n ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

export function localDateKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nextDays(count = 14) {
  const out: { iso: string; label: string; weekday: string; day: string }[] = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({
      iso: localDateKey(d),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short" }),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
      day: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }
  return out;
}

export function parseSlot(slot: string) {
  const [time, meridiem] = slot.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  return { h, m };
}

export function slotIso(dateIso: string, slot: string) {
  const { h, m } = parseSlot(slot);
  const d = new Date(`${dateIso}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Slots still in the future for the chosen day.
export function openSlots(dateIso: string) {
  if (dateIso !== localDateKey()) return TIME_SLOTS;
  const now = new Date();
  return TIME_SLOTS.filter((s) => {
    const { h, m } = parseSlot(s);
    return h > now.getHours() || (h === now.getHours() && m > now.getMinutes());
  });
}

export function formatDay(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

// Philippine mobile -> +639XXXXXXXXX (null if invalid), same as the app.
export function toPHMobile(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^9\d{9}$/.test(digits) ? `+63${digits}` : null;
}

// ---------- Location: same town / city ----------
export function normalizePlace(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(province of|city of|municipality of)\b/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTown(name: string | null | undefined): string {
  return normalizePlace(name).replace(/\s+city$/, "").trim();
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export interface CustomerArea {
  town: string; // normalized, '' if unknown
  townLabel: string; // "Nasugbu"
  label: string; // "Nasugbu, Batangas"
  lat: number | null;
  lng: number | null;
}

export interface BranchLite {
  id: number;
  shop_name: string;
  province: string | null;
  city: string | null;
  barangay: string | null;
  latitude: number | null;
  longitude: number | null;
  total_bays: number | null;
}

const FALLBACK_RADIUS_KM = 8;

export function isBranchInArea(shop: BranchLite, area: CustomerArea): boolean {
  const shopTown = normalizeTown(shop.city);
  if (area.town && shopTown) return shopTown === area.town;
  if (area.lat != null && area.lng != null && shop.latitude != null && shop.longitude != null) {
    return distanceKm(area.lat, area.lng, shop.latitude, shop.longitude) <= FALLBACK_RADIUS_KM;
  }
  return false;
}

// Browser GPS -> town name (OpenStreetMap reverse geocoding).
export async function detectArea(): Promise<
  { ok: true; area: CustomerArea } | { ok: false; reason: "denied" | "unsupported" | "failed" }
> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { ok: false, reason: "unsupported" };
  const pos = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, (err) => resolve(err.code === 1 ? null : null), {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 10 * 60 * 1000,
    });
  });
  if (!pos) {
    const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName }).catch(() => null);
    return { ok: false, reason: perm?.state === "denied" ? "denied" : "failed" };
  }
  const { latitude: lat, longitude: lng } = pos.coords;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lng}`,
      { headers: { "Accept-Language": "en" } }
    );
    const json = await res.json();
    const a = json?.address ?? {};
    const town: string = a.city || a.town || a.municipality || a.village || "";
    const province: string = a.province || a.state || "";
    return {
      ok: true,
      area: {
        town: normalizeTown(town),
        townLabel: town || "your area",
        label: [town, province].filter(Boolean).join(", ") || "your area",
        lat,
        lng,
      },
    };
  } catch {
    // No town name -- still usable through distance to each branch.
    return { ok: true, area: { town: "", townLabel: "your area", label: "your area", lat, lng } };
  }
}

// ---------- Status helpers ----------
export function isCancelled(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  return s === "cancelled" || s === "canceled" || s === "voided";
}

// Starts a GCash (PayMongo) payment through the `create-gcash-source` edge
// function. On a non-2xx response supabase-js returns `data: null` and hides
// the function's JSON body inside `error.context`, so we read it out here to
// show the customer the real reason instead of a generic "try again".
export async function startGcashPayment(
  supabase: Pick<SupabaseClient, "functions">,
  body: { bookingId: string | number; amount: number; returnUrl: string; table?: "reservation" | "home_service" },
): Promise<{ checkoutUrl: string; error?: undefined } | { checkoutUrl?: undefined; error: string }> {
  const { data, error } = await supabase.functions.invoke("create-gcash-source", { body });
  if (!error && data?.checkoutUrl) return { checkoutUrl: data.checkoutUrl as string };

  let payload: any = data;
  const ctx = error?.context;
  if (!payload && ctx && typeof ctx.json === "function") {
    try { payload = await ctx.clone().json(); } catch { /* not JSON */ }
  }
  const message =
    payload?.details?.[0]?.detail ?? payload?.error ?? error?.message ?? "GCash didn’t return a checkout link.";
  return { error: String(message) };
}
