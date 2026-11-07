// Turns raw Supabase / network errors ("Network request failed",
// "Invalid login credentials", "AuthRetryableFetchError" ...) into a title +
// message a customer can actually understand. Used by every login,
// registration and forgot-password screen.

export interface FriendlyError {
  title: string;
  message: string;
  // true when the phone couldn't reach the server at all -- the modal shows a
  // "no connection" icon instead of the generic error one.
  offline: boolean;
}

const OFFLINE_PATTERN =
  /network request failed|failed to fetch|fetch failed|unknownhost|unable to resolve host|no address associated|timed? ?out|econn|enotfound|retryablefetcherror|network ?error|internet/i;

export function isOfflineError(err: unknown): boolean {
  const e = err as { message?: string; name?: string; status?: number } | null;
  const text = `${e?.name ?? ''} ${e?.message ?? String(err ?? '')}`;
  // Supabase reports "no response at all" as status 0.
  return OFFLINE_PATTERN.test(text) || e?.status === 0;
}

// For screens whose modal takes (title, message): showError(...authErrorArgs(error, 'Failed to Send Code')).
export function authErrorArgs(err: unknown, fallbackTitle: string): [string, string] {
  const f = friendlyAuthError(err, fallbackTitle);
  return [f.title, f.message];
}

export function friendlyAuthError(err: unknown, fallbackTitle = 'Something Went Wrong'): FriendlyError {
  if (isOfflineError(err)) {
    return {
      title: 'No Internet Connection',
      message:
        'We couldn’t connect to I-CarWash. Please turn on your Wi-Fi or mobile data, make sure it’s working, then try again.',
      offline: true,
    };
  }

  const raw = String((err as { message?: string } | null)?.message ?? err ?? '');
  const msg = raw.toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return {
      title: 'Wrong Email or Password',
      message: 'The email or password you entered is incorrect. Please check them and try again.',
      offline: false,
    };
  }
  if (msg.includes('email not confirmed')) {
    return {
      title: 'Email Not Verified',
      message: 'Please open the verification link we sent to your email first, then log in again.',
      offline: false,
    };
  }
  if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('already exists')) {
    return {
      title: 'Already Registered',
      message: 'This email already has an account. Please log in instead.',
      offline: false,
    };
  }
  if (msg.includes('password should be at least') || msg.includes('weak password') || msg.includes('weak_password')) {
    return {
      title: 'Password Too Short',
      message: 'Your password must be at least 6 characters long.',
      offline: false,
    };
  }
  if (msg.includes('unable to validate email') || msg.includes('invalid email') || (msg.includes('email address') && msg.includes('invalid'))) {
    return {
      title: 'Invalid Email',
      message: 'Please enter a valid email address, for example juan@gmail.com.',
      offline: false,
    };
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('security purposes')) {
    return {
      title: 'Too Many Attempts',
      message: 'Please wait a minute before trying again.',
      offline: false,
    };
  }
  if (msg.includes('token has expired') || msg.includes('otp') || msg.includes('invalid token')) {
    return {
      title: 'Invalid or Expired Code',
      message: 'The code is wrong or has expired. Please check your email or request a new code.',
      offline: false,
    };
  }

  return {
    title: fallbackTitle,
    message: 'Something went wrong on our side. Please try again in a moment.',
    offline: false,
  };
}
