import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// Kuha sa Supabase → Settings → API
const supabaseUrl = 'https://hybszzpgtbuubdotqkqq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5YnN6enBndGJ1dWJkb3Rxa3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzgxMjEsImV4cCI6MjA5Nzg1NDEyMX0.tBmgutdqhzRvP4nzDdYHL6nx3IcXoc2iFwQmLUGA63A'; 

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
