# iOS build přes Codemagic – push notifikace a location (bez Xcode)

Tento projekt buildujeme přes **Codemagic**. Xcode se **nepoužívá**. Následující kroky připravují repozitář tak, aby Codemagic sestavil iOS aplikaci s push notifikacemi a povolením polohy.

## 1) Codemagic pipeline

V `codemagic.yaml` musí být před `xcode-project build-ipa` tato posloupnost:

```yaml
scripts:
  - name: Install deps
    script: npm ci
  - name: Web build
    script: npm run build
  - name: Add iOS platform if missing
    script: |
      if [ ! -d "ios" ]; then npx cap add ios; fi
  - name: Capacitor sync
    script: npx cap sync ios
  - name: Cocoapods
    script: cd ios/App && pod install
```

Codemagic sám udělá `xcode-project use-profiles` – používá provisioning profile z Apple Developer.

## 2) Apple Developer Portal (ručně, jednorázově)

1. **Identifiers → App IDs** – u App ID `app.lovable.c6d932101224420590deeec3ccc6923f`
   zapněte capability **Push Notifications**.
2. **Keys** – vytvořte APNs klíč (.p8), poznamenejte Key ID a Team ID.
3. **Profiles** – vygenerujte **App Store** i **Ad Hoc** provisioning profile,
   který obsahuje Push Notifications capability.
4. V Codemagic → **Teams → Code signing identities** nahrajte tento profile + distribuční certifikát.

## 3) Info.plist a entitlements

Až Codemagic vytvoří složku `ios/`, do těchto souborů musí být tyto klíče
(Capacitor je při `cap sync` nepřepisuje, takže je bezpečné je nastavit jednou):

**`ios/App/App/Info.plist`** – přidejte do `<dict>`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Aplikace používá polohu pro servisní služby, diagnostiku a bezpečnost účtu.</string>
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Aplikace používá Bluetooth pro připojení k OBD adaptéru vozidla.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Aplikace používá Bluetooth pro připojení k OBD adaptéru vozidla.</string>
<key>NSCameraUsageDescription</key>
<string>Fotoaparát je používán pro skenování VIN a SPZ.</string>
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

**`ios/App/App/App.entitlements`**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>aps-environment</key>
  <string>production</string>
</dict>
</plist>
```

Pro dev buildy použijte `development` místo `production`.

## 4) Android / FCM

- `android/app/src/main/AndroidManifest.xml` – push a location permissions jsou už v repozitáři.
- Pro FCM push nahrajte `google-services.json` do `android/app/` a v `android/app/build.gradle`
  aplikujte plugin `com.google.gms.google-services`.
- Bez `google-services.json` push notifikace na Androidu **fungovat nebudou**,
  aplikace ale poběží.

## 5) Supabase

- Push tokeny se ukládají do tabulky `public.user_push_tokens` (už existuje, RLS OK).
- Backend edge funkce `send-push` odesílá push přes FCM/APNs. Do secrets doplňte
  `FCM_SERVER_KEY` a `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (obsah `.p8`).

## 6) Ověření po buildu

1. Nainstalujte IPA z Codemagic na testovací iPhone (TestFlight).
2. Přihlaste se – při první diagnostice se objeví systémový dialog pro polohu i push.
3. Zkontrolujte v Supabase, že `user_push_tokens` má nový záznam s `platform = 'ios'`.
