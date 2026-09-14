/**
 * Native Sign in with Apple (iOS) → Supabase signInWithIdToken.
 *
 * Apple expects a SHA-256 hex digest of the nonce on the authorization request;
 * Supabase expects the raw nonce and hashes it server-side for comparison.
 *
 * Uses @capawesome/capacitor-apple-sign-in (Capacitor 8 / SPM). The community
 * plugin (@capacitor-community/apple-sign-in) is still Cap 7-only as of 0.1.x.
 */
import { Capacitor } from "@capacitor/core";
import type { Session, User } from "@supabase/supabase-js";

const NONCE_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Cryptographically random raw nonce (sent to Supabase, never to Apple). */
export function generateRawNonce(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += NONCE_CHARSET[bytes[i] % NONCE_CHARSET.length];
  }
  return out;
}

/** SHA-256 hex digest — value passed to Apple's Sign in request. */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isNativeAppleSignInAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export type NativeAppleSignInResult = {
  data: { user: User; session: Session } | null;
  error: Error | null;
  canceled?: boolean;
};

/**
 * Present the system Sign in with Apple sheet, then exchange the identity
 * token with Supabase. AuthContext's onAuthStateChange picks up the session.
 */
export async function signInWithAppleNative(): Promise<NativeAppleSignInResult> {
  if (!isNativeAppleSignInAvailable()) {
    return {
      data: null,
      error: new Error("Nativní přihlášení přes Apple je dostupné jen na iOS."),
    };
  }

  const rawNonce = generateRawNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  try {
    const { AppleSignIn, SignInScope } = await import(
      "@capawesome/capacitor-apple-sign-in"
    );

    const apple = await AppleSignIn.signIn({
      scopes: [SignInScope.Email, SignInScope.FullName],
      nonce: hashedNonce,
    });

    const idToken = apple?.idToken;
    if (!idToken) {
      return {
        data: null,
        error: new Error("Apple nevrátil identity token."),
      };
    }

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: idToken,
      nonce: rawNonce,
    });

    if (error) {
      return { data: null, error };
    }

    if (!data.session || !data.user) {
      return {
        data: null,
        error: new Error("Supabase nevrátil session po Apple přihlášení."),
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
    // Capawesome: SIGN_IN_CANCELED; ASAuthorizationError.canceled = 1001
    if (
      code === "SIGN_IN_CANCELED" ||
      code === "1001" ||
      /cancel/i.test(message)
    ) {
      return {
        data: null,
        error: null,
        canceled: true,
      };
    }
    return {
      data: null,
      error: e instanceof Error ? e : new Error(message || "Apple přihlášení selhalo."),
    };
  }
}
