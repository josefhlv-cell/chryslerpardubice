/**
 * Native Google Sign-In (iOS) → Supabase signInWithIdToken.
 *
 * Uses @capgo/capacitor-social-login (Capacitor 8 / SPM). Requires
 * VITE_GOOGLE_WEB_CLIENT_ID (id_token audience / Supabase) and
 * VITE_GOOGLE_IOS_CLIENT_ID (iOS OAuth client). Codemagic must also register
 * the reversed iOS client ID as a CFBundleURLSchemes entry.
 */
import { Capacitor } from "@capacitor/core";
import type { Session, User } from "@supabase/supabase-js";

/** True only when both Google OAuth client IDs are baked into the build. */
export function isNativeGoogleConfigured(): boolean {
  const { webClientId, iOSClientId } = getGoogleClientIds();
  return !!webClientId && !!iOSClientId;
}

/**
 * Native Google SDK path is only usable on iOS AND when the client IDs exist.
 * Without them the plugin throws and the user sees "Chybí Google OAuth klienty",
 * which is exactly the failure reported from TestFlight. In that case we fall
 * back to the hosted Google OAuth flow opened in the system browser.
 */
export function isNativeGoogleSignInAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    isNativeGoogleConfigured()
  );
}

/**
 * Fallback for native builds without Google client IDs: start Supabase's hosted
 * Google OAuth in the system browser and come back through the app's custom
 * URL scheme (handled by OAuthReturnHandler / AuthCallback).
 */
export async function signInWithGoogleBrowserFallback(): Promise<{ error: Error | null }> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "chdp-servis://auth/callback",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) return { error };
    if (!data?.url) return { error: new Error("Google nevrátil přihlašovací adresu.") };

    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: data.url, presentationStyle: "popover" });
    } catch {
      window.open(data.url, "_system");
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export type NativeGoogleSignInResult = {
  data: { user: User; session: Session } | null;
  error: Error | null;
  canceled?: boolean;
};

let initialized = false;

function getGoogleClientIds(): { webClientId: string; iOSClientId: string } {
  const webClientId = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined)?.trim() ?? "";
  const iOSClientId = (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined)?.trim() ?? "";
  return { webClientId, iOSClientId };
}

async function ensureGoogleInitialized(): Promise<void> {
  if (initialized) return;

  const { webClientId, iOSClientId } = getGoogleClientIds();
  if (!webClientId || !iOSClientId) {
    throw new Error(
      "Chybí Google OAuth klienty (VITE_GOOGLE_WEB_CLIENT_ID / VITE_GOOGLE_IOS_CLIENT_ID). Nastavte je v Lovable/Codemagic env."
    );
  }

  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    google: {
      webClientId,
      iOSClientId,
      // Same as webClientId so the id_token audience matches Supabase Google provider.
      iOSServerClientId: webClientId,
      mode: "online",
    },
  });
  initialized = true;
}

/**
 * Present the native Google Sign-In sheet, then exchange the identity token
 * with Supabase. AuthContext's onAuthStateChange picks up the session.
 */
export async function signInWithGoogleNative(): Promise<NativeGoogleSignInResult> {
  if (!isNativeGoogleSignInAvailable()) {
    return {
      data: null,
      error: new Error("Nativní přihlášení přes Google je dostupné jen na iOS."),
    };
  }

  try {
    await ensureGoogleInitialized();

    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    const response = await SocialLogin.login({
      provider: "google",
      options: {
        scopes: ["email", "profile"],
      },
    });

    const result = response?.result as
      | { idToken?: string; responseType?: string }
      | undefined;
    const idToken = result?.idToken;
    if (!idToken) {
      return {
        data: null,
        error: new Error("Google nevrátil identity token."),
      };
    }

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (error) {
      return { data: null, error };
    }

    if (!data.session || !data.user) {
      return {
        data: null,
        error: new Error("Supabase nevrátil session po Google přihlášení."),
      };
    }

    return {
      data: { user: data.user, session: data.session },
      error: null,
    };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const code = String(err?.code ?? "");
    const message = String(err?.message ?? e ?? "");
    if (
      code === "SIGN_IN_CANCELED" ||
      code === "12501" ||
      /cancel/i.test(message) ||
      /cancelled/i.test(message)
    ) {
      return {
        data: null,
        error: null,
        canceled: true,
      };
    }
    return {
      data: null,
      error: e instanceof Error ? e : new Error(message || "Google přihlášení selhalo."),
    };
  }
}
