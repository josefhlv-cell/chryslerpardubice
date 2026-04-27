/**
 * Supabase Edge Function: sync-jm-categories
 * 
 * Sync categories and vehicle compatibility from J+M API
 * into catalog_part_categories and catalog_vehicle_compatibility tables.
 * 
 * Usage: POST /functions/v1/sync-jm-categories
 * with Authorization header
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

interface JmPartData {
  oem_number?: string;
  category?: string;
  brand?: string;
  model?: string;
  engine?: string;
  year_from?: number;
  year_to?: number;
}

Deno.serve(async (req) => {
  try {
    // Check auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    const token = authHeader.slice(7);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all parts from parts_new
    const { data: parts, error: partsError } = await supabase
      .from("parts_new")
      .select("id, oem_number")
      .limit(2000);

    if (partsError || !parts) {
      return new Response(JSON.stringify({ error: partsError?.message }), {
        status: 500,
      });
    }

    console.log(`[sync-jm-categories] Found ${parts.length} parts to sync`);

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process each part
    for (const part of parts) {
      if (!part.oem_number) continue;

      try {
        // Call J+M API to get categories and vehicles
        const jmResponse = await fetch(
          "https://eshop.jmautodily.cz/api/parts/search",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              oem_number: part.oem_number,
            }),
          }
        );

        if (!jmResponse.ok) {
          failed++;
          continue;
        }

        const jmData: JmPartData = await jmResponse.json();

        // Insert category if present
        if (jmData.category) {
          const { data: category } = await supabase
            .from("catalog_categories")
            .select("id")
            .eq("name_cs", jmData.category)
            .single();

          if (category) {
            await supabase.from("catalog_part_categories").upsert(
              {
                part_id: part.id,
                category_id: category.id,
                is_primary: true,
              },
              { onConflict: "part_id,category_id" }
            );
          }
        }

        // Insert vehicle compatibility if present
        if (jmData.brand) {
          await supabase.from("catalog_vehicle_compatibility").upsert(
            {
              part_id: part.id,
              brand: jmData.brand,
              model: jmData.model || null,
              engine: jmData.engine || null,
              year_from: jmData.year_from || null,
              year_to: jmData.year_to || null,
              is_oem: true,
              source: "jm-api",
              match_method: "oem-direct",
              match_confidence: 100,
            },
            { onConflict: "part_id,brand,model,engine" }
          );
        }

        synced++;
      } catch (err) {
        failed++;
        errors.push(`${part.oem_number}: ${err.message}`);
      }

      // Rate limiting — J+M API má limit
      if (synced % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `[sync-jm-categories] Synced: ${synced}, Failed: ${failed}, Errors: ${errors.length}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        failed,
        total: parts.length,
        errors: errors.slice(0, 10), // First 10 errors
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[sync-jm-categories] Error:", error.message);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
