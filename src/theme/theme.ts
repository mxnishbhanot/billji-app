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
    primary: '#a78bfa',
    onPrimary: '#1f1147',
    primaryContainer: '#3b1f75',
    onPrimaryContainer: '#ede9fe',
    secondary: '#38bdf8',
    onSecondary: '#082f49',
    secondaryContainer: '#12384f',
    onSecondaryContainer: '#e0f2fe',
    tertiary: '#34d399',
    onTertiary: '#052e2b',
    tertiaryContainer: '#064e3b',
    onTertiaryContainer: '#d1fae5',
    background: '#0b0a12',
    onBackground: '#f8f3ff',
    surface: '#171421',
    onSurface: '#f8f3ff',
    surfaceVariant: '#282334',
    onSurfaceVariant: '#cfc3df',
    outline: '#655a75',
    outlineVariant: '#342d43',
    inverseSurface: '#f1ecff',
    inverseOnSurface: '#17111f',
    error: '#fb7185',
    onError: '#450a0a',
    errorContainer: '#7f1d1d',
    onErrorContainer: '#ffe4e6',
    elevation: {
      level0: 'transparent',
      level1: '#171421',
      level2: '#1d1829',
      level3: '#241d34',
      level4: '#2b233e',
      level5: '#332848'
    }
  }
};
