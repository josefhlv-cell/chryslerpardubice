# Nativní Google Sign-In (iOS)

## Proč

Po OAuth přes Lovable/browser se aplikace vracela na `capacitor://localhost/...` a React Router ukazoval **404 – Stránka nebyla nalezena** (spodní navigace zůstala vidět). Apple už jede přes nativní `signInWithIdToken`; Google na iOS teď stejně.

## Co je v kódu

- Plugin: `@capgo/capacitor-social-login` (Capacitor 8 / SPM)
- `src/lib/native/google-sign-in.ts` → nativní Google → `supabase.auth.signInWithIdToken({ provider: 'google' })`
- `Auth.tsx`: na iOS Google tlačítko používá nativní cestu; web + Android zůstávají u Lovable OAuth
- Fallback redirect na nativu: `https://chryslerpardubice.site/auth/callback` (místo `capacitor://localhost`)

## Ruční kroky (Robin)

### 1) Google Cloud Console

1. Projekt → **APIs & Services → Credentials**
2. Vytvoř **OAuth client ID – Web application**
   - Poznamenej **Client ID** → `VITE_GOOGLE_WEB_CLIENT_ID`
   - Authorized redirect URIs (pro web OAuth):  
     `https://chryslerpardubice.site/auth/callback`  
     + Supabase callback `https://nzmeiluvpmchipyssdms.supabase.co/auth/v1/callback` (pokud ho používáte)
3. Vytvoř **OAuth client ID – iOS**
   - Bundle ID: `cz.chryslerpardubice.chdpgarage`
   - Poznamenej **Client ID** → `VITE_GOOGLE_IOS_CLIENT_ID` (tvar `….apps.googleusercontent.com`)
   - **iOS URL scheme** (reversed) začíná `com.googleusercontent.apps.` — Codemagic ho odvodí z Client ID automaticky

### 2) Supabase → Authentication → Providers → Google

- Zapni Google provider
- **Client ID** = **Web** client ID (stejné jako `VITE_GOOGLE_WEB_CLIENT_ID`)
- **Client Secret** = secret z Web OAuth klienta
- Native id_token audience musí sedět na Web client ID (`iOSServerClientId` v pluginu = web client)

### 3) Env vars (Lovable + Codemagic)

Nastav v Codemagic (Application → Environment variables) **a** v Lovable env:

| Proměnná | Hodnota |
|---|---|
| `VITE_GOOGLE_WEB_CLIENT_ID` | Web OAuth Client ID |
| `VITE_GOOGLE_IOS_CLIENT_ID` | iOS OAuth Client ID |

Bez těchto hodnot build projde, ale nativní Google na zařízení selže s českou hláškou o chybějící konfiguraci.

### 4) TestFlight plán

1. Spusť Codemagic workflow `ios-appstore`
2. V logu ověř: `Adding Google URL scheme: com.googleusercontent.apps.…` a `SocialLogin` v CapApp-SPM
3. Na zařízení: **Pokračovat přes Google** → systémový Google sheet → přihlášení **bez** 404
4. Ověř, že **Sign in with Apple** stále funguje
5. Na webu ověř, že Google stále jde přes Lovable OAuth

## Poznámky

- Složka `ios/` se v CI maže a tvoří znovu — URL scheme a `GIDClientID` se patchují v `codemagic.yaml`
- `ios-ci/AppDelegate.swift` forwarduje Google URL přes `GIDSignIn.sharedInstance.handle`
