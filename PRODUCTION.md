# Production build — iOS & Android

Aplikace je připravená pro nativní build přes Capacitor 8. Web build běží beze změny (`vite build`); nativní bridge a push notifikace se inicializují jen na zařízení.

## 1. Co je nakonfigurováno

| Oblast | Stav |
|---|---|
| Capacitor config | Produkce načítá bundle z `dist/` (žádné `server.url`). Pro live-reload nastav `CAP_LIVE_RELOAD=1` před `npx cap sync`. |
| Splash screen | `#0d1117` pozadí, amber spinner, auto-hide po 1.5 s (`@capacitor/splash-screen`). |
| Status bar | Dark style, `#0d1117` (`@capacitor/status-bar`). |
| Bluetooth | `@capacitor-community/bluetooth-le` + Android 12+ runtime permissions (BLUETOOTH_SCAN/CONNECT, neverForLocation). |
| Push notifikace | `@capacitor/push-notifications`, token se ukládá do `public.device_tokens` (RLS na uživatele + admin). Android 13+ `POST_NOTIFICATIONS` runtime permission. |
| Back button | Android — router-friendly přes `@capacitor/app`. |
| Ikony | `public/icons/icon-ios-512.png`, `icon-android-512.png` (uprav přes Android Studio Image Asset / Xcode Asset Catalog). |

## 2. Lokální build kroky (po `git pull`)

```bash
npm install
npm run build
npx cap sync
# Android
npx cap open android   # → Build > Generate Signed Bundle/APK (AAB pro Play Store)
# iOS
npx cap open ios       # → Xcode: Signing & Capabilities → Push Notifications + Background Modes (Remote notifications)
```

## 3. CI build (Codemagic — `codemagic.yaml`)

- `android-workflow`: produkuje `app-debug.apk` + `app-release.aab`. Pro podepsaný release nastav env: `CM_KEYSTORE_PATH`, `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS`, `CM_KEY_PASSWORD`.
- `ios-workflow`: unsigned build pro ověření. Pro App Store doplň Apple Developer signing v Codemagic UI a archive scheme.

## 4. Push notifikace — co je potřeba doplnit mimo kód

**Android (FCM):**
1. Vytvoř Firebase projekt → Add Android app s package id `app.lovable.c6d932101224420590deeec3ccc6923f`.
2. Stáhni `google-services.json` a vlož do `android/app/google-services.json` (build.gradle ho auto-detekuje).
3. V Firebase Console → Cloud Messaging si poznamenej **Server key / Service account JSON** pro odesílací edge function.

**iOS (APNs):**
1. V Apple Developer Console povol pro App ID **Push Notifications**.
2. Vygeneruj **APNs Auth Key (.p8)** + poznamenej Key ID a Team ID.
3. V Xcode → App target → Signing & Capabilities přidej **Push Notifications** a **Background Modes → Remote notifications**.

**Odesílání:**
Tokeny jsou v `public.device_tokens` (sloupce: `user_id`, `token`, `platform`). Doplň edge function `send-push` (FCM HTTP v1 + APNs HTTP/2) která čte tokeny pro daného `user_id` a posílá payload `{ title, body, data: { link } }`. Můžeš ji navázat na existující trigger `notify_admins_event` (insert do `notifications` → enqueue push).

## 5. Bluetooth (OBD)

Funguje out-of-the-box. iOS Info.plist klíče (`NSBluetooth*UsageDescription`) jsou patchované v `codemagic.yaml` během iOS workflow. Pokud buildíš lokálně přes Xcode, ujisti se že tam ty klíče zůstaly.

## 6. Ikony & splash

Aktuální zdrojové soubory jsou v `public/icons/`. Pro generování všech velikostí doporučuji:
```bash
npx @capacitor/assets generate --iconBackgroundColor "#0d1117" --splashBackgroundColor "#0d1117"
```
(Zdroj: `resources/icon.png` 1024×1024 a `resources/splash.png` 2732×2732.)
