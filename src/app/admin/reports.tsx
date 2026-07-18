import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type ReportCard = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  route: Href;
};

const reportCards: ReportCard[] = [
  { icon: 'bar-chart-outline',      label: 'Daily Sales Report',      color: '#3B82F6', route: '/reports/daily-sales' as Href            },
  { icon: 'trending-up-outline',    label: 'Monthly Sales Report',    color: '#22C55E', route: '/reports/monthly-sales' as Href          },
  { icon: 'walk-outline',           label: 'Walk-in Earnings',        color: '#F59E0B', route: '/reports/walkin-earnings' as Href        },
  { icon: 'home-outline',           label: 'Home Service Earnings',   color: '#A855F7', route: '/reports/homeservice-earnings' as Href   },
  { icon: 'people-outline',         label: 'Staff Payroll Report',    color: '#22C55E', route: '/reports/staff-payroll' as Href          },
  { icon: 'trending-down-outline',  label: 'Profit / Loss Report',    color: '#EF4444', route: '/reports/profit-loss' as Href            },
  { icon: 'document-text-outline',  label: 'Service Summary',         color: '#3B82F6', route: '/reports/service-summary' as Href        },
  { icon: 'car-outline',            label: 'Bay Utilization Report',  color: '#F59E0B', route: '/reports/bay-utilization' as Href        },
];

export default function ReportsScreen(): React.ReactElement {
  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Reports</Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* REPORT CARDS GRID */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {reportCards.map((item: ReportCard, index: number) => (
            <TouchableOpacity
              key={index}
              style={styles.card}
              onPress={() => router.push(item.route)}
            >
              <View style={[styles.iconBox, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={28} color={item.color} />
              </View>

              <Text style={styles.cardLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  headerSpacer: {
    width: 40,
  },

  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  cardLabel: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});