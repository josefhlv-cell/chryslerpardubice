import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeatureKey =
  | "service_orders"
  | "service_checkin"
  | "service_photos"
  | "service_parts"
  | "service_approval"
  | "service_invoices"
  | "service_scheduler"
  | "mechanic_tasks"
  | "service_statistics"
  | "notifications"
  | "catalog"
  | "epc_diagrams"
  | "vehicle_offers"
  | "fault_reports"
  | "service_history"
  | "price_management"
  | "ai_mechanic"
  | "mechanic_dashboard"
  | "employees"
  | "mechanics_management"
  | "vehicle_health"
  | "bookings"
  | "push_notifications"
  | "auto_part_recommendations"
  | "vin_camera"
  | "price_comparison"
  | "service_chat"
  | "service_book_sharing"
  | "service_reviews"
  | "dark_mode"
  | "admin_statistics"
  | "onboarding"
  | "email_templates"
  | "i18n"
  | "pwa_offline"
  | "catalog_alternatives";

type FeatureFlag = {
  id: string;
  feature_key: string;
  enabled: boolean;
  description: string | null;
};

export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [allFlags, setAllFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = async () => {
    const { data } = await supabase
      .from("feature_flags")
      .select("*")
      .order("created_at");
    if (data) {
      const map: Record<string, boolean> = {};
      (data as FeatureFlag[]).forEach((f) => {
        map[f.feature_key] = f.enabled;
      });
      setFlags(map);
      setAllFlags(data as FeatureFlag[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const isEnabled = (key: FeatureKey): boolean => flags[key] ?? false;

  const toggleFlag = async (key: string, enabled: boolean) => {
    await supabase
      .from("feature_flags")
      .update({ enabled } as any)
      .eq("feature_key", key);
    await fetchFlags();
  };

  return { flags, allFlags, loading, isEnabled, toggleFlag, refetch: fetchFlags };
};
