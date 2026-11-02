// Iisang price list para sa booking (customer/reserve.tsx) at sa
// "Upgrade to Premium" (customer/history.tsx).
//
// IMPORTANTE: may kopya rin nito sa database --
// supabase/sql/2026-11_reservation_premium_upgrade.sql (wash_list_price).
// Doon kinukuha ng server ang totoong presyo ng upgrade, kaya kapag binago
// ang presyo dito, baguhin din doon.

export type VehicleType =
  | 'Motorcycle'
  | 'Big Bike'
  | 'Sedan'
  | 'Coupe'
  | 'Hatchback'
  | 'SUV'
  | 'Crossover'
  | 'Pickup'
  | 'Off-road'
  | 'Sport'
  | 'Muscle'
  | 'Roadster'
  | 'Cabriolet'
  | 'Convertible'
  | 'Wagon'
  | 'Micro'
  | 'Van'
  | 'Oversize Van'
  | 'Limousine';

export type PackageType = 'Basic Wash' | 'Premium Wash';

export type PriceEntry = number | [number, number];

// Price list update: +₱50 across the board, except Motorcycle (+₱10 only).
export const BASIC_WASH_PRICING: Partial<Record<VehicleType, PriceEntry>> = {
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

export const PREMIUM_WASH_PRICING: Partial<Record<VehicleType, PriceEntry>> = {
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

export function isBasicWash(serviceType: string | null | undefined) {
  return !!serviceType && serviceType.trim().toLowerCase().startsWith('basic');
}

// Magkano ang idadagdag para gawing Premium ang isang Basic Wash ng
// sasakyang ito. null = walang Premium para sa sasakyang ito (hal. Oversize
// Van), o naka-range pa ang presyo kaya staff ang magsasabi ng halaga.
export function premiumUpgradeCost(vehicleType: string | null | undefined): number | null {
  const basic = BASIC_WASH_PRICING[vehicleType as VehicleType];
  const premium = PREMIUM_WASH_PRICING[vehicleType as VehicleType];
  if (typeof basic !== 'number' || typeof premium !== 'number') return null;
  return Math.max(0, premium - basic);
}
