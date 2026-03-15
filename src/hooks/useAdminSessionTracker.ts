import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks admin session time. Creates a row on mount, updates ended_at on unmount/beforeunload.
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
      // Use sendBeacon-style approach for reliability
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/admin_sessions?id=eq.${sessionIdRef.current}`;
      const body = JSON.stringify({ ended_at: new Date().toISOString() });
      
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        // sendBeacon doesn't support custom headers well, so fall back to fetch
      }
      
      // Best-effort update
      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${sessionIdRef.current ? "" : ""}`,
          "Prefer": "return=minimal",
        },
        keepalive: true,
      }).catch(() => {});
      
      // Also try supabase client
      supabase
        .from("admin_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionIdRef.current!)
        .then(() => {});
    };

    startSession();

    const handleBeforeUnload = () => endSession();
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Heartbeat: update ended_at every 60s so we have approximate time even on crash
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
