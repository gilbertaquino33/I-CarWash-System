import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { addReminderTapListener } from '../lib/notifications';

export default function RootLayout() {
  // Tapping a reservation reminder notification opens Transaction History.
  // No-op where expo-notifications is unavailable (e.g. Expo Go on iOS).
  useEffect(() => {
    const sub = addReminderTapListener(() => router.push('/customer/history' as any));
    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Landing / Login page */}
      <Stack.Screen name="index" />

      {/* Main Customer Dashboard */}
      <Stack.Screen name="customer/dashboard" />

      {/* Payment Redirect Screen */}
      <Stack.Screen
        name="payment-return"
        options={{
          headerShown: false,
          animation: 'none',
        }}
      />
    </Stack>
  );
}
