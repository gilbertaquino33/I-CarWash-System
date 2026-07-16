import { useColorScheme } from 'react-native';

export function useTheme() {
  const colorScheme = useColorScheme();
  
  return {
    colorScheme,
    isDark: colorScheme === 'dark',
    colors: {
      text: colorScheme === 'dark' ? '#FFFFFF' : '#11181C',
      background: colorScheme === 'dark' ? '#151718' : '#FFFFFF',
      tint: colorScheme === 'dark' ? '#FFFFFF' : '#0a7ea4',
      icon: colorScheme === 'dark' ? '#9BA1A6' : '#687076',
      tabIconDefault: colorScheme === 'dark' ? '#9BA1A6' : '#687076',
      tabIconSelected: colorScheme === 'dark' ? '#FFFFFF' : '#0a7ea4',
    },
  };
}
