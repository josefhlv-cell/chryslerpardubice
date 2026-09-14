import { Capacitor } from "@capacitor/core";

/** Production web origin used for OAuth allowlists and docs. */
export const PUBLIC_SITE_URL = "https://chryslerpardubice.site";

/** Custom URL scheme from capacitor.config.ts ios.scheme. */
export const NATIVE_URL_SCHEME = "chdp-servis";

/**
 * OAuth redirect target for Lovable / Supabase social login.
 *
 * Using bare `window.location.origin` on Capacitor often returns
 * `capacitor://localhost` (or similar). Providers then bounce back to an
 * unknown path; React Router hits the `*` route and shows the in-app 404
 * ("Stránka nebyla nalezena") — exactly what App Review reported for social login.
 *
 * On native platforms prefer the production HTTPS callback (allowlisted in
 * Supabase / Google Cloud). Primary Google path on iOS is native id_token;
 * this redirect is the fallback for Android / web-in-webview OAuth.
 */
export function getAuthRedirectUri(): string {
  if (typeof window === "undefined") {
    return `${PUBLIC_SITE_URL}/auth/callback`;
  }

  const origin = window.location.origin;
  if (
    Capacitor.isNativePlatform() ||
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://") ||
    origin.startsWith(`${NATIVE_URL_SCHEME}://`)
  ) {
    return `${PUBLIC_SITE_URL}/auth/callback`;
  }

  return `${origin}/auth/callback`;
}
