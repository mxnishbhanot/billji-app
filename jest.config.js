module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transformIgnorePatterns: [
    // `expo-.*` covers every expo-prefixed package (expo-device, expo-secure-store, ...);
    // the bare `expo(nent)?` alternative only matches the `expo` package itself, so each
    // one shipped as untranspiled ESM would otherwise break any suite that reaches it.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-.*|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-paper|react-native-vector-icons|@react-native-community/datetimepicker)/)'
  ]
};
