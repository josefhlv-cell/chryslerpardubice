import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks admin session time. Creates a row on mount, updates ended_at periodically and on unmount.
 */
export const useAdminSessionTracker = (userId: string | undefined, isAdmin: boolean) => {
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !isAdmin) return;

    const startSession = async () => {
      const { data, error } = await supabase
        .from("admin_sessions")
        .insert({ user_id: userId })
        .select("id")
        .single();
      if (data) {
        sessionIdRef.current = data.id;
      }
      if (error) console.error("Failed to start admin session:", error);
    };

    const endSession = () => {
      if (!sessionIdRef.current) return;
      supabase
        .from("admin_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionIdRef.current)
        .then(() => {
          sessionIdRef.current = null;
        });
    };

    startSession();

    const handleBeforeUnload = () => {
      if (!sessionIdRef.current) return;
      // Best-effort sync update using keepalive fetch
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/admin_sessions?id=eq.${sessionIdRef.current}`;
      const body = JSON.stringify({ ended_at: new Date().toISOString() });
      try {
        fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${supabase.auth.getSession ? "" : ""}`,
            "Prefer": "return=minimal",
          },
          keepalive: true,
        }).catch(() => {});
      } catch {}
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // Heartbeat every 60s — so if browser crashes we still have approximate end time
    const heartbeat = setInterval(async () => {
      if (sessionIdRef.current) {
        await supabase
          .from("admin_sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", sessionIdRef.current);
      }
    }, 60_000);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(heartbeat);
      endSession();
    };
  }, [userId, isAdmin]);
};
