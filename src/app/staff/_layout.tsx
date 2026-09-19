import { Stack, router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const CHANGE_PASSWORD_ROUTE = '/staff/change-password';

// Mga screen na hindi dapat i-redirect: ang mismong change-password page (para
// walang loop), at ang forgot-password flow (may pansamantalang recovery
// session doon na hindi pa ito ang "real" login).
const EXEMPT_ROUTES = [CHANGE_PASSWORD_ROUTE, '/staff/staff_forgot_password'];

export default function StaffLayout() {
  const pathname = usePathname();

  // Staff na bagong gawa ng admin ay may `must_change_password` sa metadata.
  // Hangga't nandiyan ang flag, anumang staff screen ang buksan (login, saved
  // session, deep link) ay ibabalik sila sa change-password page.
  useEffect(() => {
    if (EXEMPT_ROUTES.includes(pathname)) return;

    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session?.user.user_metadata?.must_change_password === true) {
        router.replace(CHANGE_PASSWORD_ROUTE as any);
      }
    });

    return () => {
      active = false;
    };
  }, [pathname]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
