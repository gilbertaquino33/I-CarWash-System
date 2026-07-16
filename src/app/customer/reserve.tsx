import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------- PRICING DATA ----------
type VehicleType =
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

type PackageType = 'Basic Wash' | 'Premium Wash';

type PriceEntry = number | [number, number];


const BASIC_WASH_PRICING: Partial<Record<VehicleType, PriceEntry>> = {
  Motorcycle: 100,      // CARWASH ORIGINAL
  Micro: 120,           
  Hatchback: 130,       
  Sedan: 150,           // CARWASH ORIGINAL
  Coupe: 150,          
  Convertible: 170,    
  Cabriolet: 170,      
  Wagon: 160,          
  SUV: 190,             //CARWASH ORIGINAL
  Pickup: 190,          //CARWASH ORIGINAL
  Crossover: 190,      
  Sport: 200,           
  Muscle: 200,          
  Roadster: 200,       
  'Off-road': 220,      
  Van: 250,            //CARWASH ORIGINAL
  Limousine: 320,       
  'Oversize Van': [300, 350], //CARWASH ORIGINAL
};

const PREMIUM_WASH_PRICING: Partial<Record<VehicleType, PriceEntry>> = {
  Motorcycle: 150,      // ORIGINAL
  'Big Bike': 250,      // ORIGINAL
  Micro: 230,           
  Hatchback: 260,       
  Sedan: 300,           // ORIGINAL
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
  Pickup: 390,          // ORIGINAL
  Van: 450,             // ORIGINAL
  Limousine: 550,       
};

const VEHICLE_ICONS: Record<VehicleType, keyof typeof Ionicons.glyphMap> = {
  Motorcycle: 'bicycle-outline',
  'Big Bike': 'bicycle-outline',
  Sedan: 'car-sport-outline',
  Coupe: 'car-sport-outline',
  Hatchback: 'car-outline',
  SUV: 'car-outline',
  Crossover: 'car-outline',
  Pickup: 'car-outline',
  'Off-road': 'car-outline',
  Sport: 'car-sport-outline',
  Muscle: 'car-sport-outline',
  Roadster: 'car-sport-outline',
  Cabriolet: 'car-sport-outline',
  Convertible: 'car-sport-outline',
  Wagon: 'car-outline',
  Micro: 'car-outline',
  Van: 'bus-outline',
  'Oversize Van': 'bus-outline',
  Limousine: 'car-outline',
};

const ALL_VEHICLE_TYPES: VehicleType[] = [
  'Motorcycle',
  'Big Bike',
  'Micro',
  'Hatchback',
  'Sedan',
  'Coupe',
  'Convertible',
  'Cabriolet',
  'Wagon',
  'Sport',
  'Muscle',
  'Roadster',
  'SUV',
  'Crossover',
  'Off-road',
  'Pickup',
  'Van',
  'Oversize Van',
  'Limousine',
];

const formatPrice = (price: PriceEntry) => {
  if (Array.isArray(price)) {
    return `₱${price[0]}–₱${price[1]}`;
  }
  return `₱${price}`;
};

export default function ReserveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ shopId?: string | string[]; shopName?: string | string[] }>();
  const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId ?? '';
  const shopName = Array.isArray(params.shopName) ? params.shopName[0] : params.shopName ?? '';

  const [selectedPackage, setSelectedPackage] = useState<PackageType | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);

  const pricingTable = useMemo(() => {
    if (selectedPackage === 'Basic Wash') return BASIC_WASH_PRICING;
    if (selectedPackage === 'Premium Wash') return PREMIUM_WASH_PRICING;
    return {};
  }, [selectedPackage]);

  const availableVehicles = useMemo(
    () => ALL_VEHICLE_TYPES.filter((v) => pricingTable[v] !== undefined),
    [pricingTable]
  );

  const currentPrice = selectedVehicle ? pricingTable[selectedVehicle] : undefined;

  const handleSelectPackage = (pkg: PackageType) => {
    setSelectedPackage(pkg);
    setSelectedVehicle(null);
  };

  const handleProceed = () => {
    if (!shopId || !selectedPackage || !selectedVehicle || currentPrice === undefined) return;

    router.push({
      pathname: '/customer/checkout' as any,
      params: {
        shopId,
        shopName,
        package: selectedPackage,
        vehicleType: selectedVehicle,
        price: Array.isArray(currentPrice) ? `${currentPrice[0]}-${currentPrice[1]}` : String(currentPrice),
      },
    });
  };

  const canProceed = !!shopId && !!selectedPackage && !!selectedVehicle;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book a Slot</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Ionicons name="calendar-outline" size={56} color="#F5C518" style={{ marginBottom: 12, alignSelf: 'center' }} />
        <Text style={styles.title}>Reservation Form</Text>
        <Text style={styles.subtitle}>{shopName ? `Branch: ${shopName}` : 'Choose a branch from the customer dashboard first.'}</Text>

        <Text style={styles.sectionLabel}>1. Choose Carwash Package</Text>
        <View style={styles.packageRow}>
          {(['Basic Wash', 'Premium Wash'] as PackageType[]).map((pkg) => {
            const isSelected = selectedPackage === pkg;
            return (
              <TouchableOpacity
                key={pkg}
                style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                onPress={() => handleSelectPackage(pkg)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={pkg === 'Premium Wash' ? 'sparkles-outline' : 'water-outline'}
                  size={22}
                  color={isSelected ? '#0F172A' : '#64748B'}
                />
                <Text style={[styles.packageCardText, isSelected && { color: '#0F172A' }]}>{pkg}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedPackage && (
          <>
            <Text style={styles.sectionLabel}>2. Choose Vehicle Type</Text>
            <View style={styles.vehicleGrid}>
              {availableVehicles.map((vehicle) => {
                const isSelected = selectedVehicle === vehicle;
                const price = pricingTable[vehicle]!;
                return (
                  <TouchableOpacity
                    key={vehicle}
                    style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                    onPress={() => setSelectedVehicle(vehicle)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={VEHICLE_ICONS[vehicle]}
                      size={24}
                      color={isSelected ? '#0F172A' : '#64748B'}
                    />
                    <Text style={[styles.vehicleCardText, isSelected && { color: '#0F172A' }]}>
                      {vehicle}
                    </Text>
                    <Text style={[styles.vehicleCardPrice, isSelected && { color: '#0F172A' }]}>
                      {formatPrice(price)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {selectedPackage && selectedVehicle && currentPrice !== undefined && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Package</Text>
              <Text style={styles.summaryValue}>{selectedPackage}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Vehicle Type</Text>
              <Text style={styles.summaryValue}>{selectedVehicle}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotalLabel}>Total Price</Text>
              <Text style={styles.summaryTotalValue}>{formatPrice(currentPrice)}</Text>
            </View>
            {Array.isArray(currentPrice) && (
              <Text style={styles.summaryNote}>
                * Final price, to be confirmed by staff.
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, !canProceed && styles.buttonDisabled]}
          onPress={handleProceed}
          disabled={!canProceed}
        >
          <Text style={[styles.buttonText, !canProceed && styles.buttonTextDisabled]}>
            PROCEED TO CHECKOUT
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backBtn: { padding: 8, backgroundColor: '#F1F5F9', borderRadius: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  content: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 24 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  packageRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  packageCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  packageCardSelected: {
    borderColor: '#F5C518',
    backgroundColor: '#FEFCE8',
  },
  packageCardText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },

  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  vehicleCard: {
    width: '31%',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  vehicleCardSelected: {
    borderColor: '#F5C518',
    backgroundColor: '#FEFCE8',
  },
  vehicleCardText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  vehicleCardPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
  },

  summaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  summaryValue: { fontSize: 13, color: '#fff', fontWeight: '700' },
  summaryDivider: { height: 1, backgroundColor: '#1E293B', marginVertical: 8 },
  summaryTotalLabel: { fontSize: 15, color: '#F5C518', fontWeight: '800' },
  summaryTotalValue: { fontSize: 20, color: '#F5C518', fontWeight: '900' },
  summaryNote: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 10,
    lineHeight: 16,
    fontStyle: 'italic',
  },

  button: {
    backgroundColor: '#0F172A',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  buttonText: { color: '#F5C518', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  buttonTextDisabled: { color: '#94A3B8' },
});