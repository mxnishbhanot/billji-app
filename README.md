# Billji Mobile

React Native + Expo mobile app for Billji / QuickInvoice. It connects to the QuickInvoice backend API for auth, products, customers, invoices, PDFs, sharing, reports, and notifications.

## Tech Stack

- Expo 56
- React Native 0.85
- React 19
- TypeScript
- React Navigation
- React Native Paper
- Axios
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Socket.IO client

## Required Installs

- Node.js `18.18.0` or newer.
- npm, included with Node.js.
- Expo Go app on phone for quick testing, or Android Studio emulator for Android testing.
- EAS CLI only if building APK/AAB files:

```bash
npm install -g eas-cli
```

## Setup

Install dependencies and create an env file:

```bash
npm install
cp .env.example .env
```

Set `.env` based on where backend runs:

```env
# Android emulator
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5000/api

# Physical phone on same Wi-Fi, use your computer LAN IP
# EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:5000/api

# iOS simulator or web
# EXPO_PUBLIC_API_BASE_URL=http://localhost:5000/api
```

For a physical phone, keep phone and backend computer on the same Wi-Fi, then use your computer IP.

## Run

Start Expo:

```bash
npm start
```

Run target:

```bash
npm run android
npm run ios
npm run web
```

## Scripts

```bash
npm start
npm run android
npm run ios
npm run web
npm run typecheck
npm run lint
npm run build:android
```

## Android Build

Login to Expo/EAS:

```bash
eas login
```

Build APK for testing:

```bash
eas build --profile preview --platform android
```

Build production Android App Bundle:

```bash
eas build --profile production --platform android
```

Build profiles read `EXPO_PUBLIC_API_BASE_URL` from `eas.json` — point it at your new Railway backend URL (placeholder `REPLACE_WITH_NEW_RAILWAY_API_BASE_URL`). CI/CD details: see [docs/CICD.md](docs/CICD.md).

## Backend Requirement

Backend API must be running before login/register works.

Local default URLs:

- Android emulator: `http://10.0.2.2:5000/api`
- iOS simulator or web: `http://localhost:5000/api`
- Physical phone: `http://YOUR_COMPUTER_LAN_IP:5000/api`

Mobile real-time updates use Socket.IO and the same API base URL without `/api`.
