import { Stack } from 'expo-router';

export default function RootLayout() {
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
          animation: 'none' 
        }} 
      />
    </Stack>
  );
}