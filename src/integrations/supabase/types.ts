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
          status: Database["public"]["Enums"]["order_status"]
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
          status?: Database["public"]["Enums"]["order_status"]
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
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          user_id?: string
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
          family: string | null
          id: string
          image_urls: string[] | null
          internal_code: string | null
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
          family?: string | null
          id?: string
          image_urls?: string[] | null
          internal_code?: string | null
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
          family?: string | null
          id?: string
          image_urls?: string[] | null
          internal_code?: string | null
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
    }
    Functions: {
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
      get_cron_job_status: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      manage_price_sync_cron: { Args: { p_action: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "customer"
      booking_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      order_status:
        | "pending"
        | "confirmed"
        | "shipped"
        | "delivered"
        | "cancelled"
      order_status_v2: "nova" | "zpracovava_se" | "vyrizena" | "zrusena"
      order_type: "new" | "used"
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
      order_status: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      order_status_v2: ["nova", "zpracovava_se", "vyrizena", "zrusena"],
      order_type: ["new", "used"],
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
