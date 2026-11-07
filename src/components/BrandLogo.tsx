// The I-CarWash logo (same image as the website's logo), used everywhere the
// app shows its brand: loading screen, portal screen and the login headers.
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const LOGO = require('../../assets/images/logo.png');

export function BrandLogo({ size = 48, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.22 }, style]}>
      <Image source={LOGO} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B2A6B',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
