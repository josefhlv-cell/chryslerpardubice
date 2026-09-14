import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { consumeOAuthReturn, urlLooksLikeOAuthReturn } from "@/lib/oauthReturn";

/**
 * Global recovery for social OAuth returns that land on an unexpected path
 * (or via Capacitor deep link). Without this, BrowserRouter shows NotFound/404.
 */
const OAuthReturnHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const href = window.location.href;
    const pathAndSearch = location.pathname + location.search + location.hash;

    if (!urlLooksLikeOAuthReturn(href) && !urlLooksLikeOAuthReturn(pathAndSearch)) {
      return;
    }

    // Already on the dedicated callback route — let AuthCallback own it
    if (/^\/auth\/callback\/?$/i.test(location.pathname)) {
      return;
    }

    let cancelled = false;

    (async () => {
      const result = await consumeOAuthReturn(href);
      if (cancelled) return;

      if (result.handled && result.ok) {
        navigate("/", { replace: true });
        return;
      }

      if (result.handled && !result.ok) {
        navigate("/auth", { replace: true });
        return;
      }

      // Looks like OAuth but tokens not parsable yet — funnel to callback route
      navigate(
        {
          pathname: "/auth/callback",
          search: location.search,
          hash: location.hash,
        },
        { replace: true }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", async ({ url }) => {
          if (!urlLooksLikeOAuthReturn(url) && !/chdp-servis:/i.test(url) && !/auth/i.test(url)) {
            return;
          }
          const result = await consumeOAuthReturn(url);
          if (result.handled && result.ok) {
            navigate("/", { replace: true });
            return;
          }
          if (result.handled && !result.ok) {
            navigate("/auth", { replace: true });
            return;
          }
          try {
            const u = new URL(url);
            navigate(
              {
                pathname: "/auth/callback",
                search: u.search,
                hash: u.hash,
              },
              { replace: true }
            );
          } catch {
            navigate("/auth/callback", { replace: true });
          }
        });
        remove = () => handle.remove();
      } catch {
        /* plugin missing — ok on web */
      }
    })();

    return () => remove?.();
  }, [navigate]);

  return null;
};

export default OAuthReturnHandler;
