import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

// Sa Android, minsan idinideliver ang WebBrowser.openAuthSessionAsync na
// redirect bilang normal na deep link, kaya na-a-auto-navigate dito ng
// expo-router -- kahit gamit na ang parehong redirect prefix para sabihin
// sa auth session na "tapos na" ito. Kailangan ito ng isang TOTOONG screen
// (hindi lang basta hindi-rehistradong path) para hindi "Unmatched Route"
// ang lumabas -- ang totoong resulta ng bayad ay hinahawakan na ng
// checkout.tsx mismo (pollGcashPaymentStatus), kaya dito, agad na lang
// bumalik sa checkout (nasa ilalim pa rin ito ng navigation stack, hindi
// na-unmount -- push lang ang ginawa ng deep link, hindi replace).
export default function GcashReservationReturnScreen() {
  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/customer/dashboard' as any);
    }
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
