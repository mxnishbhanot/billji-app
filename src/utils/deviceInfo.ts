import * as Device from 'expo-device';

// Human-friendly device label built from native device constants (expo-device).
// BillJi is Android/mobile only, and the HTTP user-agent (okhttp/expo) carries no
// model, so we capture the real model here and send it to the backend as a header.
// Examples: "Samsung Galaxy S21 · Android 14", "Motorola Edge 40 · Android 13".
const buildDeviceLabel = (): string => {
  const model = Device.modelName?.trim() || '';
  const brand = (Device.brand || Device.manufacturer || '').trim();
  // Avoid "Samsung SM-G991B" style duplication when model already includes brand.
  const named = brand && model && !model.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${model}`
    : model || Device.deviceName?.trim() || '';
  const os = [Device.osName, Device.osVersion].filter(Boolean).join(' ');
  const label = [named, os].filter(Boolean).join(' · ');
  return label.slice(0, 120);
};

// Computed once at startup — these are synchronous constants that never change.
export const deviceLabel = buildDeviceLabel();
