import { supabase } from "@/integrations/supabase/client";

export type BuybackRequest = {
  user_id?: string;
  brand: string;
  model: string;
  year: number;
  condition: string;
  mileage: number;
  vin?: string;
  note?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type ImportRequest = {
  user_id?: string;
  brand: string;
  model: string;
  year_from?: number;
  year_to?: number;
  budget_from?: number;
  budget_to?: number;
  fuel?: string;
  transmission?: string;
  color?: string;
  extras?: string;
  note?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export const createBuybackRequest = async (data: BuybackRequest) => {
  const { data: result, error } = await supabase
    .from("vehicle_buyback_requests" as any)
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return result;
};

export const createImportRequest = async (data: ImportRequest) => {
  const { data: result, error } = await supabase
    .from("vehicle_import_requests" as any)
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return result;
};
