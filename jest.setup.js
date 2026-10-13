// TEST-01 (2026-10-13): engines/zk6.ts → lib/adminOps → lib/subscriberAdminClient
// imports AsyncStorage, whose native module is null under jest, so any suite that
// imported the client engine failed at load ("NativeModule: AsyncStorage is null").
// The package ships an in-memory jest mock; wire it here for every suite.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
