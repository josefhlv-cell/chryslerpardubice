export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      admin_fcm_tokens: {
        Row: {
          created_at: string
          device_info: Json | null
          id: string
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          id?: string
          last_used_at?: string | null
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          id?: string
          last_used_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_review_queue: {
        Row: {
          created_at: string
          id: string
          payload: Json
          reason: string | null
          ref_id: string | null
          ref_table: string | null
          resolved_at: string | null
          status: string
          topic: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          reason?: string | null
          ref_id?: string | null
          ref_table?: string | null
          resolved_at?: string | null
          status?: string
          topic: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          reason?: string | null
          ref_id?: string | null
          ref_table?: string | null
          resolved_at?: string | null
          status?: string
          topic?: string
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          intent_type: string | null
          risk_level: string | null
          user_id: string
          vehicle_brand: string | null
          vehicle_model: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          intent_type?: string | null
          risk_level?: string | null
          user_id: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          intent_type?: string | null
          risk_level?: string | null
          user_id?: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
        }
        Relationships: []
      }
      api_cache: {
        Row: {
          cache_key: string
          cache_type: string
          created_at: string
          data: Json
          id: string
          ttl_seconds: number | null
        }
        Insert: {
          cache_key: string
          cache_type: string
          created_at?: string
          data: Json
          id?: string
          ttl_seconds?: number | null
        }
        Update: {
          cache_key?: string
          cache_type?: string
          created_at?: string
          data?: Json
          id?: string
          ttl_seconds?: number | null
        }
        Relationships: []
      }
      auto_pipeline_queue: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          oem_number: string | null
          part_id: string | null
          payload: Json | null
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          job_type: string
          oem_number?: string | null
          part_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          oem_number?: string | null
          part_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      cars_for_sale: {
        Row: {
          brand: string
          created_at: string
          description: string | null
          fuel: string | null
          id: string
          image_url: string | null
          is_active: boolean
          mileage: number | null
          model: string
          price: number
          transmission: string | null
          updated_at: string
          year: number
        }
        Insert: {
          brand: string
          created_at?: string
          description?: string | null
          fuel?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mileage?: number | null
          model: string
          price: number
          transmission?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          brand?: string
          created_at?: string
          description?: string | null
          fuel?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mileage?: number | null
          model?: string
          price?: number
          transmission?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      catalog_anomalies: {
        Row: {
          ai_confidence: number | null
          ai_reason: string | null
          anomaly_type: string
          created_at: string
          current_value: string | null
          field: string | null
          id: string
          oem_number: string | null
          part_id: string | null
          resolved_at: string | null
          severity: string
          status: string
          suggested_value: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_reason?: string | null
          anomaly_type: string
          created_at?: string
          current_value?: string | null
          field?: string | null
          id?: string
          oem_number?: string | null
          part_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_value?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_reason?: string | null
          anomaly_type?: string
          created_at?: string
          current_value?: string | null
          field?: string | null
          id?: string
          oem_number?: string | null
          part_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          suggested_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_anomalies_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_anomalies_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new_public"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          is_global: boolean | null
          name_cs: string
          name_en: string | null
          node_type: string
          parent_id: string | null
          power_kw: number | null
          slug: string
          sort_order: number | null
          source: Database["public"]["Enums"]["catalog_source_type"]
          updated_at: string
          vehicle_brand: string | null
          vehicle_engine: string | null
          vehicle_model: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_global?: boolean | null
          name_cs: string
          name_en?: string | null
          node_type?: string
          parent_id?: string | null
          power_kw?: number | null
          slug: string
          sort_order?: number | null
          source?: Database["public"]["Enums"]["catalog_source_type"]
          updated_at?: string
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_model?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_global?: boolean | null
          name_cs?: string
          name_en?: string | null
          node_type?: string
          parent_id?: string | null
          power_kw?: number | null
          slug?: string
          sort_order?: number | null
          source?: Database["public"]["Enums"]["catalog_source_type"]
          updated_at?: string
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_model?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_engine_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories_bak_pretreev2: {
        Row: {
          created_at: string | null
          external_id: string | null
          id: string | null
          is_global: boolean | null
          name_cs: string | null
          name_en: string | null
          node_type: string | null
          parent_id: string | null
          power_kw: number | null
          slug: string | null
          sort_order: number | null
          source: Database["public"]["Enums"]["catalog_source_type"] | null
          updated_at: string | null
          vehicle_brand: string | null
          vehicle_engine: string | null
          vehicle_model: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          created_at?: string | null
          external_id?: string | null
          id?: string | null
          is_global?: boolean | null
          name_cs?: string | null
          name_en?: string | null
          node_type?: string | null
          parent_id?: string | null
          power_kw?: number | null
          slug?: string | null
          sort_order?: number | null
          source?: Database["public"]["Enums"]["catalog_source_type"] | null
          updated_at?: string | null
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_model?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          created_at?: string | null
          external_id?: string | null
          id?: string | null
          is_global?: boolean | null
          name_cs?: string | null
          name_en?: string | null
          node_type?: string | null
          parent_id?: string | null
          power_kw?: number | null
          slug?: string | null
          sort_order?: number | null
          source?: Database["public"]["Enums"]["catalog_source_type"] | null
          updated_at?: string | null
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_model?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      catalog_diagnostic_fixes: {
        Row: {
          affected_count: number
          applied_at: string | null
          applied_by: string | null
          applied_count: number | null
          created_at: string
          description: string | null
          error_message: string | null
          fix_type: string
          id: string
          payload: Json
          preview: Json
          run_id: string
          severity: string
          status: string
          title: string
        }
        Insert: {
          affected_count?: number
          applied_at?: string | null
          applied_by?: string | null
          applied_count?: number | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          fix_type: string
          id?: string
          payload?: Json
          preview?: Json
          run_id: string
          severity?: string
          status?: string
          title: string
        }
        Update: {
          affected_count?: number
          applied_at?: string | null
          applied_by?: string | null
          applied_count?: number | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          fix_type?: string
          id?: string
          payload?: Json
          preview?: Json
          run_id?: string
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_diagnostic_fixes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "catalog_diagnostic_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_diagnostic_results: {
        Row: {
          brand: string
          category: string | null
          checked_at: string
          duplicates_count: number
          engine: string | null
          id: string
          issues: Json
          missing_names_count: number
          missing_prices_count: number
          model: string
          oem_unique_count: number
          parts_count: number
          run_id: string
          sample_oems: Json
          uncategorized_count: number
          zero_price_count: number
        }
        Insert: {
          brand: string
          category?: string | null
          checked_at?: string
          duplicates_count?: number
          engine?: string | null
          id?: string
          issues?: Json
          missing_names_count?: number
          missing_prices_count?: number
          model: string
          oem_unique_count?: number
          parts_count?: number
          run_id: string
          sample_oems?: Json
          uncategorized_count?: number
          zero_price_count?: number
        }
        Update: {
          brand?: string
          category?: string | null
          checked_at?: string
          duplicates_count?: number
          engine?: string | null
          id?: string
          issues?: Json
          missing_names_count?: number
          missing_prices_count?: number
          model?: string
          oem_unique_count?: number
          parts_count?: number
          run_id?: string
          sample_oems?: Json
          uncategorized_count?: number
          zero_price_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_diagnostic_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "catalog_diagnostic_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_diagnostic_runs: {
        Row: {
          created_at: string
          critical_issues: Json
          current_step: string | null
          finished_at: string | null
          id: string
          issues_found: number
          last_error: string | null
          processed_combinations: number
          started_at: string
          started_by: string | null
          status: string
          total_combinations: number
          total_parts_found: number
          updated_at: string
          validation_summary: Json
        }
        Insert: {
          created_at?: string
          critical_issues?: Json
          current_step?: string | null
          finished_at?: string | null
          id?: string
          issues_found?: number
          last_error?: string | null
          processed_combinations?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_combinations?: number
          total_parts_found?: number
          updated_at?: string
          validation_summary?: Json
        }
        Update: {
          created_at?: string
          critical_issues?: Json
          current_step?: string | null
          finished_at?: string | null
          id?: string
          issues_found?: number
          last_error?: string | null
          processed_combinations?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_combinations?: number
          total_parts_found?: number
          updated_at?: string
          validation_summary?: Json
        }
        Relationships: []
      }
      catalog_event_log: {
        Row: {
          category: string | null
          created_at: string
          details: Json
          duration_ms: number | null
          event: string
          id: string
          level: string
          message: string | null
          oem_number: string | null
          source: string
          vehicle_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          details?: Json
          duration_ms?: number | null
          event: string
          id?: string
          level?: string
          message?: string | null
          oem_number?: string | null
          source: string
          vehicle_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          details?: Json
          duration_ms?: number | null
          event?: string
          id?: string
          level?: string
          message?: string | null
          oem_number?: string | null
          source?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      catalog_fix_log: {
        Row: {
          affected_count: number | null
          after_value: Json | null
          before_value: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          fix_type: string
          id: string
          reason: string | null
          run_id: string | null
        }
        Insert: {
          affected_count?: number | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          fix_type: string
          id?: string
          reason?: string | null
          run_id?: string | null
        }
        Update: {
          affected_count?: number | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          fix_type?: string
          id?: string
          reason?: string | null
          run_id?: string | null
        }
        Relationships: []
      }
      catalog_part_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_primary: boolean | null
          part_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          part_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_part_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_part_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_engine_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_part_categories_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_part_categories_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new_public"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_part_categories_bak_pretreev2: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string | null
          is_primary: boolean | null
          part_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string | null
          is_primary?: boolean | null
          part_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string | null
          is_primary?: boolean | null
          part_id?: string | null
        }
        Relationships: []
      }
      catalog_snapshots: {
        Row: {
          category_count: number | null
          compat_count: number | null
          created_at: string
          id: string
          label: string
          notes: string | null
          parts_count: number | null
          price_missing: number | null
          stats: Json
          trigger: string | null
          vehicles_count: number | null
        }
        Insert: {
          category_count?: number | null
          compat_count?: number | null
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          parts_count?: number | null
          price_missing?: number | null
          stats?: Json
          trigger?: string | null
          vehicles_count?: number | null
        }
        Update: {
          category_count?: number | null
          compat_count?: number | null
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          parts_count?: number | null
          price_missing?: number | null
          stats?: Json
          trigger?: string | null
          vehicles_count?: number | null
        }
        Relationships: []
      }
      catalog_vehicle_compatibility: {
        Row: {
          brand: string
          created_at: string
          engine: string | null
          id: string
          is_oem: boolean
          match_confidence: number | null
          match_method: string | null
          model: string
          nextis_vehicle_id: string | null
          notes: string | null
          part_id: string
          source: Database["public"]["Enums"]["catalog_source_type"] | null
          vehicle_type: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          engine?: string | null
          id?: string
          is_oem?: boolean
          match_confidence?: number | null
          match_method?: string | null
          model: string
          nextis_vehicle_id?: string | null
          notes?: string | null
          part_id: string
          source?: Database["public"]["Enums"]["catalog_source_type"] | null
          vehicle_type?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          engine?: string | null
          id?: string
          is_oem?: boolean
          match_confidence?: number | null
          match_method?: string | null
          model?: string
          nextis_vehicle_id?: string | null
          notes?: string | null
          part_id?: string
          source?: Database["public"]["Enums"]["catalog_source_type"] | null
          vehicle_type?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_vehicle_compatibility_nextis_vehicle_id_fkey"
            columns: ["nextis_vehicle_id"]
            isOneToOne: false
            referencedRelation: "nextis_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_vehicle_compatibility_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_vehicle_compatibility_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new_public"
            referencedColumns: ["id"]
          },
        ]
      }
      catcar_oem: {
        Row: {
          category: string | null
          created_at: string
          id: string
          model_id: string | null
          model_name: string | null
          name: string | null
          oem_number: string
          position: string | null
          schema_name: string | null
          schema_url: string | null
          subcategory: string | null
          vehicle_tag: string
          year: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          model_id?: string | null
          model_name?: string | null
          name?: string | null
          oem_number: string
          position?: string | null
          schema_name?: string | null
          schema_url?: string | null
          subcategory?: string | null
          vehicle_tag: string
          year?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          model_id?: string | null
          model_name?: string | null
          name?: string | null
          oem_number?: string
          position?: string | null
          schema_name?: string | null
          schema_url?: string | null
          subcategory?: string | null
          vehicle_tag?: string
          year?: number | null
        }
        Relationships: []
      }
      catcar_scrape_progress: {
        Row: {
          categories_done: number
          created_at: string
          finished_at: string | null
          id: string
          last_error: string | null
          model_name: string | null
          oems_count: number
          schemas_done: number
          started_at: string | null
          status: string
          vehicle_tag: string
          year: number | null
        }
        Insert: {
          categories_done?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          model_name?: string | null
          oems_count?: number
          schemas_done?: number
          started_at?: string | null
          status?: string
          vehicle_tag: string
          year?: number | null
        }
        Update: {
          categories_done?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          model_name?: string | null
          oems_count?: number
          schemas_done?: number
          started_at?: string | null
          status?: string
          vehicle_tag?: string
          year?: number | null
        }
        Relationships: []
      }
      catcar_test: {
        Row: {
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string | null
          oem_number: string
          position: string | null
          price_found: boolean | null
          price_variant: string | null
          price_with_vat: number | null
          subcategory: string | null
          vehicle: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          oem_number: string
          position?: string | null
          price_found?: boolean | null
          price_variant?: string | null
          price_with_vat?: number | null
          subcategory?: string | null
          vehicle?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          oem_number?: string
          position?: string | null
          price_found?: boolean | null
          price_variant?: string | null
          price_with_vat?: number | null
          subcategory?: string | null
          vehicle?: string | null
        }
        Relationships: []
      }
      compatibility_match_queue: {
        Row: {
          created_at: string
          id: string
          match_confidence: number
          match_method: string
          matched_oem: string | null
          nextis_vehicle_id: string
          notes: string | null
          oem_number: string | null
          part_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_confidence?: number
          match_method?: string
          matched_oem?: string | null
          nextis_vehicle_id: string
          notes?: string | null
          oem_number?: string | null
          part_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_confidence?: number
          match_method?: string
          matched_oem?: string | null
          nextis_vehicle_id?: string
          notes?: string | null
          oem_number?: string | null
          part_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "compatibility_match_queue_nextis_vehicle_id_fkey"
            columns: ["nextis_vehicle_id"]
            isOneToOne: false
            referencedRelation: "nextis_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      crossref_seed_queue: {
        Row: {
          alternatives_added: number
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          oem_number: string
          part_name: string | null
          processed_at: string | null
          status: string
        }
        Insert: {
          alternatives_added?: number
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          oem_number: string
          part_name?: string | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          alternatives_added?: number
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          oem_number?: string
          part_name?: string | null
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          last_seen_at: string
          model: string | null
          os_version: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          last_seen_at?: string
          model?: string | null
          os_version?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          last_seen_at?: string
          model?: string | null
          os_version?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      dtc_codes: {
        Row: {
          affected_models: string[] | null
          causes_cs: string | null
          code: string
          created_at: string
          description_cs: string | null
          id: string
          severity: string
          solution_cs: string | null
          source: string | null
          system: string
          title_cs: string
          updated_at: string
        }
        Insert: {
          affected_models?: string[] | null
          causes_cs?: string | null
          code: string
          created_at?: string
          description_cs?: string | null
          id?: string
          severity?: string
          solution_cs?: string | null
          source?: string | null
          system?: string
          title_cs: string
          updated_at?: string
        }
        Update: {
          affected_models?: string[] | null
          causes_cs?: string | null
          code?: string
          created_at?: string
          description_cs?: string | null
          id?: string
          severity?: string
          solution_cs?: string | null
          source?: string | null
          system?: string
          title_cs?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          role: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          role?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      epc_categories: {
        Row: {
          brand: string
          category: string
          created_at: string
          diagram_svg: string | null
          engine: string | null
          id: string
          model: string
          sort_order: number | null
          subcategory: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          brand: string
          category: string
          created_at?: string
          diagram_svg?: string | null
          engine?: string | null
          id?: string
          model: string
          sort_order?: number | null
          subcategory?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          brand?: string
          category?: string
          created_at?: string
          diagram_svg?: string | null
          engine?: string | null
          id?: string
          model?: string
          sort_order?: number | null
          subcategory?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      epc_diagrams: {
        Row: {
          brand: string
          category: string
          created_at: string
          engine: string | null
          id: string
          model: string
          parts_count: number | null
          subcategory: string | null
          svg_content: string
        }
        Insert: {
          brand: string
          category: string
          created_at?: string
          engine?: string | null
          id?: string
          model: string
          parts_count?: number | null
          subcategory?: string | null
          svg_content: string
        }
        Update: {
          brand?: string
          category?: string
          created_at?: string
          engine?: string | null
          id?: string
          model?: string
          parts_count?: number | null
          subcategory?: string | null
          svg_content?: string
        }
        Relationships: []
      }
      epc_generation_queue: {
        Row: {
          batch_size: number | null
          brand: string
          category: string
          completed_at: string | null
          created_at: string
          engine: string | null
          error_message: string | null
          id: string
          model: string
          parts_generated: number | null
          retry_count: number | null
          status: string
          subcategory: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          batch_size?: number | null
          brand: string
          category: string
          completed_at?: string | null
          created_at?: string
          engine?: string | null
          error_message?: string | null
          id?: string
          model: string
          parts_generated?: number | null
          retry_count?: number | null
          status?: string
          subcategory?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          batch_size?: number | null
          brand?: string
          category?: string
          completed_at?: string | null
          created_at?: string
          engine?: string | null
          error_message?: string | null
          id?: string
          model?: string
          parts_generated?: number | null
          retry_count?: number | null
          status?: string
          subcategory?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      epc_part_links: {
        Row: {
          created_at: string
          epc_category_id: string
          id: string
          manufacturer: string | null
          note: string | null
          oem_number: string | null
          part_id: string | null
          part_name: string | null
          position_label: string | null
          x_pos: number | null
          y_pos: number | null
        }
        Insert: {
          created_at?: string
          epc_category_id: string
          id?: string
          manufacturer?: string | null
          note?: string | null
          oem_number?: string | null
          part_id?: string | null
          part_name?: string | null
          position_label?: string | null
          x_pos?: number | null
          y_pos?: number | null
        }
        Update: {
          created_at?: string
          epc_category_id?: string
          id?: string
          manufacturer?: string | null
          note?: string | null
          oem_number?: string | null
          part_id?: string | null
          part_name?: string | null
          position_label?: string | null
          x_pos?: number | null
          y_pos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "epc_part_links_epc_category_id_fkey"
            columns: ["epc_category_id"]
            isOneToOne: false
            referencedRelation: "epc_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epc_part_links_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epc_part_links_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new_public"
            referencedColumns: ["id"]
          },
        ]
      }
      fault_reports: {
        Row: {
          admin_note: string | null
          ai_analysis: string | null
          ai_risk_level: string | null
          created_at: string
          description: string
          id: string
          mileage: number | null
          photos: string[] | null
          status: string
          updated_at: string
          user_id: string
          vehicle_brand: string | null
          vehicle_engine: string | null
          vehicle_id: string | null
          vehicle_model: string | null
          vehicle_year: number | null
          vin: string | null
        }
        Insert: {
          admin_note?: string | null
          ai_analysis?: string | null
          ai_risk_level?: string | null
          created_at?: string
          description: string
          id?: string
          mileage?: number | null
          photos?: string[] | null
          status?: string
          updated_at?: string
          user_id: string
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_id?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Update: {
          admin_note?: string | null
          ai_analysis?: string | null
          ai_risk_level?: string | null
          created_at?: string
          description?: string
          id?: string
          mileage?: number | null
          photos?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_id?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fault_reports_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "user_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          feature_key: string
          id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          feature_key: string
          id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          feature_key?: string
          id?: string
        }
        Relationships: []
      }
      jm_category_tree_v2: {
        Row: {
          brand: string
          created_at: string
          engine: string
          gen_art_id: number
          gen_art_name: string
          id: string
          k_type: number
          last_synced_at: string | null
          model: string
          part_count: number
          updated_at: string
        }
        Insert: {
          brand: string
          created_at?: string
          engine: string
          gen_art_id: number
          gen_art_name: string
          id?: string
          k_type: number
          last_synced_at?: string | null
          model: string
          part_count?: number
          updated_at?: string
        }
        Update: {
          brand?: string
          created_at?: string
          engine?: string
          gen_art_id?: number
          gen_art_name?: string
          id?: string
          k_type?: number
          last_synced_at?: string | null
          model?: string
          part_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      jm_graphical_catalog: {
        Row: {
          brand: string
          engine: string | null
          id: string
          image_base64: string | null
          image_url: string | null
          k_type: string | null
          model: string
          part_positions: Json | null
          scraped_at: string
          section_id: string
          section_name: string | null
          updated_at: string
        }
        Insert: {
          brand: string
          engine?: string | null
          id?: string
          image_base64?: string | null
          image_url?: string | null
          k_type?: string | null
          model: string
          part_positions?: Json | null
          scraped_at?: string
          section_id: string
          section_name?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string
          engine?: string | null
          id?: string
          image_base64?: string | null
          image_url?: string | null
          k_type?: string | null
          model?: string
          part_positions?: Json | null
          scraped_at?: string
          section_id?: string
          section_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      jm_orders: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          items: Json
          nextis_order_id: string | null
          order_id: string
          request_payload: Json | null
          response_payload: Json | null
          sent_at: string | null
          status: string
          total_price: number | null
          updated_at: string
          user_id: string
          user_note: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          items?: Json
          nextis_order_id?: string | null
          order_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
          user_id: string
          user_note?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          items?: Json
          nextis_order_id?: string | null
          order_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
          user_id?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jm_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      jm_part_v2: {
        Row: {
          availability: string | null
          fetched_at: string
          id: string
          image_url: string | null
          manufacturer: string | null
          name: string | null
          node_id: string
          oem_number: string
          price_with_vat: number | null
          price_without_vat: number | null
          raw: Json | null
          stock: number | null
        }
        Insert: {
          availability?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          name?: string | null
          node_id: string
          oem_number: string
          price_with_vat?: number | null
          price_without_vat?: number | null
          raw?: Json | null
          stock?: number | null
        }
        Update: {
          availability?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          name?: string | null
          node_id?: string
          oem_number?: string
          price_with_vat?: number | null
          price_without_vat?: number | null
          raw?: Json | null
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jm_part_v2_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "jm_category_tree_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      jm_schema_cache: {
        Row: {
          byte_size: number | null
          content_type: string | null
          expires_at: string | null
          fetched_at: string
          id: string
          image_url_source: string | null
          positions: Json | null
          section_id: string
          section_name: string | null
          storage_path: string
          yq_code: string
        }
        Insert: {
          byte_size?: number | null
          content_type?: string | null
          expires_at?: string | null
          fetched_at?: string
          id?: string
          image_url_source?: string | null
          positions?: Json | null
          section_id: string
          section_name?: string | null
          storage_path: string
          yq_code: string
        }
        Update: {
          byte_size?: number | null
          content_type?: string | null
          expires_at?: string | null
          fetched_at?: string
          id?: string
          image_url_source?: string | null
          positions?: Json | null
          section_id?: string
          section_name?: string | null
          storage_path?: string
          yq_code?: string
        }
        Relationships: []
      }
      jm_tree_sync_runs: {
        Row: {
          categories_created: number
          current_step: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          parts_classified: number
          scope: string
          started_at: string
          started_by: string | null
          status: string
          vehicles_done: number
          vehicles_total: number
        }
        Insert: {
          categories_created?: number
          current_step?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          parts_classified?: number
          scope?: string
          started_at?: string
          started_by?: string | null
          status?: string
          vehicles_done?: number
          vehicles_total?: number
        }
        Update: {
          categories_created?: number
          current_step?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          parts_classified?: number
          scope?: string
          started_at?: string
          started_by?: string | null
          status?: string
          vehicles_done?: number
          vehicles_total?: number
        }
        Relationships: []
      }
      jq_categories: {
        Row: {
          created_at: string
          id: string
          jq_category_code: string | null
          level: number
          name_cs: string
          name_en: string | null
          parent_id: string | null
          slug: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          jq_category_code?: string | null
          level?: number
          name_cs: string
          name_en?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          jq_category_code?: string | null
          level?: number
          name_cs?: string
          name_en?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jq_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "jq_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      jq_engine_categories: {
        Row: {
          category_id: string
          engine_id: string
          id: string
          part_count: number
          scraped_at: string | null
        }
        Insert: {
          category_id: string
          engine_id: string
          id?: string
          part_count?: number
          scraped_at?: string | null
        }
        Update: {
          category_id?: string
          engine_id?: string
          id?: string
          part_count?: number
          scraped_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jq_engine_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "jq_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jq_engine_categories_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "jq_engines"
            referencedColumns: ["id"]
          },
        ]
      }
      jq_engines: {
        Row: {
          created_at: string
          displacement_ccm: number | null
          engine_code: string | null
          engine_label: string
          fuel: string | null
          id: string
          jq_engine_code: string | null
          model_id: string
          power_hp: number | null
          power_kw: number | null
          scraped_at: string | null
          submodel: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          created_at?: string
          displacement_ccm?: number | null
          engine_code?: string | null
          engine_label: string
          fuel?: string | null
          id?: string
          jq_engine_code?: string | null
          model_id: string
          power_hp?: number | null
          power_kw?: number | null
          scraped_at?: string | null
          submodel?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          created_at?: string
          displacement_ccm?: number | null
          engine_code?: string | null
          engine_label?: string
          fuel?: string | null
          id?: string
          jq_engine_code?: string | null
          model_id?: string
          power_hp?: number | null
          power_kw?: number | null
          scraped_at?: string | null
          submodel?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jq_engines_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "jq_models"
            referencedColumns: ["id"]
          },
        ]
      }
      jq_models: {
        Row: {
          brand: string
          created_at: string
          id: string
          jq_model_code: string | null
          model_name: string
          model_slug: string | null
          scraped_at: string | null
          sort_order: number | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          id?: string
          jq_model_code?: string | null
          model_name: string
          model_slug?: string | null
          scraped_at?: string | null
          sort_order?: number | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          id?: string
          jq_model_code?: string | null
          model_name?: string
          model_slug?: string | null
          scraped_at?: string | null
          sort_order?: number | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      jq_part_engines: {
        Row: {
          engine_id: string
          id: string
          part_id: string
          position_label: string | null
        }
        Insert: {
          engine_id: string
          id?: string
          part_id: string
          position_label?: string | null
        }
        Update: {
          engine_id?: string
          id?: string
          part_id?: string
          position_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jq_part_engines_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "jq_engines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jq_part_engines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "jq_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      jq_parts: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          image_url: string | null
          manufacturer: string | null
          name: string
          name_en: string | null
          notes: string | null
          oem_number: string
          scraped_at: string | null
          tecdoc_number: string | null
          technical_params: Json | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          name: string
          name_en?: string | null
          notes?: string | null
          oem_number: string
          scraped_at?: string | null
          tecdoc_number?: string | null
          technical_params?: Json | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          name?: string
          name_en?: string | null
          notes?: string | null
          oem_number?: string
          scraped_at?: string | null
          tecdoc_number?: string | null
          technical_params?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "jq_parts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "jq_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      jq_scrape_runs: {
        Row: {
          brand: string | null
          categories_done: number
          current_step: string | null
          engines_done: number
          finished_at: string | null
          id: string
          last_error: string | null
          models_done: number
          parts_done: number
          phase: string
          scope: string
          started_at: string
          started_by: string | null
          status: string
        }
        Insert: {
          brand?: string | null
          categories_done?: number
          current_step?: string | null
          engines_done?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          models_done?: number
          parts_done?: number
          phase?: string
          scope?: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Update: {
          brand?: string | null
          categories_done?: number
          current_step?: string | null
          engines_done?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          models_done?: number
          parts_done?: number
          phase?: string
          scope?: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Relationships: []
      }
      kitoem_parts: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          description: string | null
          engine: string | null
          id: string
          image_urls: string[] | null
          jm_manufacturer: string | null
          jm_part_code: string | null
          k_type: number | null
          model: string | null
          name: string | null
          oe_brand: string | null
          oem_number: string
          position: string | null
          price_attempts: number
          price_checked_at: string | null
          price_found: boolean | null
          price_variant_used: string | null
          price_with_vat: number | null
          price_without_vat: number | null
          technical_params: Json | null
          updated_at: string
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          engine?: string | null
          id?: string
          image_urls?: string[] | null
          jm_manufacturer?: string | null
          jm_part_code?: string | null
          k_type?: number | null
          model?: string | null
          name?: string | null
          oe_brand?: string | null
          oem_number: string
          position?: string | null
          price_attempts?: number
          price_checked_at?: string | null
          price_found?: boolean | null
          price_variant_used?: string | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          technical_params?: Json | null
          updated_at?: string
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          engine?: string | null
          id?: string
          image_urls?: string[] | null
          jm_manufacturer?: string | null
          jm_part_code?: string | null
          k_type?: number | null
          model?: string | null
          name?: string | null
          oe_brand?: string | null
          oem_number?: string
          position?: string | null
          price_attempts?: number
          price_checked_at?: string | null
          price_found?: boolean | null
          price_variant_used?: string | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          technical_params?: Json | null
          updated_at?: string
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      kitoem_parts_backup: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string | null
          description: string | null
          engine: string | null
          id: string | null
          image_urls: string[] | null
          jm_manufacturer: string | null
          jm_part_code: string | null
          k_type: number | null
          model: string | null
          name: string | null
          oe_brand: string | null
          oem_number: string | null
          position: string | null
          price_attempts: number | null
          price_checked_at: string | null
          price_found: boolean | null
          price_variant_used: string | null
          price_with_vat: number | null
          price_without_vat: number | null
          technical_params: Json | null
          updated_at: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          engine?: string | null
          id?: string | null
          image_urls?: string[] | null
          jm_manufacturer?: string | null
          jm_part_code?: string | null
          k_type?: number | null
          model?: string | null
          name?: string | null
          oe_brand?: string | null
          oem_number?: string | null
          position?: string | null
          price_attempts?: number | null
          price_checked_at?: string | null
          price_found?: boolean | null
          price_variant_used?: string | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          technical_params?: Json | null
          updated_at?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          engine?: string | null
          id?: string | null
          image_urls?: string[] | null
          jm_manufacturer?: string | null
          jm_part_code?: string | null
          k_type?: number | null
          model?: string | null
          name?: string | null
          oe_brand?: string | null
          oem_number?: string | null
          position?: string | null
          price_attempts?: number | null
          price_checked_at?: string | null
          price_found?: boolean | null
          price_variant_used?: string | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          technical_params?: Json | null
          updated_at?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      mechanic_offline_queue: {
        Row: {
          action: string
          client_created_at: string
          created_at: string
          entity_id: string | null
          entity_type: string
          error: string | null
          id: string
          mechanic_user_id: string
          payload: Json
          status: string
          synced_at: string | null
        }
        Insert: {
          action: string
          client_created_at: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error?: string | null
          id?: string
          mechanic_user_id: string
          payload?: Json
          status?: string
          synced_at?: string | null
        }
        Update: {
          action?: string
          client_created_at?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error?: string | null
          id?: string
          mechanic_user_id?: string
          payload?: Json
          status?: string
          synced_at?: string | null
        }
        Relationships: []
      }
      mechanic_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          estimated_minutes: number | null
          id: string
          mechanic_id: string | null
          service_order_id: string
          started_at: string | null
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          mechanic_id?: string | null
          service_order_id: string
          started_at?: string | null
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          mechanic_id?: string | null
          service_order_id?: string
          started_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "mechanic_tasks_mechanic_id_fkey"
            columns: ["mechanic_id"]
            isOneToOne: false
            referencedRelation: "mechanics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mechanic_tasks_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      mechanics: {
        Row: {
          active: boolean
          created_at: string
          employee_id: string | null
          id: string
          name: string
          specialization: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_id?: string | null
          id?: string
          name: string
          specialization?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_id?: string | null
          id?: string
          name?: string
          specialization?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mechanics_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      mileage_history: {
        Row: {
          created_at: string
          id: string
          mileage: number
          source: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mileage: number
          source?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mileage?: number
          source?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "user_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      mopar_enum_runs: {
        Row: {
          batch_id: string
          errors: number
          finished_at: string | null
          found: number
          id: string
          last_error: string | null
          mode: string
          not_found: number
          processed: number
          started_at: string
          status: string
          total_candidates: number
        }
        Insert: {
          batch_id: string
          errors?: number
          finished_at?: string | null
          found?: number
          id?: string
          last_error?: string | null
          mode?: string
          not_found?: number
          processed?: number
          started_at?: string
          status?: string
          total_candidates?: number
        }
        Update: {
          batch_id?: string
          errors?: number
          finished_at?: string | null
          found?: number
          id?: string
          last_error?: string | null
          mode?: string
          not_found?: number
          processed?: number
          started_at?: string
          status?: string
          total_candidates?: number
        }
        Relationships: []
      }
      mopar_price_staging: {
        Row: {
          catalog_name: string | null
          enum_batch: string | null
          exists_in_parts_new: boolean | null
          found_at: string
          id: string
          imported_at: string | null
          notes: string | null
          oem_number: string
          price_with_vat: number | null
          price_without_vat: number | null
          reviewed_at: string | null
          search_variant: string | null
          status: string
        }
        Insert: {
          catalog_name?: string | null
          enum_batch?: string | null
          exists_in_parts_new?: boolean | null
          found_at?: string
          id?: string
          imported_at?: string | null
          notes?: string | null
          oem_number: string
          price_with_vat?: number | null
          price_without_vat?: number | null
          reviewed_at?: string | null
          search_variant?: string | null
          status?: string
        }
        Update: {
          catalog_name?: string | null
          enum_batch?: string | null
          exists_in_parts_new?: boolean | null
          found_at?: string
          id?: string
          imported_at?: string | null
          notes?: string | null
          oem_number?: string
          price_with_vat?: number | null
          price_without_vat?: number | null
          reviewed_at?: string | null
          search_variant?: string | null
          status?: string
        }
        Relationships: []
      }
      new_part_orders: {
        Row: {
          admin_note: string | null
          brand: string
          created_at: string
          discount_amount: number | null
          engine: string | null
          id: string
          model: string | null
          oem_number: string | null
          part_name: string
          quantity: number
          status: Database["public"]["Enums"]["order_status_v2"]
          total_price: number | null
          unit_price: number | null
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          admin_note?: string | null
          brand: string
          created_at?: string
          discount_amount?: number | null
          engine?: string | null
          id?: string
          model?: string | null
          oem_number?: string | null
          part_name: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status_v2"]
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          admin_note?: string | null
          brand?: string
          created_at?: string
          discount_amount?: number | null
          engine?: string | null
          id?: string
          model?: string | null
          oem_number?: string | null
          part_name?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status_v2"]
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      nextis_vehicles: {
        Row: {
          body_type: string | null
          brand: string
          created_at: string
          engine: string | null
          external_id: string | null
          fuel: string | null
          id: string
          metadata: Json | null
          model: string
          power_kw: number | null
          transmission: string | null
          updated_at: string
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          body_type?: string | null
          brand: string
          created_at?: string
          engine?: string | null
          external_id?: string | null
          fuel?: string | null
          id?: string
          metadata?: Json | null
          model: string
          power_kw?: number | null
          transmission?: string | null
          updated_at?: string
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          body_type?: string | null
          brand?: string
          created_at?: string
          engine?: string | null
          external_id?: string | null
          fuel?: string | null
          id?: string
          metadata?: Json | null
          model?: string
          power_kw?: number | null
          transmission?: string | null
          updated_at?: string
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          event_type: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          event_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          event_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      obd_live_consents: {
        Row: {
          created_at: string
          granted: boolean
          granted_at: string | null
          id: string
          note: string | null
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      obd_live_sessions: {
        Row: {
          created_at: string
          dtcs: Json
          ended_at: string | null
          id: string
          is_active: boolean
          last_seen: string
          payload: Json
          started_at: string
          user_id: string
          vehicle_id: string | null
          vin: string | null
        }
        Insert: {
          created_at?: string
          dtcs?: Json
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string
          payload?: Json
          started_at?: string
          user_id: string
          vehicle_id?: string | null
          vin?: string | null
        }
        Update: {
          created_at?: string
          dtcs?: Json
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string
          payload?: Json
          started_at?: string
          user_id?: string
          vehicle_id?: string | null
          vin?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          admin_note: string | null
          catalog_source: string | null
          created_at: string
          customer_note: string | null
          discount_percent: number | null
          discounted_price: number | null
          id: string
          oem_number: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          part_id: string | null
          part_name: string | null
          price_with_vat: number | null
          quantity: number
          status: Database["public"]["Enums"]["order_status_v2"]
          unit_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          catalog_source?: string | null
          created_at?: string
          customer_note?: string | null
          discount_percent?: number | null
          discounted_price?: number | null
          id?: string
          oem_number?: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          part_id?: string | null
          part_name?: string | null
          price_with_vat?: number | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status_v2"]
          unit_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          catalog_source?: string | null
          created_at?: string
          customer_note?: string | null
          discount_percent?: number | null
          discounted_price?: number | null
          id?: string
          oem_number?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          part_id?: string | null
          part_name?: string | null
          price_with_vat?: number | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status_v2"]
          unit_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new_public"
            referencedColumns: ["id"]
          },
        ]
      }
      part_crossref: {
        Row: {
          created_at: string
          id: string
          manufacturer: string
          note: string | null
          oem_number: string
          part_number: string
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          manufacturer: string
          note?: string | null
          oem_number: string
          part_number: string
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          manufacturer?: string
          note?: string | null
          oem_number?: string
          part_number?: string
          source?: string | null
        }
        Relationships: []
      }
      part_diagnostics: {
        Row: {
          applied: boolean
          applied_at: string | null
          applied_by: string | null
          backup_path: string | null
          category_status: string
          created_at: string
          description_status: string
          id: string
          name_status: string
          notes: string | null
          oem_status: string
          part_id: string
          suggested_category: string | null
          suggested_description: string | null
          suggested_name: string | null
          suggested_oem_matches: Json | null
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          applied_by?: string | null
          backup_path?: string | null
          category_status?: string
          created_at?: string
          description_status?: string
          id?: string
          name_status?: string
          notes?: string | null
          oem_status?: string
          part_id: string
          suggested_category?: string | null
          suggested_description?: string | null
          suggested_name?: string | null
          suggested_oem_matches?: Json | null
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          applied_by?: string | null
          backup_path?: string | null
          category_status?: string
          created_at?: string
          description_status?: string
          id?: string
          name_status?: string
          notes?: string | null
          oem_status?: string
          part_id?: string
          suggested_category?: string | null
          suggested_description?: string | null
          suggested_name?: string | null
          suggested_oem_matches?: Json | null
        }
        Relationships: []
      }
      part_supersessions: {
        Row: {
          created_at: string
          id: string
          new_oem_number: string
          old_oem_number: string
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_oem_number: string
          old_oem_number: string
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_oem_number?: string
          old_oem_number?: string
          source?: string | null
        }
        Relationships: []
      }
      parts_catalog: {
        Row: {
          available: boolean
          brand: string | null
          category: string | null
          created_at: string
          id: string
          name: string
          oem_code: string
          price: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name: string
          oem_code: string
          price?: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          oem_code?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts_new: {
        Row: {
          admin_margin_percent: number | null
          admin_price: number | null
          availability: string | null
          catalog_source: string | null
          category: string | null
          compatible_vehicles: string | null
          currency: string
          description: string | null
          enrich_attempts: number
          family: string | null
          id: string
          image_urls: string[] | null
          internal_code: string | null
          is_active: boolean
          last_enrich_attempt_at: string | null
          last_enrich_status: string | null
          last_name_check_at: string | null
          last_price_update: string | null
          manufacturer: string | null
          name: string
          oem_number: string
          packaging: string | null
          price_locked: boolean
          price_with_vat: number
          price_without_vat: number
          segment: string | null
          updated_at: string
        }
        Insert: {
          admin_margin_percent?: number | null
          admin_price?: number | null
          availability?: string | null
          catalog_source?: string | null
          category?: string | null
          compatible_vehicles?: string | null
          currency?: string
          description?: string | null
          enrich_attempts?: number
          family?: string | null
          id?: string
          image_urls?: string[] | null
          internal_code?: string | null
          is_active?: boolean
          last_enrich_attempt_at?: string | null
          last_enrich_status?: string | null
          last_name_check_at?: string | null
          last_price_update?: string | null
          manufacturer?: string | null
          name: string
          oem_number: string
          packaging?: string | null
          price_locked?: boolean
          price_with_vat?: number
          price_without_vat?: number
          segment?: string | null
          updated_at?: string
        }
        Update: {
          admin_margin_percent?: number | null
          admin_price?: number | null
          availability?: string | null
          catalog_source?: string | null
          category?: string | null
          compatible_vehicles?: string | null
          currency?: string
          description?: string | null
          enrich_attempts?: number
          family?: string | null
          id?: string
          image_urls?: string[] | null
          internal_code?: string | null
          is_active?: boolean
          last_enrich_attempt_at?: string | null
          last_enrich_status?: string | null
          last_name_check_at?: string | null
          last_price_update?: string | null
          manufacturer?: string | null
          name?: string
          oem_number?: string
          packaging?: string | null
          price_locked?: boolean
          price_with_vat?: number
          price_without_vat?: number
          segment?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parts_new_backup: {
        Row: {
          admin_margin_percent: number | null
          admin_price: number | null
          availability: string | null
          catalog_source: string | null
          category: string | null
          compatible_vehicles: string | null
          currency: string | null
          description: string | null
          enrich_attempts: number | null
          family: string | null
          id: string | null
          image_urls: string[] | null
          internal_code: string | null
          is_active: boolean | null
          last_enrich_attempt_at: string | null
          last_enrich_status: string | null
          last_name_check_at: string | null
          last_price_update: string | null
          manufacturer: string | null
          name: string | null
          oem_number: string | null
          packaging: string | null
          price_locked: boolean | null
          price_with_vat: number | null
          price_without_vat: number | null
          segment: string | null
          updated_at: string | null
        }
        Insert: {
          admin_margin_percent?: number | null
          admin_price?: number | null
          availability?: string | null
          catalog_source?: string | null
          category?: string | null
          compatible_vehicles?: string | null
          currency?: string | null
          description?: string | null
          enrich_attempts?: number | null
          family?: string | null
          id?: string | null
          image_urls?: string[] | null
          internal_code?: string | null
          is_active?: boolean | null
          last_enrich_attempt_at?: string | null
          last_enrich_status?: string | null
          last_name_check_at?: string | null
          last_price_update?: string | null
          manufacturer?: string | null
          name?: string | null
          oem_number?: string | null
          packaging?: string | null
          price_locked?: boolean | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          segment?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_margin_percent?: number | null
          admin_price?: number | null
          availability?: string | null
          catalog_source?: string | null
          category?: string | null
          compatible_vehicles?: string | null
          currency?: string | null
          description?: string | null
          enrich_attempts?: number | null
          family?: string | null
          id?: string | null
          image_urls?: string[] | null
          internal_code?: string | null
          is_active?: boolean | null
          last_enrich_attempt_at?: string | null
          last_enrich_status?: string | null
          last_name_check_at?: string | null
          last_price_update?: string | null
          manufacturer?: string | null
          name?: string | null
          oem_number?: string | null
          packaging?: string | null
          price_locked?: boolean | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          segment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          created_at: string
          id: string
          new_price_with_vat: number
          new_price_without_vat: number
          old_price_with_vat: number
          old_price_without_vat: number
          part_id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_price_with_vat: number
          new_price_without_vat: number
          old_price_with_vat: number
          old_price_without_vat: number
          part_id: string
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_price_with_vat?: number
          new_price_without_vat?: number
          old_price_with_vat?: number
          old_price_without_vat?: number
          part_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new_public"
            referencedColumns: ["id"]
          },
        ]
      }
      price_sync_runs: {
        Row: {
          created_at: string
          error_count: number
          finished_at: string | null
          id: string
          last_error: string | null
          mode: string
          notified: boolean
          processed: number
          started_at: string
          started_by: string | null
          status: string
          total_target: number
          updated_at: string
          updated_count: number
        }
        Insert: {
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          mode?: string
          notified?: boolean
          processed?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_target?: number
          updated_at?: string
          updated_count?: number
        }
        Update: {
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          mode?: string
          notified?: boolean
          processed?: number
          started_at?: string
          started_by?: string | null
          status?: string
          total_target?: number
          updated_at?: string
          updated_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string
          company_name: string | null
          created_at: string
          dic: string | null
          discount_percent: number
          email: string | null
          full_name: string | null
          ico: string | null
          id: string
          loyalty_active: boolean
          notifications_enabled: boolean
          phone: string | null
          service_history_enabled: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string
          company_name?: string | null
          created_at?: string
          dic?: string | null
          discount_percent?: number
          email?: string | null
          full_name?: string | null
          ico?: string | null
          id?: string
          loyalty_active?: boolean
          notifications_enabled?: boolean
          phone?: string | null
          service_history_enabled?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          company_name?: string | null
          created_at?: string
          dic?: string | null
          discount_percent?: number
          email?: string | null
          full_name?: string | null
          ico?: string | null
          id?: string
          loyalty_active?: boolean
          notifications_enabled?: boolean
          phone?: string | null
          service_history_enabled?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scrape_preview_jobs: {
        Row: {
          applied_at: string | null
          applied_count: number
          brand: string | null
          created_at: string
          created_by: string | null
          engine: string | null
          error_message: string | null
          id: string
          model: string | null
          parts_count: number
          raw_payload: Json
          source: string
          status: string
          year: number | null
        }
        Insert: {
          applied_at?: string | null
          applied_count?: number
          brand?: string | null
          created_at?: string
          created_by?: string | null
          engine?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          parts_count?: number
          raw_payload?: Json
          source: string
          status?: string
          year?: number | null
        }
        Update: {
          applied_at?: string | null
          applied_count?: number
          brand?: string | null
          created_at?: string
          created_by?: string | null
          engine?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          parts_count?: number
          raw_payload?: Json
          source?: string
          status?: string
          year?: number | null
        }
        Relationships: []
      }
      service_book_shares: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          owner_id: string
          share_token: string
          transfer_status: string
          transfer_to_email: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id: string
          share_token?: string
          transfer_status?: string
          transfer_to_email?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          owner_id?: string
          share_token?: string
          transfer_status?: string
          transfer_to_email?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_book_shares_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "user_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bookings: {
        Row: {
          admin_note: string | null
          confirmed_date: string | null
          created_at: string
          discount_amount: number | null
          estimated_price: number | null
          final_price: number | null
          id: string
          note: string | null
          preferred_date: string
          replacement_vehicle_confirmed: boolean | null
          service_type: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          user_id: string
          vehicle_brand: string | null
          vehicle_model: string | null
          wants_replacement_vehicle: boolean
        }
        Insert: {
          admin_note?: string | null
          confirmed_date?: string | null
          created_at?: string
          discount_amount?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          note?: string | null
          preferred_date: string
          replacement_vehicle_confirmed?: boolean | null
          service_type: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          wants_replacement_vehicle?: boolean
        }
        Update: {
          admin_note?: string | null
          confirmed_date?: string | null
          created_at?: string
          discount_amount?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          note?: string | null
          preferred_date?: string
          replacement_vehicle_confirmed?: boolean | null
          service_type?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id?: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          wants_replacement_vehicle?: boolean
        }
        Relationships: []
      }
      service_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          fuel_level: string | null
          id: string
          mileage: number | null
          notes: string | null
          photos: string[] | null
          service_order_id: string
          signature_image: string | null
          visible_damage: string | null
        }
        Insert: {
          checkin_date?: string
          created_at?: string
          fuel_level?: string | null
          id?: string
          mileage?: number | null
          notes?: string | null
          photos?: string[] | null
          service_order_id: string
          signature_image?: string | null
          visible_damage?: string | null
        }
        Update: {
          checkin_date?: string
          created_at?: string
          fuel_level?: string | null
          id?: string
          mileage?: number | null
          notes?: string | null
          photos?: string[] | null
          service_order_id?: string
          signature_image?: string | null
          visible_damage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_checkins_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_history: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mileage: number | null
          parts_used: string | null
          photos: string[] | null
          price: number | null
          service_date: string
          service_type: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mileage?: number | null
          parts_used?: string | null
          photos?: string[] | null
          price?: number | null
          service_date: string
          service_type: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mileage?: number | null
          parts_used?: string | null
          photos?: string[] | null
          price?: number | null
          service_date?: string
          service_type?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "user_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_invoices: {
        Row: {
          created_at: string
          id: string
          invoice_number: string | null
          labor_price: number
          parts_price: number
          service_order_id: string
          total_price: number
          vat_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          labor_price?: number
          parts_price?: number
          service_order_id: string
          total_price?: number
          vat_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          labor_price?: number
          parts_price?: number
          service_order_id?: string
          total_price?: number
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_invoices_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_lifts: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
      service_order_messages: {
        Row: {
          created_at: string
          id: string
          is_from_service: boolean
          message: string
          photos: string[] | null
          sender_id: string
          service_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_from_service?: boolean
          message: string
          photos?: string[] | null
          sender_id: string
          service_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_from_service?: boolean
          message?: string
          photos?: string[] | null
          sender_id?: string
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_messages_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_parts: {
        Row: {
          created_at: string
          id: string
          name: string
          oem_number: string | null
          part_id: string | null
          price: number
          quantity: number
          service_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          oem_number?: string | null
          part_id?: string | null
          price?: number
          quantity?: number
          service_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          oem_number?: string | null
          part_id?: string | null
          price?: number
          quantity?: number
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_new_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_parts_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_photos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          phase: string
          photo_url: string
          service_order_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          phase?: string
          photo_url: string
          service_order_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          phase?: string
          photo_url?: string
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_photos_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          note: string | null
          old_status: string | null
          service_order_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          note?: string | null
          old_status?: string | null
          service_order_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          note?: string | null
          old_status?: string | null
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_status_history_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          created_at: string
          customer_approved: boolean | null
          description: string | null
          estimated_price: number | null
          eta_completion: string | null
          id: string
          labor_price: number | null
          lift_id: string | null
          mechanic_id: string | null
          mileage: number | null
          parts_total: number | null
          planned_work: string | null
          status: Database["public"]["Enums"]["service_order_status"]
          total_price: number | null
          updated_at: string
          user_id: string
          vat_rate: number | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          customer_approved?: boolean | null
          description?: string | null
          estimated_price?: number | null
          eta_completion?: string | null
          id?: string
          labor_price?: number | null
          lift_id?: string | null
          mechanic_id?: string | null
          mileage?: number | null
          parts_total?: number | null
          planned_work?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          total_price?: number | null
          updated_at?: string
          user_id: string
          vat_rate?: number | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          customer_approved?: boolean | null
          description?: string | null
          estimated_price?: number | null
          eta_completion?: string | null
          id?: string
          labor_price?: number | null
          lift_id?: string | null
          mechanic_id?: string | null
          mileage?: number | null
          parts_total?: number | null
          planned_work?: string | null
          status?: Database["public"]["Enums"]["service_order_status"]
          total_price?: number | null
          updated_at?: string
          user_id?: string
          vat_rate?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_lift_id_fkey"
            columns: ["lift_id"]
            isOneToOne: false
            referencedRelation: "service_lifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_mechanic_id_fkey"
            columns: ["mechanic_id"]
            isOneToOne: false
            referencedRelation: "mechanics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "user_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plans: {
        Row: {
          created_at: string
          id: string
          interval_km: number | null
          interval_months: number | null
          is_active: boolean
          is_custom: boolean
          last_service_date: string | null
          last_service_km: number | null
          recommended_part_oem: string | null
          service_name: string
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_km?: number | null
          interval_months?: number | null
          is_active?: boolean
          is_custom?: boolean
          last_service_date?: string | null
          last_service_km?: number | null
          recommended_part_oem?: string | null
          service_name: string
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_km?: number | null
          interval_months?: number | null
          is_active?: boolean
          is_custom?: boolean
          last_service_date?: string | null
          last_service_km?: number | null
          recommended_part_oem?: string | null
          service_name?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "user_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_procedures: {
        Row: {
          brand: string
          category: string
          content: string | null
          created_at: string
          id: string
          model: string
          procedure_type: string | null
          source: string | null
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          brand?: string
          category: string
          content?: string | null
          created_at?: string
          id?: string
          model: string
          procedure_type?: string | null
          source?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          brand?: string
          category?: string
          content?: string | null
          created_at?: string
          id?: string
          model?: string
          procedure_type?: string | null
          source?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          service_order_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          service_order_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          service_order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_reviews_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: true
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tsbs: {
        Row: {
          brand: string | null
          created_at: string
          full_text: string | null
          id: string
          model: string | null
          published_at: string | null
          source_url: string | null
          summary_cs: string | null
          system: string | null
          title_cs: string
          tsb_number: string
          updated_at: string
          vin_pattern: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          full_text?: string | null
          id?: string
          model?: string | null
          published_at?: string | null
          source_url?: string | null
          summary_cs?: string | null
          system?: string | null
          title_cs: string
          tsb_number: string
          updated_at?: string
          vin_pattern?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          full_text?: string | null
          id?: string
          model?: string | null
          published_at?: string | null
          source_url?: string | null
          summary_cs?: string | null
          system?: string | null
          title_cs?: string
          tsb_number?: string
          updated_at?: string
          vin_pattern?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      used_part_requests: {
        Row: {
          admin_available: boolean | null
          admin_note: string | null
          admin_price: number | null
          brand: string
          created_at: string
          id: string
          model: string | null
          note: string | null
          part_name: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
          year: string | null
        }
        Insert: {
          admin_available?: boolean | null
          admin_note?: string | null
          admin_price?: number | null
          brand: string
          created_at?: string
          id?: string
          model?: string | null
          note?: string | null
          part_name: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
          year?: string | null
        }
        Update: {
          admin_available?: boolean | null
          admin_note?: string | null
          admin_price?: number | null
          brand?: string
          created_at?: string
          id?: string
          model?: string | null
          note?: string | null
          part_name?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
          year?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_vehicles: {
        Row: {
          brand: string
          created_at: string
          current_mileage: number | null
          engine: string | null
          id: string
          license_plate: string | null
          model: string
          transmission: string | null
          user_id: string
          vin: string | null
          year: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          current_mileage?: number | null
          engine?: string | null
          id?: string
          license_plate?: string | null
          model: string
          transmission?: string | null
          user_id: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          current_mileage?: number | null
          engine?: string | null
          id?: string
          license_plate?: string | null
          model?: string
          transmission?: string | null
          user_id?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
      vehicle_buyback_requests: {
        Row: {
          admin_note: string | null
          brand: string
          condition: string
          created_at: string
          email: string | null
          id: string
          mileage: number
          model: string
          name: string | null
          note: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string | null
          vin: string | null
          year: number
        }
        Insert: {
          admin_note?: string | null
          brand: string
          condition: string
          created_at?: string
          email?: string | null
          id?: string
          mileage: number
          model: string
          name?: string | null
          note?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vin?: string | null
          year: number
        }
        Update: {
          admin_note?: string | null
          brand?: string
          condition?: string
          created_at?: string
          email?: string | null
          id?: string
          mileage?: number
          model?: string
          name?: string | null
          note?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vin?: string | null
          year?: number
        }
        Relationships: []
      }
      vehicle_engine_mappings: {
        Row: {
          brand: string
          created_at: string
          engine: string
          fuel: string | null
          id: string
          k_type: number
          k_type_label: string | null
          model: string
          notes: string | null
          power_kw: number | null
          source: string
          updated_at: string
          verified_at: string | null
          vin_pattern: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          engine: string
          fuel?: string | null
          id?: string
          k_type: number
          k_type_label?: string | null
          model: string
          notes?: string | null
          power_kw?: number | null
          source?: string
          updated_at?: string
          verified_at?: string | null
          vin_pattern?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          engine?: string
          fuel?: string | null
          id?: string
          k_type?: number
          k_type_label?: string | null
          model?: string
          notes?: string | null
          power_kw?: number | null
          source?: string
          updated_at?: string
          verified_at?: string | null
          vin_pattern?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      vehicle_import_requests: {
        Row: {
          admin_note: string | null
          brand: string
          budget_from: number | null
          budget_to: number | null
          color: string | null
          created_at: string
          email: string | null
          extras: string | null
          fuel: string | null
          id: string
          model: string
          name: string | null
          note: string | null
          phone: string | null
          status: string
          transmission: string | null
          updated_at: string
          user_id: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          admin_note?: string | null
          brand: string
          budget_from?: number | null
          budget_to?: number | null
          color?: string | null
          created_at?: string
          email?: string | null
          extras?: string | null
          fuel?: string | null
          id?: string
          model: string
          name?: string | null
          note?: string | null
          phone?: string | null
          status?: string
          transmission?: string | null
          updated_at?: string
          user_id?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          admin_note?: string | null
          brand?: string
          budget_from?: number | null
          budget_to?: number | null
          color?: string | null
          created_at?: string
          email?: string | null
          extras?: string | null
          fuel?: string | null
          id?: string
          model?: string
          name?: string | null
          note?: string | null
          phone?: string | null
          status?: string
          transmission?: string | null
          updated_at?: string
          user_id?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
      }
      vehicle_inquiries: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string | null
          phone: string | null
          status: string
          user_id: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inquiries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_inquiries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string
          color: string | null
          condition: string | null
          created_at: string
          description: string | null
          engine: string | null
          fuel: string | null
          id: string
          images: string[] | null
          is_active: boolean
          listing_url: string | null
          mileage: number | null
          model: string
          power: string | null
          price: number
          transmission: string | null
          updated_at: string
          vin: string | null
          year: number
        }
        Insert: {
          brand: string
          color?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          engine?: string | null
          fuel?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          listing_url?: string | null
          mileage?: number | null
          model: string
          power?: string | null
          price: number
          transmission?: string | null
          updated_at?: string
          vin?: string | null
          year: number
        }
        Update: {
          brand?: string
          color?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          engine?: string | null
          fuel?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          listing_url?: string | null
          mileage?: number | null
          model?: string
          power?: string | null
          price?: number
          transmission?: string | null
          updated_at?: string
          vin?: string | null
          year?: number
        }
        Relationships: []
      }
      work_reports: {
        Row: {
          completed_at: string | null
          created_at: string
          employee_id: string | null
          id: string
          mechanic_id: string | null
          note: string | null
          photos: string[] | null
          service_order_id: string | null
          started_at: string | null
          task_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          mechanic_id?: string | null
          note?: string | null
          photos?: string[] | null
          service_order_id?: string | null
          started_at?: string | null
          task_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          mechanic_id?: string | null
          note?: string | null
          photos?: string[] | null
          service_order_id?: string | null
          started_at?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_reports_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_reports_mechanic_id_fkey"
            columns: ["mechanic_id"]
            isOneToOne: false
            referencedRelation: "mechanics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_reports_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_reports_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "mechanic_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catalog_engine_variants: {
        Row: {
          id: string | null
          name_cs: string | null
          parent_id: string | null
          power_kw: number | null
          slug: string | null
          vehicle_brand: string | null
          vehicle_engine: string | null
          vehicle_model: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          id?: string | null
          name_cs?: string | null
          parent_id?: string | null
          power_kw?: number | null
          slug?: string | null
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_model?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          id?: string | null
          name_cs?: string | null
          parent_id?: string | null
          power_kw?: number | null
          slug?: string | null
          vehicle_brand?: string | null
          vehicle_engine?: string | null
          vehicle_model?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_engine_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_new_public: {
        Row: {
          availability: string | null
          catalog_source: string | null
          category: string | null
          compatible_vehicles: string | null
          currency: string | null
          description: string | null
          family: string | null
          id: string | null
          image_urls: string[] | null
          internal_code: string | null
          last_price_update: string | null
          manufacturer: string | null
          name: string | null
          oem_number: string | null
          packaging: string | null
          price_with_vat: number | null
          price_without_vat: number | null
          segment: string | null
          updated_at: string | null
        }
        Insert: {
          availability?: string | null
          catalog_source?: string | null
          category?: string | null
          compatible_vehicles?: string | null
          currency?: string | null
          description?: string | null
          family?: string | null
          id?: string | null
          image_urls?: string[] | null
          internal_code?: string | null
          last_price_update?: string | null
          manufacturer?: string | null
          name?: string | null
          oem_number?: string | null
          packaging?: string | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          segment?: string | null
          updated_at?: string | null
        }
        Update: {
          availability?: string | null
          catalog_source?: string | null
          category?: string | null
          compatible_vehicles?: string | null
          currency?: string | null
          description?: string | null
          family?: string | null
          id?: string | null
          image_urls?: string[] | null
          internal_code?: string | null
          last_price_update?: string | null
          manufacturer?: string | null
          name?: string | null
          oem_number?: string | null
          packaging?: string | null
          price_with_vat?: number | null
          price_without_vat?: number | null
          segment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vehicles_public: {
        Row: {
          brand: string | null
          color: string | null
          condition: string | null
          created_at: string | null
          description: string | null
          engine: string | null
          fuel: string | null
          id: string | null
          images: string[] | null
          is_active: boolean | null
          listing_url: string | null
          mileage: number | null
          model: string | null
          power: string | null
          price: number | null
          transmission: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          color?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          engine?: string | null
          fuel?: string | null
          id?: string | null
          images?: string[] | null
          is_active?: boolean | null
          listing_url?: string | null
          mileage?: number | null
          model?: string | null
          power?: string | null
          price?: number | null
          transmission?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          color?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          engine?: string | null
          fuel?: string | null
          id?: string | null
          images?: string[] | null
          is_active?: boolean | null
          listing_url?: string | null
          mileage?: number | null
          model?: string | null
          power?: string | null
          price?: number | null
          transmission?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      bulk_attach_part_to_vehicles: {
        Args: {
          _brand: string
          _engine_pattern?: string
          _is_oem?: boolean
          _model_pattern?: string
          _part_id: string
          _year_from?: number
          _year_to?: number
        }
        Returns: number
      }
      calculate_discounted_price: {
        Args: {
          _discount_percent: number
          _price_without_vat: number
          _vat_rate?: number
        }
        Returns: {
          discounted_price: number
          price_with_vat: number
        }[]
      }
      can_place_order: { Args: { _user_id: string }; Returns: boolean }
      cleanup_expired_api_cache: { Args: never; Returns: number }
      dedupe_catalog_compat: {
        Args: never
        Returns: {
          removed: number
        }[]
      }
      find_or_create_nextis_vehicle: {
        Args: {
          _brand: string
          _engine?: string
          _external_id?: string
          _model: string
          _year_from?: number
          _year_to?: number
        }
        Returns: string
      }
      get_cron_job_status: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      manage_price_sync_cron: { Args: { p_action: string }; Returns: boolean }
      normalize_oem: { Args: { _oem: string }; Returns: string }
      notify_admins_event: {
        Args: {
          _dedupe_key: string
          _event_type: string
          _link: string
          _message: string
          _title: string
        }
        Returns: undefined
      }
      oem_priority_rank: { Args: { _source: string }; Returns: number }
      release_stuck_price_sync_runs: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "customer"
      booking_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      catalog_source_type:
        | "mopar"
        | "mopar_oem"
        | "sag"
        | "autokelly"
        | "jm"
        | "csv"
        | "epc"
        | "ai"
        | "manual"
      order_status:
        | "pending"
        | "confirmed"
        | "shipped"
        | "delivered"
        | "cancelled"
      order_status_v2:
        | "nova"
        | "zpracovava_se"
        | "vyrizena"
        | "zrusena"
        | "prijata"
        | "zaplacena"
        | "odeslana"
        | "dorucena"
      order_type: "new" | "used" | "inquiry"
      request_status:
        | "pending"
        | "quoted"
        | "accepted"
        | "rejected"
        | "fulfilled"
      service_order_status:
        | "received"
        | "diagnostics"
        | "waiting_approval"
        | "waiting_parts"
        | "in_repair"
        | "testing"
        | "ready_pickup"
        | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "customer"],
      booking_status: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      catalog_source_type: [
        "mopar",
        "mopar_oem",
        "sag",
        "autokelly",
        "jm",
        "csv",
        "epc",
        "ai",
        "manual",
      ],
      order_status: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      order_status_v2: [
        "nova",
        "zpracovava_se",
        "vyrizena",
        "zrusena",
        "prijata",
        "zaplacena",
        "odeslana",
        "dorucena",
      ],
      order_type: ["new", "used", "inquiry"],
      request_status: [
        "pending",
        "quoted",
        "accepted",
        "rejected",
        "fulfilled",
      ],
      service_order_status: [
        "received",
        "diagnostics",
        "waiting_approval",
        "waiting_parts",
        "in_repair",
        "testing",
        "ready_pickup",
        "completed",
      ],
    },
  },
} as const
