jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// --- expo-router -----------------------------------------------------------
// Screens under src/app are rendered directly in tests, so there is no
// NavigationContainer above them. Without this, any screen that calls
// useFocusEffect/useRouter throws "Couldn't find a navigation object".
jest.mock('expo-router', () => {
  const React = require('react');

  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    setParams: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
  };

  // Behaves like a focused screen: run the effect once on mount, run its
  // cleanup on unmount.
  const useFocusEffect = (effect) => {
    React.useEffect(effect, [effect]);
  };

  const Link = ({ children }) => children ?? null;
  Link.Trigger = ({ children }) => children ?? null;

  const Stack = ({ children }) => children ?? null;
  Stack.Screen = () => null;

  const Tabs = ({ children }) => children ?? null;
  Tabs.Screen = () => null;

  return {
    router,
    useRouter: () => router,
    useNavigation: () => ({
      navigate: router.navigate,
      goBack: router.back,
      addListener: jest.fn(() => jest.fn()),
      setOptions: jest.fn(),
      isFocused: jest.fn(() => true),
    }),
    useFocusEffect,
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    useSegments: () => [],
    usePathname: () => '/',
    Link,
    Redirect: () => null,
    Slot: ({ children }) => children ?? null,
    Stack,
    Tabs,
    SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() },
  };
});

// --- supabase --------------------------------------------------------------
// Tests must never hit the real project. Every query builder method is
// chainable and the builder itself is awaitable, so any chain length works:
//   await supabase.from('x').select('y').eq(...).order(...)
jest.mock('./src/lib/supabase', () => {
  const makeQuery = (result = { data: [], error: null }) => {
    const query = {
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      catch: (onRejected) => Promise.resolve(result).catch(onRejected),
      finally: (onFinally) => Promise.resolve(result).finally(onFinally),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      csv: jest.fn(() => Promise.resolve({ data: '', error: null })),
    };
    const chainable = [
      'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt',
      'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'not', 'or', 'and',
      'filter', 'match', 'order', 'limit', 'range', 'contains', 'overlaps',
      'textSearch', 'abortSignal', 'returns', 'throwOnError',
    ];
    chainable.forEach((method) => {
      query[method] = jest.fn(() => query);
    });
    return query;
  };

  const makeChannel = (topic = 'mock-channel') => {
    const channel = { topic, state: 'joined' };
    channel.on = jest.fn(() => channel);
    channel.subscribe = jest.fn(() => channel);
    channel.unsubscribe = jest.fn(() => Promise.resolve('ok'));
    channel.send = jest.fn(() => Promise.resolve('ok'));
    return channel;
  };

  const session = {
    user: { id: 'test-user-id', email: 'admin@test.local' },
    access_token: 'test-token',
  };

  const supabase = {
    from: jest.fn(() => makeQuery()),
    rpc: jest.fn(() => makeQuery()),
    channel: jest.fn((name) => makeChannel(name)),
    getChannels: jest.fn(() => []),
    removeChannel: jest.fn(() => Promise.resolve('ok')),
    removeAllChannels: jest.fn(() => Promise.resolve([])),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session }, error: null })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: session.user }, error: null })),
      signInWithPassword: jest.fn(() => Promise.resolve({ data: { session }, error: null })),
      signUp: jest.fn(() => Promise.resolve({ data: { session }, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      resetPasswordForEmail: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      updateUser: jest.fn(() => Promise.resolve({ data: { user: session.user }, error: null })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(() => Promise.resolve({ data: { path: 'mock/path' }, error: null })),
        remove: jest.fn(() => Promise.resolve({ data: [], error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.test/mock.png' } })),
      })),
    },
  };

  return { supabase, __makeQuery: makeQuery };
});
