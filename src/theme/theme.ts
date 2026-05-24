import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 7,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6d28d9',
    onPrimary: '#ffffff',
    primaryContainer: '#ede9fe',
    onPrimaryContainer: '#2e1065',
    secondary: '#0ea5e9',
    onSecondary: '#ffffff',
    secondaryContainer: '#e0f2fe',
    onSecondaryContainer: '#082f49',
    tertiary: '#10b981',
    onTertiary: '#ffffff',
    tertiaryContainer: '#d1fae5',
    onTertiaryContainer: '#064e3b',
    background: '#fbf7ff',
    onBackground: '#17111f',
    surface: '#ffffff',
    onSurface: '#17111f',
    surfaceVariant: '#f1ecff',
    onSurfaceVariant: '#6b5f7a',
    outline: '#d8cfea',
    outlineVariant: '#eee6fb',
    error: '#e11d48',
    onError: '#ffffff',
    errorContainer: '#ffe4e6',
    onErrorContainer: '#9f1239',
    elevation: {
      level0: 'transparent',
      level1: '#ffffff',
      level2: '#f7f1ff',
      level3: '#f2eaff',
      level4: '#eee4ff',
      level5: '#eadfff'
    }
  }
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 7,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#38bdf8',
    onPrimary: '#031525',
    primaryContainer: '#0b3448',
    onPrimaryContainer: '#d7f3ff',
    secondary: '#2dd4bf',
    onSecondary: '#042f2e',
    secondaryContainer: '#123d3a',
    onSecondaryContainer: '#ccfbf1',
    tertiary: '#34d399',
    onTertiary: '#022c22',
    tertiaryContainer: '#0a4c36',
    onTertiaryContainer: '#d1fae5',
    background: '#070b12',
    onBackground: '#eef6ff',
    surface: '#0d1420',
    onSurface: '#eef6ff',
    surfaceVariant: '#172233',
    onSurfaceVariant: '#aebed0',
    outline: '#405267',
    outlineVariant: '#203044',
    inverseSurface: '#eaf4ff',
    inverseOnSurface: '#0b1220',
    error: '#fb7185',
    onError: '#3f0712',
    errorContainer: '#5f1423',
    onErrorContainer: '#ffe4e9',
    elevation: {
      level0: 'transparent',
      level1: '#0f1724',
      level2: '#121d2b',
      level3: '#162337',
      level4: '#1a2a42',
      level5: '#20334f'
    }
  }
};
