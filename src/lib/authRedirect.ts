import { Capacitor } from "@capacitor/core";

/** Production web origin used for OAuth allowlists and docs. */
export const PUBLIC_SITE_URL = "https://chryslerpardubice.site";

/**
 * OAuth redirect target for Lovable / Supabase social login.
 *
 * Using bare `window.location.origin` on Capacitor often returns
 * `capacitor://localhost` (or similar). Providers then bounce back to an
 * unknown path; React Router hits the `*` route and shows the in-app 404
 * ("Stránka nebyla nalezena") — exactly what App Review reported for social login.
 */
export function getAuthRedirectUri(): string {
  if (typeof window === "undefined") {
    return `${PUBLIC_SITE_URL}/auth/callback`;
  }

  // Always land on a real SPA route that can finish the session.
  const origin = window.location.origin;
  if (
    Capacitor.isNativePlatform() ||
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://")
  ) {
    return `${origin}/auth/callback`;
  }

  return `${origin}/auth/callback`;
}
