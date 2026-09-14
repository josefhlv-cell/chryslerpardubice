import { supabase } from "@/integrations/supabase/client";

export type OAuthConsumeResult = {
  handled: boolean;
  ok?: boolean;
  error?: string;
};

function collectParams(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => merged.set(k, v));
    if (u.hash.length > 1) {
      const raw = u.hash.slice(1);
      // Supabase/Lovable often return: #access_token=...&refresh_token=...
      // Sometimes: #/auth/callback&access_token=... or #/path?code=...
      const queryLike = raw.includes("=")
        ? raw
            .replace(/^\/?[^&?]*/, (prefix) => (prefix.includes("=") ? prefix : ""))
            .replace(/^\?/, "")
            .replace(/^&/, "")
        : "";
      const fromHash = new URLSearchParams(
        queryLike || (raw.includes("?") ? raw.split("?").slice(1).join("?") : raw)
      );
      fromHash.forEach((v, k) => {
        if (k) merged.set(k, v);
      });
    }
  } catch {
    /* ignore */
  }
  return merged;
}

/** True when URL/path looks like an OAuth provider return (not a normal page). */
export function urlLooksLikeOAuthReturn(urlOrPath: string): boolean {
  const s = urlOrPath.toLowerCase();
  if (s.includes("access_token") || s.includes("refresh_token")) return true;
  if (s.includes("error=") || s.includes("error_description")) return true;
  if (s.includes("code=") && (s.includes("auth") || s.includes("callback") || s.includes("oauth") || s.includes("state="))) {
    return true;
  }
  if (/\/auth\/callback/i.test(s)) return true;
  if (/\/(oauth|login)\/callback/i.test(s)) return true;
  return false;
}

/**
 * Consume OAuth tokens / auth code from a return URL and establish a Supabase session.
 * Safe to call on cold start, deep link, or when NotFound would otherwise render.
 */
export async function consumeOAuthReturn(
  url: string = typeof window !== "undefined" ? window.location.href : ""
): Promise<OAuthConsumeResult> {
  if (!url) return { handled: false };

  const params = collectParams(url);
  const error = params.get("error_description") || params.get("error");
  if (error) {
    return { handled: true, ok: false, error };
  }

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token) {
    const { error: setErr } = await supabase.auth.setSession({
      access_token,
      refresh_token: refresh_token || "",
    });
    scrubAuthParamsFromUrl();
    if (setErr) return { handled: true, ok: false, error: setErr.message };
    return { handled: true, ok: true };
  }

  const code = params.get("code");
  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    scrubAuthParamsFromUrl();
    if (exErr) return { handled: true, ok: false, error: exErr.message };
    return { handled: true, ok: true };
  }

  return { handled: false };
}

function scrubAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const path = window.location.pathname || "/auth/callback";
    window.history.replaceState({}, document.title, path);
  } catch {
    /* ignore */
  }
}
