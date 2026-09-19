import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

// Kuha sa Supabase → Settings → API
const supabaseUrl = 'https://hybszzpgtbuubdotqkqq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5YnN6enBndGJ1dWJkb3Rxa3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzgxMjEsImV4cCI6MjA5Nzg1NDEyMX0.tBmgutdqhzRvP4nzDdYHL6nx3IcXoc2iFwQmLUGA63A'; 

// Static web export (expo-router) pre-renders in Node, where `window` doesn't
// exist and AsyncStorage's web build (localStorage) throws. Walang session
// na ipe-persist sa server; sa browser/native normal pa rin.
const isServer = typeof window === 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});

// Itigil ang auto token refresh kapag naka-background ang app (hal. habang
// nagbabayad sa GCash app). Pinuputol ng Android ang network ng background
// apps, kaya ang refresh timer ay nauuwi sa "UnknownHostException: Unable
// to resolve host" na error. Muling sisimulan kapag bumalik sa app.
// Ayon sa rekomendasyon ng Supabase para sa React Native.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
