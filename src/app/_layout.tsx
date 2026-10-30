import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { addReminderTapListener } from '../lib/notifications';


// Synchronous return para sa notification handler
Notifications.setNotificationHandler({
  handleNotification: () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

export default function RootLayout() {
  useEffect(() => {
    // Tapping a reservation reminder notification opens Transaction History.
    const sub = addReminderTapListener(() => router.push('/customer/history' as any));

    // Kunin ang push notification token pagka-open ng app
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        console.log("Expo Push Token:", token);
        // Dito mo i-save sa Supabase database mo ang token
      }
    });

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

      {/* GCash redirect landing for Reservation checkout */}
      <Stack.Screen
        name="gcash-reservation-return"
        options={{
          headerShown: false,
          animation: 'none',
        }}
      />
    </Stack>
  );
}

// Helper function para sa pagkuha ng Push Token
async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token: string | undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#208AEF',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      return;
    }
    
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;
      
      const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = pushTokenData.data;
    } catch (e) {
      console.log('Error getting push token:', e);
    }
  }

  return token;
}